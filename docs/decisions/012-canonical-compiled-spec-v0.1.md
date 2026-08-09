# ADR-012 — Canonical compiled spec v0.1

**Status:** Accepted

## Context

The developer-facing TypeScript DSL needs a small, stable output that deterministic renderers, validators, routers, and browser executors can consume. Validation rules should not be duplicated in Mashala-specific presentation metadata.

## Decision

The canonical compiled artifact is a JSON-serializable, versioned `MashalaSpec` described normatively in `docs/CANONICAL_SPEC.md`.

For v0.1:

- the top level contains application metadata and declared capabilities;
- each capability has a stable ID, a routing description, a deterministic form, a declared backend operation, and a confirmation policy;
- the form's JSON Schema Draft 2020-12 document is the sole canonical source of input validation;
- Mashala field metadata is keyed by JSON Schema property name and contains only presentation/runtime information;
- static fields are `text`, `longText`, `number`, `select`, and `boolean`;
- capability operations are JSON body writes with method `POST`, `PUT`, or `PATCH` and a relative path;
- each form field maps directly to the same-named JSON request-body property;
- no generic request-transformation language exists in v0.1;
- the model-visible backend-data policy has a named `never` placeholder that is not attached to any serialized v0.1 property. Its shape and location remain undecided, and no backend result is forwarded automatically.

The field metadata union is intentionally extensible. A later spec version can add a `reference` member with a browser-executed read source without changing the form/schema split or the capability structure.

## Consequences

- The compiled artifact can be stored and exchanged as JSON.
- Deterministic validation and rendering can evolve independently while sharing field names.
- Select labels necessarily map schema enum values to human-readable labels, but the JSON Schema enum remains authoritative for allowed values.
- Path parameters, query mappings, custom headers, multipart bodies, uploads, response transforms, and a generic transformation DSL are outside v0.1.
- Any incompatible shape change requires a new `specVersion` and an ADR that supersedes this decision.
