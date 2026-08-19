# Scope

This document is intentionally strict. New ideas should be compared against it before implementation.

## MUST — core project

### Developer-facing
- Scaffold a Mashala project.
- Define application metadata and documentation sources.
- Define goal-level capabilities.
- Define forms using a pleasant typed authoring surface, expected to be a TypeScript DSL.
- Compile form definitions to a canonical machine-readable schema.
- Bind capabilities/forms to declared backend API operations.
- Configure the LLM provider using server-side secrets.
- Provide `dev`, validation/linting, build, and production-start behavior.

### User-facing
- Full frontend application, not only an embeddable widget.
- Conversational interface.
- Explain what the target system can do using developer documentation.
- Route natural-language intent to declared capabilities.
- Extract partial form values from user language.
- Render real deterministic forms.
- Allow users to edit AI-prefilled values.
- Require explicit human confirmation for consequential writes.
- Execute authenticated target-backend requests in the browser.
- Execute developer-declared browser-side reads and present successful results
  through deterministic developer-declared cards or card lists.
- Support responsive/mobile-friendly UX.

### Dynamic application data
- Support a field whose options are fetched at runtime from a declared target-backend read operation.
- The request uses the user's existing client-side authentication context.
- The model must not invent dynamic options.
- The model must not receive the user's authentication credential.
- Support zero-input and scalar-input read capabilities whose path/query values
  come only from schema-valid inputs and explicit developer bindings.
- Keep read results browser-local by default; browser display does not grant
  model visibility.

### Server/runtime
- Keep LLM API secrets server-side.
- Support documentation retrieval/RAG.
- Support capability routing and slot extraction.
- Accept selected backend-result data from the browser when the model needs that information.
- Maintain explicit deterministic workflow state.

### Safety
- Target-backend authorization remains authoritative.
- No user credential is included in LLM prompts.
- No undeclared backend operation should be generated as an action.
- Forms are validated deterministically.
- Side-effecting actions require user confirmation according to policy.
- Backend/API content supplied to the LLM is untrusted data, not instructions.

## SHOULD — important if time permits

- AI-assisted import of OpenAPI into draft Mashala capabilities.
- Labeled routing evaluation set and `mashala eval`.
- Audit/debug trace for conversation routing and field extraction.
- Persian/RTL support.
- Accessibility-conscious form/chat rendering.
- Session/conversation persistence across refresh.
- Theme configuration and component overrides.
- Declared follow-up capabilities after one completed capability.

## COULD — stretch goals

- Cascading/dependent dynamic fields.
- Multiple LLM providers beyond the first adapter.
- Local-model comparison.
- Rich OpenAPI importer UX.
- Advanced evaluation ablations.
- Automatic routing-confusion warnings.
- Sophisticated resumable workflows.
- LangGraph implementation if complexity justifies it.

## NOT CURRENTLY IN SCOPE

- A general authentication framework.
- Defining OAuth/OIDC itself.
- Storing user credentials on the Mashala server as a default architecture.
- Proxying all target-backend API traffic through Mashala.
- A generic REST client or arbitrary response/request transformation language.
- General autonomous agents that freely decide which APIs to execute.
- Arbitrary LLM-generated HTML/JavaScript.
- A CMS/admin panel comparable to Payload.
- Choosing the developer's CI/CD provider.
- Hosting/deployment platform abstraction.
- Voice interaction.
- Native mobile applications.
- Multi-agent orchestration for its own sake.
- Elderly-user-specific UX claims unless explicitly researched.
