from __future__ import annotations

import io
import math
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mashala_rag.ollama_embeddings import (  # noqa: E402
    OllamaEmbeddingClient,
    OllamaEmbeddingConfig,
    OllamaEmbeddingError,
    _post_json,
)


class OllamaEmbeddingTests(unittest.TestCase):
    def test_normalizes_embedding_request_and_response(self) -> None:
        captured: dict[str, object] = {}

        def transport(
            url: str, payload: dict[str, object], timeout: float
        ) -> object:
            captured.update(url=url, payload=payload, timeout=timeout)
            return {
                "model": "nomic-embed-text:v1.5",
                "embeddings": [[3, 4, 0], [0.0, 0.0, 2.0]],
                "total_duration": 1,
            }

        client = OllamaEmbeddingClient(
            OllamaEmbeddingConfig(expected_dimension=3, timeout_seconds=12),
            transport=transport,
        )
        batch = client.embed_documents(["First chunk", "Second chunk"])

        self.assertEqual(captured["url"], "http://localhost:11434/api/embed")
        self.assertEqual(
            captured["payload"],
            {
                "model": "nomic-embed-text:v1.5",
                "input": [
                    "search_document: First chunk",
                    "search_document: Second chunk",
                ],
                "truncate": False,
            },
        )
        self.assertEqual(captured["timeout"], 12.0)
        self.assertEqual(batch.vectors[0], (0.6, 0.8, 0.0))
        self.assertEqual(batch.vectors[1], (0.0, 0.0, 1.0))
        self.assertTrue(
            all(
                math.isclose(math.sqrt(sum(x * x for x in vector)), 1.0)
                for vector in batch.vectors
            )
        )

    def test_records_complete_embedding_identity_in_issue_041_shape(self) -> None:
        config = OllamaEmbeddingConfig(
            model="nomic-embed-text:v1.5",
            expected_dimension=768,
        )

        self.assertEqual(
            config.metadata(),
            {
                "provider": "ollama",
                "model": "nomic-embed-text:v1.5",
                "dimension": 768,
                "configuration": {
                    "documentTaskPrefix": "search_document",
                    "queryTaskPrefix": "search_query",
                    "normalize": True,
                    "truncate": False,
                },
            },
        )

    def test_embeds_one_query_with_the_recorded_query_prefix(self) -> None:
        captured: dict[str, object] = {}

        def transport(
            _url: str, payload: dict[str, object], _timeout: float
        ) -> object:
            captured.update(payload)
            return {
                "model": "nomic-embed-text:v1.5",
                "embeddings": [[0, 3, 4]],
            }

        client = OllamaEmbeddingClient(
            OllamaEmbeddingConfig(expected_dimension=3),
            transport=transport,
        )

        batch = client.embed_query("How do transfers work?")

        self.assertEqual(
            captured["input"],
            ["search_query: How do transfers work?"],
        )
        self.assertEqual(batch.vectors, ((0.0, 0.6, 0.8),))
        self.assertEqual(batch.metadata, client.metadata())

    def test_rejects_malformed_responses(self) -> None:
        cases = [
            ("not an object", []),
            ("missing model", {"embeddings": [[1, 0, 0]]}),
            (
                "wrong model",
                {"model": "another-model", "embeddings": [[1, 0, 0]]},
            ),
            (
                "wrong count",
                {"model": "nomic-embed-text:v1.5", "embeddings": []},
            ),
            (
                "non-numeric component",
                {
                    "model": "nomic-embed-text:v1.5",
                    "embeddings": [[1, True, 0]],
                },
            ),
            (
                "zero vector",
                {
                    "model": "nomic-embed-text:v1.5",
                    "embeddings": [[0, 0, 0]],
                },
            ),
        ]

        for label, response in cases:
            with self.subTest(label):
                client = OllamaEmbeddingClient(
                    OllamaEmbeddingConfig(expected_dimension=3),
                    transport=lambda _url, _payload, _timeout, value=response: value,
                )
                with self.assertRaises(OllamaEmbeddingError) as raised:
                    client.embed_documents(["chunk"])
                self.assertEqual(raised.exception.code, "malformed_embedding_response")

    def test_rejects_inconsistent_and_unexpected_dimensions(self) -> None:
        cases = [
            [[1, 0, 0], [1, 0]],
            [[1, 0], [0, 1]],
        ]
        for embeddings in cases:
            with self.subTest(embeddings=embeddings):
                client = OllamaEmbeddingClient(
                    OllamaEmbeddingConfig(expected_dimension=3),
                    transport=lambda _url, _payload, _timeout, value=embeddings: {
                        "model": "nomic-embed-text:v1.5",
                        "embeddings": value,
                    },
                )
                with self.assertRaises(OllamaEmbeddingError) as raised:
                    client.embed_documents(["one", "two"])
                self.assertEqual(
                    raised.exception.code,
                    "inconsistent_embedding_dimension",
                )

    def test_reports_unavailable_ollama_without_cloud_fallback(self) -> None:
        def unavailable(_url: str, _payload: dict[str, object], _timeout: float) -> object:
            raise URLError("connection refused")

        client = OllamaEmbeddingClient(
            OllamaEmbeddingConfig(expected_dimension=3),
            transport=unavailable,
        )

        with self.assertRaises(OllamaEmbeddingError) as raised:
            client.embed_documents(["chunk"])

        self.assertEqual(raised.exception.code, "ollama_unavailable")
        self.assertNotIn("cloud", raised.exception.detail.lower())

    def test_reports_missing_local_model_clearly(self) -> None:
        error = HTTPError(
            "http://localhost:11434/api/embed",
            404,
            "not found",
            hdrs=None,
            fp=io.BytesIO(b'{"error":"model nomic-embed-text:v1.5 not found"}'),
        )
        with patch(
            "mashala_rag.ollama_embeddings.urlopen",
            side_effect=error,
        ):
            with self.assertRaises(OllamaEmbeddingError) as raised:
                _post_json(
                    "http://localhost:11434/api/embed",
                    {"model": "nomic-embed-text:v1.5", "input": ["chunk"]},
                    1,
                )

        self.assertEqual(raised.exception.code, "embedding_model_unavailable")
        self.assertIn("pull it", raised.exception.detail)

    def test_rejects_non_nomic_model_configuration(self) -> None:
        with self.assertRaises(OllamaEmbeddingError) as raised:
            OllamaEmbeddingConfig(model="cloud-embedding-model")

        self.assertEqual(raised.exception.code, "invalid_embedding_configuration")


if __name__ == "__main__":
    unittest.main()
