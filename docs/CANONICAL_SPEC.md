# Canonical Compiled Mashala Spec v0.3

## Purpose and authority

This document is the normative JSON-serializable artifact produced by the
developer-facing DSL. It defines the smallest contract used by capability
routing, deterministic input validation and rendering, browser-side
target-backend execution, and deterministic read-result presentation.

ADR-012 established the original write-capability shape, ADR-016 established
explicit browser-side model-visible projection, and ADR-017 adds goal-level
read capabilities and result views while preserving write behavior.

`src/spec.ts`, `src/capabilities.ts`, and `src/application.ts` implement the
v0.3 read/write capability union. ISSUE-061 adds read authoring, binding
validation, and browser execution; ISSUE-062 adds result-card authoring and
compilation. Result-card rendering and page-workflow integration remain in
ISSUE-063.

## TypeScript contract

```ts
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonObject
  | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A JSON Schema Draft 2020-12 document or subschema. */
export type JsonSchema202012 = JsonObject;

export interface MashalaSpec {
  readonly specVersion: "0.3";
  readonly app: AppMetadata;
  readonly capabilities: readonly CapabilitySpec[];
}

export interface AppMetadata {
  /** Stable machine ID: lowercase letters, digits, and underscores. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export type CapabilitySpec = WriteCapabilitySpec | ReadCapabilitySpec;

export interface CapabilityBase {
  /** Stable machine ID: lowercase letters, digits, and underscores. */
  readonly id: string;

  /** Natural-language description supplied to capability routing. */
  readonly description: string;
}

export interface WriteCapabilitySpec extends CapabilityBase {
  readonly kind: "write";
  readonly form: FormDefinition;
  readonly operation: WriteBackendOperation;
  readonly confirmation: ConfirmationPolicy;
}

export interface ReadCapabilitySpec extends CapabilityBase {
  readonly kind: "read";

  /** Omitted for a zero-input read. */
  readonly input?: FormDefinition;

  readonly operation: ReadBackendOperation;
  readonly result: ResultView;
}

export interface FormDefinition {
  /** The sole canonical source of deterministic input validation. */
  readonly schema: FormObjectSchema;

  /** Mashala rendering/runtime metadata, keyed by schema property name. */
  readonly fields: Readonly<Record<string, FieldMetadata>>;
}

export interface FormObjectSchema {
  readonly $schema: "https://json-schema.org/draft/2020-12/schema";
  readonly $id?: string;
  readonly type: "object";
  readonly properties: Readonly<Record<string, JsonSchema202012>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

export interface FieldPresentationBase {
  readonly label: string;
  readonly helpText?: string;
}

export interface TextFieldMetadata extends FieldPresentationBase {
  readonly kind: "text";
}

export interface LongTextFieldMetadata extends FieldPresentationBase {
  readonly kind: "longText";
}

export interface NumberFieldMetadata extends FieldPresentationBase {
  readonly kind: "number";
}

export interface SelectFieldMetadata extends FieldPresentationBase {
  readonly kind: "select";
  readonly optionLabels: Readonly<Record<string, string>>;
}

export interface BooleanFieldMetadata extends FieldPresentationBase {
  readonly kind: "boolean";
}

export interface ReferenceFieldMetadata extends FieldPresentationBase {
  readonly kind: "reference";
  readonly source: {
    readonly method: "GET";
    readonly path: string;
    readonly modelContext?: ModelVisibleBackendProjection;
  };
  readonly value: string;
  readonly labelFrom: string;
}

export type FieldMetadata =
  | TextFieldMetadata
  | LongTextFieldMetadata
  | NumberFieldMetadata
  | SelectFieldMetadata
  | BooleanFieldMetadata
  | ReferenceFieldMetadata;

export interface WriteBackendOperation {
  readonly method: "POST" | "PUT" | "PATCH";

  /** Root-relative path; no origin, query, headers, or credentials. */
  readonly path: string;
}

export interface ReadBackendOperation {
  readonly method: "GET";

  /** Root-relative path with optional declared `{placeholder}` tokens. */
  readonly path: string;

  readonly bindings?: ReadInputBindings;

  /** Optional ADR-016 browser-side model-context allowlist. */
  readonly modelContext?: ModelVisibleBackendProjection;
}

export interface ReadInputBindings {
  /** Path placeholder name -> input property name. */
  readonly path?: Readonly<Record<string, string>>;

  /** Target query-parameter name -> input property name. */
  readonly query?: Readonly<Record<string, string>>;
}

export type ConfirmationPolicy = "required" | "none";

export type ResultView = CardResultView | CardListResultView;

export interface CardResultView {
  readonly kind: "card";
  readonly card: ResultCard;
}

export interface CardListResultView {
  readonly kind: "cardList";
  readonly card: ResultCard;

  /** Fixed developer-authored text for a successful empty root array. */
  readonly emptyText: string;
}

export interface ResultCard {
  readonly title: ResultText;
  readonly image?: ResultImage;
  readonly description?: ResultText;
  readonly facts?: readonly ResultFact[];
}

export type ResultText = FixedResultText | ResultPropertyValue;

export interface FixedResultText {
  readonly kind: "fixed";
  readonly text: string;
}

export interface ResultPropertyValue {
  readonly kind: "property";

  /** Own enumerable direct property of the result object or list item. */
  readonly property: string;

  readonly formatter: TextResultFormatter;
}

export interface ResultFact {
  /** Stable machine ID within this card. */
  readonly id: string;

  /** Fixed developer-authored label; never read from the response. */
  readonly label: string;

  readonly value: ResultPropertyValue;
}

export interface ResultImage {
  readonly source: {
    readonly kind: "property";
    readonly property: string;
    readonly formatter: ImageUrlResultFormatter;
  };

  /** Fixed developer-authored alternative text. */
  readonly alt: string;
}

export type TextResultFormatter =
  | TextFormatter
  | NumberFormatter
  | CurrencyFormatter
  | DateFormatter
  | DateTimeFormatter;

export interface TextFormatter {
  readonly kind: "text";
}

export interface NumberFormatter {
  readonly kind: "number";
  readonly locale: string;
}

export interface CurrencyFormatter {
  readonly kind: "currency";
  readonly locale: string;
  readonly currency: string;
}

export interface DateFormatter {
  readonly kind: "date";
  readonly locale: string;
}

export interface DateTimeFormatter {
  readonly kind: "dateTime";
  readonly locale: string;
  readonly timeZone: string;
}

export interface ImageUrlResultFormatter {
  readonly kind: "imageUrl";
}

export type ModelContextPurpose =
  | "reference_resolution"
  | "result_interpretation";

export interface ModelVisibleBackendProjection {
  readonly purpose: ModelContextPurpose;

  /** Output property name -> direct backend-result source property name. */
  readonly fields: Readonly<Record<string, string>>;
}
```

`JsonSchema202012` remains an intentionally open JSON object type. JSON Schema
is the validation vocabulary; Mashala does not define a partial competing
schema language. The narrower `FormObjectSchema` fixes the root invariants that
Mashala relies on.

## Capability authoring

The developer-facing distinction is explicit:

- the existing `defineCapability` authors writes and compiles to
  `kind: "write"` in v0.3;
- `defineReadCapability` authors reads;
- the existing `f.*` field DSL authors a write `form` or optional read `input`;
- `result.card` and `result.cardList` author the only result-view kinds.

Conceptually:

```ts
defineReadCapability({
  id: "list_products",
  description: "Show products, optionally below a maximum price.",
  input: {
    maxPrice: f.number({ label: "Maximum price", minimum: 0 })
  },
  operation: {
    method: "GET",
    path: "/products",
    bindings: { query: { max_price: "maxPrice" } }
  },
  result: result.cardList({
    emptyText: "No products matched.",
    card: {
      title: {
        kind: "property",
        property: "title",
        formatter: { kind: "text" }
      },
      facts: [
        {
          id: "price",
          label: "Price",
          value: {
            kind: "property",
            property: "price",
            formatter: {
              kind: "currency",
              locale: "en-US",
              currency: "USD"
            }
          }
        }
      ]
    }
  })
});
```

These helper calls are developer authoring, not canonical executable functions.
The compiler emits only the isolated JSON data described by the contract.

## Normative invariants

A compiled v0.3 spec is valid only when all of the following hold:

1. `specVersion` is exactly `"0.3"`.
2. App, capability, and result-fact IDs match `^[a-z][a-z0-9_]*$` in their
   respective scopes. Capability IDs are unique and stable once published;
   fact IDs are unique within one card.
3. Every capability has exactly one declared `kind`, and its properties match
   only that branch of the capability union.
4. Every `form.fields` key exists in `form.schema.properties`, and every schema
   property has exactly one field-metadata entry. Unknown metadata keys are
   invalid. The same rule applies to a read's `input`.
5. Every name in `schema.required` exists in `schema.properties`; form roots use
   `additionalProperties: false`.
6. Field kinds retain the v0.2 schema compatibility and reference-source rules.
   JSON Schema owns required status and value validation; field metadata owns
   presentation/runtime information.
7. A write has `kind: "write"`, one required form, one JSON-body `POST`, `PUT`,
   or `PATCH` operation, and one confirmation policy. It has no `input`, read
   bindings, read result, or operation-level `modelContext`.
8. A write copies each validated form property to the same-named JSON body
   property. No request-field renaming or transformation occurs. A
   consequential write uses `confirmation: "required"`.
9. A read has `kind: "read"`, exactly one `GET` operation, exactly one result
   view, no request body, no write form, and no confirmation property.
10. A read path begins with exactly one `/`, contains no origin, backslash,
    query string, or fragment, and contains only zero or more valid
    `{placeholder}` tokens. Each placeholder occurs exactly once. Placeholder
    names match `^[A-Za-z][A-Za-z0-9_]*$`; unmatched braces are invalid.
11. A zero-input read omits `input` and `bindings` and has no path placeholder.
    A present input has at least one property.
12. Binding keys are fixed developer-authored URL names. Path keys exactly
    match the path placeholders. Query names match
    `^[A-Za-z][A-Za-z0-9_.-]*$`. Every binding points to an input property,
    every input property is bound exactly once across path and query, and no
    query name is repeated.
13. A path-bound input is required. URL-bound property schemas accept one
    scalar `string`, `number`/`integer`, or `boolean` value; arrays, objects,
    and `null` are unsupported.
14. Only a complete schema-valid input may resolve a URL. Strings retain their
    exact value; finite numbers use JSON number serialization; booleans become
    lowercase `true` or `false`. UTF-8 text uses RFC 3986 percent encoding with
    spaces as `%20`. An absent optional query value omits its pair. Query pairs
    preserve binding declaration order.
15. A `card` view accepts only a root plain JSON object. A `cardList` accepts
    only a root JSON array whose items are plain objects. An empty array is a
    successful empty result; root primitives and wrapped arrays are invalid.
16. Result property descriptors name own enumerable direct properties only.
    Nested paths, expressions, fallbacks, conditionals, filters, sorting,
    joins, computed values, and executable transformations are invalid.
17. A declared missing or type-incompatible property invalidates the complete
    card or card-list result. Lists do not silently drop invalid items.
18. `fixed` result text, fact labels, list `emptyText`, and image alternative
    text are developer-authored strings. They never select backend properties.
    Backend values always use an explicit `property` descriptor and formatter.
19. Formatters are limited to `text`, `number`, `currency`, `date`, `dateTime`,
    and `imageUrl`. No default or inferred formatter exists. Locale, currency,
    and time-zone values are explicit where required.
20. `text` requires a JSON string; `number` and `currency` require a finite JSON
    number; `date` requires an ISO 8601 full-date string; `dateTime` requires an
    RFC 3339 date-time string; and `imageUrl` requires a root-relative URL or an
    absolute HTTP(S) URL without embedded credentials. Root-relative image URLs
    resolve against the target-backend base URL. Other URL schemes are invalid.
21. Result text is rendered as text, never HTML. The renderer—not backend data
    or the model—owns markup, component selection, image attributes, and
    fallback behavior.
22. `operation.modelContext`, when present on a read, is ADR-016's existing
    output-to-direct-source-property projection. It is independent of the
    result view and confers no presentation authority.
23. Absence or failure of `operation.modelContext` never authorizes forwarding
    read-result data. A presentation property is not model-visible merely
    because the browser displays it.
24. Operations, bindings, result declarations, and model-context declarations
    contain no functions, arbitrary code, headers, credentials, cookies,
    tokens, provider settings, or model instructions.

The compiler and runtime must reject malformed canonical data before it can
control a request or presentation. LLM output never changes any declaration.

## Read URL binding

Bindings are allowlists, not templates produced by the model. The mapping
direction is always URL name to input property name:

```json
{
  "method": "GET",
  "path": "/products/{id}",
  "bindings": {
    "path": { "id": "productId" },
    "query": { "include_reviews": "includeReviews" }
  }
}
```

Given schema-valid `{ "productId": "A/B", "includeReviews": true }`, the
resolved path/query is:

```text
/products/A%2FB?include_reviews=true
```

The LLM may have proposed `productId` or `includeReviews`, but it cannot propose
`GET`, `/products/{id}`, `id`, `include_reviews`, or the binding. A missing
required `productId` prevents execution. An absent optional query input omits
only that query pair.

There are no fixed or dynamic headers, query fragments embedded in `path`,
repeated parameters, arrays, object serialization, custom encoders, request
chaining, or generic request transformations in v0.3.

## Result cards and lists

`card` maps one root response object. `cardList` applies one card declaration to
each root-array object in backend order. It does not filter, sort, group, join,
or paginate.

The browser reads only declared direct properties for presentation. For
example, this balance response:

```json
{
  "balance": 1250.5,
  "status": "available",
  "internal_note": "not presented"
}
```

may use a fixed title, currency-formatted `balance`, and text-formatted
`status`. `internal_note` is not rendered because the result declaration does
not select it. All selected backend text is escaped as data. Result metadata
contains no HTML, JSX, React component, CSS, expression, or callback.

The formatter allowlist has these deterministic inputs:

| Formatter | Accepted backend value | Required developer configuration |
| --- | --- | --- |
| `text` | string | none |
| `number` | finite number | BCP 47 `locale` |
| `currency` | finite number | BCP 47 `locale`, ISO 4217 `currency` |
| `date` | ISO 8601 full-date string | BCP 47 `locale` |
| `dateTime` | RFC 3339 date-time string | BCP 47 `locale`, IANA `timeZone` |
| `imageUrl` | root-relative or absolute HTTP(S) URL string without credentials | fixed developer `alt` on the image declaration |

Formatting uses the browser platform's declared-locale `Intl` behavior with a
fixed option set: `number` uses `Intl.NumberFormat(locale)` defaults;
`currency` adds only `{ style: "currency", currency }`; `date` parses the ISO
full-date as a UTC calendar date and uses
`{ dateStyle: "medium", timeZone: "UTC" }`; and `dateTime` parses the RFC 3339
instant and uses
`{ dateStyle: "medium", timeStyle: "short", timeZone }`. Locale, ISO 4217
currency, and IANA time-zone identifiers are compiler-validated developer
configuration. The model and runtime do not infer them or accept custom format
strings.

Malformed selected data fails the response rather than falling back to model
text or an inferred formatter.

## Complete compiled example

This compiled v0.3 example includes an unchanged write, a zero-input object
read, and a query-bound array read:

```json
{
  "specVersion": "0.3",
  "app": {
    "id": "mashala_demo",
    "name": "Mashala Demo",
    "description": "A demonstration application with declared writes and reads."
  },
  "capabilities": [
    {
      "kind": "write",
      "id": "transfer_money",
      "description": "Transfer money to a recipient.",
      "form": {
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "properties": {
            "recipient": { "type": "string", "minLength": 1 },
            "amount": { "type": "number", "minimum": 0.01 }
          },
          "required": ["recipient", "amount"],
          "additionalProperties": false
        },
        "fields": {
          "recipient": { "kind": "text", "label": "Recipient" },
          "amount": { "kind": "number", "label": "Amount" }
        }
      },
      "operation": { "method": "POST", "path": "/transfers" },
      "confirmation": "required"
    },
    {
      "kind": "read",
      "id": "account_balance",
      "description": "Show the user's current account balance.",
      "operation": { "method": "GET", "path": "/account/balance" },
      "result": {
        "kind": "card",
        "card": {
          "title": { "kind": "fixed", "text": "Account balance" },
          "facts": [
            {
              "id": "balance",
              "label": "Balance",
              "value": {
                "kind": "property",
                "property": "balance",
                "formatter": {
                  "kind": "currency",
                  "locale": "en-US",
                  "currency": "USD"
                }
              }
            },
            {
              "id": "status",
              "label": "Status",
              "value": {
                "kind": "property",
                "property": "status",
                "formatter": { "kind": "text" }
              }
            }
          ]
        }
      }
    },
    {
      "kind": "read",
      "id": "list_products",
      "description": "Show products, optionally below a maximum price.",
      "input": {
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "properties": {
            "maxPrice": { "type": "number", "minimum": 0 }
          },
          "additionalProperties": false
        },
        "fields": {
          "maxPrice": {
            "kind": "number",
            "label": "Maximum price"
          }
        }
      },
      "operation": {
        "method": "GET",
        "path": "/products",
        "bindings": {
          "query": { "max_price": "maxPrice" }
        }
      },
      "result": {
        "kind": "cardList",
        "emptyText": "No products matched.",
        "card": {
          "title": {
            "kind": "property",
            "property": "title",
            "formatter": { "kind": "text" }
          },
          "image": {
            "source": {
              "kind": "property",
              "property": "image_url",
              "formatter": { "kind": "imageUrl" }
            },
            "alt": "Product image"
          },
          "description": {
            "kind": "property",
            "property": "description",
            "formatter": { "kind": "text" }
          },
          "facts": [
            {
              "id": "price",
              "label": "Price",
              "value": {
                "kind": "property",
                "property": "price",
                "formatter": {
                  "kind": "currency",
                  "locale": "en-US",
                  "currency": "USD"
                }
              }
            }
          ]
        }
      }
    }
  ]
}
```

## Model-visible backend projection

Result presentation and model visibility are deliberately separate.

A result view authorizes browser rendering of specific properties. It does not
authorize a runtime event. If a later language task genuinely needs part of a
read result, the developer may attach ADR-016's existing `modelContext`
descriptor to the read operation:

```json
{
  "method": "GET",
  "path": "/products",
  "modelContext": {
    "purpose": "result_interpretation",
    "fields": { "id": "id", "label": "title" }
  }
}
```

The browser projects the already-fetched root object or array before creating
`backend.context.selected`. Missing policy or any projection failure creates no
event. The complete response remains browser-local, and projected data remains
untrusted model context with no authority over routing, bindings, operations,
validation, confirmation, workflow, authorization, or rendering.

## Explicit limitations

v0.3 does not support:

- wrapped arrays such as `{ "results": [...] }`;
- pagination metadata, cursors, automatic next-page requests, or incremental
  loading;
- nested response paths, aliases beyond ADR-016 output renaming, response
  unwrapping, filtering, sorting, joins, aggregation, or computed fields;
- arrays, objects, nulls, repeated query parameters, or custom serialization as
  URL-bound input values;
- fixed query fragments, custom headers, credentials, non-GET read methods, or
  request bodies on reads;
- arbitrary HTML, JSX, React components, CSS, scripts, callbacks, or
  model-generated presentation;
- server-side target-backend execution or a general REST client.

These limitations are intentional. A later concrete requirement must justify a
new compatible contract rather than adding a generic transformation language.

## Versioning

ADR-017 changes the required capability shape and adds read operations, URL
bindings, and result views, so the canonical artifact advances from v0.2 to
v0.3. Consumers must reject unsupported versions rather than guessing. The
runtime protocol remains v0.1 because no new browser/server event is required
to execute or display a read; the browser-direct request and browser-local
result are outside that protocol.
