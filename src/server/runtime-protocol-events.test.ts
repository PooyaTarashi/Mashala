import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { transferMoney } from "../examples/transfer-money";
import type { JsonValue } from "../forms";
import { validateServerToBrowserEvent } from "../runtime-protocol";
import { routeCapability } from "./capability-router";
import type { LlmProvider } from "./llm/provider";
import {
  capabilityRoutingResultToProtocolEvent,
  slotExtractionResultToProtocolEvent,
} from "./runtime-protocol-events";
import { extractSlotCandidates } from "./slot-extractor";

const responseMetadata = {
  eventId: "evt_response",
  conversationId: "conv_001",
  inReplyTo: "evt_request",
} as const;

function successfulProvider(output: JsonValue): LlmProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({
      outcome: "success",
      output,
    }),
  };
}

describe("routing protocol integration", () => {
  it("represents an existing matched routing result canonically", async () => {
    const routingResult = await routeCapability({
      utterance: "Send money to Sam",
      capabilities: [transferMoney],
      provider: successfulProvider({
        outcome: "matched",
        capabilityId: "transfer_money",
      }),
    });

    const event = capabilityRoutingResultToProtocolEvent(
      routingResult,
      responseMetadata,
    );

    expect(event).toEqual({
      protocolVersion: "0.1",
      eventId: "evt_response",
      conversationId: "conv_001",
      inReplyTo: "evt_request",
      type: "capability.route.result",
      payload: {
        outcome: "matched",
        capabilityId: "transfer_money",
      },
    });
    expect(validateServerToBrowserEvent(event).success).toBe(true);
  });

  it("represents an existing out-of-scope routing result canonically", async () => {
    const routingResult = await routeCapability({
      utterance: "Book a flight",
      capabilities: [transferMoney],
      provider: successfulProvider({ outcome: "out_of_scope" }),
    });

    const event = capabilityRoutingResultToProtocolEvent(
      routingResult,
      responseMetadata,
    );

    expect(event).toEqual({
      protocolVersion: "0.1",
      eventId: "evt_response",
      conversationId: "conv_001",
      inReplyTo: "evt_request",
      type: "capability.route.out_of_scope",
      payload: {},
    });
    expect(validateServerToBrowserEvent(event).success).toBe(true);
  });

  it("maps routing failures to a structured sanitized protocol error", async () => {
    const routingResult = await routeCapability({
      utterance: "Send money",
      capabilities: [transferMoney],
      provider: successfulProvider({
        outcome: "matched",
        capabilityId: "invented_capability",
      }),
    });

    const event = capabilityRoutingResultToProtocolEvent(
      routingResult,
      responseMetadata,
    );

    expect(event).toMatchObject({
      type: "protocol.error",
      payload: {
        code: "invalid_model_output",
        message: "The LLM proposed an undeclared capability ID.",
        retryable: false,
      },
    });
    expect(validateServerToBrowserEvent(event).success).toBe(true);
  });
});

describe("slot-extraction protocol integration", () => {
  it("represents an existing slot extraction result as form.values.proposed", async () => {
    const extractionResult = await extractSlotCandidates({
      capability: transferMoney,
      utterance: "Send Sam 50 instantly",
      provider: successfulProvider({
        recipient: "Sam",
        amount: 50,
        speed: "instant",
      }),
    });

    const event = slotExtractionResultToProtocolEvent(
      extractionResult,
      transferMoney.id,
      responseMetadata,
    );

    expect(event).toEqual({
      protocolVersion: "0.1",
      eventId: "evt_response",
      conversationId: "conv_001",
      inReplyTo: "evt_request",
      type: "form.values.proposed",
      payload: {
        capabilityId: "transfer_money",
        values: {
          recipient: "Sam",
          amount: 50,
          speed: "instant",
        },
      },
    });
    expect(validateServerToBrowserEvent(event).success).toBe(true);
  });

  it("maps invalid candidate results to a structured protocol error", async () => {
    const extractionResult = await extractSlotCandidates({
      capability: transferMoney,
      utterance: "Send minus one",
      provider: successfulProvider({ amount: -1 }),
    });

    const event = slotExtractionResultToProtocolEvent(
      extractionResult,
      transferMoney.id,
      responseMetadata,
    );

    expect(event).toMatchObject({
      type: "protocol.error",
      payload: {
        code: "invalid_model_output",
        message:
          "The LLM proposed values that do not satisfy the declared form schema.",
        retryable: false,
      },
    });
    expect(validateServerToBrowserEvent(event).success).toBe(true);
  });
});
