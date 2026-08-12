# Mashala RAG container foundation

This directory is the complete Python build context for Mashala documentation
indexing and retrieval. Developers build and run it with Docker; Mashala does
not require host Python, pip, a virtual environment, or a host FAISS install.

```text
Node / Next.js
    |
    +-- future RAG boundary (not implemented by ISSUE-040)
            |
            +-- this container
                    +-- Python
                    +-- internal FAISS dependency
```

Build and run the foundation smoke command:

```bash
docker build --tag mashala-rag:issue-040 rag
docker run --rm --network none mashala-rag:issue-040
```

The image build itself imports FAISS and checks every installed distribution
against the expected pinned version. The runtime command repeats that check and
prints a small JSON health/version report. It needs no network access.

## Boundary

The container currently has no ports, transport, credentials, target-backend
client, LLM client, capability router, slot extractor, confirmation logic, or
workflow state. FAISS is imported only by the private Python implementation in
this build context. Node code receives no FAISS types, paths, or index-format
knowledge.

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

Run the dependency-free contract tests with Python 3.13 inside this build
context:

```bash
python -m unittest discover -s tests -p "test_*.py"
```

There is still no embedding execution, index construction, complete manifest
serialization, artifact loading, retrieval endpoint, CLI build command, or
Node-to-Python communication. Those belong to later focused issues.
