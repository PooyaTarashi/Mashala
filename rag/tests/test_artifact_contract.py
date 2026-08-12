from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from mashala_rag.artifact_contract import (  # noqa: E402
    ARTIFACT_FORMAT_VERSION,
    ArtifactValidationError,
    validate_artifact_manifest,
)


_A_DIGEST = "sha256:" + "a" * 64
_B_DIGEST = "sha256:" + "b" * 64


def valid_manifest() -> dict[str, object]:
    return {
        "artifactFormatVersion": ARTIFACT_FORMAT_VERSION,
        "embedding": {
            "provider": "ollama",
            "model": "nomic-embed-text:v1.5",
            "dimension": 768,
            "configuration": {
                "documentTaskPrefix": "search_document",
                "queryTaskPrefix": "search_query",
                "normalize": True,
            },
        },
        "corpus": {
            "chunkCount": 2,
            "chunks": [
                {
                    "chunkId": "chunk:account-help",
                    "content": "Use the Accounts page to review an account.",
                    "provenance": {
                        "sourceId": "account-guide",
                        "sourceUri": "docs/account-guide.md",
                        "sourceTitle": "Account guide",
                        "sourceDigest": _A_DIGEST,
                        "headingPath": ["Accounts", "Reviewing an account"],
                        "startLine": 12,
                        "endLine": 18,
                        "metadata": {"locale": "en", "audience": ["customer"]},
                    },
                },
                {
                    "chunkId": "chunk:transfer-help",
                    "content": "Transfers require an amount and destination.",
                    "provenance": {
                        "sourceId": "transfer-guide",
                        "sourceUri": "docs/transfer-guide.md",
                        "headingPath": ["Transfers"],
                    },
                },
            ],
        },
        "retrievalIndex": {
            "artifacts": [
                {
                    "path": "retrieval/index.bin",
                    "digest": _A_DIGEST,
                    "sizeBytes": 2048,
                },
                {
                    "path": "retrieval/index-support.bin",
                    "digest": _B_DIGEST,
                    "sizeBytes": 512,
                },
            ],
            "entries": [
                {"retrievalId": "0", "chunkId": "chunk:account-help"},
                {"retrievalId": "1", "chunkId": "chunk:transfer-help"},
            ],
        },
    }


class ArtifactContractTests(unittest.TestCase):
    def assert_error_code(
        self,
        expected_code: str,
        manifest: object,
        *,
        expected_embedding: object | None = None,
    ) -> ArtifactValidationError:
        with self.assertRaises(ArtifactValidationError) as raised:
            validate_artifact_manifest(
                manifest,
                expected_embedding=expected_embedding,
            )
        self.assertEqual(raised.exception.code, expected_code)
        return raised.exception

    def test_accepts_a_valid_manifest_with_any_number_of_index_artifacts(self) -> None:
        manifest = valid_manifest()

        validated = validate_artifact_manifest(
            manifest,
            expected_embedding=copy.deepcopy(manifest["embedding"]),
        )

        self.assertEqual(validated, manifest)
        self.assertIsNot(validated, manifest)
        self.assertEqual(len(validated["retrievalIndex"]["artifacts"]), 2)

    def test_rejects_an_unsupported_artifact_version_deterministically(self) -> None:
        manifest = valid_manifest()
        manifest["artifactFormatVersion"] = "2.0"

        error = self.assert_error_code(
            "unsupported_artifact_format_version",
            manifest,
        )

        self.assertEqual(error.path, "$.artifactFormatVersion")

    def test_rejects_missing_required_metadata(self) -> None:
        manifest = valid_manifest()
        del manifest["embedding"]["model"]

        error = self.assert_error_code("missing_required_metadata", manifest)

        self.assertEqual(error.path, "$.embedding")

    def test_detects_incompatible_embedding_configuration(self) -> None:
        manifest = valid_manifest()
        cases = [
            ("provider", "local-provider", "$.embedding.provider"),
            ("model", "another-model", "$.embedding.model"),
            ("dimension", 384, "$.embedding.dimension"),
            (
                "configuration",
                {
                    "documentTaskPrefix": "search_document",
                    "queryTaskPrefix": "search_query",
                    "normalize": False,
                },
                "$.embedding.configuration",
            ),
        ]

        for field, incompatible_value, expected_path in cases:
            with self.subTest(field):
                expected = copy.deepcopy(manifest["embedding"])
                expected[field] = incompatible_value
                error = self.assert_error_code(
                    "incompatible_embedding_configuration",
                    manifest,
                    expected_embedding=expected,
                )
                self.assertEqual(error.path, expected_path)

    def test_preserves_chunk_content_and_source_provenance(self) -> None:
        manifest = valid_manifest()

        validated = validate_artifact_manifest(manifest)
        first_chunk = validated["corpus"]["chunks"][0]

        self.assertEqual(first_chunk["chunkId"], "chunk:account-help")
        self.assertEqual(
            first_chunk["content"],
            "Use the Accounts page to review an account.",
        )
        self.assertEqual(
            first_chunk["provenance"],
            manifest["corpus"]["chunks"][0]["provenance"],
        )
        self.assertEqual(
            validated["retrievalIndex"]["entries"][0],
            {"retrievalId": "0", "chunkId": "chunk:account-help"},
        )

    def test_rejects_malformed_artifact_metadata(self) -> None:
        cases: list[tuple[str, object, str]] = []

        bad_digest = valid_manifest()
        bad_digest["retrievalIndex"]["artifacts"][0]["digest"] = "not-a-digest"
        cases.append(
            ("bad digest", bad_digest, "$.retrievalIndex.artifacts[0].digest")
        )

        bad_mapping = valid_manifest()
        bad_mapping["retrievalIndex"]["entries"][0]["chunkId"] = "chunk:missing"
        cases.append(
            (
                "unknown chunk mapping",
                bad_mapping,
                "$.retrievalIndex.entries[0].chunkId",
            )
        )

        bad_count = valid_manifest()
        bad_count["corpus"]["chunkCount"] = 3
        cases.append(("incorrect count", bad_count, "$.corpus.chunkCount"))

        bad_json = valid_manifest()
        bad_json["embedding"]["configuration"]["custom"] = {"not-json"}
        cases.append(
            (
                "non-JSON configuration",
                bad_json,
                "$.embedding.configuration.custom",
            )
        )

        for label, manifest, expected_path in cases:
            with self.subTest(label):
                error = self.assert_error_code(
                    "malformed_artifact_metadata",
                    manifest,
                )
                self.assertEqual(error.path, expected_path)


if __name__ == "__main__":
    unittest.main()
