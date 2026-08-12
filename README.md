# Mashala

Mashala is a Bachelor’s final-project framework for generating a conversational frontend from a developer-defined description of an existing backend application.

The core idea is that users should not need to learn an application's navigation or vocabulary before they can use its services. A developer describes the application, capabilities, forms, documentation, and safe API bindings; Mashala generates a full frontend application in which an LLM helps users understand the system, discover the right capability, and fill the right form.

**Important architectural boundary:** authenticated business API calls execute in the user's browser, directly against the developer's backend. The Mashala server hosts the LLM-facing runtime, documentation retrieval, and dialogue logic; it is not the target application's API proxy.

## Requirements

- Node.js 24.19.0 (pinned in `.nvmrc`)
- npm 11.17.0

RAG artifact builds additionally require Docker and a running local Ollama with
`nomic-embed-text:v1.5` already installed. Mashala does not install Python,
FAISS, or Ollama models on the host.

The supported Node.js range is `>=24 <25`. Use npm only; `package-lock.json` is the authoritative lockfile.

## Setup

```bash
nvm use
npm ci
```

If Node.js 24.19.0 is not installed yet, install it with your Node version manager before running `nvm use`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server after a build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm test` | Run Vitest once and exit |
| `mashala rag build` | Build deployable documentation/RAG artifacts |

The default local URL for the development and production servers is `http://localhost:3000`.

## RAG artifact build

Install the required model explicitly once, start Ollama, and run the Mashala
CLI from the project directory:

```bash
ollama pull nomic-embed-text:v1.5
mashala rag build
```

By default the command recursively indexes Markdown below `docs/` and writes
`manifest.json` plus opaque retrieval artifacts below `.mashala/rag/`. Override
the locations or select particular relative sources when needed:

```bash
mashala rag build \
  --input developer-docs \
  --source guides \
  --source policies/terms.md \
  --output build/rag
```

The CLI checks Docker, Ollama, and the exact embedding model before building. It
builds and runs the pinned repository RAG container and streams container output
and errors. The operation is independent of any CI provider.

The same isolated image can run the persistent retrieval-only service over a
read-only artifact mount by passing `serve` to its container entry point. Its
sole operation is JSON `POST /retrieve`; see
`docs/RAG_RETRIEVAL_SERVICE.md` for lifecycle, request/result, scoring, and
failure contracts. No Node retrieval client or knowledge-answer flow is
implemented yet.

## Form compilation

The five static field builders compile to JSON Schema Draft 2020-12 plus same-keyed Mashala presentation metadata. Fields are optional unless `required: true` is set.

```tsx
"use client";

import { f } from "./src/fields";
import { CompiledForm } from "./src/form-renderer";
import { compileForm } from "./src/forms";

const form = compileForm({
  recipient: f.text({
    label: "Recipient",
    required: true,
    minLength: 1,
    maxLength: 100,
  }),
  note: f.longText({ label: "Note", maxLength: 140 }),
  amount: f.number({
    label: "Amount",
    required: true,
    minimum: 0,
    maximum: 10_000,
  }),
  speed: f.select({
    label: "Transfer speed",
    required: true,
    options: [
      { value: "standard", label: "Standard" },
      { value: "instant", label: "Instant" },
    ],
  }),
  saveRecipient: f.boolean({ label: "Save this recipient" }),
});

export function TransferForm() {
  return (
    <CompiledForm
      form={form}
      formId="transfer-form"
      submitLabel="Review transfer"
      onSubmit={(validValue) => {
        // This local valid-value boundary does not call a backend.
        console.log(validValue);
      }}
    />
  );
}
```

`form.schema` is the sole validation source; `form.fields` contains only rendering metadata. `CompiledForm` keeps editable local state, validates with Ajv 2020-12, and calls `onSubmit` only with a valid value. It does not execute a backend operation by itself.

## Browser backend executor

`executeBackendOperation` consumes an already validated value and makes one direct browser request to the supplied target-backend origin. The Mashala server is not a proxy and is not part of this request path.

```ts
import { executeBackendOperation } from "./src/backend-executor";

const result = await executeBackendOperation({
  baseUrl: "https://backend.example",
  operation: { method: "POST", path: "/transfers" },
  value: {
    recipient: "Sam",
    amount: 250,
    immediate: true,
  },
});

if (result.outcome === "success") {
  // The native target-backend Response is preserved.
  console.log(result.response.status);
}
```

The executor sends the declared `POST`, `PUT`, or `PATCH` method, `Content-Type: application/json`, and `JSON.stringify(value)` without renaming or adding business properties. It does not validate the form again or define authentication storage. HTTP failures preserve the target `Response`; rejected fetches return a sanitized `network-error` result.

When the target application needs custom authenticated request behavior, it supplies one browser-side `TargetBackendRequest` function. `ConfirmationGate` passes that same function to writes and `f.reference` reads. The function may use the target application's existing cookie or token/session integration, while Mashala receives no serialized credential. `src/examples/demo-cookie-session-request.ts` shows a minimal cookie-session example using `credentials: "include"`; it is sample policy, not a framework default.

The executor remains a low-level primitive: it does not decide whether confirmation is required.

## Validated form, confirmation, and direct execution

`ConfirmationGate` composes the two boundaries. For `confirmation="required"`, a valid `CompiledForm` submission becomes an immutable review snapshot and cannot execute until the user separately selects **Confirm and send**. The confirmed request still goes directly from the browser to the target backend; the Mashala server is not a proxy.

```tsx
"use client";

import { ConfirmationGate } from "./src/confirmation-gate";

export function Transfer() {
  return (
    <ConfirmationGate
      form={form}
      operation={{ method: "POST", path: "/transfers" }}
      confirmation="required"
      baseUrl="https://backend.example"
      submitLabel="Review transfer"
    />
  );
}
```

The review uses the exact value already validated by `CompiledForm`; cancel/back discards that review, and pending confirmation cannot create duplicate requests. `confirmation="none"` skips the second confirmation but still executes only from an explicit valid form submission—never from render, mount, or hydration. Authentication remains owned by the target application; Mashala adds no login system, token-storage policy, server credential store, or target-backend proxy.

## Project documentation

Start with:

1. `docs/START_HERE.md`
2. `docs/PROJECT.md`
3. `docs/SCOPE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/PROJECT_STATUS.md`
6. `docs/decisions/`

For AI coding agents, read `AGENTS.md` first.
