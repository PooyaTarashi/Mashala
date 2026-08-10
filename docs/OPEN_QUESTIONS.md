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
8. How does Mashala describe target-app auth integration without becoming an auth framework?
9. Which validation failures are handled exclusively in the browser, and how are target-backend validation errors normalized for display? JSON Schema is authoritative for pre-execution form validation, while the target backend remains authoritative for business validation.

## Authoring and forms

10. What minimal application-level authoring helper, if any, should assemble app metadata and declared capabilities into `MashalaSpec`? `defineCapability` now fixes static capability authoring; the future `reference` field remains separately unresolved below.
11. Are file uploads part of a later spec version or outside the project?
12. What exact response mapping is used by the future `reference` field? One browser-executed read source per field is accepted; dependent/cascading sources remain deferred.

## Technology

13. Which browser end-to-end test runner should be adopted once browser interaction tests exist?
14. What simple documentation/RAG indexing approach is sufficient when Phase 5 begins? No vector database is selected.
15. After the deterministic state-machine requirements are implemented, does LangGraph materially improve persistence, interrupts, resumability, or branching? ADR-008 remains authoritative.

## Evaluation

16. What participant count and recruitment plan are practical?
17. What is the final task set?
18. Which metrics are non-negotiable?
19. Which safety/adversarial cases are required?

## Resolved in P0

- Canonical compiled spec format: ADR-012 and `CANONICAL_SPEC.md`.
- Static v0.1 field types: `text`, `longText`, `number`, `select`, and `boolean`.
- Browser/server logical event protocol: ADR-013 and `RUNTIME_PROTOCOL.md`; transport remains open.
- Next.js/React/TypeScript and Node runtime structure: ADR-011 and `TECH_STACK.md`.
- Package manager, test runner, schema validator, first provider/API, and minimal persistence: ADR-011.
- Initial workflow implementation: a small custom deterministic state machine; LangGraph evaluation remains a later question under ADR-008.
