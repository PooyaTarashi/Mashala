# Project Status

## Current phase

**P1 implementation is in progress. ISSUE-015's confirmation gate is complete.**

ISSUE-001, ISSUE-002, ISSUE-003, ISSUE-010, ISSUE-011, ISSUE-012, ISSUE-013, ISSUE-014, and ISSUE-015 are complete. The repository now has a working single-package Next.js application scaffold, five typed static field-authoring primitives, deterministic form-to-JSON-Schema compilation, a deterministic React renderer for compiled forms, direct browser-side target-backend execution, and a deterministic confirmation boundary alongside the frozen v0.1 contracts.

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
- ISSUE-013 — typed client-side `CompiledForm` React component for all five static field kinds, editable isolated local state, deterministic IDs and field order, schema-derived required state and constraints, and valid-only local submission.
- Ajv 2020-12 submission validation with accessible field errors and a linked alert summary. Labels, help text, required indications, `aria-describedby`, and `aria-invalid` are covered by focused component tests.
- Static select values come only from schema enums while presentation labels come from `optionLabels`. Malformed schema/metadata correspondence fails as a deterministic developer error.
- ISSUE-014 — typed client-side `executeBackendOperation` API for canonical `POST`, `PUT`, and `PATCH` operations. It validates serialized operation shape and path constraints, resolves only within the supplied target-backend origin, sends one direct JSON request, preserves native responses for 2xx/non-2xx outcomes, and sanitizes rejected-fetch failures.
- The executor consumes an already validated value without renaming or adding properties. It accepts no custom headers or credentials and creates no Mashala API route or proxy.
- ISSUE-015 — typed client-side `ConfirmationGate` composition of `CompiledForm` and `executeBackendOperation`, with runtime-checked `ConfirmationPolicy = "required" | "none"`.
- Required operations move from an explicit valid form submission to an accessible review of a frozen same-property snapshot. A separate explicit confirmation executes that exact snapshot once; cancel/back discards it, and pending execution disables and guards repeated confirmation.
- The `none` policy skips only the second confirmation. It still executes exclusively from an explicit valid form submission, never as a render, mount, hydration, or unrelated state-change effect.
- Confirmation and target-backend execution remain deterministic browser behavior. Executor success, HTTP failure, and sanitized network failure remain distinct, and the Mashala server remains outside the target request path.
- Minimal Mashala page and server-render smoke test; no capability compiler, runtime protocol implementation, LLM, authentication integration, workflow engine, theme primitives, or reference-field behavior yet.

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

**Implement `defineCapability`** is the next unfinished roadmap task. It remains deliberately separate from the completed field/form compiler and confirmation boundary.

ISSUE-015 did not implement capability assembly or routing, authentication integration, runtime protocol transport/events, LLM/provider behavior, workflows, theming, mock-backend infrastructure, or reference fields. Those later tasks remain incomplete.
