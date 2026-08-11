# Open Questions

These questions remain intentionally unresolved. P0 decisions removed from this list are recorded in ADR-011 through ADR-013 and their focused documents. Do not let an implementation silently choose the remaining items.

## Thesis/research

1. What is the primary contribution: specification language, runtime architecture, empirical comparison, or a clearly prioritized combination?
2. What are the final research questions?
3. Which demo domain is most defensible and practical: banking, university/course registration, or another transactional system?
4. Is a conventional baseline generated from the same schemas or hand-built?

## Architecture

5. What explicit projection/minimization mechanism governs backend-result data sent to the model?
   - developer-declared model-visible fields;
   - explicit projection functions;
   - schema annotations;
   - another explicit mechanism.

   ADR-010 fixes the principle. `CANONICAL_SPEC.md` reserves a policy extension point and `RUNTIME_PROTOCOL.md` reserves a selected-context event, but P0 deliberately does not choose the mechanism.

6. What durable conversation persistence, if any, follows the v0.1 in-memory proof? ADR-011 permits only ephemeral single-process state for v0.1.
7. Which transport carries the v0.1 logical runtime events: ordinary HTTP, SSE, WebSocket, or a combination? ADR-013 defines event semantics independently of this choice.
8. Which validation failures are handled exclusively in the browser, and how are target-backend validation errors normalized for display? JSON Schema is authoritative for pre-execution form validation, while the target backend remains authoritative for business validation.

## Authoring and forms

9. What minimal application-level authoring helper, if any, should assemble app metadata and declared capabilities into `MashalaSpec`? `defineCapability` now fixes capability authoring, including reference fields.
10. Are file uploads part of a later spec version or outside the project?

## Technology

11. Which browser end-to-end test runner should be adopted once browser interaction tests exist?
12. What simple documentation/RAG indexing approach is sufficient when Phase 5 begins? No vector database is selected.
13. After the deterministic state-machine requirements are implemented, does LangGraph materially improve persistence, interrupts, resumability, or branching? ADR-008 remains authoritative.

## Evaluation

14. What participant count and recruitment plan are practical?
15. What is the final task set?
16. Which metrics are non-negotiable?
17. Which safety/adversarial cases are required?

## Resolved in P0

- Canonical compiled spec format: ADR-012 and `CANONICAL_SPEC.md`.
- Static v0.1 field types: `text`, `longText`, `number`, `select`, and `boolean`.
- Browser/server logical event protocol: ADR-013 and `RUNTIME_PROTOCOL.md`; transport remains open.
- Next.js/React/TypeScript and Node runtime structure: ADR-011 and `TECH_STACK.md`.
- Package manager, test runner, schema validator, and minimal persistence: ADR-011. First provider/API: ADR-015, which supersedes ADR-011's provider-specific clauses.
- Initial workflow implementation: a small custom deterministic state machine; LangGraph evaluation remains a later question under ADR-008.
- Reference response mapping: one root response array is projected through developer-declared direct `value` and `labelFrom` string properties; malformed items reject the complete option result, and cascading fields remain deferred.
- Target-app auth integration: ISSUE-031 defines one fetch-like `TargetBackendRequest` browser behavior shared by writes and reference reads. The target app owns login, session lifecycle, refresh, and persistence; no credential is serialized into Mashala data or protocol events.
