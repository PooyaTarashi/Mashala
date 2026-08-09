# ADR-013 — Transport-independent browser/server protocol v0.1

**Status:** Accepted

## Context

The Mashala browser and server need structured messages for language routing and slot extraction, but the first vertical slice does not yet justify committing to HTTP, SSE, WebSocket, or a combination. The protocol must preserve the browser/server and deterministic/LLM trust boundaries established by ADR-003, ADR-005, ADR-007, and ADR-010.

## Decision

Define a versioned, transport-independent event protocol as discriminated TypeScript unions. The normative event types and flow are in `docs/RUNTIME_PROTOCOL.md`.

The browser may send:

- a user message; and
- explicitly selected/minimized backend-result context when a language task requires it.

The server may return:

- a declared capability routing proposal;
- candidate form values;
- assistant text;
- an out-of-scope result; or
- a structured protocol/runtime error.

LLM-derived routing and candidate values remain untrusted proposals. The browser checks capability IDs and field names against the compiled spec and validates values with the declared form schema.

There is deliberately no event that instructs the Mashala server to execute a target-backend operation. After deterministic validation and any required confirmation, the browser calls the declared target backend directly.

Target-backend credentials are prohibited in every event, including generic context values and error details. LLM provider credentials remain internal to the server and are not protocol fields.

## Consequences

- HTTP request/response, SSE, WebSocket, or another transport can carry the same logical events later.
- Delivery, streaming, reconnection, ordering across connections, and retry semantics remain transport concerns and are unresolved.
- The protocol can represent selected backend context without deciding ADR-010's projection/minimization mechanism.
- Backend context transfer must remain disabled until an explicit policy is declared and enforced; arbitrary API responses may not be forwarded.
