# RAG Artifact Contract

This document defines the Mashala-level JSON manifest produced by offline RAG
building. It is the stable boundary between a builder and a runtime that consumes
the built corpus. ADR-014 remains authoritative: building and runtime loading are
Python-container responsibilities, and the retrieval-index implementation is
private to that boundary.

ISSUE-041 defines the contract and its deterministic metadata validation only. It
does not define a manifest filename or bundle file count, build an index, load
artifact files, or perform retrieval.

## Format version

The first supported value is:

```text
artifactFormatVersion = "1.0"
```

The version is an opaque contract identifier, not a range to be guessed from.
Every consumer maintains an explicit set of supported values and rejects any
other value. A change to required fields, field meanings, validation invariants,
embedding compatibility, or retrieval-to-chunk mapping requires a new explicit
format version. Supporting another version requires an intentional validator and
loader change; consumers do not assume compatibility from a shared version
prefix.

## Manifest shape

The manifest is plain JSON data with this shape:

```json
{
  "artifactFormatVersion": "1.0",
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text:v1.5",
    "dimension": 768,
    "configuration": {
      "documentTaskPrefix": "search_document",
      "queryTaskPrefix": "search_query",
      "normalize": true
    }
  },
  "corpus": {
    "chunkCount": 1,
    "chunks": [
      {
        "chunkId": "chunk:account-help",
        "content": "Use the Accounts page to review an account.",
        "provenance": {
          "sourceId": "account-guide",
          "sourceUri": "docs/account-guide.md",
          "sourceTitle": "Account guide",
          "sourceDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "headingPath": ["Accounts", "Reviewing an account"],
          "startLine": 12,
          "endLine": 18,
          "metadata": {
            "locale": "en"
          }
        }
      }
    ]
  },
  "retrievalIndex": {
    "artifacts": [
      {
        "path": "retrieval/index.bin",
        "digest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "sizeBytes": 2048
      }
    ],
    "entries": [
      {
        "retrievalId": "0",
        "chunkId": "chunk:account-help"
      }
    ]
  }
}
```

The example embedding values describe the planned initial implementation but are
not constants imposed by this contract.

### `embedding`

- `provider` and `model` are non-empty, case-sensitive identities. A model tag or
  revision needed to reproduce compatible vectors belongs in `model`.
- `dimension` is the positive vector dimension.
- `configuration` is a required JSON object containing every additional setting
  that can affect document or query vector compatibility. It may be empty when
  provider, model, and dimension completely determine compatibility.

An artifact is embedding-compatible only when provider, model, dimension, and
the complete configuration JSON value match the runtime expectation. Object key
order is irrelevant; array order and JSON value types remain significant.

### `corpus`

- `chunkCount` must equal the number of `chunks`.
- Every chunk has a unique, stable, non-empty `chunkId` and non-empty `content`.
- Every chunk carries provenance with a stable `sourceId` and `sourceUri`.
- `sourceTitle`, a lowercase `sha256:` source digest, `headingPath`, inclusive
  one-based `startLine`/`endLine`, and arbitrary plain-JSON `metadata` are
  optional. Line bounds must be supplied together.

Provenance belongs to each chunk so a future retrieval result can retain the
exact source association without relying on retrieval-index internals.

### `retrievalIndex`

- `artifacts` is a non-empty array of opaque retrieval-index file descriptors.
  Each descriptor has a normalized relative POSIX `path`, a lowercase `sha256:`
  `digest`, and a non-negative `sizeBytes` value.
- The array may contain any number of descriptors. The contract does not assign
  a fixed manifest filename, directory layout, or total artifact-file count.
- `entries` maps each unique opaque string `retrievalId` to exactly one declared
  `chunkId`; every chunk must be mapped exactly once.

The path descriptors let a later Python loader find and integrity-check private
index data. Their contents and serialization are opaque. `retrievalId` is a
Mashala mapping identifier; its string representation does not expose or imply a
FAISS class, index type, label type, or serialization format.

## Deterministic validation

`rag/src/mashala_rag/artifact_contract.py` exports:

- `ARTIFACT_FORMAT_VERSION` and `SUPPORTED_ARTIFACT_FORMAT_VERSIONS`;
- plain-data `TypedDict` definitions for the manifest and its records;
- `validate_artifact_manifest`, which validates the complete manifest and
  returns an isolated plain-data copy;
- `validate_embedding_compatibility`, for an explicit compatibility check; and
- `ArtifactValidationError`, with stable `code`, `path`, and `detail` fields.

Validation rejects unsupported versions, missing or unknown fields, invalid JSON
metadata, invalid dimensions/counts/digests/paths, inconsistent provenance line
bounds, duplicate identities, incomplete mappings, and incompatible embedding
configuration. Validation checks descriptor metadata only; opening, hashing, or
deserializing the referenced files belongs to the later artifact-loading issue.

## FAISS and Node boundary

The manifest intentionally contains no FAISS class name, index type, constructor
option, or serialization instruction. The future Python loader owns those
details. The future Node retrieval client communicates through the narrow
retrieval-service contract and does not load or interpret retrieval-index files.
If Node-side tooling ever displays manifest information, it needs only the
Mashala concepts documented here: version, embeddings, chunks, provenance, and
opaque artifact references.
