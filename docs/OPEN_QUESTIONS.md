# Open Questions

These are intentionally unresolved. Do not let an AI coding agent silently choose them.

## Thesis/research

1. What is the primary contribution?
   - specification language,
   - runtime architecture,
   - empirical comparison,
   - or a clearly prioritized combination?

2. What are the final research questions?

3. Which demo domain is most defensible and practical?
   - banking,
   - university/course registration,
   - another transactional system?

4. Is a conventional baseline generated from the same schemas or hand-built?

## Architecture

5. What is the canonical compiled Mashala spec format?

6. What exactly may be sent from browser API results to the LLM server?
   - developer-declared model-visible fields?
   - explicit projection function?
   - schema metadata?
   - automatic minimization?

7. Where is conversation state persisted?
   - server memory initially?
   - database?
   - client/server hybrid?

8. How should the client communicate structured runtime events with the server?
   - ordinary HTTP,
   - SSE,
   - WebSocket,
   - combination?

9. How does Mashala describe target-app auth integration without becoming an auth framework?

10. How much validation is duplicated client-side vs. delegated to the target backend?

## Forms

11. Exact TypeScript DSL API.

12. v0.1 field types.

13. File uploads: core or later?

14. Dependent/cascading dynamic options: currently deferred.

## Technology

15. Next.js vs. another React framework.

16. Node/TypeScript server runtime structure.

17. Custom state machine vs. LangGraph after the workflow requirements are implemented on paper.

18. Initial model/provider API and provider adapter interface.

19. Initial vector/RAG storage approach.

## Evaluation

20. Participant count and recruitment practicality.

21. Final task set.

22. Which metrics are non-negotiable?

23. Which safety/adversarial cases are required?
