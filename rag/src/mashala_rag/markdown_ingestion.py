"""Deterministic Markdown loading, normalization, and v0.1 chunking.

The ingestion boundary accepts only configured Markdown files or directories
under one documentation root. It produces ISSUE-041 ``ArtifactChunk`` records;
embedding and retrieval-index construction deliberately remain separate.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Sequence

from .artifact_contract import ArtifactChunk, ChunkProvenance


DEFAULT_MAX_CHUNK_CHARACTERS = 1_600
CHUNKING_STRATEGY_VERSION = "markdown-blocks-v1"

_ATX_HEADING = re.compile(r"^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$")
_ATX_CLOSING = re.compile(r"[ \t]+#+[ \t]*$")
_SETEXT_HEADING = re.compile(r"^ {0,3}(=+|-+)[ \t]*$")
_FENCE_OPENING = re.compile(r"^ {0,3}(`{3,}|~{3,})")


class MarkdownIngestionError(ValueError):
    """A clear, stable failure while resolving or reading configured docs."""

    def __init__(self, code: str, source: str, detail: str) -> None:
        self.code = code
        self.source = source
        self.detail = detail
        super().__init__(f"{code} for {source!r}: {detail}")


@dataclass(frozen=True, slots=True)
class MarkdownDocument:
    """One normalized configured Markdown document."""

    source_id: str
    source_uri: str
    source_digest: str
    content: str
    source_title: str | None


@dataclass(frozen=True, slots=True)
class _Heading:
    line_index: int
    level: int
    title: str


def normalize_markdown(content: str) -> str:
    """Return the canonical text used for digesting and chunking.

    Normalization converts CRLF/CR to LF, applies Unicode NFC, removes trailing
    spaces and tabs, removes a UTF-8 BOM if present, removes trailing blank
    lines, and gives non-empty documents exactly one final LF.
    """

    if content.startswith("\ufeff"):
        content = content[1:]
    content = unicodedata.normalize(
        "NFC", content.replace("\r\n", "\n").replace("\r", "\n")
    )
    lines = [line.rstrip(" \t") for line in content.split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def load_markdown_documents(
    *,
    root: Path,
    sources: Sequence[str],
) -> list[MarkdownDocument]:
    """Load configured files/directories in stable source-URI order.

    Source entries are normalized relative POSIX paths below ``root``. A file
    must end in ``.md``; a directory is searched recursively for Markdown files.
    Overlapping entries that select the same file are rejected.
    """

    root_path = _resolve_root(root)
    configured_sources = _validate_sources(sources)
    selected: dict[str, tuple[Path, str]] = {}

    for configured_source in configured_sources:
        configured_path = _configured_path(root_path, configured_source)
        resolved = _resolve_configured_source(configured_path, configured_source)
        _require_below_root(resolved, root_path, configured_source)

        if resolved.is_file():
            if resolved.suffix.lower() != ".md":
                _fail(
                    "invalid_document_source",
                    configured_source,
                    "configured files must use the .md extension",
                )
            discovered = [resolved]
        elif resolved.is_dir():
            discovered = _discover_directory(resolved, configured_source)
            if not discovered:
                _fail(
                    "configured_source_has_no_markdown",
                    configured_source,
                    "configured directory contains no Markdown files",
                )
        else:
            _fail(
                "invalid_document_source",
                configured_source,
                "configured source is not a regular file or directory",
            )

        for document_path in discovered:
            canonical_path = _resolve_configured_source(
                document_path, configured_source
            )
            _require_below_root(canonical_path, root_path, configured_source)
            source_uri = canonical_path.relative_to(root_path).as_posix()
            if source_uri in selected:
                previous = selected[source_uri][1]
                _fail(
                    "duplicate_document_source",
                    configured_source,
                    f"document {source_uri!r} was already selected by {previous!r}",
                )
            selected[source_uri] = (canonical_path, configured_source)

    documents = [
        _read_document(path, source_uri)
        for source_uri, (path, _) in sorted(selected.items())
    ]
    return documents


def chunk_markdown_documents(
    documents: Sequence[MarkdownDocument],
    *,
    max_chunk_characters: int = DEFAULT_MAX_CHUNK_CHARACTERS,
) -> list[ArtifactChunk]:
    """Chunk normalized documents by heading section and Markdown block.

    Chunks never cross a recognized heading boundary. Within a section,
    blank-line-delimited blocks are greedily packed up to the configured target;
    fenced code blocks stay intact, and an indivisible oversized block is kept as
    one chunk. Source and chunk order are retained.
    """

    if (
        isinstance(max_chunk_characters, bool)
        or not isinstance(max_chunk_characters, int)
        or max_chunk_characters <= 0
    ):
        _fail(
            "invalid_chunking_configuration",
            "max_chunk_characters",
            "expected a positive integer",
        )

    chunks: list[ArtifactChunk] = []
    for document in documents:
        lines = document.content.removesuffix("\n").split("\n")
        headings = _find_headings(lines)
        heading_paths = _section_heading_paths(headings)
        boundaries = [heading.line_index for heading in headings]
        section_starts = ([0] if not boundaries or boundaries[0] != 0 else []) + boundaries
        section_starts = sorted(set(section_starts))

        chunk_ordinal = 0
        for section_index, section_start in enumerate(section_starts):
            section_end = (
                section_starts[section_index + 1] - 1
                if section_index + 1 < len(section_starts)
                else len(lines) - 1
            )
            heading_path = heading_paths.get(section_start, ())
            for start, end in _pack_section_blocks(
                lines,
                section_start,
                section_end,
                max_chunk_characters,
            ):
                content = "\n".join(lines[start : end + 1])
                provenance: ChunkProvenance = {
                    "sourceId": document.source_id,
                    "sourceUri": document.source_uri,
                    "sourceDigest": document.source_digest,
                    "startLine": start + 1,
                    "endLine": end + 1,
                }
                if document.source_title is not None:
                    provenance["sourceTitle"] = document.source_title
                if heading_path:
                    provenance["headingPath"] = list(heading_path)

                chunks.append(
                    {
                        "chunkId": _chunk_id(
                            document=document,
                            content=content,
                            heading_path=heading_path,
                            start_line=start + 1,
                            end_line=end + 1,
                            chunk_ordinal=chunk_ordinal,
                            max_chunk_characters=max_chunk_characters,
                        ),
                        "content": content,
                        "provenance": provenance,
                    }
                )
                chunk_ordinal += 1

    return chunks


def ingest_markdown(
    *,
    root: Path,
    sources: Sequence[str],
    max_chunk_characters: int = DEFAULT_MAX_CHUNK_CHARACTERS,
) -> list[ArtifactChunk]:
    """Load, normalize, and deterministically chunk configured Markdown."""

    return chunk_markdown_documents(
        load_markdown_documents(root=root, sources=sources),
        max_chunk_characters=max_chunk_characters,
    )


def _resolve_root(root: Path) -> Path:
    try:
        resolved = Path(root).resolve(strict=True)
    except (OSError, RuntimeError) as error:
        _fail("source_unavailable", str(root), "documentation root is unavailable", error)
    try:
        is_directory = resolved.is_dir()
    except OSError as error:
        _fail("source_unreadable", str(root), "cannot inspect documentation root", error)
    if not is_directory:
        _fail("invalid_document_source", str(root), "documentation root must be a directory")
    return resolved


def _validate_sources(sources: Sequence[str]) -> tuple[str, ...]:
    if isinstance(sources, (str, bytes)) or not sources:
        _fail(
            "invalid_document_source",
            "sources",
            "expected at least one configured relative path",
        )
    validated: list[str] = []
    for source in sources:
        if not isinstance(source, str) or not source:
            _fail(
                "invalid_document_source",
                "sources",
                "every configured source must be a non-empty string",
            )
        parsed = PurePosixPath(source)
        if (
            "\\" in source
            or parsed.is_absolute()
            or source != parsed.as_posix()
            or any(part in {"", ".", ".."} for part in parsed.parts)
        ):
            _fail(
                "invalid_document_source",
                source,
                "expected a normalized relative POSIX path below the documentation root",
            )
        validated.append(source)
    return tuple(validated)


def _configured_path(root: Path, source: str) -> Path:
    return root.joinpath(*PurePosixPath(source).parts)


def _resolve_configured_source(path: Path, source: str) -> Path:
    try:
        return path.resolve(strict=True)
    except FileNotFoundError as error:
        _fail("source_unavailable", source, "configured source does not exist", error)
    except (OSError, RuntimeError) as error:
        _fail("source_unreadable", source, "cannot resolve configured source", error)


def _require_below_root(path: Path, root: Path, source: str) -> None:
    try:
        path.relative_to(root)
    except ValueError as error:
        _fail(
            "invalid_document_source",
            source,
            "configured source resolves outside the documentation root",
            error,
        )


def _discover_directory(directory: Path, source: str) -> list[Path]:
    discovered: list[Path] = []

    def traversal_error(error: OSError) -> None:
        raise error

    try:
        for current, directory_names, file_names in os.walk(
            directory,
            topdown=True,
            onerror=traversal_error,
            followlinks=False,
        ):
            directory_names.sort()
            for file_name in sorted(file_names):
                path = Path(current, file_name)
                if path.suffix.lower() == ".md":
                    discovered.append(path)
    except OSError as error:
        _fail("source_unreadable", source, "cannot enumerate configured directory", error)
    return discovered


def _read_document(path: Path, source_uri: str) -> MarkdownDocument:
    try:
        raw = path.read_bytes()
    except FileNotFoundError as error:
        _fail("source_unavailable", source_uri, "configured document disappeared", error)
    except OSError as error:
        _fail("source_unreadable", source_uri, "cannot read configured document", error)
    try:
        decoded = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        _fail("malformed_markdown", source_uri, "document is not valid UTF-8", error)
    if "\x00" in decoded:
        _fail("malformed_markdown", source_uri, "document contains a NUL character")

    content = normalize_markdown(decoded)
    if not content.strip():
        _fail("malformed_markdown", source_uri, "document is empty after normalization")
    digest = "sha256:" + hashlib.sha256(content.encode("utf-8")).hexdigest()
    headings = _find_headings(content.removesuffix("\n").split("\n"))
    title = next(
        (heading.title for heading in headings if heading.level == 1),
        None,
    )
    source_id_digest = hashlib.sha256(source_uri.encode("utf-8")).hexdigest()
    return MarkdownDocument(
        source_id=f"source:sha256:{source_id_digest}",
        source_uri=source_uri,
        source_digest=digest,
        content=content,
        source_title=title,
    )


def _find_headings(lines: Sequence[str]) -> list[_Heading]:
    fenced = _fenced_line_mask(lines)
    headings: list[_Heading] = []
    for index, line in enumerate(lines):
        if fenced[index]:
            continue
        atx = _ATX_HEADING.fullmatch(line)
        if atx is not None:
            title = _ATX_CLOSING.sub("", atx.group(2) or "").strip()
            if title:
                headings.append(_Heading(index, len(atx.group(1)), title))
            continue
        if index + 1 >= len(lines) or fenced[index + 1] or not line.strip():
            continue
        setext = _SETEXT_HEADING.fullmatch(lines[index + 1])
        if setext is not None:
            headings.append(
                _Heading(index, 1 if setext.group(1).startswith("=") else 2, line.strip())
            )
    return headings


def _fenced_line_mask(lines: Sequence[str]) -> list[bool]:
    result: list[bool] = []
    active: tuple[str, int] | None = None
    for line in lines:
        if active is None:
            opening = _FENCE_OPENING.match(line)
            if opening is None:
                result.append(False)
                continue
            marker = opening.group(1)
            active = (marker[0], len(marker))
            result.append(True)
            continue

        result.append(True)
        character, minimum_length = active
        stripped = line.lstrip(" ")
        indentation = len(line) - len(stripped)
        if indentation <= 3 and re.fullmatch(
            re.escape(character) + "{" + str(minimum_length) + r",}[ \t]*",
            stripped,
        ):
            active = None
    return result


def _section_heading_paths(headings: Sequence[_Heading]) -> dict[int, tuple[str, ...]]:
    paths: dict[int, tuple[str, ...]] = {}
    stack: list[str] = []
    for heading in headings:
        stack = stack[: heading.level - 1]
        stack.append(heading.title)
        paths[heading.line_index] = tuple(stack)
    return paths


def _pack_section_blocks(
    lines: Sequence[str],
    section_start: int,
    section_end: int,
    max_chunk_characters: int,
) -> list[tuple[int, int]]:
    blocks = _section_blocks(lines, section_start, section_end)
    if not blocks:
        return []

    packed: list[tuple[int, int]] = []
    chunk_start, chunk_end = blocks[0]
    for block_start, block_end in blocks[1:]:
        candidate = "\n".join(lines[chunk_start : block_end + 1])
        if len(candidate) <= max_chunk_characters:
            chunk_end = block_end
            continue
        packed.append((chunk_start, chunk_end))
        chunk_start, chunk_end = block_start, block_end
    packed.append((chunk_start, chunk_end))
    return packed


def _section_blocks(
    lines: Sequence[str], section_start: int, section_end: int
) -> list[tuple[int, int]]:
    blocks: list[tuple[int, int]] = []
    block_start: int | None = None
    active_fence: tuple[str, int] | None = None

    for index in range(section_start, section_end + 1):
        line = lines[index]
        if active_fence is None and not line.strip():
            if block_start is not None:
                blocks.append((block_start, index - 1))
                block_start = None
            continue

        if block_start is None:
            block_start = index

        if active_fence is None:
            opening = _FENCE_OPENING.match(line)
            if opening is not None:
                marker = opening.group(1)
                active_fence = (marker[0], len(marker))
            continue

        character, minimum_length = active_fence
        stripped = line.lstrip(" ")
        indentation = len(line) - len(stripped)
        if indentation <= 3 and re.fullmatch(
            re.escape(character) + "{" + str(minimum_length) + r",}[ \t]*",
            stripped,
        ):
            active_fence = None

    if block_start is not None:
        blocks.append((block_start, section_end))
    return blocks


def _chunk_id(
    *,
    document: MarkdownDocument,
    content: str,
    heading_path: tuple[str, ...],
    start_line: int,
    end_line: int,
    chunk_ordinal: int,
    max_chunk_characters: int,
) -> str:
    identity = {
        "chunkOrdinal": chunk_ordinal,
        "content": content,
        "endLine": end_line,
        "headingPath": heading_path,
        "maxChunkCharacters": max_chunk_characters,
        "sourceDigest": document.source_digest,
        "sourceId": document.source_id,
        "sourceUri": document.source_uri,
        "startLine": start_line,
        "strategy": CHUNKING_STRATEGY_VERSION,
    }
    canonical = json.dumps(
        identity,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return "chunk:sha256:" + hashlib.sha256(canonical).hexdigest()


def _fail(
    code: str,
    source: str,
    detail: str,
    cause: BaseException | None = None,
) -> None:
    error = MarkdownIngestionError(code, source, detail)
    if cause is None:
        raise error
    raise error from cause
