# ADR-016 — Model-visible backend data uses explicit browser-side projection

**Status:** Accepted

## Context

Target-backend API requests execute in the user's browser.

Some language tasks may require the LLM to see a small part of data returned by the target backend. For example, resolving a phrase such as "use my Visa card" may require the model to see safe identifiers and display labels for the user's available cards.

ADR-010 established that backend-result data must never be forwarded automatically and left the exact minimization mechanism open.

Mashala therefore needs a small deterministic mechanism for developers to declare exactly which backend-result properties may become model-visible.

## Decision

Mashala uses **declarative browser-side projection descriptors** for model-visible backend-result data.

A projection explicitly maps allowed source properties to output properties.

Conceptually:

```ts
modelContext: {
  purpose: "reference_resolution",
  fields: {
    id: "id",
    label: "masked"
  }
}
```

Given backend data such as:

```json
{
  "id": "card_1",
  "masked": "•••• 4417",
  "balance": 750000,
  "access_token": "secret"
}
```

the projection may produce only:

```json
{
  "id": "card_1",
  "label": "•••• 4417"
}
```

Properties that are not explicitly selected are not copied.

### Declaration location

The projection descriptor is attached to the browser-executed read source that produces the relevant backend data.

No projection descriptor means that backend-result data from that source is not model-visible.

### Projection capabilities

The first implementation supports only:

* root objects;
* root arrays of objects;
* direct property selection;
* optional output-property renaming;
* plain JSON output.

The following are deferred:

* nested property paths;
* arbitrary projection functions;
* expressions;
* filters;
* joins;
* computed fields;
* generic transformation languages.

### Browser-side minimization

Projection occurs in the browser before backend-result data is sent to the Mashala server.

The Mashala server must not receive a complete backend response and then decide which properties to remove.

The browser sends only the projected representation.

### Credential protection

Explicit allowlisting is the primary data-minimization boundary.

Only properties declared by the projection may be copied.

Target-backend credentials and authentication material must never be projected or included in model-visible context.

Implementations may additionally reject known credential-like property names as defense in depth, but such detection is not the primary security mechanism.

### Failure behavior

Projection fails closed.

* no projection declaration → no model-visible backend data;
* malformed source shape → no model-visible backend data;
* invalid projection → no model-visible backend data;
* non-serializable projected result → no model-visible backend data;
* forbidden credential/authentication data → no model-visible backend data.

Projection never triggers another backend request.

### Runtime protocol

Projected data is sent using the existing:

```text
backend.context.selected
```

runtime protocol event.

The event carries only the already-minimized projected data together with the context required by the accepted runtime protocol.

No new backend-execution event is introduced.

### LLM trust boundary

Projected backend data is **untrusted model context**.

It may assist language interpretation, such as reference resolution or explanation.

It cannot:

* authorize an operation;
* change a capability;
* change a backend operation;
* change confirmation policy;
* bypass form validation;
* cause target-backend execution;
* control deterministic workflow state.

Deterministic Mashala code remains authoritative.

## Consequences

* Backend responses are private from the model by default.
* Developers explicitly control which backend-result properties may become model-visible.
* Data minimization happens before information crosses the browser/server boundary.
* The implementation is deterministic and testable.
* Mashala does not need a general data-transformation language.
* The mechanism can support reference resolution while keeping unrelated backend fields private.
* More expressive projection mechanisms may be considered later if concrete requirements justify them.

This ADR resolves ADR-010's open implementation question while preserving ADR-010's principle that model-visible backend data must be explicit and minimized.
