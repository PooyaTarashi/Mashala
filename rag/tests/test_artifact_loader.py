from __future__ import annotations

import copy
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import faiss


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mashala_rag.artifact_loader import (  # noqa: E402
    ArtifactLoadError,
    RagArtifactLoader,
)
from mashala_rag.artifact_contract import EmbeddingMetadata  # noqa: E402


FIXTURE_DIRECTORY = Path(__file__).parent / "fixtures" / "artifacts" / "valid"


def expected_embedding() -> EmbeddingMetadata:
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


def read_manifest(directory: Path) -> dict[str, object]:
    return json.loads((directory / "manifest.json").read_text("utf-8"))


def write_manifest(directory: Path, manifest: object) -> None:
    (directory / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
        "utf-8",
    )


class ArtifactLoaderTests(unittest.TestCase):
    def assert_load_error(
        self,
        expected_code: str,
        directory: Path,
        *,
        embedding: EmbeddingMetadata | None = None,
    ) -> ArtifactLoadError:
        with self.assertRaises(ArtifactLoadError) as raised:
            RagArtifactLoader(
                artifact_directory=directory,
                expected_embedding=embedding or expected_embedding(),
            ).load()
        self.assertEqual(raised.exception.code, expected_code)
        return raised.exception

    def test_loads_a_valid_prebuilt_fixture(self) -> None:
        loaded = RagArtifactLoader(
            artifact_directory=FIXTURE_DIRECTORY,
            expected_embedding=expected_embedding(),
        ).load()

        self.assertEqual(loaded.manifest["artifactFormatVersion"], "1.0")
        self.assertEqual(loaded.index.d, 3)
        self.assertEqual(loaded.index.ntotal, 2)
        self.assertEqual(len(loaded.artifact_paths), 1)
        self.assertEqual(loaded.artifact_paths[0].name, "index.bin")

    def test_rejects_an_unsupported_artifact_version(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory) / "artifacts"
            shutil.copytree(FIXTURE_DIRECTORY, directory)
            manifest = read_manifest(directory)
            manifest["artifactFormatVersion"] = "2.0"
            write_manifest(directory, manifest)

            error = self.assert_load_error(
                "unsupported_artifact_format_version",
                directory,
            )

        self.assertEqual(error.path, "$.artifactFormatVersion")

    def test_rejects_an_incompatible_embedding_configuration(self) -> None:
        incompatible = expected_embedding()
        incompatible["configuration"] = copy.deepcopy(
            incompatible["configuration"]
        )
        incompatible["configuration"]["normalize"] = False

        error = self.assert_load_error(
            "incompatible_embedding_configuration",
            FIXTURE_DIRECTORY,
            embedding=incompatible,
        )

        self.assertEqual(error.path, "$.embedding.configuration")

    def test_rejects_missing_manifest_and_index_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_error = self.assert_load_error("missing_artifact", root)

            directory = root / "artifacts"
            shutil.copytree(FIXTURE_DIRECTORY, directory)
            (directory / "retrieval" / "index.bin").unlink()
            index_error = self.assert_load_error("missing_artifact", directory)

        self.assertEqual(manifest_error.path, "manifest.json")
        self.assertEqual(index_error.path, "retrieval/index.bin")

    def test_rejects_corrupt_json_and_inconsistent_chunk_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            corrupt_json = root / "corrupt-json"
            shutil.copytree(FIXTURE_DIRECTORY, corrupt_json)
            (corrupt_json / "manifest.json").write_bytes(b'{"broken":')
            json_error = self.assert_load_error("corrupt_manifest", corrupt_json)

            corrupt_metadata = root / "corrupt-metadata"
            shutil.copytree(FIXTURE_DIRECTORY, corrupt_metadata)
            manifest = read_manifest(corrupt_metadata)
            manifest["corpus"]["chunkCount"] = 3
            write_manifest(corrupt_metadata, manifest)
            metadata_error = self.assert_load_error(
                "malformed_artifact_metadata",
                corrupt_metadata,
            )

        self.assertEqual(json_error.path, "manifest.json")
        self.assertEqual(metadata_error.path, "$.corpus.chunkCount")

    def test_rejects_retrieval_artifact_integrity_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory) / "artifacts"
            shutil.copytree(FIXTURE_DIRECTORY, directory)
            index_path = directory / "retrieval" / "index.bin"
            index_path.write_bytes(index_path.read_bytes() + b"corrupt")

            error = self.assert_load_error("artifact_size_mismatch", directory)

        self.assertEqual(error.path, "retrieval/index.bin")

    def test_rejects_an_unreadable_faiss_index_after_file_integrity_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory) / "artifacts"
            shutil.copytree(FIXTURE_DIRECTORY, directory)
            index_path = directory / "retrieval" / "index.bin"
            corrupt_index = b"not a serialized FAISS index"
            index_path.write_bytes(corrupt_index)
            manifest = read_manifest(directory)
            descriptor = manifest["retrievalIndex"]["artifacts"][0]
            descriptor["sizeBytes"] = len(corrupt_index)
            descriptor["digest"] = (
                "sha256:" + hashlib.sha256(corrupt_index).hexdigest()
            )
            write_manifest(directory, manifest)

            error = self.assert_load_error(
                "unreadable_retrieval_index",
                directory,
            )

        self.assertIn("FAISS", error.detail)

    def test_preserves_chunk_content_source_provenance_and_retrieval_mapping(self) -> None:
        loaded = RagArtifactLoader(
            artifact_directory=FIXTURE_DIRECTORY,
            expected_embedding=expected_embedding(),
        ).load()

        chunk = loaded.chunks_by_id["chunk:accounts-overview"]
        self.assertEqual(
            chunk["content"],
            "Accounts show balances and recent activity.",
        )
        self.assertEqual(
            chunk["provenance"],
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
        self.assertEqual(
            loaded.chunk_id_by_retrieval_id["0"],
            "chunk:accounts-overview",
        )

    def test_loads_the_index_once_and_reuses_the_same_state(self) -> None:
        with patch(
            "mashala_rag.artifact_loader.faiss.read_index",
            wraps=faiss.read_index,
        ) as read_index:
            loader = RagArtifactLoader(
                artifact_directory=FIXTURE_DIRECTORY,
                expected_embedding=expected_embedding(),
            )

            first = loader.load()
            second = loader.load()

        self.assertIs(second, first)
        self.assertIs(second.index, first.index)
        read_index.assert_called_once()

    def test_runtime_loading_does_not_invoke_the_offline_indexing_pipeline(self) -> None:
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
            loaded = RagArtifactLoader(
                artifact_directory=FIXTURE_DIRECTORY,
                expected_embedding=expected_embedding(),
            ).load()

        self.assertEqual(loaded.index.ntotal, 2)


if __name__ == "__main__":
    unittest.main()
