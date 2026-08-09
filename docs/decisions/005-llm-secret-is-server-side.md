# ADR-005 — LLM provider secrets live server-side

**Status:** Accepted

## Decision
The developer provides the LLM provider credential to the deployed Mashala server environment/secret manager.

It must never be included in generated browser bundles.

## Consequences
Mashala requires a server/runtime component even though target-backend business APIs execute in the browser.
