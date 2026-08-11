"use client";

import type { TargetBackendRequest } from "../target-backend-request";

/**
 * Minimal demo integration for a target app whose existing session is held in
 * browser cookies. This is sample policy, not a Mashala authentication policy.
 */
export function createDemoCookieSessionRequest(
  browserFetch: TargetBackendRequest = fetch,
): TargetBackendRequest {
  return (input, init) =>
    browserFetch(input, {
      ...init,
      credentials: "include",
    });
}
