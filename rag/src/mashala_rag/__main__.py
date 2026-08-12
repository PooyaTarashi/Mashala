import json
import sys
from importlib.metadata import PackageNotFoundError, version

import faiss

from .build_command import build_main
from .artifact_loader import ArtifactLoadError
from .ollama_embeddings import OllamaEmbeddingError
from .retrieval_http import serve_main
from .retrieval_service import RetrievalServiceError


EXPECTED_DISTRIBUTIONS = {
    "faiss-cpu": "1.14.3",
    "numpy": "2.5.1",
    "packaging": "26.2",
}
EXPECTED_PYTHON = (3, 13, 14)


def installed_version(distribution: str) -> str:
    try:
        return version(distribution)
    except PackageNotFoundError as error:
        raise RuntimeError(f"Missing locked distribution: {distribution}") from error


def main(arguments: list[str] | None = None) -> int:
    command_arguments = sys.argv[1:] if arguments is None else arguments
    actual_python = sys.version_info[:3]
    actual_distributions = {
        distribution: installed_version(distribution)
        for distribution in EXPECTED_DISTRIBUTIONS
    }

    if actual_python != EXPECTED_PYTHON:
        raise RuntimeError(
            f"Expected Python {EXPECTED_PYTHON}, found {actual_python}"
        )

    if actual_distributions != EXPECTED_DISTRIBUTIONS:
        raise RuntimeError(
            "Installed distributions do not match the container lock: "
            f"{actual_distributions}"
        )

    if command_arguments:
        if command_arguments[0] == "build":
            return build_main(command_arguments[1:])
        if command_arguments[0] == "serve":
            try:
                return serve_main(command_arguments[1:])
            except (
                ArtifactLoadError,
                OllamaEmbeddingError,
                RetrievalServiceError,
                OSError,
            ) as error:
                print(f"RAG retrieval startup failed: {error}", file=sys.stderr)
                return 1
        print(
            f"Unknown RAG command: {command_arguments[0]}",
            file=sys.stderr,
        )
        return 2

    report = {
        "component": "mashala-rag",
        "faiss": faiss.__version__,
        "python": ".".join(str(part) for part in actual_python),
        "status": "ok",
    }
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
