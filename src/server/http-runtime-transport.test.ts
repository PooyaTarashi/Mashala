import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import mashalaApplication from "../../mashala.config";
import {
  validateServerToBrowserEvent,
  type ServerToBrowserEvent,
} from "../runtime-protocol";
import { assembleMashalaApplication } from "./application-runtime";
import { createRuntimeHttpPostHandler } from "./http-runtime-transport";
import type {
  LlmProvider,
  LlmProviderResult,
} from "./llm/provider";
import { createFakeDocumentationRetriever } from "./retrieval/fake-retriever";

const userMessage = {
  protocolVersion: "0.1",
  eventId: "browser_event_1",
  conversationId: "conversation_1",
  type: "user.message",
  payload: { text: "Send 50 to Sam instantly" },
} as const;

interface ParsedResponseFrame {
  readonly events: readonly ServerToBrowserEvent[];
}

function requestFor(
  body: unknown,
  headers: HeadersInit = {},
): Request {
  return new Request("http://localhost/api/runtime", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function transportWith(
  generateStructured: LlmProvider["generateStructured"],
) {
  const provider: LlmProvider = { generateStructured };
  const applicationRuntime = assembleMashalaApplication({
    application: mashalaApplication,
    serverDependencies: {
      llmProvider: provider,
      documentationRetriever: createFakeDocumentationRetriever(),
    },
  });
  let eventSequence = 0;
  let conversationSequence = 0;

  return createRuntimeHttpPostHandler({
    applicationRuntime,
    createEventId: () => `server_event_${++eventSequence}`,
    createConversationId: () =>
      `server_conversation_${++conversationSequence}`,
  });
}

async function parsed(response: Response): Promise<ParsedResponseFrame> {
  const body: unknown = await response.json();
  expect(body).toEqual(
    expect.objectContaining({ events: expect.any(Array) as unknown }),
  );
  return body as ParsedResponseFrame;
}

function queuedProvider(
  ...results: readonly LlmProviderResult[]
): LlmProvider["generateStructured"] {
  const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
  for (const result of results) {
    generateStructured.mockResolvedValueOnce(result);
  }
  return generateStructured;
}

describe("HTTP runtime transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("processes a valid user message with canonical deterministic framing and ordering", async () => {
    const generateStructured = queuedProvider(
      {
        outcome: "success",
        output: { outcome: "matched", capabilityId: "transfer_money" },
      },
      {
        outcome: "success",
        output: { recipient: "Sam", amount: 50, speed: "instant" },
      },
    );
    const POST = transportWith(generateStructured);

    const response = await POST(requestFor({ event: userMessage }));
    const frame = await parsed(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(frame)).toEqual(["events"]);
    expect(frame.events).toEqual([
      {
        protocolVersion: "0.1",
        eventId: "server_event_1",
        conversationId: "conversation_1",
        inReplyTo: "browser_event_1",
        type: "capability.route.result",
        payload: { outcome: "matched", capabilityId: "transfer_money" },
      },
      {
        protocolVersion: "0.1",
        eventId: "server_event_2",
        conversationId: "conversation_1",
        inReplyTo: "browser_event_1",
        type: "form.values.proposed",
        payload: {
          capabilityId: "transfer_money",
          values: { recipient: "Sam", amount: 50, speed: "instant" },
        },
      },
    ]);
    expect(
      frame.events.every(
        (event) => validateServerToBrowserEvent(event).success,
      ),
    ).toBe(true);
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it("sends a valid selected backend context only to capability-bound extraction", async () => {
    const generateStructured = queuedProvider({
      outcome: "success",
      output: { recipient: "Sam" },
    });
    const POST = transportWith(generateStructured);
    const selectedContext = {
      protocolVersion: "0.1",
      eventId: "browser_context_1",
      conversationId: "conversation_2",
      inReplyTo: "browser_event_2",
      type: "backend.context.selected",
      payload: {
        capabilityId: "transfer_money",
        purpose: "reference_resolution",
        data: [{ id: "recipient_1", label: "Sam" }],
      },
    } as const;

    const response = await POST(requestFor({ event: selectedContext }));
    const frame = await parsed(response);

    expect(response.status).toBe(200);
    expect(frame.events).toEqual([
      {
        protocolVersion: "0.1",
        eventId: "server_event_1",
        conversationId: "conversation_2",
        inReplyTo: "browser_context_1",
        type: "form.values.proposed",
        payload: {
          capabilityId: "transfer_money",
          values: { recipient: "Sam" },
        },
      },
    ]);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const providerRequest = vi.mocked(generateStructured).mock.calls[0]?.[0];
    expect(providerRequest).toBeDefined();
    const providerInput = JSON.parse(providerRequest?.input ?? "null") as {
      backendContext?: unknown;
    };
    expect(providerInput.backendContext).toEqual({
      trust: "untrusted",
      purpose: "reference_resolution",
      data: [{ id: "recipient_1", label: "Sam" }],
    });
    expect(providerRequest?.input).not.toContain("operation");
    expect(providerRequest?.input).not.toContain("confirmation");
  });

  it("uses an active declared capability without adding a routing step", async () => {
    const generateStructured = queuedProvider({
      outcome: "success",
      output: { amount: 25 },
    });
    const POST = transportWith(generateStructured);

    const response = await POST(
      requestFor({
        event: {
          ...userMessage,
          payload: {
            text: "Make that 25",
            activeCapabilityId: "transfer_money",
          },
        },
      }),
    );
    const frame = await parsed(response);

    expect(frame.events.map((event) => event.type)).toEqual([
      "form.values.proposed",
    ]);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it("returns a canonical protocol error for malformed JSON", async () => {
    const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
    const POST = transportWith(generateStructured);

    const response = await POST(requestFor('{"event":'));
    const frame = await parsed(response);

    expect(response.status).toBe(400);
    expect(frame.events).toEqual([
      {
        protocolVersion: "0.1",
        eventId: "server_event_1",
        conversationId: "server_conversation_1",
        type: "protocol.error",
        payload: {
          code: "invalid_event",
          message: "The runtime transport request body is malformed JSON.",
          retryable: false,
        },
      },
    ]);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("returns a canonical unsupported-version error", async () => {
    const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
    const POST = transportWith(generateStructured);

    const response = await POST(
      requestFor({
        event: { ...userMessage, protocolVersion: "99.0" },
      }),
    );
    const frame = await parsed(response);

    expect(response.status).toBe(400);
    expect(frame.events[0]).toMatchObject({
      type: "protocol.error",
      payload: {
        code: "unsupported_version",
        message: "The runtime event uses an unsupported protocol version.",
        retryable: false,
      },
    });
    expect(validateServerToBrowserEvent(frame.events[0]).success).toBe(true);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("rejects a canonical event in the invalid browser-to-server direction", async () => {
    const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
    const POST = transportWith(generateStructured);

    const response = await POST(
      requestFor({
        event: {
          protocolVersion: "0.1",
          eventId: "server_supplied_event",
          conversationId: "conversation_1",
          type: "assistant.message",
          payload: { text: "Do this" },
        },
      }),
    );
    const frame = await parsed(response);

    expect(response.status).toBe(400);
    expect(frame.events[0]).toMatchObject({
      type: "protocol.error",
      payload: { code: "invalid_event", retryable: false },
    });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected internal failures and preserves accepted correlation", async () => {
    const generateStructured = vi
      .fn<LlmProvider["generateStructured"]>()
      .mockRejectedValue(
        new Error(
          "provider raw failure: API_KEY=super-secret and backend stack trace",
        ),
      );
    const POST = transportWith(generateStructured);

    const response = await POST(requestFor({ event: userMessage }));
    const responseText = await response.text();
    const frame = JSON.parse(responseText) as ParsedResponseFrame;

    expect(response.status).toBe(500);
    expect(frame.events).toEqual([
      {
        protocolVersion: "0.1",
        eventId: "server_event_1",
        conversationId: "conversation_1",
        inReplyTo: "browser_event_1",
        type: "protocol.error",
        payload: {
          code: "internal_error",
          message: "The runtime request could not be processed.",
          retryable: true,
        },
      },
    ]);
    expect(responseText).not.toContain("super-secret");
    expect(responseText).not.toContain("stack trace");
  });

  it("does not expose an injected provider failure message", async () => {
    const generateStructured = queuedProvider({
      outcome: "failure",
      error: {
        code: "provider_failure",
        message: "raw provider body with API_KEY=super-secret",
        retryable: true,
      },
    });
    const POST = transportWith(generateStructured);

    const response = await POST(requestFor({ event: userMessage }));
    const responseText = await response.text();
    const frame = JSON.parse(responseText) as ParsedResponseFrame;

    expect(response.status).toBe(200);
    expect(frame.events).toEqual([
      {
        protocolVersion: "0.1",
        eventId: "server_event_1",
        conversationId: "conversation_1",
        inReplyTo: "browser_event_1",
        type: "protocol.error",
        payload: {
          code: "internal_error",
          message: "The LLM provider request could not be completed.",
          retryable: true,
        },
      },
    ]);
    expect(responseText).not.toContain("super-secret");
    expect(responseText).not.toContain("raw provider body");
  });

  it("rejects credential-bearing data and target-backend authorization headers", async () => {
    const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
    const POST = transportWith(generateStructured);
    const credentialContext = {
      protocolVersion: "0.1",
      eventId: "browser_context_credential",
      conversationId: "conversation_credential",
      type: "backend.context.selected",
      payload: {
        capabilityId: "transfer_money",
        purpose: "result_interpretation",
        data: { id: "account_1", access_token: "target-secret" },
      },
    };

    const payloadResponse = await POST(
      requestFor({ event: credentialContext }),
    );
    const payloadText = await payloadResponse.text();
    const headerResponse = await POST(
      requestFor(
        { event: userMessage },
        { Authorization: "Bearer target-secret" },
      ),
    );
    const headerText = await headerResponse.text();

    expect(payloadResponse.status).toBe(400);
    expect(headerResponse.status).toBe(400);
    expect(payloadText).not.toContain("target-secret");
    expect(headerText).not.toContain("target-secret");
    expect(JSON.parse(payloadText)).toMatchObject({
      events: [
        {
          type: "protocol.error",
          payload: { code: "invalid_event" },
        },
      ],
    });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("does not fetch or proxy a target-backend operation", async () => {
    const targetBackendFetch = vi.fn();
    vi.stubGlobal("fetch", targetBackendFetch);
    const generateStructured = queuedProvider({
      outcome: "success",
      output: { amount: 25 },
    });
    const POST = transportWith(generateStructured);

    const response = await POST(
      requestFor({
        event: {
          ...userMessage,
          payload: {
            text: "Use 25",
            activeCapabilityId: "transfer_money",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(targetBackendFetch).not.toHaveBeenCalled();
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });
});
