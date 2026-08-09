# ADR-011 — Freeze the v0.1 technology stack

**Status:** Accepted

## Context

Mashala needs one conventional implementation path for the first vertical slice. The stack must support a complete React application, a server-only LLM adapter, shared TypeScript contracts, and deterministic JSON Schema validation without adding infrastructure that the current scope does not require.

## Decision

Use the following stack for v0.1:

- TypeScript for the DSL, compiled contracts, browser client, and server runtime.
- Node.js 24.x LTS. Development and CI use the latest available 24.x patch. The scaffold will declare `>=24 <25` and pin the selected patch in a version file.
- npm with a committed `package-lock.json`.
- A single-package Next.js application using React and the App Router on the Node.js runtime. Next.js server-only code hosts the Mashala protocol and LLM provider adapter; it must not proxy target-backend operations. The Edge runtime is not a v0.1 target.
- Vitest for unit and contract tests.
- JSON Schema Draft 2020-12 validated with Ajv through its 2020-12 entry point.
- OpenAI as the first LLM provider, accessed through the official JavaScript/TypeScript SDK and Responses API behind a Mashala-owned provider interface. The model name remains server configuration rather than part of the compiled application spec.
- No durable database for the v0.1 vertical slice. Runtime conversation state is ephemeral and in memory, so restart recovery and multi-process coordination are explicitly unsupported. The first OpenAI adapter disables provider-side Response storage (`store: false`); any later retention policy requires an explicit decision.

Exact dependency versions will be selected and locked in `package-lock.json` when ISSUE-010 creates the scaffold. This ADR freezes technology choices, not a dependency snapshot before a package manifest exists.

## Consequences

- The first implementation can share types without a monorepo or package-publication setup.
- npm adds no package-manager prerequisite beyond the selected Node.js installation.
- The browser remains the only actor that executes target-backend requests.
- Vitest covers P1 unit and contract work. A browser end-to-end runner may be selected later when browser interaction tests exist; it is not selected by this ADR.
- Provider-specific OpenAI types and calls remain behind an interface so another provider can be added without changing the canonical spec or runtime protocol.
- In-memory state is appropriate only for the initial single-process proof. A durable persistence decision requires a later issue and, if architecturally significant, a new ADR.
- Provider-managed conversation persistence is not used implicitly.
- No ORM, vector database, authentication framework, workflow framework, deployment abstraction, or LangGraph dependency is introduced.
