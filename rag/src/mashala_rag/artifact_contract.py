"""Mashala-owned, JSON-serializable RAG artifact manifest contract.

The contract deliberately describes chunks, provenance, embedding compatibility,
and opaque retrieval-index files without exposing the index implementation.
"""

from __future__ import annotations

import copy
import json
import math
import re
from pathlib import PurePosixPath
from typing import Any, NotRequired, TypeAlias, TypedDict, cast


ARTIFACT_FORMAT_VERSION = "1.0"
SUPPORTED_ARTIFACT_FORMAT_VERSIONS = frozenset({ARTIFACT_FORMAT_VERSION})

_DIGEST_PATTERN = re.compile(r"sha256:[0-9a-f]{64}\Z")

JsonScalar: TypeAlias = None | bool | int | float | str
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]


class EmbeddingMetadata(TypedDict):
    provider: str
    model: str
    dimension: int
    configuration: dict[str, JsonValue]


class ChunkProvenance(TypedDict):
    sourceId: str
    sourceUri: str
    sourceTitle: NotRequired[str]
    sourceDigest: NotRequired[str]
    headingPath: NotRequired[list[str]]
    startLine: NotRequired[int]
    endLine: NotRequired[int]
    metadata: NotRequired[dict[str, JsonValue]]


class ArtifactChunk(TypedDict):
    chunkId: str
    content: str
    provenance: ChunkProvenance


class CorpusMetadata(TypedDict):
    chunkCount: int
    chunks: list[ArtifactChunk]


class RetrievalArtifact(TypedDict):
    path: str
    digest: str
    sizeBytes: int


class RetrievalEntry(TypedDict):
    retrievalId: str
    chunkId: str


class RetrievalIndexMetadata(TypedDict):
    artifacts: list[RetrievalArtifact]
    entries: list[RetrievalEntry]


class ArtifactManifest(TypedDict):
    artifactFormatVersion: str
    embedding: EmbeddingMetadata
    corpus: CorpusMetadata
    retrievalIndex: RetrievalIndexMetadata


class ArtifactValidationError(ValueError):
    """A deterministic artifact-contract validation failure."""

    def __init__(self, code: str, path: str, detail: str) -> None:
        self.code = code
        self.path = path
        self.detail = detail
        super().__init__(f"{code} at {path}: {detail}")


def validate_artifact_manifest(
    manifest: object,
    *,
    expected_embedding: object | None = None,
) -> ArtifactManifest:
    """Validate and return an isolated plain-data copy of a RAG manifest.

    ``expected_embedding`` uses the same shape as the manifest's ``embedding``
    object. Compatibility is exact across provider, model, dimension, and the
    recursively compared JSON configuration.
    """

    root = _expect_object(manifest, "$")
    _expect_fields(
        root,
        "$",
        required={
            "artifactFormatVersion",
            "embedding",
            "corpus",
            "retrievalIndex",
        },
    )

    version = _expect_non_empty_string(
        root["artifactFormatVersion"], "$.artifactFormatVersion"
    )
    if version not in SUPPORTED_ARTIFACT_FORMAT_VERSIONS:
        _fail(
            "unsupported_artifact_format_version",
            "$.artifactFormatVersion",
            f"unsupported version {version!r}",
        )

    embedding = _validate_embedding(root["embedding"], "$.embedding")
    _validate_corpus(root["corpus"], "$.corpus")
    _validate_retrieval_index(root["retrievalIndex"], root["corpus"])

    if expected_embedding is not None:
        validate_embedding_compatibility(embedding, expected_embedding)

    return cast(ArtifactManifest, copy.deepcopy(root))


def validate_embedding_compatibility(
    artifact_embedding: object,
    expected_embedding: object,
) -> None:
    """Reject an artifact whose complete embedding identity is incompatible."""

    actual = _validate_embedding(artifact_embedding, "$.embedding")
    expected = _validate_embedding(expected_embedding, "$expectedEmbedding")
    for field in ("provider", "model", "dimension", "configuration"):
        if not _json_values_equal(actual[field], expected[field]):
            _fail(
                "incompatible_embedding_configuration",
                f"$.embedding.{field}",
                f"artifact value does not match expected {field}",
            )


def _validate_embedding(value: object, path: str) -> EmbeddingMetadata:
    embedding = _expect_object(value, path)
    _expect_fields(
        embedding,
        path,
        required={"provider", "model", "dimension", "configuration"},
    )
    _expect_non_empty_string(embedding["provider"], f"{path}.provider")
    _expect_non_empty_string(embedding["model"], f"{path}.model")
    _expect_positive_integer(embedding["dimension"], f"{path}.dimension")
    configuration = _expect_object(embedding["configuration"], f"{path}.configuration")
    _validate_json_value(configuration, f"{path}.configuration")
    return cast(EmbeddingMetadata, embedding)


def _validate_corpus(value: object, path: str) -> None:
    corpus = _expect_object(value, path)
    _expect_fields(corpus, path, required={"chunkCount", "chunks"})
    chunk_count = _expect_non_negative_integer(
        corpus["chunkCount"], f"{path}.chunkCount"
    )
    chunks = _expect_array(corpus["chunks"], f"{path}.chunks")
    if chunk_count != len(chunks):
        _fail(
            "malformed_artifact_metadata",
            f"{path}.chunkCount",
            "chunkCount does not match chunks length",
        )

    chunk_ids: set[str] = set()
    for index, value in enumerate(chunks):
        chunk_path = f"{path}.chunks[{index}]"
        chunk = _expect_object(value, chunk_path)
        _expect_fields(
            chunk,
            chunk_path,
            required={"chunkId", "content", "provenance"},
        )
        chunk_id = _expect_non_empty_string(
            chunk["chunkId"], f"{chunk_path}.chunkId"
        )
        if chunk_id in chunk_ids:
            _fail(
                "malformed_artifact_metadata",
                f"{chunk_path}.chunkId",
                "duplicate chunkId",
            )
        chunk_ids.add(chunk_id)
        _expect_non_empty_string(chunk["content"], f"{chunk_path}.content")
        _validate_provenance(chunk["provenance"], f"{chunk_path}.provenance")


def _validate_provenance(value: object, path: str) -> None:
    provenance = _expect_object(value, path)
    _expect_fields(
        provenance,
        path,
        required={"sourceId", "sourceUri"},
        optional={
            "sourceTitle",
            "sourceDigest",
            "headingPath",
            "startLine",
            "endLine",
            "metadata",
        },
    )
    _expect_non_empty_string(provenance["sourceId"], f"{path}.sourceId")
    _expect_non_empty_string(provenance["sourceUri"], f"{path}.sourceUri")

    if "sourceTitle" in provenance:
        _expect_non_empty_string(provenance["sourceTitle"], f"{path}.sourceTitle")
    if "sourceDigest" in provenance:
        _expect_digest(provenance["sourceDigest"], f"{path}.sourceDigest")
    if "headingPath" in provenance:
        headings = _expect_array(provenance["headingPath"], f"{path}.headingPath")
        for index, heading in enumerate(headings):
            _expect_non_empty_string(heading, f"{path}.headingPath[{index}]")

    has_start = "startLine" in provenance
    has_end = "endLine" in provenance
    if has_start != has_end:
        _fail(
            "missing_required_metadata",
            path,
            "startLine and endLine must be provided together",
        )
    if has_start:
        start = _expect_positive_integer(provenance["startLine"], f"{path}.startLine")
        end = _expect_positive_integer(provenance["endLine"], f"{path}.endLine")
        if start > end:
            _fail(
                "malformed_artifact_metadata",
                f"{path}.startLine",
                "startLine must not exceed endLine",
            )
    if "metadata" in provenance:
        metadata = _expect_object(provenance["metadata"], f"{path}.metadata")
        _validate_json_value(metadata, f"{path}.metadata")


def _validate_retrieval_index(value: object, corpus_value: object) -> None:
    path = "$.retrievalIndex"
    retrieval_index = _expect_object(value, path)
    _expect_fields(retrieval_index, path, required={"artifacts", "entries"})

    artifacts = _expect_array(retrieval_index["artifacts"], f"{path}.artifacts")
    if not artifacts:
        _fail(
            "missing_required_metadata",
            f"{path}.artifacts",
            "at least one opaque retrieval-index artifact is required",
        )
    artifact_paths: set[str] = set()
    for index, value in enumerate(artifacts):
        artifact_path = f"{path}.artifacts[{index}]"
        artifact = _expect_object(value, artifact_path)
        _expect_fields(
            artifact,
            artifact_path,
            required={"path", "digest", "sizeBytes"},
        )
        relative_path = _expect_artifact_path(
            artifact["path"], f"{artifact_path}.path"
        )
        if relative_path in artifact_paths:
            _fail(
                "malformed_artifact_metadata",
                f"{artifact_path}.path",
                "duplicate artifact path",
            )
        artifact_paths.add(relative_path)
        _expect_digest(artifact["digest"], f"{artifact_path}.digest")
        _expect_non_negative_integer(
            artifact["sizeBytes"], f"{artifact_path}.sizeBytes"
        )

    corpus = _expect_object(corpus_value, "$.corpus")
    chunks = _expect_array(corpus["chunks"], "$.corpus.chunks")
    known_chunk_ids = {
        _expect_object(chunk, f"$.corpus.chunks[{index}]")["chunkId"]
        for index, chunk in enumerate(chunks)
    }
    entries = _expect_array(retrieval_index["entries"], f"{path}.entries")
    if len(entries) != len(known_chunk_ids):
        _fail(
            "malformed_artifact_metadata",
            f"{path}.entries",
            "entries must map every chunk exactly once",
        )

    retrieval_ids: set[str] = set()
    mapped_chunk_ids: set[str] = set()
    for index, value in enumerate(entries):
        entry_path = f"{path}.entries[{index}]"
        entry = _expect_object(value, entry_path)
        _expect_fields(entry, entry_path, required={"retrievalId", "chunkId"})
        retrieval_id = _expect_non_empty_string(
            entry["retrievalId"], f"{entry_path}.retrievalId"
        )
        chunk_id = _expect_non_empty_string(entry["chunkId"], f"{entry_path}.chunkId")
        if retrieval_id in retrieval_ids:
            _fail(
                "malformed_artifact_metadata",
                f"{entry_path}.retrievalId",
                "duplicate retrievalId",
            )
        if chunk_id not in known_chunk_ids:
            _fail(
                "malformed_artifact_metadata",
                f"{entry_path}.chunkId",
                "chunkId does not identify a declared chunk",
            )
        if chunk_id in mapped_chunk_ids:
            _fail(
                "malformed_artifact_metadata",
                f"{entry_path}.chunkId",
                "chunkId is mapped more than once",
            )
        retrieval_ids.add(retrieval_id)
        mapped_chunk_ids.add(chunk_id)


def _expect_object(value: object, path: str) -> dict[str, Any]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        _fail("malformed_artifact_metadata", path, "expected an object with string keys")
    return value


def _expect_array(value: object, path: str) -> list[Any]:
    if not isinstance(value, list):
        _fail("malformed_artifact_metadata", path, "expected an array")
    return value


def _expect_fields(
    value: dict[str, Any],
    path: str,
    *,
    required: set[str],
    optional: set[str] | None = None,
) -> None:
    optional = optional or set()
    missing = sorted(required - value.keys())
    if missing:
        _fail(
            "missing_required_metadata",
            path,
            f"missing required field {missing[0]!r}",
        )
    unknown = sorted(value.keys() - required - optional)
    if unknown:
        _fail(
            "malformed_artifact_metadata",
            path,
            f"unknown field {unknown[0]!r}",
        )


def _expect_non_empty_string(value: object, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("malformed_artifact_metadata", path, "expected a non-empty string")
    return value


def _expect_non_negative_integer(value: object, path: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        _fail("malformed_artifact_metadata", path, "expected a non-negative integer")
    return value


def _expect_positive_integer(value: object, path: str) -> int:
    result = _expect_non_negative_integer(value, path)
    if result == 0:
        _fail("malformed_artifact_metadata", path, "expected a positive integer")
    return result


def _expect_digest(value: object, path: str) -> str:
    digest = _expect_non_empty_string(value, path)
    if not _DIGEST_PATTERN.fullmatch(digest):
        _fail(
            "malformed_artifact_metadata",
            path,
            "expected a lowercase sha256 digest",
        )
    return digest


def _expect_artifact_path(value: object, path: str) -> str:
    artifact_path = _expect_non_empty_string(value, path)
    parsed = PurePosixPath(artifact_path)
    if (
        "\\" in artifact_path
        or parsed.is_absolute()
        or artifact_path != parsed.as_posix()
        or any(part in {"", ".", ".."} for part in parsed.parts)
    ):
        _fail(
            "malformed_artifact_metadata",
            path,
            "expected a normalized relative POSIX path",
        )
    return artifact_path


def _validate_json_value(value: object, path: str) -> None:
    if value is None or isinstance(value, (str, bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            _fail("malformed_artifact_metadata", path, "JSON numbers must be finite")
        return
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                _fail("malformed_artifact_metadata", path, "JSON object keys must be strings")
            _validate_json_value(child, f"{path}.{key}")
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            _validate_json_value(child, f"{path}[{index}]")
        return
    _fail("malformed_artifact_metadata", path, "expected plain JSON data")


def _json_values_equal(left: object, right: object) -> bool:
    return json.dumps(
        left,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ) == json.dumps(
        right,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _fail(code: str, path: str, detail: str) -> None:
    raise ArtifactValidationError(code, path, detail)
