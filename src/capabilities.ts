import {
  compileForm,
  type FormFieldName,
  type FormFields,
} from "./forms";
import {
  assertBackendOperation,
  assertConfirmationPolicy,
  assertReadBackendOperation,
  type BackendOperation,
  type ConfirmationPolicy,
  type ReadBackendOperation,
  type ReadCapabilitySpec,
  type ResultView,
  type WriteCapabilitySpec,
} from "./spec";
import { copyModelVisibleBackendProjection } from "./model-visible-backend-projection-policy";
import { copyResultView } from "./results";

export { result } from "./results";

export interface CapabilityDeclaration<Fields extends FormFields> {
  readonly id: string;
  readonly description: string;
  readonly fields: Fields;
  readonly operation: BackendOperation;
  readonly confirmation: ConfirmationPolicy;
}

export interface ReadCapabilityDeclaration<Fields extends FormFields> {
  readonly id: string;
  readonly description: string;
  readonly input: Fields;
  readonly operation: ReadBackendOperation;
  readonly result: ResultView;
}

export interface ZeroInputReadCapabilityDeclaration {
  readonly id: string;
  readonly description: string;
  readonly operation: ReadBackendOperation;
  readonly result: ResultView;
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
): WriteCapabilitySpec<FormFieldName<Fields>> {
  assertCapabilityId(declaration.id);
  assertCapabilityDescription(declaration.description);
  assertBackendOperation(declaration.operation);
  assertConfirmationPolicy(declaration.confirmation);

  const operation = Object.freeze({
    method: declaration.operation.method,
    path: declaration.operation.path,
  });

  return Object.freeze({
    kind: "write" as const,
    id: declaration.id,
    description: declaration.description,
    form: compileForm(declaration.fields),
    operation,
    confirmation: declaration.confirmation,
  });
}

function copyReadOperation(
  operation: ReadBackendOperation,
): ReadBackendOperation {
  const pathBindings = operation.bindings?.path;
  const queryBindings = operation.bindings?.query;
  const bindings =
    operation.bindings === undefined
      ? undefined
      : Object.freeze({
          ...(pathBindings === undefined
            ? {}
            : { path: Object.freeze({ ...pathBindings }) }),
          ...(queryBindings === undefined
            ? {}
            : { query: Object.freeze({ ...queryBindings }) }),
        });
  const modelContext =
    operation.modelContext === undefined
      ? undefined
      : copyModelVisibleBackendProjection(operation.modelContext);

  return Object.freeze({
    method: "GET",
    path: operation.path,
    ...(bindings === undefined ? {} : { bindings }),
    ...(modelContext === undefined ? {} : { modelContext }),
  });
}

export function defineReadCapability(
  declaration: ZeroInputReadCapabilityDeclaration,
): ReadCapabilitySpec;
export function defineReadCapability<const Fields extends FormFields>(
  declaration: ReadCapabilityDeclaration<Fields>,
): ReadCapabilitySpec<FormFieldName<Fields>>;
/** Compiles one developer-declared browser GET into canonical v0.3 data. */
export function defineReadCapability<const Fields extends FormFields>(
  declaration:
    | ZeroInputReadCapabilityDeclaration
    | ReadCapabilityDeclaration<Fields>,
): ReadCapabilitySpec<FormFieldName<Fields>> {
  assertCapabilityId(declaration.id);
  assertCapabilityDescription(declaration.description);

  const input = "input" in declaration
    ? compileForm(declaration.input)
    : undefined;
  assertReadBackendOperation(declaration.operation, input);

  return Object.freeze({
    kind: "read" as const,
    id: declaration.id,
    description: declaration.description,
    ...(input === undefined ? {} : { input }),
    operation: copyReadOperation(declaration.operation),
    result: copyResultView(declaration.result),
  });
}
