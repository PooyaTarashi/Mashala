import {
  compileForm,
  type FormFieldName,
  type FormFields,
} from "./forms";
import {
  assertBackendOperation,
  assertConfirmationPolicy,
  type BackendOperation,
  type CapabilitySpec,
  type ConfirmationPolicy,
} from "./spec";

export interface CapabilityDeclaration<Fields extends FormFields> {
  readonly id: string;
  readonly description: string;
  readonly fields: Fields;
  readonly operation: BackendOperation;
  readonly confirmation: ConfirmationPolicy;
}

const STABLE_ID = /^[a-z][a-z0-9_]*$/;

function assertCapabilityId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !STABLE_ID.test(id)) {
    throw new TypeError(
      "Invalid capability ID: expected lowercase letters, digits, and underscores, beginning with a letter.",
    );
  }
}

function assertCapabilityDescription(
  description: unknown,
): asserts description is string {
  if (typeof description !== "string") {
    throw new TypeError(
      "Invalid capability description: expected a string.",
    );
  }
}

/**
 * Compiles one developer declaration into the current canonical capability
 * contract.
 */
export function defineCapability<const Fields extends FormFields>(
  declaration: CapabilityDeclaration<Fields>,
): CapabilitySpec<FormFieldName<Fields>> {
  assertCapabilityId(declaration.id);
  assertCapabilityDescription(declaration.description);
  assertBackendOperation(declaration.operation);
  assertConfirmationPolicy(declaration.confirmation);

  const operation = Object.freeze({
    method: declaration.operation.method,
    path: declaration.operation.path,
  });

  return Object.freeze({
    id: declaration.id,
    description: declaration.description,
    form: compileForm(declaration.fields),
    operation,
    confirmation: declaration.confirmation,
  });
}
