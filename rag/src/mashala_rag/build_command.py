"""Container-only command for producing deployable Mashala RAG artifacts."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Sequence

from .artifact_contract import ARTIFACT_FORMAT_VERSION
from .index_builder import ArtifactBuildError, DocumentEmbedder, build_rag_artifacts
from .markdown_ingestion import MarkdownIngestionError, ingest_markdown
from .ollama_embeddings import (
    DEFAULT_EMBEDDING_MODEL,
    OllamaEmbeddingClient,
    OllamaEmbeddingConfig,
    OllamaEmbeddingError,
)


@dataclass(frozen=True, slots=True)
class RagBuildSummary:
    artifact_format_version: str
    chunk_count: int
    document_count: int


def build_documentation_artifacts(
    *,
    input_directory: Path,
    output_directory: Path,
    sources: Sequence[str] = (),
    max_chunk_characters: int = 1_600,
    ollama_base_url: str,
    embedder: DocumentEmbedder | None = None,
    progress: Callable[[str], None] = print,
) -> RagBuildSummary:
    """Ingest configured docs and invoke the existing offline index builder."""

    selected_sources = tuple(sources) or _discover_markdown_sources(input_directory)
    progress(f"Loading Markdown from {input_directory}...")
    chunks = ingest_markdown(
        root=input_directory,
        sources=selected_sources,
        max_chunk_characters=max_chunk_characters,
    )
    document_count = len(
        {chunk["provenance"]["sourceId"] for chunk in chunks}
    )
    progress(
        f"Loaded {document_count} document(s) into {len(chunks)} chunk(s)."
    )

    document_embedder = embedder or OllamaEmbeddingClient(
        OllamaEmbeddingConfig(base_url=ollama_base_url)
    )
    progress(
        f"Embedding {len(chunks)} chunk(s) with {DEFAULT_EMBEDDING_MODEL}..."
    )
    build_rag_artifacts(
        chunks=chunks,
        output_directory=output_directory,
        embedder=document_embedder,
    )
    progress("Wrote manifest.json and opaque retrieval artifacts.")
    return RagBuildSummary(
        artifact_format_version=ARTIFACT_FORMAT_VERSION,
        chunk_count=len(chunks),
        document_count=document_count,
    )


def build_main(arguments: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(prog="mashala-rag-builder build")
    parser.add_argument("--input-directory", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    parser.add_argument("--source", action="append", default=[])
    parser.add_argument("--ollama-base-url", required=True)
    parser.add_argument("--max-chunk-characters", type=int, default=1_600)
    options = parser.parse_args(list(arguments))

    try:
        summary = build_documentation_artifacts(
            input_directory=options.input_directory,
            output_directory=options.output_directory,
            sources=options.source,
            max_chunk_characters=options.max_chunk_characters,
            ollama_base_url=options.ollama_base_url,
        )
    except (MarkdownIngestionError, OllamaEmbeddingError, ArtifactBuildError) as error:
        print(f"RAG builder failed: {error}", file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "artifactFormatVersion": summary.artifact_format_version,
                "chunkCount": summary.chunk_count,
                "documentCount": summary.document_count,
                "status": "ok",
            },
            sort_keys=True,
        )
    )
    return 0


def _discover_markdown_sources(root: Path) -> tuple[str, ...]:
    try:
        resolved_root = root.resolve(strict=True)
        if not resolved_root.is_dir():
            raise NotADirectoryError
    except (OSError, RuntimeError) as error:
        raise MarkdownIngestionError(
            "source_unavailable",
            str(root),
            "documentation root is unavailable",
        ) from error

    discovered: list[str] = []

    def traversal_error(error: OSError) -> None:
        raise error

    try:
        for current, directory_names, file_names in os.walk(
            resolved_root,
            topdown=True,
            onerror=traversal_error,
            followlinks=False,
        ):
            directory_names.sort()
            for file_name in sorted(file_names):
                candidate = Path(current, file_name)
                if candidate.suffix.lower() == ".md":
                    discovered.append(candidate.relative_to(resolved_root).as_posix())
    except OSError as error:
        raise MarkdownIngestionError(
            "source_unreadable",
            str(root),
            "cannot enumerate documentation root",
        ) from error

    if not discovered:
        raise MarkdownIngestionError(
            "configured_source_has_no_markdown",
            str(root),
            "documentation root contains no Markdown files",
        )
    return tuple(discovered)
