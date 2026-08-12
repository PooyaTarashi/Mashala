from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mashala_rag.build_command import (  # noqa: E402
    _discover_markdown_sources,
    build_documentation_artifacts,
)
from mashala_rag.markdown_ingestion import MarkdownIngestionError  # noqa: E402
from mashala_rag.ollama_embeddings import EmbeddingBatch  # noqa: E402


class FixtureEmbedder:
    def embed_documents(self, documents: list[str]) -> EmbeddingBatch:
        vectors = tuple(
            (1.0, 0.0, float(index)) for index, _document in enumerate(documents)
        )
        return EmbeddingBatch(
            vectors=vectors,
            metadata={
                "provider": "ollama",
                "model": "nomic-embed-text:v1.5",
                "dimension": 3,
                "configuration": {
                    "documentTaskPrefix": "search_document",
                    "queryTaskPrefix": "search_query",
                    "normalize": True,
                    "truncate": False,
                },
            },
        )


class BuildCommandTests(unittest.TestCase):
    def test_builds_all_markdown_below_the_configured_input(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            docs = root / "developer docs"
            output = root / "artifacts"
            (docs / "guides").mkdir(parents=True)
            (docs / "overview.md").write_text("# Overview\n\nHello.\n", "utf-8")
            (docs / "guides" / "usage.MD").write_text(
                "# Usage\n\nUse it.\n", "utf-8"
            )
            (docs / "ignored.txt").write_text("not Markdown", "utf-8")
            progress: list[str] = []

            summary = build_documentation_artifacts(
                input_directory=docs,
                output_directory=output,
                ollama_base_url="http://host.docker.internal:11434",
                embedder=FixtureEmbedder(),
                progress=progress.append,
            )

            manifest = json.loads((output / "manifest.json").read_text("utf-8"))
            self.assertEqual(summary.artifact_format_version, "1.0")
            self.assertEqual(summary.document_count, 2)
            self.assertEqual(summary.chunk_count, 2)
            self.assertEqual(manifest["corpus"]["chunkCount"], 2)
            self.assertTrue((output / "retrieval" / "index.bin").is_file())
            self.assertTrue(any("2 document(s)" in line for line in progress))

    def test_accepts_explicit_relative_sources(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            docs = root / "docs"
            docs.mkdir()
            (docs / "included.md").write_text("Included.\n", "utf-8")
            (docs / "excluded.md").write_text("Excluded.\n", "utf-8")

            summary = build_documentation_artifacts(
                input_directory=docs,
                output_directory=root / "output",
                sources=("included.md",),
                ollama_base_url="http://host.docker.internal:11434",
                embedder=FixtureEmbedder(),
                progress=lambda _message: None,
            )

            self.assertEqual(summary.document_count, 1)
            self.assertEqual(summary.chunk_count, 1)

    def test_rejects_an_input_without_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "notes.txt").write_text("No Markdown.", "utf-8")

            with self.assertRaises(MarkdownIngestionError) as raised:
                _discover_markdown_sources(root)

        self.assertEqual(
            raised.exception.code,
            "configured_source_has_no_markdown",
        )


if __name__ == "__main__":
    unittest.main()
