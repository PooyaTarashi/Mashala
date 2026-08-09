# Project Status

## Current phase

**Ideation / architecture consolidation. No implementation has started.**

The immediate goal is to freeze a small v0.1 architecture and then implement the smallest vertical slice.

## Accepted decisions

- Project name: **Mashala**.
- Mashala is a complete generated frontend application.
- Typed form DSL is the preferred authoring surface.
- Canonical machine-readable validation schema remains separate from natural-language routing descriptions.
- Data-backed/authenticated dropdowns are a core requirement.
- Target-backend API calls execute entirely in the user's browser.
- Mashala server is not a general proxy/BFF for the target backend.
- Selected API result data may travel browser → Mashala server → LLM when language interpretation requires it.
- User target-backend credentials must not be sent to the LLM.
- LLM provider secret lives on the Mashala server.
- Target-app authentication belongs to the target app; Mashala integrates with it but does not define it.
- Deterministic code owns workflow transitions and side effects.
- LangGraph remains an implementation candidate, not an architectural dependency.
- Mashala defines build commands/output; developers choose CI/CD/deployment workflow.

## Decisions to make before serious implementation

- Exact tech stack v0.1.
- Exact canonical compiled spec format.
- Exact client/server protocol for structured Mashala events.
- How browser results are minimized before being sent for LLM interpretation.
- Which first reference/demo domain to implement.
- Primary thesis contribution wording and final research questions.

## Recommended next milestone

Build the smallest end-to-end slice with **no sophisticated RAG or multi-step chaining**:

```text
TS field DSL
   ↓
compiled schema
   ↓
React form
   ↓
one simple capability
   ↓
LLM chooses capability / extracts a field
   ↓
browser renders confirmation
   ↓
browser executes one mock backend API
```

Add one data-backed dropdown immediately after the static vertical slice to prove the new client-side API architecture.
