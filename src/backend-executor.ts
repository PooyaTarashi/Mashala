"use client";

import {
  assertBackendOperation,
  type BackendOperation,
  type JsonValue,
} from "./spec";

export type { BackendOperation } from "./spec";

export interface ExecuteBackendOperationInput {
  readonly baseUrl: string | URL;
  readonly operation: BackendOperation;
  readonly value: Readonly<Record<string, JsonValue>>;
  readonly fetchImpl?: typeof fetch;
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

function targetBaseUrl(value: string | URL): URL {
  let baseUrl: URL;

  try {
    baseUrl = new URL(value.toString());
  } catch {
    throw new TypeError(
      "Invalid target backend base URL: expected an absolute HTTP(S) URL.",
    );
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new TypeError(
      "Invalid target backend base URL: expected an absolute HTTP(S) URL.",
    );
  }

  if (baseUrl.username !== "" || baseUrl.password !== "") {
    throw new TypeError(
      "Invalid target backend base URL: embedded credentials are not allowed.",
    );
  }

  return baseUrl;
}

function targetUrl(baseUrl: URL, path: string): URL {
  const resolvedUrl = new URL(path, baseUrl);

  if (resolvedUrl.origin !== baseUrl.origin) {
    throw new TypeError(
      "Invalid backend operation: path must resolve within the supplied target backend origin.",
    );
  }

  return resolvedUrl;
}

/**
 * Executes one already validated JSON form value directly against a declared
 * target-backend operation. Confirmation, authentication integration, and
 * form validation are intentionally outside this executor.
 */
export async function executeBackendOperation({
  baseUrl: baseUrlInput,
  operation: operationInput,
  value,
  fetchImpl = fetch,
}: ExecuteBackendOperationInput): Promise<BackendOperationResult> {
  assertBackendOperation(operationInput);

  const baseUrl = targetBaseUrl(baseUrlInput);
  const url = targetUrl(baseUrl, operationInput.path);

  try {
    const response = await fetchImpl(url.href, {
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
