# Mashala RAG subsystem

This directory is the complete Python build context for Mashala documentation
indexing and retrieval. Developers invoke it through the Mashala CLI; Mashala
does not require host Python, pip, a virtual environment, or a host FAISS install.

```text
Node / Next.js
    |
    +-- private RAG boundary
            |
            +-- this container
                    +-- Python
                    +-- local Ollama embeddings
                    +-- internal FAISS dependency
```

The developer-facing build command is:

```bash
mashala rag build
```

The CLI builds the checked-in Docker context as
`mashala-rag-builder:0.1.0`, checks Docker and local Ollama
`nomic-embed-text:v1.5`, mounts documentation read-only, mounts the selected
host artifact directory writable, and streams build failures. It never pulls
the Ollama model implicitly.

## Boundary

The container has no ports, runtime retrieval transport, credentials,
target-backend client, conversational LLM client, capability router, slot
extractor, confirmation logic, or workflow state. FAISS is imported only by the
private Python implementation in this build context. Node code receives no
FAISS types, paths, or index-format knowledge.

ISSUE-041 adds the Mashala-owned artifact manifest and deterministic metadata
validation in `src/mashala_rag/artifact_contract.py`. The normative shape and
versioning rules are documented in `../docs/RAG_ARTIFACT_CONTRACT.md`.
Retrieval-index paths in the manifest are opaque and may contain any number of
files; Node receives no FAISS types or serialization knowledge.

ISSUE-042 adds deterministic Markdown loading and chunking in
`src/mashala_rag/markdown_ingestion.py`. Its smallest configuration is:

```python
ingest_markdown(
    root=Path("/developer-docs"),
    sources=("account-guide.md", "guides"),
    max_chunk_characters=1600,
)
```

`root` is the documentation boundary. Each source is a normalized relative
POSIX path below it and names either one `.md` file or a directory searched
recursively for `.md` files. Expanded files are processed in source-URI order.
Missing, unreadable, invalid-UTF-8, NUL-containing, empty, escaping, duplicate,
and empty-directory configurations fail explicitly.

Normalization converts line endings to LF, removes a UTF-8 BOM, applies Unicode
NFC, removes trailing spaces/tabs and trailing blank lines, and gives each
non-empty document one final LF. The normalized UTF-8 bytes determine the source
digest.

The v0.1 `markdown-blocks-v1` strategy never crosses ATX or setext heading
boundaries. Within a heading section it greedily packs blank-line-delimited
blocks to the configured character target. Fenced code stays intact; any single
oversized block remains one chunk. Chunk content is not semantically rewritten.
Each chunk carries normalized-source line bounds, source ID/URI/digest, the
document's first level-one title and current heading path when available. Source
IDs hash the source URI. Chunk IDs hash the strategy version, normalized source
identity/digest, chunk order/content/location/heading path, and character target.

ISSUE-043 adds `ollama_embeddings.py` and `index_builder.py`. The embedding
client calls only local Ollama `POST /api/embed`, defaults to the versioned
`nomic-embed-text:v1.5` identity, batches document inputs with the
`search_document: ` prefix, disables silent truncation, and validates every
returned finite vector against the configured dimension. It records the future
`search_query` prefix and all vector-compatibility settings in manifest 1.0.
No API key or cloud fallback exists.

The builder L2-normalizes embeddings and stores them in an exact FAISS
`IndexFlatIP`. This is the smallest cosine-similarity-compatible choice for the
thesis-sized corpus: it requires no training, quantizer, graph, or approximate
search configuration. Sequential FAISS positions map to opaque Mashala
`retrievalId` strings only inside the Python boundary.

The internal Python API produces this deployable bundle:

```text
<output>/
    manifest.json
    retrieval/
        index.bin
```

`manifest.json` is canonical UTF-8 JSON validated against the ISSUE-041
contract. `retrieval/index.bin` is an opaque checksummed artifact; its FAISS
serialization is not described to Node. `build_rag_artifacts` accepts an
`OllamaEmbeddingClient` and normalized chunks. ISSUE-044's container entrypoint
composes Markdown discovery/ingestion with that existing builder. The Node CLI
supplies container-to-host Ollama routing and reports the host output path plus
manifest document/chunk/version summary.

Run the full Python test suite with the locked dependencies inside this build
context (the Docker build runs the same command):

```bash
python -m unittest discover -s tests -p "test_*.py"
```

There is still no artifact loader, retrieval endpoint/service, runtime query
execution, or Node retrieval client. Those belong to later focused issues.
