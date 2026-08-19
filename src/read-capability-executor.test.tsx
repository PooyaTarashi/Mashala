// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { defineReadCapability, result } from "./capabilities";
import { createDemoCookieSessionRequest } from "./examples/demo-cookie-session-request";
import { f } from "./fields";
import { CompiledForm } from "./form-renderer";
import {
  executeReadCapability,
  type ReadCapabilityResult,
} from "./read-capability-executor";
import type { ReadCapabilitySpec } from "./spec";
import type { TargetBackendRequest } from "./target-backend-request";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const objectView = result.card({
  title: { kind: "fixed", text: "Result" },
});

const listView = result.cardList({
  emptyText: "No results.",
  card: {
    title: {
      kind: "property",
      property: "title",
      formatter: { kind: "text" },
    },
  },
});

function responseRequest(data: unknown, status = 200) {
  return vi.fn<TargetBackendRequest>().mockResolvedValue(
    Response.json(data, { status }),
  );
}

function accountBalance() {
  return defineReadCapability({
    id: "account_balance",
    description: "Show the current account balance.",
    operation: { method: "GET", path: "/account/balance" },
    result: objectView,
  });
}

describe("executeReadCapability", () => {
  it("executes a zero-input GET and returns validated object data", async () => {
    const request = responseRequest({ balance: 1250.5, status: "available" });

    const execution = await executeReadCapability({
      baseUrl: "https://target.example/app/",
      capability: accountBalance(),
      request,
    });

    expect(execution).toEqual({
      outcome: "success",
      response: expect.any(Response),
      data: { balance: 1250.5, status: "available" },
    });
    expect(request).toHaveBeenCalledWith(
      "https://target.example/account/balance",
      { method: "GET" },
    );
    expect(Object.isFrozen(
      execution.outcome === "success" ? execution.data : undefined,
    )).toBe(true);
  });

  it("inserts a schema-valid required path parameter", async () => {
    const capability = defineReadCapability({
      id: "show_product",
      description: "Show a product.",
      input: {
        productId: f.text({ label: "Product ID", required: true, minLength: 1 }),
      },
      operation: {
        method: "GET",
        path: "/products/{id}",
        bindings: { path: { id: "productId" } },
      },
      result: objectView,
    });
    const request = responseRequest({ title: "Notebook" });

    await expect(executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      input: { productId: "42" },
      request,
    })).resolves.toMatchObject({ outcome: "success" });

    expect(request).toHaveBeenCalledWith(
      "https://target.example/products/42",
      { method: "GET" },
    );
  });

  it("inserts validated query parameters in declaration order and omits absent optional values", async () => {
    const capability = defineReadCapability({
      id: "list_products",
      description: "List filtered products.",
      input: {
        maxPrice: f.number({ label: "Maximum price", required: true, minimum: 0 }),
        query: f.text({ label: "Search" }),
        available: f.boolean({ label: "Available" }),
      },
      operation: {
        method: "GET",
        path: "/products",
        bindings: {
          query: {
            max_price: "maxPrice",
            q: "query",
            available: "available",
          },
        },
      },
      result: listView,
    });
    const request = responseRequest([]);

    await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      input: { maxPrice: 100, available: false },
      request,
    });

    expect(request).toHaveBeenCalledWith(
      "https://target.example/products?max_price=100&available=false",
      { method: "GET" },
    );
  });

  it("uses RFC 3986 encoding so bound data cannot become URL structure", async () => {
    const capability = defineReadCapability({
      id: "search_product",
      description: "Search within one product.",
      input: {
        productId: f.text({ label: "Product ID", required: true }),
        query: f.text({ label: "Search", required: true }),
      },
      operation: {
        method: "GET",
        path: "/products/{id}",
        bindings: {
          path: { id: "productId" },
          query: { q: "query" },
        },
      },
      result: objectView,
    });
    const request = responseRequest({ title: "Encoded" });

    await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      input: {
        productId: "A/B ?#",
        query: "space !'()* /?#",
      },
      request,
    });

    expect(request).toHaveBeenCalledWith(
      "https://target.example/products/A%2FB%20%3F%23?q=space%20%21%27%28%29%2A%20%2F%3F%23",
      { method: "GET" },
    );
  });

  it("returns the existing compiled form for missing required input without fetching", async () => {
    const capability = defineReadCapability({
      id: "show_product",
      description: "Show a product.",
      input: {
        productId: f.text({ label: "Product ID", required: true }),
      },
      operation: {
        method: "GET",
        path: "/products/{id}",
        bindings: { path: { id: "productId" } },
      },
      result: objectView,
    });
    const request = responseRequest({ title: "Never requested" });

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      input: {},
      request,
    });

    expect(execution).toEqual({
      outcome: "input-required",
      input: capability.input,
    });
    expect(request).not.toHaveBeenCalled();
    if (execution.outcome === "input-required") {
      render(<CompiledForm form={execution.input} onSubmit={() => undefined} />);
      expect(screen.getByLabelText(/Product ID/)).toBeTruthy();
    }
  });

  it("rejects undeclared and schema-invalid input before URL resolution", async () => {
    const capability = defineReadCapability({
      id: "list_products",
      description: "List products.",
      input: {
        maxPrice: f.number({ label: "Maximum price", minimum: 0 }),
      },
      operation: {
        method: "GET",
        path: "/products",
        bindings: { query: { max_price: "maxPrice" } },
      },
      result: listView,
    });
    const request = responseRequest([]);

    await expect(executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      input: { invented: "admin" },
      request,
    })).resolves.toEqual({
      outcome: "input-error",
      reason: "undeclared-input",
    });
    await expect(executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      input: { maxPrice: -1 },
      request,
    })).resolves.toEqual({
      outcome: "input-error",
      reason: "invalid-input",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the existing target-app authenticated request integration", async () => {
    const browserFetch = responseRequest({ balance: 10 });
    const request = createDemoCookieSessionRequest(browserFetch);

    await executeReadCapability({
      baseUrl: "https://target.example",
      capability: accountBalance(),
      request,
    });

    expect(browserFetch).toHaveBeenCalledWith(
      "https://target.example/account/balance",
      { method: "GET", credentials: "include" },
    );
  });

  it("keeps HTTP failure distinct without attempting to parse the body", async () => {
    const response = new Response("target failure", { status: 403 });
    const json = vi.spyOn(response, "json");

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability: accountBalance(),
      request: vi.fn<TargetBackendRequest>().mockResolvedValue(response),
    });

    expect(execution).toEqual({ outcome: "http-error", response });
    expect(json).not.toHaveBeenCalled();
  });

  it("keeps malformed JSON distinct from response-shape failure", async () => {
    const malformedResponse = new Response("{not-json", { status: 200 });
    const malformed = await executeReadCapability({
      baseUrl: "https://target.example",
      capability: accountBalance(),
      request: vi.fn<TargetBackendRequest>().mockResolvedValue(malformedResponse),
    });
    const wrongShapeResponse = Response.json([{ balance: 10 }]);
    const wrongShape = await executeReadCapability({
      baseUrl: "https://target.example",
      capability: accountBalance(),
      request: vi.fn<TargetBackendRequest>().mockResolvedValue(wrongShapeResponse),
    });

    expect(malformed).toEqual({
      outcome: "malformed-json",
      response: malformedResponse,
    });
    expect(wrongShape).toEqual({
      outcome: "response-shape-error",
      response: wrongShapeResponse,
    });
  });

  it("fails the complete result when a declared property is missing or formatter-incompatible", async () => {
    const capability = defineReadCapability({
      id: "list_products",
      description: "List products.",
      operation: { method: "GET", path: "/products" },
      result: listView,
    });
    const missingPropertyResponse = Response.json([{ id: "product_1" }]);
    const wrongTypeResponse = Response.json([{ title: 42 }]);

    await expect(executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request: vi
        .fn<TargetBackendRequest>()
        .mockResolvedValue(missingPropertyResponse),
    })).resolves.toEqual({
      outcome: "response-shape-error",
      response: missingPropertyResponse,
    });
    await expect(executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request: vi.fn<TargetBackendRequest>().mockResolvedValue(wrongTypeResponse),
    })).resolves.toEqual({
      outcome: "response-shape-error",
      response: wrongTypeResponse,
    });
  });

  it("returns a sanitized network failure for a rejected fetch", async () => {
    const request = vi.fn<TargetBackendRequest>().mockRejectedValue(
      new Error("private target network detail"),
    );

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability: accountBalance(),
      request,
    });

    expect(execution).toEqual({ outcome: "network-error" });
    expect(execution).not.toHaveProperty("error");
  });

  it("sends no body or headers and never redirects through a Mashala server proxy", async () => {
    const request = responseRequest({ balance: 10 });

    await executeReadCapability({
      baseUrl: "https://backend.example/application/",
      capability: accountBalance(),
      request,
    });

    const [url, init] = request.mock.calls[0] ?? [];
    expect(url).toBe("https://backend.example/account/balance");
    expect(String(url)).not.toContain("/api/");
    expect(init).toEqual({ method: "GET" });
    expect(init).not.toHaveProperty("body");
    expect(init).not.toHaveProperty("headers");
    expect(init).not.toHaveProperty("credentials");
  });

  it("rejects undeclared request controls in serialized operation data", async () => {
    const request = responseRequest({ balance: 10 });
    const malformed = {
      ...accountBalance(),
      operation: {
        method: "GET",
        path: "/account/balance",
        headers: { authorization: "model-value" },
      },
    } as unknown as ReadCapabilitySpec;

    await expect(executeReadCapability({
      baseUrl: "https://target.example",
      capability: malformed,
      request,
    })).rejects.toThrow(/^Invalid backend operation:/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("read executor types", () => {
  it("exposes all fetch and response outcomes distinctly", () => {
    expectTypeOf<ReadCapabilityResult["outcome"]>().toEqualTypeOf<
      | "input-required"
      | "input-error"
      | "success"
      | "http-error"
      | "malformed-json"
      | "response-shape-error"
      | "network-error"
    >();
  });
});
