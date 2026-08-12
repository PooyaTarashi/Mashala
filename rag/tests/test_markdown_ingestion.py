from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mashala_rag.markdown_ingestion import (  # noqa: E402
    MarkdownIngestionError,
    chunk_markdown_documents,
    ingest_markdown,
    load_markdown_documents,
    normalize_markdown,
)


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "markdown"
SHA256_ID = re.compile(r"^(?:source|chunk):sha256:[0-9a-f]{64}$")
SHA256_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")


class MarkdownIngestionTests(unittest.TestCase):
    def test_loads_and_normalizes_one_configured_file(self) -> None:
        documents = load_markdown_documents(
            root=FIXTURE_ROOT,
            sources=("accounts.md",),
        )

        self.assertEqual(len(documents), 1)
        document = documents[0]
        self.assertEqual(document.source_uri, "accounts.md")
        self.assertEqual(document.source_title, "Account guide")
        self.assertTrue(SHA256_ID.fullmatch(document.source_id))
        self.assertTrue(SHA256_DIGEST.fullmatch(document.source_digest))
        self.assertTrue(document.content.startswith("# Account guide\n\n"))
        self.assertTrue(document.content.endswith("monthly downloads.\n"))

    def test_loads_multiple_files_from_explicit_file_and_directory(self) -> None:
        documents = load_markdown_documents(
            root=FIXTURE_ROOT,
            sources=("guides", "accounts.md"),
        )

        self.assertEqual(
            [document.source_uri for document in documents],
            ["accounts.md", "guides/transfers.md"],
        )

    def test_normalization_is_deterministic(self) -> None:
        decomposed = "\ufeff# Cafe\u0301  \r\n\r\nBody\t\r\n\r\n"
        canonical = "# Caf\u00e9\n\nBody\n"

        self.assertEqual(normalize_markdown(decomposed), canonical)
        self.assertEqual(normalize_markdown(canonical), canonical)
        self.assertEqual(
            normalize_markdown(normalize_markdown(decomposed)),
            canonical,
        )

    def test_chunking_is_deterministic_and_retains_order_and_headings(self) -> None:
        documents = load_markdown_documents(
            root=FIXTURE_ROOT,
            sources=("accounts.md",),
        )

        first = chunk_markdown_documents(
            documents,
            max_chunk_characters=90,
        )
        second = chunk_markdown_documents(
            documents,
            max_chunk_characters=90,
        )

        self.assertEqual(first, second)
        self.assertGreater(len(first), 3)
        self.assertEqual(
            [chunk["provenance"].get("headingPath") for chunk in first],
            [
                ["Account guide"],
                ["Account guide", "Balances"],
                ["Account guide", "Balances"],
                ["Account guide", "Statements"],
            ],
        )
        self.assertEqual(
            [chunk["provenance"]["startLine"] for chunk in first],
            sorted(chunk["provenance"]["startLine"] for chunk in first),
        )
        self.assertTrue(all(SHA256_ID.fullmatch(chunk["chunkId"]) for chunk in first))
        self.assertEqual(len({chunk["chunkId"] for chunk in first}), len(first))

    def test_ingestion_produces_issue_041_chunks_with_stable_provenance(self) -> None:
        first = ingest_markdown(
            root=FIXTURE_ROOT,
            sources=("accounts.md", "guides"),
            max_chunk_characters=120,
        )
        second = ingest_markdown(
            root=FIXTURE_ROOT,
            sources=("accounts.md", "guides"),
            max_chunk_characters=120,
        )

        self.assertEqual(first, second)
        self.assertEqual(
            {chunk["provenance"]["sourceUri"] for chunk in first},
            {"accounts.md", "guides/transfers.md"},
        )
        for chunk in first:
            provenance = chunk["provenance"]
            self.assertEqual(provenance["sourceId"].split(":", 1)[0], "source")
            self.assertTrue(SHA256_DIGEST.fullmatch(provenance["sourceDigest"]))
            self.assertLessEqual(provenance["startLine"], provenance["endLine"])
            self.assertTrue(chunk["content"])

        code_chunk = next(
            chunk for chunk in first if "# This is code, not a heading" in chunk["content"]
        )
        self.assertEqual(
            code_chunk["provenance"]["headingPath"],
            ["Transfer guide", "Confirmation"],
        )

    def test_equivalent_normalized_input_produces_equivalent_chunks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            path = root / "guide.md"
            path.write_bytes(
                "\ufeff# Cafe\u0301  \r\n\r\nUse the guide.\t\r\n\r\n".encode("utf-8")
            )
            first = ingest_markdown(
                root=root,
                sources=("guide.md",),
                max_chunk_characters=80,
            )

            path.write_text("# Caf\u00e9\n\nUse the guide.\n", encoding="utf-8")
            second = ingest_markdown(
                root=root,
                sources=("guide.md",),
                max_chunk_characters=80,
            )

        self.assertEqual(first, second)

    def test_unavailable_malformed_and_unreadable_sources_fail_clearly(self) -> None:
        with self.assertRaises(MarkdownIngestionError) as unavailable:
            load_markdown_documents(
                root=FIXTURE_ROOT,
                sources=("missing.md",),
            )
        self.assertEqual(unavailable.exception.code, "source_unavailable")
        self.assertEqual(unavailable.exception.source, "missing.md")

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            malformed_path = root / "malformed.md"
            malformed_path.write_bytes(b"# Invalid\n\xff")
            with self.assertRaises(MarkdownIngestionError) as malformed:
                load_markdown_documents(root=root, sources=("malformed.md",))
            self.assertEqual(malformed.exception.code, "malformed_markdown")
            self.assertIn("valid UTF-8", malformed.exception.detail)

            readable_path = root / "unreadable.md"
            readable_path.write_text("# Unreadable\n", encoding="utf-8")
            with patch.object(
                Path,
                "read_bytes",
                side_effect=PermissionError("permission denied"),
            ):
                with self.assertRaises(MarkdownIngestionError) as unreadable:
                    load_markdown_documents(root=root, sources=("unreadable.md",))
            self.assertEqual(unreadable.exception.code, "source_unreadable")
            self.assertIn("cannot read", unreadable.exception.detail)

    def test_rejects_duplicate_or_escaping_configuration(self) -> None:
        with self.assertRaises(MarkdownIngestionError) as duplicate:
            load_markdown_documents(
                root=FIXTURE_ROOT,
                sources=("accounts.md", "accounts.md"),
            )
        self.assertEqual(duplicate.exception.code, "duplicate_document_source")

        with self.assertRaises(MarkdownIngestionError) as escaping:
            load_markdown_documents(
                root=FIXTURE_ROOT,
                sources=("../outside.md",),
            )
        self.assertEqual(escaping.exception.code, "invalid_document_source")


if __name__ == "__main__":
    unittest.main()
