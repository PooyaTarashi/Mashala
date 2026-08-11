import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { defineCapability } from "../capabilities";
import { transferMoney } from "../examples/transfer-money";
import { f } from "../fields";
import type { JsonValue } from "../forms";
import type { CapabilitySpec } from "../spec";
import { routeCapability } from "./capability-router";
import type { LlmProvider } from "./llm/provider";

const updateAddress = defineCapability({
  id: "update_address",
  description: "Update the user's mailing address.",
  fields: {
    address: f.longText({ label: "Mailing address", required: true }),
  },
  operation: { method: "PATCH", path: "/profile/address" },
  confirmation: "none",
});

function successfulProvider(output: JsonValue) {
  const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
  generateStructured.mockResolvedValue({ outcome: "success", output });

  return {
    provider: { generateStructured } satisfies LlmProvider,
    generateStructured,
  };
}

describe("routeCapability", () => {
  it("binds a valid proposal to the actual declared capability", async () => {
    const { provider } = successfulProvider({
      outcome: "matched",
      capabilityId: "transfer_money",
    });

    const result = await routeCapability({
      utterance: "Send some money to Sam",
      capabilities: [transferMoney],
      provider,
    });

    expect(result.outcome).toBe("matched");
    if (result.outcome === "matched") {
      expect(result.capability).toBe(transferMoney);
      expect(result.capability.operation).toBe(transferMoney.operation);
      expect(result.capability.confirmation).toBe("required");
    }
  });

  it("routes among multiple declared capabilities", async () => {
    const { provider } = successfulProvider({
      outcome: "matched",
      capabilityId: "update_address",
    });

    const result = await routeCapability({
      utterance: "I moved and need to change where mail is sent",
      capabilities: [transferMoney, updateAddress],
      provider,
    });

    expect(result).toEqual({
      outcome: "matched",
      capability: updateAddress,
    });
  });

  it("returns an explicit out-of-scope result", async () => {
    const { provider } = successfulProvider({ outcome: "out_of_scope" });

    await expect(
      routeCapability({
        utterance: "Book me a flight",
        capabilities: [transferMoney, updateAddress],
        provider,
      }),
    ).resolves.toEqual({ outcome: "out_of_scope" });
  });

  it("rejects an invented capability ID deterministically", async () => {
    const { provider } = successfulProvider({
      outcome: "matched",
      capabilityId: "book_flight",
    });

    await expect(
      routeCapability({
        utterance: "Book me a flight",
        capabilities: [transferMoney],
        provider,
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: {
        kind: "unknown_capability_id",
        capabilityId: "book_flight",
        message: "The LLM proposed an undeclared capability ID.",
      },
    });
  });

  it.each([
    ["non-object output", "transfer_money"],
    ["missing capability ID", { outcome: "matched" }],
    [
      "extra matched property",
      {
        outcome: "matched",
        capabilityId: "transfer_money",
        amount: 100,
      },
    ],
    [
      "capability ID on out-of-scope output",
      { outcome: "out_of_scope", capabilityId: "transfer_money" },
    ],
  ] as const)("handles %s as malformed model output", async (_case, output) => {
    const { provider } = successfulProvider(output);

    await expect(
      routeCapability({
        utterance: "Send money",
        capabilities: [transferMoney],
        provider,
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: {
        kind: "invalid_model_output",
        message: "The LLM returned malformed capability routing output.",
      },
    });
  });

  it("keeps provider failure distinct from out-of-scope", async () => {
    const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
    generateStructured.mockResolvedValue({
      outcome: "failure",
      error: {
        code: "provider_failure",
        message: "The LLM provider request failed.",
        retryable: true,
      },
    });

    await expect(
      routeCapability({
        utterance: "Send money",
        capabilities: [transferMoney],
        provider: { generateStructured },
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: {
        kind: "provider_failure",
        failure: {
          code: "provider_failure",
          message: "The LLM provider request failed.",
          retryable: true,
        },
      },
    });
  });

  it("supplies only declared IDs and routing descriptions to the model", async () => {
    const { provider, generateStructured } = successfulProvider({
      outcome: "out_of_scope",
    });

    await routeCapability({
      utterance: "What can I do?",
      capabilities: [transferMoney, updateAddress],
      provider,
    });

    const request = generateStructured.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    expect(JSON.parse(request?.input ?? "null")).toEqual({
      utterance: "What can I do?",
      capabilities: [
        {
          id: "transfer_money",
          description:
            "Transfer money to a recipient from the user's account.",
        },
        {
          id: "update_address",
          description: "Update the user's mailing address.",
        },
      ],
    });
    expect(request?.outputSchema).toMatchObject({
      properties: {
        capabilityId: {
          enum: ["transfer_money", "update_address"],
        },
      },
    });
    expect(request?.input).not.toContain("/transfers");
    expect(request?.input).not.toContain("/profile/address");
    expect(request?.input).not.toContain("confirmation");
    expect(request?.input).not.toContain("schema");
    expect(request?.instructions).toContain("never invent a capability");
    expect(request?.instructions).toContain("out_of_scope");
    expect(request?.instructions).toContain("do not extract form values");
  });

  it("does not inspect or execute backend operation data", async () => {
    const forbiddenReads: string[] = [];
    const guardedCapability = new Proxy(transferMoney as CapabilitySpec, {
      get(target, property, receiver) {
        if (
          property === "form" ||
          property === "operation" ||
          property === "confirmation"
        ) {
          forbiddenReads.push(String(property));
          throw new Error(`Routing read forbidden property ${String(property)}`);
        }

        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const { provider } = successfulProvider({
      outcome: "matched",
      capabilityId: "transfer_money",
    });

    const result = await routeCapability({
      utterance: "Transfer money",
      capabilities: [guardedCapability],
      provider,
    });

    expect(result.outcome).toBe("matched");
    if (result.outcome === "matched") {
      expect(result.capability).toBe(guardedCapability);
    }
    expect(forbiddenReads).toEqual([]);
  });
});
