import Ajv2020 from "ajv/dist/2020.js";

import type {
  FieldMetadata,
  FormDefinition,
  JsonObject,
  JsonValue,
} from "./forms";
import { copyModelVisibleBackendProjection } from "./model-visible-backend-projection-policy";
import {
  assertBackendOperation,
  assertConfirmationPolicy,
  assertReadBackendOperation,
  type AppMetadata,
  type CapabilitySpec,
  type MashalaSpec,
  type ReadBackendOperation,
  type ReadCapabilitySpec,
  type WriteCapabilitySpec,
} from "./spec";
import { copyResultView } from "./results";

export const CURRENT_MASHALA_SPEC_VERSION = "0.4" as const;

export interface MashalaApplicationDefinition<
  Capability extends CapabilitySpec = CapabilitySpec,
> {
  readonly app: AppMetadata;
  readonly capabilities: readonly Capability[];
}

export type DefinedMashalaSpec<Capability extends CapabilitySpec> = Omit<
  MashalaSpec,
  "capabilities"
> & {
  readonly capabilities: readonly Capability[];
};

export type MashalaApplicationConfigurationErrorCode =
  | "missing_application_definition"
  | "malformed_spec"
  | "unsupported_spec_version";

/** A stable, sanitized configuration failure safe for application startup. */
export class MashalaApplicationConfigurationError extends Error {
  readonly code: MashalaApplicationConfigurationErrorCode;

  constructor(
    code: MashalaApplicationConfigurationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MashalaApplicationConfigurationError";
    this.code = code;
  }
}

const STABLE_ID = /^[a-z][a-z0-9_]*$/;
const JSON_SCHEMA_2020_12 =
  "https://json-schema.org/draft/2020-12/schema" as const;

function configurationError(
  code: MashalaApplicationConfigurationErrorCode,
  message: string,
): never {
  throw new MashalaApplicationConfigurationError(code, message);
}

function malformedSpec(): never {
  configurationError(
    "malformed_spec",
    "Mashala application configuration contains a malformed MashalaSpec.",
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): boolean {
  const keys = Object.keys(value);
  return (
    keys.every((key) => allowed.includes(key)) &&
    required.every((key) => hasOwn(value, key))
  );
}

function copyJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      malformedSpec();
    }
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(value.map(copyJsonValue));
  }

  if (!isPlainRecord(value)) {
    malformedSpec();
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyJsonValue(item)]),
    ),
  );
}

function copyAppMetadata(value: unknown): AppMetadata {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["id", "name", "description"]) ||
    typeof value.id !== "string" ||
    !STABLE_ID.test(value.id) ||
    typeof value.name !== "string" ||
    typeof value.description !== "string"
  ) {
    malformedSpec();
  }

  return Object.freeze({
    id: value.id,
    name: value.name,
    description: value.description,
  });
}

function copyStringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isPlainRecord(value)) {
    malformedSpec();
  }

  const entries = Object.entries(value);
  if (entries.some(([key, item]) => key === "" || typeof item !== "string")) {
    malformedSpec();
  }

  return Object.freeze(
    Object.fromEntries(entries as readonly [string, string][]),
  );
}

function copyFieldMetadata(value: unknown): FieldMetadata {
  if (
    !isPlainRecord(value) ||
    typeof value.kind !== "string" ||
    typeof value.label !== "string" ||
    (value.helpText !== undefined && typeof value.helpText !== "string")
  ) {
    malformedSpec();
  }

  const presentation = {
    label: value.label,
    ...(value.helpText === undefined ? {} : { helpText: value.helpText }),
  };

  switch (value.kind) {
    case "text":
    case "longText":
    case "number":
    case "boolean":
      if (!hasExactKeys(value, ["kind", "label", "helpText"], ["kind", "label"])) {
        malformedSpec();
      }
      return Object.freeze({ kind: value.kind, ...presentation });

    case "select":
      if (
        !hasExactKeys(
          value,
          ["kind", "label", "helpText", "optionLabels"],
          ["kind", "label", "optionLabels"],
        )
      ) {
        malformedSpec();
      }
      return Object.freeze({
        kind: "select",
        ...presentation,
        optionLabels: copyStringRecord(value.optionLabels),
      });

    case "reference": {
      if (
        !hasExactKeys(
          value,
          ["kind", "label", "helpText", "source", "value", "labelFrom"],
          ["kind", "label", "source", "value", "labelFrom"],
        ) ||
        typeof value.value !== "string" ||
        value.value.length === 0 ||
        typeof value.labelFrom !== "string" ||
        value.labelFrom.length === 0 ||
        !isPlainRecord(value.source) ||
        !hasExactKeys(
          value.source,
          ["method", "path", "modelContext"],
          ["method", "path"],
        ) ||
        value.source.method !== "GET" ||
        typeof value.source.path !== "string" ||
        !value.source.path.startsWith("/") ||
        value.source.path.startsWith("//") ||
        value.source.path.includes("\\") ||
        value.source.path.includes("?") ||
        value.source.path.includes("#")
      ) {
        malformedSpec();
      }

      let modelContext;
      if (value.source.modelContext !== undefined) {
        try {
          modelContext = copyModelVisibleBackendProjection(
            value.source.modelContext,
          );
        } catch {
          malformedSpec();
        }
      }

      return Object.freeze({
        kind: "reference",
        ...presentation,
        source: Object.freeze({
          method: "GET" as const,
          path: value.source.path,
          ...(modelContext === undefined ? {} : { modelContext }),
        }),
        value: value.value,
        labelFrom: value.labelFrom,
      });
    }

    default:
      return malformedSpec();
  }
}

function copyForm(value: unknown): FormDefinition {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["schema", "fields"]) ||
    !isPlainRecord(value.schema) ||
    !hasExactKeys(
      value.schema,
      ["$schema", "$id", "type", "properties", "required", "additionalProperties"],
      ["$schema", "type", "properties", "additionalProperties"],
    ) ||
    value.schema.$schema !== JSON_SCHEMA_2020_12 ||
    (value.schema.$id !== undefined && typeof value.schema.$id !== "string") ||
    value.schema.type !== "object" ||
    value.schema.additionalProperties !== false ||
    !isPlainRecord(value.schema.properties) ||
    !isPlainRecord(value.fields)
  ) {
    malformedSpec();
  }

  const properties = Object.freeze(
    Object.fromEntries(
      Object.entries(value.schema.properties).map(([name, schema]) => {
        if (name === "" || !isPlainRecord(schema)) {
          malformedSpec();
        }
        return [name, copyJsonValue(schema) as JsonObject];
      }),
    ),
  );

  let required: readonly string[] | undefined;
  if (value.schema.required !== undefined) {
    if (
      !Array.isArray(value.schema.required) ||
      !value.schema.required.every(
        (name): name is string => typeof name === "string" && hasOwn(properties, name),
      ) ||
      new Set(value.schema.required).size !== value.schema.required.length
    ) {
      malformedSpec();
    }
    required = Object.freeze([...value.schema.required]);
  }

  const fieldEntries = Object.entries(value.fields);
  const propertyNames = Object.keys(properties);
  if (
    fieldEntries.length !== propertyNames.length ||
    fieldEntries.some(([name]) => !hasOwn(properties, name))
  ) {
    malformedSpec();
  }

  const fields = Object.freeze(
    Object.fromEntries(
      fieldEntries.map(([name, metadata]) => [name, copyFieldMetadata(metadata)]),
    ),
  );

  for (const name of propertyNames) {
    const schema = properties[name];
    const metadata = fields[name];
    if (schema === undefined || metadata === undefined) {
      malformedSpec();
    }

    if (
      ((metadata.kind === "text" ||
        metadata.kind === "longText" ||
        metadata.kind === "reference") &&
        schema.type !== "string") ||
      (metadata.kind === "number" &&
        schema.type !== "number" &&
        schema.type !== "integer") ||
      (metadata.kind === "boolean" && schema.type !== "boolean")
    ) {
      malformedSpec();
    }

    if (metadata.kind === "select") {
      const values = schema.enum;
      if (
        schema.type !== "string" ||
        !Array.isArray(values) ||
        !values.every((item) => typeof item === "string") ||
        values.length !== Object.keys(metadata.optionLabels).length ||
        values.some((item) => !hasOwn(metadata.optionLabels, item))
      ) {
        malformedSpec();
      }
    }
  }

  const schema = Object.freeze({
    $schema: JSON_SCHEMA_2020_12,
    ...(value.schema.$id === undefined ? {} : { $id: value.schema.$id }),
    type: "object" as const,
    properties,
    ...(required === undefined ? {} : { required }),
    additionalProperties: false as const,
  });

  try {
    new Ajv2020({ allErrors: true }).compile(schema);
  } catch {
    malformedSpec();
  }

  return Object.freeze({ schema, fields });
}

function copyWriteCapability(
  value: Record<string, unknown>,
): WriteCapabilitySpec {
  if (
    !hasExactKeys(value, ["kind", "id", "description", "form", "operation", "confirmation"]) ||
    value.kind !== "write" ||
    typeof value.id !== "string" ||
    !STABLE_ID.test(value.id) ||
    typeof value.description !== "string"
  ) {
    malformedSpec();
  }

  try {
    assertBackendOperation(value.operation);
    assertConfirmationPolicy(value.confirmation);
  } catch {
    malformedSpec();
  }

  return Object.freeze({
    kind: "write",
    id: value.id,
    description: value.description,
    form: copyForm(value.form),
    operation: Object.freeze({
      method: value.operation.method,
      path: value.operation.path,
    }),
    confirmation: value.confirmation,
  });
}

function copyReadBindings(
  value: ReadBackendOperation["bindings"],
): ReadBackendOperation["bindings"] {
  if (value === undefined) {
    return undefined;
  }
  return Object.freeze({
    ...(value.path === undefined
      ? {}
      : { path: Object.freeze({ ...value.path }) }),
    ...(value.query === undefined
      ? {}
      : { query: Object.freeze({ ...value.query }) }),
  });
}

function copyReadCapability(
  value: Record<string, unknown>,
): ReadCapabilitySpec {
  if (
    !hasExactKeys(
      value,
      ["kind", "id", "description", "input", "operation", "result"],
      ["kind", "id", "description", "operation", "result"],
    ) ||
    value.kind !== "read" ||
    typeof value.id !== "string" ||
    !STABLE_ID.test(value.id) ||
    typeof value.description !== "string"
  ) {
    malformedSpec();
  }

  const input = value.input === undefined ? undefined : copyForm(value.input);
  try {
    assertReadBackendOperation(value.operation, input);
  } catch {
    malformedSpec();
  }

  let modelContext;
  if (value.operation.modelContext !== undefined) {
    try {
      modelContext = copyModelVisibleBackendProjection(
        value.operation.modelContext,
      );
    } catch {
      malformedSpec();
    }
  }

  let result;
  try {
    result = copyResultView(value.result);
  } catch {
    malformedSpec();
  }

  const bindings = copyReadBindings(value.operation.bindings);
  return Object.freeze({
    kind: "read",
    id: value.id,
    description: value.description,
    ...(input === undefined ? {} : { input }),
    operation: Object.freeze({
      method: "GET",
      path: value.operation.path,
      ...(bindings === undefined ? {} : { bindings }),
      ...(modelContext === undefined ? {} : { modelContext }),
    }),
    result,
  });
}

function copyCapability(value: unknown): CapabilitySpec {
  if (!isPlainRecord(value)) {
    malformedSpec();
  }

  if (value.kind === "write") {
    return copyWriteCapability(value);
  }
  if (value.kind === "read") {
    return copyReadCapability(value);
  }
  return malformedSpec();
}

function copyApplicationDefinition(
  value: unknown,
): Omit<MashalaSpec, "specVersion"> {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["app", "capabilities"]) ||
    !Array.isArray(value.capabilities)
  ) {
    malformedSpec();
  }

  const capabilities = value.capabilities.map(copyCapability);
  const capabilityIds = capabilities.map((capability) => capability.id);
  if (new Set(capabilityIds).size !== capabilityIds.length) {
    malformedSpec();
  }

  return Object.freeze({
    app: copyAppMetadata(value.app),
    capabilities: Object.freeze(capabilities),
  });
}

/**
 * The single application-level authoring helper. It adds the current version
 * to developer-declared canonical metadata and capabilities, validates the
 * complete result, and returns isolated serializable data.
 */
export function defineMashalaApplication<
  const Capability extends CapabilitySpec,
>(
  definition: MashalaApplicationDefinition<Capability>,
): DefinedMashalaSpec<Capability> {
  const copied = copyApplicationDefinition(definition);
  return Object.freeze({
    specVersion: CURRENT_MASHALA_SPEC_VERSION,
    app: copied.app,
    capabilities: copied.capabilities,
  }) as DefinedMashalaSpec<Capability>;
}

/** Validates and isolates an unknown compiled spec at the runtime boundary. */
export function validateMashalaSpec(value: unknown): MashalaSpec {
  if (value === undefined || value === null) {
    configurationError(
      "missing_application_definition",
      "Mashala application configuration is missing a MashalaSpec.",
    );
  }

  if (!isPlainRecord(value) || !hasOwn(value, "specVersion")) {
    malformedSpec();
  }

  if (value.specVersion !== CURRENT_MASHALA_SPEC_VERSION) {
    configurationError(
      "unsupported_spec_version",
      `Mashala application configuration requires MashalaSpec version ${CURRENT_MASHALA_SPEC_VERSION}.`,
    );
  }

  if (!hasExactKeys(value, ["specVersion", "app", "capabilities"])) {
    malformedSpec();
  }

  const copied = copyApplicationDefinition({
    app: value.app,
    capabilities: value.capabilities,
  });

  return Object.freeze({
    specVersion: CURRENT_MASHALA_SPEC_VERSION,
    app: copied.app,
    capabilities: copied.capabilities,
  });
}
