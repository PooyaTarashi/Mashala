# Initial Backlog

Use these as GitHub Issues. Keep one issue per focused change.

## P0 — before code (complete)

### ISSUE-001 — Freeze tech stack v0.1 — Complete

Recorded in ADR-011 and `TECH_STACK.md`.

Acceptance:

- [x] package manager chosen: npm;
- [x] framework chosen: Next.js App Router with React and TypeScript;
- [x] Node/runtime policy chosen: Node.js 24.x LTS, latest patch, `>=24 <25`;
- [x] test runner chosen: Vitest;
- [x] schema validator chosen: Ajv for JSON Schema Draft 2020-12;
- [x] current first LLM provider chosen: Google Gemini native `generateContent` REST behind a provider-neutral interface (ADR-015 supersedes ADR-011's original provider choice);
- [x] minimal persistence chosen: ephemeral in-memory state, no database;
- [x] decision recorded.

### ISSUE-002 — Define canonical compiled spec — Complete

Recorded in ADR-012 and `CANONICAL_SPEC.md`.

Acceptance:

- [x] versioned top-level TypeScript contract documented;
- [x] app and capability metadata defined;
- [x] form JSON Schema location and Draft 2020-12 requirement defined;
- [x] Mashala field metadata keyed by field name defined;
- [x] static field kinds defined;
- [x] API binding and direct JSON body mapping defined;
- [x] confirmation policy represented;
- [x] model-visible-data policy has a named non-serialized placeholder without choosing ADR-010's open mechanism or location;
- [x] complete `transfer_money` compiled example included;
- [x] future browser-resolved `reference` union extension documented.

### ISSUE-003 — Define browser/server event protocol — Complete

Recorded in ADR-013 and `RUNTIME_PROTOCOL.md`.

Acceptance:

- [x] discriminated browser/server event unions defined;
- [x] user message, route result, candidate form values, assistant message, selected backend context, out-of-scope result, and error concepts represented;
- [x] target-backend credential fields are absent and credentials are normatively forbidden;
- [x] LLM proposals require deterministic server and browser validation;
- [x] browser-direct target-backend execution is explicit;
- [x] no server proxy-execution event exists;
- [x] protocol is transport-independent;
- [x] end-to-end interaction example documented.

## P1 — first implementation

### ISSUE-010 — Scaffold repository — Complete

Acceptance:

- [x] app runs locally;
- [x] lint/test/typecheck commands;
- [x] Node and dependency versions pinned according to ADR-011;
- [x] no LLM integration.

### ISSUE-011 — Implement basic field DSL — Complete

Fields:

- [x] text
- [x] longText
- [x] number
- [x] select
- [x] boolean

Acceptance:

- [x] typed API;
- [x] deterministic, JSON-serializable field-level definitions;
- [x] unit and type-level tests.

### ISSUE-012 — Compile forms to JSON Schema — Complete

Acceptance:

- [x] required/optional with an optional-by-default authoring API;
- [x] select enum values and corresponding presentation labels;
- [x] string length and numeric minimum/maximum constraints;
- [x] canonical JSON Schema Draft 2020-12 and field-metadata split;
- [x] deterministic, isolated compiled output;
- [x] validation tests using Ajv's 2020-12 entry point.

### ISSUE-013 — Render compiled form — Complete

Acceptance:

- [x] all five static field kinds render deterministically from `FormDefinition`;
- [x] accessible labels, help text, required indications, field errors, and validation summary;
- [x] editable local values with correctly typed number and boolean submission values;
- [x] Ajv 2020-12 validation using the compiled JSON Schema as the sole validation source;
- [x] valid-only local submit callback with no backend execution;
- [x] responsive layout;
- [x] focused component and type-level tests.

### ISSUE-014 — Browser API executor — Complete

Acceptance:

- [x] declared `POST`, `PUT`, or `PATCH` method and root-relative path only;
- [x] browser calls the supplied target backend directly with the validated JSON value;
- [x] native target responses distinguish 2xx success from non-2xx HTTP failure;
- [x] rejected fetches produce a sanitized network-failure result;
- [x] no Mashala server proxy or route handler exists.

### ISSUE-015 — Confirmation gate — Complete

Acceptance:

- [x] `CompiledForm` remains the sole validation boundary;
- [x] a required operation enters deterministic review without executing;
- [x] a separate explicit confirmation executes the exact reviewed snapshot;
- [x] cancel/back does not execute and stale review cannot authorize a replacement value;
- [x] pending confirmation cannot create duplicate target requests;
- [x] `none` executes only from an explicit valid submission, never render or mount;
- [x] executor success, HTTP-failure, and network-failure results remain distinct;
- [x] direct browser execution has no Mashala server proxy or route handler;
- [x] focused runtime, component, accessibility, and type-level tests prove the boundary.

### ISSUE-016 — Implement capability DSL and canonical spec assembly — Complete

Acceptance:

- [x] typed `defineCapability` authoring API accepts a stable capability ID, routing description, static fields, one declared operation, and one deterministic confirmation policy;
- [x] fields compile through the existing `compileForm` implementation;
- [x] one authoritative executable canonical contract provides `MashalaSpec`, `AppMetadata`, `CapabilitySpec`, `BackendOperation`, and `ConfirmationPolicy` while reusing `FormDefinition`;
- [x] `BackendOperation` and `ConfirmationPolicy` are imported or re-exported by executor and confirmation modules rather than independently redefined;
- [x] the normal confirmation/execution integration consumes one `CapabilitySpec` so its form, operation, and policy remain bound;
- [x] canonical capabilities contain only isolated plain serializable data with no headers, credentials, functions, or arbitrary executable code;
- [x] the executable `transfer_money` example agrees with `CANONICAL_SPEC.md`;
- [x] focused runtime and type-level tests cover assembly, binding, allowed methods/policies, malformed fields, and top-level conformance;
- [x] all prior tests, lint, typecheck, and production build pass.

## P2 — LLM integration

### ISSUE-020 — Server-side LLM provider adapter — Complete

**Goal:** Establish a provider-neutral server-side LLM boundary, using Google Gemini as the first implementation.

**v0.1:**

* Google Gemini native `generateContent` REST API;
* Gemini API key remains server-side;
* standard request/response only, no streaming or WebSockets.

**Acceptance:**

* [x] provider-neutral TypeScript interface exists;
* [x] Gemini `generateContent` REST adapter implemented;
* [x] Gemini-specific request/response structures remain inside the adapter;
* [x] `GEMINI_API_KEY` is read only server-side and never exposed to browser code; `.env.example` documents server environment setup without a secret;
* [x] structured model output supported;
* [x] model output remains untrusted and caller-validated;
* [x] provider/network/malformed-response failures are normalized;
* [x] provider can be replaced with a fake/mock in tests;
* [x] tests require no real Gemini credentials or network access;
* [x] no capability-routing or slot-extraction policy implemented;
* [x] no target-backend credentials or API execution enter the provider boundary;
* [x] no SSE, WebSocket, Live API, or streaming implementation;
* [x] lint, typecheck, tests, and production build pass.

**Out of scope:** capability routing, slot extraction, RAG, streaming, browser/server transport, and target-backend execution.

---

### ISSUE-021 — Capability routing — Complete

**Goal:** Use the LLM to interpret a user utterance and propose one of the capabilities already declared by the developer.

**Acceptance:**

* [x] router receives a user utterance and declared `CapabilitySpec[]`;
* [x] model is exposed only to declared capability IDs/descriptions needed for routing;
* [x] structured result contains a proposed declared capability ID or explicit out-of-scope result;
* [x] returned capability ID is deterministically checked against the declared capability set;
* [x] invented/unknown capability IDs are rejected;
* [x] routing never modifies operation or confirmation policy;
* [x] routing never executes a capability;
* [x] out-of-scope requests are represented explicitly;
* [x] mock-provider tests cover valid routing, invented IDs, malformed output, and out-of-scope behavior.

---

### ISSUE-022 — Slot extraction — Complete

**Goal:** After routing, let the LLM propose candidate values for fields of the selected capability.

**Acceptance:**

* [x] extractor receives the selected `CapabilitySpec` and relevant user utterance;
* [x] structured output is limited to fields declared by that capability;
* [x] undeclared/model-invented fields are rejected;
* [x] partial extraction is supported;
* [x] extracted values are treated as proposals, not authoritative values;
* [x] candidate values are deterministically validated against the compiled JSON Schema;
* [x] invalid candidate values cannot bypass schema validation;
* [x] extracted values remain editable by the user;
* [x] model cannot modify operation or confirmation policy;
* [x] extraction causes no side effect or backend execution;
* [x] focused tests cover valid, partial, invalid, malformed, and extra-field output.

---

### ISSUE-023 — Implement executable runtime protocol — Complete

**Goal:** Turn the browser/server protocol already accepted in ADR-013 into executable TypeScript contracts and runtime validation.

**Acceptance:**

* [x] executable discriminated unions correspond to ADR-013;
* [x] user-message event represented;
* [x] capability-route result represented;
* [x] candidate-form-values event represented;
* [x] assistant-message event represented;
* [x] selected/minimized backend-context event represented;
* [x] out-of-scope and structured error events represented;
* [x] incoming untrusted messages are runtime-validated before use;
* [x] target-backend credentials cannot appear in protocol contracts;
* [x] no server-side target-backend execution event exists;
* [x] protocol remains transport-independent;
* [x] routing and extraction use these contracts instead of parallel ad-hoc DTOs.

The executable shared contracts and validators live in `src/runtime-protocol.ts`. Server-only adapters in `src/server/runtime-protocol-events.ts` map ISSUE-021 routing and ISSUE-022 extraction domain results to the canonical server-to-browser events without choosing a transport.

---

# P3 — Data-backed fields

### ISSUE-030 — Implement `f.reference`

**Goal:** Prove Mashala's core data-backed-field concept using a browser-resolved select/reference field.

**Acceptance:**

* [x] `reference` becomes a supported field kind;
* [x] field declares one read-only backend source;
* [x] v0.1 source uses a declared `GET` operation;
* [x] source request executes in the browser;
* [x] source defines deterministic projection to option value and label;
* [x] resolved options render through the form system;
* [x] loading state represented;
* [x] retrieval failure represented;
* [x] selected value remains subject to deterministic validation;
* [x] target-backend credentials never enter canonical spec;
* [x] no cascading/dependent reference fields;
* [x] tests prove browser execution, projection, rendering, selection and failures.

---

### ISSUE-031 — Auth-context integration interface — Complete

**Goal:** Allow browser-executed Mashala operations to use the target application's existing authentication mechanism without Mashala owning authentication.

**Acceptance:**

* [x] framework exposes a minimal browser request/auth integration boundary;
* [x] Mashala does not prescribe token storage;
* [x] Mashala does not implement its own authentication system;
* [x] integration supports the existing browser executor;
* [x] integration supports `f.reference` reads;
* [x] user target-backend credentials remain browser-side;
* [x] credentials never enter canonical capability data;
* [x] credentials never enter browser/server LLM protocol;
* [x] sample/demo backend proves authenticated integration;
* [x] tests prove the boundary without coupling Mashala to a specific auth technology.

---

### ISSUE-032 — Implement explicit model-visible backend projection — Complete

**Goal:** Implement the mechanism by which selected/minimized target-backend result data may explicitly be sent to the Mashala server/LLM for interpretation.

**Architecture:** ADR-016 resolves ADR-010 with declarative browser-side direct-property projection descriptors on read sources.

**Acceptance:**

* [x] model-visible data must be explicitly selected;
* [x] arbitrary backend responses are never automatically forwarded;
* [x] projection/minimization happens before data enters the model-facing protocol;
* [x] target-backend credentials cannot be included;
* [x] projected data is treated as untrusted model context;
* [x] absence of an explicit projection means no backend-result data is sent to the model;
* [x] deterministic tests prove allowed and excluded data;
* [x] implementation matches ADR-016's mechanism resolving ADR-010.

---

# P4 — Documentation / RAG

Here I would incorporate today's decisions directly.

### ISSUE-040 — Containerized Python RAG foundation — Complete

**Goal:** Establish the isolated Python environment used for Mashala documentation indexing and retrieval without requiring developers to maintain Python dependencies.

**Acceptance:**

* [x] Python RAG implementation has a clear boundary from the Node/Next.js runtime;
* [x] Python and FAISS dependencies are containerized;
* [x] developer does not need a Mashala-specific Python/pip/virtualenv setup;
* [x] RAG subsystem cannot execute target-backend operations;
* [x] RAG subsystem does not own capability routing, slot extraction, confirmation, or workflow;
* [x] no target-backend credentials are passed to the RAG subsystem;
* [x] FAISS remains hidden behind the RAG implementation boundary;
* [x] container versions/dependencies are pinned reproducibly.

---

### ISSUE-041 — Define versioned RAG artifact contract — Complete

**Goal:** Define what offline RAG building produces independently of FAISS's internal file conventions.

**Acceptance:**

* [x] artifact format has an explicit version;
* [x] artifact records embedding configuration/model identity;
* [x] artifact records enough information to map retrieval results to source chunks;
* [x] chunk provenance is preserved;
* [x] incompatible artifact versions can be rejected deterministically;
* [x] incompatible embedding configuration can be detected;
* [x] artifact contract does not expose unnecessary FAISS-specific details to the Node runtime;
* [x] artifact format is documented;
* [x] tests validate compatible and incompatible artifacts.

Do **not** predetermine whether this means two files, three files, etc. Let the implementation satisfy the contract.

---

### ISSUE-042 — Markdown ingestion and chunking — Complete

**Goal:** Convert developer-provided Markdown documentation into deterministic retrievable chunks.

**Acceptance:**

* [x] configured Markdown files can be loaded;
* [x] documents are normalized deterministically;
* [x] deterministic chunking strategy implemented;
* [x] each chunk has stable identity;
* [x] source-document provenance retained;
* [x] useful heading/path metadata retained where available;
* [x] malformed/unreadable input fails clearly;
* [x] chunking requires no LLM;
* [x] deterministic fixture tests exist.

---

### ISSUE-043 — Local embeddings and FAISS index builder — Complete

**Goal:** Build the initial retrieval index offline using local embeddings.

**v0.1 implementation:**

* Ollama;
* `nomic-embed-text`;
* Python;
* FAISS.

**Acceptance:**

* [x] chunks are embedded using local Ollama `nomic-embed-text`;
* [x] no external embedding API key is required;
* [x] embedding configuration is recorded in artifact metadata;
* [x] FAISS index is built from generated embeddings;
* [x] index and associated Mashala artifacts are serializable for deployment;
* [x] same inputs/configuration produce structurally compatible artifacts;
* [x] useful build failures are reported clearly;
* [x] FAISS remains an implementation detail behind the RAG boundary.

---

### ISSUE-044 — Implement `mashala rag build` — Complete

**Goal:** Give developers one Mashala command for producing deployable RAG artifacts.

Expected developer interface:

```bash
mashala rag build
```

**Acceptance:**

* [x] command exists in the Mashala developer tooling;
* [x] command invokes the versioned containerized RAG builder;
* [x] documentation input is supplied to the container;
* [x] generated artifacts are written back to a configured host output location;
* [x] developer does not invoke Python directly;
* [x] developer does not manage FAISS/Python dependencies;
* [x] Docker availability is checked with a useful failure message;
* [x] Ollama/model availability is checked with a useful failure message;
* [x] builder failure produces a useful CLI failure;
* [x] successful build reports artifact location and useful summary;
* [x] command can run locally or in developer-selected CI without Mashala prescribing CI/CD.

---

### ISSUE-045 — Load and validate prebuilt RAG artifacts — Complete

**Goal:** Allow runtime retrieval to start from artifacts produced elsewhere rather than rebuilding the documentation corpus.

**Acceptance:**

* [x] runtime loads prebuilt artifacts;
* [x] corpus indexing is not required at runtime startup;
* [x] artifact format version is validated;
* [x] embedding configuration is validated;
* [x] corrupt/incomplete artifacts fail safely;
* [x] source/chunk metadata remains available after loading;
* [x] retrieval index is loaded once and reused;
* [x] tests use prebuilt fixture artifacts.

---

### ISSUE-046 — Runtime RAG retrieval service — Complete

**Goal:** Expose narrow runtime semantic retrieval over the prebuilt documentation index.

Conceptually:

```text
query
  ↓
query embedding
  ↓
FAISS search
  ↓
top-k chunks + provenance
```

**Acceptance:**

* [x] persistent Python retrieval runtime loads artifacts once;
* [x] query is embedded using configuration compatible with the index;
* [x] top-k retrieval supported;
* [x] results contain chunk identity/content/provenance and retrieval score where appropriate;
* [x] service performs retrieval only;
* [x] service does not call the conversational LLM;
* [x] service cannot execute target-backend operations;
* [x] malformed requests/results fail predictably;
* [x] deterministic integration tests exist over a small fixture corpus.

---

### ISSUE-047 — Node ↔ RAG retrieval client — Complete

**Goal:** Allow the Mashala Node runtime to retrieve documentation without depending on Python/FAISS internals.

**Acceptance:**

* [x] Node-side retrieval interface exists;
* [x] Python service implements that boundary through a narrow transport contract;
* [x] Node code does not import or understand FAISS internals;
* [x] retrieval failures are normalized;
* [x] timeout/failure does not produce a target-backend side effect;
* [x] returned chunks retain provenance;
* [x] mock retrieval implementation exists for Node tests.

---

### ISSUE-048 — Knowledge-answer flow — Complete

**Goal:** Answer documentation questions using retrieved developer documentation as grounded context.

**Acceptance:**

* [x] user documentation question can trigger retrieval;
* [x] relevant chunks are retrieved before model answering;
* [x] only selected retrieved chunks enter model context;
* [x] retrieved documentation is treated as untrusted context, not system instructions;
* [x] answer is grounded in retrieved developer documentation;
* [x] insufficient retrieval can produce an explicit insufficient-context/out-of-scope response rather than invented knowledge;
* [x] RAG flow cannot execute target-backend operations;
* [x] tests cover grounded answer, no useful retrieval, malformed retrieval, and retrieval-service failure.

---

# P5 — End-to-end conversational vertical slice

Reordered from the original P5 backlog. The original acceptance criteria are kept as
written (they were well-scoped); only the **sequence** and **priority tags** are new.

Rationale for the reordering: transport and chat UI (ISSUE-049, ISSUE-050) are useless
without something valid to feed them, so the minimal application assembly (ISSUE-053)
comes first even though it was numbered last. Everything needed to demo one working
transaction end-to-end is tagged **Must-have**. Everything that improves correctness or
polish but isn't required to demo is tagged **Should-have** or **Nice-to-have**, so if
time runs out, it's clear what can be cut and mentioned as a known limitation instead.

---

## Must-have — required for any working demo

### ISSUE-053 — Provide application runtime assembly — Complete

Goal: Define the minimal application-level assembly that supplies a compiled MashalaSpec
and server runtime dependencies to the transport and chat page.

Acceptance:

- [x] one documented application-level configuration path provides application metadata
  and declared capabilities as a valid MashalaSpec;
- [x] the runtime receives only developer-declared capability/spec data for routing and
  form rendering;
- [x] server-only provider and documentation-retriever configuration remains outside
  browser bundles;
- [x] missing, malformed, or incompatible application configuration fails with a clear
  sanitized startup/runtime error;
- [x] configuration contains no user target-backend credentials, arbitrary executable
  request transformations, or server-side target-backend proxy settings;
- [x] the existing transfer example or an equivalent declared fixture can drive the
  complete chat workflow;
- [x] focused tests cover valid assembly and rejected malformed configuration.

The application entry point is `mashala.config.ts`, which supplies metadata and
existing `CapabilitySpec` values through `defineMashalaApplication`. Server transport
code will use `src/server/application-runtime.ts` to attach `LlmProvider` and
`DocumentationRetriever` instances without adding them to serializable application data.

Why first: without this, ISSUE-049 and ISSUE-050 have nothing valid to route or render.
Build and test this in isolation before touching transport or UI code.

---

### ISSUE-049 — Implement HTTP runtime transport — Complete

Goal: Select ordinary HTTP request/response as the initial non-streaming transport for
the ADR-013 runtime events and implement the browser/server boundary.

Acceptance:

- [x] HTTP endpoint and request/response framing are documented without changing the
  meanings of the versioned runtime-protocol events;
- [x] browser-to-server input accepts only validated user.message and
  backend.context.selected events;
- [x] server-to-browser responses carry validated canonical events in deterministic
  event order;
- [x] correlation identifiers are preserved without using target-backend session
  identifiers, provider identifiers, or credentials;
- [x] malformed, unsupported-version, and internal failures produce sanitized
  protocol.error events;
- [x] transport requests contain no target-backend headers, cookies, access tokens, or
  other credentials;
- [x] the route handler does not execute, proxy, or receive instructions to execute
  target-backend operations;
- [x] focused transport contract tests cover valid event delivery, ordering, malformed
  input, correlation, and sanitized failures.

The initial transport is strict JSON `POST /api/runtime`: `{ "event": ... }`
in and `{ "events": [...] }` out. The server assembles the repository
application through ISSUE-053, invokes only existing routing and extraction,
and validates every response event before delivery. It adds no streaming,
workflow state machine, classifier, or target-backend request path.

---

### ISSUE-050 — Build minimal working chat UI — Complete

Goal: Replace the scaffold page with a usable conversational interface backed by the
runtime transport.

Acceptance:

- [x] a page-level chat component accepts user text and emits a canonical user.message
  through the selected transport;
- [x] pending submission and transport failure states are visible and do not create
  duplicate messages or requests;
- [x] capability.route.result updates only declared-capability UI state;
- [x] form.values.proposed is merged only through deterministic schema validation into
  editable CompiledForm state;
- [x] assistant.message, capability.route.out_of_scope, and protocol.error results are
  rendered as distinct user-visible outcomes;
- [x] matched capabilities render the existing CompiledForm and use the existing
  ConfirmationGate for submission;
- [x] AI-proposed values remain editable, and chat text cannot bypass form validation or
  confirmation;
- [x] the UI is keyboard-accessible and provides accessible labels/status feedback for
  message submission and errors;
- [x] focused component tests cover message sending, event rendering, invalid proposals,
  out-of-scope results, and protocol errors.

**Checkpoint:** after ISSUE-053, 049, and 050, you should be able to type a request like
"transfer 500 to X" in the browser and watch it flow through routing, extraction, form
fill, confirmation, and a real backend call. This is the minimum needed to demo the
project. Verify this actually works before moving on.

The focused component integration proof exercises the declared `transfer_money` fixture
through a canonical route and extracted candidates, edits the compiled form, verifies
that neither chat nor review executes the backend, confirms explicitly, and observes one
browser-side `POST /transfers` through the target-app request integration.

---

## Should-have — needed for a coherent, defensible demo

### ISSUE-052 — Orchestrate the page-level capability workflow — Complete

Goal: Connect routing, slot extraction, deterministic form interaction, confirmation,
browser execution, and result display into one explicit conversational workflow.

Acceptance:

- [x] legal browser workflow states cover idle, routing, filling, confirming, executing,
  completed, and failed outcomes;
- [x] a matched route selects only a declared capability and triggers slot extraction for
  that capability;
- [x] route and extraction events are correlated with the originating user message and
  cannot update an unrelated active capability;
- [x] partial slot proposals populate only valid declared fields and leave missing values
  for the user to complete;
- [x] reference-field reads continue to execute in the browser with the target app's
  request integration;
- [x] projected backend context is sent only when an ADR-016 descriptor permits it, and
  only after browser-side minimization;
- [x] confirmation executes the exact reviewed valid snapshot through the browser-side
  executor;
- [x] target-backend success, HTTP failure, and network failure are displayed distinctly
  without routing the request through the Mashala server;
- [x] stale, cancelled, or concurrent workflow actions cannot authorize an unintended
  backend request;
- [x] focused integration tests cover the complete successful flow, validation
  correction, cancellation, backend failure, and out-of-scope flow.

Why here: ISSUE-049/050 make one happy-path demo possible; this issue makes the flow
robust enough that edge cases (cancel, retry, bad backend response) don't break the
demo or embarrass you if a reviewer tries something unexpected.

`src/page-capability-workflow.ts` is the explicit browser transition table. It
correlates every route/extraction response to the current Mashala event and
conversation, invalidates pending work on review or cancellation, and authorizes
execution only for the exact deterministic snapshot accepted for the current run.
Reference reads remain a field-level substate of filling and may emit only already-
projected ADR-016 context.

---

## Nice-to-have — cut first if time runs short

### ISSUE-051 — Classify transactional and documentation messages — Complete

Goal: Add the server-side decision that directs an incoming user message to either
declared-capability handling or the ISSUE-048 documentation-answer path.

Acceptance:

- [x] classification produces only transactional, documentation, or an explicit
  unsupported/ambiguous outcome;
- [x] classification treats the user message as untrusted data;
- [x] transactional messages proceed to declared-capability routing only;
- [x] documentation messages invoke answerDocumentationQuestion before conversational
  answer generation;
- [x] knowledge-answer outcomes are deterministically mapped to user-visible assistant,
  insufficient-context, or sanitized error results;
- [x] ambiguous or malformed classification never invents a capability, target-backend
  operation, or documentation fact;
- [x] classification cannot execute a capability, alter confirmation policy, or access
  target-backend credentials;
- [x] tests cover transactional routing, grounded documentation answers, insufficient
  context, ambiguity, malformed model output, and provider failure.

Fallback if skipped: hardcode a single mode (transactional-only) for the demo, or add a
simple UI toggle between "ask a question" and "do a transaction." Disclose this as a
known simplification in the final report rather than leaving it silently unfinished.

---

## Optional — only if significant time remains

### ISSUE-054 — Add browser end-to-end coverage for the vertical slice — Complete

Goal: Select a browser end-to-end test runner and prove the user-facing safety
boundaries across the completed vertical slice.

Acceptance:

- [x] a browser end-to-end runner is selected and documented;
- [x] an end-to-end fixture covers user message, route result, editable proposed form
  values, required confirmation, browser-direct backend execution, and result display;
- [x] tests prove that cancelling confirmation produces no target-backend write;
- [x] tests prove that invalid or undeclared proposed values do not reach backend
  execution;
- [x] tests prove that target-backend credentials are absent from Mashala transport
  requests;
- [x] tests prove that documentation questions do not trigger target-backend execution;
- [x] tests run without real LLM credentials, real target-backend credentials, or
  external provider access.

Playwright runs one Chromium project against the production Next.js page. A
local gateway supplies correlated deterministic runtime events, requires a
fake browser cookie only for the fixture target write, records both boundaries,
and proxies all page assets to Next.js. No application runtime feature or ADR
was added for the test harness.

---

## Suggested execution order

1. ISSUE-053 (application assembly)
2. ISSUE-049 (transport)
3. ISSUE-050 (chat UI) — **checkpoint: one full transaction working live**
4. ISSUE-052 (orchestration robustness)
5. ISSUE-051 (classifier) — complete
6. ISSUE-054 (E2E tests) — complete

---

# P6 — Read capabilities and deterministic result views

These issues add natural-language requests that read target-backend data, such
as "What is my account balance?" and "Show me the products." Authenticated
reads continue to execute in the user's browser through `TargetBackendRequest`.
The Mashala server must not become a target-backend proxy.

ADR-012 originally limited capability operations to JSON-body `POST`, `PUT`,
and `PATCH` requests. The now-complete ISSUE-060 produced ADR-017 and canonical
spec v0.3; read-capability implementation must conform to that accepted
contract.

### ISSUE-060 — Define the canonical read-capability and result-view contract — Complete

**Goal:** Propose and accept an ADR for developer-declared browser-executed
`GET` capabilities and deterministic result presentation.

**Architecture:** ADR-017 and `CANONICAL_SPEC.md` v0.3. This issue changes
documentation only; executable implementation remains in ISSUE-061 through
ISSUE-063.

The ADR should define the smallest authoring and compiled contracts needed for
both of these examples:

```text
"What is my account balance?"
  -> GET one object
  -> render one developer-declared card

"Show me the products"
  -> GET an array of objects
  -> render a developer-declared list of cards
```

It must also decide how an optional deterministic input form maps validated
values to an allow-listed path placeholder and/or query parameter. This is
needed for requests such as "Show product 42" or "Show products below 100"
without allowing the LLM to construct URLs.

**Acceptance:**

- [x] a new ADR explicitly supersedes or extends ADR-012's write-only operation
  clauses and selects the next compatible `MashalaSpec` version;
- [x] the contract distinguishes write capabilities from read capabilities
  without weakening existing write confirmation rules;
- [x] a read capability declares exactly one `GET` operation with a
  root-relative developer-authored path;
- [x] a read capability may have no input fields or a deterministic compiled
  input form for identifiers/filters;
- [x] any path-placeholder or query-parameter mapping is explicit,
  allow-listed, and derived only from schema-valid form values;
- [x] the LLM may route to a declared read capability and propose declared
  input values, but cannot invent a method, URL, parameter, response mapping,
  or presentation;
- [x] the contract supports a developer-declared single-card result and a
  developer-declared list-of-cards result;
- [x] the result declaration maps backend response properties to safe,
  deterministic presentation fields and contains no arbitrary HTML,
  JavaScript, React component, or executable transform;
- [x] the minimum supported response roots are specified: one JSON object for
  a card and one JSON array of objects for a card list;
- [x] support or deferral of wrapped/paginated arrays such as `{ results: [] }`
  is decided explicitly;
- [x] displaying a backend result in the browser does not automatically make
  that result visible to the Mashala server or LLM;
- [x] ADR-016 remains authoritative whenever selected result data is needed for
  later language interpretation;
- [x] target-backend credentials remain absent from the spec, runtime events,
  model context, and persisted conversation data.

**Out of scope:** arbitrary REST clients, model-generated URLs, generic
response transformation languages, server-side target-backend proxying, and
arbitrary model-generated UI.

---

### ISSUE-061 — Implement the read-capability DSL and browser fetch executor — Complete

**Depends on:** ISSUE-060.

**Goal:** Let a developer declare a typed read capability and let the browser
execute its fixed `GET` operation using the target application's existing auth
integration.

ISSUE-060 selected `defineReadCapability` as the read authoring API. The result
view is authored through the accepted `result.card` or `result.cardList`
helpers.

**Acceptance:**

- [x] typed developer authoring supports a stable ID, routing description,
  optional input fields, one declared `GET` operation, and one declared result
  view;
- [x] compilation produces the accepted versioned canonical representation;
- [x] zero-input reads support an account-balance-style request;
- [x] parameterized reads accept only values validated by the compiled input
  form;
- [x] validated values are mapped only through the operation's declared
  placeholder/query bindings;
- [x] missing required input renders the deterministic form and does not
  execute the request;
- [x] the request executes directly in the browser through the same
  `TargetBackendRequest` used by reference reads and confirmed writes;
- [x] the executor sends no JSON body for `GET` and accepts no LLM-provided
  method, URL, headers, or credentials;
- [x] target-backend success, non-2xx HTTP failure, malformed JSON, response
  shape failure, and rejected fetch are distinct sanitized outcomes;
- [x] target-backend authorization remains authoritative;
- [x] focused tests cover no-input reads, validated parameters, URL encoding,
  undeclared parameters, authentication integration, HTTP errors, network
  errors, and absence of a Mashala-server proxy.

---

### ISSUE-062 — Implement a developer-defined result-card DSL and compiler — Complete

**Depends on:** ISSUE-060.

**Goal:** Give developers a deterministic output-authoring surface analogous
to the form DSL, for describing how safe portions of a successful read response
appear in the browser.

The first version should cover cards such as:

```text
Product card
  image       <- image_url
  title       <- title
  description <- description
  price       <- price, formatted as currency

Account card
  title       <- fixed developer text such as "Account balance"
  balance     <- balance, formatted as currency
  status      <- status
```

**Acceptance:**

- [x] typed authoring supports one card and a list of repeated cards;
- [x] a card can declare a title, optional image, optional description, and
  developer-labeled facts such as price, balance, status, or account number;
- [x] response values are selected only from explicit developer-declared
  direct properties in the accepted first version;
- [x] supported formatters are a small deterministic allowlist, such as plain
  text, number, currency, date/time, and safe image URL;
- [x] developer-authored fixed labels/text are distinguished from backend data;
- [x] the compiler emits isolated JSON-serializable metadata with no functions,
  HTML, JSX, CSS injection, or provider-specific objects;
- [x] malformed mappings, duplicate field IDs, unsupported formatters, missing
  required mappings, and incompatible card/list response roots fail clearly;
- [x] currency formatting requires explicit developer configuration and does
  not let the model guess a currency;
- [x] card declarations are presentation authority only and cannot authorize a
  backend operation or alter workflow state;
- [x] unit and type-level tests cover a balance card, product card, product-card
  list, invalid declarations, and deterministic compiled output.

---

### ISSUE-063 — Render result cards and integrate the read workflow — Complete

**Depends on:** ISSUE-061 and ISSUE-062.

**Goal:** Complete the browser flow from a routed natural-language read request
to a safe, accessible card or card-list result inside the conversation.

**Acceptance:**

- [x] the page workflow has explicit states for routing, collecting any missing
  read inputs, fetching, presenting, empty result, and failure;
- [x] a zero-input request such as "What is my account balance?" can execute the
  developer-declared browser `GET` after a valid route without manufacturing a
  form value;
- [x] a parameterized read renders the existing deterministic form system for
  missing or editable inputs before execution;
- [x] a successful root object renders only through its declared single-card
  view;
- [x] a successful root array renders only through its declared card-list view;
- [x] list loading, empty, partial/malformed, and large-result behavior are
  deterministic and documented;
- [x] image URLs are validated and rendered with accessible developer-declared
  alternative text/fallback behavior;
- [x] cards and lists are keyboard-accessible, responsive, and usable within
  the conversation transcript;
- [x] full backend responses remain browser-local by default;
- [x] only an explicit ADR-016 projection may create model-visible context for
  a later follow-up such as "Tell me more about the second product";
- [x] stale, superseded, cancelled, or duplicated read requests cannot update
  the wrong conversation run;
- [x] component/integration tests cover balance, one product, a product list,
  empty results, malformed data, HTTP failure, and overlapping requests.

---

### ISSUE-064 — Add read-capability end-to-end fixtures and examples — Complete

**Depends on:** ISSUE-063.

**Goal:** Prove the new read contract using realistic account and shop examples
without live credentials, providers, or external services.

**Acceptance:**

- [x] one documented example declares and renders an authenticated account
  balance card;
- [x] one documented example declares and renders a single product card with
  image URL, title, description, and price;
- [x] one documented example declares and renders a list of product cards;
- [x] Playwright proves that each target-backend `GET` goes directly from the
  browser to the fixture backend;
- [x] tests prove that read responses and target-session credentials are absent
  from `/api/runtime` traffic unless an explicit safe projection is declared;
- [x] tests cover routing, optional input-form completion, loading, success,
  empty list, malformed result, authorization failure, and network failure;
- [x] no test requires a real LLM, target-backend credential, or external
  network call.

---

# P7 — Multi-turn conversation and chatroom experience

The desired experience is closer to a full chat application: it maintains the
current conversation, understands follow-up messages, remembers the user's
current goal and recent completed actions, and can still route to declared
capabilities.

"Knowing who the user is" must not mean giving the LLM a password, session
cookie, access token, refresh token, or unrestricted user record. The target
application continues to own authentication. Any display profile or model-
visible identity data requires an explicit, minimal, non-credential contract.

ADR-011 currently selects ephemeral in-memory conversation state for v0.1.
ISSUE-070 must be decided before durable or cross-refresh memory is added.

### ISSUE-070 — Decide the conversation identity, memory, and persistence model

**Goal:** Write and accept an ADR defining what Mashala remembers, for whom,
for how long, and where that state lives.

**Acceptance:**

- [ ] the ADR distinguishes target-app authentication, browser UI identity,
  Mashala conversation identity, and model-visible user context;
- [ ] target-backend credentials are forbidden from conversation records and
  model context;
- [ ] a minimal optional target-app-supplied display profile is defined, or
  explicitly deferred, with developer allowlisting for any model-visible
  properties;
- [ ] conversation state includes a bounded transcript, active goal/capability,
  current deterministic workflow state, and safe summaries of recent outcomes;
- [ ] raw full backend responses are excluded from memory by default;
- [ ] read/write outcome summaries retain only explicitly allowed information;
- [ ] ephemeral, refresh-persistent, and durable/cross-device behavior are
  compared, and the chosen first implementation is explicit;
- [ ] storage ownership, user/session isolation, retention, deletion, expiry,
  and logout behavior are defined;
- [ ] prompt/context size is bounded through deterministic selection and/or
  summarization rules;
- [ ] summaries are treated as untrusted model-derived data and cannot become
  execution authority;
- [ ] concurrent tabs, stale conversations, signed-out users, and changed
  target-app identity have safe behavior;
- [ ] the ADR explains how it supersedes or extends ADR-011's v0.1 ephemeral
  state without changing ADR-003, ADR-006, ADR-007, or ADR-016.

---

### ISSUE-071 — Implement isolated conversation storage and lifecycle

**Depends on:** ISSUE-070.

**Goal:** Implement the accepted conversation-state lifecycle independently of
the LLM provider and target-backend authentication mechanism.

**Acceptance:**

- [x] a provider-neutral conversation store interface implements the lifecycle
  selected by ISSUE-070;
- [x] new, load, append, update, expire, clear, and logout transitions are
  explicit and deterministic;
- [x] conversation records are isolated by the accepted application/user/session
  identity keys without storing the target credential itself;
- [x] the transcript records user and assistant messages plus safe structured
  capability/read-result summaries;
- [x] active capability and workflow state cannot be restored into an illegal
  transition or authorize an old confirmation snapshot;
- [x] storage failures produce sanitized UI behavior and no target-backend side
  effect;
- [x] retention and size limits are enforced;
- [x] tests cover refresh/reload when supported, expiry, clear conversation,
  logout, identity change, isolation, corruption, and concurrent updates;
- [x] no provider-specific session object or target-backend credential enters
  the storage interface.

---

### ISSUE-072 — Build bounded multi-turn context and follow-up capability routing

**Depends on:** ISSUE-071.

**Goal:** Let the conversational runtime understand safe follow-ups using the
current goal, recent turns, and recent declared-capability outcomes while
keeping all side effects deterministic.

**Acceptance:**

- [x] each new message is classified and routed using a bounded, explicitly
  assembled conversation context rather than the latest utterance alone;
- [x] context can include the current goal, active declared capability, valid
  draft values, recent user/assistant turns, and safe recent outcome summaries;
- [x] optional model-visible user profile data is included only according to
  ISSUE-070's explicit allowlist;
- [x] follow-ups such as "do it again," "use the second product," "change the
  amount to 50," and "what did I just do?" have defined safe behavior;
- [x] references to backend results use only previously authorized ADR-016
  projections, never a hidden full response;
- [x] the model may propose intent, capability, and field updates but cannot
  restore an expired action, reuse confirmation, invent a capability, or
  execute an operation;
- [x] switching goals invalidates incompatible pending workflow state;
- [x] completed actions are described as completed only from deterministic
  browser-observed outcomes, not model assumption;
- [x] context truncation/summarization preserves correlation and safety-critical
  workflow facts;
- [x] tests cover follow-up extraction, goal switching, recent-action questions,
  ambiguous pronouns, stale context, malicious stored content, and provider
  failure.

---

### ISSUE-073 — Evaluate reusable React chat UI systems

**Goal:** Determine whether a maintained existing chat UI system reduces bugs
and implementation time compared with extending Mashala's current components.

This is an evaluation issue, not pre-approval to add a dependency.

**Acceptance:**

- [x] evaluate a small shortlist of actively maintained React chat UI systems
  against the repository's installed Next.js and React versions;
- [x] record license, maintenance activity, bundle/runtime cost, accessibility,
  mobile behavior, theming, and server/client component constraints;
- [x] verify that custom deterministic forms, confirmation reviews, result
  cards, errors, and loading states can render inline as message content;
- [x] reject libraries that require provider secrets in the browser, own target
  authentication, assume arbitrary tool execution, or force a target-backend
  proxy;
- [x] determine whether non-streaming operation is supported; streaming must not
  be added merely because a library expects it;
- [x] compare adoption cost with improving the existing `MashalaChat` component;
- [x] document the decision to adopt one library or keep the current in-house
  UI, including the smallest dependency change justified by the evidence;
- [x] no dependency is added until this issue records the decision.

---

### ISSUE-074 — Implement the full chatroom-style frontend

**Depends on:** ISSUE-071, ISSUE-072, and ISSUE-073.

**Goal:** Present the complete multi-turn Mashala experience as a polished,
accessible chatroom while retaining deterministic forms, cards, confirmation,
and browser execution.

**Acceptance:**

- [x] the transcript displays ordered user messages, assistant messages,
  capability forms, confirmation reviews, read-result cards/lists, outcomes,
  and errors as coherent conversation items;
- [x] restored history is visibly distinguished from pending/current work and
  cannot replay an operation;
- [x] the composer supports keyboard submission, multiline input, disabled and
  pending states, retry where safe, and protection against duplicate sends;
- [x] focus management, live-region announcements, contrast, labels, and
  keyboard navigation meet the project's accessibility expectations;
- [x] scroll behavior does not steal the user's position when reviewing an old
  message and provides a deterministic way to return to the newest message;
- [x] responsive behavior is usable on mobile and desktop;
- [x] users can start a new conversation and clear history according to the
  accepted lifecycle;
- [x] current target-app identity/session state is visible without exposing a
  credential;
- [x] the selected third-party system, if any, remains a presentation layer and
  cannot become routing, workflow, confirmation, or execution authority;
- [x] component tests cover long histories, embedded forms/cards, restored
  history, pending messages, retry, clear/new conversation, accessibility, and
  mobile layout.

---

### ISSUE-075 — Add multi-turn conversation end-to-end coverage

**Depends on:** ISSUE-074.

**Goal:** Prove that the ChatGPT-like experience remembers safe context and
triggers only declared capabilities across multiple turns.

**Acceptance:**

- [ ] an end-to-end scenario identifies the signed-in user only through the
  accepted non-credential profile/session boundary;
- [x] a multi-turn transaction collects values over several messages, renders
  an editable form, requires confirmation, and performs one browser-direct
  backend request;
- [x] a completed action can be discussed in a later turn using only its safe
  recorded summary;
- [ ] a read result can support a follow-up only when its model-visible
  projection was explicitly declared;
- [x] reload/restoration behavior matches ISSUE-070 and cannot replay a write;
- [ ] switching users or logging out prevents conversation leakage;
- [x] a malicious prior message, backend field, or stored summary cannot invent
  an operation or bypass validation/confirmation;
- [x] provider/context failures render sanitized errors without guessing an action;
- [x] tests run with fake providers, deterministic local persistence, and local
  target-backend fixtures, with no real credentials or external network.

Supported ISSUE-075 coverage is implemented in `e2e/multi-turn.spec.ts` using
the ISSUE-054 Playwright runner and local gateway. Identity switching/logout
and the positive ADR-016 projection follow-up remain deferred because the
production page currently exposes only the anonymous auth scope and the
assembled read examples declare no model-visible projection.

---

---

## Suggested execution order for P6 and P7

1. ISSUE-060 — decide the read/result contract before changing the spec;
2. ISSUE-061 and ISSUE-062 — implement read execution and result authoring as
   separate focused changes;
3. ISSUE-063 — integrate read workflow and rendering;
4. ISSUE-064 — prove account and product examples end to end;
5. ISSUE-070 — decide identity, memory, privacy, and persistence;
6. ISSUE-071 — implement the accepted conversation lifecycle;
7. ISSUE-072 — add bounded multi-turn context and safe follow-ups;
8. ISSUE-073 — evaluate chat UI systems before selecting a dependency;
9. ISSUE-074 — implement the chatroom experience;
10. ISSUE-075 — prove multi-turn safety and behavior end to end.

---

# P8 — Read response envelope unwrapping and numeric string coercion

These issues implement ADR-019, advancing `MashalaSpec` to `v0.4`. They enable
developer-declared result views to unwrap response envelopes (such as
`{ "balance": { ... }, "message": "..." }` or `{ "results": [ ... ] }`) and
safely coerce valid decimal strings into numeric/currency formatters without
introducing arbitrary transformation scripts or generic REST expressions.

### ISSUE-080 — Define the canonical spec v0.4 contract for envelope unwrapping

**Goal:** Update `docs/CANONICAL_SPEC.md` and normative types to version `0.4`,
including the optional `root` path on `CardResultView` and `CardListResultView`,
and the expanded `number`/`currency` formatter decimal string acceptance rules.

**Architecture:** ADR-019 and `CANONICAL_SPEC.md` v0.4.

**Acceptance:**
- [x] `MashalaSpec` advances to `specVersion: "0.4"`;
- [x] `CardResultView` and `CardListResultView` gain optional `root?: string`;
- [x] `root` path syntax is specified as dot-separated property names matching `^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$`;
- [x] normative invariants specify that `root` traversal is deterministic property-based navigation on plain JSON objects;
- [x] formatters for `number` and `currency` accept finite JSON numbers and strict decimal strings matching `/^-?\d+(?:\.\d+)?$/`;
- [x] `docs/CANONICAL_SPEC.md` contains normative types, invariants, and a complete example of wrapped card and cardList results.

---

### ISSUE-081 — Implement result DSL compiler, read executor unwrapping, and numeric coercion

**Depends on:** ISSUE-080.

**Goal:** Implement `MashalaSpec` v0.4 in TypeScript types, the `result.card` and
`result.cardList` DSL compiler, `executeReadCapability` path navigation, and
`validPropertyValue` decimal string parsing.

**Acceptance:**
- [x] `src/spec.ts` defines `MashalaSpec` v0.4 and updated `CardResultView` / `CardListResultView`;
- [x] `src/results.ts` compiler accepts optional `root` parameter in `result.card({ root, card })` and `result.cardList({ root, card, emptyText })` and validates dot-path syntax;
- [x] `src/read-capability-executor.ts` extracts unwrapped target objects/arrays along the declared `root` path before validating card items;
- [x] missing or invalid intermediate path segments fail deterministically with `response-shape-error`;
- [x] `validPropertyValue` accepts finite numbers and decimal strings matching `/^-?\d+(?:\.\d+)?$/` for `number` and `currency` formatters, converting them via `Number(value)`;
- [x] `src/result-card-renderer.tsx` formats decimal strings seamlessly through `Intl.NumberFormat`;
- [x] unit and compiler tests cover root path unwrapping, invalid paths, missing segments, decimal string parsing, and invalid string rejections.

---

### ISSUE-082 — Verify AI Wallet balance card and wrapped list results

**Depends on:** ISSUE-081.

**Goal:** Verify that the AI Wallet backend balance response `{ "balance": { ... }, "message": "..." }` and paginated collections render cleanly in `MashalaChat` without errors.

**Acceptance:**
- [x] `src/examples/ai-wallet-capabilities.ts` declares `accountBalance` using `result.card({ root: "balance", ... })`;
- [x] `accountBalance` successfully renders available balance, account number, and status when tested against the live/mock backend;
- [x] currency formatter cleanly formats the string balance (e.g. `"3.50"` -> `"$3.50"`);
- [x] integration tests cover wrapped balance response, string currency formatting, and error handling for malformed envelopes.

---

## Suggested execution order for P8

1. ISSUE-080 — update canonical spec v0.4 contract and documentation;
2. ISSUE-081 — implement DSL compilation, read executor unwrapping, and numeric coercion;
3. ISSUE-082 — configure AI Wallet capabilities and verify wrapped responses in the UI.
