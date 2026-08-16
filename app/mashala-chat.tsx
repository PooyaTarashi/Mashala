"use client";

import {
  type FormEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { ConfirmationGate } from "../src/confirmation-gate";
import {
  mergeFormValueProposal,
} from "../src/form-value-proposal";
import type { FormValue } from "../src/form-renderer";
import {
  RUNTIME_PROTOCOL_VERSION,
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
  const [transportFailure, setTransportFailure] = useState<string>();
  const [entries, setEntries] = useState<readonly ConversationEntry[]>([]);
  const [activeCapabilityId, setActiveCapabilityId] = useState<string>();
  const [proposedValues, setProposedValues] = useState<FormValue>({});
  const [formRevision, setFormRevision] = useState(0);
  const activeCapability =
    activeCapabilityId === undefined
      ? undefined
      : capabilities.get(activeCapabilityId);
  const backendBaseUrl =
    targetBackendBaseUrl ??
    (typeof window === "undefined" ? "http://localhost" : window.location.origin);

  function applyServerEvents(serverEvents: readonly ServerToBrowserEvent[]): void {
    let nextCapabilityId = activeCapabilityId;
    let nextValues = proposedValues;
    let acceptedProposal = false;
    const nextEntries: ConversationEntry[] = [];

    for (const event of serverEvents) {
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
            break;
          }

          if (nextCapabilityId !== declaredCapability.id) {
            nextValues = {};
          }
          nextCapabilityId = declaredCapability.id;
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
          if (
            declaredCapability === undefined ||
            declaredCapability.id !== nextCapabilityId
          ) {
            nextEntries.push({
              id: event.eventId,
              kind: "protocol-error",
              code: "invalid_event",
              text: "Suggested values did not belong to the active declared capability.",
            });
            break;
          }

          const merge = mergeFormValueProposal(
            declaredCapability.form,
            nextValues,
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

          nextValues = merge.values;
          acceptedProposal = true;
          nextEntries.push({
            id: event.eventId,
            kind: "proposal",
            fieldCount: Object.keys(merge.values).length,
          });
          break;
        }
        case "assistant.message":
          nextEntries.push({
            id: event.eventId,
            kind: "assistant",
            text: event.payload.text,
          });
          break;
        case "capability.route.out_of_scope":
          nextEntries.push({
            id: event.eventId,
            kind: "out-of-scope",
            text:
              event.payload.message ??
              "That request is outside this application's declared capabilities.",
          });
          break;
        case "protocol.error":
          nextEntries.push({
            id: event.eventId,
            kind: "protocol-error",
            code: event.payload.code,
            text: event.payload.message,
          });
          break;
      }
    }

    setEntries((current) => [...current, ...nextEntries]);
    setActiveCapabilityId(nextCapabilityId);
    setProposedValues(nextValues);
    if (acceptedProposal) {
      setFormRevision((current) => current + 1);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = message.trim();

    if (text === "" || pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setTransportFailure(undefined);
    setMessage("");

    const browserEvent: UserMessageEvent = {
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      eventId:
        createEventId?.() ??
        `${conversationIdRef.current}_event_${String(++eventSequenceRef.current)}`,
      conversationId: conversationIdRef.current,
      type: "user.message",
      payload: {
        text,
        ...(activeCapabilityId === undefined
          ? {}
          : { activeCapabilityId }),
      },
    };
    setEntries((current) => [
      ...current,
      { id: browserEvent.eventId, kind: "user", text },
    ]);

    try {
      applyServerEvents(await transport(browserEvent));
    } catch (error) {
      setTransportFailure(transportFailureMessage(error));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Mashala</p>
        <h1>{application.app.name}</h1>
        <p>{application.app.description}</p>
      </header>

      <section className={styles.chat} aria-labelledby="conversation-heading">
        <h2 id="conversation-heading">Conversation</h2>
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
              disabled={pending}
              aria-describedby="mashala-message-status"
              onChange={(event) => setMessage(event.currentTarget.value)}
            />
            <button type="submit" disabled={pending || message.trim() === ""}>
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
      </section>

      {activeCapability === undefined ? null : (
        <section
          className={styles.capability}
          aria-labelledby="active-capability-heading"
        >
          <h2 id="active-capability-heading">Complete the request</h2>
          <p>{activeCapability.description}</p>
          <ConfirmationGate
            key={`${activeCapability.id}-${String(formRevision)}`}
            capability={activeCapability}
            initialValues={proposedValues}
            baseUrl={backendBaseUrl}
            request={targetBackendRequest}
            formId={`capability-${activeCapability.id}`}
            submitLabel={
              activeCapability.confirmation === "required"
                ? "Review request"
                : "Submit request"
            }
          />
        </section>
      )}
    </main>
  );
}
