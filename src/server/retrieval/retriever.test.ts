import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createFakeDocumentationRetriever } from "./fake-retriever";
import type {
  DocumentationRetriever,
  RetrievalRequest,
  RetrievalResult,
  RetrievedChunk,
} from "./retriever";

const request: RetrievalRequest = {
  query: "How do transfers work?",
  topK: 3,
};

const result: RetrievalResult = {
  outcome: "success",
  chunks: [
    {
      id: "chunk:transfers",
      content: "Review and confirm a transfer before submission.",
      provenance: {
        sourceId: "source:transfer-guide",
        sourceUri: "docs/transfers.md",
        headingPath: ["Transfers", "Confirmation"],
      },
      score: 0.93,
    },
  ],
};

async function retrieveWith(
  retriever: DocumentationRetriever,
): Promise<RetrievalResult> {
  return retriever.retrieve(request);
}

describe("documentation retrieval boundary", () => {
  it("can replace the service client with the provided fake", async () => {
    const handler = vi.fn().mockResolvedValue(result);
    const retriever = createFakeDocumentationRetriever(handler);

    await expect(retrieveWith(retriever)).resolves.toEqual(result);
    expect(handler).toHaveBeenCalledWith(request);
  });

  it("offers an empty successful fake by default", async () => {
    const retriever = createFakeDocumentationRetriever();

    await expect(retriever.retrieve({ query: "anything" })).resolves.toEqual({
      outcome: "success",
      chunks: [],
    });
  });

  it("contains no transport, target-backend, or FAISS concepts", () => {
    expect(Object.keys(request)).toEqual(["query", "topK"]);
    expectTypeOf<keyof RetrievalRequest>().toEqualTypeOf<"query" | "topK">();
    expectTypeOf<keyof RetrievedChunk>().toEqualTypeOf<
      "id" | "content" | "provenance" | "score"
    >();
  });
});

if (false) {
  const retriever = {} as DocumentationRetriever;

  void retriever.retrieve({
    ...request,
    // @ts-expect-error Target-backend operations are not retrieval input.
    operation: { method: "POST", path: "/transfers" },
  });

  void retriever.retrieve({
    ...request,
    // @ts-expect-error Target-backend credentials are not retrieval input.
    credentials: "target-backend-secret",
  });

  void retriever.retrieve({
    ...request,
    // @ts-expect-error FAISS search configuration is not retrieval input.
    faissIndexType: "IndexFlatIP",
  });
}
