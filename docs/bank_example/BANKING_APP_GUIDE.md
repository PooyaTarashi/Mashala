# Banking frontend implementation guide

This guide explains how to define a Mashala frontend for the backend described
in docs/bank_example/description.md and docs/bank_example/openapi.yaml.

The example backend is the AI Wallet API at http://127.0.0.1:8000. The steps
use its documented paths, while preserving Mashala's browser/server boundary.

## 1. Classify the banking API

| Backend endpoint | Role | Current Mashala binding |
| --- | --- | --- |
| POST /api/v1/users/signup/ | Registration | Target-app auth UI |
| POST /api/v1/users/token/ | Username/password login | Target-app auth integration |
| POST /api/v1/users/token/refresh/ | JWT refresh | Target-app auth integration |
| GET /api/v1/banking/balance/ | Account overview | Manual browser read |
| GET /api/v1/banking/transactions/ | Transaction history | Manual browser read |
| POST /api/v1/banking/transfer/ | Transfer money | Mashala capability |
| GET /api/v1/banking/bills/ | Bill list | Manual browser read |
| POST /api/v1/banking/bills/pay/ | Pay a bill | Mashala capability |
| GET /api/v1/banking/loan-plans/ | Loan plans | Manual browser read |
| POST /api/v1/banking/loans/request/ | Request a loan | Mashala capability |
| POST /api/v1/chat/process/ | Backend-specific assistant | Do not use for Mashala |

The current defineCapability contract supports one POST, PUT, or PATCH
operation. It does not bind arbitrary GET operations as capabilities.
f.reference is the supported GET binding for a dynamic field, and requires a
successful root-array response. The documented bills and loan-plan responses
are paginated, so they cannot be direct f.reference sources unless the backend
adds a suitable root-array endpoint or browser adapter.

The backend chat endpoint describes a separate OpenAI-backed assistant that
may generate UI components. It is not the Mashala runtime and must not replace
Mashala routing, deterministic forms, confirmation, or browser execution.

## 2. Create the application module

There is no mashala init or create-mashala-app command. Add a TypeScript
module to the application/source tree and import the current modules directly:

~~~ts
import { defineCapability } from "../src/capabilities";
import { f } from "../src/fields";
import type { MashalaSpec } from "../src/spec";
import type { TargetBackendRequest } from "../src/target-backend-request";
~~~

The current Next.js page is a scaffold, so connecting the spec, runtime
modules, transport, and user-facing page is manual.

## 3. Define banking metadata

Use stable IDs and keep tokens, headers, and functions out of the spec:

~~~ts
import type { MashalaSpec } from "../src/spec";

export const bankSpec: MashalaSpec = {
  specVersion: "0.2",
  app: {
    id: "ai_wallet",
    name: "AI Wallet",
    description:
      "A banking application for account information, transfers, bills, and loans.",
  },
  capabilities: [],
};
~~~

## 4. Connect the existing JWT authentication

The bank API uses bearer JWT authentication. The banking application owns
login, token storage, expiry, refresh, and logout. Mashala receives a
browser-side request function, not a token string.

Implement the target application's existing request wrapper behind the
TargetBackendRequest shape:

~~~ts
const targetRequest: TargetBackendRequest = (input, init) =>
  targetApplicationRequest(input, init);
~~~

The target application request wrapper should:

1. send credentials only to POST /api/v1/users/token/;
2. keep access and refresh tokens in its chosen browser-side auth mechanism;
3. attach the access JWT to authenticated requests;
4. refresh and retry according to its own auth policy; and
5. preserve target-backend HTTP errors for the UI.

Do not send JWTs to the Mashala server or LLM. The same callable is used for
browser reads and confirmed writes:

~~~ts
import {
  requestTargetBackend,
  type TargetBackendRequest,
} from "../src/target-backend-request";

const response = await requestTargetBackend(
  targetRequest,
  "http://127.0.0.1:8000/api/v1/banking/balance/",
  { method: "GET" },
);
~~~

Mashala does not prescribe localStorage or another token-storage method.

## 5. Define transfer money

The transfer endpoint requires recipient_account and amount, accepts an
optional description, and must require confirmation:

~~~ts
import { defineCapability } from "../src/capabilities";
import { f } from "../src/fields";

export const transferMoney = defineCapability({
  id: "transfer_money",
  description: "Transfer money to another bank account.",
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
      maxLength: 500,
    }),
  },
  operation: {
    method: "POST",
    path: "/api/v1/banking/transfer/",
  },
  confirmation: "required",
});
~~~

Use the backend property name recipient_account as the field key. The
current executor sends validated properties without renaming them. The
backend remains responsible for self-transfer checks, sufficient funds,
account status, and recipient existence.

## 6. Define bill payment

The payment endpoint requires a bill_id UUID. Because the documented bills
GET response is paginated, start with a text field:

~~~ts
export const payBill = defineCapability({
  id: "pay_bill",
  description: "Pay one of the user's bills.",
  fields: {
    bill_id: f.text({
      label: "Bill ID",
      required: true,
      helpText: "Enter the UUID of the bill to pay.",
    }),
  },
  operation: {
    method: "POST",
    path: "/api/v1/banking/bills/pay/",
  },
  confirmation: "required",
});
~~~

If the backend later provides a root-array options endpoint, the field can
become a reference:

~~~ts
const bill_id = f.reference({
  label: "Bill",
  required: true,
  source: {
    method: "GET",
    path: "/api/v1/banking/bills/options/",
  },
  value: "id",
  labelFrom: "display_name",
});
~~~

That options endpoint is not in the supplied API list. Do not treat it as
available in the current banking app. The existing paginated bills read can
still be rendered by browser UI code to help the user find a bill ID.

## 7. Define loan requests

The loan request requires loan_type, amount, and salary, with an optional
description. The documented values are car, personal, and home:

~~~ts
export const requestLoan = defineCapability({
  id: "request_loan",
  description: "Submit a pending loan request.",
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
    description: f.longText({ label: "Description", maxLength: 500 }),
  },
  operation: {
    method: "POST",
    path: "/api/v1/banking/loans/request/",
  },
  confirmation: "required",
});
~~~

The backend decides whether a matching active plan exists and whether the
account is active. A successful request is pending, not approved.

## 8. Assemble the spec

After defining transferMoney, payBill, and requestLoan:

~~~ts
export const bankSpec: MashalaSpec = {
  specVersion: "0.2",
  app: {
    id: "ai_wallet",
    name: "AI Wallet",
    description:
      "A banking application for account information, transfers, bills, and loans.",
  },
  capabilities: [transferMoney, payBill, requestLoan],
};
~~~

Keep balance, transaction history, bills, and loan-plan screens as direct
browser reads until a current Mashala GET binding supports their response
shapes. They still use the same authenticated request integration.

## 9. Add the banking documentation to RAG

The Markdown user guide is docs/bank_example/description.md. The OpenAPI file
is YAML and is not a Markdown ingestion input for the current builder.

From the repository root, with Docker and Ollama running:

~~~text
ollama pull nomic-embed-text:v1.5
mashala rag build --input docs/bank_example --source description.md --output .mashala/rag
~~~

The build produces .mashala/rag/manifest.json and the private retrieval
artifact under .mashala/rag/retrieval/. Configure the server-side Node runtime
with the current retrieval client and Gemini provider:

~~~ts
import { createPythonRagRetriever } from "../src/server/retrieval/python-rag-client";
import { createGeminiProviderFromEnv } from "../src/server/llm/gemini";

const retriever = createPythonRagRetriever({
  baseUrl: "http://127.0.0.1:8765",
});
const provider = createGeminiProviderFromEnv();
~~~

The knowledge-answer flow can answer documented questions such as supported
bill types or documented transfer failures. It must return insufficient
context for undocumented policies such as fees, daily limits, credit-score
rules, or approval timing.

## 10. Wire the conversational flow

For each user message:

1. Route the utterance among bankSpec.capabilities.
2. Extract only fields declared by the selected capability.
3. Render the compiled deterministic form.
4. Let the user edit every proposed value.
5. Validate the complete form with its compiled JSON Schema.
6. Show confirmation for transferMoney, payBill, and requestLoan.
7. On explicit confirmation, execute the declared operation in the browser
   using targetRequest.
8. Display the backend success or sanitized failure.

The LLM must not choose a URL, invent an operation, bypass validation, change
confirmation, or execute a banking request.

For read-only questions, retrieve documentation first and answer only from
the selected untrusted documentation chunks. “What loan types are available?”
is a knowledge flow. “Submit a personal loan request for 10000” is a
transactional flow.

## 11. Test before release

Test missing fields, amounts below 0.01, unknown select values, user edits
after extraction, confirmation cancel/back, duplicate confirmation, expired
authentication, and backend 400/403/404 responses.

Also verify that:

- JWTs never occur in the spec, runtime events, prompts, or RAG requests;
- arbitrary backend responses are not sent to Gemini;
- modelContext is added only for an explicit language-resolution need; and
- undocumented banking policies produce insufficient context, not guesses.

## Current banking-specific limitations

- Mashala currently supports POST, PUT, and PATCH operations, not arbitrary GET
  capabilities.
- The supplied bills and loan-plan endpoints are paginated and do not directly
  satisfy f.reference's root-array requirement.
- There is no recipient lookup endpoint in the supplied API, so recipient
  account input remains text.
- Auth UI, JWT lifecycle, and browser request wiring belong to the bank app.
- The current Next.js page is a scaffold; the developer must connect the spec,
  runtime protocol, forms, and chat UI.
- The supplied /api/v1/chat/process/ endpoint is a separate backend assistant,
  not part of the Mashala integration.
