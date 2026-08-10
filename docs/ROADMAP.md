# Roadmap

This roadmap is architecture-first and intentionally keeps the first implementation small.

## P0 architecture freeze — Complete

- ISSUE-001: freeze v0.1 stack — ADR-011 and `TECH_STACK.md`.
- ISSUE-002: define canonical compiled spec — ADR-012 and `CANONICAL_SPEC.md`.
- ISSUE-003: define browser/server event protocol — ADR-013 and `RUNTIME_PROTOCOL.md`.
- Record future architectural changes as ADRs.

Thesis contribution wording and final research questions still require supervisor input, but they do not reopen the completed P0 software contracts unless an accepted ADR later supersedes them.

## Phase 1 — Spec/DSL v0.1 — In progress

- ISSUE-010: scaffold the single-package Next.js/TypeScript repository with lint, test, and typecheck commands and no LLM integration — Complete.
- ISSUE-011: implement deterministic typed `f.text`, `f.longText`, `f.number`, `f.select`, and `f.boolean` field primitives — Complete.
- ISSUE-012: compile forms to the JSON Schema and metadata split in `CANONICAL_SPEC.md`, with Ajv 2020-12 validation tests — Complete.
- Implement `defineCapability` — Next.
- Implement static API binding metadata.

## Phase 2 — Deterministic frontend prototype

- ISSUE-013: render compiled forms in React with local editing, Ajv validation, and accessible errors — Complete.
- ISSUE-014: execute declared target-backend operations directly from the browser — Complete.
- ISSUE-015: add the confirmation gate before wiring consequential writes into user-facing flows — Complete.
- Add theme primitives.
- Create one mock backend capability.

## Phase 3 — LLM-assisted interaction

- Add the server-side OpenAI provider adapter behind the provider interface.
- Route utterance to one declared capability.
- Extract partial field values.
- Implement the logical events in `RUNTIME_PROTOCOL.md` over a deliberately selected transport.
- Never expose the LLM key to the client.
- Never send target-backend credentials to the Mashala server or model.

## Phase 4 — Data-backed fields

- Finalize and add the `f.reference` / data-backed select union member.
- Browser resolves options through an authenticated target API.
- Decide ADR-010's explicit projection/minimization mechanism before enabling backend-result context events.

## Phase 5 — Documentation/RAG

- Load developer docs.
- Chunk/index simply.
- Answer system questions from docs.
- Establish untrusted-data boundaries.
- Do not introduce a vector database without a demonstrated need and decision.

## Phase 6 — Workflow/state

- Formalize the explicit deterministic state machine.
- Decide durable conversation persistence only if required.
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
