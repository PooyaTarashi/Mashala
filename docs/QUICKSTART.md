# Mashala Quickstart

This guide describes the developer-facing pieces that exist through ISSUE-064.
It uses a neutral transactional backend. The repository does not yet provide
a project generator or one command that assembles a complete generated
frontend, so some integration remains manual.

## 1. What Mashala expects from your backend

You already have a browser-usable backend that provides authentication/session
behavior, business APIs, and business authorization/validation. It may also
provide Markdown application/help documentation.

Mashala describes that backend; it does not replace it. Authenticated
target-backend requests execute in the user's browser. The Mashala server
handles LLM and runtime concerns, but is not a general target-backend proxy.
Target-backend credentials stay in the browser and never go to the LLM.

## 2. Prerequisites

The repository declares these versions:

- Node.js >=24 and <25;
- npm >=11 and <12 (package manager npm@11.17.0);
- installed dependencies, normally via npm install.

The current provider is server-only Gemini. Set these in the server
environment, such as .env.local:

~~~dotenv
GEMINI_API_KEY=your-server-side-key
GEMINI_MODEL=gemini-3.6-flash
~~~

GEMINI_MODEL is a model name, not a path. Never put either value in browser
code. These are the names in .env.example.

RAG is optional. RAG builds and runtime retrieval require Docker with a
running daemon, Ollama, and the exact local model:

~~~text
ollama pull nomic-embed-text:v1.5
~~~

Python, FAISS, and their locked dependencies run inside the RAG Docker image;
a host Python or pip setup is not required.

## 3. Create/configure a Mashala application

There is currently no create-mashala-app or mashala init command, and no
package export that creates an application. Create a TypeScript module in the
application/source tree and import the current modules by repository path:

~~~ts
import {
  defineCapability,
  defineReadCapability,
  result,
} from "../src/capabilities";
import { f } from "../src/fields";
import type { MashalaSpec } from "../src/spec";
~~~

The repository application definition in `mashala.config.ts` is connected to
the current conversation page. Project generation and general target-app
integration remain manual.

## 4. Define application metadata

The top-level contract is MashalaSpec in src/spec.ts:

~~~ts
import type { MashalaSpec } from "../src/spec";

export const appSpec: MashalaSpec = {
  specVersion: "0.3",
  app: {
    id: "service_portal",
    name: "Service Portal",
    description: "A portal for completing customer service requests.",
  },
  capabilities: [],
};
~~~

Application and capability IDs are stable lowercase machine identifiers. The
current contract has no separate documentation-source property; Markdown
sources are selected by the RAG build command.

## 5. Define a capability

defineCapability compiles a declaration into a CapabilitySpec. Operations are
declared POST, PUT, or PATCH requests with root-relative paths. Confirmation is
either "required" or "none".

~~~ts
import { defineCapability } from "../src/capabilities";
import { f } from "../src/fields";
import type { MashalaSpec } from "../src/spec";

export const createRequest = defineCapability({
  id: "create_request",
  description: "Create a service request for the user.",
  fields: {
    subject: f.text({
      label: "Subject",
      required: true,
      minLength: 1,
      maxLength: 120,
    }),
    details: f.longText({ label: "Details", maxLength: 2000 }),
    priority: f.select({
      label: "Priority",
      required: true,
      options: [
        { value: "normal", label: "Normal" },
        { value: "urgent", label: "Urgent" },
      ],
    }),
    notifyMe: f.boolean({ label: "Notify me" }),
  },
  operation: { method: "POST", path: "/service-requests" },
  confirmation: "required",
});

export const appSpec: MashalaSpec = {
  specVersion: "0.3",
  app: {
    id: "service_portal",
    name: "Service Portal",
    description: "A portal for completing customer service requests.",
  },
  capabilities: [createRequest],
};
~~~

The compiler binds form, operation, and policy into one serializable
declaration. Headers, credentials, arbitrary functions, and absolute URLs are
not part of this contract.

### Read-capability examples

Goal-level reads use `defineReadCapability` with one declared browser `GET`
and one `result.card` or `result.cardList` view. The repository includes
executable authenticated-balance, single-product, and product-list examples in
`src/examples/read-capabilities.ts`; they are documented with their local E2E
fixtures and privacy assertions in `docs/READ_CAPABILITY_EXAMPLES.md`.

## 6. Field DSL

The supported field authoring functions are:

~~~ts
f.text({ label: "Title", minLength: 1, maxLength: 120 });
f.longText({ label: "Description", maxLength: 2000 });
f.number({ label: "Quantity", minimum: 1, maximum: 100 });
f.select({
  label: "Status",
  options: [{ value: "open", label: "Open" }],
});
f.boolean({ label: "Enabled" });
f.reference({
  label: "Owner",
  source: { method: "GET", path: "/people" },
  value: "id",
  labelFrom: "display_name",
});
~~~

All fields accept label, optional helpText, and optional required: true.
Text fields accept minLength/maxLength; numbers accept minimum/maximum; and
selects accept options containing string value and display label pairs.

defineCapability calls compileForm. The compiled form separates JSON Schema
Draft 2020-12 (types, required properties, constraints, select enums, and
additionalProperties: false) from presentation/runtime metadata (labels, help
text, kind, select labels, and reference source information). Fields are
optional unless required: true is authored. The compiled schema is the
deterministic validation source.

## 7. Data-backed fields

Use f.reference when a choice must come from the signed-in user's backend:

~~~ts
const owner = f.reference({
  label: "Owner",
  required: true,
  source: { method: "GET", path: "/people" },
  value: "id",
  labelFrom: "display_name",
});
~~~

The source is GET-only and the path is root-relative, with no query string,
fragment, backslash, or second leading slash. Runtime flow is:

~~~text
form renders
→ browser performs the declared GET
→ the root array is projected to { value, label }
→ the user selects one of those options
~~~

The browser accepts only string values and labels, rejects malformed or
duplicate options, and validates the selection against the resolved options.
The model does not invent dynamic options, and the complete response is not
sent to the Mashala server merely because it rendered the field.

## 8. Authentication integration

ISSUE-031 exposes one fetch-like browser integration point:

~~~ts
import {
  requestTargetBackend,
  type TargetBackendRequest,
} from "../src/target-backend-request";

const targetRequest: TargetBackendRequest = (input, init) =>
  existingTargetAppRequest(input, init);

const response = await requestTargetBackend(
  targetRequest,
  "https://api.example.test/service-requests",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "A request" }),
  },
);
~~~

existingTargetAppRequest represents the target application's own browser
request behavior. It may use cookies, token refresh, or another browser-side
session mechanism. Mashala does not define login, token storage, refresh, or
credential serialization. Without an injected function, ordinary browser
fetch is used.

The same TargetBackendRequest is used for reference reads and confirmed
writes. The repository's demo-cookie-session-request helper demonstrates one
cookie-session policy, but does not prescribe cookies or localStorage.

## 9. LLM configuration

The current adapter is createGeminiProviderFromEnv, which reads only
GEMINI_API_KEY and GEMINI_MODEL on the server:

~~~ts
import { createGeminiProviderFromEnv } from "../src/server/llm/gemini";

const provider = createGeminiProviderFromEnv();
~~~

It calls Gemini generateContent with structured JSON output. The API key is
server-only. Streaming, WebSockets, and a client-side provider adapter are not
implemented.

## 10. What happens when the user sends a message

The implemented boundary is:

~~~text
utterance
→ capability routing among declared capabilities
→ slot extraction limited to the selected capability's fields
→ editable deterministic form
→ JSON Schema validation
→ confirmation when required
→ browser target-backend request
~~~

Routing can propose only a declared capability ID. Extraction can propose only
declared fields; values remain editable and are not authoritative. Neither
stage executes an operation. The browser validates the final form and, for a
required policy, executes only the exact confirmed snapshot. The LLM cannot
change the operation or confirmation policy.

The repository provides these runtime contracts and focused modules, but does
not yet wire them into the scaffold page or provide a finished chat transport.

## 11. Model-visible backend data

Backend results are private from the model by default. To expose a deliberately
minimized representation, add an ADR-016 projection to a browser read source:

~~~ts
const card = f.reference({
  label: "Card",
  source: {
    method: "GET",
    path: "/cards",
    modelContext: {
      purpose: "reference_resolution",
      fields: {
        cardId: "id",
        maskedNumber: "masked",
      },
    },
  },
  value: "id",
  labelFrom: "masked",
});
~~~

fields maps output names to direct properties of each response item. The
browser projects only those properties before constructing selected backend
context. Without modelContext, no result from that source becomes
model-visible. Credential-like names and values are rejected. Projected data
is untrusted context and cannot authorize operations, modify capabilities, or
change confirmation/workflow.

## 12. Add documentation/RAG

Place Markdown below an input directory and select it with the CLI. Defaults
are input docs and output .mashala/rag. Markdown files/directories are
ingested recursively, normalized deterministically, and retained with source
and heading provenance. Non-Markdown files are not ingestion inputs.

With Docker and Ollama running and nomic-embed-text:v1.5 installed:

~~~text
mashala rag build
~~~

Verified options include:

~~~text
mashala rag build --input docs --output .mashala/rag
mashala rag build --input docs --source PROJECT.md --source guides
mashala rag build --ollama-url http://127.0.0.1:11434 --max-chunk-characters 1600
~~~

The command builds mashala-rag-builder:0.1.0, mounts documentation read-only
and output writable, and runs the containerized Python/FAISS builder. It
checks Docker and Ollama but does not pull the model. Output is:

~~~text
.mashala/rag/
├── manifest.json
└── retrieval/
    └── index.bin
~~~

The image's implemented retrieval command is:

~~~text
serve --artifact-directory /workspace/artifacts --ollama-base-url http://host.docker.internal:11434
~~~

After building the image, a local Docker invocation is:

~~~text
docker run --rm -p 8765:8765 --mount type=bind,src="$PWD/.mashala/rag",dst=/workspace/artifacts,readonly mashala-rag-builder:0.1.0 serve --artifact-directory /workspace/artifacts --ollama-base-url http://host.docker.internal:11434
~~~

The service exposes POST /retrieve with JSON such as
{"query":"How do I create a request?","topK":5}. The Node client is
createPythonRagRetriever({ baseUrl: "http://127.0.0.1:8765" }). The
server-side answerDocumentationQuestion({ question, retriever, provider })
path selects at most three chunks for Gemini and requires grounded answers to
cite selected chunk IDs. Retrieval cannot execute target-backend operations.

## 13. Run the application

The commands in package.json are:

~~~text
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run start
~~~

npm run dev starts the current Next.js application. npm run build and npm run
start are the production pair. `npm run test:e2e` builds the application and
runs the deterministic Playwright Chromium suite; install its browser once
with `npx playwright install chromium`. The E2E fixture uses no live Gemini,
Ollama/RAG, or target-backend service. RAG is separate: build artifacts with
mashala rag build, then run the retrieval service in its container if the
knowledge-answer path is enabled. The scaffold does not automatically start
RAG or connect it to the page.

## 14. Minimal end-to-end example

Transactional flow:

~~~text
"Please open an urgent request about my damaged device"
→ router proposes create_request
→ extractor proposes subject/priority values
→ deterministic editable form displays those values
→ schema validation succeeds
→ user confirms
→ browser sends POST /service-requests using the target app's request function
~~~

Knowledge flow:

~~~text
"What information is needed for a service request?"
→ Node asks the RAG retrieval service for ranked chunks
→ the knowledge-answer path supplies selected chunks to Gemini as untrusted context
→ the answer cites selected chunk IDs, or returns insufficient_context
~~~

These are the current runtime contracts and library paths; the repository does
not yet supply the finished page orchestration that presents both flows in one
generated application.

## 15. Security/architecture rules developers must know

- Target-backend API calls execute in the browser.
- The target application owns authentication and authorization.
- The target backend remains authoritative for business validation.
- LLM output is untrusted and only a proposal.
- Explicit confirmation protects side-effecting writes.
- Backend data is not model-visible unless explicitly projected.
- Documentation and RAG chunks are untrusted context, not instructions.

## Current limitations

- No project generator, mashala init, or application-definition helper exists.
- There is no package barrel export; examples import from source paths.
- The Next.js page is a scaffold, not a complete generated conversational
  frontend, and the runtime protocol is not connected to it.
- Target-backend origin and session wiring remain application integration work;
  Mashala stores neither credentials nor auth state.
- RAG configuration is filesystem/CLI based; there is no documentation-source
  metadata API and no automatic RAG service startup.
- Gemini is the only current provider adapter and needs server environment
  configuration.
- Reference fields support one independent GET source; cascading/dependent
  fields are not implemented.
