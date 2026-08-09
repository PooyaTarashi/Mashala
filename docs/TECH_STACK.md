# Tech Stack — v0.1

ADR-011 freezes the implementation choices for the first vertical slice. Technology remains subordinate to the architecture in accepted ADRs.

## Frozen choices

| Area | v0.1 choice | Rationale / policy |
|---|---|---|
| Language | TypeScript | One language for the authoring DSL, compiled contracts, browser, and server |
| Runtime | Node.js 24.x LTS | Use the latest 24.x patch; declare `>=24 <25` and pin the selected patch when scaffolding |
| Package manager | npm | Ships with Node and is sufficient for the initial single-package repository; commit `package-lock.json` |
| UI | React | Accepted UI foundation for deterministic form rendering |
| App framework | Next.js App Router on the Node.js runtime | Provides the complete React app and server-only Mashala endpoints in one conventional application; the Edge runtime is not a v0.1 target |
| Repository layout | Single package | No monorepo/workspace split until a concrete packaging requirement exists |
| Unit/contract tests | Vitest | Small TypeScript-friendly runner for DSL, schema, protocol, and state-machine tests |
| Canonical validation | JSON Schema Draft 2020-12 | Portable deterministic form validation contract |
| Schema validator | Ajv, 2020-12 entry point | Mature validator with the required JSON Schema draft support |
| LLM abstraction | Mashala-owned provider interface | Keeps provider-specific requests and responses outside canonical/runtime contracts |
| First LLM provider/API | OpenAI official JS/TS SDK using the Responses API | First adapter only; structured responses remain validated by Mashala |
| LLM model | Server configuration; not frozen in the compiled spec | Model availability changes independently of application capabilities |
| Persistence | Ephemeral in-memory runtime state; OpenAI Response storage disabled | No database for the v0.1 single-process proof; use `store: false`; restart recovery and horizontal coordination are unsupported |
| Workflow engine | Small custom deterministic state machine | LangGraph remains an optional later evaluation under ADR-008 |

Node.js recommends supported LTS lines for production use, and 24.x is an LTS line for this freeze: [Node.js release policy](https://nodejs.org/en/about/previous-releases). OpenAI recommends the Responses API for new projects: [OpenAI Responses API migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses).

## Runtime boundaries

Next.js server-only code may expose the Mashala browser/server protocol and call the configured LLM provider. It must not become a proxy for the target backend. Authenticated target-backend reads and writes still execute from the browser under ADR-003.

The OpenAI API key is a server environment secret under ADR-005. It is never present in browser code, the compiled spec, or runtime protocol events. The target application's browser credentials are likewise absent from Mashala server events.

## Version and lock policy

ISSUE-010 will create the first `package.json`, select compatible stable dependency versions, and commit the generated `package-lock.json`. The repository will also pin a concrete Node 24 patch in a conventional version file while keeping the package engine range on major 24.

Dependency upgrades are explicit changes. A major-version upgrade that changes a public contract or architectural behavior requires review and may require a new ADR; ordinary compatible security and bug-fix updates do not.

## Testing boundary

Vitest is the P0-selected runner for unit and contract tests. A browser end-to-end runner is intentionally not selected before browser UI exists. Selecting one later is an implementation decision unless it changes public architecture.

## Persistence limitation

The v0.1 server may keep only minimal conversation state in process memory. The OpenAI adapter uses `store: false` so provider-managed Response state is not an implicit persistence layer. This choice is for the local/single-process vertical slice and does not claim production durability. No ORM or database is selected. Durable resume, multi-instance coordination, and storage retention policy remain later requirements.

## Explicitly not adopted

- LangGraph;
- a vector database or RAG storage product;
- an ORM or durable application database;
- an authentication framework;
- a deployment or CI/CD abstraction;
- a monorepo framework;
- an OpenAPI importer;
- an autonomous-agent framework.

These may be considered only when an in-scope requirement justifies them and accepted ADRs permit them.
