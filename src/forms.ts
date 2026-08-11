import type {
  BooleanFieldDefinition,
  LongTextFieldDefinition,
  NumberFieldDefinition,
  FieldDefinition,
  ReferenceFieldDefinition,
  SelectFieldDefinition,
  TextFieldDefinition,
} from "./fields";
import type { ModelVisibleBackendProjection } from "./model-visible-backend-projection-policy";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A JSON Schema Draft 2020-12 document or subschema. */
export type JsonSchema202012 = JsonObject;

export interface FormObjectSchema<FieldName extends string = string> {
  readonly $schema: "https://json-schema.org/draft/2020-12/schema";
  readonly $id?: string;
  readonly type: "object";
  readonly properties: Readonly<Record<FieldName, JsonSchema202012>>;
  readonly required?: readonly FieldName[];
  readonly additionalProperties: false;
}

export interface FieldPresentationBase {
  readonly label: string;
  readonly helpText?: string;
}

export interface TextFieldMetadata extends FieldPresentationBase {
  readonly kind: "text";
}

export interface LongTextFieldMetadata extends FieldPresentationBase {
  readonly kind: "longText";
}

export interface NumberFieldMetadata extends FieldPresentationBase {
  readonly kind: "number";
}

export interface SelectFieldMetadata extends FieldPresentationBase {
  readonly kind: "select";
  readonly optionLabels: Readonly<Record<string, string>>;
}

export interface BooleanFieldMetadata extends FieldPresentationBase {
  readonly kind: "boolean";
}

export interface ReferenceFieldMetadata extends FieldPresentationBase {
  readonly kind: "reference";
  readonly source: {
    readonly method: "GET";
    readonly path: string;
    readonly modelContext?: ModelVisibleBackendProjection;
  };
  readonly value: string;
  readonly labelFrom: string;
}

export type FieldMetadata =
  | TextFieldMetadata
  | LongTextFieldMetadata
  | NumberFieldMetadata
  | SelectFieldMetadata
  | BooleanFieldMetadata
  | ReferenceFieldMetadata;

export interface FormDefinition<FieldName extends string = string> {
  /** The sole canonical source of deterministic input validation. */
  readonly schema: FormObjectSchema<FieldName>;

  /** Presentation metadata keyed by the same names as schema.properties. */
  readonly fields: Readonly<Record<FieldName, FieldMetadata>>;
}

export type FormFields = Readonly<Record<string, FieldDefinition>>;

export type FormFieldName<Fields extends FormFields> = Extract<
  keyof Fields,
  string
>;

const JSON_SCHEMA_2020_12 =
  "https://json-schema.org/draft/2020-12/schema" as const;

function presentationMetadata(
  field:
    | TextFieldDefinition
    | LongTextFieldDefinition
    | NumberFieldDefinition
    | BooleanFieldDefinition,
):
  | TextFieldMetadata
  | LongTextFieldMetadata
  | NumberFieldMetadata
  | BooleanFieldMetadata {
  return Object.freeze({
    kind: field.kind,
    label: field.label,
    ...(field.helpText === undefined ? {} : { helpText: field.helpText }),
  });
}

function compileSelectMetadata(
  field: SelectFieldDefinition,
  values: readonly string[],
): SelectFieldMetadata {
  const optionLabels = Object.freeze(
    Object.fromEntries(
      values.map((value) => [value, field.optionLabels[value]]),
    ),
  );

  return Object.freeze({
    kind: field.kind,
    label: field.label,
    ...(field.helpText === undefined ? {} : { helpText: field.helpText }),
    optionLabels,
  });
}

function compileReferenceMetadata(
  field: ReferenceFieldDefinition,
): ReferenceFieldMetadata {
  return Object.freeze({
    kind: field.kind,
    label: field.label,
    ...(field.helpText === undefined ? {} : { helpText: field.helpText }),
    source: Object.freeze({
      method: field.source.method,
      path: field.source.path,
      ...(field.source.modelContext === undefined
        ? {}
        : { modelContext: field.source.modelContext }),
    }),
    value: field.value,
    labelFrom: field.labelFrom,
  });
}

function compileField(field: FieldDefinition): {
  readonly schema: JsonSchema202012;
  readonly metadata: FieldMetadata;
} {
  switch (field.kind) {
    case "text":
    case "longText":
      return {
        schema: Object.freeze({
          type: "string",
          ...(field.minLength === undefined
            ? {}
            : { minLength: field.minLength }),
          ...(field.maxLength === undefined
            ? {}
            : { maxLength: field.maxLength }),
        }),
        metadata: presentationMetadata(field),
      };

    case "number":
      return {
        schema: Object.freeze({
          type: "number",
          ...(field.minimum === undefined ? {} : { minimum: field.minimum }),
          ...(field.maximum === undefined ? {} : { maximum: field.maximum }),
        }),
        metadata: presentationMetadata(field),
      };

    case "select": {
      const values = Object.freeze(Object.keys(field.optionLabels));

      return {
        schema: Object.freeze({ type: "string", enum: values }),
        metadata: compileSelectMetadata(field, values),
      };
    }

    case "reference":
      return {
        schema: Object.freeze({ type: "string" }),
        metadata: compileReferenceMetadata(field),
      };

    case "boolean":
      return {
        schema: Object.freeze({ type: "boolean" }),
        metadata: presentationMetadata(field),
      };
  }
}

/**
 * Compiles field definitions into the canonical form/schema split.
 * Fields are optional by default and preserve declaration order.
 */
export function compileForm<const Fields extends FormFields>(
  fields: Fields,
): FormDefinition<FormFieldName<Fields>> {
  type FieldName = FormFieldName<Fields>;

  const propertyEntries: [FieldName, JsonSchema202012][] = [];
  const metadataEntries: [FieldName, FieldMetadata][] = [];
  const required: FieldName[] = [];

  for (const fieldName of Object.keys(fields) as FieldName[]) {
    const field = fields[fieldName];
    const compiledField = compileField(field);

    propertyEntries.push([fieldName, compiledField.schema]);
    metadataEntries.push([fieldName, compiledField.metadata]);

    if (field.required === true) {
      required.push(fieldName);
    }
  }

  const properties = Object.freeze(
    Object.fromEntries(propertyEntries),
  ) as Readonly<Record<FieldName, JsonSchema202012>>;
  const metadata = Object.freeze(
    Object.fromEntries(metadataEntries),
  ) as Readonly<Record<FieldName, FieldMetadata>>;
  const frozenRequired = Object.freeze(required);

  const schema = Object.freeze({
    $schema: JSON_SCHEMA_2020_12,
    type: "object" as const,
    properties,
    ...(frozenRequired.length === 0 ? {} : { required: frozenRequired }),
    additionalProperties: false as const,
  });

  return Object.freeze({ schema, fields: metadata });
}
