"use client";

import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

import type { FormDefinition, JsonObject, JsonValue } from "./forms";
import { projectModelVisibleBackendData } from "./model-visible-backend-projection";
import {
  assertReadBackendOperation,
  type ReadCapabilitySpec,
  type ResultCard,
  type ResultPropertyValue,
} from "./spec";
import {
  requestTargetBackend,
  type TargetBackendRequest,
} from "./target-backend-request";
import { resolveTargetBackendUrl } from "./target-backend-url";

export interface ExecuteReadCapabilityInput {
  readonly baseUrl: string | URL;
  readonly capability: ReadCapabilitySpec;
  readonly input?: Readonly<Record<string, JsonValue>>;
  /** Target-app browser request behavior, including its existing auth context. */
  readonly request?: TargetBackendRequest;
  /** Optional browser cancellation signal owned by the page workflow. */
  readonly signal?: AbortSignal;
}

export type ReadResultData = JsonObject | readonly JsonObject[];

export type ReadCapabilityResult =
  | {
      readonly outcome: "input-required";
      readonly input: FormDefinition;
    }
  | {
      readonly outcome: "input-error";
      readonly reason: "undeclared-input" | "invalid-input";
    }
  | {
      readonly outcome: "success";
      readonly response: Response;
      readonly data: ReadResultData;
      readonly modelContext?: {
        readonly purpose: "reference_resolution" | "result_interpretation";
        readonly data: JsonValue;
      };
    }
  | { readonly outcome: "http-error"; readonly response: Response }
  | { readonly outcome: "malformed-json"; readonly response: Response }
  | { readonly outcome: "response-shape-error"; readonly response: Response }
  | { readonly outcome: "network-error" };

const validators = new WeakMap<FormDefinition, ValidateFunction>();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function completeValidator(input: FormDefinition): ValidateFunction {
  const existing = validators.get(input);
  if (existing !== undefined) {
    return existing;
  }
  const validator = new Ajv2020({ allErrors: true }).compile(input.schema);
  validators.set(input, validator);
  return validator;
}

function hasMissingRequiredInput(
  input: FormDefinition,
  value: Record<string, unknown>,
): boolean {
  return (input.schema.required ?? []).some(
    (name) => !Object.prototype.hasOwnProperty.call(value, name),
  );
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /[!'()*]/gu,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function scalarText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  throw new TypeError("Invalid read input: URL-bound values must be scalar.");
}

/** Resolves only already-validated values through developer-declared bindings. */
function resolveReadCapabilityPath(
  capability: ReadCapabilitySpec,
  value: Readonly<Record<string, JsonValue>>,
): string {
  assertReadBackendOperation(capability.operation, capability.input);
  let path = capability.operation.path;
  for (const [placeholder, inputName] of Object.entries(
    capability.operation.bindings?.path ?? {},
  )) {
    path = path.replace(
      `{${placeholder}}`,
      encodeRfc3986(scalarText(value[inputName])),
    );
  }

  const query = Object.entries(capability.operation.bindings?.query ?? {})
    .filter(([, inputName]) => value[inputName] !== undefined)
    .map(
      ([queryName, inputName]) =>
        `${queryName}=${encodeRfc3986(scalarText(value[inputName]))}`,
    );
  return query.length === 0 ? path : `${path}?${query.join("&")}`;
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
      throw new TypeError("Response contains a non-finite number.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(copyJsonValue));
  }
  if (!isPlainRecord(value)) {
    throw new TypeError("Response contains a non-JSON object.");
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyJsonValue(item)]),
    ),
  );
}

function validateResultRoot(
  capability: ReadCapabilitySpec,
  value: unknown,
  baseUrl: string | URL,
): ReadResultData | undefined {
  if (capability.result.kind === "card") {
    if (!isPlainRecord(value) || !validCardItem(capability.result.card, value, baseUrl)) {
      return undefined;
    }
    return copyJsonValue(value) as JsonObject;
  }
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        !isPlainRecord(item) ||
        !validCardItem(capability.result.card, item, baseUrl),
    )
  ) {
    return undefined;
  }
  return copyJsonValue(value) as readonly JsonObject[];
}

function directProperty(
  item: Record<string, unknown>,
  property: string,
): unknown {
  return Object.prototype.hasOwnProperty.call(item, property) &&
    Object.prototype.propertyIsEnumerable.call(item, property)
    ? item[property]
    : undefined;
}

function validFullDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, 1);
  date.setUTCDate(day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validDateTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) && Number.isFinite(Date.parse(value))
  );
}

function validImageUrl(value: string, baseUrl: string | URL): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    try {
      resolveTargetBackendUrl(
        baseUrl,
        value,
        "Invalid result image URL.",
      );
      return true;
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function validPropertyValue(
  descriptor: ResultPropertyValue,
  item: Record<string, unknown>,
): boolean {
  const value = directProperty(item, descriptor.property);
  switch (descriptor.formatter.kind) {
    case "text":
      return typeof value === "string";
    case "number":
    case "currency":
      return typeof value === "number" && Number.isFinite(value);
    case "date":
      return typeof value === "string" && validFullDate(value);
    case "dateTime":
      return typeof value === "string" && validDateTime(value);
  }
}

function validCardItem(
  card: ResultCard,
  item: Record<string, unknown>,
  baseUrl: string | URL,
): boolean {
  if (card.title.kind === "property" && !validPropertyValue(card.title, item)) {
    return false;
  }
  if (
    card.description?.kind === "property" &&
    !validPropertyValue(card.description, item)
  ) {
    return false;
  }
  if (
    card.facts?.some((fact) => !validPropertyValue(fact.value, item)) === true
  ) {
    return false;
  }
  if (card.image !== undefined) {
    const imageValue = directProperty(item, card.image.source.property);
    if (typeof imageValue !== "string" || !validImageUrl(imageValue, baseUrl)) {
      return false;
    }
  }
  return true;
}

/**
 * Validates input, resolves the declared URL, and executes one direct browser
 * GET through TargetBackendRequest. It never accepts request control data from
 * an LLM and never calls a Mashala server route.
 */
export async function executeReadCapability({
  baseUrl,
  capability,
  input: suppliedInput,
  request,
  signal,
}: ExecuteReadCapabilityInput): Promise<ReadCapabilityResult> {
  assertReadBackendOperation(capability.operation, capability.input);

  const value: Record<string, unknown> = suppliedInput === undefined
    ? {}
    : suppliedInput;
  if (!isPlainRecord(value)) {
    return { outcome: "input-error", reason: "invalid-input" };
  }

  if (capability.input === undefined) {
    if (Object.keys(value).length > 0) {
      return { outcome: "input-error", reason: "undeclared-input" };
    }
  } else {
    const declaredNames = Object.keys(capability.input.schema.properties);
    if (Object.keys(value).some((name) => !declaredNames.includes(name))) {
      return { outcome: "input-error", reason: "undeclared-input" };
    }
    if (hasMissingRequiredInput(capability.input, value)) {
      return { outcome: "input-required", input: capability.input };
    }
    if (!completeValidator(capability.input)(value)) {
      return { outcome: "input-error", reason: "invalid-input" };
    }
  }

  const path = resolveReadCapabilityPath(
    capability,
    value as Readonly<Record<string, JsonValue>>,
  );
  const url = resolveTargetBackendUrl(
    baseUrl,
    path,
    "Invalid read operation: path must resolve within the supplied target backend origin.",
  );

  let response: Response;
  try {
    response = await requestTargetBackend(request, url.href, {
      method: "GET",
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    return { outcome: "network-error" };
  }
  if (!response.ok) {
    return { outcome: "http-error", response };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { outcome: "malformed-json", response };
  }

  let data: ReadResultData | undefined;
  try {
    data = validateResultRoot(capability, parsed, baseUrl);
  } catch {
    data = undefined;
  }
  if (data === undefined) {
    return { outcome: "response-shape-error", response };
  }

  const projection = projectModelVisibleBackendData(
    parsed,
    capability.operation.modelContext,
  );
  return {
    outcome: "success",
    response,
    data,
    ...(projection.outcome === "projected"
      ? {
          modelContext: Object.freeze({
            purpose: projection.purpose,
            data: projection.data,
          }),
        }
      : {}),
  };
}
