import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { defineReadCapability, result } from "../capabilities";
import { f } from "../fields";
import type { JsonValue } from "../forms";
import { routeCapability } from "./capability-router";
import type { LlmProvider } from "./llm/provider";
import { extractSlotCandidates } from "./slot-extractor";

const productView = result.card({
  title: {
    kind: "property",
    property: "title",
    formatter: { kind: "text" },
  },
});

function providerReturning(output: JsonValue): LlmProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({ outcome: "success", output }),
  };
}

describe("read-capability language proposals", () => {
  it("routes to a declared read and proposes only its declared input", async () => {
    const capability = defineReadCapability({
      id: "show_product",
      description: "Show one product by its ID.",
      input: {
        productId: f.text({ label: "Product ID", required: true }),
      },
      operation: {
        method: "GET",
        path: "/products/{id}",
        bindings: { path: { id: "productId" } },
      },
      result: productView,
    });
    const routing = await routeCapability({
      utterance: "Show product A-42",
      capabilities: [capability],
      provider: providerReturning({
        outcome: "matched",
        capabilityId: "show_product",
      }),
    });

    expect(routing).toEqual({ outcome: "matched", capability });
    if (routing.outcome !== "matched") {
      throw new Error("Expected a declared read match.");
    }
    const extractionProvider = providerReturning({ productId: "A-42" });
    await expect(extractSlotCandidates({
      capability: routing.capability,
      utterance: "Show product A-42",
      provider: extractionProvider,
    })).resolves.toEqual({
      outcome: "proposed",
      values: { productId: "A-42" },
    });
    const extractionRequest = vi.mocked(
      extractionProvider.generateStructured,
    ).mock.calls[0]?.[0];
    expect(extractionRequest?.input).not.toContain("/products/{id}");
    expect(extractionRequest?.input).not.toContain('"method":"GET"');
    expect(extractionRequest?.input).not.toContain("bindings");
  });

  it("needs no slot-extraction provider call for a zero-input read", async () => {
    const capability = defineReadCapability({
      id: "account_balance",
      description: "Show account balance.",
      operation: { method: "GET", path: "/account/balance" },
      result: productView,
    });
    const generateStructured = vi.fn<LlmProvider["generateStructured"]>();

    await expect(extractSlotCandidates({
      capability,
      utterance: "What is my account balance?",
      provider: { generateStructured },
    })).resolves.toEqual({ outcome: "proposed", values: {} });
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
