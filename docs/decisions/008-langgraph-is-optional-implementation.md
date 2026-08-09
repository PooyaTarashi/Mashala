# ADR-008 — LangGraph is an implementation candidate, not an architectural dependency

**Status:** Accepted

## Context
LangGraph appears well matched to explicit stateful workflows, persistence, and human-in-the-loop interrupts. However, adopting it only for perceived professionalism risks unnecessary complexity and weakens clarity about Mashala's own contribution.

## Decision
Define Mashala's state/workflow model independently.

Evaluate LangGraph only after concrete runtime requirements show that it materially simplifies persistence, interrupts, resumability, or branching.

## Consequences
A custom small state machine may be sufficient.
Replacing the workflow implementation must not change Mashala's public architecture/specification.
