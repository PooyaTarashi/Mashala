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

The v0.1 request surface is one browser-side callable:

```ts
interface TargetBackendRequest {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
```

The target application supplies this behavior when its normal `fetch` behavior
is not sufficient. The same callable is used for confirmed writes and
`f.reference` reads. Its implementation may use the target application's
existing cookies, token manager, refresh logic, or another browser-compatible
session mechanism; Mashala does not receive a serialized credential or define
how one is stored. Without an injected callable, the browser runtime uses the
browser's ordinary `fetch` directly.

### Credential rule

```text
User credential ──► Browser / target backend
User credential ─X─► LLM
```

The Mashala server should not require the target-backend credential under the default architecture.

Mashala must not prescribe insecure persistence such as “always store access tokens in localStorage.”

Bearer tokens are therefore one possible target-app implementation detail, not
the canonical Mashala integration model.

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

### Offline RAG artifacts

ADR-014 places documentation indexing and runtime retrieval inside the isolated
Python container boundary. Offline building produces the versioned, plain-JSON
Mashala manifest defined in `RAG_ARTIFACT_CONTRACT.md`. It records embedding
compatibility, chunks and source provenance, retrieval-ID mappings, and an
arbitrary-length list of opaque retrieval-index artifact descriptors. The
manifest exposes no FAISS class, index type, or serialization detail to Node.

At runtime, the persistent Python service defined in
`RAG_RETRIEVAL_SERVICE.md` validates and loads that bundle once, embeds each
query with the artifact-compatible local Ollama configuration, searches the
retained private index, and returns plain chunks with provenance and scores over
one JSON `POST /retrieve` operation. It performs no conversational answering or
target-backend execution.

### Documentation knowledge answers

The ISSUE-048 server-only knowledge path described in
`KNOWLEDGE_ANSWER_FLOW.md` invokes the provider-neutral Node retriever before
the provider-neutral conversational model. It sends only a bounded selection of
ranked chunks to the model as explicitly labeled untrusted data. A grounded
answer must cite selected Mashala chunk IDs, which deterministic code binds back
to retained source provenance. Empty or insufficient support produces an
explicit insufficient-context result instead of an application-specific guess.

This path has no capability, operation, confirmation, workflow, credential, or
target-backend request input and does not alter the browser-direct execution
boundary.

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

Do not automatically forward every backend response to the LLM. ADR-016 resolves the minimization mechanism: an optional declarative descriptor on the browser read source maps explicitly allowed direct source properties to plain JSON output properties. No descriptor means no backend-result event. Projection and credential checks run in the browser before `backend.context.selected` is constructed; the server receives only the minimized result and treats it as untrusted contextual input.

## Goal-level read capabilities and result views

ADR-017 and `CANONICAL_SPEC.md` v0.3 define goal-level browser reads separately
from writes. A read capability declares exactly one `GET`, may omit input or
reuse the compiled deterministic form contract, and maps schema-valid scalar
input values only through explicit path-placeholder or query-parameter
bindings.

```text
user language
  -> LLM proposes a declared read ID and declared input values only
  -> browser validates the route and input
  -> browser resolves the developer-authored GET URL
  -> TargetBackendRequest calls the target backend directly
  -> browser validates the response root
  -> browser renders the developer-declared card or card list
```

The result contract supports a root object rendered as one card and a root
array of objects rendered through one repeated card declaration. Result values
come only from declared direct properties and a closed deterministic formatter
allowlist. Fixed titles, labels, empty-state text, and image alternative text
are developer-authored. Backend values are escaped data, never HTML or
components. Wrapped/paginated arrays and general transformations are deferred.

Browser presentation and model visibility are separate allowlists. Rendering a
result does not send it to the Mashala server. Only an optional ADR-016
projection on the read operation may create minimized
`backend.context.selected` data for a later language task.

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

## Normative contracts

The accepted machine-readable application contract is `CANONICAL_SPEC.md` v0.3,
established by ADR-012 and extended by ADR-016 and ADR-017. It preserves the
JSON Schema/presentation split, distinguishes writes from reads, and defines
the minimal browser-executed request and deterministic result bindings. The
executable TypeScript contract is v0.3. ISSUE-061 implements read authoring,
binding validation, and browser execution; deterministic result-card rendering
and page-workflow integration remain pending.

The browser/server language-assistance contract is `RUNTIME_PROTOCOL.md`, accepted by ADR-013. Its logical events are independent of transport. In particular, the protocol has no event that asks the Mashala server to execute a target-backend request.

The implementation stack is fixed by ADR-011 and `TECH_STACK.md`. Next.js server code hosts only Mashala protocol/provider responsibilities; choosing Next.js does not alter ADR-003's browser-direct target-backend boundary.

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
