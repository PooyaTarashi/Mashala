"""Persistent semantic retrieval over validated prebuilt RAG artifacts."""

from __future__ import annotations

import copy
import math
from typing import Protocol, TypedDict

import numpy as np

from .artifact_contract import (
    ChunkProvenance,
    EmbeddingMetadata,
    ArtifactValidationError,
    validate_embedding_compatibility,
)
from .artifact_loader import RagArtifactLoader
from .ollama_embeddings import EmbeddingBatch


DEFAULT_TOP_K = 5
MAX_TOP_K = 100
MAX_QUERY_CHARACTERS = 16_000


class QueryEmbedder(Protocol):
    """The only external operation required by semantic retrieval."""

    def metadata(self) -> EmbeddingMetadata: ...

    def embed_query(self, query: str) -> EmbeddingBatch: ...


class RetrievalResult(TypedDict):
    chunkId: str
    content: str
    provenance: ChunkProvenance
    score: float


class RetrievalResponse(TypedDict):
    results: list[RetrievalResult]


class RetrievalServiceError(RuntimeError):
    """A stable, sanitized request or index-search failure."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class RagRetrievalService:
    """Load one artifact state at startup and reuse it for every query."""

    def __init__(
        self,
        *,
        loader: RagArtifactLoader,
        query_embedder: QueryEmbedder,
    ) -> None:
        self._artifacts = loader.load()
        self._query_embedder = query_embedder
        _require_compatible_embedding(
            self._artifacts.manifest["embedding"],
            self._query_embedder.metadata(),
        )

    def retrieve(
        self,
        *,
        query: object,
        top_k: object = DEFAULT_TOP_K,
    ) -> RetrievalResponse:
        """Embed one query and return plain Mashala chunks ordered by score."""

        validated_query = _validate_query(query)
        validated_top_k = _validate_top_k(top_k)

        batch = self._query_embedder.embed_query(validated_query)
        _require_compatible_embedding(
            self._artifacts.manifest["embedding"],
            batch.metadata,
            response=True,
        )
        vector = _validated_query_vector(
            batch,
            expected_dimension=self._artifacts.manifest["embedding"]["dimension"],
        )
        result_count = min(validated_top_k, len(self._artifacts.chunks))
        if result_count == 0:
            return {"results": []}

        try:
            distances, identifiers = self._artifacts.index.search(
                np.ascontiguousarray([vector], dtype=np.float32),
                result_count,
            )
        except Exception as error:
            raise RetrievalServiceError(
                "retrieval_failed",
                "the retrieval index could not execute the query",
            ) from error

        return {
            "results": _map_results(
                distances=distances,
                identifiers=identifiers,
                result_count=result_count,
                chunks_by_id=self._artifacts.chunks_by_id,
                chunk_id_by_retrieval_id=(
                    self._artifacts.chunk_id_by_retrieval_id
                ),
            )
        }


def _validate_query(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RetrievalServiceError(
            "invalid_query",
            "query must be a non-empty string",
        )
    if len(value) > MAX_QUERY_CHARACTERS:
        raise RetrievalServiceError(
            "invalid_query",
            f"query must not exceed {MAX_QUERY_CHARACTERS} characters",
        )
    return value


def _validate_top_k(value: object) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value <= 0
        or value > MAX_TOP_K
    ):
        raise RetrievalServiceError(
            "invalid_top_k",
            f"topK must be an integer from 1 through {MAX_TOP_K}",
        )
    return value


def _require_compatible_embedding(
    artifact_embedding: EmbeddingMetadata,
    runtime_embedding: object,
    *,
    response: bool = False,
) -> None:
    try:
        validate_embedding_compatibility(
            artifact_embedding,
            runtime_embedding,
        )
    except ArtifactValidationError as error:
        code = (
            "incompatible_embedding_response"
            if response
            else "incompatible_embedding_configuration"
        )
        raise RetrievalServiceError(
            code,
            "query embedding identity does not match the loaded artifact",
        ) from error


def _validated_query_vector(
    batch: EmbeddingBatch,
    *,
    expected_dimension: int,
) -> tuple[float, ...]:
    if len(batch.vectors) != 1:
        raise RetrievalServiceError(
            "incompatible_embedding_response",
            "query embedding must contain exactly one vector",
        )
    vector = batch.vectors[0]
    if len(vector) != expected_dimension or any(
        isinstance(component, bool)
        or not isinstance(component, (int, float))
        or not math.isfinite(component)
        for component in vector
    ):
        raise RetrievalServiceError(
            "incompatible_embedding_response",
            "query embedding has an incompatible vector shape",
        )
    return tuple(float(component) for component in vector)


def _map_results(
    *,
    distances: object,
    identifiers: object,
    result_count: int,
    chunks_by_id: object,
    chunk_id_by_retrieval_id: object,
) -> list[RetrievalResult]:
    try:
        distance_rows = np.asarray(distances)
        identifier_rows = np.asarray(identifiers)
        if distance_rows.shape != (1, result_count) or identifier_rows.shape != (
            1,
            result_count,
        ):
            raise ValueError("unexpected search result shape")

        results: list[RetrievalResult] = []
        for result_index in range(result_count):
            score = float(distance_rows[0, result_index])
            identifier_value = identifier_rows[0, result_index].item()
            if (
                isinstance(identifier_value, bool)
                or not isinstance(identifier_value, int)
                or identifier_value < 0
                or not math.isfinite(score)
            ):
                raise ValueError("invalid search result")
            chunk_id = chunk_id_by_retrieval_id[str(identifier_value)]
            chunk = chunks_by_id[chunk_id]
            results.append(
                {
                    "chunkId": chunk["chunkId"],
                    "content": chunk["content"],
                    "provenance": copy.deepcopy(chunk["provenance"]),
                    "score": score,
                }
            )
        return results
    except (AttributeError, KeyError, TypeError, ValueError, OverflowError) as error:
        raise RetrievalServiceError(
            "retrieval_failed",
            "the retrieval index returned an invalid result",
        ) from error
