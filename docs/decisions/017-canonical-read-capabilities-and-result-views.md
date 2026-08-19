# ADR-017 — Canonical read capabilities and deterministic result views

**Status:** Accepted

**Extends and partially supersedes:** ADR-012's clauses that require every
capability to have a form, limit every capability operation to `POST`, `PUT`,
or `PATCH`, map every form field to a JSON body property, and exclude path and
query bindings. ADR-012 remains authoritative for write capabilities, the
form/schema split, and all unaffected canonical-spec rules.

## Context

Mashala can currently route and execute declared JSON-body writes and can run
field-level `GET` sources for `f.reference`. It cannot declare a goal-level read
such as "What is my account balance?" or "Show me the products," nor can it
describe a deterministic browser presentation for the returned data.

A read capability must preserve the existing trust boundaries. The developer,
not the LLM, must choose the method, path, parameter bindings, response mapping,
formatting, and presentation. The target request must execute in the user's
browser through `TargetBackendRequest`, and browser display must not implicitly
make backend data visible to the Mashala server or model.

## Decision

### Spec version and capability kinds

The next canonical artifact is **`MashalaSpec` v0.3**.

`CapabilitySpec` becomes a closed discriminated union:

```ts
type CapabilitySpec = WriteCapabilitySpec | ReadCapabilitySpec;

interface WriteCapabilitySpec {
  readonly kind: "write";
  readonly id: string;
  readonly description: string;
  readonly form: FormDefinition;
  readonly operation: WriteBackendOperation;
  readonly confirmation: "required" | "none";
}

interface ReadCapabilitySpec {
  readonly kind: "read";
  readonly id: string;
  readonly description: string;
  readonly input?: FormDefinition;
  readonly operation: ReadBackendOperation;
  readonly result: ResultView;
}
```

The required `kind` property makes execution and presentation branches
unambiguous. Existing write authoring remains `defineCapability`; once the v0.3
compiler is implemented it emits `kind: "write"`. New read authoring is named
`defineReadCapability`. Result authoring uses the closed helpers `result.card`
and `result.cardList`.

This ADR accepts the contract only. The executable spec remains v0.2 until the
separate implementation issues change it.

### Write capabilities

Write behavior is unchanged except for the v0.3 `kind: "write"` discriminant.
A write has a required form, one declared `POST`, `PUT`, or `PATCH` JSON-body
operation, same-named body-property mapping, and its existing confirmation
policy. This ADR does not relax confirmation or authorize `GET` through the
write executor.

### Read capabilities and input

A read declares exactly one operation whose method is `GET`. It has no request
body and no confirmation property. Its path is root-relative, developer
authored, and contains no origin, query string, fragment, headers, or
credentials.

Omitting `input` declares a zero-input read. Such an operation has no path
placeholders and no bindings. When input is needed, `input` is an ordinary
compiled `FormDefinition`; JSON Schema Draft 2020-12 remains its sole source of
validation, and the existing deterministic form renderer remains the intended
input UI.

The LLM may route to the read's declared ID and propose values only for fields
in `input`. Those values remain untrusted and editable and must pass the input
schema. A route or proposal never supplies an operation property.

### Path and query bindings

The read operation may contain one explicit `bindings` object:

```ts
interface ReadInputBindings {
  /** Path placeholder name -> input property name. */
  readonly path?: Readonly<Record<string, string>>;

  /** Target query-parameter name -> input property name. */
  readonly query?: Readonly<Record<string, string>>;
}

interface ReadBackendOperation {
  readonly method: "GET";
  readonly path: string;
  readonly bindings?: ReadInputBindings;
  readonly modelContext?: ModelVisibleBackendProjection;
}
```

Path placeholders use the syntax `{name}`. For example:

```ts
operation: {
  method: "GET",
  path: "/products/{id}",
  bindings: { path: { id: "productId" } }
}
```

A query filter is similarly explicit:

```ts
operation: {
  method: "GET",
  path: "/products",
  bindings: { query: { max_price: "maxPrice" } }
}
```

The following invariants apply:

- every placeholder appears exactly once in the path and has exactly one path
  binding;
- every binding names an input schema property, and every input property is
  used by exactly one path or query binding;
- a path-bound input is required by the input schema;
- query-bound inputs may be required or optional; an absent optional value
  omits that query parameter;
- URL-bound schemas are scalar `string`, `number`/`integer`, or `boolean`
  schemas; arrays, objects, and `null` are unsupported;
- placeholder and query names are fixed developer-authored names, not values
  proposed by the LLM;
- the literal path cannot contain a query string or fragment, and a binding
  cannot add a second request or change the target origin.

Only a complete schema-valid input can be resolved. Strings use their exact
validated value; finite numbers use their JSON number serialization; booleans
become lowercase `true` or `false`. The resulting UTF-8 text is RFC 3986
percent-encoded with spaces as `%20`. Path values replace only their declared
placeholder, so encoded `/`, `?`, and `#` cannot become URL structure. Query
pairs are emitted in declaration order. No implicit renaming, repeated
parameter, array expansion, object serialization, null convention, or generic
request-transformation language exists.

### Result views

Every read declares exactly one `result` of one of two kinds:

- `result.card` requires a root JSON object and renders one declared card;
- `result.cardList` requires a root JSON array of objects and applies one
  declared card template to each item in order.

A card has a required title, an optional image, an optional description, and
zero or more developer-labeled facts. Title and description content is an
explicit union of:

- fixed developer text: `{ kind: "fixed", text: "Account balance" }`; or
- a backend value: `{ kind: "property", property: "title", formatter: ... }`.

A fact has a stable ID, a fixed developer-authored label, and a backend-property
value descriptor. An image has one backend-property descriptor using only the
`imageUrl` formatter plus fixed developer-authored alternative text. Fixed text
is never interpreted as a response property, and backend values are rendered
as data, never as HTML or markup.

Backend value descriptors select only an own, enumerable, direct property of
the root object or current list item. Nested paths, expressions, fallbacks,
conditionals, filters, sorting, joins, computed fields, and arbitrary
transformations are not supported. If a declared property is absent or has the
wrong type, the object result—or the complete list result if any item is
invalid—fails as an invalid response. An empty root array is a successful empty
result and uses the list's fixed developer-authored `emptyText`.

### Formatter allowlist

The v0.3 formatter union is closed to:

- `text`: a JSON string, escaped and rendered as text;
- `number`: a finite JSON number with an explicit BCP 47 locale;
- `currency`: a finite JSON number with explicit BCP 47 locale and ISO 4217
  currency code;
- `date`: an ISO 8601 full-date string with an explicit BCP 47 locale;
- `dateTime`: an RFC 3339 date-time string with explicit BCP 47 locale and IANA
  time zone;
- `imageUrl`: a root-relative URL string resolved against the target-backend
  base URL, or an absolute HTTP(S) URL without embedded credentials; `data:`,
  `javascript:`, `blob:`, and other schemes are rejected.

There is no formatter inference. In particular, the model cannot guess a
currency, locale, or time zone. Image alternative text is fixed developer text,
and the renderer controls all image attributes and fallback behavior.

The browser uses the declared locale with the platform's `Intl` implementation:
`number` uses `Intl.NumberFormat(locale)` defaults; `currency` adds only
`{ style: "currency", currency }`; `date` parses the full-date as a UTC calendar
date and uses `{ dateStyle: "medium", timeZone: "UTC" }`; and `dateTime` parses
the RFC 3339 instant and uses
`{ dateStyle: "medium", timeStyle: "short", timeZone }`. No model or runtime
locale default, currency guess, relative-time phrase, or custom format string
is permitted.

### Response roots and pagination

v0.3 supports only a root object for `card` and a root array of objects for
`cardList`. Wrapped collections such as `{ "results": [...] }`, pagination
metadata, cursors, link traversal, automatic follow-up requests, and incremental
loading are **deferred**. A wrapped or paginated response does not match the
v0.3 result contract. A developer can expose a dedicated root-array endpoint;
Mashala does not add a response-unwrapping language.

### Browser execution and model visibility

The browser executes the declared `GET` through the same
`TargetBackendRequest` integration used by reference reads and confirmed
writes. The Mashala server receives no execution command and does not proxy the
request. Target-backend authorization remains authoritative.

The result view is a browser-presentation allowlist only. Displaying a property
does not authorize sending it to the Mashala server, LLM, or conversation
state. When later language interpretation genuinely needs selected result data,
the read operation is the browser-executed source to which the existing
ADR-016 `modelContext` descriptor may be attached. Browser-side ADR-016
projection remains the only model-visible path; absence or failure of that
descriptor emits no `backend.context.selected` event. Presentation mappings
and model-context mappings do not imply one another.

Target-backend credentials and authentication material are prohibited from the
canonical spec, result mappings, runtime protocol, model context, and persisted
conversation data. The callable auth integration remains browser-only behavior.

## Consequences

- Mashala can describe the balance-card and product-list cases without a
  generic REST client or model-generated UI.
- Zero-input reads and scalar parameterized reads share the existing form and
  validation concepts.
- Explicit path/query bindings keep the LLM from constructing URLs or request
  parameters.
- Result presentation is deterministic, JSON-serializable, directly testable,
  and intentionally less expressive than arbitrary components.
- Write confirmation semantics remain unchanged.
- Wrapped/paginated collections and more expressive mapping/formatting require
  a later concrete requirement and spec decision.
- ISSUE-061, ISSUE-062, and ISSUE-063 remain implementation work and are not
  completed by this ADR.
