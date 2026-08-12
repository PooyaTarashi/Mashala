import json
import sys
from importlib.metadata import PackageNotFoundError, version

import faiss


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


def main() -> int:
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

