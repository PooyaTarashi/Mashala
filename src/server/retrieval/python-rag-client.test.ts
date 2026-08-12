import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPythonRagRetriever } from "./python-rag-client";

const BASE_URL = "http://rag-service:8765";

const serviceResult = {
  results: [
    {
      chunkId: "chunk:account-help",
      content: "Use the Accounts page to review an account.",
      provenance: {
        sourceId: "account-guide",
        sourceUri: "docs/account-guide.md",
        sourceTitle: "Account guide",
        sourceDigest:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        headingPath: ["Accounts", "Reviewing an account"],
        startLine: 12,
        endLine: 18,
        metadata: { locale: "en", audience: ["customer"] },
      },
      score: 0.91,
    },
  ],
};

function successfulFetch(payload: unknown = serviceResult) {
  return vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Python RAG retrieval client", () => {
  it("calls only POST /retrieve with the ISSUE-046 request shape", async () => {
    const fetchImpl = successfulFetch();
    const retriever = createPythonRagRetriever({
      baseUrl: `${BASE_URL}/`,
      fetchImpl,
    });

    await retriever.retrieve({ query: "How do I review an account?", topK: 5 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/retrieve`);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "How do I review an account?",
        topK: 5,
      }),
      redirect: "error",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init).not.toHaveProperty("credentials");
  });

  it("normalizes chunks while preserving complete provenance and score", async () => {
    const retriever = createPythonRagRetriever({
      baseUrl: BASE_URL,
      fetchImpl: successfulFetch(),
    });

    const result = await retriever.retrieve({ query: "accounts", topK: 1 });

    expect(result).toEqual({
      outcome: "success",
      chunks: [
        {
          id: "chunk:account-help",
          content: "Use the Accounts page to review an account.",
          provenance: serviceResult.results[0]?.provenance,
          score: 0.91,
        },
      ],
    });
    expect(result).not.toHaveProperty("results");
    expect(result.outcome === "success" && result.chunks[0]).not.toHaveProperty(
      "chunkId",
    );
  });

  it.each([
    [400, false],
    [429, true],
    [503, true],
  ])(
    "normalizes HTTP %s service errors with retryable=%s",
    async (status, retryable) => {
      const privateDetail = "private Python service detail";
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          { error: { code: "ollama_unavailable", detail: privateDetail } },
          { status },
        ),
      );
      const retriever = createPythonRagRetriever({
        baseUrl: BASE_URL,
        fetchImpl,
      });

      const result = await retriever.retrieve({ query: "accounts" });

      expect(result).toEqual({
        outcome: "failure",
        error: {
          code: "service_failure",
          message:
            "The RAG retrieval service returned an unsuccessful response.",
          retryable,
        },
      });
      expect(JSON.stringify(result)).not.toContain(privateDetail);
      expect(JSON.stringify(result)).not.toContain("ollama_unavailable");
    },
  );

  it("normalizes network failure without leaking network details", async () => {
    const privateDetail = "connect ECONNREFUSED with internal hostname";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(privateDetail));
    const retriever = createPythonRagRetriever({
      baseUrl: BASE_URL,
      fetchImpl,
    });

    const result = await retriever.retrieve({ query: "accounts" });

    expect(result).toEqual({
      outcome: "failure",
      error: {
        code: "unavailable",
        message: "The RAG retrieval service request failed.",
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain(privateDetail);
  });

  it("aborts and normalizes a request that exceeds its timeout", async () => {
    vi.useFakeTimers();
    const targetBackendRequest = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const retriever = createPythonRagRetriever({
      baseUrl: BASE_URL,
      timeoutMs: 25,
      fetchImpl,
    });

    const resultPromise = retriever.retrieve({ query: "accounts" });
    await vi.advanceTimersByTimeAsync(25);

    await expect(resultPromise).resolves.toEqual({
      outcome: "failure",
      error: {
        code: "timeout",
        message: "The RAG retrieval request timed out.",
        retryable: true,
      },
    });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init?.signal?.aborted).toBe(true);
    expect(targetBackendRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["missing results", {}],
    ["results is not an array", { results: {} }],
    [
      "malformed score",
      {
        results: [
          {
            ...serviceResult.results[0],
            score: "0.91",
          },
        ],
      },
    ],
    [
      "malformed provenance",
      {
        results: [
          {
            ...serviceResult.results[0],
            provenance: { sourceId: "account-guide" },
          },
        ],
      },
    ],
    ["FAISS-native response field", { ...serviceResult, faissIndex: [] }],
  ])("rejects a malformed response with %s", async (_case, payload) => {
    const retriever = createPythonRagRetriever({
      baseUrl: BASE_URL,
      fetchImpl: successfulFetch(payload),
    });

    await expect(retriever.retrieve({ query: "accounts" })).resolves.toEqual({
      outcome: "failure",
      error: {
        code: "invalid_response",
        message: "The RAG retrieval service returned a malformed response.",
        retryable: false,
      },
    });
  });

  it("normalizes a non-JSON successful response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not JSON"));
    const retriever = createPythonRagRetriever({
      baseUrl: BASE_URL,
      fetchImpl,
    });

    await expect(retriever.retrieve({ query: "accounts" })).resolves.toMatchObject({
      outcome: "failure",
      error: { code: "invalid_response", retryable: false },
    });
  });

  it("fails invalid requests locally without contacting the service", async () => {
    const fetchImpl = successfulFetch();
    const retriever = createPythonRagRetriever({
      baseUrl: BASE_URL,
      fetchImpl,
    });

    await expect(
      retriever.retrieve({ query: " ", topK: 101 }),
    ).resolves.toMatchObject({
      outcome: "failure",
      error: { code: "invalid_request", retryable: false },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects service origins containing credentials", async () => {
    const fetchImpl = successfulFetch();
    const retriever = createPythonRagRetriever({
      baseUrl: "http://user:password@rag-service:8765",
      fetchImpl,
    });

    await expect(retriever.retrieve({ query: "accounts" })).resolves.toMatchObject({
      outcome: "failure",
      error: { code: "invalid_configuration", retryable: false },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not trigger target-backend behavior when retrieval fails", async () => {
    const targetBackendRequest = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: { code: "retrieval_failed" } }, { status: 500 }),
    );
    const retriever = createPythonRagRetriever({
      baseUrl: BASE_URL,
      fetchImpl,
    });

    await retriever.retrieve({ query: "accounts" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(targetBackendRequest).not.toHaveBeenCalled();
  });
});
