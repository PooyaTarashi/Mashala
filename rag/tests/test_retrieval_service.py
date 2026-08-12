from __future__ import annotations

import http.client
import json
import sys
import threading
import unittest
from pathlib import Path
from typing import Callable
from urllib.error import URLError
from unittest.mock import patch

import faiss


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mashala_rag.artifact_loader import (  # noqa: E402
    ArtifactLoadError,
    RagArtifactLoader,
)
from mashala_rag.ollama_embeddings import (  # noqa: E402
    OllamaEmbeddingClient,
    OllamaEmbeddingConfig,
    OllamaEmbeddingError,
)
from mashala_rag.retrieval_http import create_http_server  # noqa: E402
from mashala_rag.retrieval_service import (  # noqa: E402
    RagRetrievalService,
    RetrievalServiceError,
)


FIXTURE_DIRECTORY = Path(__file__).parent / "fixtures" / "artifacts" / "valid"


def embedding_config() -> OllamaEmbeddingConfig:
    return OllamaEmbeddingConfig(expected_dimension=3)


def query_transport(
    _url: str,
    payload: dict[str, object],
    _timeout: float,
) -> object:
    inputs = payload.get("input")
    if not isinstance(inputs, list) or len(inputs) != 1:
        raise AssertionError("retrieval must embed exactly one query")
    query = inputs[0]
    vector = [0.0, 1.0, 0.0] if "transfer" in str(query).lower() else [1.0, 0.0, 0.0]
    return {
        "model": "nomic-embed-text:v1.5",
        "embeddings": [vector],
    }


def create_service(
    *,
    transport: Callable[[str, dict[str, object], float], object] = query_transport,
    index_reader: Callable[[tuple[Path, ...]], object] | None = None,
) -> RagRetrievalService:
    config = embedding_config()
    loader = RagArtifactLoader(
        artifact_directory=FIXTURE_DIRECTORY,
        expected_embedding=config.metadata(),
        index_reader=index_reader,  # type: ignore[arg-type]
    )
    return RagRetrievalService(
        loader=loader,
        query_embedder=OllamaEmbeddingClient(config, transport=transport),
    )


class FailingIndex:
    d = 3
    ntotal = 2
    is_trained = True

    def search(self, _vectors: object, _top_k: int) -> tuple[object, object]:
        raise RuntimeError("native search failure")


class RetrievalServiceTests(unittest.TestCase):
    def test_starts_with_valid_artifacts_and_loads_the_index_once(self) -> None:
        with patch(
            "mashala_rag.artifact_loader.faiss.read_index",
            wraps=faiss.read_index,
        ) as read_index:
            service = create_service()
            first = service.retrieve(query="accounts", top_k=1)
            second = service.retrieve(query="transfers", top_k=1)

        self.assertEqual(first["results"][0]["chunkId"], "chunk:accounts-overview")
        self.assertEqual(
            second["results"][0]["chunkId"],
            "chunk:transfers-confirmation",
        )
        read_index.assert_called_once()

    def test_runtime_never_invokes_the_offline_corpus_pipeline(self) -> None:
        with (
            patch(
                "mashala_rag.markdown_ingestion.ingest_markdown",
                side_effect=AssertionError("runtime parsed Markdown"),
            ),
            patch(
                "mashala_rag.ollama_embeddings.OllamaEmbeddingClient.embed_documents",
                side_effect=AssertionError("runtime embedded the corpus"),
            ),
            patch(
                "mashala_rag.index_builder.build_rag_artifacts",
                side_effect=AssertionError("runtime rebuilt FAISS"),
            ),
        ):
            response = create_service().retrieve(query="accounts", top_k=1)

        self.assertEqual(response["results"][0]["chunkId"], "chunk:accounts-overview")

    def test_returns_top_k_chunks_content_provenance_and_scores(self) -> None:
        response = create_service().retrieve(query="account activity", top_k=2)

        self.assertEqual(len(response["results"]), 2)
        first = response["results"][0]
        self.assertEqual(first["chunkId"], "chunk:accounts-overview")
        self.assertEqual(
            first["content"],
            "Accounts show balances and recent activity.",
        )
        self.assertEqual(
            first["provenance"],
            {
                "sourceId": "source:accounts-guide",
                "sourceUri": "guides/accounts.md",
                "sourceTitle": "Account guide",
                "sourceDigest": "sha256:" + "a" * 64,
                "headingPath": ["Accounts", "Overview"],
                "startLine": 3,
                "endLine": 5,
                "metadata": {"audience": ["customer"], "locale": "en"},
            },
        )
        self.assertIsInstance(first["score"], float)
        self.assertGreater(first["score"], response["results"][1]["score"])

    def test_top_k_is_capped_by_the_available_corpus(self) -> None:
        response = create_service().retrieve(query="accounts", top_k=10)

        self.assertEqual(len(response["results"]), 2)

    def test_rejects_malformed_queries_and_top_k(self) -> None:
        service = create_service()
        cases = [
            ("query", {"query": "", "top_k": 1}, "invalid_query"),
            ("query type", {"query": ["accounts"], "top_k": 1}, "invalid_query"),
            ("zero", {"query": "accounts", "top_k": 0}, "invalid_top_k"),
            ("boolean", {"query": "accounts", "top_k": True}, "invalid_top_k"),
            ("too large", {"query": "accounts", "top_k": 101}, "invalid_top_k"),
        ]
        for label, arguments, expected_code in cases:
            with self.subTest(label):
                with self.assertRaises(RetrievalServiceError) as raised:
                    service.retrieve(**arguments)
                self.assertEqual(raised.exception.code, expected_code)

    def test_reports_ollama_failure_without_fallback(self) -> None:
        def unavailable(
            _url: str, _payload: dict[str, object], _timeout: float
        ) -> object:
            raise URLError("connection refused")

        service = create_service(transport=unavailable)

        with self.assertRaises(OllamaEmbeddingError) as raised:
            service.retrieve(query="accounts", top_k=1)

        self.assertEqual(raised.exception.code, "ollama_unavailable")

    def test_rejects_incompatible_runtime_embedding_configuration(self) -> None:
        incompatible = OllamaEmbeddingConfig(expected_dimension=4)

        with self.assertRaises(ArtifactLoadError) as raised:
            RagRetrievalService(
                loader=RagArtifactLoader(
                    artifact_directory=FIXTURE_DIRECTORY,
                    expected_embedding=incompatible.metadata(),
                ),
                query_embedder=OllamaEmbeddingClient(incompatible),
            )

        self.assertEqual(
            raised.exception.code,
            "incompatible_embedding_configuration",
        )

    def test_rejects_incompatible_embedding_results(self) -> None:
        def wrong_dimension(
            _url: str, _payload: dict[str, object], _timeout: float
        ) -> object:
            return {
                "model": "nomic-embed-text:v1.5",
                "embeddings": [[1.0, 0.0]],
            }

        with self.assertRaises(OllamaEmbeddingError) as raised:
            create_service(transport=wrong_dimension).retrieve(
                query="accounts",
                top_k=1,
            )

        self.assertEqual(raised.exception.code, "inconsistent_embedding_dimension")

    def test_normalizes_retrieval_failures(self) -> None:
        service = create_service(index_reader=lambda _paths: FailingIndex())

        with self.assertRaises(RetrievalServiceError) as raised:
            service.retrieve(query="accounts", top_k=1)

        self.assertEqual(raised.exception.code, "retrieval_failed")


class RetrievalHttpIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = create_http_server(create_service(), host="127.0.0.1", port=0)
        self.server_thread = threading.Thread(
            target=self.server.serve_forever,
            kwargs={"poll_interval": 0.01},
            daemon=True,
        )
        self.server_thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=2)

    def request(
        self,
        body: bytes,
        *,
        content_type: str = "application/json",
    ) -> tuple[int, dict[str, object]]:
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.server.server_port,
            timeout=2,
        )
        try:
            connection.request(
                "POST",
                "/retrieve",
                body=body,
                headers={"Content-Type": content_type},
            )
            response = connection.getresponse()
            return response.status, json.loads(response.read().decode("utf-8"))
        finally:
            connection.close()

    def test_json_http_retrieval_contract(self) -> None:
        status, body = self.request(
            json.dumps({"query": "transfer confirmation", "topK": 1}).encode()
        )

        self.assertEqual(status, 200)
        results = body["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["chunkId"], "chunk:transfers-confirmation")
        self.assertEqual(
            results[0]["provenance"]["sourceUri"],
            "guides/transfers.md",
        )
        self.assertIn("score", results[0])

    def test_malformed_http_input_fails_closed(self) -> None:
        cases = [
            (b"not-json", "application/json", "invalid_request"),
            (b"{}", "application/json", "invalid_request"),
            (b'{"query":"accounts","topK":0}', "application/json", "invalid_top_k"),
            (b'{"query":"accounts","operation":"POST /transfer"}', "application/json", "invalid_request"),
            (b'{"query":"accounts","credentials":"secret"}', "application/json", "invalid_request"),
            (b'{"query":"accounts"}', "text/plain", "invalid_request"),
        ]
        for body, content_type, expected_code in cases:
            with self.subTest(body=body):
                status, response = self.request(body, content_type=content_type)
                self.assertEqual(status, 400)
                self.assertEqual(response["error"]["code"], expected_code)

    def test_embedding_and_retrieval_failures_are_structured(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=2)

        def unavailable(
            _url: str, _payload: dict[str, object], _timeout: float
        ) -> object:
            raise URLError("connection refused")

        self.server = create_http_server(
            create_service(transport=unavailable),
            host="127.0.0.1",
            port=0,
        )
        self.server_thread = threading.Thread(
            target=self.server.serve_forever,
            kwargs={"poll_interval": 0.01},
            daemon=True,
        )
        self.server_thread.start()
        status, body = self.request(b'{"query":"accounts","topK":1}')
        self.assertEqual(status, 503)
        self.assertEqual(body["error"]["code"], "ollama_unavailable")

        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=2)
        self.server = create_http_server(
            create_service(index_reader=lambda _paths: FailingIndex()),
            host="127.0.0.1",
            port=0,
        )
        self.server_thread = threading.Thread(
            target=self.server.serve_forever,
            kwargs={"poll_interval": 0.01},
            daemon=True,
        )
        self.server_thread.start()
        status, body = self.request(b'{"query":"accounts","topK":1}')
        self.assertEqual(status, 500)
        self.assertEqual(body["error"]["code"], "retrieval_failed")

    def test_contract_has_no_llm_answering_or_backend_execution_fields(self) -> None:
        status, body = self.request(
            b'{"query":"accounts","topK":1,"messages":[],"targetBackend":{}}'
        )

        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "invalid_request")


if __name__ == "__main__":
    unittest.main()
