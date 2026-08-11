# Browser/Server Runtime Protocol v0.1

## Purpose and authority

This document defines the smallest structured event contract between the Mashala browser client and Mashala server. ADR-013 records the decision.

The protocol carries language-assistance requests and proposals. It does not carry a command for the server to execute a target-backend operation.

The executable shared TypeScript unions and runtime validators live in `src/runtime-protocol.ts`. The transport-independent server adapters that map capability-routing and slot-extraction domain results to these events live in `src/server/runtime-protocol-events.ts`.

## Architectural boundaries

- Authenticated target-backend operations execute in the user's browser.
- The Mashala server is not a general proxy or BFF for those operations.
- Target-backend credentials are forbidden in all events, including nested generic data and error details.
- The LLM provider secret exists only in the Mashala server environment and is not a protocol value.
- LLM-derived capability IDs and field values are untrusted proposals.
- Deterministic code validates event shape, capability membership, field membership, JSON Schema constraints, confirmation, and legal workflow transitions.
- Target-backend content supplied for interpretation is untrusted data, not instructions.

## Transport independence

These are logical events, independent of HTTP, SSE, WebSocket, or another transport. A later transport decision must define framing, delivery, streaming, retries, reconnection, ordering across connections, and size limits without changing the event meanings.

Within one logical response, a transport must preserve event order. No stronger delivery guarantee is defined in P0.

## TypeScript contract

```ts
import type { JsonValue } from "./canonical-spec";

export interface RuntimeEvent<
  Type extends string,
  Payload extends object,
> {
  readonly protocolVersion: "0.1";
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

export type UserMessageEvent = RuntimeEvent<
  "user.message",
  {
    readonly text: string;

    /** Present for a follow-up utterance within an already selected capability. */
    readonly activeCapabilityId?: string;
  }
>;

export type SelectedBackendContextEvent = RuntimeEvent<
  "backend.context.selected",
  {
    readonly capabilityId: string;
    readonly purpose: "reference_resolution" | "result_interpretation";

    /** Explicitly selected/minimized untrusted data; never credentials. */
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

export type ProtocolErrorEvent = RuntimeEvent<
  "protocol.error",
  {
    readonly code:
      | "invalid_event"
      | "invalid_model_output"
      | "unsupported_version"
      | "internal_error";
    readonly message: string;
    readonly retryable: boolean;
  }
>;
```

The discriminants and payload shapes are normative. The executable implementation imports `JsonValue` through `src/spec.ts`, which re-exports the canonical JSON types.

`eventId` and `conversationId` are opaque Mashala identifiers. They must not reuse a target application's authentication token, cookie, credential-bearing session identifier, or provider response ID. `inReplyTo`, when present, names another Mashala `eventId`.

## Event semantics

### `user.message`

The browser sends a user's utterance for initial routing or for language help in an already active capability. `activeCapabilityId` is a hint that must name a declared capability; the server must reject or ignore an undeclared ID.

This event does not contain form state, target-backend session state, headers, cookies, or access tokens. The server may maintain the minimal ephemeral conversational context selected in ADR-011.

### `capability.route.result`

The server reports a matched declared capability. The server must validate model output against the loaded compiled spec before emitting this event. The browser validates the ID again before changing deterministic workflow state.

The event is a proposal to the browser, not permission to execute the capability.

### `form.values.proposed`

The server proposes zero or more candidate form values extracted from language. Values may be partial. The browser:

1. verifies that `capabilityId` exists and is the active capability;
2. drops or rejects keys not declared by the capability's form schema;
3. validates proposed values against the relevant property schemas;
4. merges only valid candidates into editable form state; and
5. computes required/missing fields from JSON Schema.

Missing-field state therefore needs no separate P0 event. The deterministic browser can render the form and validation feedback. An `assistant.message` may phrase a question, but it does not define which fields are required.

### `backend.context.selected`

This event carries data produced by ADR-016's explicit declarative projection for a language task that genuinely requires part of a browser-fetched backend result. `data` is minimized in the browser before the event is constructed. It must not contain authorization headers, cookies, bearer tokens, session identifiers used as credentials, or any other target-backend credential.

The descriptor is attached to the browser-executed read source and maps output properties to direct backend-result properties. Absence of that descriptor always means do not send. Malformed input and credential-like selected data fail closed, and the full response never reaches the server for server-side redaction.

### `assistant.message`

The server supplies user-visible natural-language text. It may explain a routing result or phrase a follow-up, but the text cannot change workflow state, validation, confirmation policy, or an operation binding.

### `capability.route.out_of_scope`

The server reports that no declared capability matches. It contains no generated operation or fallback URL. The optional message may help the user rephrase or explain the application's limits.

### `protocol.error`

The server reports a structured, sanitized failure. `message` must not expose secrets, credentials, raw provider responses containing sensitive context, or internal stack traces.

## End-to-end first-slice flow

Given the `transfer_money` capability from `CANONICAL_SPEC.md`:

1. The browser emits a `user.message`:

   ```json
   {
     "protocolVersion": "0.1",
     "eventId": "evt_001",
     "conversationId": "conv_001",
     "type": "user.message",
     "payload": {
       "text": "Send 250 to Sam instantly"
     }
   }
   ```

2. The server invokes the provider adapter. Deterministic server code validates the LLM output against the loaded spec and emits a routing result followed by candidate values:

   ```json
   {
     "protocolVersion": "0.1",
     "eventId": "evt_002",
     "conversationId": "conv_001",
     "inReplyTo": "evt_001",
     "type": "capability.route.result",
     "payload": {
       "outcome": "matched",
       "capabilityId": "transfer_money"
     }
   }
   ```

   ```json
   {
     "protocolVersion": "0.1",
     "eventId": "evt_003",
     "conversationId": "conv_001",
     "inReplyTo": "evt_001",
     "type": "form.values.proposed",
     "payload": {
       "capabilityId": "transfer_money",
       "values": {
         "recipient": "Sam",
         "amount": 250,
         "speed": "instant"
       }
     }
   }
   ```

3. The browser confirms that `transfer_money` is declared, rejects unknown candidate keys, and validates candidate values with the capability's JSON Schema.
4. Deterministic browser code renders the developer-declared form. The user can review and edit all candidate values.
5. Because the compiled capability says `confirmation: "required"`, the browser cannot advance to execution until the user explicitly confirms a complete valid form.
6. The browser constructs the direct JSON body `{ "recipient": "Sam", "amount": 250, "speed": "instant" }` and calls `POST /transfers` on the target backend with the target app's browser-side authentication context.
7. The target backend authorizes and processes the operation. The Mashala server is not in this request path, and no protocol event asks it to proxy the call.

If the backend result can be displayed deterministically, it remains in the browser. Only a language-interpretation need governed by an explicit ADR-016 projection descriptor may produce `backend.context.selected`.

## Deliberately absent from v0.1

- a target-backend execution request or command;
- target-backend request headers, cookies, credentials, or tokens;
- LLM provider credentials;
- arbitrary API-response forwarding;
- transport framing and endpoint URLs;
- streaming token events;
- server-directed workflow transitions;
- autonomous API planning or chaining;
- cascading reference-field events;
- durable conversation persistence semantics.
