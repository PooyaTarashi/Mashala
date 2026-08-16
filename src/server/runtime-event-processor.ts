import "server-only";

import type {
  BrowserToServerEvent,
  ServerToBrowserEvent,
} from "../runtime-protocol";
import type { MashalaApplicationRuntime } from "./application-runtime";
import { routeCapability } from "./capability-router";
import { answerDocumentationQuestion } from "./knowledge-answer";
import { classifyMessage } from "./message-classifier";
import {
  capabilityRoutingResultToProtocolEvent,
  createUnsupportedMessageEvent,
  createProtocolErrorEvent,
  knowledgeAnswerResultToProtocolEvent,
  messageClassificationErrorToProtocolEvent,
  slotExtractionResultToProtocolEvent,
  type ServerProtocolEventMetadata,
} from "./runtime-protocol-events";
import { extractSlotCandidates } from "./slot-extractor";

export interface ProcessRuntimeEventInput {
  readonly event: BrowserToServerEvent;
  readonly applicationRuntime: MashalaApplicationRuntime;
  readonly createEventId: () => string;
}

function responseMetadata(
  event: BrowserToServerEvent,
  createEventId: () => string,
): ServerProtocolEventMetadata {
  return {
    eventId: createEventId(),
    conversationId: event.conversationId,
    inReplyTo: event.eventId,
  };
}

/**
 * Classifies new messages before handing them to the existing capability or
 * documentation path. It performs no workflow transition or backend request.
 */
export async function processRuntimeEvent({
  event,
  applicationRuntime,
  createEventId,
}: ProcessRuntimeEventInput): Promise<readonly ServerToBrowserEvent[]> {
  const provider = applicationRuntime.serverDependencies.llmProvider;

  if (event.type === "backend.context.selected") {
    const capability = applicationRuntime.resolveCapability(
      event.payload.capabilityId,
    );

    if (capability === undefined) {
      return Object.freeze([
        createProtocolErrorEvent(responseMetadata(event, createEventId), {
          code: "invalid_event",
          message: "The selected backend context names an undeclared capability.",
          retryable: false,
        }),
      ]);
    }

    const extractionResult = await extractSlotCandidates({
      capability,
      utterance: "",
      provider,
      backendContext: event,
    });

    return Object.freeze([
      slotExtractionResultToProtocolEvent(
        extractionResult,
        capability.id,
        responseMetadata(event, createEventId),
      ),
    ]);
  }

  if (event.payload.activeCapabilityId !== undefined) {
    const capability = applicationRuntime.resolveCapability(
      event.payload.activeCapabilityId,
    );

    if (capability === undefined) {
      return Object.freeze([
        createProtocolErrorEvent(responseMetadata(event, createEventId), {
          code: "invalid_event",
          message: "The active capability ID is not declared by this application.",
          retryable: false,
        }),
      ]);
    }

    const extractionResult = await extractSlotCandidates({
      capability,
      utterance: event.payload.text,
      provider,
    });

    return Object.freeze([
      slotExtractionResultToProtocolEvent(
        extractionResult,
        capability.id,
        responseMetadata(event, createEventId),
      ),
    ]);
  }

  const classificationResult = await classifyMessage({
    message: event.payload.text,
    provider,
  });

  if (classificationResult.outcome === "error") {
    return Object.freeze([
      messageClassificationErrorToProtocolEvent(
        classificationResult.error,
        responseMetadata(event, createEventId),
      ),
    ]);
  }

  if (classificationResult.classification === "unsupported_or_ambiguous") {
    return Object.freeze([
      createUnsupportedMessageEvent(responseMetadata(event, createEventId)),
    ]);
  }

  if (classificationResult.classification === "documentation") {
    const answerResult = await answerDocumentationQuestion({
      question: event.payload.text,
      provider,
      retriever: applicationRuntime.serverDependencies.documentationRetriever,
    });

    return Object.freeze([
      knowledgeAnswerResultToProtocolEvent(
        answerResult,
        responseMetadata(event, createEventId),
      ),
    ]);
  }

  const routingResult = await routeCapability({
    utterance: event.payload.text,
    capabilities: applicationRuntime.application.capabilities,
    provider,
  });
  const routingEvent = capabilityRoutingResultToProtocolEvent(
    routingResult,
    responseMetadata(event, createEventId),
  );

  if (routingResult.outcome !== "matched") {
    return Object.freeze([routingEvent]);
  }

  const extractionResult = await extractSlotCandidates({
    capability: routingResult.capability,
    utterance: event.payload.text,
    provider,
  });
  const extractionEvent = slotExtractionResultToProtocolEvent(
    extractionResult,
    routingResult.capability.id,
    responseMetadata(event, createEventId),
  );

  return Object.freeze([routingEvent, extractionEvent]);
}
