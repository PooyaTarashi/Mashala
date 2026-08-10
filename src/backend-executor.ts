"use client";

import type { JsonValue } from "./forms";

export interface BackendOperation {
  readonly method: "POST" | "PUT" | "PATCH";
  readonly path: string;
}

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

const SUPPORTED_METHODS: readonly BackendOperation["method"][] = [
  "POST",
  "PUT",
  "PATCH",
];

function invalidOperation(message: string): never {
  throw new TypeError(`Invalid backend operation: ${message}`);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertBackendOperation(
  operation: unknown,
): asserts operation is BackendOperation {
  if (
    typeof operation !== "object" ||
    operation === null ||
    Array.isArray(operation)
  ) {
    invalidOperation("expected an object containing only method and path.");
  }

  const keys = Object.keys(operation);
  if (
    keys.length !== 2 ||
    !hasOwn(operation, "method") ||
    !hasOwn(operation, "path")
  ) {
    invalidOperation("expected an object containing only method and path.");
  }

  const method: unknown = Reflect.get(operation, "method");
  if (
    typeof method !== "string" ||
    !SUPPORTED_METHODS.some((supportedMethod) => supportedMethod === method)
  ) {
    invalidOperation("method must be POST, PUT, or PATCH.");
  }

  const path: unknown = Reflect.get(operation, "path");
  if (typeof path !== "string") {
    invalidOperation("path must be a string.");
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    invalidOperation('path must begin with exactly one "/".');
  }

  if (path.includes("?")) {
    invalidOperation("path must not contain a query string.");
  }

  if (path.includes("#")) {
    invalidOperation("path must not contain a fragment.");
  }
}

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
    return invalidOperation(
      "path must resolve within the supplied target backend origin.",
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
