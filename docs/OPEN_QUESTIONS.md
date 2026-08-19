# Open Questions

These questions remain intentionally unresolved. Accepted decisions removed
from this list are recorded in ADR-011 through ADR-018 with their focused
documents. Do not let an implementation silently
choose the remaining items.

## Thesis/research

1. What is the primary contribution: specification language, runtime architecture, empirical comparison, or a clearly prioritized combination?
2. What are the final research questions?
3. Which demo domain is most defensible and practical: banking, university/course registration, or another transactional system?
4. Is a conventional baseline generated from the same schemas or hand-built?

## Architecture

5. Which transport, if any, follows the initial ordinary HTTP request/response implementation: SSE, WebSocket, or a combination? ADR-013 defines event semantics independently of this choice.
6. Which validation failures are handled exclusively in the browser, and how are target-backend validation errors normalized for display? JSON Schema is authoritative for pre-execution form validation, while the target backend remains authoritative for business validation.

## Authoring and forms

7. Are file uploads part of a later spec version or outside the project?

## Technology

8. After the deterministic state-machine requirements are implemented, does LangGraph materially improve persistence, interrupts, resumability, or branching? ADR-008 remains authoritative.

## Evaluation

9. What participant count and recruitment plan are practical?
10. What is the final task set?
11. Which metrics are non-negotiable?
12. Which safety/adversarial cases are required?

## Resolved decisions

- Canonical compiled spec format: ADR-012, ADR-016, ADR-017, and
  `CANONICAL_SPEC.md` v0.3. The executable implementation is v0.3.
- Static v0.1 field types: `text`, `longText`, `number`, `select`, and `boolean`.
- Browser/server logical event protocol: ADR-013 and `RUNTIME_PROTOCOL.md`;
  ordinary non-streaming HTTP is implemented first, while later streaming or
  bidirectional transport remains open.
- Next.js/React/TypeScript and Node runtime structure: ADR-011 and `TECH_STACK.md`.
- Package manager, test runner, and schema validator: ADR-011. First
  provider/API: ADR-015. Conversation persistence: ADR-018, which supersedes
  ADR-011's page-lifetime-only state clause.
- Initial workflow implementation: a small custom deterministic state machine; LangGraph evaluation remains a later question under ADR-008.
- Conversation identity and persistence: ADR-018 selects a browser-owned,
  tab-local and target-auth-session-scoped `sessionStorage` record that survives
  refresh, expires deterministically, restores only safe workflow/draft state,
  and supplies only bounded allowlisted untrusted model context. Durable and
  cross-device storage are deferred.
- Application assembly: `defineMashalaApplication` produces the validated
  `MashalaSpec`, and `assembleMashalaApplication` binds server-only runtime
  dependencies outside serializable application data.
- Browser end-to-end runner: Playwright exercises production-page flows through
  deterministic local fixtures.
- Documentation/RAG implementation: ADR-014 and the completed P4 work define
  offline containerized Python/FAISS indexing, versioned artifacts, and a
  retrieval-only runtime service behind a provider-neutral Node interface.
- Reference response mapping: one root response array is projected through developer-declared direct `value` and `labelFrom` string properties; malformed items reject the complete option result, and cascading fields remain deferred.
- Target-app auth integration: ISSUE-031 defines one fetch-like `TargetBackendRequest` browser behavior shared by writes and reference reads. The target app owns login, session lifecycle, refresh, and persistence; no credential is serialized into Mashala data or protocol events.
- Model-visible backend projection: ADR-016 and ISSUE-032 define optional declarative output-to-source direct-property mappings on browser read sources. Projection fails closed in the browser, uses `backend.context.selected`, excludes credential-like data, and reaches the model only as untrusted context.
- Goal-level reads and result views: ADR-017 and `CANONICAL_SPEC.md` v0.3
  define `defineReadCapability`, optional compiled input, explicit scalar
  path/query bindings, one browser-executed `GET`, and developer-declared root
  object cards or root-array card lists. Wrapped/paginated arrays and arbitrary
  transformations are explicitly deferred, not left for implementation to
  choose silently.
