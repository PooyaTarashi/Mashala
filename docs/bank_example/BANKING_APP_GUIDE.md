# Build an AI Wallet conversational frontend with Mashala

This is a step-by-step integration guide for the banking backend documented in
[`description.md`](./description.md) and [`openapi.yaml`](./openapi.yaml). It
assumes that backend is already running at `http://127.0.0.1:8000` and that you
are working in the Mashala repository.

The result is a separate frontend at `http://localhost:3000` where a signed-in
user can type requests such as:

> Transfer 250 to account IR123 and use "rent" as the description.

Mashala asks the LLM to select one of your declared capabilities and propose
form values. Mashala then displays an editable, validated form, asks the user
to confirm, and makes the declared banking request directly from the browser.

## First understand the safety boundary

The phrase "the LLM calls my functions" is a useful product description, but
it is not the literal implementation:

```text
user's natural-language request
        |
        v
Mashala server: classify, route, and propose field values with the LLM
        |
        v
browser: render form, allow edits, validate, and require confirmation
        |
        v
browser: call one developer-declared banking endpoint
        |
        v
AI Wallet backend: authenticate, authorize, and apply business rules
```

The LLM never chooses an arbitrary URL and never receives the user's password,
JWT, or Gemini key. The AI Wallet backend remains authoritative for balances,
ownership, account state, sufficient funds, and every other business rule.

## How to follow this walkthrough

Run every command from the Mashala repository root:

```text
C:\UNI_4042\FP\Mashala
```

This is not pseudocode. The walkthrough names every Mashala file that must be
created or replaced. When it says **create**, create that exact path relative
to the repository root. When it says **replace**, erase the current contents
of that file and paste the complete shown contents.

You will make exactly these manual source/configuration changes:

| Order | Action | Exact path |
| --- | --- | --- |
| 1 | Create | `src/examples/ai-wallet-capabilities.ts` |
| 2 | Replace | `mashala.config.ts` |
| 3 | Create locally | `.env.local` |
| 4 | Create | `app/ai-wallet-client.tsx` |
| 5 | Replace | `app/page.tsx` |

Do not edit `app/api/runtime/route.ts`: the current route already connects the
browser chat to Mashala's server runtime. Do not create an API route that
proxies port 8000.

## What this guide can integrate today

The current Mashala capability contract supports JSON-body `POST`, `PUT`, and
`PATCH` operations. It does not yet support arbitrary `GET` capabilities or
query-parameter mappings.

| AI Wallet operation | Integration in this guide |
| --- | --- |
| `POST /api/v1/users/token/` | Deterministic login UI, outside the LLM flow |
| `POST /api/v1/banking/transfer/` | Conversational Mashala capability |
| `POST /api/v1/banking/bills/pay/` | Conversational Mashala capability |
| `POST /api/v1/banking/loans/request/` | Conversational Mashala capability |
| Balance, transaction, bill, and loan-plan `GET` endpoints | Not bindable as conversational capabilities yet |
| `POST /api/v1/chat/process/` | Do not use; it is a separate assistant, not Mashala |

The bill-list endpoint is paginated, while the current `f.reference` field
requires a root JSON array. Therefore the first version asks for a bill UUID.
Do not invent a bill-options endpoint that the supplied OpenAPI file does not
declare.

## Step 1: check the prerequisites

Use the versions pinned by this repository:

- Node.js 24.x;
- npm 11.x;
- the AI Wallet backend running on port 8000;
- a Gemini API key for language routing and field extraction;
- Docker and Ollama only if you want documentation question answering.

1. Open PowerShell.

2. Move to the Mashala repository:

```powershell
Set-Location C:\UNI_4042\FP\Mashala
```

3. Check Node.js. The first number must be `24`:

```powershell
node --version
```

4. Check npm. The first number must be `11`:

```powershell
npm --version
```

5. Install the exact locked dependencies:

```powershell
npm ci
```

6. Confirm that the banking backend responds. This protected endpoint will
normally return `401 Unauthorized` before login; that is acceptable and proves
the process is reachable:

```powershell
curl.exe -i http://127.0.0.1:8000/api/v1/banking/balance/
```

Do not continue if the connection itself is refused. Start the banking backend
first, still on port 8000.

Keep these three applications on different ports:

| Process | Local address |
| --- | --- |
| AI Wallet backend | `http://127.0.0.1:8000` |
| Mashala frontend/server | `http://localhost:3000` |
| Optional RAG retrieval service | `http://127.0.0.1:8765` |

## Step 2: allow browser requests in the banking backend

The final transfer, bill-payment, and loan requests originate in the user's
browser, not in the Mashala server. Your backend must therefore accept browser
requests from the Mashala frontend origin.

The banking source code is not contained in this repository, so Mashala cannot
name its Django settings package. In that banking repository:

1. Open the Django settings module used by the running development server. It
is normally a file named `settings.py` inside the Django project package.

2. Find the backend's existing CORS allowlist or CORS middleware configuration.

3. Add the exact development frontend origin:

```text
http://localhost:3000
```

4. Ensure that preflight requests allow:

- methods `GET`, `POST`, and `OPTIONS`;
- request headers `Authorization` and `Content-Type`.

5. Restart the Django development server after changing its settings.

Do not use a permissive production CORS wildcard. In production, replace the
development origin with the deployed Mashala frontend origin and use HTTPS.

You can verify the browser-facing route before adding Mashala. A request to a
protected endpoint without a JWT should reach the backend and return its normal
authentication failure; it should not fail as a browser CORS error.

## Step 3: declare the banking capabilities

1. In the Mashala repository, open the existing `src/examples` directory.

2. Create a file named exactly:

```text
src/examples/ai-wallet-capabilities.ts
```

3. Paste the following complete contents into that new file and save it:

```ts
import { defineCapability } from "../capabilities";
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
    amount: f.number({
      label: "Amount",
      required: true,
      minimum: 0.01,
    }),
    description: f.longText({
      label: "Transfer description",
      helpText: "Optional description for the transfer.",
    }),
  },
  operation: {
    method: "POST",
    path: "/api/v1/banking/transfer/",
  },
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
  operation: {
    method: "POST",
    path: "/api/v1/banking/bills/pay/",
  },
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
    salary: f.number({
      label: "Salary",
      required: true,
      minimum: 0.01,
    }),
    description: f.longText({
      label: "Loan request description",
      helpText: "Optional information to include with the request.",
    }),
  },
  operation: {
    method: "POST",
    path: "/api/v1/banking/loans/request/",
  },
  confirmation: "required",
});
```

Why the field names matter: Mashala sends the validated object without
renaming its properties. Names such as `recipient_account`, `bill_id`, and
`loan_type` must therefore match the OpenAPI request bodies exactly.

All three operations require confirmation because they have financial or
financially consequential side effects. Never change these policies to
`"none"` merely to shorten the demo.

4. Check this new TypeScript file before changing the application config:

```powershell
npm run typecheck
```

The command should exit successfully. If it reports an error in
`ai-wallet-capabilities.ts`, compare the entire file with the snippet above,
including underscores and trailing slashes in endpoint paths.

## Step 4: make these capabilities the Mashala application

1. Open the existing root-level file:

```text
mashala.config.ts
```

2. Delete its current demo contents.

3. Paste the following complete replacement and save it:

```ts
import { defineMashalaApplication } from "./src/application";
import {
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
  capabilities: [transferMoney, payBill, requestLoan],
});

export default mashalaApplication;
```

This file contains browser-visible declarative data only. Do not put a JWT,
Gemini key, custom header, or authentication function in it.

4. Check that the application definition compiles:

```powershell
npm run typecheck
```

At this point, Mashala knows which three banking operations exist, their exact
form shapes, and their fixed confirmation policies. It still does not know how
the browser authenticates; that is added in Step 6.

## Step 5: configure the server-side LLM

1. Create the local environment file by copying the provided example:

```powershell
Copy-Item .env.example .env.local
```

If `.env.local` already exists, do not overwrite it. Open the existing file
instead.

2. Open `.env.local` in your editor.

3. Make sure it contains these three names, replacing only the key placeholder
with your real Gemini key:

```dotenv
GEMINI_API_KEY=replace-with-your-real-key
GEMINI_MODEL=gemini-2.5-flash
MASHALA_RAG_SERVICE_URL=http://127.0.0.1:8765
```

`.env.local` must not be committed. Do not prefix the Gemini variables with
`NEXT_PUBLIC_`; a `NEXT_PUBLIC_` secret would be bundled for the browser.

The existing `app/api/runtime/route.ts` and
`src/server/assembled-application.ts` already connect `mashala.config.ts` to
the server-only Gemini provider and the Mashala runtime. You do not need to
create a target-backend proxy route.

4. Save `.env.local`. The Next.js process reads it at startup, so restart
`npm run dev` whenever these values change.

## Step 6: add a minimal deterministic login screen

Authentication is deliberately not an LLM capability. A user should not type
a password into the conversation, and the password or resulting JWT must not
become model input.

For this local proof, keep the access JWT only in React memory. A page reload
logs the user out. This avoids prescribing persistent token storage. In a real
banking application, replace this small example with the backend application's
reviewed login, refresh, expiry, and logout implementation.

1. Open the existing `app` directory.

2. Create a file named exactly:

```text
app/ai-wallet-client.tsx
```

The `.tsx` extension is required because this file renders React elements.

3. Paste the following complete contents into the new file and save it:

```tsx
"use client";

import { type FormEvent, useCallback, useState } from "react";

import type { MashalaSpec } from "../src/spec";
import type { TargetBackendRequest } from "../src/target-backend-request";
import { MashalaChat } from "./mashala-chat";

interface AiWalletClientProps {
  readonly application: MashalaSpec;
  readonly backendBaseUrl: string;
}

interface TokenResponse {
  readonly access: string;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "access") === "string" &&
    Reflect.get(value, "access") !== ""
  );
}

export function AiWalletClient({
  application,
  backendBaseUrl,
}: AiWalletClientProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string>();
  const [loginError, setLoginError] = useState<string>();
  const [loginPending, setLoginPending] = useState(false);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginPending(true);
    setLoginError(undefined);

    try {
      const response = await fetch(
        new URL("/api/v1/users/token/", backendBaseUrl),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
      );

      const payload: unknown = await response.json();

      if (!response.ok || !isTokenResponse(payload)) {
        setLoginError("The username or password was not accepted.");
        return;
      }

      setAccessToken(payload.access);
      setPassword("");
    } catch {
      setLoginError("The banking backend could not be reached.");
    } finally {
      setLoginPending(false);
    }
  };

  const authenticatedRequest = useCallback<TargetBackendRequest>(
    async (input, init) => {
      if (accessToken === undefined) {
        throw new Error("The user is not authenticated.");
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);

      return fetch(input, { ...init, headers });
    },
    [accessToken],
  );

  if (accessToken === undefined) {
    return (
      <main>
        <h1>Sign in to AI Wallet</h1>
        <form onSubmit={login}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loginPending}>
            {loginPending ? "Signing in..." : "Sign in"}
          </button>
          {loginError === undefined ? null : <p role="alert">{loginError}</p>}
        </form>
      </main>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAccessToken(undefined)}>
        Sign out
      </button>
      <MashalaChat
        application={application}
        targetBackendBaseUrl={backendBaseUrl}
        targetBackendRequest={authenticatedRequest}
      />
    </>
  );
}
```

This request function is behavior passed only to browser components. The JWT
is attached only when the browser contacts the banking backend. It is not part
of `MashalaSpec`, `/api/runtime` events, RAG requests, or LLM prompts.

The sample intentionally does not guess the backend's refresh-token rotation
or expiry policy. Add refresh behavior only according to the actual banking
backend configuration.

4. Run the type checker again:

```powershell
npm run typecheck
```

If this step passes, the login form and authenticated browser request wrapper
are valid against the current Mashala `TargetBackendRequest` interface.

## Step 7: connect the page to the banking backend

1. Open the existing file:

```text
app/page.tsx
```

2. Delete its current contents.

3. Paste the following complete replacement and save it:

```tsx
import mashalaApplication from "../mashala.config";
import { AiWalletClient } from "./ai-wallet-client";

const AI_WALLET_BACKEND = "http://127.0.0.1:8000";

export default function Home() {
  return (
    <AiWalletClient
      application={mashalaApplication}
      backendBaseUrl={AI_WALLET_BACKEND}
    />
  );
}
```

The backend origin is public connection information, not a secret. For a
deployment, put it in deployment configuration and validate it before passing
it to the client. Do not let the user or LLM supply this origin.

At this point, transactional natural-language flows are wired. The existing
Mashala page sends language events only to same-origin `/api/runtime`, while
confirmed banking operations go from the browser directly to port 8000.

4. Run the full static checks for the files edited so far:

```powershell
npm run lint
npm run typecheck
```

Both commands must finish successfully before starting the UI.

## Step 8: optionally enable answers from the banking documentation

Skip this step if you only need transactional forms. Without the RAG service,
transaction routing can still use Gemini, but documentation questions cannot
be answered from the local banking guide.

1. Install and start Ollama if it is not already running.

2. In a PowerShell terminal, install the exact embedding model:

```powershell
ollama pull nomic-embed-text:v1.5
```

3. From the Mashala repository root, build an index containing only the
banking user guide:

```powershell
node .\bin\mashala.mjs rag build --input .\docs\bank_example --source description.md --output .\.mashala\rag
```

4. Wait for the build to finish. Verify that this file now exists:

```text
.mashala/rag/manifest.json
```

The command builds the pinned `mashala-rag-builder:0.1.0` Docker image and
writes a manifest plus its private retrieval artifact.

5. In a second PowerShell terminal, return to the Mashala repository and run
the retrieval service:

```powershell
$artifactDir = (Resolve-Path .\.mashala\rag).Path
docker run --rm -p 8765:8765 --mount "type=bind,src=$artifactDir,dst=/workspace/artifacts,readonly" mashala-rag-builder:0.1.0 serve --artifact-directory /workspace/artifacts --ollama-base-url http://host.docker.internal:11434
```

6. Keep that terminal running. The Mashala server reads its origin from
`MASHALA_RAG_SERVICE_URL`.

The OpenAPI YAML is a developer reference, but the current RAG ingestion
pipeline accepts Markdown. This command intentionally selects only
`description.md`.

## Step 9: run the frontend

1. Confirm the AI Wallet backend terminal is still serving
`http://127.0.0.1:8000`.

2. If you completed Step 8, confirm the RAG Docker terminal is still running
on `http://127.0.0.1:8765`.

3. Open another PowerShell terminal and run:

```powershell
Set-Location C:\UNI_4042\FP\Mashala
npm run dev
```

The complete set of running services is:

| Service | Address | Required? |
| --- | --- | --- |
| AI Wallet backend | `http://127.0.0.1:8000` | Yes |
| Mashala | `http://localhost:3000` | Yes |
| RAG retrieval | `http://127.0.0.1:8765` | Only for documentation answers |

4. Wait until Next.js prints that it is ready.

5. Open `http://localhost:3000` in a browser.

6. Sign in with an AI Wallet username and password and submit one request at a
time.

The first live Gemini request needs external network access. If a message
returns a provider configuration error, first check `GEMINI_API_KEY` and
`GEMINI_MODEL`, then restart `npm run dev` after changing `.env.local`.

## Step 10: try the four main flows

### Transfer money

Type:

```text
Transfer 250.50 to account IR123 and add the description rent.
```

Expected behavior:

1. Mashala routes to `transfer_money`.
2. It proposes `recipient_account`, `amount`, and `description`.
3. The editable transfer form appears.
4. The user selects **Review request**.
5. The user verifies the immutable review and selects **Confirm and send**.
6. The browser sends one authenticated request to
   `POST /api/v1/banking/transfer/`.

### Pay a bill

Type a real bill UUID from the banking system:

```text
Pay bill 11111111-2222-3333-4444-555555555555.
```

Mashala must still show the form and confirmation. The backend decides whether
the bill exists, belongs to this user, is unpaid, and is affordable.

### Request a loan

Type:

```text
Request a personal loan for 10000. My salary is 2500.
```

The backend decides whether an active matching plan exists. A successful
submission is pending; the UI and assistant must not claim it is approved.

### Ask a documentation question

With RAG running, type:

```text
Why can a transfer fail?
```

Mashala should answer from `description.md`. Ask "What is the daily transfer
limit?" as a negative test: the documentation does not define one, so the
assistant should report insufficient information instead of inventing a bank
policy.

## Step 11: understand the current read-operation limitation

Requests such as these cannot yet execute through a declared Mashala
capability:

- "Show my balance";
- "List my failed transactions";
- "Show my unpaid bills";
- "List home-loan plans".

Those APIs use `GET`, pagination, filters, and query parameters that the current
capability contract does not represent. There are two safe choices:

1. add conventional deterministic browser UI for these reads, using the same
   `authenticatedRequest`; or
2. propose and implement a focused Mashala read-capability extension, including
   an ADR if the canonical contract must change.

Do not work around this by asking Gemini to generate URLs or by proxying the
banking APIs through `app/api/runtime`. Either workaround would conflict with
Mashala's accepted architecture.

If the banking backend later exposes a root-array endpoint such as a genuine
`GET /api/v1/banking/bills/options/`, a bill field could use `f.reference`.
That endpoint does not exist in the supplied OpenAPI file today.

## Step 12: verify before considering the integration complete

Run the repository checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Then manually verify:

- an amount below `0.01` is rejected before execution;
- an unknown loan type cannot be submitted;
- every proposed value remains editable;
- cancelling the confirmation makes no banking request;
- repeated confirmation does not create duplicate requests;
- `400`, `401`, `403`, and `404` backend results are shown as failures;
- an expired access token never gets sent to the Mashala runtime or LLM;
- JWTs do not appear in `/api/runtime` request bodies;
- Gemini credentials do not appear in browser source or browser network calls;
- a prompt cannot change the declared method, path, or confirmation policy;
- undocumented banking rules produce an insufficient-information answer.

Use the browser network inspector to confirm the two separate paths:

```text
natural-language event -> POST http://localhost:3000/api/runtime
confirmed bank action  -> POST http://127.0.0.1:8000/api/v1/banking/...
```

The second request must not pass through the Mashala runtime.

## Production follow-up checklist

The code above is a small local integration proof. Before production, also:

- replace the in-memory login example with the bank's security-reviewed auth
  and refresh implementation;
- use HTTPS for both frontend and backend;
- restrict production CORS to exact frontend origins;
- decide how users obtain or select bill IDs;
- sanitize user-visible backend failures without hiding useful validation;
- add integration tests against a non-production banking environment;
- configure secrets through the deployment platform's server-side secret
  manager;
- keep target-backend authorization authoritative even when the UI validates
  the same input.

## Files changed by this walkthrough

After following the guide, the relevant frontend files are:

```text
mashala.config.ts
src/examples/ai-wallet-capabilities.ts
app/ai-wallet-client.tsx
app/page.tsx
.env.local                         # local secret; never commit
.mashala/rag/                      # generated, optional
```

Mashala currently has no `create-mashala-app` or `mashala init` generator, so
this repository-level wiring is manual. The steps above use only capabilities
that are implemented in the current repository and preserve the accepted
browser/server, credential, validation, and confirmation boundaries.
