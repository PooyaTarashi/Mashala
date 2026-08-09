# Roadmap

This roadmap is architecture-first and intentionally keeps the first implementation small.

## Phase 0 — Project control

- Commit these authoritative docs.
- Create ChatGPT Project.
- Set project instructions.
- Create GitHub repository.
- Record future architectural changes as ADRs.
- Decide primary thesis contribution with supervisor.

## Phase 1 — Spec/DSL v0.1

- Decide minimal field types.
- Implement `defineCapability`.
- Implement basic `f.text`, `f.longText`, `f.number`, `f.select`, `f.boolean`.
- Compile to canonical schema.
- Add validation tests.
- Define static API binding metadata.

## Phase 2 — Deterministic frontend prototype

- Render compiled forms in React.
- Add theme primitives.
- Add confirmation state.
- Create one mock backend capability.
- Execute target API request directly from browser.

## Phase 3 — LLM-assisted interaction

- Add server-side provider adapter.
- Route utterance to one capability.
- Extract partial field values.
- Never expose LLM key to client.
- Never send user backend credentials to model/server.

## Phase 4 — Data-backed fields

- Add `f.reference` / data-backed select.
- Browser resolves options through authenticated target API.
- Add controlled projection for model-visible result data when disambiguation is required.

## Phase 5 — Documentation/RAG

- Load developer docs.
- Chunk/index simply.
- Answer system questions from docs.
- Establish untrusted-data boundaries.

## Phase 6 — Workflow/state

- Formalize explicit state machine.
- Persist conversation state as required.
- Add declared follow-up capabilities.
- Evaluate whether LangGraph solves actual complexity better than a custom implementation.

## Phase 7 — Demo + conventional baseline

- Build reference backend.
- Build agentic Mashala frontend.
- Build fair conventional UI baseline.
- Seed deterministic evaluation data.

## Phase 8 — Evaluation tooling

- Routing utterance set.
- Task success/time/clicks-or-turns.
- Validation failure metrics.
- Out-of-scope/refusal tests.
- Prompt-injection/adversarial tests.
- User study preparation.

## Stretch

- AI-assisted OpenAPI importer.
- Multiple model providers.
- Cascading fields.
- Advanced ablations.
- Local-model comparison.
