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

### ISSUE-050 — Build minimal working chat UI — Not started

Goal: Replace the scaffold page with a usable conversational interface backed by the
runtime transport.

Acceptance:

- [ ] a page-level chat component accepts user text and emits a canonical user.message
  through the selected transport;
- [ ] pending submission and transport failure states are visible and do not create
  duplicate messages or requests;
- [ ] capability.route.result updates only declared-capability UI state;
- [ ] form.values.proposed is merged only through deterministic schema validation into
  editable CompiledForm state;
- [ ] assistant.message, capability.route.out_of_scope, and protocol.error results are
  rendered as distinct user-visible outcomes;
- [ ] matched capabilities render the existing CompiledForm and use the existing
  ConfirmationGate for submission;
- [ ] AI-proposed values remain editable, and chat text cannot bypass form validation or
  confirmation;
- [ ] the UI is keyboard-accessible and provides accessible labels/status feedback for
  message submission and errors;
- [ ] focused component tests cover message sending, event rendering, invalid proposals,
  out-of-scope results, and protocol errors.

**Checkpoint:** after ISSUE-053, 049, and 050, you should be able to type a request like
"transfer 500 to X" in the browser and watch it flow through routing, extraction, form
fill, confirmation, and a real backend call. This is the minimum needed to demo the
project. Verify this actually works before moving on.

---

## Should-have — needed for a coherent, defensible demo

### ISSUE-052 — Orchestrate the page-level capability workflow — Not started

Goal: Connect routing, slot extraction, deterministic form interaction, confirmation,
browser execution, and result display into one explicit conversational workflow.

Acceptance:

- [ ] legal browser workflow states cover idle, routing, filling, confirming, executing,
  completed, and failed outcomes;
- [ ] a matched route selects only a declared capability and triggers slot extraction for
  that capability;
- [ ] route and extraction events are correlated with the originating user message and
  cannot update an unrelated active capability;
- [ ] partial slot proposals populate only valid declared fields and leave missing values
  for the user to complete;
- [ ] reference-field reads continue to execute in the browser with the target app's
  request integration;
- [ ] projected backend context is sent only when an ADR-016 descriptor permits it, and
  only after browser-side minimization;
- [ ] confirmation executes the exact reviewed valid snapshot through the browser-side
  executor;
- [ ] target-backend success, HTTP failure, and network failure are displayed distinctly
  without routing the request through the Mashala server;
- [ ] stale, cancelled, or concurrent workflow actions cannot authorize an unintended
  backend request;
- [ ] focused integration tests cover the complete successful flow, validation
  correction, cancellation, backend failure, and out-of-scope flow.

Why here: ISSUE-049/050 make one happy-path demo possible; this issue makes the flow
robust enough that edge cases (cancel, retry, bad backend response) don't break the
demo or embarrass you if a reviewer tries something unexpected.

---

## Nice-to-have — cut first if time runs short

### ISSUE-051 — Classify transactional and documentation messages — Not started

Goal: Add the server-side decision that directs an incoming user message to either
declared-capability handling or the ISSUE-048 documentation-answer path.

Acceptance:

- [ ] classification produces only transactional, documentation, or an explicit
  unsupported/ambiguous outcome;
- [ ] classification treats the user message as untrusted data;
- [ ] transactional messages proceed to declared-capability routing only;
- [ ] documentation messages invoke answerDocumentationQuestion before conversational
  answer generation;
- [ ] knowledge-answer outcomes are deterministically mapped to user-visible assistant,
  insufficient-context, or sanitized error results;
- [ ] ambiguous or malformed classification never invents a capability, target-backend
  operation, or documentation fact;
- [ ] classification cannot execute a capability, alter confirmation policy, or access
  target-backend credentials;
- [ ] tests cover transactional routing, grounded documentation answers, insufficient
  context, ambiguity, malformed model output, and provider failure.

Fallback if skipped: hardcode a single mode (transactional-only) for the demo, or add a
simple UI toggle between "ask a question" and "do a transaction." Disclose this as a
known simplification in the final report rather than leaving it silently unfinished.

---

## Optional — only if significant time remains

### ISSUE-054 — Add browser end-to-end coverage for the vertical slice — Not started

Goal: Select a browser end-to-end test runner and prove the user-facing safety
boundaries across the completed vertical slice.

Acceptance:

- [ ] a browser end-to-end runner is selected and documented;
- [ ] an end-to-end fixture covers user message, route result, editable proposed form
  values, required confirmation, browser-direct backend execution, and result display;
- [ ] tests prove that cancelling confirmation produces no target-backend write;
- [ ] tests prove that invalid or undeclared proposed values do not reach backend
  execution;
- [ ] tests prove that target-backend credentials are absent from Mashala transport
  requests;
- [ ] tests prove that documentation questions do not trigger target-backend execution;
- [ ] tests run without real LLM credentials, real target-backend credentials, or
  external provider access.

Scaled-down alternative if time is tight: skip a full E2E runner and instead write one
manual test script (a numbered list of clicks/inputs and expected results) that you run
by hand before your defense. Note in the final report that automated browser E2E
coverage is a known gap.

---

## Suggested execution order

1. ISSUE-053 (application assembly)
2. ISSUE-049 (transport)
3. ISSUE-050 (chat UI) — **checkpoint: one full transaction working live**
4. ISSUE-052 (orchestration robustness)
5. ISSUE-051 (classifier) — or its fallback
6. ISSUE-054 (E2E tests) — or its scaled-down alternative
