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
