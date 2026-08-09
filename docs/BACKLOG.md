# Initial Backlog

Use these as GitHub Issues. Keep one issue per focused change.

## P0 — before code

### ISSUE-001 — Freeze tech stack v0.1
Acceptance:
- package manager chosen;
- framework chosen;
- test runner chosen;
- schema validator chosen;
- first LLM provider chosen;
- decision recorded.

### ISSUE-002 — Define canonical compiled spec
Acceptance:
- TypeScript type/interface documented;
- form JSON Schema location defined;
- capability metadata defined;
- API binding metadata defined;
- model-visible-data policy has a placeholder/interface.

### ISSUE-003 — Define browser/server event protocol
Acceptance:
- events for route/form/message/result defined;
- no user credential field exists in protocol.

## P1 — first implementation

### ISSUE-010 — Scaffold repository
Acceptance:
- app runs locally;
- lint/test/typecheck commands;
- no LLM integration.

### ISSUE-011 — Implement basic field DSL
Fields:
- text
- longText
- number
- select
- boolean

Acceptance:
- typed API;
- compiles deterministically;
- unit tests.

### ISSUE-012 — Compile forms to JSON Schema
Acceptance:
- required/optional;
- enum;
- min/max or length constraints;
- validation tests.

### ISSUE-013 — Render compiled form
Acceptance:
- accessible labels;
- editable values;
- validation errors;
- responsive layout.

### ISSUE-014 — Browser API executor
Acceptance:
- declared method/path only;
- browser calls mock target backend;
- handles success/error;
- no Mashala server proxy.

### ISSUE-015 — Confirmation gate
Acceptance:
- write cannot execute before required user interaction;
- test proves it.

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
