# ADR-018 — Conversation memory is browser-owned and refresh-persistent

**Status:** Accepted

**Extends and partially supersedes:** ADR-011's ephemeral conversation-state
clause. ADR-011 remains authoritative for the v0.1 stack and for not selecting a
database, ORM, provider-managed conversation, or multi-process state service.

## Context

Mashala currently creates an opaque conversation ID in the page, retains the
visible transcript and deterministic workflow only in React memory, and sends
one stateless request at a time to the Mashala server. A refresh loses all of
that state. The current server does not use the conversation ID as an
authentication or storage key.

Multi-turn behavior needs a precise answer to four different identity
questions:

1. who the target backend authenticates;
2. which person, if any, the browser UI displays;
3. which Mashala conversation an event belongs to; and
4. which user-related facts may be shown to the model.

Conflating those identities could leak one target-app user's data to another,
turn a conversation ID into an authorization token, or accidentally send a
target credential to the Mashala server or model. Persisting the existing page
state as-is would also be unsafe: it can contain confirmation snapshots,
in-flight execution state, native `Response` objects, and complete read data.

The thesis prototype needs useful continuity across refresh, but neither the
scope nor the evaluation requires accounts managed by Mashala, cross-device
history, or durable server infrastructure.

## Options considered

| Option | Benefit | Cost and limitation | Decision |
| --- | --- | --- | --- |
| Ephemeral only | Smallest runtime and strongest automatic expiry | Refresh destroys a multi-turn draft and does not prove session continuity | Rejected as too weak for the prototype |
| Refresh-persistent | Proves bounded memory and safe restoration with no server database | Limited to one browser tab and target-auth session | **Selected** |
| Durable/cross-device | Enables long-lived history and device handoff | Requires Mashala user identity, server authorization, encrypted durable storage, deletion operations, and multi-device conflict rules | Deferred |

## Decision

The first persistence implementation will use a **browser-owned,
refresh-persistent conversation record in `sessionStorage`**. It is scoped to
one application, one browser tab, and one target-authentication session (or one
signed-out tab session). It is not durable, cross-device, or shared across
tabs.

The Mashala server remains stateless between HTTP requests for this first
implementation. It stores no conversation record and uses no provider-managed
conversation or response store. When language processing needs history, the
browser will send an allowlisted, bounded context snapshot with the current
request. That protocol change is follow-up implementation work and must be
versioned and validated; this ADR does not implement it.

### Four separate identities

#### 1. Target-app authentication identity

The target application owns the authenticated principal, login flow, session,
credentials, and authorization. Mashala neither creates nor verifies that
identity.

For isolation, the target-app integration supplies the browser conversation
layer with only an **opaque, non-secret authentication-scope tag** that is
stable for the current login session and changes on logout, login, account
switch, or other principal change. It must not be a cookie, bearer token,
target-backend session ID, authorization header, or other credential. It is
browser-only metadata and is never model-visible.

If an authenticated target app cannot provide a safe stable scope tag on
rehydration, Mashala fails closed by discarding the persisted conversation
rather than risking restoration for the wrong user.

#### 2. Browser-visible/display identity

The first version has **no developer-supplied user display profile**. Mashala
does not standardize a display name, avatar, pronouns, locale, or personalization
properties, and none are sent to the model. This is explicitly deferred until a
concrete UI or evaluation need justifies an allowlisted profile contract.

The target app may render its own identity UI outside the conversation
contract, but doing so does not make that data part of Mashala memory or model
context.

#### 3. Mashala conversation identity

`conversationId` is a browser-generated opaque random identifier with at least
128 bits of entropy. It identifies one tab-local conversation for correlation
and storage. It is not a user ID, authentication token, authorization claim,
provider response ID, or target-backend session ID.

The effective storage scope is:

```text
browser origin + Mashala app ID + browser tab + auth-scope tag + conversation ID
```

`sessionStorage` supplies origin and tab isolation. The record is namespaced by
the stable Mashala application ID and contains the conversation ID and current
auth-scope tag. A conversation ID never grants access to target-backend data or
authorizes a workflow transition.

#### 4. Model-visible user context

There is no model-visible user profile in the first version. The only dynamic
conversation context that may be sent to the model is an explicit allowlist:

- the current user message;
- a bounded recent transcript containing only user and assistant natural-language
  text;
- the active declared capability ID and the existing developer-authored
  capability/form metadata needed by the language task;
- bounded recent deterministic outcome summaries in the closed safe shape
  defined below; and
- for the current request only, an ADR-016 browser-side projection when its
  declaration exists and projection succeeds.

The authentication-scope tag, target-app principal identifier, browser display
identity, conversation storage metadata, form edits made only through the
deterministic UI, and full backend results are not model-visible. Restoring a
draft does not authorize sending that draft to the model.

All browser-supplied history and summaries are untrusted model data. They are
not system instructions and cannot select an operation, authorize a request,
validate a field, confirm a write, or advance deterministic workflow.

### Conversation record

The stored record is a versioned, strict, JSON-serializable value containing
only:

- record version;
- Mashala application ID and a deterministic fingerprint of the compiled
  application spec;
- conversation ID and opaque authentication-scope tag;
- creation and last-activity timestamps;
- a bounded transcript of user/assistant text with Mashala event IDs and
  timestamps;
- the active declared capability ID and capability kind, when a run is safely
  resumable;
- a resumable workflow phase limited to `idle`, `filling`, or `collecting`;
- partial draft values that are valid against their current declared property
  schemas; and
- bounded safe summaries of recent deterministic read/write outcomes.

On restoration, deterministic code validates the complete record, current app
ID and spec fingerprint, conversation/auth scope, capability membership,
capability kind, phase, and every draft property. Unknown and invalid fields are
rejected. The persisted value is data from a mutable browser store and is never
trusted merely because Mashala wrote it earlier.

Reference-field values are not restored as valid selections. Their allowed
options depend on current authenticated backend data and must be fetched and
validated again. Credential-like or authentication-material fields are never
persisted. Target apps must handle authentication outside capability forms and
chat.

An assistant message produced from `backend.context.selected` is not persisted,
because the projection authorizes model visibility for one language request,
not later conversation retention. The page may show that response until it is
cleared or refreshed; persisted history uses a fixed deterministic notice
instead. This prevents model-generated restatements of projected backend values
from silently becoming durable transcript data.

### Safe deterministic outcome summaries

A read/write outcome summary contains only this closed information:

- declared `capabilityId`;
- capability kind, `read` or `write`;
- completion timestamp;
- normalized outcome: `succeeded`, `target_http_error`, `network_error`,
  `invalid_response`, `cancelled`, or `interrupted_unknown`; and
- for `target_http_error` only, the numeric HTTP status code.

No other read/write result information is safe by default. In particular, a
summary contains no request values, response body, response headers, resolved
URL, backend error text, rendered property, item count, account/resource ID, or
ADR-016 projected value. User-visible summary sentences are generated
deterministically from the closed fields and developer-authored capability
metadata; arbitrary backend text is not copied into them.

### Explicitly excluded state

Conversation records never contain:

- target-backend cookies, bearer tokens, authorization headers, refresh tokens,
  credential-bearing session IDs, or any other target credential;
- the developer's LLM provider secret or provider-native session/response IDs;
- target-app authentication identities or display profiles;
- raw or complete target-backend responses, response headers, request objects,
  or native `Response` objects;
- ADR-016 projected backend data after the one request for which it was
  produced;
- authorized confirmation snapshots;
- pending event promises, abort controllers, executing/fetching state, or retry
  authority;
- resolved dynamic reference-option collections;
- model instructions, retrieved RAG chunks, raw provider output, or provider
  conversation state; or
- arbitrary error details and stack traces.

The target-auth integration must not expose credentials to the conversation
layer. Input identified as authentication material is rejected before provider
use or persistence. Free-form chat is not an authentication surface; target
apps must never ask users to enter target credentials there.

### Safe restoration and stale work

Restoration never performs a backend request or automatically sends a runtime
event.

- `idle` restores as `idle`.
- `filling` and `collecting` may restore only with a currently declared matching
  capability and revalidated partial static draft values.
- `confirming` restores as `filling`, without the reviewed snapshot; the user
  must review and confirm again.
- `routing` restores as `idle`; its pending event is discarded.
- `fetching` never resumes automatically. An input read may return to
  `collecting` with revalidated static draft values; a zero-input read returns
  to `idle`.
- `executing` never restores. Its snapshot and draft are discarded, the
  conversation returns to `idle`, and an `interrupted_unknown` summary records
  that the outcome must not be assumed or automatically retried.
- terminal read/write phases restore as `idle` with only the safe normalized
  outcome summary. Full displayed results are not restored.

An unknown record version, malformed record, different app ID, different spec
fingerprint, authentication-scope change, expiry, or missing declared
capability makes the record stale. Mashala deletes it and starts a new
conversation. Migration is not part of the first implementation.

### Retention, expiry, and clearing

The record has both:

- a **30-minute inactivity expiry**; and
- an **8-hour absolute lifetime** from creation.

The browser checks expiry before hydration and before each persistence update.
Expired and invalid records are deleted. Closing the tab normally deletes
`sessionStorage`; the explicit timers are still authoritative because browser
session restoration can retain it.

A user-visible **Clear conversation** action deletes the record, discards the
transcript and drafts, invalidates pending language/read correlations, and
creates a fresh conversation ID. It cannot claim to cancel a write already
accepted by the target backend. Clearing during an in-flight write records no
success or failure and must never cause an automatic retry.

On logout, the target-app integration clears the current conversation record
before or atomically with the auth transition. On login, account switch, or any
authentication-scope-tag change, Mashala discards the prior record and starts a
new conversation. Anonymous history is not promoted into an authenticated
conversation, and authenticated history is not retained for the next signed-in
principal.

### Signed-out behavior

A signed-out tab may have its own refresh-persistent anonymous conversation for
documentation or other target-app-permitted interaction. It uses an explicit
anonymous scope and the same bounds and expiry. Target-backend authorization
remains authoritative, so Mashala memory does not make protected reads or
writes available. Moving between signed-out and authenticated state always
starts a new conversation.

### Concurrent tabs and requests

Each tab owns an independent `sessionStorage` record and conversation ID. Tabs
do not merge transcripts, share drafts, elect a writer, or apply last-write-wins
updates. Because browsers can clone `sessionStorage` when a tab is duplicated,
hydration performs a same-origin live-ID claim using `BroadcastChannel`. If
another live tab already owns the conversation ID, the later tab deletes the
cloned record and starts with a fresh ID. The channel carries only conversation
ownership nonces, never transcript, draft, auth-scope, or backend data.

Within one tab, one browser state owner serializes record updates. Existing
conversation/event/run correlation remains mandatory: late, duplicate,
cancelled, previous-conversation, or otherwise stale responses are ignored and
cannot be persisted into the current run. A target-auth change in any tab must
be surfaced through the target app's normal auth-state integration; that tab
clears itself as soon as it observes the changed scope.

### Deterministic size limits

Limits use UTF-8 byte length after deterministic JSON serialization, not a
provider-specific token estimate.

- one user or assistant message: at most **4,096 bytes**;
- persisted transcript: at most **12 entries** and **32,768 bytes** total;
- active draft JSON: at most **16,384 bytes**;
- retained outcome summaries: at most **8**;
- complete persisted record: at most **65,536 bytes**;
- transcript supplied to one model call: newest whole entries fitting at most
  **8 entries** and **16,384 bytes**;
- ADR-016 projection supplied to one model call: at most **8,192 bytes**; and
- all dynamic conversation data supplied to one model call, including the
  current message, transcript, active capability identifier, outcome summaries,
  and optional projection: at most **32,768 bytes**.

When a transcript limit is exceeded, the oldest whole entry is removed first.
At most the four newest outcome summaries are model-visible. If the record
would still exceed its limit, Mashala omits the draft from persistence rather
than partially serializing it. An oversized current message or ADR-016
projection is rejected; it is not silently truncated. Fixed system
instructions, developer-authored schemas, and separately bounded RAG chunks
are outside this conversation-data budget and retain their own contracts.

The first implementation performs **no LLM-generated summarization**. If a
later ADR introduces summarization, every summary must be treated as untrusted
model-derived data and must never become execution, validation, confirmation,
authorization, or workflow-transition authority.

## Relationship to accepted ADRs

- **ADR-003 is preserved:** records stay in the browser, and persistence never
  moves target-backend execution to the Mashala server.
- **ADR-006 is preserved:** the target app still owns authentication. The
  non-secret auth-scope tag is only an isolation signal, not a Mashala auth
  scheme or credential store.
- **ADR-007 is preserved:** restored and model-visible data are untrusted.
  Deterministic code revalidates state and owns every transition, confirmation,
  and side effect.
- **ADR-016 is preserved:** projected backend data remains explicitly
  allowlisted and browser-minimized. It is transient for one language request
  and is not added to persistent memory.
- **ADR-011 is extended and partially superseded:** page-lifetime-only memory is
  replaced by tab/session refresh persistence. The no-database choice, lack of
  restart recovery/server coordination, and absence of provider-managed
  persistence remain.

## Consequences

- The prototype can resume a safe draft after refresh without adding a server
  database or a Mashala account system.
- `sessionStorage` is not a credential vault or an XSS boundary. The design
  therefore minimizes stored data and prohibits credentials instead of adding
  client-side encryption that would not protect against same-origin script.
- A browser or server restart does not provide cross-device or durable history;
  server restarts do not matter because the browser carries bounded context.
- A refresh can never replay a confirmed write, resume an executing request, or
  restore a stale authorization decision.
- Separate tabs intentionally have separate conversations, even for the same
  target-app user.
- The implementation must add strict record validation, auth-lifecycle hooks,
  safe hydration/downgrade logic, a clear action, size/expiry enforcement, and a
  versioned bounded-context protocol extension in later issues.
- Durable/cross-device storage requires a new ADR covering Mashala identity,
  server authorization, encryption, retention operations, and conflict rules.
