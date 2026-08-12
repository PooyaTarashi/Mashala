import type {
  DocumentationRetriever,
  RetrievalRequest,
  RetrievalResult,
} from "./retriever";

export type FakeRetrievalHandler = (
  request: RetrievalRequest,
) => RetrievalResult | Promise<RetrievalResult>;

const EMPTY_RESULT: RetrievalResult = Object.freeze({
  outcome: "success",
  chunks: Object.freeze([]),
});

/** Creates a dependency-injectable retriever for Node runtime tests. */
export function createFakeDocumentationRetriever(
  response: RetrievalResult | FakeRetrievalHandler = EMPTY_RESULT,
): DocumentationRetriever {
  const handler: FakeRetrievalHandler =
    typeof response === "function" ? response : async () => response;

  return Object.freeze({
    async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
      return handler(request);
    },
  });
}
