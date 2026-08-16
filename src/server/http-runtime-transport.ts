import "server-only";

import { randomUUID } from "node:crypto";

import {
  validateBrowserToServerEvent,
  validateServerToBrowserEvent,
  type ProtocolErrorCode,
  type ServerToBrowserEvent,
} from "../runtime-protocol";
import type { MashalaApplicationRuntime } from "./application-runtime";
import { processRuntimeEvent } from "./runtime-event-processor";
import { createProtocolErrorEvent } from "./runtime-protocol-events";

export interface RuntimeHttpRequestFrame {
  readonly event: unknown;
}

export interface RuntimeHttpResponseFrame {
  readonly events: readonly ServerToBrowserEvent[];
}

export interface RuntimeHttpTransportOptions {
  readonly applicationRuntime: MashalaApplicationRuntime;
  readonly createEventId?: () => string;
  readonly createConversationId?: () => string;
}

type RuntimeHttpPostHandler = (request: Request) => Promise<Response>;

function defaultEventId(): string {
  return `event_${randomUUID()}`;
}

function defaultConversationId(): string {
  return `conversation_${randomUUID()}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isRequestFrame(value: unknown): value is RuntimeHttpRequestFrame {
  return (
    isPlainRecord(value) &&
    Object.keys(value).length === 1 &&
    Object.prototype.hasOwnProperty.call(value, "event")
  );
}

function jsonResponse(
  frame: RuntimeHttpResponseFrame,
  status: number,
): Response {
  return new Response(JSON.stringify(frame), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function validatedFrame(
  events: readonly ServerToBrowserEvent[],
): RuntimeHttpResponseFrame {
  if (
    events.length === 0 ||
    events.some((event) => !validateServerToBrowserEvent(event).success)
  ) {
    throw new TypeError("Runtime processing produced an invalid response event.");
  }

  return Object.freeze({ events: Object.freeze([...events]) });
}

function acceptsJson(request: Request): boolean {
  return request.headers
    .get("content-type")
    ?.toLowerCase()
    .split(";", 1)[0]
    ?.trim() === "application/json";
}

function hasProhibitedCredentialHeaders(request: Request): boolean {
  return [
    "authorization",
    "proxy-authorization",
    "x-target-backend-authorization",
    "x-target-backend-cookie",
  ].some((name) => request.headers.has(name));
}

/** Creates the non-streaming POST handler for one canonical runtime event. */
export function createRuntimeHttpPostHandler({
  applicationRuntime,
  createEventId = defaultEventId,
  createConversationId = defaultConversationId,
}: RuntimeHttpTransportOptions): RuntimeHttpPostHandler {
  function errorResponse(
    code: ProtocolErrorCode,
    message: string,
    status: number,
    correlation?: { readonly eventId: string; readonly conversationId: string },
  ): Response {
    const errorEvent = createProtocolErrorEvent(
      {
        eventId: createEventId(),
        conversationId:
          correlation?.conversationId ?? createConversationId(),
        ...(correlation === undefined
          ? {}
          : { inReplyTo: correlation.eventId }),
      },
      {
        code,
        message,
        retryable: code === "internal_error",
      },
    );

    return jsonResponse(validatedFrame([errorEvent]), status);
  }

  return async function POST(request: Request): Promise<Response> {
    if (hasProhibitedCredentialHeaders(request)) {
      return errorResponse(
        "invalid_event",
        "Target-backend credential headers are not accepted by the runtime transport.",
        400,
      );
    }

    if (!acceptsJson(request)) {
      return errorResponse(
        "invalid_event",
        "The runtime transport requires an application/json request.",
        400,
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "invalid_event",
        "The runtime transport request body is malformed JSON.",
        400,
      );
    }

    if (!isRequestFrame(body)) {
      return errorResponse(
        "invalid_event",
        "The runtime transport request frame is invalid.",
        400,
      );
    }

    const validation = validateBrowserToServerEvent(body.event);

    if (!validation.success) {
      return errorResponse(
        validation.error.code,
        validation.error.message,
        400,
      );
    }

    const correlation = {
      eventId: validation.event.eventId,
      conversationId: validation.event.conversationId,
    };

    try {
      const events = await processRuntimeEvent({
        event: validation.event,
        applicationRuntime,
        createEventId,
      });

      return jsonResponse(validatedFrame(events), 200);
    } catch {
      return errorResponse(
        "internal_error",
        "The runtime request could not be processed.",
        500,
        correlation,
      );
    }
  };
}
