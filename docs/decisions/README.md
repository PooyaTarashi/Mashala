# Architecture Decision Records

Accepted decisions are authoritative.

- ADR-001 — Project name is Mashala
- ADR-002 — Complete frontend application
- ADR-003 — Target-backend API calls execute in browser
- ADR-004 — Data-backed fields are core
- ADR-005 — LLM secret is server-side
- ADR-006 — Target app owns authentication
- ADR-007 — Deterministic workflow
- ADR-008 — LangGraph is optional implementation
- ADR-009 — Build behavior is CI/CD-independent
- ADR-010 — Model-visible API data is explicit/minimized
- ADR-011 — Freeze the v0.1 technology stack
- ADR-012 — Canonical compiled spec v0.1
- ADR-013 — Transport-independent browser/server protocol v0.1
- ADR-015 — Google Gemini is the first LLM provider (supersedes ADR-011's provider-specific clauses)

When a major architectural choice changes:

1. add a new ADR that supersedes the old one;
2. do not silently rewrite history;
3. update current architecture/scope documents.
