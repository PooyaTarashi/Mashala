import "server-only";

import {
  RUNTIME_PROTOCOL_VERSION,
  type AssistantMessageEvent,
  type CapabilityRouteResultEvent,
  type OutOfScopeEvent,
  type ProtocolErrorCode,
  type ProtocolErrorEvent,
  type SlotCandidatesProposedEvent,
} from "../runtime-protocol";
import type {
  CapabilityRoutingError,
  CapabilityRoutingResult,
} from "./capability-router";
import type { KnowledgeAnswerResult } from "./knowledge-answer";
import type { MessageClassificationError } from "./message-classifier";
import type {
  SlotCandidateValue,
  SlotCandidateValues,
  SlotExtractionError,
  SlotExtractionResult,
} from "./slot-extractor";

export interface ServerProtocolEventMetadata {
  readonly eventId: string;
  readonly conversationId: string;
  readonly inReplyTo?: string;
}

export type CapabilityRoutingProtocolEvent =
  | CapabilityRouteResultEvent
  | OutOfScopeEvent
  | ProtocolErrorEvent;

export type SlotExtractionProtocolEvent =
  | SlotCandidatesProposedEvent
  | ProtocolErrorEvent;

export type KnowledgeAnswerProtocolEvent =
  | AssistantMessageEvent
  | ProtocolErrorEvent;

export interface ProtocolErrorPayload {
  readonly code: ProtocolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

function commonEnvelope(metadata: ServerProtocolEventMetadata) {
  return {
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    eventId: metadata.eventId,
    conversationId: metadata.conversationId,
    ...(metadata.inReplyTo === undefined
      ? {}
      : { inReplyTo: metadata.inReplyTo }),
  } as const;
}

/** Constructs a canonical, sanitized protocol error event. */
export function createProtocolErrorEvent(
  metadata: ServerProtocolEventMetadata,
  payload: ProtocolErrorPayload,
): ProtocolErrorEvent {
  return Object.freeze({
    ...commonEnvelope(metadata),
    type: "protocol.error",
    payload: Object.freeze(payload),
  });
}

/** Constructs canonical user-visible assistant text. */
export function createAssistantMessageEvent(
  metadata: ServerProtocolEventMetadata,
  text: string,
): AssistantMessageEvent {
  return Object.freeze({
    ...commonEnvelope(metadata),
    type: "assistant.message",
    payload: Object.freeze({ text }),
  });
}

/** Constructs a safe terminal result for an unsupported or ambiguous message. */
export function createUnsupportedMessageEvent(
  metadata: ServerProtocolEventMetadata,
): OutOfScopeEvent {
  return Object.freeze({
    ...commonEnvelope(metadata),
    type: "capability.route.out_of_scope",
    payload: Object.freeze({
      message:
        "I couldn't determine whether you want to perform a supported transaction or ask about this application. Please rephrase your request.",
    }),
  });
}

function protocolError(
  metadata: ServerProtocolEventMetadata,
  error: CapabilityRoutingError | SlotExtractionError,
): ProtocolErrorEvent {
  if (error.kind === "provider_failure") {
    return createProtocolErrorEvent(metadata, {
      code: "internal_error",
      message: "The LLM provider request could not be completed.",
      retryable: error.failure.retryable,
    });
  }

  return createProtocolErrorEvent(metadata, {
    code: "invalid_model_output",
    message: error.message,
    retryable: false,
  });
}

/** Maps a classifier boundary failure without exposing provider details. */
export function messageClassificationErrorToProtocolEvent(
  error: MessageClassificationError,
  metadata: ServerProtocolEventMetadata,
): ProtocolErrorEvent {
  if (error.kind === "provider_failure") {
    return createProtocolErrorEvent(metadata, {
      code: "internal_error",
      message: "The message classifier could not be completed.",
      retryable: error.failure.retryable,
    });
  }

  return createProtocolErrorEvent(metadata, {
    code: "invalid_model_output",
    message: error.message,
    retryable: false,
  });
}

/** Maps ISSUE-048 outcomes to existing canonical user-visible events. */
export function knowledgeAnswerResultToProtocolEvent(
  result: KnowledgeAnswerResult,
  metadata: ServerProtocolEventMetadata,
): KnowledgeAnswerProtocolEvent {
  if (result.outcome === "grounded") {
    return createAssistantMessageEvent(metadata, result.answer);
  }

  if (result.outcome === "insufficient_context") {
    return createAssistantMessageEvent(
      metadata,
      "I couldn't find enough information in the application documentation to answer that question.",
    );
  }

  const retryable =
    result.error.kind === "provider_failure" ||
    result.error.kind === "retrieval_failure"
      ? result.error.failure.retryable
      : false;
  const code =
    result.error.kind === "invalid_model_output"
      ? "invalid_model_output"
      : "internal_error";

  return createProtocolErrorEvent(metadata, {
    code,
    message: "The documentation answer could not be completed.",
    retryable,
  });
}

function protocolCandidateValues(
  values: SlotCandidateValues,
): Readonly<Record<string, SlotCandidateValue>> {
  const protocolValues: Record<string, SlotCandidateValue> = {};

  for (const [fieldName, value] of Object.entries(values)) {
    if (value === undefined) {
      throw new TypeError(
        "Invalid slot extraction result: candidate values must be JSON values.",
      );
    }

    protocolValues[fieldName] = value;
  }

  return Object.freeze(protocolValues);
}

/** Maps the validated routing domain result to its canonical protocol event. */
export function capabilityRoutingResultToProtocolEvent(
  result: CapabilityRoutingResult,
  metadata: ServerProtocolEventMetadata,
): CapabilityRoutingProtocolEvent {
  if (result.outcome === "matched") {
    return Object.freeze({
      ...commonEnvelope(metadata),
      type: "capability.route.result",
      payload: Object.freeze({
        outcome: "matched",
        capabilityId: result.capability.id,
      }),
    });
  }

  if (result.outcome === "out_of_scope") {
    return Object.freeze({
      ...commonEnvelope(metadata),
      type: "capability.route.out_of_scope",
      payload: Object.freeze({}),
    });
  }

  return protocolError(metadata, result.error);
}

/** Maps validated slot proposals to the canonical form-values event. */
export function slotExtractionResultToProtocolEvent(
  result: SlotExtractionResult,
  capabilityId: string,
  metadata: ServerProtocolEventMetadata,
): SlotExtractionProtocolEvent {
  if (result.outcome === "proposed") {
    return Object.freeze({
      ...commonEnvelope(metadata),
      type: "form.values.proposed",
      payload: Object.freeze({
        capabilityId,
        values: protocolCandidateValues(result.values),
      }),
    });
  }

  return protocolError(metadata, result.error);
}
