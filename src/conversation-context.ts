import {
  CONVERSATION_LIMITS,
  fingerprintMashalaSpec,
  type ConversationOutcomeSummary,
  type ConversationRecord,
  type ConversationTranscriptEntry,
} from "./conversation-store";
import { validateFormValueProposal } from "./form-value-proposal";
import {
  containsCredentialLikeKey,
  type ModelVisibleBackendProjection,
} from "./model-visible-backend-projection-policy";
import type {
  CapabilitySpec,
  FormDefinition,
  JsonValue,
  MashalaSpec,
} from "./spec";

export const CONVERSATION_CONTEXT_VERSION = "0.1" as const;

export const CONVERSATION_CONTEXT_LIMITS = Object.freeze({
  transcriptEntries: 8,
  transcriptBytes: 16_384,
  outcomeSummaries: 4,
  projectionBytes: 8_192,
  dynamicBytes: 32_768,
});

export interface ConversationContextActiveCapability {
  readonly capabilityId: string;
  readonly capabilityKind: "read" | "write";
  readonly draft?: Readonly<Record<string, JsonValue>>;
}

export interface ConversationContextSelectedBackendData {
  readonly sourceCapabilityId: string;
  readonly purpose: "reference_resolution" | "result_interpretation";
  readonly data: JsonValue;
}

/** Strict browser/server value. It contains no operation or confirmation data. */
export interface ConversationContextSnapshot {
  readonly contextVersion: typeof CONVERSATION_CONTEXT_VERSION;
  readonly createdAt: number;
  readonly lastActivityAt: number;
  readonly transcript: readonly ConversationTranscriptEntry[];
  readonly outcomes: readonly ConversationOutcomeSummary[];
  readonly activeCapability?: ConversationContextActiveCapability;
  readonly selectedBackendContext?: ConversationContextSelectedBackendData;
}

export interface ModelConversationContext {
  readonly trust: "untrusted";
  readonly currentGoal?: {
    readonly capabilityId: string;
    readonly capabilityKind: "read" | "write";
    readonly description: string;
  };
  readonly activeCapability?: {
    readonly capabilityId: string;
    readonly capabilityKind: "read" | "write";
    readonly description: string;
    readonly validDraftValues?: Readonly<Record<string, JsonValue>>;
  };
  readonly recentTurns: readonly {
    readonly role: "user" | "assistant";
    readonly text: string;
  }[];
  readonly recentOutcomes: readonly {
    readonly capabilityId: string;
    readonly capabilityKind: "read" | "write";
    readonly description: string;
    readonly outcome: ConversationOutcomeSummary["outcome"];
    readonly httpStatus?: number;
  }[];
  readonly selectedBackendContext?: {
    readonly sourceCapabilityId: string;
    readonly purpose: "reference_resolution" | "result_interpretation";
    readonly data: JsonValue;
  };
}

export type ConversationContextErrorCode =
  | "invalid_context"
  | "stale_context"
  | "message_too_large"
  | "projection_too_large"
  | "context_too_large"
  | "unauthorized_projection";

export type ConversationContextResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: ConversationContextErrorCode;
      readonly message: string;
    };

export interface AssembleConversationContextInput {
  readonly application: MashalaSpec;
  readonly record: ConversationRecord;
  readonly currentMessage: string;
  readonly selectedBackendContext?: ConversationContextSelectedBackendData;
  readonly now?: number;
}

export interface ResolveConversationContextInput {
  readonly application: MashalaSpec;
  readonly snapshot?: ConversationContextSnapshot;
  readonly currentMessage: string;
  readonly now?: number;
}

const INACTIVITY_TTL_MS = 30 * 60 * 1_000;
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1_000;

function success<T>(value: T): ConversationContextResult<T> {
  return { ok: true, value };
}

function failure(
  code: ConversationContextErrorCode,
  message: string,
): ConversationContextResult<never> {
  return { ok: false, code, message };
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function serializedBytes(value: unknown): number {
  return utf8Bytes(JSON.stringify(value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isPlainRecord(value) && Object.values(value).every(isJsonValue);
}

function credentialLikeText(value: string): boolean {
  return (
    /\bbearer\s+[a-z0-9._~+/=-]{8,}/iu.test(value) ||
    /\b(?:password|access[_-]?token|refresh[_-]?token|authorization|cookie)\s*[:=]\s*\S+/iu.test(
      value,
    ) ||
    /\b[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}\b/iu.test(value)
  );
}

function capabilityById(
  application: MashalaSpec,
  capabilityId: string,
): CapabilitySpec | undefined {
  return application.capabilities.find((candidate) => candidate.id === capabilityId);
}

function capabilityForm(capability: CapabilitySpec): FormDefinition | undefined {
  return capability.kind === "write" ? capability.form : capability.input;
}

function validDraft(
  capability: CapabilitySpec,
  draft: unknown,
): draft is Readonly<Record<string, JsonValue>> {
  if (!isPlainRecord(draft) || !isJsonValue(draft) || containsCredentialLikeKey(draft)) {
    return false;
  }
  const form = capabilityForm(capability);
  if (form === undefined) return Object.keys(draft).length === 0;
  if (Object.keys(draft).some((name) => form.fields[name]?.kind === "reference")) {
    return false;
  }
  return (
    serializedBytes(draft) <= CONVERSATION_LIMITS.draftBytes &&
    validateFormValueProposal(form, draft).accepted
  );
}

function validTranscriptEntry(value: unknown): value is ConversationTranscriptEntry {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["eventId", "role", "text", "timestamp"]) &&
    typeof value.eventId === "string" &&
    value.eventId.length > 0 &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.text === "string" &&
    value.text.length > 0 &&
    utf8Bytes(value.text) <= CONVERSATION_LIMITS.messageBytes &&
    !credentialLikeText(value.text) &&
    Number.isSafeInteger(value.timestamp) &&
    Number(value.timestamp) >= 0
  );
}

function validOutcome(
  value: unknown,
  application: MashalaSpec,
): value is ConversationOutcomeSummary {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(
      value,
      ["capabilityId", "capabilityKind", "completedAt", "outcome"],
      ["httpStatus"],
    ) ||
    typeof value.capabilityId !== "string"
  ) {
    return false;
  }
  const capability = capabilityById(application, value.capabilityId);
  const outcomes = new Set([
    "succeeded",
    "target_http_error",
    "network_error",
    "invalid_response",
    "cancelled",
    "interrupted_unknown",
  ]);
  return (
    capability !== undefined &&
    value.capabilityKind === capability.kind &&
    Number.isSafeInteger(value.completedAt) &&
    Number(value.completedAt) >= 0 &&
    outcomes.has(String(value.outcome)) &&
    (value.outcome === "target_http_error"
      ? Number.isInteger(value.httpStatus) &&
        Number(value.httpStatus) >= 100 &&
        Number(value.httpStatus) <= 599
      : value.httpStatus === undefined)
  );
}

function projectionDeclarations(
  capability: CapabilitySpec,
): readonly ModelVisibleBackendProjection[] {
  const declarations: ModelVisibleBackendProjection[] = [];
  if (capability.kind === "read" && capability.operation.modelContext !== undefined) {
    declarations.push(capability.operation.modelContext);
  }
  const form = capabilityForm(capability);
  if (form !== undefined) {
    for (const field of Object.values(form.fields)) {
      if (field.kind === "reference" && field.source.modelContext !== undefined) {
        declarations.push(field.source.modelContext);
      }
    }
  }
  return declarations;
}

function projectionMatches(
  data: JsonValue,
  declaration: ModelVisibleBackendProjection,
): boolean {
  const expected = Object.keys(declaration.fields);
  const records = Array.isArray(data) ? data : [data];
  return records.every(
    (record) =>
      isPlainRecord(record) &&
      Object.keys(record).length === expected.length &&
      expected.every((name) => Object.prototype.hasOwnProperty.call(record, name)),
  );
}

function validSelectedBackendContext(
  value: unknown,
  application: MashalaSpec,
): value is ConversationContextSelectedBackendData {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["sourceCapabilityId", "purpose", "data"]) ||
    typeof value.sourceCapabilityId !== "string" ||
    (value.purpose !== "reference_resolution" &&
      value.purpose !== "result_interpretation") ||
    !isJsonValue(value.data) ||
    containsCredentialLikeKey(value.data) ||
    serializedBytes(value.data) > CONVERSATION_CONTEXT_LIMITS.projectionBytes
  ) {
    return false;
  }
  const capability = capabilityById(application, value.sourceCapabilityId);
  const data = value.data as JsonValue;
  return (
    capability !== undefined &&
    projectionDeclarations(capability).some(
      (declaration) =>
        declaration.purpose === value.purpose &&
        projectionMatches(data, declaration),
    )
  );
}

function validAge(createdAt: number, lastActivityAt: number, now: number): boolean {
  return (
    Number.isSafeInteger(createdAt) &&
    Number.isSafeInteger(lastActivityAt) &&
    createdAt >= 0 &&
    lastActivityAt >= createdAt &&
    now >= lastActivityAt &&
    now - lastActivityAt < INACTIVITY_TTL_MS &&
    now - createdAt < ABSOLUTE_TTL_MS
  );
}

function isolated<T>(value: T): T {
  return Object.freeze(JSON.parse(JSON.stringify(value)) as T);
}

function activeCapabilityFromRecord(
  record: ConversationRecord,
): ConversationContextActiveCapability | undefined {
  if (record.workflow.phase === "idle") return undefined;
  return Object.freeze({
    capabilityId: record.workflow.capabilityId,
    capabilityKind: record.workflow.capabilityKind,
    ...(record.workflow.draft === undefined
      ? {}
      : { draft: record.workflow.draft }),
  });
}

function contextFits(currentMessage: string, snapshot: ConversationContextSnapshot): boolean {
  return (
    serializedBytes({ currentMessage, conversationContext: snapshot }) <=
    CONVERSATION_CONTEXT_LIMITS.dynamicBytes
  );
}

/**
 * Selects a newest-first bounded suffix while preserving whole transcript
 * entries. Safety-critical active capability and outcome facts take priority.
 */
export function assembleConversationContext({
  application,
  record,
  currentMessage,
  selectedBackendContext,
  now = Date.now(),
}: AssembleConversationContextInput): ConversationContextResult<ConversationContextSnapshot> {
  if (
    typeof currentMessage !== "string" ||
    currentMessage.trim() === "" ||
    utf8Bytes(currentMessage) > CONVERSATION_LIMITS.messageBytes ||
    credentialLikeText(currentMessage)
  ) {
    return failure("message_too_large", "The current message is invalid or too large.");
  }
  if (
    record.appId !== application.app.id ||
    record.specFingerprint !== fingerprintMashalaSpec(application)
  ) {
    return failure("invalid_context", "The conversation context does not match this application.");
  }
  if (!validAge(record.createdAt, record.lastActivityAt, now)) {
    return failure("stale_context", "The conversation context is stale.");
  }
  if (
    !record.transcript.every(validTranscriptEntry) ||
    !record.outcomes.every((outcome) => validOutcome(outcome, application))
  ) {
    return failure("invalid_context", "The conversation context is malformed.");
  }
  if (
    selectedBackendContext !== undefined &&
    serializedBytes(selectedBackendContext.data) >
      CONVERSATION_CONTEXT_LIMITS.projectionBytes
  ) {
    return failure("projection_too_large", "The selected backend context is too large.");
  }
  if (
    selectedBackendContext !== undefined &&
    !validSelectedBackendContext(selectedBackendContext, application)
  ) {
    return failure("unauthorized_projection", "The selected backend context is not authorized.");
  }

  const activeCapability = activeCapabilityFromRecord(record);
  if (activeCapability !== undefined) {
    const capability = capabilityById(application, activeCapability.capabilityId);
    if (
      capability === undefined ||
      capability.kind !== activeCapability.capabilityKind ||
      (activeCapability.draft !== undefined &&
        !validDraft(capability, activeCapability.draft))
    ) {
      return failure("invalid_context", "The active conversation context is invalid.");
    }
  }

  const outcomes = isolated(
    record.outcomes.slice(-CONVERSATION_CONTEXT_LIMITS.outcomeSummaries),
  );
  let selectedActive = activeCapability;
  let snapshot: ConversationContextSnapshot = Object.freeze({
    contextVersion: CONVERSATION_CONTEXT_VERSION,
    createdAt: record.createdAt,
    lastActivityAt: record.lastActivityAt,
    transcript: Object.freeze([]),
    outcomes,
    ...(selectedActive === undefined ? {} : { activeCapability: selectedActive }),
    ...(selectedBackendContext === undefined
      ? {}
      : { selectedBackendContext: isolated(selectedBackendContext) }),
  });

  if (!contextFits(currentMessage, snapshot) && selectedActive?.draft !== undefined) {
    selectedActive = Object.freeze({
      capabilityId: selectedActive.capabilityId,
      capabilityKind: selectedActive.capabilityKind,
    });
    snapshot = Object.freeze({ ...snapshot, activeCapability: selectedActive });
  }
  if (!contextFits(currentMessage, snapshot)) {
    return failure("context_too_large", "The bounded conversation context is too large.");
  }

  const candidates = record.transcript.slice(
    -CONVERSATION_CONTEXT_LIMITS.transcriptEntries,
  );
  const retained: ConversationTranscriptEntry[] = [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate === undefined) continue;
    const next = [candidate, ...retained];
    if (serializedBytes(next) > CONVERSATION_CONTEXT_LIMITS.transcriptBytes) break;
    const nextSnapshot = Object.freeze({
      ...snapshot,
      transcript: isolated(next),
    });
    if (!contextFits(currentMessage, nextSnapshot)) break;
    retained.unshift(candidate);
    snapshot = nextSnapshot;
  }

  return success(snapshot);
}

/** Revalidates the browser snapshot and derives only trusted-spec metadata. */
export function resolveConversationContext({
  application,
  snapshot,
  currentMessage,
  now = Date.now(),
}: ResolveConversationContextInput): ConversationContextResult<ModelConversationContext> {
  if (
    typeof currentMessage !== "string" ||
    currentMessage.trim() === "" ||
    utf8Bytes(currentMessage) > CONVERSATION_LIMITS.messageBytes ||
    credentialLikeText(currentMessage)
  ) {
    return failure("message_too_large", "The current message is invalid or too large.");
  }
  if (snapshot === undefined) {
    return success(Object.freeze({
      trust: "untrusted",
      recentTurns: Object.freeze([]),
      recentOutcomes: Object.freeze([]),
    }));
  }
  if (
    !isPlainRecord(snapshot) ||
    !hasExactKeys(
      snapshot,
      ["contextVersion", "createdAt", "lastActivityAt", "transcript", "outcomes"],
      ["activeCapability", "selectedBackendContext"],
    ) ||
    snapshot.contextVersion !== CONVERSATION_CONTEXT_VERSION ||
    !validAge(snapshot.createdAt, snapshot.lastActivityAt, now) ||
    !Array.isArray(snapshot.transcript) ||
    snapshot.transcript.length > CONVERSATION_CONTEXT_LIMITS.transcriptEntries ||
    serializedBytes(snapshot.transcript) > CONVERSATION_CONTEXT_LIMITS.transcriptBytes ||
    !snapshot.transcript.every(validTranscriptEntry) ||
    !Array.isArray(snapshot.outcomes) ||
    snapshot.outcomes.length > CONVERSATION_CONTEXT_LIMITS.outcomeSummaries ||
    !snapshot.outcomes.every((outcome) => validOutcome(outcome, application)) ||
    !contextFits(currentMessage, snapshot)
  ) {
    return failure("invalid_context", "The conversation context is invalid or stale.");
  }

  let capability: CapabilitySpec | undefined;
  if (snapshot.activeCapability !== undefined) {
    const active = snapshot.activeCapability;
    if (
      !isPlainRecord(active) ||
      !hasExactKeys(active, ["capabilityId", "capabilityKind"], ["draft"]) ||
      typeof active.capabilityId !== "string"
    ) {
      return failure("invalid_context", "The active conversation context is invalid.");
    }
    capability = capabilityById(application, active.capabilityId);
    if (
      capability === undefined ||
      capability.kind !== active.capabilityKind ||
      (active.draft !== undefined && !validDraft(capability, active.draft))
    ) {
      return failure("invalid_context", "The active conversation context is invalid.");
    }
  }

  if (
    snapshot.selectedBackendContext !== undefined &&
    !validSelectedBackendContext(snapshot.selectedBackendContext, application)
  ) {
    return failure(
      "unauthorized_projection",
      "The selected backend context is not authorized by a declared projection.",
    );
  }

  const recentOutcomes = snapshot.outcomes.map((outcome) => {
    const declared = capabilityById(application, outcome.capabilityId);
    if (declared === undefined) throw new TypeError("Validated capability is missing.");
    return Object.freeze({
      capabilityId: declared.id,
      capabilityKind: declared.kind,
      description: declared.description,
      outcome: outcome.outcome,
      ...(outcome.httpStatus === undefined ? {} : { httpStatus: outcome.httpStatus }),
    });
  });
  const active =
    capability === undefined || snapshot.activeCapability === undefined
      ? undefined
      : Object.freeze({
          capabilityId: capability.id,
          capabilityKind: capability.kind,
          description: capability.description,
          ...(snapshot.activeCapability.draft === undefined
            ? {}
            : { validDraftValues: isolated(snapshot.activeCapability.draft) }),
        });

  return success(Object.freeze({
    trust: "untrusted",
    ...(active === undefined
      ? {}
      : {
          currentGoal: Object.freeze({
            capabilityId: active.capabilityId,
            capabilityKind: active.capabilityKind,
            description: active.description,
          }),
          activeCapability: active,
        }),
    recentTurns: Object.freeze(
      snapshot.transcript.map((entry) =>
        Object.freeze({ role: entry.role, text: entry.text }),
      ),
    ),
    recentOutcomes: Object.freeze(recentOutcomes),
    ...(snapshot.selectedBackendContext === undefined
      ? {}
      : { selectedBackendContext: isolated(snapshot.selectedBackendContext) }),
  }));
}
