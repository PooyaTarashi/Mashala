# AGENTS.md — Instructions for AI coding agents

This repository is the source of truth for Mashala. Do not infer current architecture from old chat transcripts when an authoritative document or accepted ADR exists.

## Read before making changes

Always read:

1. `docs/PROJECT.md`
2. `docs/SCOPE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/PROJECT_STATUS.md`

Then read any ADRs relevant to the task in `docs/decisions/`.

## Architectural rules

- Mashala is a **full generated frontend application**, not merely an embeddable widget.
- Authenticated target-backend API requests execute in the **user's browser**.
- The Mashala server must not become a general proxy/BFF for target-backend requests.
- User backend credentials must never be sent to the LLM.
- The developer's LLM provider secret lives server-side and must never be bundled into browser code.
- The browser may send selected/sanitized API-result data to the Mashala server when language interpretation requires it.
- Forms are deterministic UI generated from developer-authored schemas/DSL, not arbitrary LLM-produced HTML.
- Data-backed fields such as authenticated dropdowns are a core requirement.
- Business authorization remains the responsibility of the target backend.
- Workflow/state transitions should be deterministic application logic; LLMs handle ambiguous language tasks.
- LangGraph is an implementation candidate, not part of Mashala's architectural identity.
- Do not add new framework dependencies merely to make the project look more sophisticated.
- CI/CD provider choice is outside Mashala's scope. Mashala may provide standard build/start commands.

## Scope discipline

Before implementing a new feature, classify it against `docs/SCOPE.md`.

If a requested change conflicts with an accepted ADR:
1. stop,
2. explain the conflict,
3. propose a new ADR,
4. do not silently change the architecture.

## Development discipline

- One focused issue/task per change.
- Add or update tests for new behavior.
- Prefer the smallest implementation that proves the architectural idea.
- Keep provider-specific LLM behavior behind an interface.
- Never commit secrets, API keys, access tokens, or private backend data.
- Update relevant documentation when behavior or architecture changes.
