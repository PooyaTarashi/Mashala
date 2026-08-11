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

### ISSUE-040 — Containerized Python RAG foundation

**Goal:** Establish the isolated Python environment used for Mashala documentation indexing and retrieval without requiring developers to maintain Python dependencies.

**Acceptance:**

* [ ] Python RAG implementation has a clear boundary from the Node/Next.js runtime;
* [ ] Python and FAISS dependencies are containerized;
* [ ] developer does not need a Mashala-specific Python/pip/virtualenv setup;
* [ ] RAG subsystem cannot execute target-backend operations;
* [ ] RAG subsystem does not own capability routing, slot extraction, confirmation, or workflow;
* [ ] no target-backend credentials are passed to the RAG subsystem;
* [ ] FAISS remains hidden behind the RAG implementation boundary;
* [ ] container versions/dependencies are pinned reproducibly.

---

### ISSUE-041 — Define versioned RAG artifact contract

**Goal:** Define what offline RAG building produces independently of FAISS's internal file conventions.

**Acceptance:**

* [ ] artifact format has an explicit version;
* [ ] artifact records embedding configuration/model identity;
* [ ] artifact records enough information to map retrieval results to source chunks;
* [ ] chunk provenance is preserved;
* [ ] incompatible artifact versions can be rejected deterministically;
* [ ] incompatible embedding configuration can be detected;
* [ ] artifact contract does not expose unnecessary FAISS-specific details to the Node runtime;
* [ ] artifact format is documented;
* [ ] tests validate compatible and incompatible artifacts.

Do **not** predetermine whether this means two files, three files, etc. Let the implementation satisfy the contract.

---

### ISSUE-042 — Markdown ingestion and chunking

**Goal:** Convert developer-provided Markdown documentation into deterministic retrievable chunks.

**Acceptance:**

* [ ] configured Markdown files can be loaded;
* [ ] documents are normalized deterministically;
* [ ] deterministic chunking strategy implemented;
* [ ] each chunk has stable identity;
* [ ] source-document provenance retained;
* [ ] useful heading/path metadata retained where available;
* [ ] malformed/unreadable input fails clearly;
* [ ] chunking requires no LLM;
* [ ] deterministic fixture tests exist.

---

### ISSUE-043 — Local embeddings and FAISS index builder

**Goal:** Build the initial retrieval index offline using local embeddings.

**v0.1 implementation:**

* Ollama;
* `nomic-embed-text`;
* Python;
* FAISS.

**Acceptance:**

* [ ] chunks are embedded using local Ollama `nomic-embed-text`;
* [ ] no external embedding API key is required;
* [ ] embedding configuration is recorded in artifact metadata;
* [ ] FAISS index is built from generated embeddings;
* [ ] index and associated Mashala artifacts are serializable for deployment;
* [ ] same inputs/configuration produce structurally compatible artifacts;
* [ ] useful build failures are reported clearly;
* [ ] FAISS remains an implementation detail behind the RAG boundary.

---

### ISSUE-044 — Implement `mashala rag build`

**Goal:** Give developers one Mashala command for producing deployable RAG artifacts.

Expected developer interface:

```bash
mashala rag build
```

**Acceptance:**

* [ ] command exists in the Mashala developer tooling;
* [ ] command invokes the versioned containerized RAG builder;
* [ ] documentation input is supplied to the container;
* [ ] generated artifacts are written back to a configured host output location;
* [ ] developer does not invoke Python directly;
* [ ] developer does not manage FAISS/Python dependencies;
* [ ] Docker availability is checked with a useful failure message;
* [ ] Ollama/model availability is checked with a useful failure message;
* [ ] builder failure produces a useful CLI failure;
* [ ] successful build reports artifact location and useful summary;
* [ ] command can run locally or in developer-selected CI without Mashala prescribing CI/CD.

---

### ISSUE-045 — Load and validate prebuilt RAG artifacts

**Goal:** Allow runtime retrieval to start from artifacts produced elsewhere rather than rebuilding the documentation corpus.

**Acceptance:**

* [ ] runtime loads prebuilt artifacts;
* [ ] corpus indexing is not required at runtime startup;
* [ ] artifact format version is validated;
* [ ] embedding configuration is validated;
* [ ] corrupt/incomplete artifacts fail safely;
* [ ] source/chunk metadata remains available after loading;
* [ ] retrieval index is loaded once and reused;
* [ ] tests use prebuilt fixture artifacts.

---

### ISSUE-046 — Runtime RAG retrieval service

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

* [ ] persistent Python retrieval runtime loads artifacts once;
* [ ] query is embedded using configuration compatible with the index;
* [ ] top-k retrieval supported;
* [ ] results contain chunk identity/content/provenance and retrieval score where appropriate;
* [ ] service performs retrieval only;
* [ ] service does not call the conversational LLM;
* [ ] service cannot execute target-backend operations;
* [ ] malformed requests/results fail predictably;
* [ ] deterministic integration tests exist over a small fixture corpus.

---

### ISSUE-047 — Node ↔ RAG retrieval client

**Goal:** Allow the Mashala Node runtime to retrieve documentation without depending on Python/FAISS internals.

**Acceptance:**

* [ ] Node-side retrieval interface exists;
* [ ] Python service implements that boundary through a narrow transport contract;
* [ ] Node code does not import or understand FAISS internals;
* [ ] retrieval failures are normalized;
* [ ] timeout/failure does not produce a target-backend side effect;
* [ ] returned chunks retain provenance;
* [ ] mock retrieval implementation exists for Node tests.

---

### ISSUE-048 — Knowledge-answer flow

**Goal:** Answer documentation questions using retrieved developer documentation as grounded context.

**Acceptance:**

* [ ] user documentation question can trigger retrieval;
* [ ] relevant chunks are retrieved before model answering;
* [ ] only selected retrieved chunks enter model context;
* [ ] retrieved documentation is treated as untrusted context, not system instructions;
* [ ] answer is grounded in retrieved developer documentation;
* [ ] insufficient retrieval can produce an explicit insufficient-context/out-of-scope response rather than invented knowledge;
* [ ] RAG flow cannot execute target-backend operations;
* [ ] tests cover grounded answer, no useful retrieval, malformed retrieval, and retrieval-service failure.

---
