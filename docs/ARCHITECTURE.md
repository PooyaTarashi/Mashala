# Architecture

## Architectural principle

Use AI where language is ambiguous; use deterministic software where correctness and side effects matter.

Mashala has three runtime actors:

```text
┌─────────────────────────┐
│ Mashala Server          │
│                         │
│ LLM provider adapter    │
│ capability routing      │
│ slot extraction         │
│ docs/RAG                │
│ dialogue/workflow state │
└────────────┬────────────┘
             │ structured messages
             │ selected API-result data when needed
             ▼
┌─────────────────────────┐
│ Mashala Browser Client  │
│                         │
│ chat UI                 │
│ deterministic forms     │
│ auth integration        │
│ dynamic field resolver  │
│ validation              │
│ human confirmation      │
│ target API execution    │
└────────────┬────────────┘
             │ authenticated HTTP
             ▼
┌─────────────────────────┐
│ Developer Backend       │
│                         │
│ authentication          │
│ authorization           │
│ business logic          │
│ application data        │
└─────────────────────────┘
```

## Critical boundary: backend calls execute in the browser

Authenticated target-application APIs run from the user's browser, as they would in a conventional frontend.

Examples:

```text
Browser ── GET /accounts ──► Target backend
Browser ── POST /transfers ─► Target backend
Browser ── POST /disputes ──► Target backend
```

The Mashala server is **not** a general backend-for-frontend proxy for these calls.

## Authentication

Mashala does not define the target application's authentication protocol.

The target application may use, for example:

- HttpOnly session cookies,
- OAuth/OIDC,
- short-lived bearer tokens,
- another existing browser-compatible mechanism.

Mashala provides an integration surface for login/session state and authenticated requests.

### Credential rule

```text
User credential ──► Browser / target backend
User credential ─X─► LLM
```

The Mashala server should not require the target-backend credential under the default architecture.

Mashala must not prescribe insecure persistence such as “always store access tokens in localStorage.”

## LLM provider secret

The developer's LLM API key is a deployment secret owned by the Mashala server runtime.

```text
Browser ─X─► LLM_API_KEY
Mashala server ──► LLM provider
```

The key may be supplied through environment variables or the deployment platform's secret manager.

## Build and deployment

Mashala defines commands/artifacts, not the developer's CI/CD system.

Expected interface:

```bash
mashala dev
mashala build
mashala start
```

`mashala build` may run:

- on the developer's machine,
- in GitHub Actions,
- in GitLab CI,
- in a Docker image build,
- on a hosting provider's build runner.

CI/CD selection is outside the framework's research scope.

## Data-backed form fields

A static schema is insufficient when form choices depend on the authenticated user.

Example:

```ts
fromAccount: f.reference({
  label: "From account",
  source: {
    method: "GET",
    path: "/accounts"
  },
  value: "id",
  labelFrom: "display_name"
})
```

Runtime flow:

```text
1. Mashala determines that `transfer_money` is relevant.
2. Browser renders the transfer form.
3. Browser resolves `fromAccount`.
4. Browser calls GET /accounts with the user's auth context.
5. Browser maps the response to allowed dropdown options.
6. User selects an account.
```

For v1, one declared read operation per data-backed field is enough.

Dependent/cascading fields are deferred.

## When API results need language interpretation

Sometimes the LLM needs information returned by the target backend.

Example:

```text
User: "I mean the card ending in 4417."

Browser has:
[
  {"id":"card_1","masked":"•••• 4417"},
  {"id":"card_2","masked":"•••• 9082"}
]
```

The browser may send an intentionally selected representation of this result to the Mashala server so the model can resolve the reference.

Preferred rule:

```text
target API result
      │
      ▼
browser selects/minimizes relevant data
      │
      ▼
Mashala server
      │
      ▼
LLM as untrusted contextual data
```

Do not automatically forward every backend response to the LLM.

This creates a future design question around data minimization and model-visible fields; see `OPEN_QUESTIONS.md`.

## Form execution model

The LLM does not generate arbitrary HTML and does not directly execute target-backend operations.

It may produce structured outputs such as:

```json
{
  "capability": "transfer_money",
  "fields": {
    "amount": 500000
  }
}
```

The browser then renders the developer-defined form and merges allowed extracted values.

## Deterministic workflow

One capability run follows an explicit state model similar to:

```text
IDLE
  → ROUTING
  → RESOLVING
  → FILLING
  → CONFIRMING
  → EXECUTING
  → DONE | FAILED
```

Meaning:

- `ROUTING`: LLM can help choose a declared capability.
- `RESOLVING`: runtime/client resolves dynamic application data.
- `FILLING`: LLM can extract values and ask for missing information.
- `CONFIRMING`: browser renders the final deterministic form; execution cannot occur without the required user action.
- `EXECUTING`: browser calls the declared target backend operation.
- `DONE/FAILED`: show target-backend outcome.

The workflow architecture must not depend on LangGraph. LangGraph may later implement this state machine if its persistence/interrupt features prove useful.

## Trust boundaries

### Trusted for control flow
- Mashala code
- accepted capability/spec configuration
- deterministic form validation
- explicit user confirmation
- target backend authorization

### Untrusted data
- user natural language
- LLM output
- target-backend text returned for model interpretation
- documents/RAG chunks in model context

LLM output is a proposal that must be checked against declared capabilities and schemas.
