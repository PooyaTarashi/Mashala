import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type AssistantMessageEvent,
  type BrowserToServerEvent,
  type CapabilityRouteResultEvent,
  type OutOfScopeEvent,
  type ProtocolErrorEvent,
  type RuntimeProtocolEvent,
  type SelectedBackendContextEvent,
  type ServerToBrowserEvent,
  type SlotCandidatesProposedEvent,
  type UserMessageEvent,
  validateBrowserToServerEvent,
  validateRuntimeProtocolEvent,
  validateServerToBrowserEvent,
} from "./runtime-protocol";

const baseEnvelope = {
  protocolVersion: "0.1",
  eventId: "evt_001",
  conversationId: "conv_001",
} as const;

function expectAccepted(event: unknown): RuntimeProtocolEvent {
  const result = validateRuntimeProtocolEvent(event);
  expect(result).toEqual({ success: true, event });

  if (!result.success) {
    throw new Error("Expected an accepted runtime protocol event.");
  }

  return result.event;
}

describe("runtime protocol validation", () => {
  it("accepts a valid user message", () => {
    const event = {
      ...baseEnvelope,
      type: "user.message",
      payload: {
        text: "Send 250 to Sam",
        activeCapabilityId: "transfer_money",
      },
    } satisfies UserMessageEvent;

    expectAccepted(event);
    expect(validateBrowserToServerEvent(event).success).toBe(true);
    expect(validateServerToBrowserEvent(event).success).toBe(false);
  });

  it("accepts a valid route-result event", () => {
    const event = {
      ...baseEnvelope,
      inReplyTo: "evt_request",
      type: "capability.route.result",
      payload: { outcome: "matched", capabilityId: "transfer_money" },
    } satisfies CapabilityRouteResultEvent;

    expectAccepted(event);
    expect(validateServerToBrowserEvent(event).success).toBe(true);
  });

  it("accepts a valid out-of-scope event", () => {
    const event = {
      ...baseEnvelope,
      type: "capability.route.out_of_scope",
      payload: { message: "That request is outside this application." },
    } satisfies OutOfScopeEvent;

    expectAccepted(event);
  });

  it("accepts valid proposed form values", () => {
    const event = {
      ...baseEnvelope,
      type: "form.values.proposed",
      payload: {
        capabilityId: "transfer_money",
        values: {
          recipient: "Sam",
          amount: 250,
          metadata: { source: "utterance", spans: [5, 8] },
        },
      },
    } satisfies SlotCandidatesProposedEvent;

    expectAccepted(event);
  });

  it("accepts a valid assistant message", () => {
    const event = {
      ...baseEnvelope,
      type: "assistant.message",
      payload: { text: "Which account should I use?" },
    } satisfies AssistantMessageEvent;

    expectAccepted(event);
  });

  it("accepts valid selected, minimized backend context", () => {
    const event = {
      ...baseEnvelope,
      type: "backend.context.selected",
      payload: {
        capabilityId: "transfer_money",
        purpose: "reference_resolution",
        data: [
          { id: "account_1", label: "Everyday account" },
          { id: "account_2", label: "Savings account" },
        ],
      },
    } satisfies SelectedBackendContextEvent;

    expectAccepted(event);
    expect(validateBrowserToServerEvent(event).success).toBe(true);
  });

  it("accepts a valid structured protocol error", () => {
    const event = {
      ...baseEnvelope,
      type: "protocol.error",
      payload: {
        code: "invalid_model_output",
        message: "The model response could not be used.",
        retryable: false,
      },
    } satisfies ProtocolErrorEvent;

    expectAccepted(event);
  });

  it("rejects an unsupported protocol version distinctly", () => {
    expect(
      validateRuntimeProtocolEvent({
        ...baseEnvelope,
        protocolVersion: "0.2",
        type: "user.message",
        payload: { text: "Hello" },
      }),
    ).toEqual({
      success: false,
      error: {
        code: "unsupported_version",
        message: "The runtime event uses an unsupported protocol version.",
      },
    });
  });

  it("rejects an unknown event type", () => {
    expect(
      validateRuntimeProtocolEvent({
        ...baseEnvelope,
        type: "workflow.advance",
        payload: {},
      }),
    ).toMatchObject({
      success: false,
      error: { code: "invalid_event" },
    });
  });

  it.each([
    [
      "missing event ID",
      {
        protocolVersion: "0.1",
        conversationId: "conv_001",
        type: "user.message",
        payload: { text: "Hello" },
      },
    ],
    [
      "wrong conversation ID shape",
      {
        ...baseEnvelope,
        conversationId: 42,
        type: "user.message",
        payload: { text: "Hello" },
      },
    ],
    [
      "unexpected envelope field",
      {
        ...baseEnvelope,
        type: "user.message",
        payload: { text: "Hello" },
        transport: "websocket",
      },
    ],
  ])("rejects a malformed envelope: %s", (_case, event) => {
    expect(validateRuntimeProtocolEvent(event)).toMatchObject({
      success: false,
      error: { code: "invalid_event" },
    });
  });

  it.each([
    ["missing text", {}],
    ["wrong text shape", { text: 42 }],
    ["unexpected payload field", { text: "Hello", operation: "/admin" }],
  ])("rejects a malformed user-message payload: %s", (_case, payload) => {
    expect(
      validateRuntimeProtocolEvent({
        ...baseEnvelope,
        type: "user.message",
        payload,
      }),
    ).toMatchObject({
      success: false,
      error: { code: "invalid_event" },
    });
  });

  it("rejects credential-like fields in selected context and proposed values", () => {
    const selectedContext = {
      ...baseEnvelope,
      type: "backend.context.selected",
      payload: {
        capabilityId: "transfer_money",
        purpose: "result_interpretation",
        data: { account: { id: "account_1", access_token: "secret" } },
      },
    };
    const proposedValues = {
      ...baseEnvelope,
      type: "form.values.proposed",
      payload: {
        capabilityId: "transfer_money",
        values: { password: "secret" },
      },
    };

    expect(validateRuntimeProtocolEvent(selectedContext)).toMatchObject({
      success: false,
      error: { code: "invalid_event" },
    });
    expect(validateRuntimeProtocolEvent(proposedValues)).toMatchObject({
      success: false,
      error: { code: "invalid_event" },
    });
  });

  it.each(["backend.execute", "operation.execute", "api.call"])(
    "does not accept the backend-execution event type %s",
    (type) => {
      expect(
        validateRuntimeProtocolEvent({
          ...baseEnvelope,
          type,
          payload: { capabilityId: "transfer_money" },
        }),
      ).toMatchObject({
        success: false,
        error: { code: "invalid_event" },
      });
    },
  );
});

describe("runtime protocol types", () => {
  it("preserves the accepted directional discriminated unions", () => {
    expectTypeOf<BrowserToServerEvent["type"]>().toEqualTypeOf<
      "user.message" | "backend.context.selected"
    >();
    expectTypeOf<ServerToBrowserEvent["type"]>().toEqualTypeOf<
      | "capability.route.result"
      | "form.values.proposed"
      | "assistant.message"
      | "capability.route.out_of_scope"
      | "protocol.error"
    >();
    expectTypeOf<
      Extract<RuntimeProtocolEvent, { type: "backend.execute" }>
    >().toEqualTypeOf<never>();
  });
});

if (false) {
  const credentialBearingUserMessage: UserMessageEvent = {
    ...baseEnvelope,
    type: "user.message",
    payload: {
      text: "Hello",
      // @ts-expect-error Credential fields are not part of the payload contract.
      accessToken: "secret",
    },
  };

  const credentialBearingContext: SelectedBackendContextEvent = {
    ...baseEnvelope,
    type: "backend.context.selected",
    payload: {
      capabilityId: "transfer_money",
      purpose: "reference_resolution",
      data: [],
      // @ts-expect-error Credentials are not top-level context payload fields.
      credentials: { token: "secret" },
    },
  };

  void credentialBearingUserMessage;
  void credentialBearingContext;
}
