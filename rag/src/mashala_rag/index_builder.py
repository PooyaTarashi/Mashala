"""Offline FAISS construction and ISSUE-041 artifact serialization."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Protocol, Sequence

import faiss
import numpy as np

from .artifact_contract import (
    ARTIFACT_FORMAT_VERSION,
    ArtifactChunk,
    ArtifactManifest,
    EmbeddingMetadata,
    validate_artifact_manifest,
)
from .ollama_embeddings import EmbeddingBatch


BUILDER_VERSION = "ollama-faiss-flat-ip-v1"
MANIFEST_FILENAME = "manifest.json"
INDEX_ARTIFACT_PATH = "retrieval/index.bin"


class ArtifactBuildError(RuntimeError):
    """A stable failure while constructing or writing deployable artifacts."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class DocumentEmbedder(Protocol):
    def embed_documents(self, documents: list[str]) -> EmbeddingBatch: ...


@dataclass(frozen=True, slots=True)
class ArtifactBuildResult:
    manifest: ArtifactManifest
    manifest_path: Path
    index_path: Path
    builder_version: str = BUILDER_VERSION


def build_faiss_index(vectors: Sequence[Sequence[float]]) -> faiss.Index:
    """Build an exact inner-product index over consistently shaped vectors."""

    if not vectors:
        _fail("empty_corpus", "at least one embedding is required")
    try:
        matrix = np.asarray(vectors, dtype=np.float32)
    except (TypeError, ValueError, OverflowError) as error:
        raise ArtifactBuildError(
            "invalid_embedding_matrix",
            "embeddings cannot be represented as a float32 matrix",
        ) from error
    if matrix.ndim != 2 or matrix.shape[0] != len(vectors) or matrix.shape[1] <= 0:
        _fail(
            "invalid_embedding_matrix",
            "embeddings must form one non-empty rectangular matrix",
        )
    if not np.isfinite(matrix).all():
        _fail("invalid_embedding_matrix", "embeddings must contain only finite values")

    try:
        index = faiss.IndexFlatIP(int(matrix.shape[1]))
        index.add(np.ascontiguousarray(matrix, dtype=np.float32))
    except Exception as error:
        raise ArtifactBuildError(
            "index_construction_failed",
            "FAISS could not construct the exact retrieval index",
        ) from error
    if int(index.ntotal) != int(matrix.shape[0]) or int(index.d) != int(
        matrix.shape[1]
    ):
        _fail(
            "index_construction_failed",
            "FAISS index shape does not match the embedding matrix",
        )
    return index


def build_rag_artifacts(
    *,
    chunks: Sequence[ArtifactChunk],
    output_directory: Path,
    embedder: DocumentEmbedder,
) -> ArtifactBuildResult:
    """Embed chunks, build FAISS, and write one deployable artifact bundle."""

    isolated_chunks = copy.deepcopy(list(chunks))
    if not isolated_chunks:
        _fail("empty_corpus", "at least one normalized chunk is required")

    batch = embedder.embed_documents([chunk["content"] for chunk in isolated_chunks])
    if len(batch.vectors) != len(isolated_chunks):
        _fail(
            "inconsistent_embedding_count",
            "the embedder did not return exactly one vector per chunk",
        )
    index = build_faiss_index(batch.vectors)
    return serialize_rag_artifacts(
        chunks=isolated_chunks,
        embedding=batch.metadata,
        index=index,
        output_directory=output_directory,
    )


def serialize_rag_artifacts(
    *,
    chunks: Sequence[ArtifactChunk],
    embedding: EmbeddingMetadata,
    index: faiss.Index,
    output_directory: Path,
) -> ArtifactBuildResult:
    """Serialize a private FAISS index and the public versioned JSON manifest."""

    isolated_chunks = copy.deepcopy(list(chunks))
    if int(index.ntotal) != len(isolated_chunks):
        _fail(
            "index_serialization_failed",
            "FAISS index entry count does not match the chunk count",
        )
    if int(index.d) != embedding.get("dimension"):
        _fail(
            "index_serialization_failed",
            "FAISS index dimension does not match embedding metadata",
        )

    try:
        serialized_index = faiss.serialize_index(index)
        index_bytes = bytes(serialized_index)
    except Exception as error:
        raise ArtifactBuildError(
            "index_serialization_failed",
            "FAISS could not serialize the retrieval index",
        ) from error
    if not index_bytes:
        _fail("index_serialization_failed", "FAISS produced an empty index artifact")

    entries = [
        {"retrievalId": str(index), "chunkId": chunk["chunkId"]}
        for index, chunk in enumerate(isolated_chunks)
    ]
    manifest_value: object = {
        "artifactFormatVersion": ARTIFACT_FORMAT_VERSION,
        "embedding": copy.deepcopy(embedding),
        "corpus": {
            "chunkCount": len(isolated_chunks),
            "chunks": isolated_chunks,
        },
        "retrievalIndex": {
            "artifacts": [
                {
                    "path": INDEX_ARTIFACT_PATH,
                    "digest": "sha256:" + hashlib.sha256(index_bytes).hexdigest(),
                    "sizeBytes": len(index_bytes),
                }
            ],
            "entries": entries,
        },
    }
    try:
        manifest = validate_artifact_manifest(
            manifest_value,
            expected_embedding=embedding,
        )
        manifest_bytes = (
            json.dumps(
                manifest,
                allow_nan=False,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n"
        ).encode("utf-8")
    except Exception as error:
        raise ArtifactBuildError(
            "artifact_serialization_failed",
            "Mashala artifact metadata could not be validated and serialized",
        ) from error

    output_path = Path(output_directory)
    index_path = output_path.joinpath(*PurePosixPath(INDEX_ARTIFACT_PATH).parts)
    manifest_path = output_path / MANIFEST_FILENAME
    _write_artifact(index_path, index_bytes)
    _write_artifact(manifest_path, manifest_bytes)
    return ArtifactBuildResult(
        manifest=manifest,
        manifest_path=manifest_path,
        index_path=index_path,
    )


def _write_artifact(path: Path, content: bytes) -> None:
    temporary_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path.write_bytes(content)
        os.replace(temporary_path, path)
    except OSError as error:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise ArtifactBuildError(
            "artifact_write_failed",
            f"cannot write artifact {path}",
        ) from error


def _fail(code: str, detail: str) -> None:
    raise ArtifactBuildError(code, detail)
