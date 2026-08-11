### ADR-014 — Containerized Python RAG with offline indexing


> Mashala's documentation-retrieval subsystem is implemented as isolated containerized Python components. Documentation indexing is an offline/build-time operation exposed to developers through `mashala rag build`. The builder produces versioned deployable RAG artifacts, allowing production to load prebuilt indexes without rebuilding the corpus. Runtime retrieval operates against those artifacts through a narrow service boundary. The initial implementation uses FAISS and local Ollama `nomic-embed-text` embeddings, but FAISS remains replaceable. The Node/Next.js Mashala runtime remains responsible for application workflow and LLM orchestration.

Important consequences:

* Docker is required for RAG tooling, not necessarily all Mashala usage.
* Developers don't manage Python dependencies.
* Python does not become the main Mashala runtime.
* indexing and runtime retrieval are distinct phases;
* artifacts can be built locally or in developer-selected CI;
* no external embedding API credential is required for v0.1;
* target-backend credentials never enter the RAG subsystem;
* retrieved documentation remains untrusted model context.