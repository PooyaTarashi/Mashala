# Project Status

## Current phase

**P1 implementation is in progress. ISSUE-012's form compiler is complete.**

ISSUE-001, ISSUE-002, ISSUE-003, ISSUE-010, ISSUE-011, and ISSUE-012 are complete. The repository now has a working single-package Next.js application scaffold, five typed static field-authoring primitives, and deterministic form-to-JSON-Schema compilation alongside the frozen v0.1 contracts.

## Accepted decisions

- Project name: **Mashala**.
- Mashala is a complete generated frontend application.
- The basic typed field DSL exposes `f.text`, `f.longText`, `f.number`, `f.select`, and `f.boolean` with deterministic JSON-serializable field-level output.
- `compileForm` compiles those primitives into the canonical `FormDefinition` schema/metadata split. Fields are optional by default and opt into required status with `required: true`.
- String length constraints, numeric limits, required names, primitive types, and select enum values exist only in JSON Schema; compiled field metadata retains presentation information only.
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

## P1 implementation

- ISSUE-010 — single-package Next.js App Router scaffold with pinned Node/npm and dependency versions.
- Conventional development, production-start, build, lint, strict typecheck, and one-shot test commands.
- ISSUE-011 — typed static field builders with canonical field kinds, presentation labels/help text, typed select options, deterministic output, and focused unit/type-level coverage.
- ISSUE-012 — typed `compileForm` API that emits object-root JSON Schema Draft 2020-12 and same-keyed Mashala field metadata, with deterministic ordering and frozen isolated output.
- Ajv 2020-12 validation coverage for required/optional fields, primitive types, unknown properties, select enums, string lengths, and numeric limits.
- Minimal Mashala page and server-render smoke test; no form renderer, capability compiler, runtime protocol implementation, LLM, authentication, or target-backend execution behavior yet.

## Deliberately unresolved

- ADR-010's exact projection/minimization mechanism for model-visible backend results.
- The transport carrying runtime protocol events: HTTP, SSE, WebSocket, or a combination.
- The capability-level developer-facing DSL API beyond the completed field and form compiler.
- The exact future `reference` response-mapping shape.
- Durable conversation persistence beyond the v0.1 single-process proof.
- The first reference/demo domain.
- Primary thesis contribution wording and final research questions.

See `OPEN_QUESTIONS.md` for the complete current list.

## Recommended next task

**ISSUE-013 — Render compiled form** is next. It should render the completed canonical `FormDefinition` with accessible labels, editable values, validation errors, and responsive layout.

ISSUE-012 did not implement rendering, capability compilation, API execution, or any later runtime behavior. ISSUE-013 and all later implementation issues remain incomplete.
