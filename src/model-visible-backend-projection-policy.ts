import type { JsonValue } from "./forms";

export const MODEL_CONTEXT_PURPOSES = [
  "reference_resolution",
  "result_interpretation",
] as const;

export type ModelContextPurpose = (typeof MODEL_CONTEXT_PURPOSES)[number];

/**
 * Declarative ADR-016 projection. Keys are projected output property names and
 * values are direct source property names.
 */
export interface ModelVisibleBackendProjection {
  readonly purpose: ModelContextPurpose;
  readonly fields: Readonly<Record<string, string>>;
}

const CREDENTIAL_LIKE_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authentication",
  "authorization",
  "authtoken",
  "bearertoken",
  "clientsecret",
  "cookie",
  "credential",
  "credentials",
  "headers",
  "idtoken",
  "llmapikey",
  "password",
  "passwd",
  "privatekey",
  "proxyauthorization",
  "refreshtoken",
  "requestheaders",
  "responseheaders",
  "secret",
  "sessionid",
  "sessionsecret",
  "sessiontoken",
  "setcookie",
  "targetbackendcredential",
  "targetbackendcredentials",
  "token",
]);

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

export function isCredentialLikeKey(key: string): boolean {
  return CREDENTIAL_LIKE_KEYS.has(
    key.toLowerCase().replace(/[^a-z0-9]/gu, ""),
  );
}

export function containsCredentialLikeKey(value: JsonValue): boolean {
  if (Array.isArray(value)) {
    return value.some(containsCredentialLikeKey);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      isCredentialLikeKey(key) || containsCredentialLikeKey(nestedValue),
  );
}

function invalidProjection(message: string): never {
  throw new TypeError(`Invalid model-visible backend projection: ${message}`);
}

/** Validates and isolates the serialized ADR-016 projection descriptor. */
export function copyModelVisibleBackendProjection(
  projection: unknown,
): ModelVisibleBackendProjection {
  if (!isPlainRecord(projection)) {
    invalidProjection("expected an object containing only purpose and fields.");
  }

  const keys = Object.keys(projection);
  if (
    keys.length !== 2 ||
    !hasOwn(projection, "purpose") ||
    !hasOwn(projection, "fields")
  ) {
    invalidProjection("expected an object containing only purpose and fields.");
  }

  const purpose = projection.purpose;
  if (
    typeof purpose !== "string" ||
    !MODEL_CONTEXT_PURPOSES.some(
      (acceptedPurpose) => acceptedPurpose === purpose,
    )
  ) {
    invalidProjection(
      'purpose must be "reference_resolution" or "result_interpretation".',
    );
  }

  if (!isPlainRecord(projection.fields)) {
    invalidProjection("fields must be an object of output-to-source names.");
  }

  const entries = Object.entries(projection.fields);
  if (entries.length === 0) {
    invalidProjection("fields must select at least one property.");
  }

  const copiedEntries = entries.map(([outputName, sourceName]) => {
    if (
      outputName.length === 0 ||
      typeof sourceName !== "string" ||
      sourceName.length === 0
    ) {
      invalidProjection("field names must be non-empty strings.");
    }

    if (
      isCredentialLikeKey(outputName) ||
      isCredentialLikeKey(sourceName)
    ) {
      invalidProjection("credential and authentication fields are forbidden.");
    }

    return [outputName, sourceName] as const;
  });

  return Object.freeze({
    purpose,
    fields: Object.freeze(Object.fromEntries(copiedEntries)),
  }) as ModelVisibleBackendProjection;
}
