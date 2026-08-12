import type { JsonObject } from "../../forms";

/** The complete input accepted by Mashala documentation retrieval. */
export interface RetrievalRequest {
  readonly query: string;
  readonly topK?: number;
}

/** Source information retained independently of the retrieval implementation. */
export interface RetrievalProvenance {
  readonly sourceId: string;
  readonly sourceUri: string;
  readonly sourceTitle?: string;
  readonly sourceDigest?: string;
  readonly headingPath?: readonly string[];
  readonly startLine?: number;
  readonly endLine?: number;
  readonly metadata?: JsonObject;
}

/** One normalized documentation chunk returned to the Mashala runtime. */
export interface RetrievedChunk {
  readonly id: string;
  readonly content: string;
  readonly provenance: RetrievalProvenance;
  readonly score: number;
}

export type RetrievalFailureCode =
  | "invalid_configuration"
  | "invalid_request"
  | "service_failure"
  | "unavailable"
  | "timeout"
  | "invalid_response";

export interface RetrievalFailure {
  readonly code: RetrievalFailureCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type RetrievalResult =
  | {
      readonly outcome: "success";
      readonly chunks: readonly RetrievedChunk[];
    }
  | {
      readonly outcome: "failure";
      readonly error: RetrievalFailure;
    };

/** Provider- and retrieval-implementation-neutral documentation retrieval. */
export interface DocumentationRetriever {
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
}
