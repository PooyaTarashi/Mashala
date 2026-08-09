# Mashala

Mashala is a Bachelor’s final-project framework for generating a conversational frontend from a developer-defined description of an existing backend application.

The core idea is that users should not need to learn an application's navigation or vocabulary before they can use its services. A developer describes the application, capabilities, forms, documentation, and safe API bindings; Mashala generates a full frontend application in which an LLM helps users understand the system, discover the right capability, and fill the right form.

**Important architectural boundary:** authenticated business API calls execute in the user's browser, directly against the developer's backend. The Mashala server hosts the LLM-facing runtime, documentation retrieval, and dialogue logic; it is not the target application's API proxy.

Start with:

1. `docs/START_HERE.md`
2. `docs/PROJECT.md`
3. `docs/SCOPE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/PROJECT_STATUS.md`
6. `docs/decisions/`

For AI coding agents, read `AGENTS.md` first.
