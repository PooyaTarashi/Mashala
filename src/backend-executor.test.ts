import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  type BackendOperation,
  type BackendOperationResult,
  executeBackendOperation,
} from "./backend-executor";

function mockFetch(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

describe("executeBackendOperation", () => {
  it.each(["POST", "PUT", "PATCH"] as const)(
    "executes one direct %s request against the target backend",
    async (method) => {
      const fetchImpl = mockFetch(new Response(null, { status: 204 }));
      const operation: BackendOperation = {
        method,
        path: "/v1/transfers",
      };
      const value = {
        recipient: "Sam",
        amount: 250,
        immediate: true,
      } as const;

      const result = await executeBackendOperation({
        baseUrl: "https://target.example/base/",
        operation,
        value,
        request: fetchImpl,
      });

      expect(result).toEqual({
        outcome: "success",
        response: expect.any(Response),
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://target.example/v1/transfers",
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        },
      );
    },
  );

  it("preserves same-named primitive properties and omitted optional properties", async () => {
    const fetchImpl = mockFetch(new Response("created", { status: 201 }));
    const value = {
      name: "Ada",
      quantity: 3,
      enabled: false,
    } as const;

    await executeBackendOperation({
      baseUrl: new URL("https://api.example"),
      operation: { method: "POST", path: "/items" },
      value,
      request: fetchImpl,
    });

    const request = fetchImpl.mock.calls[0];
    expect(request?.[1]?.body).toBe(
      '{"name":"Ada","quantity":3,"enabled":false}',
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual(value);
    expect(JSON.parse(String(request?.[1]?.body))).not.toHaveProperty(
      "optionalNote",
    );
    expect(request?.[1]).not.toHaveProperty("credentials");
    expect(request?.[1]?.headers).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("does not mutate the operation, value, or URL input", async () => {
    const fetchImpl = mockFetch(new Response(null, { status: 200 }));
    const operation = Object.freeze({
      method: "PATCH" as const,
      path: "/profile",
    });
    const value = Object.freeze({ displayName: "New name", alerts: true });
    const baseUrl = new URL("https://target.example/root?unchanged=yes#anchor");
    const operationBefore = JSON.stringify(operation);
    const valueBefore = JSON.stringify(value);
    const baseUrlBefore = baseUrl.href;

    await executeBackendOperation({
      baseUrl,
      operation,
      value,
      request: fetchImpl,
    });

    expect(JSON.stringify(operation)).toBe(operationBefore);
    expect(JSON.stringify(value)).toBe(valueBefore);
    expect(baseUrl.href).toBe(baseUrlBefore);
  });

  it.each([200, 201, 204, 299])(
    "treats HTTP %s as success and preserves the response",
    async (status) => {
      const response = new Response(null, { status });
      const result = await executeBackendOperation({
        baseUrl: "https://target.example",
        operation: { method: "PUT", path: "/resource" },
        value: {},
        request: mockFetch(response),
      });

      expect(result).toEqual({ outcome: "success", response });
    },
  );

  it.each([300, 400, 403, 422, 500])(
    "treats HTTP %s as an HTTP failure and preserves the response",
    async (status) => {
      const response = new Response("target response", { status });
      const result = await executeBackendOperation({
        baseUrl: "https://target.example",
        operation: { method: "POST", path: "/resource" },
        value: {},
        request: mockFetch(response),
      });

      expect(result).toEqual({ outcome: "http-error", response });
    },
  );

  it("returns a sanitized network failure for a rejected fetch", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private network detail"));

    const result = await executeBackendOperation({
      baseUrl: "https://target.example",
      operation: { method: "POST", path: "/resource" },
      value: {},
      request: fetchImpl,
    });

    expect(result).toEqual({ outcome: "network-error" });
    expect(result).not.toHaveProperty("error");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unsupported method", { method: "DELETE", path: "/resource" }],
    ["lowercase method", { method: "post", path: "/resource" }],
    ["missing method", { path: "/resource" }],
    [
      "undeclared header",
      { method: "POST", path: "/resource", headers: { authorization: "x" } },
    ],
    ["non-object operation", null],
  ])("rejects a malformed operation with an %s", async (_case, operation) => {
    const fetchImpl = mockFetch(new Response(null, { status: 200 }));

    await expect(
      executeBackendOperation({
        baseUrl: "https://target.example",
        operation: operation as unknown as BackendOperation,
        value: {},
        request: fetchImpl,
      }),
    ).rejects.toThrow(/^Invalid backend operation:/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["absolute URL", "https://attacker.example/resource"],
    ["protocol-relative path", "//attacker.example/resource"],
    ["extra leading slash", "///resource"],
    ["relative path", "resource"],
    ["query string", "/resource?admin=true"],
    ["fragment", "/resource#section"],
  ])("rejects a forbidden %s", async (_case, path) => {
    const fetchImpl = mockFetch(new Response(null, { status: 200 }));

    await expect(
      executeBackendOperation({
        baseUrl: "https://target.example",
        operation: { method: "POST", path },
        value: {},
        request: fetchImpl,
      }),
    ).rejects.toThrow(/^Invalid backend operation:/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a URL-parser origin escape in the operation path", async () => {
    const fetchImpl = mockFetch(new Response(null, { status: 200 }));

    await expect(
      executeBackendOperation({
        baseUrl: "https://target.example",
        operation: { method: "POST", path: "/\\attacker.example/resource" },
        value: {},
        request: fetchImpl,
      }),
    ).rejects.toThrow(
      "Invalid backend operation: path must resolve within the supplied target backend origin.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "relative/base",
    "ftp://target.example",
    "https://user:password@target.example",
  ])("rejects the invalid target base URL %s", async (baseUrl) => {
    const fetchImpl = mockFetch(new Response(null, { status: 200 }));

    await expect(
      executeBackendOperation({
        baseUrl,
        operation: { method: "POST", path: "/resource" },
        value: {},
        request: fetchImpl,
      }),
    ).rejects.toThrow(/^Invalid target backend base URL:/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is deterministic and never redirects the request through a Mashala API route", async () => {
    const firstFetch = mockFetch(new Response(null, { status: 200 }));
    const secondFetch = mockFetch(new Response(null, { status: 200 }));
    const input = {
      baseUrl: "https://backend.example/application/",
      operation: { method: "POST", path: "/orders" } as const,
      value: { product: "book", quantity: 1 },
    };

    await executeBackendOperation({ ...input, request: firstFetch });
    await executeBackendOperation({ ...input, request: secondFetch });

    expect(firstFetch.mock.calls).toEqual(secondFetch.mock.calls);
    expect(firstFetch).toHaveBeenCalledWith(
      "https://backend.example/orders",
      expect.any(Object),
    );
    expect(firstFetch.mock.calls[0]?.[0]).not.toContain("/api/");
  });
});

describe("backend executor types", () => {
  it("exposes the canonical operation and discriminated result types", () => {
    expectTypeOf<BackendOperation["method"]>().toEqualTypeOf<
      "POST" | "PUT" | "PATCH"
    >();
    expectTypeOf<BackendOperationResult["outcome"]>().toEqualTypeOf<
      "success" | "http-error" | "network-error"
    >();
  });
});

if (false) {
  const operation: BackendOperation = {
    // @ts-expect-error Canonical writes support only POST, PUT, and PATCH.
    method: "DELETE",
    path: "/resource",
  };

  const operationWithHeaders: BackendOperation = {
    method: "POST",
    path: "/resource",
    // @ts-expect-error Canonical operations cannot declare custom headers.
    headers: { authorization: "Bearer secret" },
  };

  void operation;
  void operationWithHeaders;
}
