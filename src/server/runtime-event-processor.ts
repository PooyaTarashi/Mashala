import "server-only";

import {
  resolveConversationContext,
  type ModelConversationContext,
} from "../conversation-context";
import { conversationOutcomeText } from "../conversation-store";
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
  createAssistantMessageEvent,
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
  readonly now?: () => number;
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
  now = Date.now,
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

  const contextResult = resolveConversationContext({
    application: applicationRuntime.application,
    snapshot: event.payload.context,
    currentMessage: event.payload.text,
    now: now(),
  });
  if (!contextResult.ok) {
    return Object.freeze([
      createProtocolErrorEvent(responseMetadata(event, createEventId), {
        code: "invalid_event",
        message: "The bounded conversation context is invalid or stale.",
        retryable: false,
      }),
    ]);
  }

  let conversationContext: ModelConversationContext | undefined =
    event.payload.context === undefined ? undefined : contextResult.value;
  if (event.payload.activeCapabilityId !== undefined) {
    const capability = applicationRuntime.resolveCapability(
      event.payload.activeCapabilityId,
    );
    if (
      capability === undefined ||
      (contextResult.value.activeCapability !== undefined &&
        contextResult.value.activeCapability.capabilityId !== capability.id)
    ) {
      return Object.freeze([
        createProtocolErrorEvent(responseMetadata(event, createEventId), {
          code: "invalid_event",
          message: "The active capability ID is not declared by this application or conflicts with context.",
          retryable: false,
        }),
      ]);
    }
    if (conversationContext === undefined) {
      const active = Object.freeze({
        capabilityId: capability.id,
        capabilityKind: capability.kind,
        description: capability.description,
      });
      conversationContext = Object.freeze({
        trust: "untrusted",
        currentGoal: active,
        activeCapability: active,
        recentTurns: Object.freeze([]),
        recentOutcomes: Object.freeze([]),
      });
    }
  }

  const classificationResult = await classifyMessage({
    message: event.payload.text,
    provider,
    ...(conversationContext === undefined ? {} : { conversationContext }),
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

  if (classificationResult.classification === "recent_activity") {
    const outcome = event.payload.context?.outcomes.at(-1);
    if (outcome === undefined) {
      return Object.freeze([
        createUnsupportedMessageEvent(responseMetadata(event, createEventId)),
      ]);
    }
    return Object.freeze([
      createAssistantMessageEvent(
        responseMetadata(event, createEventId),
        conversationOutcomeText(outcome, applicationRuntime.application),
      ),
    ]);
  }

  if (classificationResult.classification === "documentation") {
    const answerResult = await answerDocumentationQuestion({
      question: event.payload.text,
      provider,
      retriever: applicationRuntime.serverDependencies.documentationRetriever,
      ...(conversationContext === undefined ? {} : { conversationContext }),
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
    ...(conversationContext === undefined ? {} : { conversationContext }),
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
    ...(conversationContext === undefined ? {} : { conversationContext }),
  });
  const extractionEvent = slotExtractionResultToProtocolEvent(
    extractionResult,
    routingResult.capability.id,
    responseMetadata(event, createEventId),
  );

  return Object.freeze([routingEvent, extractionEvent]);
}
