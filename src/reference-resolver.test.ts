import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { ReferenceFieldMetadata } from "./forms";
import { createSelectedBackendContextEventFromProjection } from "./model-visible-backend-projection";
import {
  projectReferenceOptions,
  resolveReferenceOptions,
  type ReferenceOption,
  type ReferenceResolutionResult,
} from "./reference-resolver";

const accountField: ReferenceFieldMetadata = {
  kind: "reference",
  label: "From account",
  source: { method: "GET", path: "/accounts" },
  value: "id",
  labelFrom: "display_name",
};

describe("projectReferenceOptions", () => {
  it("projects declared direct value and label properties deterministically", () => {
    const response = [
      { id: "acct_1", display_name: "Checking", ignored: "private" },
      { id: "acct_2", display_name: "Savings", ignored: "private" },
    ];

    const first = projectReferenceOptions(response, "id", "display_name");
    const second = projectReferenceOptions(response, "id", "display_name");

    expect(first).toEqual([
      { value: "acct_1", label: "Checking" },
      { value: "acct_2", label: "Savings" },
    ]);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(JSON.stringify(first)).not.toContain("private");
  });

  it.each([
    ["non-array root", { id: "acct_1", display_name: "Checking" }],
    ["non-object item", ["acct_1"]],
    ["missing value", [{ display_name: "Checking" }]],
    ["non-string value", [{ id: 1, display_name: "Checking" }]],
    ["missing label", [{ id: "acct_1" }]],
    ["non-string label", [{ id: "acct_1", display_name: 1 }]],
    [
      "duplicate value",
      [
        { id: "acct_1", display_name: "Checking" },
        { id: "acct_1", display_name: "Savings" },
      ],
    ],
  ])("rejects a malformed response with a %s", (_case, response) => {
    expect(() =>
      projectReferenceOptions(response, "id", "display_name"),
    ).toThrow(/^Invalid reference response:/);
  });
});

describe("resolveReferenceOptions", () => {
  it("executes one direct browser GET and projects the response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        { id: "acct_1", display_name: "Checking" },
        { id: "acct_2", display_name: "Savings" },
      ]),
    );

    const result = await resolveReferenceOptions({
      baseUrl: "https://target.example/application/",
      field: accountField,
      request: fetchImpl,
    });

    expect(result).toEqual({
      outcome: "success",
      options: [
        { value: "acct_1", label: "Checking" },
        { value: "acct_2", label: "Savings" },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://target.example/accounts",
      { method: "GET" },
    );
    expect(fetchImpl.mock.calls[0]?.[0]).not.toContain("/api/");
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty("body");
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty("headers");
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty("credentials");
  });

  it("minimizes declared model context from the same browser response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          id: "acct_1",
          display_name: "Checking",
          balance: 42_000,
          access_token: "target-secret",
        },
      ]),
    );
    const field: ReferenceFieldMetadata = {
      ...accountField,
      source: {
        ...accountField.source,
        modelContext: {
          purpose: "reference_resolution",
          fields: { id: "id", label: "display_name" },
        },
      },
    };

    const result = await resolveReferenceOptions({
      baseUrl: "https://target.example",
      field,
      request: fetchImpl,
    });

    expect(result).toEqual({
      outcome: "success",
      options: [{ value: "acct_1", label: "Checking" }],
      modelContext: {
        purpose: "reference_resolution",
        data: [{ id: "acct_1", label: "Checking" }],
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("balance");
    expect(JSON.stringify(result)).not.toContain("access_token");
    expect(JSON.stringify(result)).not.toContain("target-secret");

    if (result.outcome !== "success" || result.modelContext === undefined) {
      throw new Error("Expected minimized model context.");
    }
    expect(
      createSelectedBackendContextEventFromProjection({
        source: field.source,
        context: result.modelContext,
        capabilityId: "transfer_money",
        eventId: "evt_context_1",
        conversationId: "conv_1",
      }),
    ).toMatchObject({
      outcome: "projected",
      event: {
        type: "backend.context.selected",
        payload: {
          capabilityId: "transfer_money",
          data: [{ id: "acct_1", label: "Checking" }],
        },
      },
    });
  });

  it("fails closed when a declared model projection cannot be satisfied", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([{ id: "acct_1", display_name: "Checking" }]),
    );
    const field: ReferenceFieldMetadata = {
      ...accountField,
      source: {
        ...accountField.source,
        modelContext: {
          purpose: "result_interpretation",
          fields: { unavailable: "missing_property" },
        },
      },
    };

    await expect(
      resolveReferenceOptions({
        baseUrl: "https://target.example",
        field,
        request: fetchImpl,
      }),
    ).resolves.toEqual({ outcome: "invalid-response" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "HTTP failure",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
      "http-error",
    ],
    [
      "network failure",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("private detail")),
      "network-error",
    ],
    [
      "malformed JSON collection",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [] })),
      "invalid-response",
    ],
  ] as const)("normalizes %s", async (_case, fetchImpl, outcome) => {
    await expect(
      resolveReferenceOptions({
        baseUrl: "https://target.example",
        field: accountField,
        request: fetchImpl,
      }),
    ).resolves.toEqual({ outcome });
  });

  it("rejects non-GET or credential-bearing serialized source data", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const malformedField = {
      ...accountField,
      source: {
        method: "POST",
        path: "/accounts",
        headers: { authorization: "secret" },
      },
    } as unknown as ReferenceFieldMetadata;

    await expect(
      resolveReferenceOptions({
        baseUrl: "https://target.example",
        field: malformedField,
        request: fetchImpl,
      }),
    ).rejects.toThrow(/^Invalid reference source:/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("reference resolver types", () => {
  it("exposes string-valued options and deterministic outcomes", () => {
    expectTypeOf<ReferenceOption["value"]>().toEqualTypeOf<string>();
    expectTypeOf<ReferenceResolutionResult["outcome"]>().toEqualTypeOf<
      "success" | "http-error" | "network-error" | "invalid-response"
    >();
  });
});
