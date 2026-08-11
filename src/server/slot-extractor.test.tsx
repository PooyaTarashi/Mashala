// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import { transferMoney } from "../examples/transfer-money";
import { CompiledForm, type FormValue } from "../form-renderer";
import type { JsonValue } from "../forms";
import type { LlmProvider } from "./llm/provider";
import {
  extractSlotCandidates,
  type SlotCandidateValues,
} from "./slot-extractor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function successfulProvider(output: JsonValue) {
  const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
  generateStructured.mockResolvedValue({ outcome: "success", output });

  return {
    provider: { generateStructured } satisfies LlmProvider,
    generateStructured,
  };
}

describe("extractSlotCandidates", () => {
  it("accepts one valid declared field", async () => {
    const { provider } = successfulProvider({ note: "Dinner" });

    await expect(
      extractSlotCandidates({
        capability: transferMoney,
        utterance: "Add dinner as the note",
        provider,
      }),
    ).resolves.toEqual({
      outcome: "proposed",
      values: { note: "Dinner" },
    });
  });

  it("accepts multiple valid declared fields", async () => {
    const values = {
      recipient: "Sam",
      amount: 50,
      speed: "instant",
    } as const;
    const { provider } = successfulProvider(values);

    await expect(
      extractSlotCandidates({
        capability: transferMoney,
        utterance: "Send Sam 50 instantly",
        provider,
      }),
    ).resolves.toEqual({ outcome: "proposed", values });
  });

  it("allows partial extraction while unrelated required fields are missing", async () => {
    const { provider } = successfulProvider({ amount: 50 });

    const result = await extractSlotCandidates({
      capability: transferMoney,
      utterance: "Transfer 50 euros",
      provider,
    });

    expect(result).toEqual({ outcome: "proposed", values: { amount: 50 } });
    expect(transferMoney.form.schema.required).toEqual([
      "recipient",
      "amount",
      "speed",
    ]);
  });

  it("accepts an empty proposal when no reliable value is present", async () => {
    const { provider } = successfulProvider({});

    const result = await extractSlotCandidates({
      capability: transferMoney,
      utterance: "I need help with a transfer",
      provider,
    });

    expect(result).toEqual({ outcome: "proposed", values: {} });
    if (result.outcome === "proposed") {
      expect(Object.isFrozen(result.values)).toBe(true);
    }
  });

  it("rejects model-invented fields instead of dropping or merging them", async () => {
    const { provider } = successfulProvider({
      amount: 50,
      adminOverride: true,
    });

    await expect(
      extractSlotCandidates({
        capability: transferMoney,
        utterance: "Transfer 50 euros",
        provider,
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: {
        kind: "undeclared_fields",
        fieldNames: ["adminOverride"],
        message: "The LLM proposed one or more undeclared form fields.",
      },
    });
  });

  it("rejects an invalid primitive value", async () => {
    const { provider } = successfulProvider({ amount: "50" });

    await expect(
      extractSlotCandidates({
        capability: transferMoney,
        utterance: "Transfer 50 euros",
        provider,
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: {
        kind: "invalid_candidate_values",
        message:
          "The LLM proposed values that do not satisfy the declared form schema.",
      },
    });
  });

  it.each([
    ["enum", { speed: "overnight" }],
    ["range", { amount: 0 }],
    ["length", { note: "x".repeat(141) }],
  ] as const)("rejects an invalid %s value", async (_case, output) => {
    const { provider } = successfulProvider(output);

    const result = await extractSlotCandidates({
      capability: transferMoney,
      utterance: "Propose an invalid value",
      provider,
    });

    expect(result).toEqual({
      outcome: "error",
      error: {
        kind: "invalid_candidate_values",
        message:
          "The LLM proposed values that do not satisfy the declared form schema.",
      },
    });
  });

  it.each([
    ["null", null],
    ["array", ["amount", 50]],
    ["primitive", "amount"],
  ] as const)("handles %s structured output predictably", async (_case, output) => {
    const { provider } = successfulProvider(output);

    await expect(
      extractSlotCandidates({
        capability: transferMoney,
        utterance: "Transfer money",
        provider,
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: {
        kind: "invalid_model_output",
        message: "The LLM returned malformed slot extraction output.",
      },
    });
  });

  it("keeps provider failure distinct from invalid extracted values", async () => {
    const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
    generateStructured.mockResolvedValue({
      outcome: "failure",
      error: {
        code: "provider_failure",
        message: "The LLM provider request failed.",
        retryable: true,
      },
    });

    await expect(
      extractSlotCandidates({
        capability: transferMoney,
        utterance: "Transfer 50 euros",
        provider: { generateStructured },
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: {
        kind: "provider_failure",
        failure: {
          code: "provider_failure",
          message: "The LLM provider request failed.",
          retryable: true,
        },
      },
    });
  });

  it("exposes only field-facing information and applicable constraints", async () => {
    const { provider, generateStructured } = successfulProvider({});

    await extractSlotCandidates({
      capability: transferMoney,
      utterance: "Send some money",
      provider,
    });

    const request = generateStructured.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    expect(JSON.parse(request?.input ?? "null")).toEqual({
      utterance: "Send some money",
      fields: [
        {
          name: "recipient",
          label: "Recipient",
          helpText: "Enter the recipient name or identifier.",
        },
        { name: "amount", label: "Amount" },
        {
          name: "note",
          label: "Note",
          helpText: "Optional note shown with the transfer.",
        },
        {
          name: "speed",
          label: "Transfer speed",
          options: [
            { value: "standard", label: "Standard" },
            { value: "instant", label: "Instant" },
          ],
        },
        { name: "saveRecipient", label: "Save this recipient" },
      ],
    });
    expect(request?.outputSchema).toEqual({
      type: "object",
      properties: transferMoney.form.schema.properties,
      additionalProperties: false,
    });
    expect(request?.outputSchema).not.toHaveProperty("required");
    expect(request?.input).not.toContain("transfer_money");
    expect(request?.input).not.toContain("/transfers");
    expect(request?.input).not.toContain("confirmation");
    expect(request?.instructions).toContain("only declared field names");
    expect(request?.instructions).toContain("empty or partial object is valid");
    expect(request?.instructions).toContain("instead of guessing");
  });

  it("rejects operation, confirmation, or capability identity in model output without changing the selection", async () => {
    const operation = transferMoney.operation;
    const confirmation = transferMoney.confirmation;
    const { provider } = successfulProvider({
      amount: 50,
      id: "change_address",
      operation: { method: "PATCH", path: "/admin" },
      confirmation: "none",
    });

    const result = await extractSlotCandidates({
      capability: transferMoney,
      utterance: "Transfer 50 euros",
      provider,
    });

    expect(result).toMatchObject({
      outcome: "error",
      error: {
        kind: "undeclared_fields",
        fieldNames: ["id", "operation", "confirmation"],
      },
    });
    expect(transferMoney.id).toBe("transfer_money");
    expect(transferMoney.operation).toBe(operation);
    expect(transferMoney.confirmation).toBe(confirmation);
  });

  it("performs no fetch or backend execution when using the provider boundary", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { provider } = successfulProvider({ amount: 50 });

    const result = await extractSlotCandidates({
      capability: transferMoney,
      utterance: "Transfer 50 euros",
      provider,
    });

    expect(result.outcome).toBe("proposed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes proposals into editable form state without submitting automatically", async () => {
    const { provider } = successfulProvider({
      recipient: "Sam",
      amount: 50,
      speed: "standard",
    });
    const result = await extractSlotCandidates({
      capability: transferMoney,
      utterance: "Send Sam 50 with standard delivery",
      provider,
    });

    expect(result.outcome).toBe("proposed");
    if (result.outcome !== "proposed") {
      throw new Error("Expected proposed slot values.");
    }

    const onSubmit = vi.fn();
    render(
      <CompiledForm
        form={transferMoney.form}
        initialValues={result.values}
        onSubmit={onSubmit}
      />,
    );

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText(/Recipient/) as HTMLInputElement).value,
    ).toBe("Sam");
    expect(
      (screen.getByLabelText(/Amount/) as HTMLInputElement).valueAsNumber,
    ).toBe(50);

    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "75" },
    });
    expect(
      (screen.getByLabelText(/Amount/) as HTMLInputElement).valueAsNumber,
    ).toBe(75);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({
      recipient: "Sam",
      amount: 75,
      speed: "standard",
      saveRecipient: false,
    });
  });
});

describe("slot extraction types", () => {
  it("produces values compatible with the existing editable form path", () => {
    expectTypeOf<
      SlotCandidateValues<"recipient" | "amount">
    >().toEqualTypeOf<FormValue<"recipient" | "amount">>();
  });
});
