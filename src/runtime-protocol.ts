import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

import type { JsonSchema202012, JsonValue } from "./spec";

export const RUNTIME_PROTOCOL_VERSION = "0.1" as const;

export interface RuntimeEvent<
  Type extends string,
  Payload extends object,
> {
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly eventId: string;
  readonly conversationId: string;
  readonly inReplyTo?: string;
  readonly type: Type;
  readonly payload: Payload;
}

export type BrowserToServerEvent =
  | UserMessageEvent
  | SelectedBackendContextEvent;

export type ServerToBrowserEvent =
  | CapabilityRouteResultEvent
  | SlotCandidatesProposedEvent
  | AssistantMessageEvent
  | OutOfScopeEvent
  | ProtocolErrorEvent;

export type RuntimeProtocolEvent =
  | BrowserToServerEvent
  | ServerToBrowserEvent;

export type UserMessageEvent = RuntimeEvent<
  "user.message",
  {
    readonly text: string;
    readonly activeCapabilityId?: string;
  }
>;

export type SelectedBackendContextEvent = RuntimeEvent<
  "backend.context.selected",
  {
    readonly capabilityId: string;
    readonly purpose: "reference_resolution" | "result_interpretation";
    /** Explicitly minimized, untrusted JSON data. Never credentials. */
    readonly data: JsonValue;
  }
>;

export type CapabilityRouteResultEvent = RuntimeEvent<
  "capability.route.result",
  {
    readonly outcome: "matched";
    readonly capabilityId: string;
  }
>;

export type SlotCandidatesProposedEvent = RuntimeEvent<
  "form.values.proposed",
  {
    readonly capabilityId: string;
    /** Partial, untrusted values keyed by proposed form field name. */
    readonly values: Readonly<Record<string, JsonValue>>;
  }
>;

export type AssistantMessageEvent = RuntimeEvent<
  "assistant.message",
  {
    readonly text: string;
  }
>;

export type OutOfScopeEvent = RuntimeEvent<
  "capability.route.out_of_scope",
  {
    readonly message?: string;
  }
>;

export type ProtocolErrorCode =
  | "invalid_event"
  | "invalid_model_output"
  | "unsupported_version"
  | "internal_error";

export type ProtocolErrorEvent = RuntimeEvent<
  "protocol.error",
  {
    readonly code: ProtocolErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  }
>;

export interface RuntimeProtocolValidationError {
  readonly code: "invalid_event" | "unsupported_version";
  readonly message: string;
}

export type RuntimeProtocolValidationResult<Event> =
  | {
      readonly success: true;
      readonly event: Event;
    }
  | {
      readonly success: false;
      readonly error: RuntimeProtocolValidationError;
    };

const JSON_VALUE_DEFINITION: JsonSchema202012 = {
  anyOf: [
    { type: "null" },
    { type: "boolean" },
    { type: "number" },
    { type: "string" },
    {
      type: "array",
      items: { $ref: "#/$defs/jsonValue" },
    },
    {
      type: "object",
      additionalProperties: { $ref: "#/$defs/jsonValue" },
    },
  ],
};

function objectPayloadSchema(
  properties: Readonly<Record<string, JsonSchema202012>>,
  required: readonly string[],
): JsonSchema202012 {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function eventSchema(
  type: RuntimeProtocolEvent["type"],
  payload: JsonSchema202012,
): JsonSchema202012 {
  return {
    type: "object",
    properties: {
      protocolVersion: { const: RUNTIME_PROTOCOL_VERSION },
      eventId: { type: "string" },
      conversationId: { type: "string" },
      inReplyTo: { type: "string" },
      type: { const: type },
      payload,
    },
    required: [
      "protocolVersion",
      "eventId",
      "conversationId",
      "type",
      "payload",
    ],
    additionalProperties: false,
  };
}

const USER_MESSAGE_SCHEMA = eventSchema(
  "user.message",
  objectPayloadSchema(
    {
      text: { type: "string" },
      activeCapabilityId: { type: "string" },
    },
    ["text"],
  ),
);

const SELECTED_BACKEND_CONTEXT_SCHEMA = eventSchema(
  "backend.context.selected",
  objectPayloadSchema(
    {
      capabilityId: { type: "string" },
      purpose: {
        type: "string",
        enum: ["reference_resolution", "result_interpretation"],
      },
      data: { $ref: "#/$defs/jsonValue" },
    },
    ["capabilityId", "purpose", "data"],
  ),
);

const CAPABILITY_ROUTE_RESULT_SCHEMA = eventSchema(
  "capability.route.result",
  objectPayloadSchema(
    {
      outcome: { const: "matched" },
      capabilityId: { type: "string" },
    },
    ["outcome", "capabilityId"],
  ),
);

const SLOT_CANDIDATES_PROPOSED_SCHEMA = eventSchema(
  "form.values.proposed",
  objectPayloadSchema(
    {
      capabilityId: { type: "string" },
      values: {
        type: "object",
        additionalProperties: { $ref: "#/$defs/jsonValue" },
      },
    },
    ["capabilityId", "values"],
  ),
);

const ASSISTANT_MESSAGE_SCHEMA = eventSchema(
  "assistant.message",
  objectPayloadSchema({ text: { type: "string" } }, ["text"]),
);

const OUT_OF_SCOPE_SCHEMA = eventSchema(
  "capability.route.out_of_scope",
  objectPayloadSchema({ message: { type: "string" } }, []),
);

const PROTOCOL_ERROR_SCHEMA = eventSchema(
  "protocol.error",
  objectPayloadSchema(
    {
      code: {
        type: "string",
        enum: [
          "invalid_event",
          "invalid_model_output",
          "unsupported_version",
          "internal_error",
        ],
      },
      message: { type: "string" },
      retryable: { type: "boolean" },
    },
    ["code", "message", "retryable"],
  ),
);

const BROWSER_EVENT_SCHEMAS = [
  USER_MESSAGE_SCHEMA,
  SELECTED_BACKEND_CONTEXT_SCHEMA,
] as const;

const SERVER_EVENT_SCHEMAS = [
  CAPABILITY_ROUTE_RESULT_SCHEMA,
  SLOT_CANDIDATES_PROPOSED_SCHEMA,
  ASSISTANT_MESSAGE_SCHEMA,
  OUT_OF_SCOPE_SCHEMA,
  PROTOCOL_ERROR_SCHEMA,
] as const;

function unionSchema(
  eventSchemas: readonly JsonSchema202012[],
): JsonSchema202012 {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: { jsonValue: JSON_VALUE_DEFINITION },
    oneOf: eventSchemas,
  };
}

const ajv = new Ajv2020({ allErrors: true });
const validateAnyEvent = ajv.compile(
  unionSchema([...BROWSER_EVENT_SCHEMAS, ...SERVER_EVENT_SCHEMAS]),
);
const validateBrowserEvent = ajv.compile(unionSchema(BROWSER_EVENT_SCHEMAS));
const validateServerEvent = ajv.compile(unionSchema(SERVER_EVENT_SCHEMAS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isJsonCompatible(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);

  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    const valid =
      keys.length === value.length &&
      value.every(
        (item, index) =>
          hasOwn(value, String(index)) && isJsonCompatible(item, ancestors),
      );
    ancestors.delete(value);
    return valid;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    ancestors.delete(value);
    return false;
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    ancestors.delete(value);
    return false;
  }

  const valid = Object.keys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor?.enumerable === true &&
      hasOwn(descriptor, "value") &&
      isJsonCompatible(descriptor.value, ancestors)
    );
  });

  ancestors.delete(value);
  return valid;
}

const CREDENTIAL_LIKE_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authentication",
  "authorization",
  "authtoken",
  "bearertoken",
  "clientsecret",
  "cookie",
  "credential",
  "credentials",
  "headers",
  "idtoken",
  "llmapikey",
  "password",
  "passwd",
  "privatekey",
  "proxyauthorization",
  "refreshtoken",
  "requestheaders",
  "responseheaders",
  "secret",
  "sessionid",
  "sessionsecret",
  "sessiontoken",
  "setcookie",
  "targetbackendcredential",
  "targetbackendcredentials",
  "token",
]);

function isCredentialLikeKey(key: string): boolean {
  return CREDENTIAL_LIKE_KEYS.has(
    key.toLowerCase().replace(/[^a-z0-9]/gu, ""),
  );
}

function containsCredentialLikeKey(value: JsonValue): boolean {
  if (Array.isArray(value)) {
    return value.some(containsCredentialLikeKey);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      isCredentialLikeKey(key) || containsCredentialLikeKey(nestedValue),
  );
}

function containsCredentialLikeProtocolData(
  event: RuntimeProtocolEvent,
): boolean {
  if (event.type === "backend.context.selected") {
    return containsCredentialLikeKey(event.payload.data);
  }

  if (event.type === "form.values.proposed") {
    return containsCredentialLikeKey(event.payload.values);
  }

  return false;
}

function validateEvent<Event extends RuntimeProtocolEvent>(
  value: unknown,
  validator: ValidateFunction,
): RuntimeProtocolValidationResult<Event> {
  try {
    if (
      isRecord(value) &&
      hasOwn(value, "protocolVersion") &&
      value.protocolVersion !== RUNTIME_PROTOCOL_VERSION
    ) {
      return {
        success: false,
        error: {
          code: "unsupported_version",
          message: "The runtime event uses an unsupported protocol version.",
        },
      };
    }

    if (!isJsonCompatible(value) || !validator(value)) {
      return {
        success: false,
        error: {
          code: "invalid_event",
          message: "The runtime event does not match the accepted protocol.",
        },
      };
    }

    const event = value as Event;
    if (containsCredentialLikeProtocolData(event)) {
      return {
        success: false,
        error: {
          code: "invalid_event",
          message:
            "The runtime event contains a prohibited credential-like field.",
        },
      };
    }

    return { success: true, event };
  } catch {
    return {
      success: false,
      error: {
        code: "invalid_event",
        message: "The runtime event does not match the accepted protocol.",
      },
    };
  }
}

/** Validates an untrusted event without assuming its protocol direction. */
export function validateRuntimeProtocolEvent(
  value: unknown,
): RuntimeProtocolValidationResult<RuntimeProtocolEvent> {
  return validateEvent(value, validateAnyEvent);
}

/** Validates untrusted data before browser-to-server application handling. */
export function validateBrowserToServerEvent(
  value: unknown,
): RuntimeProtocolValidationResult<BrowserToServerEvent> {
  return validateEvent(value, validateBrowserEvent);
}

/** Validates untrusted data before server-to-browser application handling. */
export function validateServerToBrowserEvent(
  value: unknown,
): RuntimeProtocolValidationResult<ServerToBrowserEvent> {
  return validateEvent(value, validateServerEvent);
}
