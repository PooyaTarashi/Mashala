# Project Status

## Current phase

**P0 architecture finalization is complete. No application implementation has started.**

ISSUE-001, ISSUE-002, and ISSUE-003 are complete. The repository now has a frozen v0.1 stack, a canonical compiled spec contract, and a transport-independent browser/server event protocol.

## Accepted decisions

- Project name: **Mashala**.
- Mashala is a complete generated frontend application.
- Typed form DSL is the preferred authoring surface; its exact API remains a P1 task.
- The canonical compiled artifact is the versioned JSON-serializable `MashalaSpec` in `CANONICAL_SPEC.md`.
- JSON Schema Draft 2020-12 is the sole canonical form-validation representation; Mashala field metadata carries presentation/runtime information.
- v0.1 static fields are `text`, `longText`, `number`, `select`, and `boolean`.
- v0.1 capability writes declare `POST`, `PUT`, or `PATCH` plus a relative path. Form names map directly to same-named JSON body properties.
- Confirmation policy is declared per capability.
- The canonical field metadata union can later add a browser-resolved `reference` field without changing the top-level structure.
- Model-visible backend data has a named, non-serialized placeholder type, but ADR-010's projection/minimization mechanism and its eventual spec location remain deliberately unresolved. Automatic forwarding is forbidden.
- Runtime events use the versioned discriminated unions in `RUNTIME_PROTOCOL.md` and are independent of transport.
- LLM-produced routes and form values are untrusted proposals validated against declared capability IDs and JSON Schemas.
- Target-backend API calls execute entirely in the user's browser. The Mashala server is not a general proxy/BFF.
- Target-backend credentials are not part of the runtime protocol and must not be sent to the Mashala server or LLM.
- The LLM provider secret lives on the Mashala server.
- Target-app authentication belongs to the target app; Mashala integrates with it but does not define it.
- Deterministic code owns workflow transitions, form validation, confirmation, and side effects.
- LangGraph remains an implementation candidate, not an architectural dependency.
- Mashala defines build commands/output; developers choose CI/CD/deployment workflow.
- The v0.1 implementation stack is TypeScript, Node.js 24.x LTS, npm, React, Next.js App Router, Vitest, and Ajv.
- OpenAI through the Responses API is the first provider adapter; the exact model is server configuration.
- v0.1 uses ephemeral in-memory conversation state only and disables OpenAI Response storage. No database, ORM, or vector store is selected.

## P0 artifacts

- ADR-011 and `TECH_STACK.md` — frozen v0.1 implementation choices.
- ADR-012 and `CANONICAL_SPEC.md` — compiled spec types, invariants, limitations, and complete example.
- ADR-013 and `RUNTIME_PROTOCOL.md` — browser/server event types, trust rules, and end-to-end flow.

## Deliberately unresolved

- ADR-010's exact projection/minimization mechanism for model-visible backend results.
- The transport carrying runtime protocol events: HTTP, SSE, WebSocket, or a combination.
- The exact developer-facing DSL API.
- The exact future `reference` response-mapping shape.
- Durable conversation persistence beyond the v0.1 single-process proof.
- The first reference/demo domain.
- Primary thesis contribution wording and final research questions.

See `OPEN_QUESTIONS.md` for the complete current list.

## Recommended next task

**ISSUE-010 — Scaffold repository** is next. It should create the single-package Next.js/TypeScript structure, pin Node and dependency versions, and add lint/test/typecheck commands with no LLM integration.

P1 implementation has not begun as part of P0.
