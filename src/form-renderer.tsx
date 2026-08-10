"use client";

import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";

import type {
  FieldMetadata,
  FormDefinition,
  JsonSchema202012,
} from "./forms";
import styles from "./form-renderer.module.css";

export type FormFieldValue = string | number | boolean;

export type FormValue<FieldName extends string = string> = Readonly<
  Partial<Record<FieldName, FormFieldValue>>
>;

export interface CompiledFormProps<FieldName extends string = string> {
  readonly form: FormDefinition<FieldName>;
  readonly initialValues?: FormValue<FieldName>;
  readonly onSubmit: (value: FormValue<FieldName>) => void;
  readonly submitLabel?: string;
  /** Supply a unique value when multiple compiled forms share one document. */
  readonly formId?: string;
}

interface RenderableField {
  readonly name: string;
  readonly metadata: FieldMetadata;
  readonly schema: JsonSchema202012;
}

interface ValidationIssue {
  readonly fieldName?: string;
  readonly message: string;
}

type EditableState = Readonly<
  Record<string, FormFieldValue | undefined>
>;

const DEFAULT_FORM_ID = "mashala-form";

function developerError(message: string): never {
  throw new Error(`Invalid compiled form: ${message}`);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stringEnum(
  value: JsonSchema202012[string] | undefined,
): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }

  return value;
}

function assertCompatibleSchema(
  fieldName: string,
  metadata: FieldMetadata,
  schema: JsonSchema202012,
): void {
  const schemaType = schema.type;

  switch (metadata.kind) {
    case "text":
    case "longText":
      if (schemaType !== "string") {
        developerError(
          `field "${fieldName}" with kind "${metadata.kind}" must use a string schema.`,
        );
      }
      return;

    case "number":
      if (schemaType !== "number" && schemaType !== "integer") {
        developerError(
          `field "${fieldName}" with kind "number" must use a number or integer schema.`,
        );
      }
      return;

    case "select": {
      const values = stringEnum(schema.enum);

      if (schemaType !== "string" || values === undefined) {
        developerError(
          `field "${fieldName}" with kind "select" must use a string schema with a string enum.`,
        );
      }

      const labelKeys = Object.keys(metadata.optionLabels);
      if (
        labelKeys.length !== values.length ||
        values.some((value) => !hasOwn(metadata.optionLabels, value))
      ) {
        developerError(
          `field "${fieldName}" must have exactly one option label for every schema enum value.`,
        );
      }
      return;
    }

    case "boolean":
      if (schemaType !== "boolean") {
        developerError(
          `field "${fieldName}" with kind "boolean" must use a boolean schema.`,
        );
      }
      return;

    default:
      return assertNever(metadata);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported field metadata: ${JSON.stringify(value)}`);
}

function renderableFields(form: FormDefinition): readonly RenderableField[] {
  const propertyNames = Object.keys(form.schema.properties);
  const metadataNames = Object.keys(form.fields);

  if (
    propertyNames.length !== metadataNames.length ||
    propertyNames.some((name, index) => metadataNames[index] !== name)
  ) {
    developerError(
      "schema properties and field metadata must have the same keys in the same order.",
    );
  }

  const fields = metadataNames.map((name) => {
    const schema = form.schema.properties[name];
    const metadata = form.fields[name];

    if (schema === undefined || metadata === undefined) {
      return developerError(`field "${name}" is missing schema or metadata.`);
    }

    assertCompatibleSchema(name, metadata, schema);
    return { name, metadata, schema };
  });

  for (const requiredName of form.schema.required ?? []) {
    if (!hasOwn(form.schema.properties, requiredName)) {
      developerError(
        `required field "${requiredName}" is not declared in schema properties.`,
      );
    }
  }

  return fields;
}

function compileValidator(form: FormDefinition): ValidateFunction {
  try {
    return new Ajv2020({ allErrors: true }).compile(form.schema);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return developerError(`JSON Schema compilation failed: ${detail}`);
  }
}

function initialState(
  fields: readonly RenderableField[],
  values: FormValue | undefined,
): EditableState {
  const state: Record<string, FormFieldValue | undefined> = { ...values };

  for (const field of fields) {
    if (field.metadata.kind === "boolean" && !hasOwn(state, field.name)) {
      state[field.name] = false;
    }
  }

  return state;
}

function candidateValue(
  fields: readonly RenderableField[],
  state: EditableState,
): Record<string, FormFieldValue> {
  const candidate: Record<string, FormFieldValue> = {};

  for (const field of fields) {
    const value = state[field.name];

    if (value === undefined || (typeof value === "string" && value === "")) {
      continue;
    }

    candidate[field.name] = value;
  }

  for (const [name, value] of Object.entries(state)) {
    if (!fields.some((field) => field.name === name) && value !== undefined) {
      candidate[name] = value;
    }
  }

  return candidate;
}

function pointerFieldName(instancePath: string): string | undefined {
  if (!instancePath.startsWith("/")) {
    return undefined;
  }

  const segment = instancePath.slice(1).split("/", 1)[0];
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function errorParameter(
  error: ErrorObject,
  name: string,
): string | number | undefined {
  const value: unknown = error.params[name];
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

function validationIssue(
  error: ErrorObject,
  form: FormDefinition,
): ValidationIssue {
  const parameterField =
    error.keyword === "required"
      ? errorParameter(error, "missingProperty")
      : undefined;
  const pathField = pointerFieldName(error.instancePath);
  const fieldName =
    typeof parameterField === "string" ? parameterField : pathField;
  const metadata = fieldName === undefined ? undefined : form.fields[fieldName];
  const label = metadata?.label ?? fieldName ?? "Form value";
  const limit = errorParameter(error, "limit");

  switch (error.keyword) {
    case "required":
      return { fieldName, message: `${label} is required.` };
    case "minLength":
      return {
        fieldName,
        message: `${label} must be at least ${String(limit)} characters.`,
      };
    case "maxLength":
      return {
        fieldName,
        message: `${label} must be at most ${String(limit)} characters.`,
      };
    case "minimum":
      return {
        fieldName,
        message: `${label} must be at least ${String(limit)}.`,
      };
    case "exclusiveMinimum":
      return {
        fieldName,
        message: `${label} must be greater than ${String(limit)}.`,
      };
    case "maximum":
      return {
        fieldName,
        message: `${label} must be at most ${String(limit)}.`,
      };
    case "exclusiveMaximum":
      return {
        fieldName,
        message: `${label} must be less than ${String(limit)}.`,
      };
    case "enum":
      return {
        fieldName,
        message: `${label} must be one of the declared options.`,
      };
    case "type": {
      const expectedType = errorParameter(error, "type");
      return {
        fieldName,
        message: `${label} must be a ${String(expectedType)}.`,
      };
    }
    case "additionalProperties": {
      const property = errorParameter(error, "additionalProperty");
      return {
        message: `Unknown field “${String(property)}” is not allowed.`,
      };
    }
    default:
      return { fieldName, message: `${label} is invalid.` };
  }
}

function validateCandidate(
  validator: ValidateFunction,
  form: FormDefinition,
  candidate: Record<string, FormFieldValue>,
): readonly ValidationIssue[] {
  if (validator(candidate)) {
    return [];
  }

  return (validator.errors ?? []).map((error) => validationIssue(error, form));
}

function idPart(value: string): string {
  if (value.length === 0) {
    return "empty";
  }

  return Array.from(value, (character) =>
    character.codePointAt(0)?.toString(16),
  ).join("-");
}

function controlValue(value: FormFieldValue | undefined): string | number {
  return typeof value === "string" || typeof value === "number" ? value : "";
}

function numericConstraint(
  schema: JsonSchema202012,
  keyword: "minimum" | "maximum",
): number | undefined {
  const value = schema[keyword];
  return typeof value === "number" ? value : undefined;
}

function lengthConstraint(
  schema: JsonSchema202012,
  keyword: "minLength" | "maxLength",
): number | undefined {
  const value = schema[keyword];
  return typeof value === "number" ? value : undefined;
}

export function CompiledForm<FieldName extends string>({
  form,
  initialValues,
  onSubmit,
  submitLabel = "Submit",
  formId = DEFAULT_FORM_ID,
}: CompiledFormProps<FieldName>) {
  const fields = useMemo(() => renderableFields(form), [form]);
  const validator = useMemo(() => compileValidator(form), [form]);
  const [values, setValues] = useState<EditableState>(() =>
    initialState(fields, initialValues),
  );
  const [issues, setIssues] = useState<readonly ValidationIssue[]>([]);
  const [hasValidated, setHasValidated] = useState(false);
  const requiredNames = useMemo(
    () => new Set<string>(form.schema.required ?? []),
    [form.schema.required],
  );
  const idPrefix = idPart(formId);

  function updateValue(name: string, value: FormFieldValue | undefined): void {
    const nextValues = { ...values, [name]: value };
    setValues(nextValues);

    if (hasValidated) {
      setIssues(
        validateCandidate(
          validator,
          form,
          candidateValue(fields, nextValues),
        ),
      );
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const candidate = candidateValue(fields, values);
    const nextIssues = validateCandidate(validator, form, candidate);
    setHasValidated(true);
    setIssues(nextIssues);

    if (nextIssues.length === 0) {
      onSubmit(candidate as FormValue<FieldName>);
    }
  }

  function renderControl(
    field: RenderableField,
    controlId: string,
    describedBy: string | undefined,
    invalid: boolean,
    required: boolean,
  ): ReactNode {
    const common = {
      id: controlId,
      name: field.name,
      "aria-describedby": describedBy,
      "aria-invalid": invalid || undefined,
      "aria-required": required,
    } as const;
    const value = values[field.name];

    switch (field.metadata.kind) {
      case "text":
        return (
          <input
            {...common}
            className={styles.control}
            type="text"
            value={controlValue(value)}
            required={required}
            minLength={lengthConstraint(field.schema, "minLength")}
            maxLength={lengthConstraint(field.schema, "maxLength")}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateValue(field.name, event.currentTarget.value)
            }
          />
        );

      case "longText":
        return (
          <textarea
            {...common}
            className={styles.control}
            value={controlValue(value)}
            required={required}
            minLength={lengthConstraint(field.schema, "minLength")}
            maxLength={lengthConstraint(field.schema, "maxLength")}
            rows={4}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              updateValue(field.name, event.currentTarget.value)
            }
          />
        );

      case "number":
        return (
          <input
            {...common}
            className={styles.control}
            type="number"
            value={controlValue(value)}
            required={required}
            min={numericConstraint(field.schema, "minimum")}
            max={numericConstraint(field.schema, "maximum")}
            step={field.schema.type === "integer" ? 1 : "any"}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateValue(
                field.name,
                event.currentTarget.value === ""
                  ? undefined
                  : Number(event.currentTarget.value),
              )
            }
          />
        );

      case "select": {
        const options = stringEnum(field.schema.enum);
        const optionLabels = field.metadata.optionLabels;
        if (options === undefined) {
          return developerError(
            `field "${field.name}" has no usable schema enum.`,
          );
        }

        return (
          <select
            {...common}
            className={styles.control}
            value={controlValue(value)}
            required={required}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateValue(field.name, event.currentTarget.value)
            }
          >
            <option value="">Select an option</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {optionLabels[option]}
              </option>
            ))}
          </select>
        );
      }

      case "boolean":
        return (
          <input
            {...common}
            className={styles.checkbox}
            type="checkbox"
            checked={value === true}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateValue(field.name, event.currentTarget.checked)
            }
          />
        );

      default:
        return assertNever(field.metadata);
    }
  }

  return (
    <form
      id={formId}
      className={styles.form}
      noValidate
      onSubmit={handleSubmit}
    >
      {issues.length > 0 ? (
        <section
          className={styles.summary}
          role="alert"
          aria-labelledby={`${idPrefix}-error-summary-title`}
        >
          <h2 id={`${idPrefix}-error-summary-title`}>Check the form</h2>
          <ul>
            {issues.map((issue, index) => {
              const controlId =
                issue.fieldName === undefined
                  ? undefined
                  : `${idPrefix}-field-${idPart(issue.fieldName)}`;

              return (
                <li key={`${issue.fieldName ?? "form"}-${index}`}>
                  {controlId === undefined ? (
                    issue.message
                  ) : (
                    <a href={`#${controlId}`}>{issue.message}</a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {fields.map((field) => {
        const controlId = `${idPrefix}-field-${idPart(field.name)}`;
        const fieldIssues = issues.filter(
          (issue) => issue.fieldName === field.name,
        );
        const helpId =
          field.metadata.helpText === undefined
            ? undefined
            : `${controlId}-help`;
        const errorIds = fieldIssues.map(
          (_issue, index) => `${controlId}-error-${index}`,
        );
        const describedBy = [helpId, ...errorIds].filter(Boolean).join(" ");
        const required = requiredNames.has(field.name);
        const isBoolean = field.metadata.kind === "boolean";

        return (
          <div
            className={`${styles.field} ${isBoolean ? styles.booleanField : ""}`}
            key={field.name}
          >
            <label
              className={isBoolean ? styles.booleanLabel : styles.label}
              htmlFor={controlId}
            >
              {isBoolean
                ? renderControl(
                    field,
                    controlId,
                    describedBy || undefined,
                    fieldIssues.length > 0,
                    required,
                  )
                : null}
              <span>
                {field.metadata.label}
                {required ? (
                  <span className={styles.required}> (required)</span>
                ) : null}
              </span>
            </label>

            {isBoolean
              ? null
              : renderControl(
                  field,
                  controlId,
                  describedBy || undefined,
                  fieldIssues.length > 0,
                  required,
                )}

            {field.metadata.helpText === undefined ? null : (
              <p className={styles.help} id={helpId}>
                {field.metadata.helpText}
              </p>
            )}

            {fieldIssues.length > 0 ? (
              <ul className={styles.errors}>
                {fieldIssues.map((issue, index) => (
                  <li id={errorIds[index]} key={`${issue.message}-${index}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}

      <button className={styles.submit} type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
