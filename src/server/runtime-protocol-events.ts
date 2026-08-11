import "server-only";

import {
  RUNTIME_PROTOCOL_VERSION,
  type CapabilityRouteResultEvent,
  type OutOfScopeEvent,
  type ProtocolErrorEvent,
  type SlotCandidatesProposedEvent,
} from "../runtime-protocol";
import type {
  CapabilityRoutingError,
  CapabilityRoutingResult,
} from "./capability-router";
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

function protocolError(
  metadata: ServerProtocolEventMetadata,
  error: CapabilityRoutingError | SlotExtractionError,
): ProtocolErrorEvent {
  if (error.kind === "provider_failure") {
    return Object.freeze({
      ...commonEnvelope(metadata),
      type: "protocol.error",
      payload: Object.freeze({
        code: "internal_error",
        message: error.failure.message,
        retryable: error.failure.retryable,
      }),
    });
  }

  return Object.freeze({
    ...commonEnvelope(metadata),
    type: "protocol.error",
    payload: Object.freeze({
      code: "invalid_model_output",
      message: error.message,
      retryable: false,
    }),
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
