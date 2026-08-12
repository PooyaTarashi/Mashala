"""Load and validate deployable RAG artifacts without rebuilding the corpus."""

from __future__ import annotations

import copy
import hashlib
import json
import threading
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from types import MappingProxyType
from typing import Callable, Mapping, Protocol, cast

import faiss

from .artifact_contract import (
    ArtifactChunk,
    ArtifactManifest,
    ArtifactValidationError,
    EmbeddingMetadata,
    RetrievalArtifact,
    validate_artifact_manifest,
)


MANIFEST_FILENAME = "manifest.json"


class RetrievalIndex(Protocol):
    """The private index state used for startup validation and retrieval."""

    d: int
    ntotal: int
    is_trained: bool

    def search(self, vectors: object, top_k: int) -> tuple[object, object]: ...


IndexReader = Callable[[tuple[Path, ...]], RetrievalIndex]


class ArtifactLoadError(RuntimeError):
    """A safe, stable failure while loading a prebuilt artifact bundle."""

    def __init__(self, code: str, path: str, detail: str) -> None:
        self.code = code
        self.path = path
        self.detail = detail
        super().__init__(f"{code} at {path}: {detail}")


@dataclass(frozen=True, slots=True)
class LoadedRagArtifacts:
    """Validated runtime state retained for the service lifecycle."""

    manifest: ArtifactManifest
    index: RetrievalIndex
    artifact_paths: tuple[Path, ...]
    chunks: tuple[ArtifactChunk, ...]
    chunks_by_id: Mapping[str, ArtifactChunk]
    chunk_id_by_retrieval_id: Mapping[str, str]


class RagArtifactLoader:
    """Load a prebuilt bundle once and reuse the same validated runtime state."""

    def __init__(
        self,
        *,
        artifact_directory: Path,
        expected_embedding: EmbeddingMetadata,
        index_reader: IndexReader | None = None,
    ) -> None:
        self._artifact_directory = Path(artifact_directory)
        self._expected_embedding = copy.deepcopy(expected_embedding)
        self._index_reader = index_reader or _read_faiss_index
        self._loaded: LoadedRagArtifacts | None = None
        self._load_lock = threading.Lock()

    def load(self) -> LoadedRagArtifacts:
        """Return one cached state, loading and validating it on first use only."""

        loaded = self._loaded
        if loaded is not None:
            return loaded

        with self._load_lock:
            if self._loaded is None:
                self._loaded = _load_prebuilt_artifacts(
                    artifact_directory=self._artifact_directory,
                    expected_embedding=self._expected_embedding,
                    index_reader=self._index_reader,
                )
            return self._loaded


def _load_prebuilt_artifacts(
    *,
    artifact_directory: Path,
    expected_embedding: object,
    index_reader: IndexReader,
) -> LoadedRagArtifacts:
    root = _resolve_artifact_directory(artifact_directory)
    manifest_path = root / MANIFEST_FILENAME
    manifest_value = _read_manifest(manifest_path)

    try:
        manifest = validate_artifact_manifest(
            manifest_value,
            expected_embedding=expected_embedding,
        )
    except ArtifactValidationError as error:
        raise ArtifactLoadError(error.code, error.path, error.detail) from error

    artifact_paths = tuple(
        _validate_artifact_file(root, descriptor)
        for descriptor in manifest["retrievalIndex"]["artifacts"]
    )
    try:
        index = index_reader(artifact_paths)
    except ArtifactLoadError:
        raise
    except Exception as error:
        raise ArtifactLoadError(
            "unreadable_retrieval_index",
            "$.retrievalIndex.artifacts",
            "retrieval index could not be loaded",
        ) from error

    _validate_loaded_index(index, manifest)

    chunks = tuple(copy.deepcopy(manifest["corpus"]["chunks"]))
    chunks_by_id = MappingProxyType(
        {chunk["chunkId"]: chunk for chunk in chunks}
    )
    chunk_id_by_retrieval_id = MappingProxyType(
        {
            entry["retrievalId"]: entry["chunkId"]
            for entry in manifest["retrievalIndex"]["entries"]
        }
    )
    return LoadedRagArtifacts(
        manifest=manifest,
        index=index,
        artifact_paths=artifact_paths,
        chunks=chunks,
        chunks_by_id=chunks_by_id,
        chunk_id_by_retrieval_id=chunk_id_by_retrieval_id,
    )


def _resolve_artifact_directory(path: Path) -> Path:
    try:
        resolved = path.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise ArtifactLoadError(
            "artifact_directory_unavailable",
            "$",
            "artifact directory is unavailable",
        ) from error
    if not resolved.is_dir():
        raise ArtifactLoadError(
            "artifact_directory_unavailable",
            "$",
            "artifact path is not a directory",
        )
    return resolved


def _read_manifest(path: Path) -> object:
    try:
        content = path.read_bytes()
    except FileNotFoundError as error:
        raise ArtifactLoadError(
            "missing_artifact",
            MANIFEST_FILENAME,
            "artifact manifest is missing",
        ) from error
    except OSError as error:
        raise ArtifactLoadError(
            "unreadable_artifact",
            MANIFEST_FILENAME,
            "artifact manifest cannot be read",
        ) from error

    try:
        return json.loads(
            content.decode("utf-8"),
            object_pairs_hook=_object_without_duplicate_fields,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, _DuplicateFieldError) as error:
        raise ArtifactLoadError(
            "corrupt_manifest",
            MANIFEST_FILENAME,
            "artifact manifest is not valid unambiguous UTF-8 JSON",
        ) from error


class _DuplicateFieldError(ValueError):
    pass


def _object_without_duplicate_fields(
    pairs: list[tuple[str, object]],
) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateFieldError(key)
        result[key] = value
    return result


def _validate_artifact_file(root: Path, descriptor: RetrievalArtifact) -> Path:
    relative_path = descriptor["path"]
    candidate = root.joinpath(*PurePosixPath(relative_path).parts)
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError as error:
        raise ArtifactLoadError(
            "missing_artifact",
            relative_path,
            "declared retrieval-index artifact is missing",
        ) from error
    except (OSError, RuntimeError) as error:
        raise ArtifactLoadError(
            "unreadable_artifact",
            relative_path,
            "declared retrieval-index artifact is unavailable",
        ) from error

    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ArtifactLoadError(
            "artifact_path_escape",
            relative_path,
            "declared artifact resolves outside the artifact directory",
        ) from error

    digest = hashlib.sha256()
    size_bytes = 0
    try:
        with resolved.open("rb") as artifact_file:
            while block := artifact_file.read(1024 * 1024):
                size_bytes += len(block)
                digest.update(block)
    except OSError as error:
        raise ArtifactLoadError(
            "unreadable_artifact",
            relative_path,
            "declared retrieval-index artifact cannot be read",
        ) from error

    if size_bytes != descriptor["sizeBytes"]:
        raise ArtifactLoadError(
            "artifact_size_mismatch",
            relative_path,
            "retrieval-index artifact size does not match its descriptor",
        )
    if "sha256:" + digest.hexdigest() != descriptor["digest"]:
        raise ArtifactLoadError(
            "artifact_digest_mismatch",
            relative_path,
            "retrieval-index artifact digest does not match its descriptor",
        )
    return resolved


def _read_faiss_index(artifact_paths: tuple[Path, ...]) -> RetrievalIndex:
    if len(artifact_paths) != 1:
        raise ArtifactLoadError(
            "unsupported_retrieval_index_layout",
            "$.retrievalIndex.artifacts",
            "the current FAISS runtime requires exactly one opaque index artifact",
        )
    try:
        return cast(RetrievalIndex, faiss.read_index(str(artifact_paths[0])))
    except Exception as error:
        raise ArtifactLoadError(
            "unreadable_retrieval_index",
            artifact_paths[0].name,
            "FAISS could not deserialize the retrieval index",
        ) from error


def _validate_loaded_index(
    index: RetrievalIndex,
    manifest: ArtifactManifest,
) -> None:
    try:
        dimension = int(index.d)
        entry_count = int(index.ntotal)
        is_trained = bool(index.is_trained)
    except (AttributeError, TypeError, ValueError, OverflowError) as error:
        raise ArtifactLoadError(
            "unreadable_retrieval_index",
            "$.retrievalIndex",
            "loaded retrieval index does not expose readable index metadata",
        ) from error

    if not is_trained:
        raise ArtifactLoadError(
            "inconsistent_retrieval_index",
            "$.retrievalIndex",
            "loaded retrieval index is not ready for retrieval",
        )
    if dimension != manifest["embedding"]["dimension"]:
        raise ArtifactLoadError(
            "inconsistent_retrieval_index",
            "$.embedding.dimension",
            "loaded retrieval-index dimension does not match embedding metadata",
        )
    if entry_count != len(manifest["retrievalIndex"]["entries"]):
        raise ArtifactLoadError(
            "inconsistent_retrieval_index",
            "$.retrievalIndex.entries",
            "loaded retrieval-index entry count does not match metadata",
        )
