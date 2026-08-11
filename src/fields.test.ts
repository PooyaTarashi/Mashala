import { describe, expect, expectTypeOf, it } from "vitest";

import {
  f,
  type BooleanFieldDefinition,
  type FieldDefinition,
  type LongTextFieldDefinition,
  type NumberFieldDefinition,
  type ReferenceFieldDefinition,
  type SelectFieldDefinition,
  type StaticFieldDefinition,
  type TextFieldDefinition,
} from "./fields";

describe("field DSL", () => {
  it("builds a text field", () => {
    const field = f.text({
      label: "Recipient",
      helpText: "Enter a name or identifier.",
    });

    expect(field).toEqual({
      kind: "text",
      label: "Recipient",
      helpText: "Enter a name or identifier.",
    });
    expectTypeOf(field).toEqualTypeOf<TextFieldDefinition>();
    expectTypeOf(field.kind).toEqualTypeOf<"text">();
  });

  it("builds a long-text field", () => {
    const field = f.longText({ label: "Note" });

    expect(field).toEqual({ kind: "longText", label: "Note" });
    expectTypeOf(field).toEqualTypeOf<LongTextFieldDefinition>();
    expectTypeOf(field.kind).toEqualTypeOf<"longText">();
  });

  it("builds a number field", () => {
    const field = f.number({ label: "Amount" });

    expect(field).toEqual({ kind: "number", label: "Amount" });
    expectTypeOf(field).toEqualTypeOf<NumberFieldDefinition>();
    expectTypeOf(field.kind).toEqualTypeOf<"number">();
  });

  it("builds a select field with strongly typed string options", () => {
    const field = f.select({
      label: "Transfer speed",
      options: [
        { value: "standard", label: "Standard" },
        { value: "instant", label: "Instant" },
      ],
    });

    expect(field).toEqual({
      kind: "select",
      label: "Transfer speed",
      optionLabels: {
        standard: "Standard",
        instant: "Instant",
      },
    });
    expectTypeOf(field).toEqualTypeOf<
      SelectFieldDefinition<"standard" | "instant">
    >();
    expectTypeOf(field.kind).toEqualTypeOf<"select">();
    expectTypeOf(field.optionLabels.standard).toEqualTypeOf<string>();
  });

  it("builds a boolean field", () => {
    const field = f.boolean({ label: "Save this recipient" });

    expect(field).toEqual({
      kind: "boolean",
      label: "Save this recipient",
    });
    expectTypeOf(field).toEqualTypeOf<BooleanFieldDefinition>();
    expectTypeOf(field.kind).toEqualTypeOf<"boolean">();
  });

  it("builds a reference field with one declared GET source and projection", () => {
    const field = f.reference({
      label: "From account",
      helpText: "Choose an account.",
      required: true,
      source: { method: "GET", path: "/accounts" },
      value: "id",
      labelFrom: "display_name",
    });

    expect(field).toEqual({
      kind: "reference",
      label: "From account",
      helpText: "Choose an account.",
      required: true,
      source: { method: "GET", path: "/accounts" },
      value: "id",
      labelFrom: "display_name",
    });
    expectTypeOf(field).toEqualTypeOf<ReferenceFieldDefinition>();
    expectTypeOf(field.kind).toEqualTypeOf<"reference">();
    expect(Object.isFrozen(field)).toBe(true);
    expect(Object.isFrozen(field.source)).toBe(true);
  });

  it("builds and isolates an explicit model-visible source projection", () => {
    const fields = { id: "id", label: "display_name" };
    const field = f.reference({
      label: "Account",
      source: {
        method: "GET",
        path: "/accounts",
        modelContext: {
          purpose: "reference_resolution",
          fields,
        },
      },
      value: "id",
      labelFrom: "display_name",
    });

    fields.label = "changed_after_authoring";

    expect(field.source.modelContext).toEqual({
      purpose: "reference_resolution",
      fields: { id: "id", label: "display_name" },
    });
    expect(Object.isFrozen(field.source.modelContext)).toBe(true);
    expect(Object.isFrozen(field.source.modelContext?.fields)).toBe(true);
  });

  it.each([
    ["empty fields", { purpose: "reference_resolution", fields: {} }],
    [
      "credential source",
      {
        purpose: "reference_resolution",
        fields: { id: "access_token" },
      },
    ],
    [
      "credential output",
      {
        purpose: "reference_resolution",
        fields: { sessionId: "id" },
      },
    ],
  ])("rejects an invalid model-context projection with %s", (_case, modelContext) => {
    expect(() =>
      f.reference({
        label: "Account",
        source: {
          method: "GET",
          path: "/accounts",
          modelContext: modelContext as never,
        },
        value: "id",
        labelFrom: "display_name",
      }),
    ).toThrow(/^Invalid model-visible backend projection:/);
  });

  it("copies only canonical reference-source data", () => {
    const source = {
      method: "GET" as const,
      path: "/accounts",
      headers: { authorization: "Bearer target-secret" },
      credential: "target-secret",
    };

    const field = f.reference({
      label: "Account",
      source,
      value: "id",
      labelFrom: "name",
    });

    expect(field.source).toEqual({ method: "GET", path: "/accounts" });
    expect(JSON.stringify(field)).not.toContain("target-secret");
    expect(JSON.stringify(field)).not.toContain("headers");
    expect(JSON.stringify(field)).not.toContain("credential");
  });

  it.each([
    ["non-GET method", { method: "POST", path: "/accounts" }],
    ["absolute path", { method: "GET", path: "https://other.example/accounts" }],
    ["query string", { method: "GET", path: "/accounts?active=true" }],
  ])("rejects a reference source with a %s", (_case, source) => {
    expect(() =>
      f.reference({
        label: "Account",
        source: source as { method: "GET"; path: string },
        value: "id",
        labelFrom: "name",
      }),
    ).toThrow(/^Invalid reference field:/);
  });

  it("retains form-compilation settings only when authored", () => {
    expect(
      f.text({
        label: "Recipient",
        required: true,
        minLength: 1,
        maxLength: 100,
      }),
    ).toEqual({
      kind: "text",
      label: "Recipient",
      required: true,
      minLength: 1,
      maxLength: 100,
    });

    expect(
      f.number({ label: "Amount", minimum: 0, maximum: 10_000 }),
    ).toEqual({
      kind: "number",
      label: "Amount",
      minimum: 0,
      maximum: 10_000,
    });

    expect(f.boolean({ label: "Optional", required: false })).toEqual({
      kind: "boolean",
      label: "Optional",
    });
  });

  it("emits deterministic JSON without sharing mutable input state", () => {
    const options = [
      { value: "standard", label: "Standard" },
      { value: "instant", label: "Instant" },
    ];
    const first = f.select({ label: "Speed", options });
    const second = f.select({ label: "Speed", options });

    options[0].label = "Changed after compilation";

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.optionLabels).not.toBe(second.optionLabels);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.optionLabels)).toBe(true);
    expect(JSON.stringify(first)).toBe(
      '{"kind":"select","label":"Speed","optionLabels":{"standard":"Standard","instant":"Instant"}}',
    );
  });

  it("exposes a discriminated union for future compiler code", () => {
    const fields = [
      f.text({ label: "Recipient" }),
      f.longText({ label: "Note" }),
      f.number({ label: "Amount" }),
      f.select({
        label: "Speed",
        options: [{ value: "standard", label: "Standard" }],
      }),
      f.boolean({ label: "Save recipient" }),
    ] satisfies readonly StaticFieldDefinition[];

    expect(fields.map((field) => field.kind)).toEqual([
      "text",
      "longText",
      "number",
      "select",
      "boolean",
    ]);
  });

  it("includes reference in the complete field union", () => {
    const fields = [
      f.text({ label: "Name" }),
      f.reference({
        label: "Account",
        source: { method: "GET", path: "/accounts" },
        value: "id",
        labelFrom: "name",
      }),
    ] satisfies readonly FieldDefinition[];

    expect(fields.map((field) => field.kind)).toEqual(["text", "reference"]);
  });
});

if (false) {
  // @ts-expect-error A presentation label is required.
  f.text({});

  f.select({
    label: "Invalid",
    options: [
      // @ts-expect-error Canonical select values are strings.
      { value: 1, label: "One" },
    ],
  });

  // @ts-expect-error The required flag is boolean.
  f.boolean({ label: "Invalid", required: "yes" });

  // @ts-expect-error JSON Schema length constraints are numbers.
  f.text({ label: "Invalid", minLength: "1" });

  // @ts-expect-error JSON Schema numeric constraints are numbers.
  f.number({ label: "Invalid", minimum: "0" });

  f.reference({
    label: "Invalid",
    // @ts-expect-error Reference sources are GET-only.
    source: { method: "POST", path: "/accounts" },
    value: "id",
    labelFrom: "name",
  });
}
