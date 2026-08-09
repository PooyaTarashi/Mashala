# ADR-010 — API-result data sent to the model must be explicit

**Status:** Accepted at principle level; mechanism still open

## Context
Target APIs execute in the browser. Sometimes an LLM needs part of a result to interpret user language or resolve a reference.

## Decision
The browser may send backend-result data to the Mashala server when required, but this is not an automatic “forward every API response” behavior.

Only the information needed for the current language task should be sent.

Target-backend credentials are never included.

## Open implementation question
Define the projection/minimization mechanism:
- developer-declared model-visible fields;
- projection functions;
- schema annotations;
- another explicit mechanism.

## Consequences
Data minimization becomes a first-class architecture concern and should be tested.
