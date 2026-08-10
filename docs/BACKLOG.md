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
- [x] first LLM provider chosen: OpenAI Responses API behind a provider interface;
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

## P2 — LLM

### ISSUE-020 — Server-side provider adapter

Acceptance:

- API key read only server-side;
- structured model response;
- mockable tests.

### ISSUE-021 — Capability routing

Acceptance:

- model chooses only declared capability IDs;
- out-of-scope result supported.

### ISSUE-022 — Slot extraction

Acceptance:

- only declared fields;
- invalid values rejected by schema;
- extracted values remain editable.

## P3 — data-backed field proof

### ISSUE-030 — Implement `f.reference`

Acceptance:

- declared GET source;
- response projection to value/label;
- request runs in browser.

### ISSUE-031 — Auth-context integration interface

Acceptance:

- framework does not mandate token storage;
- sample implementation works with demo backend.

### ISSUE-032 — Model-visible backend projection

Acceptance:

- browser can send only selected fields/results;
- user credential is excluded;
- result is clearly treated as untrusted context.

## P4 — docs/RAG

### ISSUE-040 — Load Markdown docs

### ISSUE-041 — Chunk/index docs

### ISSUE-042 — Knowledge-answer route

## Later

- OpenAPI draft importer
- LangGraph evaluation spike
- cascading field sources
- routing evaluation command
- RTL/Persian polish
