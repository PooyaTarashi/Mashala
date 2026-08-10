# Mashala

Mashala is a Bachelor’s final-project framework for generating a conversational frontend from a developer-defined description of an existing backend application.

The core idea is that users should not need to learn an application's navigation or vocabulary before they can use its services. A developer describes the application, capabilities, forms, documentation, and safe API bindings; Mashala generates a full frontend application in which an LLM helps users understand the system, discover the right capability, and fill the right form.

**Important architectural boundary:** authenticated business API calls execute in the user's browser, directly against the developer's backend. The Mashala server hosts the LLM-facing runtime, documentation retrieval, and dialogue logic; it is not the target application's API proxy.

## Requirements

- Node.js 24.19.0 (pinned in `.nvmrc`)
- npm 11.17.0

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

The default local URL for the development and production servers is `http://localhost:3000`.

## Form compilation

The five static field builders compile to JSON Schema Draft 2020-12 plus same-keyed Mashala presentation metadata. Fields are optional unless `required: true` is set.

```ts
import { f } from "./src/fields";
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
```

`form.schema` is the sole validation source; `form.fields` contains only rendering metadata. Capability compilation and form rendering remain later tasks.

## Project documentation

Start with:

1. `docs/START_HERE.md`
2. `docs/PROJECT.md`
3. `docs/SCOPE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/PROJECT_STATUS.md`
6. `docs/decisions/`

For AI coding agents, read `AGENTS.md` first.
