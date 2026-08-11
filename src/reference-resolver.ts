"use client";

import type { ReferenceFieldMetadata } from "./forms";
import { resolveTargetBackendUrl } from "./target-backend-url";

export interface ReferenceOption {
  readonly value: string;
  readonly label: string;
}

export interface ResolveReferenceOptionsInput {
  readonly baseUrl: string | URL;
  readonly field: ReferenceFieldMetadata;
  /** Injectable browser request boundary for target-app auth integration. */
  readonly fetchImpl?: typeof fetch;
}

export type ReferenceResolutionResult =
  | {
      readonly outcome: "success";
      readonly options: readonly ReferenceOption[];
    }
  | { readonly outcome: "http-error" }
  | { readonly outcome: "network-error" }
  | { readonly outcome: "invalid-response" };

function invalidSource(message: string): never {
  throw new TypeError(`Invalid reference source: ${message}`);
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

export function assertReferenceSource(
  source: unknown,
): asserts source is ReferenceFieldMetadata["source"] {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    invalidSource("expected an object containing only method and path.");
  }

  const keys = Object.keys(source);
  if (
    keys.length !== 2 ||
    !hasOwn(source, "method") ||
    !hasOwn(source, "path")
  ) {
    invalidSource("expected an object containing only method and path.");
  }

  if (Reflect.get(source, "method") !== "GET") {
    invalidSource("method must be GET.");
  }

  const path: unknown = Reflect.get(source, "path");
  if (typeof path !== "string") {
    invalidSource("path must be a string.");
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    invalidSource('path must begin with exactly one "/".');
  }

  if (path.includes("\\")) {
    invalidSource("path must resolve within the target backend origin.");
  }

  if (path.includes("?")) {
    invalidSource("path must not contain a query string.");
  }

  if (path.includes("#")) {
    invalidSource("path must not contain a fragment.");
  }
}

/** Deterministically projects a root response array using direct properties. */
export function projectReferenceOptions(
  collection: unknown,
  valueField: string,
  labelField: string,
): readonly ReferenceOption[] {
  if (!Array.isArray(collection)) {
    throw new TypeError("Invalid reference response: expected an array.");
  }

  const seenValues = new Set<string>();
  const options = collection.map((item: unknown, index) => {
    if (!isPlainRecord(item)) {
      throw new TypeError(
        `Invalid reference response: item ${String(index)} must be an object.`,
      );
    }

    const value = item[valueField];
    const label = item[labelField];

    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(
        `Invalid reference response: item ${String(index)} property "${valueField}" must be a non-empty string.`,
      );
    }

    if (typeof label !== "string" || label.length === 0) {
      throw new TypeError(
        `Invalid reference response: item ${String(index)} property "${labelField}" must be a non-empty string.`,
      );
    }

    if (seenValues.has(value)) {
      throw new TypeError(
        `Invalid reference response: duplicate projected value "${value}".`,
      );
    }

    seenValues.add(value);
    return Object.freeze({ value, label });
  });

  return Object.freeze(options);
}

/** Resolves one declared reference source directly from the browser. */
export async function resolveReferenceOptions({
  baseUrl,
  field,
  fetchImpl = fetch,
}: ResolveReferenceOptionsInput): Promise<ReferenceResolutionResult> {
  assertReferenceSource(field.source);

  const url = resolveTargetBackendUrl(
    baseUrl,
    field.source.path,
    "Invalid reference source: path must resolve within the target backend origin.",
  );

  let response: Response;
  try {
    response = await fetchImpl(url.href, { method: "GET" });
  } catch {
    return { outcome: "network-error" };
  }

  if (!response.ok) {
    return { outcome: "http-error" };
  }

  try {
    const collection: unknown = await response.json();
    return {
      outcome: "success",
      options: projectReferenceOptions(
        collection,
        field.value,
        field.labelFrom,
      ),
    };
  } catch {
    return { outcome: "invalid-response" };
  }
}
