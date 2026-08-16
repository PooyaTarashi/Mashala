import { describe, expect, it, vi } from "vitest";

import type { UserMessageEvent } from "./runtime-protocol";
import {
  createRuntimeHttpTransport,
  RuntimeTransportError,
} from "./runtime-http-client";

const userMessage: UserMessageEvent = {
  protocolVersion: "0.1",
  eventId: "browser_event_1",
  conversationId: "conversation_1",
  type: "user.message",
  payload: { text: "transfer 500 to X" },
};

const assistantEvent = {
  protocolVersion: "0.1",
  eventId: "server_event_1",
  conversationId: "conversation_1",
  inReplyTo: "browser_event_1",
  type: "assistant.message",
  payload: { text: "Ready." },
} as const;

describe("browser HTTP runtime transport", () => {
  it("posts the canonical strict frame without browser credentials", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ events: [assistantEvent] }),
    );
    const transport = createRuntimeHttpTransport({ request });

    await expect(transport(userMessage)).resolves.toEqual([assistantEvent]);
    expect(request).toHaveBeenCalledWith("/api/runtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ event: userMessage }),
    });
  });

  it("keeps a canonical protocol.error distinct on an HTTP failure", async () => {
    const protocolError = {
      ...assistantEvent,
      type: "protocol.error",
      payload: {
        code: "internal_error",
        message: "The runtime request could not be processed.",
        retryable: true,
      },
    } as const;
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ events: [protocolError] }, { status: 500 }));
    const transport = createRuntimeHttpTransport({ request });

    await expect(transport(userMessage)).resolves.toEqual([protocolError]);
  });

  it("fails closed for network and malformed response failures", async () => {
    const networkTransport = createRuntimeHttpTransport({
      request: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
    });
    await expect(networkTransport(userMessage)).rejects.toBeInstanceOf(
      RuntimeTransportError,
    );

    const malformedTransport = createRuntimeHttpTransport({
      request: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ events: [{ type: "raw text" }] })),
    });
    await expect(malformedTransport(userMessage)).rejects.toThrow(
      "invalid response event",
    );
  });
});
