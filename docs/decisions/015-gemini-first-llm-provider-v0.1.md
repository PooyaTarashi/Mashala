# ADR-015 — Google Gemini is the first LLM provider

**Status:** Accepted

**Supersedes:** The provider-specific and provider-persistence clauses of ADR-011. All other ADR-011 technology choices remain accepted.

## Context

ADR-011 originally selected OpenAI's Responses API for the first provider adapter. Before ISSUE-020 was implemented, the project selected Google Gemini instead. The provider choice must change without coupling Mashala's runtime contracts to Gemini or rewriting the accepted historical ADR.

## Decision

Use Google Gemini as the first v0.1 LLM provider implementation.

- Call Gemini's native non-streaming `generateContent` REST endpoint: `POST /v1beta/models/{model}:generateContent`.
- Authenticate from the Mashala server with `X-goog-api-key` using `GEMINI_API_KEY`.
- Configure the model with the server-side `GEMINI_MODEL` environment variable. Neither provider setting is part of the canonical spec or browser/server runtime protocol.
- Use Gemini's native `contents`/`parts` request format and structured-output generation configuration only inside the Gemini adapter.
- Expose Mashala-owned provider-neutral request, result, and error types to the rest of the runtime.
- Use one stateless request/response call. Do not add streaming, provider sessions, or an LLM SDK for this adapter.

Structured model output remains untrusted. Callers validate it against the relevant Mashala-owned schema or contract before it can affect deterministic behavior.

## Consequences

- No OpenAI SDK or OpenAI Responses API adapter is part of v0.1.
- Gemini-specific request and response objects do not enter the canonical spec, runtime protocol, routing, or slot-extraction contracts.
- The provider implementation is marked server-only so a client import fails at build time.
- The provider boundary accepts no target-backend operation or credential field.
- ADR-005's server-side provider-secret rule and ADR-013's transport-independent protocol remain unchanged.
