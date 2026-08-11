"use client";

/**
 * Browser-side request behavior supplied by the target application.
 *
 * The function may use the target application's existing cookie, token, or
 * other browser session mechanism. Mashala invokes it but never serializes it
 * or requires access to the credential that the implementation may use.
 */
export interface TargetBackendRequest {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/** Uses the target-app integration when provided, otherwise browser fetch. */
export function requestTargetBackend(
  request: TargetBackendRequest | undefined,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return request === undefined ? fetch(input, init) : request(input, init);
}
