# Project Status

## Current phase

**P2 LLM integration is complete through the executable runtime-protocol boundary. ISSUE-020's provider boundary, ISSUE-021's capability router, ISSUE-022's slot extractor, and ISSUE-023's executable protocol contracts are complete.**

ISSUE-001, ISSUE-002, ISSUE-003, ISSUE-010, ISSUE-011, ISSUE-012, ISSUE-013, ISSUE-014, ISSUE-015, ISSUE-016, ISSUE-020, ISSUE-021, ISSUE-022, and ISSUE-023 are complete. The repository now has a working single-package Next.js application scaffold, five typed static field-authoring primitives, deterministic form-to-JSON-Schema compilation, canonical capability assembly, a deterministic React renderer for compiled forms, direct browser-side target-backend execution, a deterministic confirmation boundary, a server-only provider-neutral LLM boundary with a Google Gemini implementation, deterministic allow-listed capability routing, partial slot extraction with declared-key and JSON Schema validation, and transport-independent runtime events with deterministic validation of untrusted data.

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
- ADR-013 and `RUNTIME_PROTOCOL.md` define the protocol design; `src/runtime-protocol.ts` now provides the corresponding executable versioned discriminated unions and strict runtime validators, independent of transport.
- LLM-produced routes and form values are untrusted proposals validated against declared capability IDs and JSON Schemas.
- Target-backend API calls execute entirely in the user's browser. The Mashala server is not a general proxy/BFF.
- Target-backend credentials are not part of the runtime protocol and must not be sent to the Mashala server or LLM.
- The LLM provider secret lives on the Mashala server.
- Target-app authentication belongs to the target app; Mashala integrates with it but does not define it.
- Deterministic code owns workflow transitions, form validation, confirmation, and side effects.
- LangGraph remains an implementation candidate, not an architectural dependency.
- Mashala defines build commands/output; developers choose CI/CD/deployment workflow.
- The v0.1 implementation stack is TypeScript, Node.js 24.x LTS, npm, React, Next.js App Router, Vitest, and Ajv.
- Google Gemini through the native non-streaming `generateContent` REST API is the first provider adapter under ADR-015; the exact model is server configuration.
- Gemini-specific request/response shapes remain inside its adapter. Mashala code sees only provider-neutral structured request/result/error types, and callers remain responsible for deterministic output validation.
- v0.1 uses ephemeral in-memory conversation state only and no persistent provider session. No database, ORM, or vector store is selected.

## P0 artifacts

- ADR-011, ADR-015, and `TECH_STACK.md` — frozen v0.1 implementation choices and the superseding first-provider decision.
- ADR-012 and `CANONICAL_SPEC.md` — compiled spec types, invariants, limitations, and complete example.
- ADR-013 and `RUNTIME_PROTOCOL.md` — normative browser/server protocol design, trust rules, and end-to-end flow. Its executable contracts live in `src/runtime-protocol.ts`.

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
- ISSUE-016 — typed `defineCapability` API compiling the existing static field DSL into one canonical `CapabilitySpec` that binds stable identity and routing description to its form, operation, and deterministic confirmation policy.
- Executable `MashalaSpec`, `AppMetadata`, `CapabilitySpec`, `BackendOperation`, and `ConfirmationPolicy` types now mirror ADR-012. Form types are reused, and executor/confirmation modules no longer redefine shared canonical concepts.
- `ConfirmationGate` consumes a complete `CapabilitySpec`, making bound capability execution the normal integration path while `executeBackendOperation` remains a lower-level primitive.
- The executable `transfer_money` and Mashala Bank Demo spec match the documented canonical example and remain isolated JSON-serializable plain data.
- Minimal Mashala page and server-render smoke test. At ISSUE-016 completion there was no runtime protocol implementation, capability routing, LLM, authentication integration, workflow engine, theme primitives, or reference-field behavior.

## P2 implementation

- ISSUE-020 — a small `LlmProvider.generateStructured` interface accepts model instructions, user input, and a Mashala-owned JSON output schema, then returns either parsed untrusted JSON or a deterministic sanitized failure.
- The first adapter calls `POST /v1beta/models/{model}:generateContent` using Gemini-native `systemInstruction`, `contents`/`parts`, and `generationConfig.responseJsonSchema` internally.
- `GEMINI_API_KEY` is read only by a `server-only` module and sent only in `X-goog-api-key`; `GEMINI_MODEL` is also server configuration. `.env.example` contains names/default guidance but no credential.
- The provider request contract has no target-backend operation, header, or credential field. No provider result exposes the key, raw provider error, candidate metadata, or provider-native response object.
- Injected `fetch` and provider-interface fakes cover the boundary without a real Gemini key or network call.
- Provider failures are normalized as `invalid_configuration`, `provider_failure`, or `invalid_response`, with a deterministic retryable flag.
- No routing, slot extraction, browser/server transport, streaming, persistent provider session, or target-backend behavior is part of ISSUE-020.
- ISSUE-021 — the server-only `routeCapability` API supplies the provider with only the user's utterance plus each declared capability's stable ID and routing description.
- The provider proposes either `matched` with a capability ID or explicit `out_of_scope`. Mashala validates the exact output shape, rejects undeclared IDs, and returns the original declared `CapabilitySpec` object for a valid match.
- Routing errors distinguish malformed model output, unknown capability IDs, and normalized provider failures. Routing does not inspect or execute backend operations and does not alter forms or confirmation policy.
- ISSUE-021 adds no runtime transport/events, slot extraction, workflow, backend execution, or Gemini-specific routing contract.
- ISSUE-022 — the server-only `extractSlotCandidates` API receives the selected `CapabilitySpec`, utterance, and provider-neutral LLM dependency, then returns partial validated candidate values or a structured extraction error.
- The model sees field names, labels/help text, select value labels, and property-level JSON Schema constraints. It does not receive capability identity/description, operation, confirmation policy, authentication state, credentials, or backend results.
- Mashala rejects malformed output and every undeclared key, then validates the proposal with the selected form schema while omitting only the root `required` list so unrelated missing fields remain allowed. Full `CompiledForm` validation is unchanged.
- Extracted values are frozen proposals compatible with `CompiledForm.initialValues`; they remain editable and cause no submission, confirmation, target-backend request, or workflow transition.
- ISSUE-022 adds no runtime transport/events, backend execution, confirmation, RAG, reference fields, or provider-specific extraction contract.
- ISSUE-023 — executable `RuntimeEvent`, `BrowserToServerEvent`, and `ServerToBrowserEvent` discriminated unions exactly represent ADR-013's seven event types.
- Shared Ajv 2020-12 validators reject unsupported versions, unknown event types, missing or extra envelope/payload fields, malformed JSON values, direction mismatches, and credential-like fields in generic selected context or proposed values before application handling.
- Server-only mapping functions convert ISSUE-021 matched/out-of-scope/error results to `capability.route.result`, `capability.route.out_of_scope`, or `protocol.error`, and ISSUE-022 proposed/error results to `form.values.proposed` or `protocol.error`.
- Protocol construction hard-codes version `0.1`, preserves Mashala event correlation fields, exposes no credential/header/secret property, and contains no backend-execution event. No endpoint, streaming mechanism, socket, polling, or other transport was selected.

## Deliberately unresolved

- ADR-010's exact projection/minimization mechanism for model-visible backend results.
- The transport carrying runtime protocol events: HTTP, SSE, WebSocket, or a combination.
- The optional application-level authoring helper beyond the executable `MashalaSpec` type.
- The exact future `reference` response-mapping shape.
- Durable conversation persistence beyond the v0.1 single-process proof.
- The first reference/demo domain.
- Primary thesis contribution wording and final research questions.

See `OPEN_QUESTIONS.md` for the complete current list.

## Recommended next task

**Implement `f.reference` (ISSUE-030)** is the recommended next backlog task.

ISSUE-023 did not implement authentication integration, runtime protocol transport, workflows, theming, mock-backend infrastructure, RAG, or reference fields. Those later tasks remain incomplete.
