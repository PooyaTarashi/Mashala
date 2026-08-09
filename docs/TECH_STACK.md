# Tech Stack — v0.1 Planning

Technology should follow architecture, not define it.

## Strong current candidates

| Area | Candidate | Status | Reason |
|---|---|---:|---|
| Language | TypeScript | Strong preference | Shared DSL/client/server types |
| UI | React | Strong preference | Form rendering ecosystem |
| App framework | Next.js | Candidate | Full frontend + server runtime in one project |
| Form authoring | TypeScript DSL | Accepted direction | Developer ergonomics |
| Canonical validation | JSON Schema | Accepted direction | Portable, deterministic validation |
| Tests | Vitest/Jest + browser E2E | To choose | Unit + interaction coverage |
| LLM abstraction | Provider adapter | Accepted architectural idea | Avoid provider lock-in |
| Initial provider | To choose | Open | Google/OpenAI-compatible options available |
| RAG/vector storage | Start simple | Open | Do not over-engineer small corpus |
| Workflow engine | Custom first / LangGraph evaluation | Open | Architecture must remain library-independent |

## Decision rule

Adopt a dependency only when it solves a concrete requirement.

Do not select LangGraph, a vector database, an ORM, or an orchestration framework solely because it looks more professional.

## Tech-stack freeze point

Before implementing the first vertical slice, decide:

- repository/package layout,
- Node version,
- Next.js vs alternative,
- package manager,
- testing framework,
- schema validator,
- first LLM provider/API adapter,
- minimal persistence strategy.

Everything else can remain replaceable until a real requirement appears.
