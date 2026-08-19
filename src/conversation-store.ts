import { validateFormValueProposal } from "./form-value-proposal";
import { containsCredentialLikeKey } from "./model-visible-backend-projection-policy";
import type {
  CapabilitySpec,
  FormDefinition,
  JsonValue,
  MashalaSpec,
} from "./spec";

export const CONVERSATION_RECORD_VERSION = 1 as const;
export const ANONYMOUS_AUTH_SCOPE_TAG = "anonymous" as const;
export const PROJECTED_CONTEXT_TRANSCRIPT_NOTICE =
  "The assistant used temporary selected backend context for this reply. The reply is not retained after refresh.";

export const CONVERSATION_LIMITS = Object.freeze({
  messageBytes: 4_096,
  transcriptEntries: 12,
  transcriptBytes: 32_768,
  draftBytes: 16_384,
  outcomeSummaries: 8,
  recordBytes: 65_536,
});

export type ConversationRole = "user" | "assistant";
export type ConversationCapabilityKind = "read" | "write";
export type PersistedConversationPhase = "idle" | "filling" | "collecting";
export type ConversationOutcome =
  | "succeeded"
  | "target_http_error"
  | "network_error"
  | "invalid_response"
  | "cancelled"
  | "interrupted_unknown";

export interface ConversationTranscriptEntry {
  readonly eventId: string;
  readonly role: ConversationRole;
  readonly text: string;
  readonly timestamp: number;
}

export interface ConversationOutcomeSummary {
  readonly capabilityId: string;
  readonly capabilityKind: ConversationCapabilityKind;
  readonly completedAt: number;
  readonly outcome: ConversationOutcome;
  readonly httpStatus?: number;
}

export type PersistedConversationWorkflow =
  | { readonly phase: "idle" }
  | {
      readonly phase: "filling" | "collecting";
      readonly capabilityId: string;
      readonly capabilityKind: ConversationCapabilityKind;
      readonly draft?: Readonly<Record<string, JsonValue>>;
    };

export interface ConversationRecord {
  readonly version: typeof CONVERSATION_RECORD_VERSION;
  readonly revision: number;
  readonly appId: string;
  readonly specFingerprint: string;
  readonly conversationId: string;
  readonly authScopeTag: string;
  readonly createdAt: number;
  readonly lastActivityAt: number;
  readonly transcript: readonly ConversationTranscriptEntry[];
  readonly workflow: PersistedConversationWorkflow;
  readonly outcomes: readonly ConversationOutcomeSummary[];
}

export type ConversationLifecyclePhase =
  | PersistedConversationPhase
  | "routing"
  | "confirming"
  | "executing"
  | "fetching"
  | "presenting"
  | "empty"
  | "completed"
  | "failed";

export interface ConversationStateUpdate {
  readonly phase: ConversationLifecyclePhase;
  readonly capabilityId?: string;
  readonly capabilityKind?: ConversationCapabilityKind;
  readonly draft?: Readonly<Record<string, JsonValue>>;
  /** Whether a fetching read has declared input that is safe to collect again. */
  readonly readHasInput?: boolean;
  readonly outcome?: Omit<ConversationOutcomeSummary, "completedAt">;
}

export interface AppendConversationEntry {
  readonly eventId: string;
  readonly role: ConversationRole;
  readonly text: string;
  readonly source?: "ordinary" | "backend_projection";
}

export type ConversationStoreFailureCode =
  | "invalid_auth_scope"
  | "invalid_entry"
  | "message_too_large"
  | "storage_unavailable"
  | "storage_write_failed"
  | "stale_update"
  | "expired";

export type ConversationStoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: ConversationStoreFailureCode;
      readonly message: string;
      readonly replacement?: ConversationRecord;
    };

export interface ConversationLoadValue {
  readonly status: "new" | "loaded" | "replaced";
  readonly record: ConversationRecord;
}

export interface ConversationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ConversationOwnershipCoordinator {
  adopt(conversationId: string): void;
  claim(conversationId: string): Promise<boolean>;
  release(conversationId: string): void;
  close(): void;
}

export interface ConversationStore {
  readonly storageKey: string;
  newConversation(): ConversationStoreResult<ConversationRecord>;
  load(): Promise<ConversationStoreResult<ConversationLoadValue>>;
  append(entry: AppendConversationEntry): ConversationStoreResult<ConversationRecord>;
  update(update: ConversationStateUpdate): ConversationStoreResult<ConversationRecord>;
  expire(): ConversationStoreResult<{ readonly expired: boolean; readonly record: ConversationRecord }>;
  clear(): ConversationStoreResult<ConversationRecord>;
  logout(nextAuthScopeTag?: string): ConversationStoreResult<ConversationRecord>;
  changeIdentity(nextAuthScopeTag: string): ConversationStoreResult<ConversationRecord>;
  close(): void;
}

export interface CreateConversationStoreOptions {
  readonly application: MashalaSpec;
  readonly authScopeTag?: string;
  readonly storage?: ConversationStorage;
  readonly now?: () => number;
  readonly createConversationId?: () => string;
  readonly ownership?: ConversationOwnershipCoordinator;
}

const INACTIVITY_TTL_MS = 30 * 60 * 1_000;
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1_000;
const MAX_ID_BYTES = 512;
const MAX_AUTH_SCOPE_BYTES = 256;

const SAFE_FAILURE_MESSAGE =
  "Conversation memory is unavailable. The request was not sent.";

function success<T>(value: T): ConversationStoreResult<T> {
  return { ok: true, value };
}

function failure(
  code: ConversationStoreFailureCode,
  replacement?: ConversationRecord,
): ConversationStoreResult<never> {
  return {
    ok: false,
    code,
    message: SAFE_FAILURE_MESSAGE,
    ...(replacement === undefined ? {} : { replacement }),
  };
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

function validBoundedString(value: unknown, maxBytes = MAX_ID_BYTES): value is string {
  return typeof value === "string" && value.length > 0 && utf8Bytes(value) <= maxBytes;
}

function validConversationId(value: unknown): value is string {
  return validBoundedString(value) && utf8Bytes(value) >= 32;
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return (
    isPlainRecord(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function isolatedJsonObject(
  value: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  return Object.freeze(
    JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>,
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function fnv1a32(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Deterministic change detector; it is not an authentication or authorization value. */
export function fingerprintMashalaSpec(application: MashalaSpec): string {
  const serialized = canonicalJson(application);
  return `fnv1a128_${fnv1a32(serialized, 0x811c9dc5)}${fnv1a32(
    serialized,
    0x9e3779b9,
  )}${fnv1a32(serialized, 0x85ebca6b)}${fnv1a32(serialized, 0xc2b2ae35)}`;
}

function defaultConversationId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject === undefined) throw new Error("secure randomness unavailable");
  const bytes = new Uint8Array(16);
  cryptoObject.getRandomValues(bytes);
  return `conversation_${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
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

export function isSafeAuthScopeTag(value: unknown): value is string {
  return (
    validBoundedString(value, MAX_AUTH_SCOPE_BYTES) &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value) &&
    !/^bearer/iu.test(value) &&
    !credentialLikeText(value)
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

function sanitizeDraft(
  capability: CapabilitySpec,
  draft: unknown,
): Readonly<Record<string, JsonValue>> | undefined {
  if (!isPlainRecord(draft)) return undefined;
  const form = capabilityForm(capability);
  if (form === undefined) return Object.freeze({});

  const accepted: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(draft)) {
    if (
      !isJsonValue(value) ||
      containsCredentialLikeKey({ [name]: value }) ||
      form.fields[name]?.kind === "reference"
    ) {
      continue;
    }
    const validation = validateFormValueProposal(form, { [name]: value });
    if (validation.accepted) accepted[name] = value;
  }

  const isolated = isolatedJsonObject(accepted);
  return serializedBytes(isolated) <= CONVERSATION_LIMITS.draftBytes
    ? isolated
    : undefined;
}

function validTranscriptEntry(value: unknown): value is ConversationTranscriptEntry {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["eventId", "role", "text", "timestamp"])) {
    return false;
  }
  return (
    validBoundedString(value.eventId) &&
    (value.role === "user" || value.role === "assistant") &&
    validBoundedString(value.text, CONVERSATION_LIMITS.messageBytes) &&
    !credentialLikeText(value.text) &&
    validTimestamp(value.timestamp)
  );
}

function validOutcomeSummary(
  value: unknown,
  application: MashalaSpec,
): value is ConversationOutcomeSummary {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(
      value,
      ["capabilityId", "capabilityKind", "completedAt", "outcome"],
      ["httpStatus"],
    )
  ) {
    return false;
  }
  const capability =
    typeof value.capabilityId === "string"
      ? capabilityById(application, value.capabilityId)
      : undefined;
  const validOutcome = [
    "succeeded",
    "target_http_error",
    "network_error",
    "invalid_response",
    "cancelled",
    "interrupted_unknown",
  ].includes(String(value.outcome));
  const statusValid =
    value.outcome === "target_http_error"
      ? Number.isInteger(value.httpStatus) &&
        Number(value.httpStatus) >= 100 &&
        Number(value.httpStatus) <= 599
      : value.httpStatus === undefined;
  return (
    capability !== undefined &&
    value.capabilityKind === capability.kind &&
    validTimestamp(value.completedAt) &&
    validOutcome &&
    statusValid
  );
}

function validWorkflow(
  value: unknown,
  application: MashalaSpec,
): value is PersistedConversationWorkflow {
  if (!isPlainRecord(value) || typeof value.phase !== "string") return false;
  if (value.phase === "idle") return hasExactKeys(value, ["phase"]);
  if (
    (value.phase !== "filling" && value.phase !== "collecting") ||
    !hasExactKeys(
      value,
      ["phase", "capabilityId", "capabilityKind"],
      ["draft"],
    ) ||
    typeof value.capabilityId !== "string"
  ) {
    return false;
  }
  const capability = capabilityById(application, value.capabilityId);
  if (
    capability === undefined ||
    capability.kind !== value.capabilityKind ||
    (value.phase === "filling" && capability.kind !== "write") ||
    (value.phase === "collecting" &&
      (capability.kind !== "read" || capability.input === undefined))
  ) {
    return false;
  }
  if (value.draft === undefined) return true;
  if (!isPlainRecord(value.draft) || !isJsonValue(value.draft)) return false;
  const sanitized = sanitizeDraft(capability, value.draft);
  return (
    sanitized !== undefined &&
    canonicalJson(sanitized) === canonicalJson(value.draft)
  );
}

function parseRecord(
  raw: string,
  application: MashalaSpec,
): ConversationRecord | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "revision",
      "appId",
      "specFingerprint",
      "conversationId",
      "authScopeTag",
      "createdAt",
      "lastActivityAt",
      "transcript",
      "workflow",
      "outcomes",
    ]) ||
    value.version !== CONVERSATION_RECORD_VERSION ||
    !validRevision(value.revision) ||
    !validBoundedString(value.appId) ||
    !validBoundedString(value.specFingerprint) ||
    !validConversationId(value.conversationId) ||
    !isSafeAuthScopeTag(value.authScopeTag) ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.lastActivityAt) ||
    value.lastActivityAt < value.createdAt ||
    !Array.isArray(value.transcript) ||
    value.transcript.length > CONVERSATION_LIMITS.transcriptEntries ||
    !value.transcript.every(validTranscriptEntry) ||
    serializedBytes(value.transcript) > CONVERSATION_LIMITS.transcriptBytes ||
    !validWorkflow(value.workflow, application) ||
    !Array.isArray(value.outcomes) ||
    value.outcomes.length > CONVERSATION_LIMITS.outcomeSummaries ||
    !value.outcomes.every((summary) => validOutcomeSummary(summary, application)) ||
    serializedBytes(value) > CONVERSATION_LIMITS.recordBytes
  ) {
    return undefined;
  }
  return deepFreeze(value as unknown as ConversationRecord);
}

function isExpired(record: ConversationRecord, now: number): boolean {
  return (
    now - record.lastActivityAt >= INACTIVITY_TTL_MS ||
    now - record.createdAt >= ABSOLUTE_TTL_MS ||
    now < record.createdAt ||
    now < record.lastActivityAt
  );
}

function trimTranscript(
  entries: readonly ConversationTranscriptEntry[],
): readonly ConversationTranscriptEntry[] {
  const retained = entries.slice(-CONVERSATION_LIMITS.transcriptEntries);
  while (
    retained.length > 0 &&
    serializedBytes(retained) > CONVERSATION_LIMITS.transcriptBytes
  ) {
    retained.shift();
  }
  return Object.freeze(retained);
}

function appendOutcome(
  outcomes: readonly ConversationOutcomeSummary[],
  next: ConversationOutcomeSummary,
): readonly ConversationOutcomeSummary[] {
  const retained = [...outcomes];
  const last = retained.at(-1);
  if (
    last?.outcome === "interrupted_unknown" &&
    last.capabilityId === next.capabilityId &&
    last.capabilityKind === next.capabilityKind &&
    next.outcome !== "interrupted_unknown"
  ) {
    retained.pop();
  }
  retained.push(Object.freeze({ ...next }));
  return Object.freeze(retained.slice(-CONVERSATION_LIMITS.outcomeSummaries));
}

function safeWorkflowAndOutcomes(
  application: MashalaSpec,
  current: ConversationRecord,
  update: ConversationStateUpdate,
  now: number,
): {
  readonly workflow: PersistedConversationWorkflow;
  readonly outcomes: readonly ConversationOutcomeSummary[];
} | undefined {
  let outcomes = current.outcomes;
  const capability =
    update.capabilityId === undefined
      ? undefined
      : capabilityById(application, update.capabilityId);
  if (
    update.capabilityId !== undefined &&
    (capability === undefined || capability.kind !== update.capabilityKind)
  ) {
    return undefined;
  }

  if (
    ((update.phase === "filling" ||
      update.phase === "confirming" ||
      update.phase === "executing") &&
      capability?.kind !== "write") ||
    ((update.phase === "collecting" ||
      update.phase === "fetching" ||
      update.phase === "presenting" ||
      update.phase === "empty") &&
      capability?.kind !== "read") ||
    ((update.phase === "completed" || update.phase === "failed") &&
      update.outcome !== undefined &&
      capability === undefined)
  ) {
    return undefined;
  }

  const addOutcome = (
    summary: Omit<ConversationOutcomeSummary, "completedAt">,
  ): boolean => {
    const candidate = { ...summary, completedAt: now };
    if (!validOutcomeSummary(candidate, application)) return false;
    outcomes = appendOutcome(outcomes, candidate);
    return true;
  };
  if (update.outcome !== undefined) {
    if (
      capability === undefined ||
      update.outcome.capabilityId !== capability.id ||
      update.outcome.capabilityKind !== capability.kind
    ) {
      return undefined;
    }
    if (!addOutcome(update.outcome)) return undefined;
  } else if (update.phase === "executing" && capability?.kind === "write") {
    if (!addOutcome({
      capabilityId: capability.id,
      capabilityKind: "write",
      outcome: "interrupted_unknown",
    })) return undefined;
  }

  if (
    capability !== undefined &&
    (update.phase === "filling" ||
      update.phase === "confirming" ||
      (update.phase === "fetching" && update.readHasInput === true) ||
      update.phase === "collecting")
  ) {
    const phase = capability.kind === "write" ? "filling" : "collecting";
    if (
      (phase === "filling" && capability.kind !== "write") ||
      (phase === "collecting" &&
        (capability.kind !== "read" || capability.input === undefined))
    ) {
      return undefined;
    }
    const draft = sanitizeDraft(capability, update.draft ?? {});
    return {
      workflow: Object.freeze({
        phase,
        capabilityId: capability.id,
        capabilityKind: capability.kind,
        ...(draft === undefined || serializedBytes(draft) > CONVERSATION_LIMITS.draftBytes
          ? {}
          : { draft }),
      }),
      outcomes,
    };
  }

  return { workflow: Object.freeze({ phase: "idle" }), outcomes };
}

function noOwnershipCoordinator(): ConversationOwnershipCoordinator {
  return {
    adopt: () => undefined,
    claim: async () => false,
    release: () => undefined,
    close: () => undefined,
  };
}

interface OwnershipMessage {
  readonly type: "claim" | "owned";
  readonly conversationId: string;
  readonly ownerNonce: string;
}

/** Same-origin live ownership check for duplicated sessionStorage tabs. */
export function createBroadcastConversationOwnershipCoordinator(
  appId: string,
): ConversationOwnershipCoordinator {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return noOwnershipCoordinator();
  }

  const channel = new BroadcastChannel(`mashala:conversation-owner:${appId}`);
  const ownerNonce = defaultConversationId();
  const owned = new Set<string>();
  const conflicts = new Map<string, () => void>();

  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (
      !isPlainRecord(message) ||
      (message.type !== "claim" && message.type !== "owned") ||
      !validBoundedString(message.conversationId) ||
      !validBoundedString(message.ownerNonce) ||
      message.ownerNonce === ownerNonce
    ) {
      return;
    }
    const typed = message as unknown as OwnershipMessage;
    if (typed.type === "claim" && owned.has(typed.conversationId)) {
      channel.postMessage({
        type: "owned",
        conversationId: typed.conversationId,
        ownerNonce,
      } satisfies OwnershipMessage);
    } else if (typed.type === "owned") {
      conflicts.get(typed.conversationId)?.();
    }
  });

  return {
    adopt: (conversationId) => owned.add(conversationId),
    claim: async (conversationId) => {
      let conflict = false;
      await new Promise<void>((resolve) => {
        conflicts.set(conversationId, () => {
          conflict = true;
          resolve();
        });
        channel.postMessage({ type: "claim", conversationId, ownerNonce } satisfies OwnershipMessage);
        setTimeout(resolve, 30);
      });
      conflicts.delete(conversationId);
      if (!conflict) owned.add(conversationId);
      return conflict;
    },
    release: (conversationId) => owned.delete(conversationId),
    close: () => {
      owned.clear();
      conflicts.clear();
      channel.close();
    },
  };
}

function browserSessionStorage(): ConversationStorage {
  if (typeof window === "undefined") {
    throw new Error("sessionStorage is browser-only");
  }
  return window.sessionStorage;
}

export function createConversationStore(
  options: CreateConversationStoreOptions,
): ConversationStore {
  const application = options.application;
  const specFingerprint = fingerprintMashalaSpec(application);
  const now = options.now ?? Date.now;
  const createConversationId = options.createConversationId ?? defaultConversationId;
  const storageKey = `mashala:conversation:${CONVERSATION_RECORD_VERSION}:${application.app.id}`;
  let authScopeTag = options.authScopeTag ?? ANONYMOUS_AUTH_SCOPE_TAG;
  let current: ConversationRecord | undefined;
  let storage: ConversationStorage | undefined = options.storage;
  const ownership =
    options.ownership ?? createBroadcastConversationOwnershipCoordinator(application.app.id);

  function getStorage(): ConversationStorage | undefined {
    if (storage !== undefined) return storage;
    try {
      storage = browserSessionStorage();
      return storage;
    } catch {
      return undefined;
    }
  }

  function remove(): boolean {
    const target = getStorage();
    if (target === undefined) return false;
    try {
      target.removeItem(storageKey);
      return true;
    } catch {
      return false;
    }
  }

  function write(record: ConversationRecord): ConversationStoreResult<ConversationRecord> {
    if (serializedBytes(record) > CONVERSATION_LIMITS.recordBytes) {
      return failure("storage_write_failed");
    }
    const target = getStorage();
    if (target === undefined) return failure("storage_unavailable");
    try {
      target.setItem(storageKey, JSON.stringify(record));
      current = record;
      return success(record);
    } catch {
      return failure("storage_write_failed");
    }
  }

  function createFresh(): ConversationStoreResult<ConversationRecord> {
    if (!isSafeAuthScopeTag(authScopeTag)) return failure("invalid_auth_scope");
    let conversationId: string;
    try {
      conversationId = createConversationId();
    } catch {
      return failure("storage_unavailable");
    }
    if (!validConversationId(conversationId)) return failure("invalid_entry");
    const timestamp = now();
    const record: ConversationRecord = Object.freeze({
      version: CONVERSATION_RECORD_VERSION,
      revision: 0,
      appId: application.app.id,
      specFingerprint,
      conversationId,
      authScopeTag,
      createdAt: timestamp,
      lastActivityAt: timestamp,
      transcript: Object.freeze([]),
      workflow: Object.freeze({ phase: "idle" }),
      outcomes: Object.freeze([]),
    });
    const written = write(record);
    if (written.ok) ownership.adopt(written.value.conversationId);
    return written;
  }

  function readCurrent(): ConversationStoreResult<ConversationRecord> {
    const target = getStorage();
    if (target === undefined) return failure("storage_unavailable");
    let raw: string | null;
    try {
      raw = target.getItem(storageKey);
    } catch {
      return failure("storage_unavailable");
    }
    if (raw === null) return failure("stale_update");
    const parsed = parseRecord(raw, application);
    if (parsed === undefined) return failure("stale_update");
    return success(parsed);
  }

  function ensureMutable(): ConversationStoreResult<ConversationRecord> {
    if (current === undefined) return failure("stale_update");
    const stored = readCurrent();
    if (
      !stored.ok ||
      stored.value.revision !== current.revision ||
      stored.value.conversationId !== current.conversationId ||
      stored.value.authScopeTag !== authScopeTag ||
      stored.value.appId !== application.app.id ||
      stored.value.specFingerprint !== specFingerprint
    ) {
      return failure("stale_update");
    }
    if (isExpired(stored.value, now())) {
      ownership.release(stored.value.conversationId);
      remove();
      current = undefined;
      const replacement = createFresh();
      return replacement.ok
        ? failure("expired", replacement.value)
        : replacement;
    }
    return success(stored.value);
  }

  function replaceIdentity(nextAuthScopeTag: string): ConversationStoreResult<ConversationRecord> {
    if (!isSafeAuthScopeTag(nextAuthScopeTag)) return failure("invalid_auth_scope");
    if (current !== undefined) ownership.release(current.conversationId);
    if (!remove()) return failure("storage_unavailable");
    current = undefined;
    authScopeTag = nextAuthScopeTag;
    return createFresh();
  }

  return {
    storageKey,
    newConversation: () => {
      if (current !== undefined) ownership.release(current.conversationId);
      if (!remove()) return failure("storage_unavailable");
      current = undefined;
      return createFresh();
    },
    load: async () => {
      if (!isSafeAuthScopeTag(authScopeTag)) return failure("invalid_auth_scope");
      const target = getStorage();
      if (target === undefined) return failure("storage_unavailable");
      let raw: string | null;
      try {
        raw = target.getItem(storageKey);
      } catch {
        return failure("storage_unavailable");
      }
      if (raw === null) {
        const created = createFresh();
        if (!created.ok) return created;
        await ownership.claim(created.value.conversationId);
        return success({ status: "new", record: created.value });
      }

      const parsed = parseRecord(raw, application);
      const stale =
        parsed === undefined ||
        parsed.appId !== application.app.id ||
        parsed.specFingerprint !== specFingerprint ||
        parsed.authScopeTag !== authScopeTag ||
        isExpired(parsed, now());
      if (stale) {
        remove();
        current = undefined;
        const created = createFresh();
        if (!created.ok) return created;
        await ownership.claim(created.value.conversationId);
        return success({ status: "replaced", record: created.value });
      }

      if (await ownership.claim(parsed.conversationId)) {
        remove();
        current = undefined;
        const created = createFresh();
        if (!created.ok) return created;
        await ownership.claim(created.value.conversationId);
        return success({ status: "replaced", record: created.value });
      }

      const touched: ConversationRecord = Object.freeze({
        ...parsed,
        revision: parsed.revision + 1,
        lastActivityAt: now(),
      });
      const written = write(touched);
      return written.ok
        ? success({ status: "loaded", record: written.value })
        : written;
    },
    append: (entry) => {
      const mutable = ensureMutable();
      if (!mutable.ok) return mutable;
      const text =
        entry.source === "backend_projection"
          ? PROJECTED_CONTEXT_TRANSCRIPT_NOTICE
          : entry.text;
      if (
        !validBoundedString(entry.eventId) ||
        (entry.role !== "user" && entry.role !== "assistant") ||
        !validBoundedString(text, CONVERSATION_LIMITS.messageBytes) ||
        credentialLikeText(text)
      ) {
        return failure(
          utf8Bytes(text) > CONVERSATION_LIMITS.messageBytes
            ? "message_too_large"
            : "invalid_entry",
        );
      }
      const timestamp = now();
      const transcript = trimTranscript([
        ...mutable.value.transcript,
        Object.freeze({
          eventId: entry.eventId,
          role: entry.role,
          text,
          timestamp,
        }),
      ]);
      return write(Object.freeze({
        ...mutable.value,
        revision: mutable.value.revision + 1,
        lastActivityAt: timestamp,
        transcript,
      }));
    },
    update: (update) => {
      const mutable = ensureMutable();
      if (!mutable.ok) return mutable;
      const timestamp = now();
      const safe = safeWorkflowAndOutcomes(application, mutable.value, update, timestamp);
      if (safe === undefined) return failure("invalid_entry");
      let record: ConversationRecord = Object.freeze({
        ...mutable.value,
        revision: mutable.value.revision + 1,
        lastActivityAt: timestamp,
        workflow: safe.workflow,
        outcomes: safe.outcomes,
      });
      if (serializedBytes(record) > CONVERSATION_LIMITS.recordBytes && record.workflow.phase !== "idle") {
        record = Object.freeze({
          ...record,
          workflow: Object.freeze({
            phase: record.workflow.phase,
            capabilityId: record.workflow.capabilityId,
            capabilityKind: record.workflow.capabilityKind,
          }),
        });
      }
      return write(record);
    },
    expire: () => {
      const mutable = ensureMutable();
      if (mutable.ok) return success({ expired: false, record: mutable.value });
      if (mutable.code === "expired" && mutable.replacement !== undefined) {
        return success({ expired: true, record: mutable.replacement });
      }
      return mutable;
    },
    clear: () => {
      if (current !== undefined) ownership.release(current.conversationId);
      if (!remove()) return failure("storage_unavailable");
      current = undefined;
      return createFresh();
    },
    logout: (nextAuthScopeTag = ANONYMOUS_AUTH_SCOPE_TAG) =>
      replaceIdentity(nextAuthScopeTag),
    changeIdentity: replaceIdentity,
    close: () => {
      if (current !== undefined) ownership.release(current.conversationId);
      ownership.close();
      current = undefined;
    },
  };
}

export function conversationOutcomeText(
  summary: ConversationOutcomeSummary,
  application: MashalaSpec,
): string {
  const capability = capabilityById(application, summary.capabilityId);
  const label = capability?.description ?? summary.capabilityId;
  switch (summary.outcome) {
    case "succeeded":
      return `${label}: completed successfully.`;
    case "target_http_error":
      return `${label}: the target backend returned HTTP ${String(summary.httpStatus)}.`;
    case "network_error":
      return `${label}: the target backend could not be reached.`;
    case "invalid_response":
      return `${label}: the target backend response was invalid.`;
    case "cancelled":
      return `${label}: the request was cancelled.`;
    case "interrupted_unknown":
      return `${label}: a write was interrupted and its outcome is unknown. Check the target system before trying again.`;
  }
}
