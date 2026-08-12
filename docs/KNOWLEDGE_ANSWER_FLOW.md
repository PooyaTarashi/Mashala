# Knowledge-answer flow

ISSUE-048 adds the smallest server-side path for answering a question from
developer-provided documentation:

```text
documentation question
        ↓
DocumentationRetriever
        ↓
bounded ranked chunk selection
        ↓
LlmProvider.generateStructured
        ↓
grounded | insufficient_context | failure
```

The executable entry point is `answerDocumentationQuestion` in
`src/server/knowledge-answer.ts`. A caller chooses this knowledge path for a
documentation question and injects the ISSUE-047 `DocumentationRetriever` and
the ISSUE-020 provider-neutral `LlmProvider`. ISSUE-048 does not add automatic
question classification or change capability routing, slot extraction, or the
transport-independent runtime protocol.

## Retrieval and selection

The question is sent to `DocumentationRetriever.retrieve` before any
conversational-model call. The v0.1 proof requests the top five ranked chunks
and admits at most the first three returned chunks to model context. Empty
retrieval returns `insufficient_context` without calling the provider.

The knowledge-answer boundary validates the normalized retrieval result again.
Malformed chunks, provenance, scores, duplicate chunk IDs, and malformed
failure shapes fail closed. Retrieval-service failures remain distinct from
provider failures.

Only each selected chunk's Mashala chunk ID and content are model-visible.
Lower-ranked/unselected chunks and provenance metadata are not included in the
prompt. There is no whole-corpus prompt.

## Prompt and trust boundary

Static Mashala instructions are supplied through the provider's `instructions`
field. The provider's `input` field is a separate JSON value shaped
conceptually as:

```json
{
  "userQuestion": {
    "trust": "untrusted",
    "text": "..."
  },
  "developerDocumentation": {
    "trust": "untrusted",
    "chunks": [
      { "chunkId": "chunk:example", "content": "..." }
    ]
  }
}
```

Both the user question and documentation are data, not instructions.
Instruction-like documentation cannot authorize or execute a backend
operation, alter capability or confirmation configuration, control workflow,
call tools, or reveal secrets. Documentation can describe application behavior
for the answer, but it has no control-flow authority.

The model is instructed to use only the supplied documentation for
target-application facts. General model knowledge is not a fallback for absent
application documentation.

## Results and provenance

`KnowledgeAnswerResult` has three outcomes:

- `grounded` carries answer text and Mashala-bound source records;
- `insufficient_context` distinguishes empty retrieval from a model decision
  that the selected documentation does not support the answer;
- `failure` distinguishes normalized retrieval failure, malformed retrieval,
  provider failure, and malformed knowledge-answer output.

A grounded model output must name at least one unique selected chunk ID.
Invented, unselected, duplicated, or missing source IDs are rejected. Mashala
then binds accepted IDs back to the corresponding retrieval provenance; the
model cannot create source metadata. This is an internal citation-ready result,
not an advanced citation UI.

## Side-effect boundary

The knowledge-answer input contains only a question, retriever, and LLM
provider. It has no capability, operation, confirmation, workflow, target
backend request, or credential input. It cannot create or execute a
target-backend operation and does not add a server proxy path.

Unit tests use fake retrieval and provider implementations only. They prove the
contract and trust-boundary behavior; they do not claim general retrieval or
answer-quality performance.
