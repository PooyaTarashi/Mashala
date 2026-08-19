# React Chat UI Evaluation

**Issue:** ISSUE-073  
**Evaluated:** 2026-08-20  
**Decision:** Keep `MashalaChat` in-house. Add no chat UI dependency.

## Scope and decision test

This evaluation asks whether a maintained React chat UI system would reduce the
cost or risk of ISSUE-074 without taking ownership of Mashala's application
protocol, deterministic workflow, browser-side target-backend execution, or
ADR-018 conversation lifecycle. It is not approval to add streaming, an agent
runtime, a hosted chat service, or a second authentication system.

The installed baseline is Next.js 16.3.0 with React and React DOM 19.2.8. The
application uses the App Router, and the existing `MashalaChat` is a client
component hosted by a server-rendered page. No component framework, Tailwind,
or general-purpose UI kit is installed.

The following architecture filters are mandatory:

- target-backend requests and target credentials remain in the browser;
- the Mashala server does not become a target-backend proxy or chat BFF;
- the developer's LLM secret stays server-side and no target credential enters
  model-visible context;
- forms, confirmation, workflow transitions, and result views remain
  deterministic Mashala application logic;
- restored state remains the bounded, safe browser record defined by ADR-018;
- a library may render Mashala-declared React components, but it may not turn
  model output into arbitrary React, HTML, or executable tools.

## Current implementation inspected

The current UI already owns substantially more than message bubbles:

- `app/mashala-chat.tsx` owns the protocol reducer, routing, cancellation,
  correlation checks, direct browser reads and writes, the ADR-018 store,
  bounded context, restoration, reset/clear behavior, and transcript rendering.
- `CompiledForm` is an accessible deterministic renderer with schema validation,
  reference-field loading/failure states, field errors, and an error summary.
- `ConfirmationGate` owns the exact reviewed request snapshot, back/confirm
  transitions, pending state, duplicate-submit protection, and browser execution.
- `ResultCardRenderer` renders only developer-authored card/list declarations and
  handles missing values, formatter rules, safe image URLs, and image fallbacks.
- Transcript entries already cover user and assistant messages, routes,
  proposals, protocol errors, read loading/success/empty/failure, and safe
  restored outcome summaries. Pending and transport failures are announced.
- ISSUE-071 and ISSUE-072 tests cover refresh, expiry, identity changes, storage
  failures, safe restoration, bounded context, follow-ups, stale work, duplicate
  actions, reads, forms, confirmation, and deterministic result rendering.

The remaining ISSUE-074 work is primarily presentation integration: place live
forms and confirmation reviews into the ordered transcript, use a multiline
composer, improve focus and transcript scrolling, visibly distinguish restored
content, and polish responsive/themed styling. A third-party renderer cannot
replace Mashala's state, safety, or persistence responsibilities.

## Serious shortlist

Package counts below describe published package metadata, not measured Mashala
bundle sizes. Tree shaking, copied source, and application usage make a byte
estimate misleading before a prototype build. That prototype is not justified
by this evaluation's outcome.

### 1. Assistant UI (`@assistant-ui/react`)

| Criterion | Evaluation |
| --- | --- |
| Maintenance | Strong. npm showed 0.15.14 published on the evaluation date, and the repository has current releases and migration documentation. |
| License | MIT. |
| Next.js / React compatibility | The package declares React and React DOM `^18 || ^19`, so React 19.2.8 is in range. It has no Next.js peer contract; its interactive primitives must remain below a `"use client"` boundary. A Next.js 16.3 smoke test would still be required before adoption. |
| Bundle / runtime | The published package reported 18 dependencies. The current manifest includes Assistant UI runtime/store packages, several Radix packages, Zustand, Zod, `react-textarea-autosize`, and other helpers. It is a meaningful runtime layer, not one scroll hook. |
| Accessibility | This is the strongest candidate: headless primitives document keyboard behavior, composer semantics, error alerts, and transcript/scroll behavior. Mashala would still own labels, live-region policy, focus handoff, and automated accessibility tests for custom content. |
| Mobile / responsive | Touch-aware composer behavior is documented. The headless layer does not supply Mashala's responsive design, so CSS and mobile testing remain local work. |
| Theming / customization | Excellent. Unstyled composable primitives allow the current CSS-module design to remain authoritative. |
| Server / client constraints | Thread, composer, runtime, and scrolling are client-side. Mashala's server page can host them, but its existing client component boundary remains. |
| Arbitrary custom React inline | Possible through custom message/data-part renderers and runtime adapters. It is not a plain `ReactNode` transcript API: Mashala entries must be translated into the library's message/part model. |
| Mashala content | `CompiledForm`, `ConfirmationGate`, result cards, errors, and loading UI can be registered/rendered as custom content. Mashala must retain their reducers, snapshots, side-effect guards, and persistence rules outside the library. |
| Non-streaming | Yes. The External Store runtime accepts application-owned messages and async callbacks; an ordinary completed response can update that store without token streaming. |
| Secrets / tools / backend | It does not require a provider secret in the browser or force a backend, auth system, or target proxy when the External Store runtime is used. AI-SDK, cloud, and tool integrations are optional product paths and would be excluded. Tool UI capability does not authorize arbitrary tool execution. |
| Adoption cost / verdict | Closest fit, but still introduces a second message/runtime model plus adapter code at the exact boundary already covered by Mashala tests. API migrations have occurred in recent minor versions. It saves some composer/scroll/a11y mechanics while leaving the hard integration work intact. Do not adopt for ISSUE-074. |

If this candidate were ever reconsidered, the smallest credible surface would be
one direct dependency on `@assistant-ui/react`, using only its External Store and
headless thread/message/composer primitives. Mashala would not add an AI-SDK
adapter, Assistant Cloud, generated UI registry, or tool executor. This is not a
current dependency recommendation.

### 2. Vercel AI Elements

| Criterion | Evaluation |
| --- | --- |
| Maintenance | Strong. The repository and pull requests are active, and release 1.9.0 was published in March 2026. |
| License | Apache-2.0. |
| Next.js / React compatibility | It is explicitly Next.js-oriented and the current repository develops against React 19.2.x, close to Mashala's installed version. Because elements are copied into the application rather than consumed behind a stable React peer contract, generated source and every imported dependency require local compatibility ownership. |
| Bundle / runtime | The CLI package itself reports no runtime dependencies, but that is not the application cost. The CLI copies source and installs each component's imports. `Conversation` imports `use-stick-to-bottom`, Lucide, AI types, and shadcn UI; `Message` currently imports Streamdown and its code, math, CJK, and Mermaid plugins plus UI helpers. Selecting components controls cost, but the default message surface is broad. |
| Accessibility | Component pages document ARIA, keyboard, and responsive behavior. `Conversation` uses a log role and return-to-bottom control. Mashala remains responsible for custom content announcements and focus transitions. |
| Mobile / responsive | Responsive Tailwind styles are supplied and intended for mobile use. They would introduce a second styling convention because Mashala currently uses CSS modules. |
| Theming / customization | Very high after installation because source is copied into the repository. The intended theme layer is shadcn plus Tailwind CSS variables, neither of which Mashala currently uses. Source ownership also means owning upstream merges. |
| Server / client constraints | The relevant conversation and message components are `"use client"` components. They can sit under the current server page but do not reduce the client boundary. |
| Arbitrary custom React inline | Yes. `Conversation` accepts React children and `MessageContent` can contain application-owned React. `MessageResponse` is a Markdown/string renderer and is unnecessary for Mashala's deterministic components. |
| Mashala content | Forms, confirmation reviews, cards, errors, and loading states can be children of `MessageContent`. This is technically direct and does not require their logic to move. |
| Non-streaming | Yes at the presentation layer. Although examples use AI SDK `useChat` and streaming, Mashala can render its own completed message/status state without streaming. |
| Secrets / tools / backend | Basic elements do not require provider secrets, execute tools, own authentication, or force a target proxy. AI Gateway and AI SDK routes are documented defaults, not requirements. Mashala must not adopt those defaults merely to use the visuals. Optional tool components may display only deterministic Mashala state; they confer no execution authority. |
| Adoption cost / verdict | Official prerequisites assume an AI-SDK Next.js project with shadcn and Tailwind. Adding that design/build surface for two presentational problems is disproportionate; manually trimming copied components makes Mashala the maintainer of a fork. Do not adopt. |

The smallest conceivable extraction would be only the copied `Conversation`
scroll shell, with its exact required helpers, while keeping Mashala's own entry
markup and composer. Even that would add a new source-sync and styling burden for
behavior that is small enough to implement and test locally.

### 3. Alibaba ChatUI (`@chatui/core`)

| Criterion | Evaluation |
| --- | --- |
| Maintenance | Plausible but weaker than the first two. npm showed 3.8.0 published about three months before evaluation; the public repository remains available, while some checked-in package metadata and examples lag the newest React toolchain. |
| License | MIT. |
| Next.js / React compatibility | Its peer range is React and React DOM `>=16.8.0`, which admits React 19 semantically, but the repository package metadata still shows React 17-era development dependencies. There is no Next.js 16 or React 19 support statement. Adoption would require an explicit compatibility and Strict Mode prototype. |
| Bundle / runtime | npm reported six dependencies. The package brings a complete chat shell, styles, DOM sanitization/polyfill helpers, and its own message/composer conventions. It is smaller than an AI framework but materially broader than the missing transcript-scroll behavior. |
| Accessibility | The project advertises accessibility support, but current English documentation provides less granular evidence for focus, live-region, and keyboard behavior than Assistant UI. Existing Mashala assertions would have to be recreated against its DOM. |
| Mobile / responsive | Responsive/mobile chat is a core project goal and the input supports multiline/auto-size behavior. Its supplied layout and CSS would replace or override much of Mashala's current shell. |
| Theming / customization | Theme variables and custom rendering exist, but integration is based on the library's CSS and component model rather than Mashala's current CSS modules. |
| Server / client constraints | Interactive DOM-dependent components belong under `"use client"`; there is no useful server-component surface. |
| Arbitrary custom React inline | Yes. `renderMessageContent(message)` returns React content. Mashala can map declared entry kinds to local components. |
| Mashala content | Technically embeddable through the custom renderer, including forms, review, cards, errors, and loading. Mashala must bypass or adapt ChatUI's message and typing state so it cannot become workflow authority. |
| Non-streaming | Yes. Its basic examples append complete messages; streaming is not required. |
| Secrets / tools / backend | It is a UI library and imposes no LLM secret, tool executor, target authentication, proxy, or hosted backend. |
| Adoption cost / verdict | It would replace the shell, message model, composer, and CSS while most of Mashala's domain logic and tests remain. Current React/Next evidence is weaker, and the custom-render path means Mashala would use little of its opinionated message UI. Do not adopt. |

### 4. Stream Chat React (`stream-chat-react`)

| Criterion | Evaluation |
| --- | --- |
| Maintenance | Strong. npm showed 14.10.0 published about two weeks before evaluation and the SDK/repository are actively maintained. |
| License | Proprietary Stream source-code license, not an OSI open-source license. Its grant is restricted to qualifying Stream customers and contains competitive-use restrictions. This alone is unsuitable for an uncommitted foundational UI dependency. |
| Next.js / React compatibility | Its package declares React and React DOM 17, 18, or 19, so React 19.2.8 is in range. It also requires the `stream-chat` SDK. Browser providers, contexts, and connection lifecycle dominate the integration. |
| Bundle / runtime | npm reported 28 dependencies, in addition to the required `stream-chat` SDK. The package includes virtualization, Markdown, media, i18n, date, positioning, and accessibility helpers and maintains a live Stream connection. It is by far the broadest runtime here. |
| Accessibility | Strong documented WCAG 2.1-oriented keyboard and screen-reader guidance. |
| Mobile / responsive | Mature responsive UI with documented modern mobile-browser support. |
| Theming / customization | Broad component replacement and CSS-variable theming are available. |
| Server / client constraints | The browser initializes a Stream client and WebSocket connection. A trusted server must use the Stream secret to mint user tokens. This adds both client and server architecture, not just UI. |
| Arbitrary custom React inline | A custom message component can render React, so Mashala views are technically possible. They would still be wrapped in Stream's channel/message identity and lifecycle. |
| Mashala content | Technically renderable, but live form/review workflow state does not belong in a hosted chat message model. Mashala would keep all existing state while adding synchronization with Stream messages. |
| Non-streaming | Ordinary chat messages are supported without LLM token streaming, but the SDK still assumes a persistent Stream real-time connection. |
| Secrets / tools / backend | It does not require an LLM secret in the browser and does not inherently execute tools. It does require Stream project identity, server-side Stream credentials/token minting, Stream user authentication, hosted chat storage, and Stream's backend. That is a new chat backend/auth boundary. |
| Adoption cost / verdict | **Rejected on architecture and license, not merely cost.** A hosted chat service conflicts with ADR-018 browser-owned session memory and Mashala's deliberately bounded auth/server roles. It would transmit/store conversation data under a new service model and require an ADR-level product change. |

## Candidates screened out before the serious comparison

These packages were not counted as serious finalists because current maintenance
evidence was materially weaker on 2026-08-20:

- Chatscope React Chat UI Kit 2.1.1 had been published roughly a year earlier;
  its latest repository release was the May 2025 React 19 peer-range update.
- NLUX React 2.17.1 had been published roughly two years earlier.
- React ChatBotify 2.5.0 had been published roughly nine months earlier and its
  flow-oriented chatbot abstraction would duplicate Mashala's deterministic
  capability/workflow model even though it supports JSX content.

Popularity, stars, or a long feature list did not override the maintenance and
architecture filters.

## Adoption comparison

| Choice | What it saves | What Mashala still owns | New cost / risk |
| --- | --- | --- | --- |
| Improve `MashalaChat` | Nothing is outsourced; reuse current markup, reducers, CSS modules, and tests. | Transcript integration, multiline composer, focus, scroll anchoring/return-to-latest, responsive polish, and accessibility verification. | A focused first-party presentation refactor; no compatibility, license, message-adapter, or supply-chain surface. |
| Assistant UI | Headless composer/thread/scroll primitives and some accessibility mechanics. | Every deterministic component, protocol transition, browser side effect, storage/context rule, restoration behavior, and custom entry mapping. | Second runtime/message model, 18-package dependency surface, adapter/tests, version migrations. |
| AI Elements | Copyable conversation/message visuals and scroll control. | All application state and most semantic rendering. | Tailwind/shadcn-shaped styling, per-component dependencies, copied-source maintenance; full defaults also assume AI SDK. |
| Alibaba ChatUI | Complete chat shell, composer, responsive layout, and message list. | All domain state plus custom rendering for nearly every meaningful Mashala entry. | Shell/CSS replacement, message mapping, weaker React 19/Next 16 evidence, test rewrites. |
| Stream Chat React | Production hosted chat, real-time channel UI, responsive/a11y features. | Mashala workflow and deterministic content, plus synchronization with Stream. | Prohibited architecture expansion, proprietary license, hosted data/auth/backend, largest runtime. |

`MashalaChat` is currently large, but most of that size is protocol, workflow,
browser I/O, restoration, and defensive state handling. A chat library does not
remove those responsibilities. Extracting first-party transcript-item,
composer, and scroll/focus presentation components provides a clearer boundary
without translating tested state into a second runtime.

## Decision

Keep `MashalaChat` in-house for ISSUE-074. The justified dependency change is
**none**.

ISSUE-074 should improve the existing presentation layer while preserving the
current reducer and application authority. In particular, it can extract local
transcript/rendering components, render `CompiledForm`, `ConfirmationGate`, and
result/error/loading views in transcript order, replace the single-line input
with an accessible multiline composer, and implement a small local
scroll/focus controller with tests. Restored safe summaries must remain visually
distinct and must never recreate live confirmation or execution authority.

No ADR is created. This evaluation preserves every accepted architecture
decision and adds no dependency. A future hosted chat backend or library-owned
auth/runtime would be architecture-significant and would require an ADR before
implementation. A future presentation dependency should be reopened only if
ISSUE-074 produces a measured maintenance or accessibility problem that a small
primitive solves; Assistant UI's headless External Store path would be the first
candidate to re-evaluate, not a pre-approved choice.

## Evidence

Repository evidence:

- [`package.json`](../package.json)
- [`app/mashala-chat.tsx`](../app/mashala-chat.tsx)
- [`src/form-renderer.tsx`](../src/form-renderer.tsx)
- [`src/confirmation-gate.tsx`](../src/confirmation-gate.tsx)
- [`src/result-card-renderer.tsx`](../src/result-card-renderer.tsx)
- [ADR-002](decisions/002-full-frontend-application.md),
  [ADR-003](decisions/003-browser-executes-target-backend-apis.md),
  [ADR-013](decisions/013-transport-independent-runtime-protocol-v0.1.md),
  [ADR-016](decisions/016-model-visible-backend-data-uses-explicit-browser-side-projection.md),
  [ADR-017](decisions/017-canonical-read-capabilities-and-result-views.md),
  and [ADR-018](decisions/018-browser-session-scoped-conversation-memory.md)

External evidence checked on 2026-08-20:

- Assistant UI: [npm package](https://www.npmjs.com/package/@assistant-ui/react),
  [package manifest](https://github.com/assistant-ui/assistant-ui/blob/main/packages/react/package.json),
  [MIT license](https://github.com/assistant-ui/assistant-ui/blob/main/LICENSE),
  [External Store runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store),
  [runtime architecture](https://www.assistant-ui.com/docs/runtimes/concepts/architecture),
  [primitives](https://www.assistant-ui.com/docs/primitives),
  [thread](https://www.assistant-ui.com/docs/primitives/thread),
  [composer](https://www.assistant-ui.com/docs/primitives/composer),
  [message](https://www.assistant-ui.com/docs/primitives/message), and
  [migration history](https://www.assistant-ui.com/docs/migrations/v0-11).
- AI Elements: [repository and prerequisites](https://github.com/vercel/ai-elements),
  [releases](https://github.com/vercel/ai-elements/releases),
  [Apache-2.0 license](https://github.com/vercel/ai-elements/blob/main/LICENSE),
  [package manifest](https://github.com/vercel/ai-elements/blob/main/packages/elements/package.json),
  [Conversation documentation](https://elements.ai-sdk.dev/components/conversation),
  [Conversation source](https://github.com/vercel/ai-elements/blob/main/packages/elements/src/conversation.tsx),
  [Message documentation](https://elements.ai-sdk.dev/components/message), and
  [Message source](https://github.com/vercel/ai-elements/blob/main/packages/elements/src/message.tsx).
- Alibaba ChatUI: [npm package](https://www.npmjs.com/package/@chatui/core),
  [repository/package metadata](https://github.com/alibaba/ChatUI/blob/master/package.json),
  [MIT license](https://github.com/alibaba/ChatUI/blob/master/LICENSE), and
  [component documentation](https://chatui.io/components).
- Stream Chat React: [npm package](https://www.npmjs.com/package/stream-chat-react),
  [package manifest](https://github.com/GetStream/stream-chat-react/blob/master/package.json),
  [source-code license](https://github.com/GetStream/stream-chat-react/blob/master/LICENSE),
  [React SDK overview](https://getstream.io/chat/docs/sdk/react/),
  [accessibility guide](https://getstream.io/chat/docs/sdk/react/guides/accessibility/),
  [theming](https://getstream.io/chat/docs/sdk/react/theming/themingv2/),
  [custom message component](https://getstream.io/chat/docs/sdk/react/components/message-components/message/),
  [browser user initialization](https://getstream.io/chat/docs/react/init-and-users/), and
  [server token model](https://getstream.io/chat/docs/node/).
- Screened-out projects: [Chatscope npm](https://www.npmjs.com/package/@chatscope/chat-ui-kit-react),
  [Chatscope releases](https://github.com/chatscope/chat-ui-kit-react/releases),
  [NLUX npm](https://www.npmjs.com/package/@nlux/react), and
  [React ChatBotify npm](https://www.npmjs.com/package/react-chatbotify).
