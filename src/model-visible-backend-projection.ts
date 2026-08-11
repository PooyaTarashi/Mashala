"use client";

import type { JsonObject, JsonValue } from "./forms";
import {
  containsCredentialLikeKey,
  copyModelVisibleBackendProjection,
  type ModelVisibleBackendProjection,
} from "./model-visible-backend-projection-policy";
import {
  RUNTIME_PROTOCOL_VERSION,
  type SelectedBackendContextEvent,
} from "./runtime-protocol";

export type ModelVisibleProjectionErrorCode =
  | "invalid_projection"
  | "invalid_source"
  | "non_serializable_data"
  | "forbidden_data";

export interface ModelVisibleProjectionError {
  readonly code: ModelVisibleProjectionErrorCode;
  readonly message: string;
}

export type ModelVisibleProjectionResult =
  | { readonly outcome: "not-configured" }
  | {
      readonly outcome: "projected";
      readonly purpose: ModelVisibleBackendProjection["purpose"];
      readonly data: JsonValue;
    }
  | {
      readonly outcome: "failure";
      readonly error: ModelVisibleProjectionError;
    };

export interface ModelVisibleReadSource {
  readonly modelContext?: ModelVisibleBackendProjection;
}

export interface SelectedBackendContextEventInput {
  readonly source: ModelVisibleReadSource;
  readonly backendResult: unknown;
  readonly capabilityId: string;
  readonly eventId: string;
  readonly conversationId: string;
  readonly inReplyTo?: string;
}

export interface ProjectedBackendContext {
  readonly purpose: ModelVisibleBackendProjection["purpose"];
  readonly data: JsonValue;
}

export interface ProjectedBackendContextEventInput {
  readonly source: ModelVisibleReadSource;
  readonly context: ProjectedBackendContext;
  readonly capabilityId: string;
  readonly eventId: string;
  readonly conversationId: string;
  readonly inReplyTo?: string;
}

export type SelectedBackendContextEventResult =
  | { readonly outcome: "not-configured" }
  | {
      readonly outcome: "projected";
      readonly event: SelectedBackendContextEvent;
    }
  | {
      readonly outcome: "failure";
      readonly error: ModelVisibleProjectionError;
    };

class ProjectionFailure extends Error {
  constructor(
    readonly code: Exclude<ModelVisibleProjectionErrorCode, "invalid_projection">,
    message: string,
  ) {
    super(message);
  }
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function cloneJsonValue(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ProjectionFailure(
        "non_serializable_data",
        "A selected property is not plain serializable JSON data.",
      );
    }
    return value;
  }

  if (typeof value !== "object" || ancestors.has(value)) {
    throw new ProjectionFailure(
      "non_serializable_data",
      "A selected property is not plain serializable JSON data.",
    );
  }

  ancestors.add(value);

  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (
      keys.length !== value.length ||
      value.some((_item, index) => !hasOwn(value, String(index)))
    ) {
      ancestors.delete(value);
      throw new ProjectionFailure(
        "non_serializable_data",
        "A selected property is not plain serializable JSON data.",
      );
    }

    const cloned = value.map((item) => cloneJsonValue(item, ancestors));
    ancestors.delete(value);
    return Object.freeze(cloned);
  }

  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
    ancestors.delete(value);
    throw new ProjectionFailure(
      "non_serializable_data",
      "A selected property is not plain serializable JSON data.",
    );
  }

  const entries = Object.keys(value).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !hasOwn(descriptor, "value")) {
      throw new ProjectionFailure(
        "non_serializable_data",
        "A selected property is not plain serializable JSON data.",
      );
    }
    return [key, cloneJsonValue(descriptor.value, ancestors)] as const;
  });

  ancestors.delete(value);
  return Object.freeze(Object.fromEntries(entries)) as JsonObject;
}

function projectRecord(
  record: unknown,
  fields: Readonly<Record<string, string>>,
): JsonObject {
  if (!isPlainRecord(record)) {
    throw new ProjectionFailure(
      "invalid_source",
      "The backend result must be a root object or an array of objects.",
    );
  }

  const entries = Object.entries(fields).map(([outputName, sourceName]) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, sourceName);
    if (descriptor?.enumerable !== true || !hasOwn(descriptor, "value")) {
      throw new ProjectionFailure(
        "invalid_source",
        `The selected source property "${sourceName}" is missing or unreadable.`,
      );
    }

    return [outputName, cloneJsonValue(descriptor.value)] as const;
  });

  const projected = Object.freeze(Object.fromEntries(entries)) as JsonObject;
  if (containsCredentialLikeKey(projected)) {
    throw new ProjectionFailure(
      "forbidden_data",
      "The projected result contains prohibited credential-like data.",
    );
  }

  return projected;
}

/**
 * Applies only the developer-declared direct-property projection. This module
 * is client-marked so a full backend result need not cross the server boundary.
 */
export function projectModelVisibleBackendData(
  backendResult: unknown,
  projection: unknown,
): ModelVisibleProjectionResult {
  if (projection === undefined) {
    return { outcome: "not-configured" };
  }

  let validatedProjection: ModelVisibleBackendProjection;
  try {
    validatedProjection = copyModelVisibleBackendProjection(projection);
  } catch {
    return {
      outcome: "failure",
      error: {
        code: "invalid_projection",
        message: "The model-visible backend projection is malformed.",
      },
    };
  }

  try {
    const data = Array.isArray(backendResult)
      ? Object.freeze(
          backendResult.map((item) =>
            projectRecord(item, validatedProjection.fields),
          ),
        )
      : projectRecord(backendResult, validatedProjection.fields);

    return {
      outcome: "projected",
      purpose: validatedProjection.purpose,
      data,
    };
  } catch (error) {
    if (error instanceof ProjectionFailure) {
      return {
        outcome: "failure",
        error: { code: error.code, message: error.message },
      };
    }

    return {
      outcome: "failure",
      error: {
        code: "invalid_source",
        message: "The backend result could not be projected.",
      },
    };
  }
}

/** Projects in the browser and constructs the existing protocol event. */
export function createSelectedBackendContextEvent({
  source,
  backendResult,
  capabilityId,
  eventId,
  conversationId,
  inReplyTo,
}: SelectedBackendContextEventInput): SelectedBackendContextEventResult {
  const projection = projectModelVisibleBackendData(
    backendResult,
    source.modelContext,
  );

  if (projection.outcome !== "projected") {
    return projection;
  }

  return createSelectedBackendContextEventFromProjection({
    source,
    context: { purpose: projection.purpose, data: projection.data },
    capabilityId,
    eventId,
    conversationId,
    ...(inReplyTo === undefined ? {} : { inReplyTo }),
  });
}

/** Constructs the protocol event from data already minimized in the browser. */
export function createSelectedBackendContextEventFromProjection({
  source,
  context,
  capabilityId,
  eventId,
  conversationId,
  inReplyTo,
}: ProjectedBackendContextEventInput): SelectedBackendContextEventResult {
  if (source.modelContext === undefined) {
    return { outcome: "not-configured" };
  }

  let validatedProjection: ModelVisibleBackendProjection;
  try {
    validatedProjection = copyModelVisibleBackendProjection(
      source.modelContext,
    );
  } catch {
    return {
      outcome: "failure",
      error: {
        code: "invalid_projection",
        message: "The model-visible backend projection is malformed.",
      },
    };
  }

  if (context.purpose !== validatedProjection.purpose) {
    return {
      outcome: "failure",
      error: {
        code: "invalid_projection",
        message: "The projected context purpose does not match its declaration.",
      },
    };
  }

  let isolatedData: JsonValue;
  try {
    isolatedData = cloneJsonValue(context.data);
  } catch (error) {
    if (error instanceof ProjectionFailure) {
      return {
        outcome: "failure",
        error: { code: error.code, message: error.message },
      };
    }

    return {
      outcome: "failure",
      error: {
        code: "non_serializable_data",
        message: "The projected result is not plain serializable JSON data.",
      },
    };
  }

  if (containsCredentialLikeKey(isolatedData)) {
    return {
      outcome: "failure",
      error: {
        code: "forbidden_data",
        message: "The projected result contains prohibited credential-like data.",
      },
    };
  }

  const expectedOutputNames = Object.keys(validatedProjection.fields);
  const projectedRecords = Array.isArray(isolatedData)
    ? isolatedData
    : [isolatedData];
  const hasDeclaredShape = projectedRecords.every(
    (record) =>
      isPlainRecord(record) &&
      Object.keys(record).length === expectedOutputNames.length &&
      expectedOutputNames.every((name) => hasOwn(record, name)),
  );

  if (!hasDeclaredShape) {
    return {
      outcome: "failure",
      error: {
        code: "invalid_source",
        message:
          "The projected result does not match the declared output properties.",
      },
    };
  }

  return {
    outcome: "projected",
    event: Object.freeze({
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      eventId,
      conversationId,
      ...(inReplyTo === undefined ? {} : { inReplyTo }),
      type: "backend.context.selected" as const,
      payload: Object.freeze({
        capabilityId,
        purpose: context.purpose,
        data: isolatedData,
      }),
    }),
  };
}
