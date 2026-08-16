"use client";

import {
  validateBrowserToServerEvent,
  validateServerToBrowserEvent,
  type BrowserToServerEvent,
  type ServerToBrowserEvent,
} from "./runtime-protocol";

export interface RuntimeHttpResponseFrame {
  readonly events: readonly ServerToBrowserEvent[];
}

export interface RuntimeHttpRequest {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface RuntimeTransport {
  (event: BrowserToServerEvent): Promise<readonly ServerToBrowserEvent[]>;
}

export interface RuntimeHttpTransportOptions {
  readonly endpoint?: string | URL;
  readonly request?: RuntimeHttpRequest;
}

export class RuntimeTransportError extends Error {
  constructor(message = "The runtime could not be reached.") {
    super(message);
    this.name = "RuntimeTransportError";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function validatedResponseEvents(value: unknown): readonly ServerToBrowserEvent[] {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(value, "events") ||
    !Array.isArray(value.events) ||
    value.events.length === 0
  ) {
    throw new RuntimeTransportError(
      "The runtime returned an invalid response frame.",
    );
  }

  const events: ServerToBrowserEvent[] = [];
  for (const valueEvent of value.events) {
    const validation = validateServerToBrowserEvent(valueEvent);
    if (!validation.success) {
      throw new RuntimeTransportError(
        "The runtime returned an invalid response event.",
      );
    }
    events.push(validation.event);
  }

  return Object.freeze(events);
}

/** Creates the browser side of ISSUE-049's strict non-streaming transport. */
export function createRuntimeHttpTransport({
  endpoint = "/api/runtime",
  request,
}: RuntimeHttpTransportOptions = {}): RuntimeTransport {
  return async function sendRuntimeEvent(
    event: BrowserToServerEvent,
  ): Promise<readonly ServerToBrowserEvent[]> {
    if (!validateBrowserToServerEvent(event).success) {
      throw new RuntimeTransportError(
        "The browser produced an invalid runtime event.",
      );
    }

    let response: Response;
    try {
      const send = request ?? fetch;
      response = await send(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ event }),
      });
    } catch {
      throw new RuntimeTransportError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new RuntimeTransportError(
        "The runtime returned an unreadable response.",
      );
    }

    const events = validatedResponseEvents(body);
    if (!response.ok && !events.some((item) => item.type === "protocol.error")) {
      throw new RuntimeTransportError(
        `The runtime request failed with HTTP ${String(response.status)}.`,
      );
    }

    return events;
  };
}
