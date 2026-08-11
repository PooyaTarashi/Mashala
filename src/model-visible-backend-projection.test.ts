import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { f } from "./fields";
import {
  createSelectedBackendContextEvent,
  projectModelVisibleBackendData,
  type SelectedBackendContextEventResult,
} from "./model-visible-backend-projection";
import type { SelectedBackendContextEvent } from "./runtime-protocol";

const eventMetadata = {
  capabilityId: "replace_card",
  eventId: "evt_context_1",
  conversationId: "conv_1",
  inReplyTo: "evt_user_1",
} as const;

const cardSource = f.reference({
  label: "Card",
  source: {
    method: "GET",
    path: "/cards",
    modelContext: {
      purpose: "reference_resolution",
      fields: { id: "id", label: "masked" },
    },
  },
  value: "id",
  labelFrom: "masked",
}).source;

describe("ADR-016 browser-side backend projection", () => {
  it("projects only explicitly selected card properties into the existing event", () => {
    const backendResult = [
      {
        id: "card_1",
        masked: "•••• 4417",
        balance: 750_000,
        issuer: "Visa",
        access_token: "target-secret",
      },
      {
        id: "card_2",
        masked: "•••• 9082",
        balance: 125_000,
        sessionId: "target-session",
      },
    ];

    const result = createSelectedBackendContextEvent({
      source: cardSource,
      backendResult,
      ...eventMetadata,
    });

    expect(result).toEqual({
      outcome: "projected",
      event: {
        protocolVersion: "0.1",
        eventId: "evt_context_1",
        conversationId: "conv_1",
        inReplyTo: "evt_user_1",
        type: "backend.context.selected",
        payload: {
          capabilityId: "replace_card",
          purpose: "reference_resolution",
          data: [
            { id: "card_1", label: "•••• 4417" },
            { id: "card_2", label: "•••• 9082" },
          ],
        },
      },
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("balance");
    expect(serialized).not.toContain("issuer");
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("target-secret");
    expect(serialized).not.toContain("sessionId");
    expect(serialized).not.toContain("target-session");
    expect(serialized).not.toContain(JSON.stringify(backendResult));
  });

  it("supports a root object and output-property renaming", () => {
    const result = projectModelVisibleBackendData(
      {
        account_id: "account_1",
        display_name: "Everyday account",
        available_balance: 5_000,
      },
      {
        purpose: "result_interpretation",
        fields: { id: "account_id", name: "display_name" },
      },
    );

    expect(result).toEqual({
      outcome: "projected",
      purpose: "result_interpretation",
      data: { id: "account_1", name: "Everyday account" },
    });
  });

  it("returns no event when the read source has no explicit projection", () => {
    const result = createSelectedBackendContextEvent({
      source: {},
      backendResult: {
        id: "account_1",
        access_token: "must-remain-browser-side",
      },
      ...eventMetadata,
    });

    expect(result).toEqual({ outcome: "not-configured" });
    expect(result).not.toHaveProperty("event");
  });

  it("rejects credential-like source and output selections", () => {
    expect(
      projectModelVisibleBackendData(
        { access_token: "secret" },
        {
          purpose: "result_interpretation",
          fields: { exposed: "access_token" },
        },
      ),
    ).toEqual({
      outcome: "failure",
      error: {
        code: "invalid_projection",
        message: "The model-visible backend projection is malformed.",
      },
    });

    expect(
      projectModelVisibleBackendData(
        { safe: "secret" },
        {
          purpose: "result_interpretation",
          fields: { authorization: "safe" },
        },
      ),
    ).toMatchObject({
      outcome: "failure",
      error: { code: "invalid_projection" },
    });
  });

  it("rejects credential-like data nested inside an explicitly selected value", () => {
    const result = projectModelVisibleBackendData(
      {
        summary: {
          display: "Everyday account",
          auth: { refresh_token: "target-secret" },
        },
      },
      {
        purpose: "result_interpretation",
        fields: { summary: "summary" },
      },
    );

    expect(result).toMatchObject({
      outcome: "failure",
      error: { code: "forbidden_data" },
    });
    expect(JSON.stringify(result)).not.toContain("target-secret");
  });

  it.each([
    ["non-object root", "cards", "invalid_source"],
    ["non-object array item", [{ id: "card_1" }, null], "invalid_source"],
    ["missing selected property", { id: "card_1" }, "invalid_source"],
    [
      "non-serializable selected value",
      { id: "card_1", masked: Number.NaN },
      "non_serializable_data",
    ],
  ] as const)("fails closed for %s", (_case, backendResult, code) => {
    const result = projectModelVisibleBackendData(
      backendResult,
      cardSource.modelContext,
    );

    expect(result).toMatchObject({ outcome: "failure", error: { code } });
    expect(result).not.toHaveProperty("data");
  });

  it("handles malformed projection input predictably", () => {
    expect(
      projectModelVisibleBackendData(
        { id: "card_1" },
        {
          purpose: "reference_resolution",
          fields: {},
          execute: "/cards",
        },
      ),
    ).toEqual({
      outcome: "failure",
      error: {
        code: "invalid_projection",
        message: "The model-visible backend projection is malformed.",
      },
    });
  });

  it("performs no target-backend request or execution", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = createSelectedBackendContextEvent({
      source: cardSource,
      backendResult: [{ id: "card_1", masked: "•••• 4417" }],
      ...eventMetadata,
    });

    expect(result.outcome).toBe("projected");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("model-visible projection types", () => {
  it("maps projected results to the accepted protocol event", () => {
    expectTypeOf<
      Extract<SelectedBackendContextEventResult, { outcome: "projected" }>["event"]
    >().toEqualTypeOf<SelectedBackendContextEvent>();
  });
});
