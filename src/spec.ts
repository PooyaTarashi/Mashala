import type { FormDefinition } from "./forms";

export type {
  BooleanFieldMetadata,
  FieldMetadata,
  FieldPresentationBase,
  FormDefinition,
  FormObjectSchema,
  JsonObject,
  JsonPrimitive,
  JsonSchema202012,
  JsonValue,
  LongTextFieldMetadata,
  NumberFieldMetadata,
  ReferenceFieldMetadata,
  SelectFieldMetadata,
  TextFieldMetadata,
} from "./forms";
export type {
  ModelContextPurpose,
  ModelVisibleBackendProjection,
} from "./model-visible-backend-projection-policy";
import type { ModelVisibleBackendProjection as ModelVisibleBackendProjectionContract } from "./model-visible-backend-projection-policy";

export interface MashalaSpec {
  readonly specVersion: "0.2";
  readonly app: AppMetadata;
  readonly capabilities: readonly CapabilitySpec[];
}

export interface AppMetadata {
  /** Stable machine ID: lowercase letters, digits, and underscores. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface CapabilitySpec<FieldName extends string = string> {
  /** Stable machine ID: lowercase letters, digits, and underscores. */
  readonly id: string;

  /** Natural-language description supplied to capability routing. */
  readonly description: string;

  readonly form: FormDefinition<FieldName>;
  readonly operation: BackendOperation;
  readonly confirmation: ConfirmationPolicy;
}

export interface BackendOperation {
  readonly method: "POST" | "PUT" | "PATCH";

  /** Relative target-backend path beginning with `/`; no origin or headers. */
  readonly path: string;
}

export type ConfirmationPolicy = "required" | "none";

/** ADR-016's declarative direct-property projection policy. */
export type ModelVisibleDataPolicy = ModelVisibleBackendProjectionContract;

const SUPPORTED_METHODS: readonly BackendOperation["method"][] = [
  "POST",
  "PUT",
  "PATCH",
];

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalidOperation(message: string): never {
  throw new TypeError(`Invalid backend operation: ${message}`);
}

/** Runtime-checks serialized operation data before it controls a request. */
export function assertBackendOperation(
  operation: unknown,
): asserts operation is BackendOperation {
  if (
    typeof operation !== "object" ||
    operation === null ||
    Array.isArray(operation)
  ) {
    invalidOperation("expected an object containing only method and path.");
  }

  const keys = Object.keys(operation);
  if (
    keys.length !== 2 ||
    !hasOwn(operation, "method") ||
    !hasOwn(operation, "path")
  ) {
    invalidOperation("expected an object containing only method and path.");
  }

  const method: unknown = Reflect.get(operation, "method");
  if (
    typeof method !== "string" ||
    !SUPPORTED_METHODS.some((supportedMethod) => supportedMethod === method)
  ) {
    invalidOperation("method must be POST, PUT, or PATCH.");
  }

  const path: unknown = Reflect.get(operation, "path");
  if (typeof path !== "string") {
    invalidOperation("path must be a string.");
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    invalidOperation('path must begin with exactly one "/".');
  }

  if (path.includes("\\")) {
    invalidOperation(
      "path must resolve within the supplied target backend origin.",
    );
  }

  if (path.includes("?")) {
    invalidOperation("path must not contain a query string.");
  }

  if (path.includes("#")) {
    invalidOperation("path must not contain a fragment.");
  }
}

/** Runtime-checks serialized confirmation data before it controls execution. */
export function assertConfirmationPolicy(
  policy: unknown,
): asserts policy is ConfirmationPolicy {
  if (policy !== "required" && policy !== "none") {
    throw new TypeError(
      'Invalid confirmation policy: expected "required" or "none".',
    );
  }
}
