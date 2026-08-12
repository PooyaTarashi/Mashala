from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mashala_rag.artifact_contract import (  # noqa: E402
    ArtifactChunk,
    validate_artifact_manifest,
    validate_embedding_compatibility,
)
from mashala_rag.index_builder import (  # noqa: E402
    BUILDER_VERSION,
    INDEX_ARTIFACT_PATH,
    MANIFEST_FILENAME,
    ArtifactBuildError,
    build_faiss_index,
    build_rag_artifacts,
    serialize_rag_artifacts,
)
from mashala_rag.ollama_embeddings import EmbeddingBatch  # noqa: E402


def fixture_chunks() -> list[ArtifactChunk]:
    return [
        {
            "chunkId": "chunk:alpha",
            "content": "Alpha documentation.",
            "provenance": {
                "sourceId": "source:guide",
                "sourceUri": "guide.md",
                "startLine": 1,
                "endLine": 1,
            },
        },
        {
            "chunkId": "chunk:beta",
            "content": "Beta documentation.",
            "provenance": {
                "sourceId": "source:guide",
                "sourceUri": "guide.md",
                "startLine": 3,
                "endLine": 3,
            },
        },
    ]


def embedding_metadata() -> dict[str, object]:
    return {
        "provider": "ollama",
        "model": "nomic-embed-text:v1.5",
        "dimension": 3,
        "configuration": {
            "documentTaskPrefix": "search_document",
            "queryTaskPrefix": "search_query",
            "normalize": True,
            "truncate": False,
        },
    }


class FixtureEmbedder:
    def embed_documents(self, documents: list[str]) -> EmbeddingBatch:
        if len(documents) != 2:
            raise AssertionError("fixture expected two documents")
        return EmbeddingBatch(
            vectors=((1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
            metadata=embedding_metadata(),  # type: ignore[arg-type]
        )


class IndexBuilderTests(unittest.TestCase):
    def test_builds_small_exact_inner_product_index(self) -> None:
        index = build_faiss_index(
            ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
        )

        distances, identifiers = index.search(
            np.asarray([[0.9, 0.1, 0.0]], dtype=np.float32),
            2,
        )
        self.assertEqual(index.__class__.__name__, "IndexFlatIP")
        self.assertEqual(index.ntotal, 2)
        self.assertEqual(index.d, 3)
        self.assertEqual(identifiers.tolist(), [[0, 1]])
        self.assertGreater(distances[0][0], distances[0][1])

    def test_serializes_deployable_index_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            result = build_rag_artifacts(
                chunks=fixture_chunks(),
                output_directory=Path(temporary_directory),
                embedder=FixtureEmbedder(),
            )

            self.assertEqual(result.builder_version, BUILDER_VERSION)
            self.assertEqual(result.manifest_path.name, MANIFEST_FILENAME)
            self.assertEqual(
                result.index_path.relative_to(temporary_directory).as_posix(),
                INDEX_ARTIFACT_PATH,
            )
            manifest_from_disk = json.loads(result.manifest_path.read_text("utf-8"))
            validated = validate_artifact_manifest(manifest_from_disk)
            index_bytes = result.index_path.read_bytes()

        self.assertEqual(validated, result.manifest)
        self.assertEqual(validated["corpus"]["chunks"], fixture_chunks())
        self.assertEqual(
            validated["retrievalIndex"]["entries"],
            [
                {"retrievalId": "0", "chunkId": "chunk:alpha"},
                {"retrievalId": "1", "chunkId": "chunk:beta"},
            ],
        )
        descriptor = validated["retrievalIndex"]["artifacts"][0]
        self.assertEqual(descriptor["path"], "retrieval/index.bin")
        self.assertEqual(descriptor["sizeBytes"], len(index_bytes))
        self.assertEqual(
            descriptor["digest"],
            "sha256:" + hashlib.sha256(index_bytes).hexdigest(),
        )
        self.assertNotIn("faiss", json.dumps(validated).lower())
        self.assertNotIn("IndexFlatIP", json.dumps(validated))

    def test_manifest_records_ollama_embedding_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            result = build_rag_artifacts(
                chunks=fixture_chunks(),
                output_directory=Path(temporary_directory),
                embedder=FixtureEmbedder(),
            )

        self.assertEqual(result.manifest["embedding"], embedding_metadata())
        validate_embedding_compatibility(
            result.manifest["embedding"],
            embedding_metadata(),
        )

    def test_same_fixture_and_configuration_produce_compatible_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as first_directory:
            first = build_rag_artifacts(
                chunks=fixture_chunks(),
                output_directory=Path(first_directory),
                embedder=FixtureEmbedder(),
            )
        with tempfile.TemporaryDirectory() as second_directory:
            second = build_rag_artifacts(
                chunks=fixture_chunks(),
                output_directory=Path(second_directory),
                embedder=FixtureEmbedder(),
            )

        validate_artifact_manifest(
            first.manifest,
            expected_embedding=second.manifest["embedding"],
        )
        self.assertEqual(first.manifest["corpus"], second.manifest["corpus"])
        self.assertEqual(
            first.manifest["retrievalIndex"],
            second.manifest["retrievalIndex"],
        )

    def test_rejects_embedding_count_mismatch(self) -> None:
        class ShortEmbedder:
            def embed_documents(self, _documents: list[str]) -> EmbeddingBatch:
                return EmbeddingBatch(
                    vectors=((1.0, 0.0, 0.0),),
                    metadata=embedding_metadata(),  # type: ignore[arg-type]
                )

        with tempfile.TemporaryDirectory() as temporary_directory:
            with self.assertRaises(ArtifactBuildError) as raised:
                build_rag_artifacts(
                    chunks=fixture_chunks(),
                    output_directory=Path(temporary_directory),
                    embedder=ShortEmbedder(),
                )

        self.assertEqual(raised.exception.code, "inconsistent_embedding_count")

    def test_reports_index_serialization_failure(self) -> None:
        index = build_faiss_index(((1.0, 0.0, 0.0), (0.0, 1.0, 0.0)))
        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch(
                "mashala_rag.index_builder.faiss.serialize_index",
                side_effect=RuntimeError("native failure"),
            ):
                with self.assertRaises(ArtifactBuildError) as raised:
                    serialize_rag_artifacts(
                        chunks=fixture_chunks(),
                        embedding=embedding_metadata(),  # type: ignore[arg-type]
                        index=index,
                        output_directory=Path(temporary_directory),
                    )

        self.assertEqual(raised.exception.code, "index_serialization_failed")

    def test_reports_artifact_write_failure(self) -> None:
        index = build_faiss_index(((1.0, 0.0, 0.0), (0.0, 1.0, 0.0)))
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_file = Path(temporary_directory) / "not-a-directory"
            output_file.write_text("occupied", encoding="utf-8")
            with self.assertRaises(ArtifactBuildError) as raised:
                serialize_rag_artifacts(
                    chunks=fixture_chunks(),
                    embedding=embedding_metadata(),  # type: ignore[arg-type]
                    index=index,
                    output_directory=output_file,
                )

        self.assertEqual(raised.exception.code, "artifact_write_failed")


if __name__ == "__main__":
    unittest.main()
