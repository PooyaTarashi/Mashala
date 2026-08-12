"""Minimal JSON-over-HTTP transport for the persistent RAG retrieval runtime."""

from __future__ import annotations

import argparse
import json
import math
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Callable, Sequence

from .artifact_loader import RagArtifactLoader
from .ollama_embeddings import (
    DEFAULT_OLLAMA_BASE_URL,
    OllamaEmbeddingClient,
    OllamaEmbeddingConfig,
    OllamaEmbeddingError,
)
from .retrieval_service import (
    DEFAULT_TOP_K,
    RagRetrievalService,
    RetrievalServiceError,
)


DEFAULT_HTTP_HOST = "0.0.0.0"
DEFAULT_HTTP_PORT = 8765
MAX_REQUEST_BYTES = 64 * 1024


class RetrievalHttpServer(HTTPServer):
    """HTTP server retaining one already-started retrieval service."""

    retrieval_service: RagRetrievalService


def build_retrieval_service(
    *,
    artifact_directory: Path,
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL,
    ollama_timeout_seconds: float = 60.0,
) -> RagRetrievalService:
    """Compose the v0.1 Ollama runtime and exact artifact compatibility check."""

    embedding_config = OllamaEmbeddingConfig(
        base_url=ollama_base_url,
        timeout_seconds=ollama_timeout_seconds,
    )
    loader = RagArtifactLoader(
        artifact_directory=artifact_directory,
        expected_embedding=embedding_config.metadata(),
    )
    return RagRetrievalService(
        loader=loader,
        query_embedder=OllamaEmbeddingClient(embedding_config),
    )


def create_http_server(
    service: RagRetrievalService,
    *,
    host: str = DEFAULT_HTTP_HOST,
    port: int = DEFAULT_HTTP_PORT,
) -> RetrievalHttpServer:
    """Bind a persistent HTTP transport around one initialized service."""

    server = RetrievalHttpServer((host, port), _RetrievalRequestHandler)
    server.retrieval_service = service
    return server


def serve_main(arguments: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(prog="mashala-rag serve")
    parser.add_argument("--artifact-directory", type=Path, required=True)
    parser.add_argument("--host", default=DEFAULT_HTTP_HOST)
    parser.add_argument("--port", type=_port, default=DEFAULT_HTTP_PORT)
    parser.add_argument("--ollama-base-url", default=DEFAULT_OLLAMA_BASE_URL)
    parser.add_argument("--ollama-timeout-seconds", type=_positive_float, default=60.0)
    options = parser.parse_args(list(arguments))

    service = build_retrieval_service(
        artifact_directory=options.artifact_directory,
        ollama_base_url=options.ollama_base_url,
        ollama_timeout_seconds=options.ollama_timeout_seconds,
    )
    server = create_http_server(service, host=options.host, port=options.port)
    print(
        json.dumps(
            {
                "component": "mashala-rag-retrieval",
                "host": options.host,
                "port": server.server_port,
                "status": "ready",
            },
            sort_keys=True,
        ),
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


class _RetrievalRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "MashalaRag/0.1"
    sys_version = ""

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/retrieve":
            self._write_error(404, "not_found", "retrieval endpoint not found")
            return

        try:
            request = self._read_request()
            response = self.server.retrieval_service.retrieve(
                query=request["query"],
                top_k=request.get("topK", DEFAULT_TOP_K),
            )
        except _HttpRequestError as error:
            self._write_error(400, error.code, error.detail)
            return
        except RetrievalServiceError as error:
            if error.code in {"invalid_query", "invalid_top_k"}:
                status = 400
            elif error.code == "incompatible_embedding_response":
                status = 502
            else:
                status = 500
            self._write_error(status, error.code, error.detail)
            return
        except OllamaEmbeddingError as error:
            status = 503 if error.code in {
                "ollama_unavailable",
                "embedding_model_unavailable",
            } else 502
            self._write_error(status, error.code, error.detail)
            return

        self._write_json(200, response)

    def do_GET(self) -> None:  # noqa: N802
        self._write_error(
            405,
            "method_not_allowed",
            "use POST /retrieve for semantic retrieval",
        )

    def log_message(self, _format: str, *_arguments: object) -> None:
        return

    def _read_request(self) -> dict[str, object]:
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip()
        if content_type.lower() != "application/json":
            raise _HttpRequestError(
                "invalid_request",
                "Content-Type must be application/json",
            )
        content_length_value = self.headers.get("Content-Length")
        try:
            content_length = int(content_length_value or "")
        except ValueError as error:
            raise _HttpRequestError(
                "invalid_request",
                "Content-Length must be a positive integer",
            ) from error
        if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
            raise _HttpRequestError(
                "invalid_request",
                f"request body must contain 1 through {MAX_REQUEST_BYTES} bytes",
            )

        try:
            value = json.loads(
                self.rfile.read(content_length).decode("utf-8"),
                object_pairs_hook=_object_without_duplicate_fields,
            )
        except (UnicodeDecodeError, json.JSONDecodeError, _DuplicateFieldError) as error:
            raise _HttpRequestError(
                "invalid_request",
                "request body must be unambiguous UTF-8 JSON",
            ) from error
        if not isinstance(value, dict):
            raise _HttpRequestError("invalid_request", "request body must be an object")
        fields = set(value)
        if "query" not in fields:
            raise _HttpRequestError("invalid_request", "request must include query")
        unknown = fields - {"query", "topK"}
        if unknown:
            raise _HttpRequestError(
                "invalid_request",
                f"unknown request field {sorted(unknown)[0]!r}",
            )
        return value

    def _write_error(self, status: int, code: str, detail: str) -> None:
        self._write_json(status, {"error": {"code": code, "detail": detail}})

    def _write_json(self, status: int, value: object) -> None:
        body = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True


class _HttpRequestError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


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


def _port(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("port must be an integer") from error
    if parsed < 0 or parsed > 65_535:
        raise argparse.ArgumentTypeError("port must be from 0 through 65535")
    return parsed


def _positive_float(value: str) -> float:
    try:
        parsed = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a positive number") from error
    if not math.isfinite(parsed) or parsed <= 0:
        raise argparse.ArgumentTypeError("expected a positive number")
    return parsed
