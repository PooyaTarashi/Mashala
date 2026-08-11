"use client";

import {
  assertBackendOperation,
  type BackendOperation,
  type JsonValue,
} from "./spec";
import { resolveTargetBackendUrl } from "./target-backend-url";
import {
  requestTargetBackend,
  type TargetBackendRequest,
} from "./target-backend-request";

export type { BackendOperation } from "./spec";
export type { TargetBackendRequest } from "./target-backend-request";

export interface ExecuteBackendOperationInput {
  readonly baseUrl: string | URL;
  readonly operation: BackendOperation;
  readonly value: Readonly<Record<string, JsonValue>>;
  readonly request?: TargetBackendRequest;
}

export type BackendOperationResult =
  | {
      readonly outcome: "success";
      readonly response: Response;
    }
  | {
      readonly outcome: "http-error";
      readonly response: Response;
    }
  | {
      readonly outcome: "network-error";
    };

/**
 * Executes one already validated JSON form value directly against a declared
 * target-backend operation. Confirmation and form validation are outside this
 * executor; authenticated behavior comes from the target-app request hook.
 */
export async function executeBackendOperation({
  baseUrl: baseUrlInput,
  operation: operationInput,
  value,
  request,
}: ExecuteBackendOperationInput): Promise<BackendOperationResult> {
  assertBackendOperation(operationInput);

  const url = resolveTargetBackendUrl(
    baseUrlInput,
    operationInput.path,
    "Invalid backend operation: path must resolve within the supplied target backend origin.",
  );

  try {
    const response = await requestTargetBackend(request, url.href, {
      method: operationInput.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });

    if (response.ok) {
      return { outcome: "success", response };
    }

    return { outcome: "http-error", response };
  } catch {
    return { outcome: "network-error" };
  }
}
