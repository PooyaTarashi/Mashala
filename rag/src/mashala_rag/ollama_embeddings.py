"""Local Ollama embedding integration for the private RAG subsystem."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Callable, TypeAlias
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from .artifact_contract import EmbeddingMetadata


DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_EMBEDDING_MODEL = "nomic-embed-text:v1.5"
DEFAULT_EMBEDDING_DIMENSION = 768
DOCUMENT_TASK_PREFIX = "search_document"
QUERY_TASK_PREFIX = "search_query"

JsonTransport: TypeAlias = Callable[[str, dict[str, object], float], object]


class OllamaEmbeddingError(RuntimeError):
    """A stable, sanitized failure at the local embedding boundary."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


@dataclass(frozen=True, slots=True)
class OllamaEmbeddingConfig:
    """Settings for compatible document and future query embeddings."""

    base_url: str = DEFAULT_OLLAMA_BASE_URL
    model: str = DEFAULT_EMBEDDING_MODEL
    expected_dimension: int = DEFAULT_EMBEDDING_DIMENSION
    document_task_prefix: str = DOCUMENT_TASK_PREFIX
    query_task_prefix: str = QUERY_TASK_PREFIX
    normalize: bool = True
    truncate: bool = False
    timeout_seconds: float = 60.0

    def __post_init__(self) -> None:
        if not isinstance(self.base_url, str):
            _fail(
                "invalid_embedding_configuration",
                "base_url must be an HTTP(S) Ollama origin",
            )
        parsed = urlsplit(self.base_url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            _fail(
                "invalid_embedding_configuration",
                "base_url must be an HTTP(S) Ollama origin without credentials, "
                "path, query, or fragment",
            )
        if not isinstance(self.model, str) or (
            self.model != "nomic-embed-text"
            and not self.model.startswith("nomic-embed-text:")
        ):
            _fail(
                "invalid_embedding_configuration",
                "model must identify Ollama nomic-embed-text",
            )
        if (
            isinstance(self.expected_dimension, bool)
            or not isinstance(self.expected_dimension, int)
            or self.expected_dimension <= 0
        ):
            _fail(
                "invalid_embedding_configuration",
                "expected_dimension must be a positive integer",
            )
        if (
            self.document_task_prefix != DOCUMENT_TASK_PREFIX
            or self.query_task_prefix != QUERY_TASK_PREFIX
        ):
            _fail(
                "invalid_embedding_configuration",
                "nomic-embed-text requires the supported search_document and "
                "search_query task prefixes",
            )
        if self.normalize is not True or self.truncate is not False:
            _fail(
                "invalid_embedding_configuration",
                "v0.1 requires L2 normalization and rejects silent truncation",
            )
        if (
            isinstance(self.timeout_seconds, bool)
            or not isinstance(self.timeout_seconds, (int, float))
            or not math.isfinite(self.timeout_seconds)
            or self.timeout_seconds <= 0
        ):
            _fail(
                "invalid_embedding_configuration",
                "timeout_seconds must be a positive finite number",
            )

    def metadata(self) -> EmbeddingMetadata:
        """Return the ISSUE-041 compatibility identity for produced vectors."""

        return {
            "provider": "ollama",
            "model": self.model,
            "dimension": self.expected_dimension,
            "configuration": {
                "documentTaskPrefix": self.document_task_prefix,
                "queryTaskPrefix": self.query_task_prefix,
                "normalize": self.normalize,
                "truncate": self.truncate,
            },
        }


@dataclass(frozen=True, slots=True)
class EmbeddingBatch:
    vectors: tuple[tuple[float, ...], ...]
    metadata: EmbeddingMetadata


class OllamaEmbeddingClient:
    """Embed documents through Ollama's batch ``POST /api/embed`` endpoint."""

    def __init__(
        self,
        config: OllamaEmbeddingConfig | None = None,
        *,
        transport: JsonTransport | None = None,
    ) -> None:
        self.config = config or OllamaEmbeddingConfig()
        self._transport = transport or _post_json

    def embed_documents(self, documents: list[str]) -> EmbeddingBatch:
        if not isinstance(documents, list) or not documents:
            _fail("invalid_embedding_input", "expected at least one document")
        normalized_documents: list[str] = []
        for index, document in enumerate(documents):
            if not isinstance(document, str) or not document.strip():
                _fail(
                    "invalid_embedding_input",
                    f"document {index} must be a non-empty string",
                )
            normalized_documents.append(
                f"{self.config.document_task_prefix}: {document}"
            )

        endpoint = self.config.base_url.rstrip("/") + "/api/embed"
        payload: dict[str, object] = {
            "model": self.config.model,
            "input": normalized_documents,
            "truncate": self.config.truncate,
        }
        try:
            response = self._transport(
                endpoint,
                payload,
                float(self.config.timeout_seconds),
            )
        except OllamaEmbeddingError:
            raise
        except (OSError, TimeoutError, URLError) as error:
            raise OllamaEmbeddingError(
                "ollama_unavailable",
                f"cannot reach local Ollama at {self.config.base_url}",
            ) from error
        except Exception as error:
            raise OllamaEmbeddingError(
                "ollama_request_failed",
                "local Ollama embedding request failed",
            ) from error

        vectors = _normalize_response(
            response,
            requested_model=self.config.model,
            expected_count=len(normalized_documents),
            expected_dimension=self.config.expected_dimension,
            normalize=self.config.normalize,
        )
        return EmbeddingBatch(vectors=vectors, metadata=self.config.metadata())


def _post_json(url: str, payload: dict[str, object], timeout_seconds: float) -> object:
    body = json.dumps(
        payload,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read()
    except HTTPError as error:
        detail = _ollama_error_detail(error)
        if "model" in detail.lower() and "not found" in detail.lower():
            raise OllamaEmbeddingError(
                "embedding_model_unavailable",
                "local Ollama does not have the configured nomic-embed-text "
                "model; pull it before building",
            ) from error
        raise OllamaEmbeddingError(
            "ollama_request_failed",
            "local Ollama rejected the embedding request with HTTP "
            f"{error.code}: {detail}",
        ) from error
    except (OSError, TimeoutError, URLError) as error:
        raise OllamaEmbeddingError(
            "ollama_unavailable",
            f"cannot reach local Ollama at {urlsplit(url).scheme}://{urlsplit(url).netloc}",
        ) from error

    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OllamaEmbeddingError(
            "malformed_embedding_response",
            "local Ollama returned a non-JSON embedding response",
        ) from error


def _ollama_error_detail(error: HTTPError) -> str:
    try:
        raw = error.read().decode("utf-8")
        value = json.loads(raw)
        if isinstance(value, dict) and isinstance(value.get("error"), str):
            detail = value["error"].strip()
            if detail:
                return detail
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        pass
    return "request rejected"


def _normalize_response(
    response: object,
    *,
    requested_model: str,
    expected_count: int,
    expected_dimension: int,
    normalize: bool,
) -> tuple[tuple[float, ...], ...]:
    if not isinstance(response, dict):
        _fail("malformed_embedding_response", "expected a JSON object")
    response_model = response.get("model")
    if not isinstance(response_model, str) or not response_model.strip():
        _fail(
            "malformed_embedding_response",
            "response.model must be a non-empty string",
        )
    if response_model != requested_model:
        _fail(
            "malformed_embedding_response",
            "response.model does not match the requested model identity",
        )
    embeddings = response.get("embeddings")
    if not isinstance(embeddings, list):
        _fail("malformed_embedding_response", "response.embeddings must be an array")
    if len(embeddings) != expected_count:
        _fail(
            "malformed_embedding_response",
            "embedding count does not match the document count",
        )

    vectors: list[tuple[float, ...]] = []
    dimension: int | None = None
    for vector_index, value in enumerate(embeddings):
        if not isinstance(value, list) or not value:
            _fail(
                "malformed_embedding_response",
                f"embedding {vector_index} must be a non-empty numeric array",
            )
        vector: list[float] = []
        for component_index, component in enumerate(value):
            if (
                isinstance(component, bool)
                or not isinstance(component, (int, float))
                or not math.isfinite(component)
            ):
                _fail(
                    "malformed_embedding_response",
                    f"embedding {vector_index} component {component_index} "
                    "must be finite numeric data",
                )
            vector.append(float(component))

        if dimension is None:
            dimension = len(vector)
        elif len(vector) != dimension:
            _fail(
                "inconsistent_embedding_dimension",
                f"embedding {vector_index} has dimension {len(vector)}; "
                f"expected {dimension}",
            )
        if len(vector) != expected_dimension:
            _fail(
                "inconsistent_embedding_dimension",
                f"embedding {vector_index} has dimension {len(vector)}; "
                f"configured dimension is {expected_dimension}",
            )
        if normalize:
            norm = math.sqrt(math.fsum(component * component for component in vector))
            if not math.isfinite(norm) or norm == 0:
                _fail(
                    "malformed_embedding_response",
                    f"embedding {vector_index} cannot be L2-normalized",
                )
            vector = [component / norm for component in vector]
        vectors.append(tuple(vector))
    return tuple(vectors)


def _fail(code: str, detail: str) -> None:
    raise OllamaEmbeddingError(code, detail)
