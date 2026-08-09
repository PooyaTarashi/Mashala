# ADR-007 — Deterministic code owns workflow and side effects

**Status:** Accepted

## Decision
The LLM may:
- route natural language to declared capabilities;
- extract candidate field values;
- phrase explanations/questions;
- interpret selected backend-result data.

Deterministic application code owns:
- legal workflow states/transitions;
- form rendering;
- validation;
- confirmation;
- target API execution.

A representative workflow is:

`ROUTING → RESOLVING → FILLING → CONFIRMING → EXECUTING → DONE|FAILED`

## Consequences
Mashala is intentionally not a free-form autonomous agent that plans arbitrary API-call chains.
