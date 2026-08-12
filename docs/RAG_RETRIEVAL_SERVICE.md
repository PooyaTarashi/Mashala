# RAG Retrieval Service

ISSUE-046 defines the narrow runtime boundary between a later Mashala Node
client and the private Python/FAISS retrieval implementation. The service
performs semantic retrieval only. It does not answer questions, invoke Gemini or
another conversational LLM, route capabilities, extract slots, run workflow or
confirmation logic, or accept target-backend operations or credentials.

## Lifecycle

The container entry point starts the persistent process with:

```text
serve \
  --artifact-directory /workspace/artifacts \
  --ollama-base-url http://host.docker.internal:11434
```

The image supplies `python -m mashala_rag` as its entry point, so `serve` is the
first container argument and developers do not need a host Python environment.
Startup constructs the fixed v0.1 local Ollama
`nomic-embed-text:v1.5` configuration, requires its complete vector-space
identity to match `manifest.json`, validates the artifact bundle, and
deserializes the FAISS index. Startup fails before listening when the artifact
or embedding configuration is incompatible.

One `RagArtifactLoader`, `LoadedRagArtifacts`, FAISS index, and query-embedding
client live for the process lifetime. Requests reuse that state. Runtime startup
does not load Markdown, embed corpus chunks, or rebuild an index.

The default listener is `0.0.0.0:8765`. `--host`, `--port`, and
`--ollama-timeout-seconds` configure transport behavior without changing the
embedding vector space.

## HTTP contract

The only operation is:

```http
POST /retrieve
Content-Type: application/json

{"query":"How do I review an account?","topK":5}
```

`query` is a required non-empty string of at most 16,000 characters. `topK` is
optional, defaults to `5`, and must be an integer from `1` through `100`.
Unknown request fields are rejected. If `topK` exceeds the loaded chunk count,
the service returns every available chunk.

A successful response is plain JSON:

```json
{
  "results": [
    {
      "chunkId": "chunk:account-help",
      "content": "Use the Accounts page to review an account.",
      "provenance": {
        "sourceId": "account-guide",
        "sourceUri": "docs/account-guide.md",
        "headingPath": ["Accounts"]
      },
      "score": 0.91
    }
  ]
}
```

Results are ordered by descending FAISS inner-product score. Because the v0.1
builder and query client L2-normalize vectors, this is cosine-compatible and a
higher score is more similar. The response contains no FAISS index, label,
array, or other native object.

## Query embedding

Each request makes one local Ollama `POST /api/embed` call using the exact model,
dimension, normalization, truncation behavior, and task-prefix configuration
recorded by the artifact. Query text is prefixed with `search_query: `; corpus
chunks were built with `search_document: `. Ollama model identity, vector count,
dimension, numeric values, and normalization are validated before search. There
is no cloud or conversational-LLM fallback.

## Failure shape

Every request failure is a JSON object:

```json
{"error":{"code":"invalid_top_k","detail":"topK must be an integer from 1 through 100"}}
```

- HTTP `400`: `invalid_request`, `invalid_query`, or `invalid_top_k`;
- HTTP `502`: a rejected/malformed/incompatible Ollama embedding result;
- HTTP `503`: local Ollama or the configured local model is unavailable;
- HTTP `500`: the loaded retrieval index cannot search or returns an invalid
  mapping/result.

Artifact and vector-space incompatibility are startup failures, so the process
does not accept queries in a vector space different from the built corpus.
