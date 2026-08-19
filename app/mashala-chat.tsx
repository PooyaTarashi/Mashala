"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { BackendOperationResult } from "../src/backend-executor";
import { ConfirmationGate } from "../src/confirmation-gate";
import {
  assembleConversationContext,
  type ConversationContextSelectedBackendData,
  type ConversationContextSnapshot,
} from "../src/conversation-context";
import {
  ANONYMOUS_AUTH_SCOPE_TAG,
  conversationOutcomeText,
  createConversationStore,
  type ConversationOutcomeSummary,
  type ConversationRecord,
  type ConversationStateUpdate,
  type ConversationStore,
  type ConversationStoreResult,
} from "../src/conversation-store";
import {
  mergeFormValueProposal,
} from "../src/form-value-proposal";
import {
  CompiledForm,
  type FormValue,
  type ResolvedReferenceModelContext,
} from "../src/form-renderer";
import { createSelectedBackendContextEventFromProjection } from "../src/model-visible-backend-projection";
import {
  activeWorkflowCapabilityId,
  INITIAL_PAGE_CAPABILITY_WORKFLOW,
  isCorrelatedWorkflowResponse,
  restorePageCapabilityWorkflow,
  transitionPageCapabilityWorkflow,
  workflowFormValues,
  type PageWorkflowAction,
  type PendingWorkflowRequest,
  type WorkflowCorrelation,
} from "../src/page-capability-workflow";
import {
  executeReadCapability,
  type ReadCapabilityResult,
} from "../src/read-capability-executor";
import { ResultCardRenderer } from "../src/result-card-renderer";
import {
  RUNTIME_PROTOCOL_VERSION,
  type BrowserToServerEvent,
  type ServerToBrowserEvent,
  type UserMessageEvent,
} from "../src/runtime-protocol";
import {
  createRuntimeHttpTransport,
  RuntimeTransportError,
  type RuntimeTransport,
} from "../src/runtime-http-client";
import type {
  CapabilitySpec,
  JsonValue,
  MashalaSpec,
  ReadCapabilitySpec,
} from "../src/spec";
import type { TargetBackendRequest } from "../src/target-backend-request";
import styles from "./mashala-chat.module.css";

export interface MashalaChatProps {
  readonly application: MashalaSpec;
  readonly transport?: RuntimeTransport;
  readonly targetBackendBaseUrl?: string | URL;
  readonly targetBackendRequest?: TargetBackendRequest;
  /** Opaque, non-secret target-auth isolation tag. Never a credential. */
  readonly authScopeTag?: string;
  /** Injectable provider-neutral store; primarily useful to generated integrations and tests. */
  readonly conversationStore?: ConversationStore;
  /** Explicit IDs retain the pre-ISSUE-071 ephemeral test/integration mode. */
  readonly conversationId?: string;
  readonly createEventId?: () => string;
}

type ConversationEntry =
  | {
      readonly id: string;
      readonly kind: "user";
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: "route";
      readonly capabilityId: string;
      readonly description: string;
    }
  | {
      readonly id: string;
      readonly kind: "proposal";
      readonly fieldCount: number;
    }
  | {
      readonly id: string;
      readonly kind: "assistant";
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: "out-of-scope";
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: "protocol-error";
      readonly text: string;
      readonly code?: string;
    }
  | {
      readonly id: string;
      readonly kind: "read-loading";
      readonly runId: number;
      readonly capabilityId: string;
    }
  | {
      readonly id: string;
      readonly kind: "read-result";
      readonly capability: ReadCapabilitySpec;
      readonly result: Extract<ReadCapabilityResult, { outcome: "success" }>;
      readonly baseUrl: string | URL;
    }
  | {
      readonly id: string;
      readonly kind: "read-empty";
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: "read-failure";
      readonly text: string;
    };

const defaultTransport = createRuntimeHttpTransport();

function capabilityMap(
  application: MashalaSpec,
): ReadonlyMap<string, CapabilitySpec> {
  return new Map(
    application.capabilities.map((capability) => [capability.id, capability]),
  );
}

function transportFailureMessage(error: unknown): string {
  return error instanceof RuntimeTransportError
    ? error.message
    : "The runtime could not be reached. Try again.";
}

function readFailureMessage(result: Exclude<ReadCapabilityResult, { outcome: "success" | "input-required" }>): string {
  switch (result.outcome) {
    case "http-error":
      return `The target backend returned HTTP ${String(result.response.status)}.`;
    case "network-error":
      return "The target backend could not be reached.";
    case "malformed-json":
      return "The target backend returned malformed JSON.";
    case "response-shape-error":
      return "The target backend response does not match the declared result view.";
    case "input-error":
      return "The read input did not match the declared form.";
  }
}

function readEntryId(runId: number, capabilityId: string): string {
  return `read-${String(runId)}-${capabilityId}`;
}

function freshEphemeralConversationId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `browser_conversation_${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function entriesFromRecord(
  record: ConversationRecord,
  application: MashalaSpec,
): readonly ConversationEntry[] {
  return [
    ...record.transcript.map((entry): ConversationEntry => ({
      id: entry.eventId,
      kind: entry.role,
      text: entry.text,
    })),
    ...record.outcomes.map((summary, index): ConversationEntry => ({
      id: `outcome-${String(summary.completedAt)}-${String(index)}`,
      kind: "assistant",
      text: conversationOutcomeText(summary, application),
    })),
  ];
}

function writeOutcomeSummary(
  capabilityId: string,
  result: BackendOperationResult,
): Omit<ConversationOutcomeSummary, "completedAt"> {
  if (result.outcome === "success") {
    return { capabilityId, capabilityKind: "write", outcome: "succeeded" };
  }
  if (result.outcome === "http-error") {
    return {
      capabilityId,
      capabilityKind: "write",
      outcome: "target_http_error",
      httpStatus: result.response.status,
    };
  }
  return { capabilityId, capabilityKind: "write", outcome: "network_error" };
}

function readOutcomeSummary(
  capabilityId: string,
  result: Exclude<ReadCapabilityResult, { outcome: "input-required" }>,
): Omit<ConversationOutcomeSummary, "completedAt"> {
  switch (result.outcome) {
    case "success":
      return { capabilityId, capabilityKind: "read", outcome: "succeeded" };
    case "http-error":
      return {
        capabilityId,
        capabilityKind: "read",
        outcome: "target_http_error",
        httpStatus: result.response.status,
      };
    case "network-error":
      return { capabilityId, capabilityKind: "read", outcome: "network_error" };
    case "malformed-json":
    case "response-shape-error":
    case "input-error":
      return { capabilityId, capabilityKind: "read", outcome: "invalid_response" };
  }
}

function persistedDraft(values: FormValue): Readonly<Record<string, JsonValue>> {
  const draft: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) draft[name] = value;
  }
  return Object.freeze(draft);
}

function renderEntry(entry: ConversationEntry) {
  switch (entry.kind) {
    case "user":
      return (
        <article className={styles.userMessage} aria-label="Your message">
          <strong>You</strong>
          <p>{entry.text}</p>
        </article>
      );
    case "route":
      return (
        <article
          className={styles.routeResult}
          aria-label="Matched capability"
          role="status"
        >
          <strong>Matched capability</strong>
          <p>{entry.description}</p>
          <p className={styles.technicalLabel}>{entry.capabilityId}</p>
        </article>
      );
    case "proposal":
      return (
        <article
          className={styles.proposalResult}
          aria-label="Proposed form values"
          role="status"
        >
          <strong>Suggested form values</strong>
          <p>
            {entry.fieldCount === 0
              ? "No form values were suggested."
              : `${String(entry.fieldCount)} suggested ${entry.fieldCount === 1 ? "value was" : "values were"} added to the editable form.`}
          </p>
        </article>
      );
    case "assistant":
      return (
        <article className={styles.assistantMessage} aria-label="Assistant message">
          <strong>Assistant</strong>
          <p>{entry.text}</p>
        </article>
      );
    case "out-of-scope":
      return (
        <article
          className={styles.outOfScope}
          aria-label="Out of scope"
          role="status"
        >
          <strong>Outside available capabilities</strong>
          <p>{entry.text}</p>
        </article>
      );
    case "protocol-error":
      return (
        <article
          className={styles.protocolError}
          aria-label="Protocol error"
          role="alert"
        >
          <strong>Protocol error{entry.code === undefined ? "" : ` (${entry.code})`}</strong>
          <p>{entry.text}</p>
        </article>
      );
    case "read-loading":
      return (
        <article
          className={styles.readLoading}
          aria-label="Loading read result"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <strong>Loading result</strong>
          <p>The target backend request is in progress.</p>
        </article>
      );
    case "read-result":
      return (
        <article className={styles.readResult} aria-label="Read result">
          <strong className={styles.resultHeading}>Result</strong>
          <ResultCardRenderer
            view={entry.capability.result}
            data={entry.result.data}
            baseUrl={entry.baseUrl}
          />
        </article>
      );
    case "read-empty":
      return (
        <article className={styles.readEmpty} aria-label="Empty read result" role="status">
          <strong>No results</strong>
          <p>{entry.text}</p>
        </article>
      );
    case "read-failure":
      return (
        <article className={styles.readFailure} aria-label="Read failure" role="alert">
          <strong>Unable to load the result</strong>
          <p>{entry.text}</p>
        </article>
      );
  }
}

export function MashalaChat({
  application,
  transport = defaultTransport,
  targetBackendBaseUrl,
  targetBackendRequest,
  authScopeTag = ANONYMOUS_AUTH_SCOPE_TAG,
  conversationStore,
  conversationId,
  createEventId,
}: MashalaChatProps) {
  const capabilities = useMemo(() => capabilityMap(application), [application]);
  const reactId = useId();
  const persistenceEnabled = conversationStore !== undefined || conversationId === undefined;
  const [store] = useState<ConversationStore | undefined>(() =>
    persistenceEnabled
      ? conversationStore ?? createConversationStore({ application, authScopeTag })
      : undefined,
  );
  const conversationIdRef = useRef(
    conversationId ?? `pending_conversation_${reactId}`,
  );
  const conversationRecordRef = useRef<ConversationRecord | undefined>(undefined);
  const recentReadContextRef = useRef<
    ConversationContextSelectedBackendData | undefined
  >(undefined);
  const eventSequenceRef = useRef(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const pendingChatEventIdRef = useRef<string | undefined>(undefined);
  const [transportFailure, setTransportFailure] = useState<string>();
  const [conversationFailure, setConversationFailure] = useState<string>();
  const [conversationNotice, setConversationNotice] = useState<string>();
  const [conversationReady, setConversationReady] = useState(!persistenceEnabled);
  const [restorationPaused, setRestorationPaused] = useState(false);
  const [conversationOperational, setConversationOperational] = useState(!persistenceEnabled);
  const conversationOperationalRef = useRef(!persistenceEnabled);
  const observedAuthScopeRef = useRef(authScopeTag);
  const loadGenerationRef = useRef(0);
  const storeCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [entries, setEntries] = useState<readonly ConversationEntry[]>([]);
  const [workflow, setWorkflow] = useState(INITIAL_PAGE_CAPABILITY_WORKFLOW);
  const workflowRef = useRef(workflow);
  const seenServerEventIdsRef = useRef(new Set<string>());
  const usedBrowserEventIdsRef = useRef(new Set<string>());
  const sentReferenceContextsRef = useRef(new Set<string>());
  const activeCapabilityId = activeWorkflowCapabilityId(workflow);
  const activeCapability =
    activeCapabilityId === undefined
      ? undefined
      : capabilities.get(activeCapabilityId);
  const activeWriteCapability =
    activeCapability?.kind === "write" ? activeCapability : undefined;
  const activeReadCapability =
    activeCapability?.kind === "read" ? activeCapability : undefined;
  const proposedValues = workflowFormValues(workflow);
  const formRevision =
    "formRevision" in workflow ? workflow.formRevision : 0;
  const backendBaseUrl =
    targetBackendBaseUrl ??
    (typeof window === "undefined" ? "http://localhost" : window.location.origin);

  useEffect(() => {
    if (store === undefined) return;
    if (storeCloseTimerRef.current !== undefined) {
      clearTimeout(storeCloseTimerRef.current);
      storeCloseTimerRef.current = undefined;
    }
    return () => {
      storeCloseTimerRef.current = setTimeout(() => store.close(), 0);
    };
  }, [store]);

  const restoreConversation = useCallback((record: ConversationRecord): void => {
    conversationRecordRef.current = record;
    conversationIdRef.current = record.conversationId;
    eventSequenceRef.current = 0;
    seenServerEventIdsRef.current.clear();
    usedBrowserEventIdsRef.current.clear();
    for (const entry of record.transcript) {
      if (entry.role === "user") usedBrowserEventIdsRef.current.add(entry.eventId);
      else seenServerEventIdsRef.current.add(entry.eventId);
    }
    sentReferenceContextsRef.current.clear();
    recentReadContextRef.current = undefined;
    pendingChatEventIdRef.current = undefined;
    pendingRef.current = false;
    setPending(false);
    setMessage("");
    setTransportFailure(undefined);
    setEntries(entriesFromRecord(record, application));
    setRestorationPaused(record.workflow.phase !== "idle");
    const restored = restorePageCapabilityWorkflow(record.workflow, record.revision);
    workflowRef.current = restored;
    setWorkflow(restored);
  }, [application]);

  const handleStoreFailure = useCallback((
    result: Exclude<ConversationStoreResult<unknown>, { ok: true }>,
  ): void => {
    if (result.code === "expired" && result.replacement !== undefined) {
      restoreConversation(result.replacement);
      conversationOperationalRef.current = true;
      setConversationOperational(true);
      setConversationReady(true);
      setConversationFailure(undefined);
      setConversationNotice("The previous conversation expired and was cleared. Please try again.");
      return;
    }
    conversationOperationalRef.current = false;
    setConversationOperational(false);
    pendingChatEventIdRef.current = undefined;
    pendingRef.current = false;
    setPending(false);
    const stopped = Object.freeze({
      phase: "idle" as const,
      runId: workflowRef.current.runId + 1,
    });
    workflowRef.current = stopped;
    setWorkflow(stopped);
    setConversationReady(true);
    setConversationFailure(result.message);
    setConversationNotice(undefined);
  }, [restoreConversation]);

  useEffect(() => {
    if (store === undefined) return;
    const generation = ++loadGenerationRef.current;
    void (async () => {
      await Promise.resolve();
      if (generation !== loadGenerationRef.current) return;
      setConversationReady(false);
      conversationOperationalRef.current = false;
      setConversationOperational(false);
      setConversationFailure(undefined);
      setConversationNotice(undefined);

      if (observedAuthScopeRef.current !== authScopeTag) {
        observedAuthScopeRef.current = authScopeTag;
        const changed = store.changeIdentity(authScopeTag);
        if (generation !== loadGenerationRef.current) return;
        if (!changed.ok) {
          handleStoreFailure(changed);
          return;
        }
        restoreConversation(changed.value);
        conversationOperationalRef.current = true;
        setConversationOperational(true);
        setConversationReady(true);
        return;
      }

      const loaded = await store.load();
      if (generation !== loadGenerationRef.current) return;
      if (!loaded.ok) {
        handleStoreFailure(loaded);
        return;
      }
      restoreConversation(loaded.value.record);
      conversationOperationalRef.current = true;
      setConversationOperational(true);
      setConversationReady(true);
    })();
  }, [authScopeTag, handleStoreFailure, restoreConversation, store]);

  const commitWorkflow = useCallback((action: PageWorkflowAction): boolean => {
    const current = workflowRef.current;
    const next = transitionPageCapabilityWorkflow(current, action);
    if (next === current) {
      return false;
    }

    if (store !== undefined) {
      if (!conversationOperationalRef.current) return false;
      const capabilityId =
        activeWorkflowCapabilityId(next) ?? activeWorkflowCapabilityId(current);
      const capability =
        capabilityId === undefined ? undefined : capabilities.get(capabilityId);
      let outcome: ConversationStateUpdate["outcome"];
      if (action.type === "execution.finished") {
        outcome = writeOutcomeSummary(action.capabilityId, action.result);
      } else if (
        action.type === "read.execution.finished" &&
        action.result.outcome !== "input-required"
      ) {
        outcome = readOutcomeSummary(action.capabilityId, action.result);
      } else if (action.type === "cancel" && current.phase === "fetching") {
        outcome = {
          capabilityId: current.capabilityId,
          capabilityKind: "read",
          outcome: "cancelled",
        };
      }
      const update: ConversationStateUpdate = {
        phase: next.phase,
        ...(capability === undefined
          ? {}
          : {
              capabilityId: capability.id,
              capabilityKind: capability.kind,
              ...(capability.kind === "read"
                ? { readHasInput: capability.input !== undefined }
                : {}),
            }),
        ...("values" in next ? { draft: persistedDraft(next.values) } : {}),
        ...(outcome === undefined ? {} : { outcome }),
      };
      const persisted = store.update(update);
      if (!persisted.ok) {
        handleStoreFailure(persisted);
        return false;
      }
      conversationRecordRef.current = persisted.value;
    }
    workflowRef.current = next;
    setWorkflow(next);
    return true;
  }, [capabilities, handleStoreFailure, store]);

  const nextEventId = useCallback((): string => {
    const supplied = createEventId?.();
    const sequence = ++eventSequenceRef.current;
    const candidate =
      supplied ?? `${conversationIdRef.current}_event_${String(sequence)}`;
    const unique = usedBrowserEventIdsRef.current.has(candidate)
      ? `${candidate}_${String(sequence)}`
      : candidate;
    usedBrowserEventIdsRef.current.add(unique);
    return unique;
  }, [createEventId]);

  const persistTranscriptEntry = useCallback((entry: {
    readonly eventId: string;
    readonly role: "user" | "assistant";
    readonly text: string;
    readonly source?: "ordinary" | "backend_projection";
  }): boolean => {
    if (store === undefined) return true;
    if (!conversationOperationalRef.current) return false;
    const persisted = store.append(entry);
    if (!persisted.ok) {
      handleStoreFailure(persisted);
      return false;
    }
    conversationRecordRef.current = persisted.value;
    return true;
  }, [handleStoreFailure, store]);

  const applyServerEvents = useCallback((
    request: BrowserToServerEvent,
    serverEvents: readonly ServerToBrowserEvent[],
  ): void => {
    const correlation: WorkflowCorrelation = {
      eventId: request.eventId,
      conversationId: request.conversationId,
    };
    const nextEntries: ConversationEntry[] = [];
    let standaloneAssistantAnswered = false;
    if (!isCorrelatedWorkflowResponse(workflowRef.current, correlation)) {
      return;
    }

    for (const event of serverEvents) {
      if (
        event.conversationId !== correlation.conversationId ||
        event.inReplyTo !== correlation.eventId ||
        seenServerEventIdsRef.current.has(event.eventId)
      ) {
        continue;
      }
      if (
        !isCorrelatedWorkflowResponse(workflowRef.current, correlation) &&
        event.type !== "assistant.message" &&
        event.type !== "protocol.error"
      ) {
        continue;
      }
      seenServerEventIdsRef.current.add(event.eventId);

      switch (event.type) {
        case "capability.route.result": {
          const declaredCapability = capabilities.get(event.payload.capabilityId);
          if (declaredCapability === undefined) {
            nextEntries.push({
              id: event.eventId,
              kind: "protocol-error",
              code: "invalid_event",
              text: "The runtime selected a capability that this application does not declare.",
            });
            commitWorkflow({ type: "routing.failed", correlation });
            break;
          }

          if (!commitWorkflow({
            type: "route.matched",
            correlation,
            capabilityId: declaredCapability.id,
            capabilityKind: declaredCapability.kind,
            ...(declaredCapability.kind === "read"
              ? { readHasInput: declaredCapability.input !== undefined }
              : {}),
          })) {
            break;
          }
          nextEntries.push({
            id: event.eventId,
            kind: "route",
            capabilityId: declaredCapability.id,
            description: declaredCapability.description,
          });
          const matchedWorkflow = workflowRef.current;
          if (
            declaredCapability.kind === "read" &&
            matchedWorkflow.phase === "fetching"
          ) {
            nextEntries.push({
              id: readEntryId(matchedWorkflow.runId, declaredCapability.id),
              kind: "read-loading",
              runId: matchedWorkflow.runId,
              capabilityId: declaredCapability.id,
            });
          }
          break;
        }
        case "form.values.proposed": {
          const declaredCapability = capabilities.get(event.payload.capabilityId);
          if (
            declaredCapability?.kind === "read" &&
            declaredCapability.input === undefined
          ) {
            if (Object.keys(event.payload.values).length > 0) {
              nextEntries.push({
                id: event.eventId,
                kind: "protocol-error",
                code: "invalid_model_output",
                text: "A zero-input read cannot accept suggested values.",
              });
            }
            break;
          }
          const currentWorkflow = workflowRef.current;
          if (
            declaredCapability === undefined ||
            (currentWorkflow.phase !== "filling" &&
              currentWorkflow.phase !== "collecting") ||
            declaredCapability.id !== currentWorkflow.capabilityId
          ) {
            nextEntries.push({
              id: event.eventId,
              kind: "protocol-error",
              code: "invalid_event",
              text: "Suggested values did not belong to the active declared capability.",
            });
            break;
          }

          const declaredForm =
            declaredCapability.kind === "write"
              ? declaredCapability.form
              : declaredCapability.input;
          if (declaredForm === undefined) break;

          const merge = mergeFormValueProposal(
            declaredForm,
            currentWorkflow.values,
            event.payload.values,
          );
          if (!merge.accepted) {
            nextEntries.push({
              id: event.eventId,
              kind: "protocol-error",
              code: "invalid_model_output",
              text: "Suggested values were rejected by the declared form schema.",
            });
            break;
          }

          if (!commitWorkflow({
            type: "proposal.accepted",
            correlation,
            capabilityId: declaredCapability.id,
            values: merge.values,
          })) {
            break;
          }
          nextEntries.push({
            id: event.eventId,
            kind: "proposal",
            fieldCount: Object.keys(event.payload.values).length,
          });
          break;
        }
        case "assistant.message":
          standaloneAssistantAnswered ||= workflowRef.current.phase === "routing";
          if (!persistTranscriptEntry({
            eventId: event.eventId,
            role: "assistant",
            text: event.payload.text,
            source:
              request.type === "backend.context.selected"
                ? "backend_projection"
                : "ordinary",
          })) {
            break;
          }
          nextEntries.push({
            id: event.eventId,
            kind: "assistant",
            text: event.payload.text,
          });
          break;
        case "capability.route.out_of_scope": {
          if (!commitWorkflow({ type: "route.out_of_scope", correlation })) {
            break;
          }
          const text =
            event.payload.message ??
            "That request is outside this application's declared capabilities.";
          if (!persistTranscriptEntry({
            eventId: event.eventId,
            role: "assistant",
            text,
          })) {
            break;
          }
          nextEntries.push({
            id: event.eventId,
            kind: "out-of-scope",
            text,
          });
          break;
        }
        case "protocol.error":
          commitWorkflow({ type: "routing.failed", correlation });
          nextEntries.push({
            id: event.eventId,
            kind: "protocol-error",
            code: event.payload.code,
            text: event.payload.message,
          });
          break;
      }
    }

    if (standaloneAssistantAnswered) {
      commitWorkflow({ type: "message.answered", correlation });
    }
    if (isCorrelatedWorkflowResponse(workflowRef.current, correlation)) {
      commitWorkflow({ type: "response.finished", correlation });
    }
    if (nextEntries.length > 0) {
      setEntries((current) => [...current, ...nextEntries]);
    }
  }, [capabilities, commitWorkflow, persistTranscriptEntry]);

  const sendReferenceContext = useCallback((
    context: ResolvedReferenceModelContext,
  ): void => {
    const current = workflowRef.current;
    if (
      (current.phase !== "filling" && current.phase !== "collecting") ||
      activeWorkflowCapabilityId(current) === undefined
    ) {
      return;
    }

    const deduplicationKey = `${String(current.runId)}:${current.capabilityId}:${context.fieldName}`;
    if (sentReferenceContextsRef.current.has(deduplicationKey)) {
      return;
    }

    const eventResult = createSelectedBackendContextEventFromProjection({
      source: context.source,
      context: { purpose: context.purpose, data: context.data },
      capabilityId: current.capabilityId,
      eventId: nextEventId(),
      conversationId: conversationIdRef.current,
    });
    if (eventResult.outcome !== "projected") {
      return;
    }

    const request: PendingWorkflowRequest = {
      eventId: eventResult.event.eventId,
      conversationId: eventResult.event.conversationId,
      kind: "backend-context",
    };
    if (!commitWorkflow({
      type: "extraction.requested",
      request,
      capabilityId: current.capabilityId,
      supersedePending: false,
    })) {
      return;
    }
    sentReferenceContextsRef.current.add(deduplicationKey);

    void transport(eventResult.event)
      .then((events) => applyServerEvents(eventResult.event, events))
      .catch((error: unknown) => {
        const correlation: WorkflowCorrelation = request;
        if (isCorrelatedWorkflowResponse(workflowRef.current, correlation)) {
          commitWorkflow({ type: "routing.failed", correlation });
          setTransportFailure(transportFailureMessage(error));
        }
      });
  }, [applyServerEvents, commitWorkflow, nextEventId, transport]);

  useEffect(() => {
    if (workflow.phase !== "fetching" || activeReadCapability === undefined) {
      return;
    }

    const runId = workflow.runId;
    const capabilityId = activeReadCapability.id;
    const entryId = readEntryId(runId, capabilityId);
    const controller = new AbortController();

    void executeReadCapability({
      baseUrl: backendBaseUrl,
      capability: activeReadCapability,
      ...(activeReadCapability.input === undefined
        ? {}
        : {
            input: workflow.values as Readonly<Record<string, JsonValue>>,
          }),
      ...(targetBackendRequest === undefined
        ? {}
        : { request: targetBackendRequest }),
      signal: controller.signal,
    }).then((result) => {
      if (!commitWorkflow({
        type: "read.execution.finished",
        runId,
        capabilityId,
        result,
      })) {
        return;
      }

      recentReadContextRef.current =
        result.outcome === "success" && result.modelContext !== undefined
          ? Object.freeze({
              sourceCapabilityId: activeReadCapability.id,
              purpose: result.modelContext.purpose,
              data: result.modelContext.data,
            })
          : undefined;

      setEntries((current) =>
        current.flatMap((entry): readonly ConversationEntry[] => {
          if (entry.id !== entryId) {
            return [entry];
          }
          if (result.outcome === "input-required") {
            return [];
          }
          if (result.outcome === "success") {
            if (Array.isArray(result.data) && result.data.length === 0) {
              return [{
                id: entryId,
                kind: "read-empty",
                text:
                  activeReadCapability.result.kind === "cardList"
                    ? activeReadCapability.result.emptyText
                    : "No result was returned.",
              }];
            }
            return [{
              id: entryId,
              kind: "read-result",
              capability: activeReadCapability,
              result,
              baseUrl: backendBaseUrl,
            }];
          }
          return [{
            id: entryId,
            kind: "read-failure",
            text: readFailureMessage(result),
          }];
        }),
      );
    });

    return () => controller.abort();
  }, [
    activeReadCapability,
    backendBaseUrl,
    commitWorkflow,
    targetBackendRequest,
    workflow,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = message.trim();

    const currentWorkflow = workflowRef.current;
    const canSend =
      currentWorkflow.phase === "idle" ||
      currentWorkflow.phase === "filling" ||
      currentWorkflow.phase === "collecting" ||
      (currentWorkflow.phase === "failed" &&
        !("capabilityId" in currentWorkflow));

    if (
      text === "" ||
      pendingRef.current ||
      !canSend ||
      !conversationReady ||
      !conversationOperationalRef.current
    ) {
      return;
    }

    let context: ConversationContextSnapshot | undefined;
    if (conversationRecordRef.current !== undefined) {
      const assembled = assembleConversationContext({
        application,
        record: conversationRecordRef.current,
        currentMessage: text,
        ...(recentReadContextRef.current === undefined
          ? {}
          : { selectedBackendContext: recentReadContextRef.current }),
      });
      if (!assembled.ok) {
        if (assembled.code === "stale_context" && store !== undefined) {
          const expired = store.expire();
          if (!expired.ok) handleStoreFailure(expired);
          else if (expired.value.expired) restoreConversation(expired.value.record);
        }
        setTransportFailure(
          "The bounded conversation context could not be used. Please clear the conversation or try again.",
        );
        return;
      }
      context = assembled.value;
    }

    pendingRef.current = true;
    setPending(true);
    setTransportFailure(undefined);
    setMessage("");

    const currentCapabilityId = activeWorkflowCapabilityId(currentWorkflow);
    const browserEvent: UserMessageEvent = {
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      eventId: nextEventId(),
      conversationId: conversationIdRef.current,
      type: "user.message",
      payload: {
        text,
        ...(currentCapabilityId === undefined
          ? {}
          : { activeCapabilityId: currentCapabilityId }),
        ...(context === undefined ? {} : { context }),
      },
    };
    if (context?.selectedBackendContext !== undefined) {
      recentReadContextRef.current = undefined;
    }

    const request: PendingWorkflowRequest = {
      eventId: browserEvent.eventId,
      conversationId: browserEvent.conversationId,
      kind: "route",
    };
    if (!persistTranscriptEntry({
      eventId: browserEvent.eventId,
      role: "user",
      text,
    })) {
      pendingRef.current = false;
      setPending(false);
      return;
    }
    const accepted = commitWorkflow({ type: "route.requested", request });
    if (!accepted) {
      pendingRef.current = false;
      setPending(false);
      return;
    }
    pendingChatEventIdRef.current = browserEvent.eventId;
    setEntries((current) => [
      ...current,
      { id: browserEvent.eventId, kind: "user", text },
    ]);

    try {
      applyServerEvents(browserEvent, await transport(browserEvent));
    } catch (error) {
      const correlation: WorkflowCorrelation = request;
      if (isCorrelatedWorkflowResponse(workflowRef.current, correlation)) {
        commitWorkflow({ type: "routing.failed", correlation });
        setTransportFailure(transportFailureMessage(error));
      }
    } finally {
      if (pendingChatEventIdRef.current === browserEvent.eventId) {
        pendingChatEventIdRef.current = undefined;
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  function cancelWorkflow(): void {
    const cancelled = workflowRef.current;
    if (!commitWorkflow({ type: "cancel" })) {
      return;
    }
    if (cancelled.phase === "fetching") {
      setEntries((current) =>
        current.filter(
          (entry) =>
            entry.kind !== "read-loading" || entry.runId !== cancelled.runId,
        ),
      );
    }
    pendingChatEventIdRef.current = undefined;
    pendingRef.current = false;
    setPending(false);
    setTransportFailure(undefined);
  }

  function resetWorkflow(): void {
    if (commitWorkflow({ type: "reset" })) {
      setTransportFailure(undefined);
    }
  }

  function clearConversation(): void {
    if (store !== undefined) {
      const cleared = store.clear();
      if (!cleared.ok) {
        handleStoreFailure(cleared);
        return;
      }
      restoreConversation(cleared.value);
    } else {
      conversationIdRef.current = freshEphemeralConversationId();
      eventSequenceRef.current = 0;
      seenServerEventIdsRef.current.clear();
      usedBrowserEventIdsRef.current.clear();
      sentReferenceContextsRef.current.clear();
      conversationRecordRef.current = undefined;
      recentReadContextRef.current = undefined;
      pendingChatEventIdRef.current = undefined;
      pendingRef.current = false;
      setPending(false);
      setMessage("");
      setEntries([]);
      setRestorationPaused(false);
      workflowRef.current = INITIAL_PAGE_CAPABILITY_WORKFLOW;
      setWorkflow(INITIAL_PAGE_CAPABILITY_WORKFLOW);
      setTransportFailure(undefined);
    }
    conversationOperationalRef.current = true;
    setConversationOperational(true);
    setConversationFailure(undefined);
    setConversationNotice("Conversation cleared.");
  }

  const canCompose =
    conversationReady &&
    conversationOperational &&
    (workflow.phase === "idle" ||
      workflow.phase === "filling" ||
      workflow.phase === "collecting" ||
      (workflow.phase === "failed" && !("capabilityId" in workflow)));
  const canCancel =
    conversationReady &&
    conversationOperational &&
    (workflow.phase === "routing" ||
      workflow.phase === "filling" ||
      workflow.phase === "collecting" ||
      workflow.phase === "fetching" ||
      workflow.phase === "confirming");
  const canReset =
    conversationReady &&
    conversationOperational &&
    (workflow.phase === "completed" ||
      workflow.phase === "presenting" ||
      workflow.phase === "empty" ||
      workflow.phase === "failed");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Mashala</p>
        <h1>{application.app.name}</h1>
        <p>{application.app.description}</p>
      </header>

      <section className={styles.chat} aria-labelledby="conversation-heading">
        <h2 id="conversation-heading">Conversation</h2>
        <p
          className={styles.workflowStatus}
          data-testid="workflow-state"
          aria-live="polite"
        >
          Workflow state: {workflow.phase.toUpperCase()}
        </p>
        {!conversationReady ? (
          <p className={styles.status} role="status" aria-live="polite">
            Restoring this tab&apos;s conversation…
          </p>
        ) : null}
        {conversationFailure === undefined ? null : (
          <p className={styles.transportFailure} role="alert">
            <strong>Conversation unavailable:</strong> {conversationFailure}
          </p>
        )}
        {conversationNotice === undefined ? null : (
          <p className={styles.status} role="status" aria-live="polite">
            {conversationNotice}
          </p>
        )}
        {restorationPaused ? (
          <div>
            <p className={styles.status}>
              A safe draft was restored. No backend request has been made.
            </p>
            <button
              className={styles.secondaryAction}
              type="button"
              onClick={() => setRestorationPaused(false)}
            >
              Resume saved draft
            </button>
          </div>
        ) : null}
        {entries.length === 0 ? (
          <p className={styles.empty}>Describe what you want to do.</p>
        ) : (
          <ol
            className={styles.messages}
            aria-label="Conversation messages"
            aria-live="polite"
            aria-relevant="additions"
          >
            {entries.map((entry, index) => (
              <li key={`${entry.id}-${String(index)}`}>{renderEntry(entry)}</li>
            ))}
          </ol>
        )}

        <form className={styles.composer} onSubmit={handleSubmit}>
          <label htmlFor="mashala-message">Message</label>
          <div className={styles.composerRow}>
            <input
              id="mashala-message"
              name="message"
              type="text"
              value={message}
              required
              disabled={pending || !canCompose}
              aria-describedby="mashala-message-status"
              onChange={(event) => setMessage(event.currentTarget.value)}
            />
            <button
              type="submit"
              disabled={pending || !canCompose || message.trim() === ""}
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
          <p
            id="mashala-message-status"
            className={styles.status}
            role="status"
            aria-live="polite"
          >
            {pending ? "Sending message. Please wait." : ""}
          </p>
        </form>

        {transportFailure === undefined ? null : (
          <p className={styles.transportFailure} role="alert">
            <strong>Transport failure:</strong> {transportFailure}
          </p>
        )}

        {canCancel ? (
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={cancelWorkflow}
          >
            Cancel current request
          </button>
        ) : null}

        {canReset ? (
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={resetWorkflow}
          >
            Start another request
          </button>
        ) : null}

        <button
          className={styles.secondaryAction}
          type="button"
          disabled={!conversationReady || conversationFailure !== undefined}
          onClick={clearConversation}
        >
          Clear conversation
        </button>
      </section>

      {!conversationReady ||
      !conversationOperational ||
      restorationPaused ||
      activeWriteCapability === undefined ? null : (
        <section
          className={styles.capability}
          aria-labelledby="active-capability-heading"
        >
          <h2 id="active-capability-heading">Complete the request</h2>
          <p>{activeWriteCapability.description}</p>
          <ConfirmationGate
            key={`${String(workflow.runId)}-${activeWriteCapability.id}-${String(formRevision)}`}
            capability={activeWriteCapability}
            initialValues={proposedValues}
            baseUrl={backendBaseUrl}
            request={targetBackendRequest}
            formId={`capability-${activeWriteCapability.id}`}
            submitLabel={
              activeWriteCapability.confirmation === "required"
                ? "Review request"
                : "Submit request"
            }
            onDraftChange={(values) => {
              commitWorkflow({
                type: "draft.changed",
                capabilityId: activeWriteCapability.id,
                values,
              });
            }}
            onReferenceModelContext={sendReferenceContext}
            onReview={(snapshot) =>
              commitWorkflow({
                type: "review.requested",
                capabilityId: activeWriteCapability.id,
                snapshot,
              })
            }
            onReviewCancel={() => {
              commitWorkflow({
                type: "review.cancelled",
                capabilityId: activeWriteCapability.id,
              });
            }}
            onExecutionStart={(snapshot) =>
              commitWorkflow({
                type: "execution.requested",
                capabilityId: activeWriteCapability.id,
                snapshot,
                confirmation: activeWriteCapability.confirmation,
              })
            }
            onResult={(result: BackendOperationResult) => {
              commitWorkflow({
                type: "execution.finished",
                capabilityId: activeWriteCapability.id,
                result,
              });
            }}
          />
        </section>
      )}

      {!conversationReady ||
      !conversationOperational ||
      restorationPaused ||
      activeReadCapability?.input === undefined ||
      workflow.phase !== "collecting" ? null : (
        <section
          className={styles.capability}
          aria-labelledby="active-read-capability-heading"
        >
          <h2 id="active-read-capability-heading">Choose read inputs</h2>
          <p>{activeReadCapability.description}</p>
          <CompiledForm
            key={`${String(workflow.runId)}-${activeReadCapability.id}-${String(formRevision)}`}
            form={activeReadCapability.input}
            initialValues={proposedValues}
            baseUrl={backendBaseUrl}
            request={targetBackendRequest}
            formId={`read-${activeReadCapability.id}`}
            submitLabel="Fetch result"
            onChange={(values: FormValue) => {
              commitWorkflow({
                type: "draft.changed",
                capabilityId: activeReadCapability.id,
                values,
              });
            }}
            onReferenceModelContext={sendReferenceContext}
            onSubmit={(values: FormValue) => {
              const runId = workflow.runId;
              if (!commitWorkflow({
                type: "read.execution.requested",
                runId,
                capabilityId: activeReadCapability.id,
                values,
              })) {
                return;
              }
              setEntries((current) => [
                ...current,
                {
                  id: readEntryId(runId, activeReadCapability.id),
                  kind: "read-loading",
                  runId,
                  capabilityId: activeReadCapability.id,
                },
              ]);
            }}
          />
        </section>
      )}
    </main>
  );
}
