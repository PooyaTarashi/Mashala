# Project Status

## Current phase

**P6 read capabilities, browser execution, deterministic result rendering, and the integrated read workflow are implemented.**

ISSUE-001, ISSUE-002, ISSUE-003, ISSUE-010, ISSUE-011, ISSUE-012, ISSUE-013, ISSUE-014, ISSUE-015, ISSUE-016, ISSUE-020, ISSUE-021, ISSUE-022, ISSUE-023, ISSUE-030, ISSUE-031, ISSUE-032, ISSUE-040, ISSUE-041, ISSUE-042, ISSUE-043, ISSUE-044, ISSUE-045, ISSUE-046, ISSUE-047, ISSUE-048, ISSUE-049, ISSUE-050, and ISSUE-053 are complete. The repository now has a working single-package Next.js application scaffold, five typed static field-authoring primitives plus `f.reference`, deterministic form-to-JSON-Schema compilation, canonical capability assembly, a deterministic React renderer for compiled forms, direct browser-side target-backend read/write execution through a target-app-owned request integration, a deterministic confirmation boundary, explicit browser-side backend-data projection, a server-only provider-neutral LLM boundary with a Google Gemini implementation, deterministic allow-listed capability routing, partial slot extraction with declared-key and JSON Schema validation, transport-independent runtime events with deterministic validation of untrusted data, an isolated containerized Python/FAISS subsystem, a versioned Mashala-owned RAG artifact contract, deterministic Markdown ingestion with stable provenance, offline local embedding plus exact-index artifact serialization, a CI-independent containerized RAG build command, cached runtime loading of prebuilt artifacts, a persistent retrieval-only JSON/HTTP service, a provider-neutral Node retrieval client with an injectable fake, a grounded documentation knowledge-answer flow with explicit insufficient-context behavior, a validated application/runtime assembly that keeps browser data separate from server dependencies, a strict non-streaming HTTP boundary for canonical runtime events, and a minimal accessible chat/form page for one happy-path transaction.

ISSUE-051, ISSUE-052, and ISSUE-054 are also complete. The classifier adds the documentation
handoff, while the page-owned transition table hardens the transaction flow
against stale, cancelled, duplicate, and concurrent actions. Playwright now
exercises the production page with deterministic local runtime and target-backend
fixtures and no live provider, RAG, credential, or external-service dependency.

ISSUE-060, ISSUE-061, ISSUE-062, and ISSUE-063 are complete. ADR-017 and
`CANONICAL_SPEC.md` v0.3 accept the read-capability and deterministic result-view
contract. The executable TypeScript canonical spec is now v0.3, with typed read
authoring, deterministic input/binding validation, and direct browser GET
execution. The deterministic result DSL/compiler now emits validated, isolated
card or repeated-card metadata with the closed formatter allowlist. The page
now executes routed reads, collects declared input when present, and renders
validated results inline through those declarations.

## Accepted decisions

- Project name: **Mashala**.
- Mashala is a complete generated frontend application.
- The typed field DSL exposes `f.text`, `f.longText`, `f.number`, `f.select`, `f.boolean`, and browser-resolved `f.reference` with deterministic JSON-serializable field-level output.
- `compileForm` compiles those primitives into the canonical `FormDefinition` schema/metadata split. Fields are optional by default and opt into required status with `required: true`.
- String length constraints, numeric limits, required names, primitive types, and select enum values exist only in JSON Schema; compiled field metadata retains presentation information only.
- The accepted and executable canonical artifact is the versioned
  JSON-serializable `MashalaSpec` v0.3 in `CANONICAL_SPEC.md`.
- JSON Schema Draft 2020-12 is the sole canonical form-validation representation; Mashala field metadata carries presentation/runtime information.
- v0.1 static fields are `text`, `longText`, `number`, `select`, and `boolean`.
- v0.1 capability writes declare `POST`, `PUT`, or `PATCH` plus a relative path. Form names map directly to same-named JSON body properties.
- Confirmation policy is declared per capability.
- ADR-017 makes v0.3 capabilities an explicit `kind: "write" | "read"` union.
  Existing writes retain their form, JSON-body operation, and confirmation
  behavior; reads declare exactly one browser-executed `GET`, optional compiled
  input, and no confirmation property.
- Read authoring is `defineReadCapability`; the existing `defineCapability`
  remains the write authoring API. Result authoring is limited to
  `result.card` and `result.cardList`.
- Read input properties bind exactly once through explicit path-placeholder or
  query-parameter maps. Only schema-valid scalar values are deterministically
  serialized and percent-encoded; the LLM cannot supply any URL structure.
- Read results support only a root object card or root array card list, direct
  response properties, fixed developer text, and the closed `text`, `number`,
  `currency`, `date`, `dateTime`, and `imageUrl` formatter allowlist.
- Wrapped/paginated arrays, response unwrapping, arbitrary transformations,
  and generated UI are deferred. Display mappings do not grant model
  visibility; only ADR-016 projection may do so.
- The canonical field metadata union includes a browser-resolved `reference` field with one GET source and direct string value/label property projections, without changing the top-level structure.
- ADR-016 resolves ADR-010 with an optional declarative `modelContext` descriptor on browser read sources. Its output-to-source direct-property map is the only authorization for model-visible backend data; automatic forwarding remains forbidden.
- ADR-013 and `RUNTIME_PROTOCOL.md` define the protocol design; `src/runtime-protocol.ts` now provides the corresponding executable versioned discriminated unions and strict runtime validators, independent of transport.
- LLM-produced routes and form values are untrusted proposals validated against declared capability IDs and JSON Schemas.
- Target-backend API calls execute entirely in the user's browser. The Mashala server is not a general proxy/BFF.
- Target-backend credentials are not part of the runtime protocol and must not be sent to the Mashala server or LLM.
- The LLM provider secret lives on the Mashala server.
- Target-app authentication belongs to the target app. Mashala's `TargetBackendRequest` callable carries browser request behavior shared by reads and writes; it does not carry serialized credentials or define login, refresh, or persistence.
- Deterministic code owns workflow transitions, form validation, confirmation, and side effects.
- LangGraph remains an implementation candidate, not an architectural dependency.
- Mashala defines build commands/output; developers choose CI/CD/deployment workflow.
- The v0.1 implementation stack is TypeScript, Node.js 24.x LTS, npm, React, Next.js App Router, Vitest, and Ajv.
- Google Gemini through the native non-streaming `generateContent` REST API is the first provider adapter under ADR-015; the exact model is server configuration.
- Gemini-specific request/response shapes remain inside its adapter. Mashala code sees only provider-neutral structured request/result/error types, and callers remain responsible for deterministic output validation.
- v0.1 uses ephemeral in-memory conversation state only and no persistent provider session. No database, ORM, or vector database is selected.
- ADR-014 places documentation indexing and retrieval behind an isolated Python container boundary. FAISS is the initial internal implementation and is not exposed to Node/Next.js.
- The offline RAG artifact contract is plain JSON manifest version `1.0`; consumers accept only explicitly supported versions and require exact embedding provider/model/dimension/configuration compatibility.
- The Python RAG runtime exposes only `POST /retrieve`, loads one compatible artifact/index state at startup, uses the recorded `search_query` Ollama embedding space, and returns plain chunk identity/content/provenance/score results.
- Node runtime code depends on `DocumentationRetriever`, which accepts only query text and optional top-k and returns Mashala-owned chunks or normalized failures. The concrete server-only client contains the ISSUE-046 HTTP transport and exposes no Python/FAISS types.
- Documentation answering uses `DocumentationRetriever` before `LlmProvider`, bounds the model-visible ranked chunk selection, and treats questions/chunks as untrusted data. Grounded provider output must cite selected chunk IDs that Mashala binds back to retrieval provenance; absent support is explicit.
- `mashala.config.ts` is the application-level configuration path. It calls `defineMashalaApplication` with `AppMetadata` and existing `CapabilitySpec` values and exports one validated, isolated `MashalaSpec`; it defines no parallel canonical schema.
- `assembleMashalaApplication` lives in the `server-only` module `src/server/application-runtime.ts`. It validates the supplied spec, requires provider-neutral `LlmProvider` and `DocumentationRetriever` instances, keeps them outside serializable application data, and resolves capabilities only from the validated developer declaration.

## Authoritative architecture artifacts

- ADR-011, ADR-015, and `TECH_STACK.md` — frozen v0.1 implementation choices and the superseding first-provider decision.
- ADR-012, ADR-016, ADR-017, and `CANONICAL_SPEC.md` — compiled spec types,
  explicit projection policy, read/write capability contract, deterministic
  result views, invariants, limitations, and complete examples.
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
- The model sees field names, labels/help text, select value labels, and property-level JSON Schema constraints. When ISSUE-032 supplies a validated matching `backend.context.selected` event, it may additionally receive only that projected data as explicitly labeled untrusted input. It does not receive operation, confirmation policy, authentication state, credentials, or full backend results.
- Mashala rejects malformed output and every undeclared key, then validates the proposal with the selected form schema while omitting only the root `required` list so unrelated missing fields remain allowed. Full `CompiledForm` validation is unchanged.
- Extracted values are frozen proposals compatible with `CompiledForm.initialValues`; they remain editable and cause no submission, confirmation, target-backend request, or workflow transition.
- ISSUE-022 adds no runtime transport/events, backend execution, confirmation, RAG, reference fields, or provider-specific extraction contract.
- ISSUE-023 — executable `RuntimeEvent`, `BrowserToServerEvent`, and `ServerToBrowserEvent` discriminated unions exactly represent ADR-013's seven event types.
- Shared Ajv 2020-12 validators reject unsupported versions, unknown event types, missing or extra envelope/payload fields, malformed JSON values, direction mismatches, and credential-like fields in generic selected context or proposed values before application handling.
- Server-only mapping functions convert ISSUE-021 matched/out-of-scope/error results to `capability.route.result`, `capability.route.out_of_scope`, or `protocol.error`, and ISSUE-022 proposed/error results to `form.values.proposed` or `protocol.error`.
- Protocol construction hard-codes version `0.1`, preserves Mashala event correlation fields, exposes no credential/header/secret property, and contains no backend-execution event. No endpoint, streaming mechanism, socket, polling, or other transport was selected.

## P3 implementation

- ISSUE-030 — `f.reference` declares presentation metadata, one root-relative GET source, and direct `value`/`labelFrom` response-item properties.
- `compileForm` emits a string JSON Schema property plus plain serializable `reference` runtime metadata. It copies only method/path source data and contains no headers or credentials.
- `resolveReferenceOptions` performs the declared GET directly through the browser fetch boundary, requires a root response array, and rejects the complete result for malformed items or duplicate projected values.
- `CompiledForm` renders loading, failure, and resolved select states. A selected value must belong to the successfully resolved options in addition to passing the unchanged full-form JSON Schema validation.
- Reference resolution does not execute a write. `ConfirmationGate` passes the same `TargetBackendRequest` callable through to reads and confirmed writes without changing canonical data.
- Reference fields remain omitted from model-inventable slot-extraction contracts. Projected context may inform language interpretation but does not itself authorize a reference value or operation.
- ISSUE-031 — a callable `TargetBackendRequest` interface lets the target app inject its existing authenticated browser request behavior. Ordinary browser `fetch` remains the default.
- The integration is behavior-only and exists outside `MashalaSpec`, `CapabilitySpec`, field metadata, runtime protocol events, and server/LLM state. Mashala defines no credential or token-storage property.
- `createDemoCookieSessionRequest` is a minimal sample that applies the target app's cookie-session behavior with `credentials: "include"`; focused tests exercise it against a mock target backend for both GET and POST requests.
- Target HTTP failures, including unauthenticated `401` responses, retain the existing executor/reference failure behavior. Mashala does not add login, refresh, retry, or authorization policy.
- ISSUE-032 — `source.modelContext` declares ADR-016's purpose and output-to-source direct-property allowlist. The field DSL/compiler isolate it as frozen JSON and reject empty, malformed, credential-like, or authentication-like declarations.
- The client-only projector accepts only root objects or arrays of objects, copies only own direct selected properties, clones selected values as plain JSON, rejects missing/non-serializable/credential-bearing results, and returns no event when the descriptor is absent or projection fails.
- `resolveReferenceOptions` applies option projection and optional model-context projection to the same browser response. It returns only the minimized context alongside deterministic options and never performs a second request.
- `createSelectedBackendContextEvent` and its already-projected-data variant construct only the accepted `backend.context.selected` shape. Full backend results do not enter the event, and the runtime protocol independently rejects credential-like context keys.
- `extractSlotCandidates` validates the incoming context event and capability binding before provider use. It places only purpose/data in the provider input under `trust: "untrusted"`; context never enters system instructions, output schema, operation, confirmation, authorization, workflow, or execution state.

## P4 implementation

- ISSUE-040 — `rag/` is a standalone Docker build context containing the complete Python environment. The main Node package has no Python, pip, virtualenv, or FAISS dependency or script.
- The image pins Python 3.13.14 through an immutable official-image digest and installs exact `faiss-cpu`, `numpy`, and `packaging` versions from `requirements.lock` without resolving undeclared transitive packages.
- Image construction runs an internal health/version command that imports FAISS and verifies every installed version. The same command is the non-networked container entry point.
- The container exposes no port or Node transport and contains no target-backend client, credential input, conversational LLM client, capability routing, slot extraction, confirmation, or workflow behavior.
- ISSUE-040 adds no Markdown ingestion, embedding, index building, artifact contract, retrieval endpoint/service, or Node-to-Python communication.
- ISSUE-041 — `rag/src/mashala_rag/artifact_contract.py` defines strict manifest validation and deterministic error codes without loading any referenced files.
- Manifest `1.0` contains embedding identity/configuration, chunk count/content/identity, per-chunk source provenance, an exact retrieval-ID-to-chunk mapping, and a variable-length list of checksummed opaque retrieval-index artifact descriptors.
- `docs/RAG_ARTIFACT_CONTRACT.md` is the normative contract description. Neither the manifest nor Node exposes FAISS class names, index types, or serialization details.
- Dependency-free Python contract tests run during the RAG image build. ISSUE-041 adds no Markdown loading/chunking, embedding call, index construction, build command, artifact loading, retrieval service, or Node retrieval client.
- ISSUE-042 — `rag/src/mashala_rag/markdown_ingestion.py` loads configured relative Markdown files or recursively expanded directories below one documentation root, failing explicitly for invalid, unavailable, unreadable, duplicate, or malformed documents.
- Normalization is LF/NFC/trailing-whitespace canonicalization. Heading-bounded, block-aware greedy chunking uses a configurable character target while keeping fenced code and oversized individual blocks intact.
- Chunks use ISSUE-041 `ArtifactChunk`/`ChunkProvenance`, carry stable source/chunk SHA-256 identities, normalized source line bounds, source URI/digest/title, and heading paths where available.
- ISSUE-042 adds no Ollama call, embedding execution, FAISS index construction, artifact serialization, build CLI, artifact loading, runtime retrieval, retrieval service, or Node communication.
- ISSUE-043 — the private RAG Ollama client batches `search_document`-prefixed chunks through local `POST /api/embed` using `nomic-embed-text:v1.5`, disables silent truncation, validates finite vectors and the configured dimension, and performs deterministic L2 normalization without any API key or cloud fallback.
- Manifest 1.0 records provider/model/dimension plus document/query prefixes, normalization, and truncation settings. The builder uses exact FAISS `IndexFlatIP`, sequential opaque retrieval mappings, canonical JSON, and a checksummed opaque `retrieval/index.bin` artifact.
- Failures distinguish Ollama unavailability, missing local model, malformed responses, dimension/count mismatches, index construction/serialization, metadata serialization, and artifact writes. Mocked Ollama tests need no live model or developer API key.
- ISSUE-043 adds no `mashala rag build` command, artifact loader, query embedding/runtime retrieval, retrieval service, or Node retrieval client.
- ISSUE-044 — `mashala rag build` resolves configurable host documentation and artifact directories, checks the Docker daemon and exact local Ollama model, builds the checked-in RAG context under versioned image tag `mashala-rag-builder:0.1.0`, and runs the private builder container.
- Documentation is mounted read-only at `/workspace/docs`; artifacts are bind-mounted writable at `/workspace/output`. Native Linux loopback Ollama uses host networking, Docker Desktop uses `host.docker.internal`, and configured remote origins pass through unchanged.
- Container stdout/stderr remains visible, non-zero image/container results become CLI failures, and success reports the canonical host output path plus document, chunk, and artifact-format counts from the generated manifest.
- ISSUE-044 adds no artifact loader, retrieval service, Node retrieval client, runtime query execution, knowledge-answer flow, or CI/CD provider integration.
- ISSUE-045 — `RagArtifactLoader` reads `manifest.json`, applies the ISSUE-041 contract plus exact expected embedding compatibility, verifies every declared artifact path/size/SHA-256 digest, and asks the private FAISS reader to deserialize the already-built index.
- Loaded index dimension/training state/count must agree with manifest embedding and retrieval mappings. Validated chunks, full provenance, and retrieval-ID mappings remain available in one `LoadedRagArtifacts` state.
- Each loader instance caches its first successful state under a lock, so one runtime/service lifecycle reuses the same FAISS index. The loader imports no Markdown ingestion, embedding, or index-building path.
- ISSUE-045 adds no query embedding/search, retrieval endpoint/service, Node retrieval client, or knowledge-answer flow.
- ISSUE-046 — `RagRetrievalService` constructs around one cached ISSUE-045 loader state, validates the query embedder against the complete artifact embedding identity, and uses local Ollama `search_query` embeddings for exact top-k FAISS search.
- The JSON-over-HTTP transport accepts only `POST /retrieve` with a non-empty `query` and optional bounded `topK`. It rejects unknown fields and returns only plain chunk identity, content, provenance, and score data; malformed input, Ollama failures, incompatible responses, and index failures have stable sanitized errors.
- Deterministic tests exercise the checked-in two-chunk artifact and real FAISS index through the persistent HTTP server, prove one-time index loading/reuse, verify query prefixes, ranking/top-k/provenance, and cover request, embedding, compatibility, and retrieval failures.
- ISSUE-046 adds no Node retrieval client, Gemini/conversational answering, capability routing, slot extraction, workflow/confirmation behavior, target-backend operation, credential field, automatic RAG routing, or browser interaction.
- ISSUE-047 — `DocumentationRetriever` accepts only query text and optional bounded top-k, then returns normalized chunk identity/content/provenance/score data or a small sanitized failure union.
- `createPythonRagRetriever` is a server-only `POST /retrieve` adapter with strict response validation, a 65-second default abort timeout aligned beyond the Python service's configured embedding timeout, and no retry or target-backend dependency. `createFakeDocumentationRetriever` provides static or handler-driven replacement for Node tests and ISSUE-048.
- ISSUE-047 adds no knowledge-answer prompt/flow, automatic question classification, RAG indexing/build changes, runtime protocol event, workflow/confirmation change, or target-backend behavior.
- ISSUE-048 — `answerDocumentationQuestion` requests ranked chunks through `DocumentationRetriever`, validates the result, and selects at most three of five requested chunks before invoking `LlmProvider.generateStructured`.
- Static Mashala instructions and JSON-serialized untrusted question/documentation data remain separate. Grounded output must name selected chunk IDs; Mashala retains their provenance without putting provenance or unselected chunks in the prompt.
- Empty retrieval and model-declared insufficient support are explicit `insufficient_context` outcomes. Retrieval, provider, and malformed-boundary failures remain distinct. The input and result contracts contain no target-backend operation, capability, confirmation, workflow, request callable, or credential.
- Fake-only unit tests cover ordering and selection, provenance, empty and model-insufficient support, malformed retrieval/model results, retrieval/provider failures, malicious instruction-like documentation, and absence of target-backend execution. These tests prove the boundary, not general RAG quality.

## P5 implementation

- ISSUE-053 — `defineMashalaApplication` is the single application-level helper for canonical app metadata plus capabilities. It assigns spec version `0.2`, validates the complete compiled spec, rejects unknown configuration keys, and returns frozen isolated JSON data.
- The repository application definition is `mashala.config.ts` and declares the existing `transfer_money` fixture. Its serializable output contains only `specVersion`, `app`, and `capabilities`.
- The server-only `assembleMashalaApplication` boundary requires the validated application plus `LlmProvider` and `DocumentationRetriever` instances. Missing definitions, malformed/incompatible specs, malformed capabilities, and missing dependencies use stable sanitized errors.
- Runtime capability lookup returns only declarations from the validated spec. No target-backend credential, proxy setting, request transformation, transport, UI, classifier, workflow orchestration, or new RAG/auth behavior was added.
- ISSUE-049 — `POST /api/runtime` accepts exactly one validated `user.message` or `backend.context.selected` in `{ "event": ... }` and returns validated canonical server events in the ordered `{ "events": [...] }` frame.
- New matched user messages return routing before extraction; active-capability messages and selected backend context use the existing capability-bound extraction path. Accepted conversation and reply correlation is preserved with server-generated Mashala event IDs.
- Malformed JSON/framing/direction, unsupported versions, credential-bearing input, and unexpected failures produce canonical sanitized `protocol.error` events. The route adds no target-backend fetch/proxy, workflow orchestration, classifier, SSE, WebSocket, or streaming behavior.
- ISSUE-050 — `MashalaChat` sends canonical `user.message` events with visible pending/failure state, prevents duplicate pending submissions, and renders route, proposal, assistant, out-of-scope, and protocol-error outcomes distinctly.
- Browser handling resolves route IDs only through the assembled spec and reuses the deterministic partial-form proposal validator shared with slot extraction. Only valid declared values become editable `ConfirmationGate` initial state; operations and confirmation policy always come from the compiled capability.
- The transfer integration proof reaches the editable compiled form, required review, explicit confirmation, and one direct browser-side `POST /transfers`. Chat transport never receives or executes a target-backend operation.
- ISSUE-052 — `PageCapabilityWorkflow` explicitly represents idle, routing,
  filling, confirming, executing, completed, and failed states. Reference
  loading remains deterministic field state within filling.
- Route, extraction, and projected-context responses must match the current
  Mashala `conversationId` and originating browser `eventId`; review,
  cancellation, or a superseding request invalidates pending responses.
- `ConfirmationGate` asks the page workflow to authorize review and execution.
  Required confirmation executes only the exact reviewed snapshot, duplicate
  attempts are rejected, and success, HTTP failure, and network failure retain
  distinct terminal outcomes.
- `f.reference` continues to use the target-app browser request integration.
  Its full response is never handed to the page transport: only a successful
  ADR-016 projection may create `backend.context.selected`, and a missing
  descriptor creates no context event.
- ISSUE-051 — `classifyMessage` accepts only untrusted message text and the
  provider-neutral LLM boundary, then validates exactly `transactional`,
  `documentation`, or `unsupported_or_ambiguous` without capability IDs.
- Transactional classifications enter the existing declared-capability router;
  documentation classifications enter `answerDocumentationQuestion` and map
  grounded, insufficient-context, and failure outcomes to existing canonical
  assistant or error events. Unsupported, malformed, and provider-failure
  outcomes stop safely before either path can invent an operation or fact.
- ISSUE-054 — Playwright runs one Chromium E2E project against the production
  Next.js page through a local fixture gateway. Five scenarios cover the full
  editable confirmed transfer, cancellation, invalid and undeclared proposals,
  documentation-only handling, and runtime credential exclusion.
- The gateway records that the confirmed write goes to its fixture target
  handler while the fake target-session cookie is absent from `/api/runtime`.
  Tests invoke no Gemini, Ollama/RAG, real target backend, or external provider.

## P6 implementation

- ISSUE-061 — `defineReadCapability` compiles zero-input or form-backed reads
  into the v0.3 `kind: "read"` branch with one declared `GET`, explicit
  path/query bindings, and one `result.card` or `result.cardList` view.
- `executeReadCapability` validates complete input through JSON Schema, returns
  the compiled form contract when required input is missing, percent-encodes
  declared scalar bindings, and calls the target backend directly through
  `TargetBackendRequest` with no GET body.
- Success, HTTP failure, malformed JSON, response-shape failure, and network
  failure remain distinct. Read execution adds no Mashala-server
  target-backend proxy.
- ISSUE-062 — `result.card` and `result.cardList` compile required title,
  optional image/description, and developer-labeled fact declarations into
  deeply frozen plain canonical JSON data.
- Fixed developer text remains distinct from direct backend-property mappings.
  Text, number, currency, date, date-time, and safe-image descriptors are the
  closed formatter set; currency locale/code and other formatter settings are
  explicit and compiler-validated.
- Malformed mappings, duplicate fact IDs, unsupported formatters, missing
  mappings, branch-incompatible card/list data, unsafe image declarations, and
  presentation attempts containing executable/UI/control data fail before use.
- ISSUE-063 — the page transition table now includes read-specific collecting,
  fetching, presenting, and empty phases while preserving the existing write
  phases and correlation rules. Zero-input reads fetch directly after a valid
  route; form-backed reads execute only from a valid editable `CompiledForm`
  submission.
- Successful objects render through one declared card and successful arrays
  through the declared repeated-card list. Empty arrays use `emptyText`; one
  invalid item fails the complete list. In accordance with ADR-017, a root
  array is rendered completely in source order, while pagination, automatic
  follow-up requests, and incremental loading remain deferred.
- Result cards use semantic article/list/fact markup, responsive layouts, live
  loading/failure states, safe image URLs, developer-authored alt text, and a
  renderer-owned accessible image fallback. Backend strings are React text,
  never injected HTML.
- Full responses stay in browser-owned workflow/transcript state and only
  declared presentation properties enter the DOM. Rendering sends no result
  event to `/api/runtime`; only successful ADR-016 projection can produce the
  minimized context from which `backend.context.selected` may be constructed.
- Each fetch carries its page run ID and an `AbortSignal`. Cancellation aborts
  cooperative request integrations, and late results are rejected by the
  transition table even when an integration ignores cancellation.

## Deliberately unresolved

- Durable conversation persistence beyond the v0.1 single-process proof.
- The first reference/demo domain.
- Primary thesis contribution wording and final research questions.

See `OPEN_QUESTIONS.md` for the complete current list.

## Recommended next task

ISSUE-064 (read-capability end-to-end fixtures and examples).
