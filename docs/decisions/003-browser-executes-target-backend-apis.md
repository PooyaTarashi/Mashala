# ADR-003 — Target-backend API calls execute in the browser

**Status:** Accepted

## Context
An earlier runtime design placed a server-side executor between the generated frontend and target backend. The desired product is instead closer to a conventional frontend: the user's browser authenticates to and directly calls the target application.

## Decision
Authenticated target-backend API requests execute from the generated Mashala browser client.

The Mashala server is not a general proxy/BFF for target-backend operations.

## Consequences
- User auth can remain in the target application's normal browser security model.
- Dynamic form options are resolved client-side.
- Confirmed writes execute client-side.
- Target APIs must be browser-accessible according to the developer's deployment/CORS setup.
- Mashala's server cannot assume possession of target-app credentials.
- Some API-result data may be selectively sent to the Mashala server when the LLM must interpret it.
