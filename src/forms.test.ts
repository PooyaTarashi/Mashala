import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, expectTypeOf, it } from "vitest";

import { f } from "./fields";
import {
  compileForm,
  type FormDefinition,
  type JsonSchema202012,
} from "./forms";

function createTransferFields() {
  return {
    recipient: f.text({
      label: "Recipient",
      helpText: "Enter a name or identifier.",
      required: true,
      minLength: 1,
      maxLength: 100,
    }),
    note: f.longText({
      label: "Note",
      helpText: "Optional transfer note.",
      maxLength: 140,
    }),
    amount: f.number({
      label: "Amount",
      required: true,
      minimum: 0,
      maximum: 10_000,
    }),
    speed: f.select({
      label: "Transfer speed",
      required: true,
      options: [
        { value: "standard", label: "Standard" },
        { value: "instant", label: "Instant" },
      ],
    }),
    saveRecipient: f.boolean({ label: "Save this recipient" }),
  };
}

describe("form compiler", () => {
  it("compiles every static field kind to the canonical schema/metadata split", () => {
    const form = compileForm(createTransferFields());

    expect(form).toEqual({
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          recipient: {
            type: "string",
            minLength: 1,
            maxLength: 100,
          },
          note: { type: "string", maxLength: 140 },
          amount: { type: "number", minimum: 0, maximum: 10_000 },
          speed: {
            type: "string",
            enum: ["standard", "instant"],
          },
          saveRecipient: { type: "boolean" },
        },
        required: ["recipient", "amount", "speed"],
        additionalProperties: false,
      },
      fields: {
        recipient: {
          kind: "text",
          label: "Recipient",
          helpText: "Enter a name or identifier.",
        },
        note: {
          kind: "longText",
          label: "Note",
          helpText: "Optional transfer note.",
        },
        amount: { kind: "number", label: "Amount" },
        speed: {
          kind: "select",
          label: "Transfer speed",
          optionLabels: {
            standard: "Standard",
            instant: "Instant",
          },
        },
        saveRecipient: {
          kind: "boolean",
          label: "Save this recipient",
        },
      },
    });

    expect(Object.keys(form.schema.properties)).toEqual([
      "recipient",
      "note",
      "amount",
      "speed",
      "saveRecipient",
    ]);
    expect(Object.keys(form.fields)).toEqual(
      Object.keys(form.schema.properties),
    );
  });

  it("treats fields as optional by default and omits an empty required array", () => {
    const form = compileForm({ nickname: f.text({ label: "Nickname" }) });

    expect(form.schema).not.toHaveProperty("required");
  });

  it("compiles a reference into string validation and canonical runtime metadata", () => {
    const form = compileForm({
      account: f.reference({
        label: "From account",
        helpText: "Choose the source account.",
        required: true,
        source: { method: "GET", path: "/accounts" },
        value: "id",
        labelFrom: "display_name",
      }),
    });

    expect(form).toEqual({
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { account: { type: "string" } },
        required: ["account"],
        additionalProperties: false,
      },
      fields: {
        account: {
          kind: "reference",
          label: "From account",
          helpText: "Choose the source account.",
          source: { method: "GET", path: "/accounts" },
          value: "id",
          labelFrom: "display_name",
        },
      },
    });
    expect(Object.isFrozen(form.fields.account)).toBe(true);
    if (form.fields.account.kind === "reference") {
      expect(Object.isFrozen(form.fields.account.source)).toBe(true);
    }
  });

  it("is deterministic and isolates deeply frozen output from authoring input", () => {
    const options = [
      { value: "standard", label: "Standard" },
      { value: "instant", label: "Instant" },
    ];
    const fields = {
      speed: f.select({ label: "Speed", options, required: true }),
    };
    const first = compileForm(fields);
    const second = compileForm(fields);

    options[0].label = "Changed after authoring";
    fields.speed = f.select({
      label: "Replacement",
      options: [{ value: "replacement", label: "Replacement" }],
    });

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.fields.speed).toEqual({
      kind: "select",
      label: "Speed",
      optionLabels: { standard: "Standard", instant: "Instant" },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.schema)).toBe(true);
    expect(Object.isFrozen(first.schema.properties)).toBe(true);
    expect(Object.isFrozen(first.schema.properties.speed)).toBe(true);
    expect(Object.isFrozen(first.schema.required)).toBe(true);
    expect(Object.isFrozen(first.fields)).toBe(true);
    expect(Object.isFrozen(first.fields.speed)).toBe(true);

    if (first.fields.speed.kind === "select") {
      expect(Object.isFrozen(first.fields.speed.optionLabels)).toBe(true);
    }
  });

  it("preserves form field names in the compiled types", () => {
    const form = compileForm(createTransferFields());

    expectTypeOf(form).toMatchTypeOf<
      FormDefinition<
        "recipient" | "note" | "amount" | "speed" | "saveRecipient"
      >
    >();
    expectTypeOf(form.schema.properties.recipient).toEqualTypeOf<
      JsonSchema202012
    >();
    expectTypeOf(form.schema.required).toEqualTypeOf<
      | readonly (
          | "recipient"
          | "note"
          | "amount"
          | "speed"
          | "saveRecipient"
        )[]
      | undefined
    >();
  });
});

describe("compiled form validation with Ajv 2020-12", () => {
  const validate = new Ajv2020().compile(
    compileForm(createTransferFields()).schema,
  );

  it("accepts a valid complete form", () => {
    expect(
      validate({
        recipient: "Sam",
        note: "Dinner",
        amount: 250,
        speed: "instant",
        saveRecipient: true,
      }),
    ).toBe(true);
  });

  it("rejects missing required fields and allows omitted optional fields", () => {
    expect(validate({ recipient: "Sam", amount: 250 })).toBe(false);
    expect(
      validate({ recipient: "Sam", amount: 250, speed: "standard" }),
    ).toBe(true);
  });

  it("rejects unknown properties", () => {
    expect(
      validate({
        recipient: "Sam",
        amount: 250,
        speed: "standard",
        unknown: true,
      }),
    ).toBe(false);
  });

  it.each([
    ["text", { recipient: 123, amount: 250, speed: "standard" }],
    ["longText", { recipient: "Sam", note: 123, amount: 250, speed: "standard" }],
    ["number", { recipient: "Sam", amount: "250", speed: "standard" }],
    ["select", { recipient: "Sam", amount: 250, speed: 1 }],
    ["boolean", { recipient: "Sam", amount: 250, speed: "standard", saveRecipient: "yes" }],
  ])("rejects an incorrect %s primitive type", (_kind, value) => {
    expect(validate(value)).toBe(false);
  });

  it("enforces select enum values", () => {
    expect(
      validate({ recipient: "Sam", amount: 250, speed: "overnight" }),
    ).toBe(false);
  });

  it("enforces string length constraints", () => {
    expect(validate({ recipient: "", amount: 250, speed: "standard" })).toBe(
      false,
    );
    expect(
      validate({
        recipient: "x".repeat(101),
        amount: 250,
        speed: "standard",
      }),
    ).toBe(false);
    expect(
      validate({
        recipient: "Sam",
        note: "x".repeat(141),
        amount: 250,
        speed: "standard",
      }),
    ).toBe(false);
  });

  it("enforces numeric minimum and maximum constraints", () => {
    expect(
      validate({ recipient: "Sam", amount: -1, speed: "standard" }),
    ).toBe(false);
    expect(
      validate({ recipient: "Sam", amount: 10_001, speed: "standard" }),
    ).toBe(false);
  });
});

if (false) {
  const typedForm = compileForm({ name: f.text({ label: "Name" }) });

  // @ts-expect-error Undeclared field names are not in compiled properties.
  void typedForm.schema.properties.unknown;

  // @ts-expect-error Required status never leaks into field metadata.
  void typedForm.fields.name.required;

  compileForm({
    // @ts-expect-error Reference fields require a declared source and projection.
    account: { kind: "reference", label: "Account" },
  });
}
