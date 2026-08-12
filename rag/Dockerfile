FROM python:3.13.14-slim-bookworm@sha256:67a1e1f215ccda113cfc024e8639049257e88f273898f595b61476d128d387e8

LABEL org.opencontainers.image.title="Mashala RAG foundation"
LABEL org.opencontainers.image.description="Isolated Python and FAISS environment for future Mashala documentation retrieval"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/mashala/rag/src

WORKDIR /opt/mashala/rag

COPY requirements.lock ./requirements.lock
RUN python -m pip install \
      --disable-pip-version-check \
      --no-cache-dir \
      --no-deps \
      --only-binary=:all: \
      --require-hashes \
      --requirement requirements.lock

COPY src ./src
COPY tests ./tests

# Every image build proves that the locked distributions are installed and that
# the native FAISS module loads in this container. Contract tests use only the
# standard library and validate no index implementation details.
RUN python -m unittest discover -s tests -p "test_*.py"
RUN python -m mashala_rag

USER 65532:65532

ENTRYPOINT ["python", "-m", "mashala_rag"]
