import type { JsonSchema202012, JsonValue } from "../../forms";

/**
 * Provider-neutral input for one non-streaming structured model request.
 * The returned value is untrusted and must be validated by the caller.
 */
export interface StructuredLlmRequest {
  readonly instructions: string;
  readonly input: string;
  readonly outputSchema: JsonSchema202012;
}

export interface LlmProvider {
  generateStructured(
    request: StructuredLlmRequest,
  ): Promise<LlmProviderResult>;
}

export type LlmProviderFailureCode =
  | "invalid_configuration"
  | "provider_failure"
  | "invalid_response";

export interface LlmProviderFailure {
  readonly code: LlmProviderFailureCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type LlmProviderResult =
  | {
      readonly outcome: "success";
      /** Parsed provider output; still untrusted and caller-validated. */
      readonly output: JsonValue;
    }
  | {
      readonly outcome: "failure";
      readonly error: LlmProviderFailure;
    };
