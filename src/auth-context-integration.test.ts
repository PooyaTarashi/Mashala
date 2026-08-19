import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  executeBackendOperation,
  type ExecuteBackendOperationInput,
} from "./backend-executor";
import { defineCapability } from "./capabilities";
import { createDemoCookieSessionRequest } from "./examples/demo-cookie-session-request";
import { f } from "./fields";
import type { ReferenceFieldMetadata } from "./forms";
import { resolveReferenceOptions } from "./reference-resolver";
import {
  validateBrowserToServerEvent,
  validateServerToBrowserEvent,
  type BrowserToServerEvent,
} from "./runtime-protocol";
import type { CapabilitySpec, MashalaSpec } from "./spec";
import type { TargetBackendRequest } from "./target-backend-request";

const DEMO_BACKEND_ORIGIN = "https://demo-target.example";

const accountField: ReferenceFieldMetadata = {
  kind: "reference",
  label: "From account",
  source: { method: "GET", path: "/accounts" },
  value: "id",
  labelFrom: "display_name",
};

function createMockTargetBackend() {
  return vi.fn<TargetBackendRequest>(async (input, init) => {
    const url = new URL(input.toString());

    if (url.origin !== DEMO_BACKEND_ORIGIN) {
      throw new Error("The browser request left the demo target origin.");
    }

    if (init?.credentials !== "include") {
      return Response.json(
        { error: "The target backend requires its existing browser session." },
        { status: 401 },
      );
    }

    if (url.pathname === "/accounts" && init.method === "GET") {
      return Response.json([
        { id: "acct_1", display_name: "Checking" },
        { id: "acct_2", display_name: "Savings" },
      ]);
    }

    if (url.pathname === "/transfers" && init.method === "POST") {
      return Response.json({ accepted: true }, { status: 201 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  });
}

function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeys(item, keys);
    }
    return keys;
  }

  if (typeof value !== "object" || value === null) {
    return keys;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    keys.add(key.toLowerCase().replace(/[^a-z0-9]/gu, ""));
    collectObjectKeys(nestedValue, keys);
  }

  return keys;
}

describe("target-app auth-context integration", () => {
  it("uses one injected browser request behavior for reference reads and writes", async () => {
    const mockTargetBackend = createMockTargetBackend();
    const request = createDemoCookieSessionRequest(mockTargetBackend);

    const referenceResult = await resolveReferenceOptions({
      baseUrl: DEMO_BACKEND_ORIGIN,
      field: accountField,
      request,
    });
    const writeResult = await executeBackendOperation({
      baseUrl: DEMO_BACKEND_ORIGIN,
      operation: { method: "POST", path: "/transfers" },
      value: { account: "acct_1", amount: 25 },
      request,
    });

    expect(referenceResult).toEqual({
      outcome: "success",
      options: [
        { value: "acct_1", label: "Checking" },
        { value: "acct_2", label: "Savings" },
      ],
    });
    expect(writeResult).toEqual({
      outcome: "success",
      response: expect.objectContaining({ status: 201 }),
    });
    expect(mockTargetBackend).toHaveBeenCalledTimes(2);
    expect(mockTargetBackend).toHaveBeenNthCalledWith(
      1,
      `${DEMO_BACKEND_ORIGIN}/accounts`,
      { method: "GET", credentials: "include" },
    );
    expect(mockTargetBackend).toHaveBeenNthCalledWith(
      2,
      `${DEMO_BACKEND_ORIGIN}/transfers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"account":"acct_1","amount":25}',
        credentials: "include",
      },
    );
    expect(
      mockTargetBackend.mock.calls.every(
        ([input]) =>
          new URL(input.toString()).origin === DEMO_BACKEND_ORIGIN,
      ),
    ).toBe(true);
  });

  it("requires request behavior rather than direct access to a token string", () => {
    const request = createDemoCookieSessionRequest(
      vi.fn<TargetBackendRequest>(),
    );

    expect(typeof request).toBe("function");
    expect(Object.keys(request)).toEqual([]);
    expectTypeOf<Parameters<TargetBackendRequest>>().toEqualTypeOf<
      [input: RequestInfo | URL, init?: RequestInit]
    >();
    expectTypeOf<keyof ExecuteBackendOperationInput>().toEqualTypeOf<
      "baseUrl" | "operation" | "value" | "request"
    >();
  });

  it("preserves target-backend unauthenticated behavior without inventing authorization", async () => {
    const unauthenticatedRequest = createMockTargetBackend();

    const writeResult = await executeBackendOperation({
      baseUrl: DEMO_BACKEND_ORIGIN,
      operation: { method: "POST", path: "/transfers" },
      value: { amount: 25 },
      request: unauthenticatedRequest,
    });
    const referenceResult = await resolveReferenceOptions({
      baseUrl: DEMO_BACKEND_ORIGIN,
      field: accountField,
      request: unauthenticatedRequest,
    });

    expect(writeResult.outcome).toBe("http-error");
    if (writeResult.outcome === "http-error") {
      expect(writeResult.response.status).toBe(401);
    }
    expect(referenceResult).toEqual({ outcome: "http-error" });
    expect(unauthenticatedRequest).toHaveBeenCalledTimes(2);
  });

  it("keeps request behavior and credential fields out of canonical specs", () => {
    const capability = defineCapability({
      id: "transfer_money",
      description: "Transfer money from one of the user's accounts.",
      fields: {
        account: f.reference({
          label: "From account",
          source: { method: "GET", path: "/accounts" },
          value: "id",
          labelFrom: "display_name",
        }),
      },
      operation: { method: "POST", path: "/transfers" },
      confirmation: "required",
    });
    const spec: MashalaSpec = {
      specVersion: "0.3",
      app: {
        id: "demo_bank",
        name: "Demo Bank",
        description: "A target application used by the integration sample.",
      },
      capabilities: [capability],
    };
    const keys = collectObjectKeys(spec);

    expect(keys.has("request")).toBe(false);
    expect(keys.has("headers")).toBe(false);
    expect(keys.has("credentials")).toBe(false);
    expect(keys.has("authorization")).toBe(false);
    expect(keys.has("token")).toBe(false);
    expectTypeOf<keyof CapabilitySpec>().toEqualTypeOf<
      "kind" | "id" | "description" | "operation"
    >();
  });

  it("keeps auth integration and credential fields out of browser/server events", () => {
    const browserResult = validateBrowserToServerEvent({
      protocolVersion: "0.1",
      eventId: "evt_1",
      conversationId: "conv_1",
      type: "user.message",
      payload: {
        text: "Transfer money",
        credentials: "browser-only",
      },
    });
    const serverResult = validateServerToBrowserEvent({
      protocolVersion: "0.1",
      eventId: "evt_2",
      conversationId: "conv_1",
      type: "assistant.message",
      payload: {
        text: "Ready",
        credential: "browser-only",
      },
    });

    expect(browserResult).toEqual({
      success: false,
      error: {
        code: "invalid_event",
        message: "The runtime event does not match the accepted protocol.",
      },
    });
    expect(serverResult).toEqual(browserResult);
    expectTypeOf<keyof BrowserToServerEvent>().toEqualTypeOf<
      | "protocolVersion"
      | "eventId"
      | "conversationId"
      | "inReplyTo"
      | "type"
      | "payload"
    >();
  });
});
