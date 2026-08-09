# ADR-004 — Data-backed form fields are a core feature

**Status:** Accepted

## Context
Many real forms contain choices that cannot be defined statically because they depend on the authenticated user, e.g. accounts, cards, saved addresses, courses, or beneficiaries.

## Decision
Mashala's form DSL must support a field whose allowed choices are obtained from a declared runtime read operation executed in the browser.

Example concept:

```ts
f.reference({
  source: { method: "GET", path: "/accounts" },
  value: "id",
  labelFrom: "display_name"
})
```

## Consequences
- The model never invents allowed dynamic values.
- Browser auth context is used for the source request.
- One data source per field is sufficient for v0.1.
- Cascading/dependent data sources are deferred.
