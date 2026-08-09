# Project Definition

## Name

**Mashala**

The project is named after the author's grandfather, who still uses an old Nokia phone and does not use a smartphone. The name is personal inspiration for the product idea: users should not need to understand a complicated digital interface before they can use a service.

This naming story does **not** make older adults the formal research population unless the eventual evaluation explicitly studies that population.

## One-sentence definition

Mashala is a framework that turns a machine-readable description of an existing backend application — its purpose, documentation, user capabilities, form definitions, and API bindings — into a complete conversational frontend application.

## Problem

Conventional web applications are navigation-driven. Users often need to know:

- where a feature is located,
- what the system calls it,
- which page or menu contains it,
- what information a form expects.

A human service clerk can instead map natural-language intent to the correct service, explain the process, and help complete the required form.

Mashala investigates whether an LLM can provide that intermediary layer while keeping form rendering, validation, confirmation, authentication, and backend execution deterministic.

## Product model

A developer should eventually be able to:

```bash
npx create-mashala-app my-frontend
cd my-frontend
mashala dev
mashala build
```

and supply:

- application description,
- backend/help documentation,
- capability descriptions,
- typed form definitions,
- target API bindings,
- authentication integration,
- an LLM provider configuration.

Mashala then provides a full frontend application centered around conversational interaction and deterministic forms.

## Core artifacts

1. **Developer specification / DSL**
   - describes application capabilities and forms;
   - compiles to the versioned representation in `CANONICAL_SPEC.md`: JSON Schema Draft 2020-12 plus Mashala metadata.

2. **Generated frontend client**
   - chat interface;
   - deterministic form renderer;
   - client-side authentication integration;
   - client-side authenticated backend calls;
   - confirmation UI;
   - styling/theming.

3. **Mashala server runtime**
   - LLM provider access;
   - intent/capability routing;
   - slot extraction;
   - documentation retrieval/RAG;
   - conversation state;
   - processing of selected backend-result data sent by the browser when required.

4. **Reference application**
   - a demo backend and conventional frontend baseline for evaluation.

5. **Evaluation**
   - compare conversational interaction with a conventional UI;
   - evaluate routing, form completion, safety, and usability.

## Core research direction

The intellectual focus should remain on the specification and interaction/runtime boundary rather than on simply assembling an LLM chatbot.

Candidate research questions remain subject to supervisor review:

- What minimal developer specification is sufficient to generate a useful conversational frontend for a transactional web application?
- How does an agent-mediated frontend compare with conventional navigation for difficult-to-discover or infrequent tasks?
- Which deterministic boundaries and guardrails are required to prevent LLM ambiguity from becoming unintended application actions?
