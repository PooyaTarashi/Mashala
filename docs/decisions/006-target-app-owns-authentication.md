# ADR-006 — The target application owns authentication

**Status:** Accepted

## Context
Mashala must work with existing backend systems but should not become a general authentication product.

## Decision
The target application defines its authentication/session protocol. Mashala exposes integration hooks so the generated browser client can log in and make authenticated requests.

Mashala does not mandate where a bearer token is persisted and does not prescribe `localStorage` as the default.

## Consequences
The demo app must provide one concrete integration, but the framework architecture remains compatible with cookies, OAuth/OIDC, short-lived bearer tokens, or other browser-compatible schemes.
