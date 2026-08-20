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
import type { ReadCapabilitySpec, ResultCard } from "./spec";
import type { TargetBackendRequest } from "./target-backend-request";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fixedTitle = { kind: "fixed", text: "Title" } as const;

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

  it("unwraps a single-segment response envelope for a card", async () => {
    const capability = defineReadCapability({
      id: "account_balance",
      description: "Show account balance.",
      operation: { method: "GET", path: "/api/v1/banking/balance/" },
      result: result.card({
        root: "balance",
        card: {
          title: { kind: "fixed", text: "Account Balance" },
          facts: [
            {
              id: "balance",
              label: "Balance",
              value: {
                kind: "property",
                property: "balance",
                formatter: {
                  kind: "currency",
                  locale: "en-US",
                  currency: "USD",
                },
              },
            },
          ],
        },
      }),
    });
    const request = responseRequest({
      balance: {
        account_number: "ACC123",
        balance: "3.50",
        status: "active",
      },
      message: "Balance retrieved successfully",
    });

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request,
    });

    expect(execution).toEqual({
      outcome: "success",
      response: expect.any(Response),
      data: {
        account_number: "ACC123",
        balance: "3.50",
        status: "active",
      },
    });
  });

  it("unwraps a multi-segment response envelope for a card", async () => {
    const capability = defineReadCapability({
      id: "account_balance",
      description: "Show account balance.",
      operation: { method: "GET", path: "/balance" },
      result: result.card({
        root: "data.account.balance",
        card: {
          title: { kind: "fixed", text: "Account Balance" },
          facts: [
            {
              id: "balance",
              label: "Balance",
              value: {
                kind: "property",
                property: "amount",
                formatter: {
                  kind: "currency",
                  locale: "en-US",
                  currency: "USD",
                },
              },
            },
          ],
        },
      }),
    });
    const request = responseRequest({
      data: {
        account: {
          balance: { amount: "1000.00" },
        },
      },
    });

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request,
    });

    expect(execution).toEqual({
      outcome: "success",
      response: expect.any(Response),
      data: { amount: "1000.00" },
    });
  });

  it("unwraps a wrapped collection response envelope for a cardList", async () => {
    const capability = defineReadCapability({
      id: "list_bills",
      description: "List bills.",
      operation: { method: "GET", path: "/bills" },
      result: result.cardList({
        root: "results",
        emptyText: "No bills found.",
        card: {
          title: {
            kind: "property",
            property: "id",
            formatter: { kind: "text" },
          },
          facts: [
            {
              id: "amount",
              label: "Amount",
              value: {
                kind: "property",
                property: "amount",
                formatter: {
                  kind: "currency",
                  locale: "en-US",
                  currency: "USD",
                },
              },
            },
          ],
        },
      }),
    });
    const request = responseRequest({
      count: 2,
      results: [
        { id: "bill_1", amount: "45.00" },
        { id: "bill_2", amount: "-12.50" },
      ],
    });

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request,
    });

    expect(execution).toEqual({
      outcome: "success",
      response: expect.any(Response),
      data: [
        { id: "bill_1", amount: "45.00" },
        { id: "bill_2", amount: "-12.50" },
      ],
    });
  });

  it("unwraps an empty wrapped collection cleanly", async () => {
    const capability = defineReadCapability({
      id: "list_bills",
      description: "List bills.",
      operation: { method: "GET", path: "/bills" },
      result: result.cardList({
        root: "data.items",
        emptyText: "No bills found.",
        card: {
          title: {
            kind: "property",
            property: "id",
            formatter: { kind: "text" },
          },
        },
      }),
    });
    const request = responseRequest({
      data: { items: [] },
    });

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request,
    });

    expect(execution).toEqual({
      outcome: "success",
      response: expect.any(Response),
      data: [],
    });
  });

  it.each([
    ["currency", { kind: "currency" as const, locale: "en-US", currency: "USD" }, "3.50"],
    ["negative currency", { kind: "currency" as const, locale: "en-US", currency: "USD" }, "-12.50"],
    ["integer string currency", { kind: "currency" as const, locale: "en-US", currency: "USD" }, "1000"],
    ["number", { kind: "number" as const, locale: "en-US" }, "42.50"],
    ["negative number", { kind: "number" as const, locale: "en-US" }, "-100"],
    ["zero number", { kind: "number" as const, locale: "en-US" }, "0"],
    ["finite JSON number", { kind: "number" as const, locale: "en-US" }, 1250.5],
  ])("accepts valid decimal strings and numbers for %s formatter (%s)", async (_case, formatter, value) => {
    const capability = defineReadCapability({
      id: "test_stat",
      description: "Show numeric stat.",
      operation: { method: "GET", path: "/stat" },
      result: result.card({
        title: { kind: "fixed", text: "Stat" },
        facts: [
          {
            id: "val",
            label: "Value",
            value: {
              kind: "property",
              property: "val",
              formatter,
            },
          },
        ],
      }),
    });
    const request = responseRequest({ val: value });

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request,
    });

    expect(execution).toEqual({
      outcome: "success",
      response: expect.any(Response),
      data: { val: value },
    });
  });

  it.each([
    ["non-numeric letters", "abc"],
    ["currency symbols", "$3.50"],
    ["empty string", ""],
    ["multiple decimal points", "12.34.56"],
    ["comma thousands separators", "1,000.00"],
    ["whitespace prefix/suffix", " 3.50 "],
    ["scientific notation", "1e5"],
    ["NaN string", "NaN"],
    ["Infinity string", "Infinity"],
  ])("rejects invalid numeric string %s with response-shape-error", async (_case, invalidValue) => {
    const capability = defineReadCapability({
      id: "test_stat",
      description: "Show numeric stat.",
      operation: { method: "GET", path: "/stat" },
      result: result.card({
        title: { kind: "fixed", text: "Stat" },
        facts: [
          {
            id: "val",
            label: "Value",
            value: {
              kind: "property",
              property: "val",
              formatter: {
                kind: "currency",
                locale: "en-US",
                currency: "USD",
              },
            },
          },
        ],
      }),
    });
    const request = responseRequest({ val: invalidValue });

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request,
    });

    expect(execution).toEqual({
      outcome: "response-shape-error",
      response: expect.any(Response),
    });
  });

  it.each([
    ["missing root envelope key", { root: "balance", card: { title: fixedTitle } }, { other: {} }],
    ["non-object intermediate segment (null)", { root: "data.balance", card: { title: fixedTitle } }, { data: null }],
    ["non-object intermediate segment (string)", { root: "data.balance", card: { title: fixedTitle } }, { data: "string" }],
    ["non-object intermediate segment (array)", { root: "data.balance", card: { title: fixedTitle } }, { data: [1, 2] }],
    ["card target is an array", { root: "balance", card: { title: fixedTitle } }, { balance: [{ title: "Account" }] }],
    ["card target is a primitive", { root: "balance", card: { title: fixedTitle } }, { balance: "primitive" }],
    ["card target is null", { root: "balance", card: { title: fixedTitle } }, { balance: null }],
    ["cardList target is an object", { root: "results", emptyText: "Empty", card: { title: { kind: "property", property: "title", formatter: { kind: "text" } } } }, { results: { id: 1 } }],
    ["cardList target is null", { root: "results", emptyText: "Empty", card: { title: { kind: "property", property: "title", formatter: { kind: "text" } } } }, { results: null }],
    ["cardList target is a string", { root: "results", emptyText: "Empty", card: { title: { kind: "property", property: "title", formatter: { kind: "text" } } } }, { results: "items" }],
  ])("returns response-shape-error when unwrapping fails due to %s", async (_case, resultDeclaration, responseBody) => {
    const capability = defineReadCapability({
      id: "test_unwrapping_failure",
      description: "Test unwrapping failure.",
      operation: { method: "GET", path: "/test" },
      result: "emptyText" in resultDeclaration
        ? result.cardList(resultDeclaration as { root: string; emptyText: string; card: ResultCard })
        : result.card(resultDeclaration as { root: string; card: ResultCard }),
    });
    const request = responseRequest(responseBody);

    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request,
    });

    expect(execution).toEqual({
      outcome: "response-shape-error",
      response: expect.any(Response),
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

  it("exposes only an explicit ADR-016 projection alongside browser-local data", async () => {
    const capability = defineReadCapability({
      id: "projected_balance",
      description: "Show a balance with selected model context.",
      operation: {
        method: "GET",
        path: "/account/balance",
        modelContext: {
          purpose: "result_interpretation",
          fields: { visibleBalance: "balance" },
        },
      },
      result: objectView,
    });
    const execution = await executeReadCapability({
      baseUrl: "https://target.example",
      capability,
      request: responseRequest({
        balance: 50,
        access_token: "browser-secret",
      }),
    });

    expect(execution).toMatchObject({
      outcome: "success",
      data: { balance: 50, access_token: "browser-secret" },
      modelContext: {
        purpose: "result_interpretation",
        data: { visibleBalance: 50 },
      },
    });
    expect(
      execution.outcome === "success"
        ? JSON.stringify(execution.modelContext)
        : "",
    ).not.toContain("access_token");
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
