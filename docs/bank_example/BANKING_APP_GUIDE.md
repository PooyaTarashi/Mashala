# Build an AI Wallet conversational frontend with Mashala

This guide integrates the AI Wallet backend documented in
[`description.md`](./description.md) and [`openapi.yaml`](./openapi.yaml) with
the current Mashala application. It assumes the banking backend is available
at `http://127.0.0.1:8000` and that you are working from the Mashala repository
root.

The result is a complete browser frontend with a chatroom, deterministic forms,
required confirmation for banking writes, browser-direct backend requests,
bounded multi-turn memory, and optional documentation answers through the local
RAG service.

## Architecture First

Mashala separates language interpretation from workflow authority:

```text
user message
    |
    v
browser -> POST /api/runtime -> Mashala server/provider
    |                                  |
    |                                  +--> declared route or field proposal
    v
deterministic browser workflow
    |
    +--> editable form -> review -> explicit confirmation
    |
    +--> browser-direct request -> AI Wallet backend
```

The Mashala server does not proxy AI Wallet requests. It never receives the
banking credential, target-backend cookies, full backend responses, or the
provider secret. The browser and AI Wallet remain responsible for target
authentication and authorization. LLM output is an untrusted proposal only;
declared capability metadata, JSON Schema validation, confirmation, and the
browser workflow remain authoritative.

Conversation memory follows ADR-018:

- it is browser-owned `sessionStorage`, scoped to the app, tab, and opaque
  target-authentication scope;
- it contains bounded transcript text, valid resumable drafts, and normalized
  read/write outcome summaries;
- it does not contain credentials, full backend responses, confirmation
  snapshots, or provider state;
- refresh restores only safe display state or a paused draft and never replays a
  write; and
- an auth-scope change must discard the old conversation.

There is no standard display profile in the current contract. Do not send a
username, account identity, JWT, cookie, or token to the model as "user
context."

## Prerequisites

Use the versions pinned by this repository:

- Node.js 24.x;
- npm 11.x;
- the AI Wallet backend on port 8000;
- a server-side Gemini API key for live language routing; and
- Docker and Ollama only when enabling documentation answers.

From PowerShell:

```powershell
Set-Location C:\UNI_4042\FP\Mashala
npm ci
node --version
npm --version
curl.exe -i http://127.0.0.1:8000/api/v1/banking/balance/
```

The protected balance request may return `401 Unauthorized`; connection
refused means the banking backend is not running.

Use separate ports:

| Service | Address |
| --- | --- |
| AI Wallet backend | `http://127.0.0.1:8000` |
| Mashala frontend/server | `http://127.0.0.1:3100` |
| Optional RAG service | `http://127.0.0.1:8765` |

## Configure Browser Authentication

Authentication belongs to the target application, not to the LLM flow. The
integration supplies Mashala with two separate browser-side concerns:

1. a `TargetBackendRequest` function that uses the target app's existing
   cookie, token, or session mechanism when calling AI Wallet; and
2. an opaque, non-secret `authScopeTag` that changes on login, logout, account
   switch, or target-session replacement.

The scope tag must not be a JWT, cookie value, session ID, authorization header,
or reversible credential. It is used only to prevent conversation leakage and
is never sent to `/api/runtime` or the provider.

A target application may keep its credential in its own reviewed auth layer.
Mashala must receive only the request function, not the credential itself. A
minimal integration shape is:

```tsx
<MashalaChat
  application={application}
  targetBackendBaseUrl="http://127.0.0.1:8000"
  targetBackendRequest={targetBackendRequest}
  authScopeTag={opaqueWalletSessionScope}
/>
```

On logout or account change, stop rendering the old authenticated integration
and provide the new scope tag. The conversation store then starts a fresh
conversation. Do not promote anonymous history into an authenticated session.

The current repository demo uses the anonymous scope because it is a standalone
fixture page. A production AI Wallet host should supply the target app's opaque
scope boundary and request integration around `MashalaChat`.

## Declare AI Wallet Capabilities

The canonical contract is `MashalaSpec` v0.4. Writes use
`defineCapability`; reads use `defineReadCapability`. Operations are always
developer-authored. The model cannot choose a method, URL, headers, query
parameters, response mapping, or confirmation policy.

Create `src/examples/ai-wallet-capabilities.ts`:

```ts
import { defineCapability, defineReadCapability, result } from "../capabilities";
import { f } from "../fields";

export const transferMoney = defineCapability({
  id: "transfer_money",
  description:
    "Transfer money from the authenticated user's account to a recipient account number.",
  fields: {
    recipient_account: f.text({
      label: "Recipient account number",
      required: true,
      minLength: 1,
    }),
    amount: f.number({ label: "Amount", required: true, minimum: 0.01 }),
    description: f.longText({
      label: "Transfer description",
      helpText: "Optional description for the transfer.",
    }),
  },
  operation: { method: "POST", path: "/api/v1/banking/transfer/" },
  confirmation: "required",
});

export const payBill = defineCapability({
  id: "pay_bill",
  description:
    "Pay one of the authenticated user's bills when the user provides its bill ID.",
  fields: {
    bill_id: f.text({
      label: "Bill ID",
      helpText: "Enter the UUID returned by the banking bill list.",
      required: true,
    }),
  },
  operation: { method: "POST", path: "/api/v1/banking/bills/pay/" },
  confirmation: "required",
});

export const requestLoan = defineCapability({
  id: "request_loan",
  description:
    "Submit a car, personal, or home loan request for the authenticated user.",
  fields: {
    loan_type: f.select({
      label: "Loan type",
      required: true,
      options: [
        { value: "car", label: "Car" },
        { value: "personal", label: "Personal" },
        { value: "home", label: "Home" },
      ],
    }),
    amount: f.number({
      label: "Requested amount",
      required: true,
      minimum: 0.01,
    }),
    salary: f.number({ label: "Salary", required: true, minimum: 0.01 }),
    description: f.longText({
      label: "Loan request description",
      helpText: "Optional information to include with the request.",
    }),
  },
  operation: { method: "POST", path: "/api/v1/banking/loans/request/" },
  confirmation: "required",
});

export const accountBalance = defineReadCapability({
  id: "account_balance",
  description: "Show the signed-in user's current account balance, account number, and status.",
  operation: {
    method: "GET",
    path: "/api/v1/banking/balance/",
  },
  result: result.card({
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
            formatter: {
              kind: "currency",
              locale: "en-US",
              currency: "USD",
            },
          },
        },
        {
          id: "status",
          label: "Status",
          value: {
            kind: "property",
            property: "status",
            formatter: { kind: "text" },
          },
        },
        {
          id: "account_number",
          label: "Account Number",
          value: {
            kind: "property",
            property: "account_number",
            formatter: { kind: "text" },
          },
        },
      ],
    },
  }),
});
```

Field names must match the banking request bodies because Mashala sends the
validated form object without arbitrary model-controlled renaming. Financial
writes should remain confirmation-gated. Never change them to `"none"` merely
to shorten a demo.

Assemble the application in `mashala.config.ts`:

```ts
import { defineMashalaApplication } from "./src/application";
import {
  accountBalance,
  payBill,
  requestLoan,
  transferMoney,
} from "./src/examples/ai-wallet-capabilities";

const mashalaApplication = defineMashalaApplication({
  app: {
    id: "ai_wallet",
    name: "AI Wallet",
    description:
      "A conversational frontend for account transfers, bill payments, and loan requests.",
  },
  capabilities: [transferMoney, payBill, requestLoan, accountBalance],
});

export default mashalaApplication;
```

Validate the spec before wiring the page:

```powershell
npm run typecheck
```

## Configure the Server Provider

Create `.env.local` from the repository's example when available, then set
server-only values:

```dotenv
GEMINI_API_KEY=replace-with-your-real-key
GEMINI_MODEL=gemini-3.6-flash
MASHALA_RAG_SERVICE_URL=http://127.0.0.1:8765
```

Never use `NEXT_PUBLIC_` for the Gemini key. The key is consumed by the
server-only provider behind `app/api/runtime/route.ts`; no target-backend proxy
route is needed or allowed.

The runtime endpoint is same-origin and non-streaming:

```text
POST /api/runtime
Content-Type: application/json
```

It accepts language events and optional bounded conversation context. It does
not accept target credentials or target-backend execution commands.

## Optional Documentation Answers

Without RAG, transactional routing still works, but documentation questions
cannot be grounded in the banking guide. To build the local artifact from only
the banking description:

```powershell
node .\bin\mashala.mjs rag build --input .\docs\bank_example --source description.md --output .\.mashala\rag
$artifactDir = (Resolve-Path .\.mashala\rag).Path
docker run --rm -p 8765:8765 --mount "type=bind,src=$artifactDir,dst=/workspace/artifacts,readonly" mashala-rag-builder:0.1.0 serve --artifact-directory /workspace/artifacts --ollama-base-url http://host.docker.internal:11434
```

The retrieval service is retrieval-only. It does not execute banking
operations, and retrieved text remains untrusted context. Questions outside
the indexed documentation must produce an insufficient-information response,
not an invented banking rule.

## Run the Frontend

Start the development server:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100`. In a host application, render `MashalaChat` with
the AI Wallet application, browser request integration, backend base URL, and
opaque auth scope described above.

The visible workflow is a chatroom. A normal write proceeds as follows:

1. the user sends a natural-language request;
2. the server classifies and routes only to a declared capability;
3. proposed values are merged only into that capability's deterministic form;
4. the user can continue the request over several messages and edit fields;
5. the form validates against its compiled JSON Schema;
6. **Review request** enters confirmation without a backend request; and
7. **Confirm and send** executes the exact reviewed snapshot once in the
   browser.

Follow-up messages use bounded context containing only safe transcript text,
the active declared capability and valid draft, normalized outcome summaries,
and an explicitly authorized ADR-016 projection when one exists. A completed
action such as "what did I just do?" is answered from its deterministic outcome
summary, not from the original request or full backend response.

The current AI Wallet guide does not declare a positive result projection. A
follow-up referring to a previous balance, bill, or product result must not
assume that the full response is available to the model. Add an explicit
`operation.modelContext` declaration and browser-side projection only when the
use case justifies it and the projected shape is safe.

## Current AI Wallet Read Support

Mashala supports declared browser-executed `GET` capabilities with optional
validated input bindings, deterministic card/list result views, and v0.4 response
envelope unwrapping (`root` dot-path) with strict decimal string coercion.

| AI Wallet operation | Current guidance |
| --- | --- |
| `POST /api/v1/users/token/` | Keep login in the target app, outside chat |
| `POST /api/v1/banking/transfer/` | Declare as a confirmation-gated write |
| `POST /api/v1/banking/bills/pay/` | Declare as a confirmation-gated write |
| `POST /api/v1/banking/loans/request/` | Declare as a confirmation-gated write |
| `GET /api/v1/banking/balance/` | Declare as a v0.4 read capability using `root: "balance"` and string currency coercion |
| Transactions, bills, and loan plans | Declare as v0.4 wrapped collection reads using `root: "results"` or use deterministic browser UI |
| `POST /api/v1/chat/process/` | Do not use; it is a separate assistant, not Mashala |

Do not ask Gemini to construct banking URLs, invent pagination mappings, or
call the backend through `/api/runtime`. Any new read integration must declare
its fixed `GET` path, input bindings, result view, and optional ADR-016
projection in the application spec.

## Verification

Run the repository checks after integration:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

For the local deterministic E2E harness, run:

```powershell
npm run test:e2e
```

The current E2E suite uses fake runtime/provider behavior and local target
fixtures. It proves browser-direct execution, confirmation, bounded multi-turn
context, outcome-only follow-ups, no-projection reference rejection,
non-replaying restoration, malicious-content resistance, and sanitized provider
failure without real credentials or external network access.

Use the browser network inspector to verify the two paths:

```text
language/context -> POST http://127.0.0.1:3100/api/runtime
confirmed write  -> POST http://127.0.0.1:8000/api/v1/banking/...
```

The confirmed banking request must originate in the browser and must not pass
through the Mashala runtime. `/api/runtime` requests must not contain JWTs,
cookies, authorization headers, full backend responses, or Gemini credentials.

## Production Checklist

Before production:

- use the banking application's security-reviewed authentication and refresh
  implementation;
- derive and rotate an opaque auth scope on login, logout, account switch, and
  session replacement;
- use HTTPS and exact CORS origins;
- keep Gemini and RAG service secrets server-side;
- provide deterministic UI or declared read capabilities for balance, bills,
  transactions, and loan-plan data;
- add an ADR-016 projection only for explicitly justified, minimized data;
- preserve backend authorization as the final business-rule boundary;
- test HTTP, authorization, malformed-response, and network failures; and
- never accept model-generated URLs, methods, headers, HTML, or execution
  authority.

The guide's current repository touchpoints are:

```text
mashala.config.ts
src/examples/ai-wallet-capabilities.ts
app/page.tsx or the host application's MashalaChat integration
.env.local                         # local secret; never commit
.mashala/rag/                      # generated, optional
```

For the architectural source of truth, see
[`ARCHITECTURE.md`](../ARCHITECTURE.md),
[`CANONICAL_SPEC.md`](../CANONICAL_SPEC.md),
[`RUNTIME_PROTOCOL.md`](../RUNTIME_PROTOCOL.md), and
[`ADR-018`](../decisions/018-browser-session-scoped-conversation-memory.md).
