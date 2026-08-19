# Read-capability examples

The executable examples in [`src/examples/read-capabilities.ts`](../src/examples/read-capabilities.ts)
use Mashala's public developer-facing `defineReadCapability`, `result.card`,
`result.cardList`, and `f.text` APIs. They are included in
[`mashala.config.ts`](../mashala.config.ts), so the normal conversation page
routes to and renders the declarations rather than test-only components.

| User request | Declared capability | Browser request | Deterministic result |
| --- | --- | --- | --- |
| “What is my account balance?” | `account_balance` | `GET /account/balance` | One fixed-title balance card with currency, status, and masked account number facts |
| “Show me a product” | `show_product` | `GET /products/{id}` after schema-valid `productId` input | One image/title/description/price card |
| “Show me the products” | `list_products` | `GET /products` | A root-array list of repeated product cards, or fixed empty text |

The product identifier may be proposed from language or left for the user to
complete in the deterministic form. It is required and schema-validated before
Mashala percent-encodes it into the declared path placeholder. Neither the
model nor the fixture chooses the method, path shape, binding, currency, or
presentation.

## Deterministic E2E backend

[`e2e/fixtures/vertical-slice-gateway.mjs`](../e2e/fixtures/vertical-slice-gateway.mjs)
hosts a local target backend alongside the existing fake Mashala runtime. The
target endpoints require the fixture's browser-only HttpOnly session cookie and
record which handler received each request. Product images are local SVG
responses. No Gemini, Ollama, real target credential, or external network is
used.

[`e2e/read-capabilities.spec.ts`](../e2e/read-capabilities.spec.ts) covers:

- routing and zero-input balance loading/success;
- missing product-identifier completion and encoded path binding;
- product-list loading/success and empty state;
- malformed product data, target authorization failure, and a deterministic
  Playwright network abort;
- browser initiation and fixture-target handling of every declared `GET`;
- absence of target credentials, target paths, and full response sentinels from
  `/api/runtime` traffic.

These example operations intentionally omit `modelContext`. Result mappings
authorize browser presentation only, so no displayed response becomes runtime
or model input. If a later language task genuinely requires selected data, the
developer may explicitly add ADR-016's `operation.modelContext` direct-property
projection. Even then, only the browser-produced projection may cross
`/api/runtime`; the full response and target credential remain prohibited.
