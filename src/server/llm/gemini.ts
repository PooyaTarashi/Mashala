import "server-only";

import type { JsonValue } from "../../forms";
import type {
  LlmProvider,
  LlmProviderFailureCode,
  LlmProviderResult,
  StructuredLlmRequest,
} from "./provider";

const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface GeminiProviderConfig {
  readonly apiKey?: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface GeminiEnvironment {
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
}

export interface GeminiProviderEnvironmentOptions {
  readonly env?: GeminiEnvironment;
  readonly fetchImpl?: typeof fetch;
}

interface ValidGeminiConfig {
  readonly apiKey: string;
  readonly model: string;
}

function failure(
  code: LlmProviderFailureCode,
  message: string,
  retryable: boolean,
): LlmProviderResult {
  return {
    outcome: "failure",
    error: { code, message, retryable },
  };
}

function validateConfig(
  config: GeminiProviderConfig,
): ValidGeminiConfig | LlmProviderResult {
  if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
    return failure(
      "invalid_configuration",
      "Gemini provider is not configured: GEMINI_API_KEY is required.",
      false,
    );
  }

  if (typeof config.model !== "string" || config.model.trim() === "") {
    return failure(
      "invalid_configuration",
      "Gemini provider is not configured: GEMINI_MODEL is required.",
      false,
    );
  }

  const model = config.model.trim();

  if (!GEMINI_MODEL_NAME.test(model)) {
    return failure(
      "invalid_configuration",
      "Gemini provider configuration is invalid: GEMINI_MODEL must be a model name without a path.",
      false,
    );
  }

  return { apiKey: config.apiKey.trim(), model };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function structuredText(payload: unknown): string | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) {
    return undefined;
  }

  const firstCandidate: unknown = payload.candidates[0];

  if (!isRecord(firstCandidate) || !isRecord(firstCandidate.content)) {
    return undefined;
  }

  const { parts } = firstCandidate.content;

  if (!Array.isArray(parts) || parts.length === 0) {
    return undefined;
  }

  const textParts: string[] = [];

  for (const part of parts) {
    if (!isRecord(part) || typeof part.text !== "string") {
      return undefined;
    }

    textParts.push(part.text);
  }

  const text = textParts.join("");
  return text.trim() === "" ? undefined : text;
}

function parseStructuredOutput(payload: unknown): LlmProviderResult {
  const text = structuredText(payload);

  if (text === undefined) {
    return failure(
      "invalid_response",
      "The LLM provider returned an unusable structured response.",
      false,
    );
  }

  try {
    const output: unknown = JSON.parse(text);

    if (!isJsonValue(output)) {
      return failure(
        "invalid_response",
        "The LLM provider returned an unusable structured response.",
        false,
      );
    }

    return { outcome: "success", output };
  } catch {
    return failure(
      "invalid_response",
      "The LLM provider returned an unusable structured response.",
      false,
    );
  }
}

function requestBody(request: StructuredLlmRequest): string {
  return JSON.stringify({
    systemInstruction: {
      parts: [{ text: request.instructions }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: request.input }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: request.outputSchema,
    },
  });
}

/** Creates the server-only Gemini generateContent REST adapter. */
export function createGeminiProvider(
  config: GeminiProviderConfig,
): LlmProvider {
  const fetchImpl = config.fetchImpl ?? fetch;

  return Object.freeze({
    async generateStructured(
      request: StructuredLlmRequest,
    ): Promise<LlmProviderResult> {
      const validatedConfig = validateConfig(config);

      if ("outcome" in validatedConfig) {
        return validatedConfig;
      }

      const endpoint =
        `${GEMINI_API_ORIGIN}/v1beta/models/` +
        `${validatedConfig.model}:generateContent`;

      let response: Response;

      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": validatedConfig.apiKey,
          },
          body: requestBody(request),
        });
      } catch {
        return failure(
          "provider_failure",
          "The LLM provider request failed.",
          true,
        );
      }

      if (!response.ok) {
        return failure(
          "provider_failure",
          "The LLM provider returned an unsuccessful response.",
          response.status === 429 || response.status >= 500,
        );
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        return failure(
          "invalid_response",
          "The LLM provider returned an unusable structured response.",
          false,
        );
      }

      return parseStructuredOutput(payload);
    },
  });
}

/** Reads only Gemini provider configuration from the server environment. */
export function createGeminiProviderFromEnv({
  env,
  fetchImpl,
}: GeminiProviderEnvironmentOptions = {}): LlmProvider {
  const providerEnvironment = env ?? {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  };

  return createGeminiProvider({
    apiKey: providerEnvironment.GEMINI_API_KEY,
    model: providerEnvironment.GEMINI_MODEL,
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  });
}
