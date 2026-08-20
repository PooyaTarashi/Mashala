import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import mashalaApplication from "../test-application";
import type { BrowserToServerEvent } from "../runtime-protocol";
import { assembleMashalaApplication } from "./application-runtime";
import type { LlmProvider, LlmProviderResult } from "./llm/provider";
import type {
  DocumentationRetriever,
  RetrievalResult,
  RetrievedChunk,
} from "./retrieval/retriever";
import { processRuntimeEvent } from "./runtime-event-processor";

const messageEvent: BrowserToServerEvent = {
  protocolVersion: "0.1",
  eventId: "browser_message_1",
  conversationId: "conversation_1",
  type: "user.message",
  payload: { text: "Send 50 to Sam" },
};

const documentationChunk: RetrievedChunk = {
  id: "chunk:transfer-confirmation",
  content: "Transfers require review and explicit confirmation.",
  provenance: {
    sourceId: "transfer-guide",
    sourceUri: "docs/transfers.md",
  },
  score: 0.95,
};

function queuedProvider(...results: readonly LlmProviderResult[]) {
  const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
  for (const result of results) {
    generateStructured.mockResolvedValueOnce(result);
  }
  return {
    provider: { generateStructured } satisfies LlmProvider,
    generateStructured,
  };
}

function runtimeWith(
  provider: LlmProvider,
  retrievalResult: RetrievalResult = { outcome: "success", chunks: [] },
) {
  const retrieve = vi
    .fn<DocumentationRetriever["retrieve"]>()
    .mockResolvedValue(retrievalResult);
  const runtime = assembleMashalaApplication({
    application: mashalaApplication,
    serverDependencies: {
      llmProvider: provider,
      documentationRetriever: { retrieve },
    },
  });
  let sequence = 0;

  return {
    retrieve,
    process: (event: BrowserToServerEvent = messageEvent) =>
      processRuntimeEvent({
        event,
        applicationRuntime: runtime,
        createEventId: () => `server_event_${String(++sequence)}`,
      }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runtime message classification handoff", () => {
  it("hands a transactional message only to declared capability routing and extraction", async () => {
    const targetBackendFetch = vi.fn();
    vi.stubGlobal("fetch", targetBackendFetch);
    const { provider, generateStructured } = queuedProvider(
      {
        outcome: "success",
        output: { classification: "transactional" },
      },
      {
        outcome: "success",
        output: { outcome: "matched", capabilityId: "transfer_money" },
      },
      {
        outcome: "success",
        output: { recipient: "Sam", amount: 50 },
      },
    );
    const { process, retrieve } = runtimeWith(provider);

    await expect(process()).resolves.toEqual([
      {
        protocolVersion: "0.1",
        eventId: "server_event_1",
        conversationId: "conversation_1",
        inReplyTo: "browser_message_1",
        type: "capability.route.result",
        payload: { outcome: "matched", capabilityId: "transfer_money" },
      },
      {
        protocolVersion: "0.1",
        eventId: "server_event_2",
        conversationId: "conversation_1",
        inReplyTo: "browser_message_1",
        type: "form.values.proposed",
        payload: {
          capabilityId: "transfer_money",
          values: { recipient: "Sam", amount: 50 },
        },
      },
    ]);
    expect(generateStructured).toHaveBeenCalledTimes(3);
    expect(retrieve).not.toHaveBeenCalled();
    expect(targetBackendFetch).not.toHaveBeenCalled();

    const classifierRequest = generateStructured.mock.calls[0]?.[0];
    const routingRequest = generateStructured.mock.calls[1]?.[0];
    expect(classifierRequest?.outputSchema).not.toHaveProperty(
      "properties.capabilityId",
    );
    expect(routingRequest?.outputSchema).toHaveProperty(
      "properties.capabilityId.enum",
      ["transfer_money", "account_balance", "show_product", "list_products"],
    );
    expect(routingRequest?.input).not.toContain("/transfers");
    expect(routingRequest?.input).not.toContain("confirmation");
  });

  it("hands a documentation question to retrieval before returning a grounded assistant answer", async () => {
    const targetBackendFetch = vi.fn();
    vi.stubGlobal("fetch", targetBackendFetch);
    const { provider, generateStructured } = queuedProvider(
      {
        outcome: "success",
        output: { classification: "documentation" },
      },
      {
        outcome: "success",
        output: {
          outcome: "grounded",
          answer: "Transfers require review and explicit confirmation.",
          usedChunkIds: [documentationChunk.id],
        },
      },
    );
    const { process, retrieve } = runtimeWith(provider, {
      outcome: "success",
      chunks: [documentationChunk],
    });

    await expect(
      process({
        ...messageEvent,
        payload: { text: "Do transfers require confirmation?" },
      }),
    ).resolves.toEqual([
      {
        protocolVersion: "0.1",
        eventId: "server_event_1",
        conversationId: "conversation_1",
        inReplyTo: "browser_message_1",
        type: "assistant.message",
        payload: {
          text: "Transfers require review and explicit confirmation.",
        },
      },
    ]);
    expect(retrieve).toHaveBeenCalledWith({
      query: "Do transfers require confirmation?",
      topK: 5,
    });
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(targetBackendFetch).not.toHaveBeenCalled();
    expect(generateStructured.mock.calls[1]?.[0].input).toContain(
      documentationChunk.content,
    );
    expect(generateStructured.mock.calls[1]?.[0].input).not.toContain(
      "capabilities",
    );
  });

  it("returns a fixed insufficient-context message without inventing an answer", async () => {
    const { provider, generateStructured } = queuedProvider(
      {
        outcome: "success",
        output: { classification: "documentation" },
      },
      {
        outcome: "success",
        output: {
          outcome: "grounded",
          answer: "This answer must never be used.",
          usedChunkIds: ["invented"],
        },
      },
    );
    const { process, retrieve } = runtimeWith(provider);

    const events = await process({
      ...messageEvent,
      payload: { text: "What is the undocumented international fee?" },
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "assistant.message",
        payload: {
          text: "I couldn't find enough information in the application documentation to answer that question.",
        },
      }),
    ]);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events)).not.toContain("answer must never be used");
  });

  it("fails an unsupported or ambiguous message safely without either handoff", async () => {
    const { provider, generateStructured } = queuedProvider({
      outcome: "success",
      output: { classification: "unsupported_or_ambiguous" },
    });
    const { process, retrieve } = runtimeWith(provider);

    const events = await process({
      ...messageEvent,
      payload: { text: "Maybe do that thing?" },
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "capability.route.out_of_scope",
        payload: {
          message:
            "I couldn't determine whether you want to perform a supported transaction or ask about this application. Please rephrase your request.",
        },
      }),
    ]);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(retrieve).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toContain("capabilityId");
  });

  it("rejects malformed classifier output without inventing a capability or fact", async () => {
    const { provider, generateStructured } = queuedProvider({
      outcome: "success",
      output: {
        classification: "transactional",
        capabilityId: "invented_capability",
        answer: "Invented documentation fact",
      },
    });
    const { process, retrieve } = runtimeWith(provider);

    const events = await process();

    expect(events).toEqual([
      expect.objectContaining({
        type: "protocol.error",
        payload: {
          code: "invalid_model_output",
          message: "The LLM returned malformed message classification output.",
          retryable: false,
        },
      }),
    ]);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(retrieve).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toContain("invented_capability");
    expect(JSON.stringify(events)).not.toContain("Invented documentation fact");
  });

  it("maps classifier and documentation failures to sanitized protocol errors", async () => {
    const rawClassifierFailure =
      "provider raw body with API_KEY=classifier-secret";
    const classifier = queuedProvider({
      outcome: "failure",
      error: {
        code: "provider_failure",
        message: rawClassifierFailure,
        retryable: true,
      },
    });
    const classifierRuntime = runtimeWith(classifier.provider);
    const classifierEvents = await classifierRuntime.process();

    expect(classifierEvents).toEqual([
      expect.objectContaining({
        type: "protocol.error",
        payload: {
          code: "internal_error",
          message: "The message classifier could not be completed.",
          retryable: true,
        },
      }),
    ]);
    expect(JSON.stringify(classifierEvents)).not.toContain("classifier-secret");

    const documentation = queuedProvider({
      outcome: "success",
      output: { classification: "documentation" },
    });
    const documentationRuntime = runtimeWith(documentation.provider, {
      outcome: "failure",
      error: {
        code: "service_failure",
        message: "private RAG failure with target-secret",
        retryable: false,
      },
    });
    const documentationEvents = await documentationRuntime.process();

    expect(documentationEvents).toEqual([
      expect.objectContaining({
        type: "protocol.error",
        payload: {
          code: "internal_error",
          message: "The documentation answer could not be completed.",
          retryable: false,
        },
      }),
    ]);
    expect(JSON.stringify(documentationEvents)).not.toContain("target-secret");
  });
});
