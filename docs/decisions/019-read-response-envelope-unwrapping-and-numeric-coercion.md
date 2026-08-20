# ADR-019 — Read response envelope unwrapping and numeric string coercion

**Status:** Accepted

**Extends and partially supersedes:** ADR-017's clauses that restrict result views strictly to flat root objects/arrays without path traversal, and the clause that restricts `number` and `currency` formatters exclusively to JSON numbers. ADR-017 remains authoritative for read capability kinds, GET operations, URL bindings, the closed formatter list, browser execution, and model-visibility boundaries.

## Context

ADR-017 introduced goal-level read capabilities and deterministic result views (`result.card` and `result.cardList`) in `MashalaSpec` v0.3. However, ADR-017 intentionally restricted result evaluation to top-level properties of a flat root JSON object or a flat root JSON array.

In production and reference frameworks (such as Django REST Framework in the AI Wallet backend, Rails, Spring Boot, and FastAPI):
1. Single-resource responses are commonly wrapped in envelopes, such as:
   ```json
   {
     "balance": {
       "account_number": "ACC0C0930E867854AE493C0A3290D25169ABCC70977F6CC4F",
       "balance": "3.50",
       "status": "active"
     },
     "message": "Balance retrieved successfully"
   }
   ```
2. Collections are commonly wrapped in pagination/envelope structures:
   ```json
   {
     "count": 12,
     "results": [
       { "id": "bill_1", "amount": "45.00", "status": "unpaid" }
     ]
   }
   ```
3. Financial quantities (e.g., Django `models.DecimalField`) are serialized by default as string decimals (e.g. `"3.50"`) to avoid floating-point inaccuracies in JSON serialization.

Under ADR-017, these standard patterns fail with `response-shape-error` because Mashala cannot navigate inside an envelope or parse decimal strings for currency formatting.

At the same time, [SCOPE.md](../SCOPE.md) explicitly forbids turning Mashala into a generic REST client or arbitrary transformation language (like JQ or client-side evaluation scripts).

## Decision

### 1. Spec Version

The canonical specification advances to **`MashalaSpec` v0.4**.

### 2. Optional `root` Path Unwrapping

`CardResultView` and `CardListResultView` gain an optional `root` property:

```ts
export interface CardResultView {
  readonly kind: "card";
  readonly root?: string;
  readonly card: ResultCard;
}

export interface CardListResultView {
  readonly kind: "cardList";
  readonly root?: string;
  readonly card: ResultCard;
  readonly emptyText: string;
}
```

#### Syntax and Traversal Rules
- `root` is an optional dot-delimited string matching `^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$` (e.g., `"balance"`, `"data.account"`, or `"results"`).
- When `root` is omitted or undefined:
  - `card` expects the HTTP response root to be a plain JSON object.
  - `cardList` expects the HTTP response root to be a plain JSON array of objects.
- When `root` is specified:
  - The browser executor starts at the response root object and navigates segment by segment.
  - For `card`: the resolved target value at the end of the path must be a plain JSON object.
  - For `cardList`: the resolved target value at the end of the path must be a plain JSON array of objects.
  - If any intermediate segment is not a plain JSON object, or if the target key is absent or of the wrong type, execution fails deterministically with `response-shape-error`.
- Traversal is read-only, deterministic, and strictly property-based. No array indexing (`items[0]`), wildcards (`*.id`), slice notation, filters, or expressions are permitted.

### 3. Developer DSL Helpers

The authoring helpers `result.card` and `result.cardList` accept an optional `root` parameter:

```ts
// Authoring a wrapped object card
result.card({
  root: "balance",
  card: {
    title: { kind: "fixed", text: "Account Balance" },
    facts: [
      {
        id: "balance",
        label: "Available Balance",
        value: {
          kind: "property",
          property: "balance",
          formatter: { kind: "currency", locale: "en-US", currency: "USD" },
        },
      },
    ],
  },
});

// Authoring a wrapped collection list
result.cardList({
  root: "results",
  emptyText: "No bills found.",
  card: { ... },
});
```

### 4. Numeric String Coercion for Formatters

The `number` and `currency` formatters are extended to deterministically accept valid decimal strings in addition to JSON numbers:

- A value is valid for `number` and `currency` if:
  1. It is a finite JavaScript number (`typeof value === "number" && Number.isFinite(value)`); OR
  2. It is a string matching the strict finite decimal pattern `/^-?\d+(?:\.\d+)?$/`.
- When a valid decimal string is encountered:
  - It is converted via `Number(value)` into a finite number.
  - It is formatted using the declared `Intl.NumberFormat` configuration (locale, currency style).
- Any other string (e.g. `""`, `"abc"`, `"NaN"`, `"12.34.56"`, `"$3.50"`) fails validation as a type-incompatible property and deterministically produces `response-shape-error`.

### 5. Invariants & Trust Boundaries

1. **Security & Privacy:** Unwrapping happens purely in the browser client inside `executeReadCapability`. Raw response envelopes, metadata, and unused sibling fields are never forwarded to the Mashala server or LLM unless explicitly projected under ADR-016.
2. **No Arbitrary Transformations:** The `root` descriptor is strictly a static dot-path property accessor. No calculation, transformation, filtering, or sorting language is introduced.
3. **Deterministic Failures:** Missing envelope keys or invalid string formats fail immediately as `response-shape-error`; the engine never guesses missing values or displays partial corrupted cards.

## Consequences

- Endpoints returning envelope structures (like AI Wallet's `/api/v1/banking/balance/` and paginated lists) can be mapped directly and cleanly into deterministic result cards.
- Standard SQL/DRF `DecimalField` string serializations are safely formatted without requiring custom backend serialization flags.
- Backward compatibility with existing v0.3 flat capabilities is fully preserved.
