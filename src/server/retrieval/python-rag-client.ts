import "server-only";

import type { JsonObject, JsonValue } from "../../forms";
import type {
  DocumentationRetriever,
  RetrievalFailureCode,
  RetrievalProvenance,
  RetrievalRequest,
  RetrievalResult,
  RetrievedChunk,
} from "./retriever";

export const DEFAULT_RAG_RETRIEVAL_TIMEOUT_MS = 65_000;

const MAX_QUERY_CHARACTERS = 16_000;
const MAX_TOP_K = 100;

export interface PythonRagRetrieverConfig {
  /** HTTP(S) origin of the ISSUE-046 retrieval service. */
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface ValidClientConfig {
  readonly endpoint: string;
  readonly timeoutMs: number;
}

const RESPONSE_KEYS = ["results"] as const;
const RESULT_KEYS = ["chunkId", "content", "provenance", "score"] as const;
const PROVENANCE_KEYS = [
  "sourceId",
  "sourceUri",
  "sourceTitle",
  "sourceDigest",
  "headingPath",
  "startLine",
  "endLine",
  "metadata",
] as const;

function failure(
  code: RetrievalFailureCode,
  message: string,
  retryable: boolean,
): RetrievalResult {
  return Object.freeze({
    outcome: "failure",
    error: Object.freeze({ code, message, retryable }),
  });
}

function validateConfig(
  config: PythonRagRetrieverConfig,
): ValidClientConfig | RetrievalResult {
  const timeoutMs = config.timeoutMs ?? DEFAULT_RAG_RETRIEVAL_TIMEOUT_MS;

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return failure(
      "invalid_configuration",
      "The RAG retrieval client timeout must be a positive integer in milliseconds.",
      false,
    );
  }

  let baseUrl: URL;

  try {
    baseUrl = new URL(config.baseUrl);
  } catch {
    return failure(
      "invalid_configuration",
      "The RAG retrieval client requires a valid HTTP(S) service origin.",
      false,
    );
  }

  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    (baseUrl.pathname !== "" && baseUrl.pathname !== "/") ||
    baseUrl.search !== "" ||
    baseUrl.hash !== ""
  ) {
    return failure(
      "invalid_configuration",
      "The RAG retrieval client requires a credential-free HTTP(S) service origin.",
      false,
    );
  }

  return {
    endpoint: new URL("/retrieve", baseUrl).toString(),
    timeoutMs,
  };
}

function validateRequest(request: RetrievalRequest): RetrievalResult | undefined {
  if (
    typeof request.query !== "string" ||
    request.query.trim() === "" ||
    request.query.length > MAX_QUERY_CHARACTERS
  ) {
    return failure(
      "invalid_request",
      `Retrieval query must be a non-empty string of at most ${MAX_QUERY_CHARACTERS} characters.`,
      false,
    );
  }

  if (
    request.topK !== undefined &&
    (!Number.isInteger(request.topK) ||
      request.topK < 1 ||
      request.topK > MAX_TOP_K)
  ) {
    return failure(
      "invalid_request",
      `Retrieval topK must be an integer from 1 through ${MAX_TOP_K}.`,
      false,
    );
  }

  return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): boolean {
  const keys = Object.keys(value);

  return (
    keys.every((key) => allowed.includes(key)) &&
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isPlainRecord(value) && Object.values(value).every(isJsonValue);
}

function freezeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeJsonValue));
  }

  if (isPlainRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          freezeJsonValue(item as JsonValue),
        ]),
      ),
    );
  }

  return value;
}

function normalizeProvenance(value: unknown): RetrievalProvenance | undefined {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, PROVENANCE_KEYS, ["sourceId", "sourceUri"]) ||
    !isNonEmptyString(value.sourceId) ||
    !isNonEmptyString(value.sourceUri)
  ) {
    return undefined;
  }

  if (
    (value.sourceTitle !== undefined &&
      !isNonEmptyString(value.sourceTitle)) ||
    (value.sourceDigest !== undefined &&
      !isNonEmptyString(value.sourceDigest)) ||
    (value.headingPath !== undefined &&
      (!Array.isArray(value.headingPath) ||
        !value.headingPath.every(isNonEmptyString))) ||
    (value.metadata !== undefined &&
      (!isPlainRecord(value.metadata) || !isJsonValue(value.metadata)))
  ) {
    return undefined;
  }

  const hasStartLine = value.startLine !== undefined;
  const hasEndLine = value.endLine !== undefined;

  if (
    hasStartLine !== hasEndLine ||
    (hasStartLine &&
      (!Number.isInteger(value.startLine) ||
        !Number.isInteger(value.endLine) ||
        (value.startLine as number) < 1 ||
        (value.endLine as number) < (value.startLine as number)))
  ) {
    return undefined;
  }

  return Object.freeze({
    sourceId: value.sourceId,
    sourceUri: value.sourceUri,
    ...(value.sourceTitle === undefined
      ? {}
      : { sourceTitle: value.sourceTitle }),
    ...(value.sourceDigest === undefined
      ? {}
      : { sourceDigest: value.sourceDigest }),
    ...(value.headingPath === undefined
      ? {}
      : { headingPath: Object.freeze([...value.headingPath]) }),
    ...(value.startLine === undefined
      ? {}
      : { startLine: value.startLine as number, endLine: value.endLine as number }),
    ...(value.metadata === undefined
      ? {}
      : { metadata: freezeJsonValue(value.metadata) as JsonObject }),
  });
}

function normalizeChunk(value: unknown): RetrievedChunk | undefined {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, RESULT_KEYS, RESULT_KEYS) ||
    !isNonEmptyString(value.chunkId) ||
    !isNonEmptyString(value.content) ||
    typeof value.score !== "number" ||
    !Number.isFinite(value.score)
  ) {
    return undefined;
  }

  const provenance = normalizeProvenance(value.provenance);

  if (provenance === undefined) {
    return undefined;
  }

  return Object.freeze({
    id: value.chunkId,
    content: value.content,
    provenance,
    score: value.score,
  });
}

function normalizeResponse(value: unknown): RetrievalResult {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, RESPONSE_KEYS, RESPONSE_KEYS) ||
    !Array.isArray(value.results)
  ) {
    return failure(
      "invalid_response",
      "The RAG retrieval service returned a malformed response.",
      false,
    );
  }

  const chunks: RetrievedChunk[] = [];
  const chunkIds = new Set<string>();

  for (const item of value.results) {
    const chunk = normalizeChunk(item);

    if (chunk === undefined || chunkIds.has(chunk.id)) {
      return failure(
        "invalid_response",
        "The RAG retrieval service returned a malformed response.",
        false,
      );
    }

    chunkIds.add(chunk.id);
    chunks.push(chunk);
  }

  return Object.freeze({
    outcome: "success",
    chunks: Object.freeze(chunks),
  });
}

/** Creates the server-only JSON/HTTP adapter for the ISSUE-046 service. */
export function createPythonRagRetriever(
  config: PythonRagRetrieverConfig,
): DocumentationRetriever {
  const validatedConfig = validateConfig(config);
  const fetchImpl = config.fetchImpl ?? fetch;

  return Object.freeze({
    async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
      if ("outcome" in validatedConfig) {
        return validatedConfig;
      }

      const invalidRequest = validateRequest(request);

      if (invalidRequest !== undefined) {
        return invalidRequest;
      }

      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, validatedConfig.timeoutMs);

      try {
        const response = await fetchImpl(validatedConfig.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: request.query,
            ...(request.topK === undefined ? {} : { topK: request.topK }),
          }),
          redirect: "error",
          signal: controller.signal,
        });

        if (!response.ok) {
          return failure(
            "service_failure",
            "The RAG retrieval service returned an unsuccessful response.",
            response.status === 429 || response.status >= 500,
          );
        }

        let payload: unknown;

        try {
          payload = await response.json();
        } catch {
          return timedOut
            ? failure(
                "timeout",
                "The RAG retrieval request timed out.",
                true,
              )
            : failure(
                "invalid_response",
                "The RAG retrieval service returned a malformed response.",
                false,
              );
        }

        return normalizeResponse(payload);
      } catch {
        return timedOut
          ? failure(
              "timeout",
              "The RAG retrieval request timed out.",
              true,
            )
          : failure(
              "unavailable",
              "The RAG retrieval service request failed.",
              true,
            );
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
