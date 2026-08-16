import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

import type { FormValue } from "./form-renderer";
import type { FormDefinition, JsonSchema202012 } from "./forms";

export type FormValueProposalResult<FieldName extends string = string> =
  | {
      readonly accepted: true;
      readonly values: FormValue<FieldName>;
    }
  | {
      readonly accepted: false;
      readonly reason: "undeclared_fields" | "invalid_values";
    };

const validators = new WeakMap<FormDefinition, ValidateFunction>();

function modelEligibleProperties(
  form: FormDefinition,
): Readonly<Record<string, JsonSchema202012>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(form.schema.properties).filter(
        ([name]) => form.fields[name]?.kind !== "reference",
      ),
    ),
  );
}

function proposalValidator(form: FormDefinition): ValidateFunction {
  const existing = validators.get(form);
  if (existing !== undefined) {
    return existing;
  }

  const schema: JsonSchema202012 = {
    $schema: form.schema.$schema,
    type: "object",
    properties: modelEligibleProperties(form),
    additionalProperties: false,
  };
  const validator = new Ajv2020({ allErrors: true }).compile(schema);
  validators.set(form, validator);
  return validator;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Rechecks an untrusted partial proposal at the browser boundary. Reference
 * values, undeclared keys, and values outside the declared property schemas
 * fail closed. Accepted values are copied into an editable form-value shape.
 */
export function validateFormValueProposal<FieldName extends string>(
  form: FormDefinition<FieldName>,
  proposal: unknown,
): FormValueProposalResult<FieldName> {
  if (!isPlainRecord(proposal)) {
    return { accepted: false, reason: "invalid_values" };
  }

  const eligibleProperties = modelEligibleProperties(form);
  if (
    Object.keys(proposal).some(
      (name) => !Object.prototype.hasOwnProperty.call(eligibleProperties, name),
    )
  ) {
    return { accepted: false, reason: "undeclared_fields" };
  }

  const validator = proposalValidator(form);
  if (!validator(proposal)) {
    return { accepted: false, reason: "invalid_values" };
  }

  return {
    accepted: true,
    values: Object.freeze({ ...proposal }) as FormValue<FieldName>,
  };
}

/** Merges only a proposal that passed the deterministic partial-form schema. */
export function mergeFormValueProposal<FieldName extends string>(
  form: FormDefinition<FieldName>,
  current: FormValue<FieldName>,
  proposal: unknown,
): FormValueProposalResult<FieldName> {
  const validation = validateFormValueProposal(form, proposal);

  if (!validation.accepted) {
    return validation;
  }

  return {
    accepted: true,
    values: Object.freeze({ ...current, ...validation.values }),
  };
}
