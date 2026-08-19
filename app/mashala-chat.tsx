"use client";

import {
  type FormEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { BackendOperationResult } from "../src/backend-executor";
import { ConfirmationGate } from "../src/confirmation-gate";
import {
  mergeFormValueProposal,
} from "../src/form-value-proposal";
import type {
  ResolvedReferenceModelContext,
} from "../src/form-renderer";
import { createSelectedBackendContextEventFromProjection } from "../src/model-visible-backend-projection";
import {
  activeWorkflowCapabilityId,
  INITIAL_PAGE_CAPABILITY_WORKFLOW,
  isCorrelatedWorkflowResponse,
  transitionPageCapabilityWorkflow,
  workflowFormValues,
  type PageWorkflowAction,
  type PendingWorkflowRequest,
  type WorkflowCorrelation,
} from "../src/page-capability-workflow";
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
import type { CapabilitySpec, MashalaSpec } from "../src/spec";
import type { TargetBackendRequest } from "../src/target-backend-request";
import styles from "./mashala-chat.module.css";

export interface MashalaChatProps {
  readonly application: MashalaSpec;
  readonly transport?: RuntimeTransport;
  readonly targetBackendBaseUrl?: string | URL;
  readonly targetBackendRequest?: TargetBackendRequest;
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
  }
}

export function MashalaChat({
  application,
  transport = defaultTransport,
  targetBackendBaseUrl,
  targetBackendRequest,
  conversationId,
  createEventId,
}: MashalaChatProps) {
  const capabilities = useMemo(() => capabilityMap(application), [application]);
  const reactId = useId();
  const conversationIdRef = useRef(
    conversationId ?? `browser_conversation_${reactId}`,
  );
  const eventSequenceRef = useRef(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const pendingChatEventIdRef = useRef<string | undefined>(undefined);
  const [transportFailure, setTransportFailure] = useState<string>();
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
  const proposedValues = workflowFormValues(workflow);
  const formRevision =
    "formRevision" in workflow ? workflow.formRevision : 0;
  const backendBaseUrl =
    targetBackendBaseUrl ??
    (typeof window === "undefined" ? "http://localhost" : window.location.origin);

  const commitWorkflow = useCallback((action: PageWorkflowAction): boolean => {
    const current = workflowRef.current;
    const next = transitionPageCapabilityWorkflow(current, action);
    if (next === current) {
      return false;
    }
    workflowRef.current = next;
    setWorkflow(next);
    return true;
  }, []);

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
          })) {
            break;
          }
          nextEntries.push({
            id: event.eventId,
            kind: "route",
            capabilityId: declaredCapability.id,
            description: declaredCapability.description,
          });
          break;
        }
        case "form.values.proposed": {
          const declaredCapability = capabilities.get(event.payload.capabilityId);
          const currentWorkflow = workflowRef.current;
          if (
            declaredCapability === undefined ||
            currentWorkflow.phase !== "filling" ||
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
          if (declaredForm === undefined) {
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
          nextEntries.push({
            id: event.eventId,
            kind: "assistant",
            text: event.payload.text,
          });
          break;
        case "capability.route.out_of_scope":
          if (!commitWorkflow({ type: "route.out_of_scope", correlation })) {
            break;
          }
          nextEntries.push({
            id: event.eventId,
            kind: "out-of-scope",
            text:
              event.payload.message ??
              "That request is outside this application's declared capabilities.",
          });
          break;
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
  }, [capabilities, commitWorkflow]);

  const sendReferenceContext = useCallback((
    context: ResolvedReferenceModelContext,
  ): void => {
    const current = workflowRef.current;
    if (
      current.phase !== "filling" ||
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = message.trim();

    const currentWorkflow = workflowRef.current;
    const canSend =
      currentWorkflow.phase === "idle" ||
      currentWorkflow.phase === "filling" ||
      (currentWorkflow.phase === "failed" &&
        !("capabilityId" in currentWorkflow));

    if (text === "" || pendingRef.current || !canSend) {
      return;
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
      },
    };

    const request: PendingWorkflowRequest = {
      eventId: browserEvent.eventId,
      conversationId: browserEvent.conversationId,
      kind: currentCapabilityId === undefined ? "route" : "extraction",
    };
    const accepted =
      currentCapabilityId === undefined
        ? commitWorkflow({ type: "route.requested", request })
        : commitWorkflow({
            type: "extraction.requested",
            request,
            capabilityId: currentCapabilityId,
            supersedePending: true,
          });
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
    if (!commitWorkflow({ type: "cancel" })) {
      return;
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

  const canCompose =
    workflow.phase === "idle" ||
    workflow.phase === "filling" ||
    (workflow.phase === "failed" && !("capabilityId" in workflow));
  const canCancel =
    workflow.phase === "routing" ||
    workflow.phase === "filling" ||
    workflow.phase === "confirming";
  const canReset =
    workflow.phase === "completed" || workflow.phase === "failed";

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
      </section>

      {activeWriteCapability === undefined ? null : (
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
    </main>
  );
}
