import { describe, expect, expectTypeOf, it } from "vitest";

import { defineMashalaApplication, validateMashalaSpec } from "./application";
import { defineReadCapability, result } from "./capabilities";
import { f } from "./fields";
import type {
  CapabilitySpec,
  MashalaSpec,
  ReadBackendOperation,
  ReadCapabilitySpec,
} from "./spec";

const balanceView = result.card({
  title: { kind: "fixed", text: "Account balance" },
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
});

const productView = result.card({
  title: {
    kind: "property",
    property: "title",
    formatter: { kind: "text" },
  },
});

describe("defineReadCapability", () => {
  it("compiles a zero-input GET with the accepted canonical shape", () => {
    const capability = defineReadCapability({
      id: "account_balance",
      description: "Show the user's current account balance.",
      operation: { method: "GET", path: "/account/balance" },
      result: balanceView,
    });

    expect(capability).toEqual({
      kind: "read",
      id: "account_balance",
      description: "Show the user's current account balance.",
      operation: { method: "GET", path: "/account/balance" },
      result: balanceView,
    });
    expect(capability).not.toHaveProperty("input");
    expect(capability).not.toHaveProperty("confirmation");
    expect(JSON.parse(JSON.stringify(capability))).toEqual(capability);
    expect(Object.isFrozen(capability)).toBe(true);
    expect(Object.isFrozen(capability.result)).toBe(true);
  });

  it("compiles path- and query-bound input through the existing form DSL", () => {
    const input = {
      productId: f.text({ label: "Product ID", required: true }),
      includeReviews: f.boolean({ label: "Include reviews" }),
    };
    const capability = defineReadCapability({
      id: "show_product",
      description: "Show one product and optional reviews.",
      input,
      operation: {
        method: "GET",
        path: "/products/{id}",
        bindings: {
          path: { id: "productId" },
          query: { include_reviews: "includeReviews" },
        },
      },
      result: productView,
    });

    expect(capability.input?.schema.properties).toEqual({
      productId: { type: "string" },
      includeReviews: { type: "boolean" },
    });
    expect(capability.input?.schema.required).toEqual(["productId"]);
    expect(capability.operation).toEqual({
      method: "GET",
      path: "/products/{id}",
      bindings: {
        path: { id: "productId" },
        query: { include_reviews: "includeReviews" },
      },
    });
    expect(Object.isFrozen(capability.operation.bindings?.path)).toBe(true);
    expect(Object.isFrozen(capability.operation.bindings?.query)).toBe(true);
  });

  it.each([
    [
      "an undeclared input property",
      {
        method: "GET",
        path: "/products",
        bindings: { query: { q: "invented" } },
      },
    ],
    [
      "an unbound input property",
      {
        method: "GET",
        path: "/products",
        bindings: { query: { q: "productId" } },
      },
    ],
    [
      "a path binding for optional input",
      {
        method: "GET",
        path: "/products/{id}",
        bindings: {
          path: { id: "includeReviews" },
          query: { q: "productId" },
        },
      },
    ],
    [
      "an undeclared query fragment",
      {
        method: "GET",
        path: "/products?admin=true",
        bindings: {
          query: { q: "productId", reviews: "includeReviews" },
        },
      },
    ],
  ])("rejects %s", (_case, operation) => {
    expect(() =>
      defineReadCapability({
        id: "show_product",
        description: "Show one product.",
        input: {
          productId: f.text({ label: "Product ID", required: true }),
          includeReviews: f.boolean({ label: "Include reviews" }),
        },
        operation: operation as ReadBackendOperation,
        result: productView,
      }),
    ).toThrow(/^Invalid backend operation:/);
  });

  it("rejects bindings and placeholders on a zero-input read", () => {
    expect(() =>
      defineReadCapability({
        id: "account_balance",
        description: "Show balance.",
        operation: {
          method: "GET",
          path: "/accounts/{id}",
          bindings: { path: { id: "accountId" } },
        },
        result: balanceView,
      }),
    ).toThrow(/^Invalid backend operation:/);
  });

  it("assembles and validates a canonical MashalaSpec v0.4 read", () => {
    const read = defineReadCapability({
      id: "account_balance",
      description: "Show balance.",
      operation: { method: "GET", path: "/account/balance" },
      result: balanceView,
    });
    const application = defineMashalaApplication({
      app: {
        id: "bank_app",
        name: "Bank",
        description: "Bank frontend",
      },
      capabilities: [read],
    });

    expect(application.specVersion).toBe("0.4");
    expect(validateMashalaSpec(JSON.parse(JSON.stringify(application)))).toEqual(
      application,
    );
    expectTypeOf(application).toMatchTypeOf<MashalaSpec>();
    expectTypeOf(read).toMatchTypeOf<ReadCapabilitySpec>();
    expectTypeOf<CapabilitySpec["kind"]>().toEqualTypeOf<"write" | "read">();
  });
});

if (false) {
  defineReadCapability({
    id: "unsupported_read_method",
    description: "Compile-time method test",
    // @ts-expect-error Read capabilities declare exactly one GET.
    operation: { method: "POST", path: "/products" },
    result: productView,
  });
}
