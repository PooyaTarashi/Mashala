// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import mashalaApplication from "../mashala.config";
import {
  createConversationStore,
  type ConversationOwnershipCoordinator,
  type ConversationStorage,
} from "../src/conversation-store";
import type { BrowserToServerEvent, ServerToBrowserEvent } from "../src/runtime-protocol";
import type { RuntimeTransport } from "../src/runtime-http-client";
import type { TargetBackendRequest } from "../src/target-backend-request";
import { MashalaChat } from "./mashala-chat";

afterEach(cleanup);

class MemoryStorage implements ConversationStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function noOwnership(): ConversationOwnershipCoordinator {
  return {
    adopt: () => undefined,
    claim: async () => false,
    release: () => undefined,
    close: () => undefined,
  };
}

function idFactory(prefix: string) {
  let sequence = 0;
  return () => `${prefix}_${String(++sequence).padStart(32, "0")}`;
}

function storeFor(storage: ConversationStorage, authScopeTag = "anonymous") {
  return createConversationStore({
    application: mashalaApplication,
    authScopeTag,
    storage,
    createConversationId: idFactory("conversation"),
    ownership: noOwnership(),
  });
}

function responseEvent(
  request: BrowserToServerEvent,
  type: ServerToBrowserEvent["type"],
  payload: ServerToBrowserEvent["payload"],
  eventId: string,
): ServerToBrowserEvent {
  return {
    protocolVersion: "0.1",
    eventId,
    conversationId: request.conversationId,
    inReplyTo: request.eventId,
    type,
    payload,
  } as ServerToBrowserEvent;
}

function transferTransport(): RuntimeTransport {
  return vi.fn(async (request) => [
    responseEvent(
      request,
      "capability.route.result",
      { outcome: "matched", capabilityId: "transfer_money" },
      `${request.eventId}_route`,
    ),
    responseEvent(
      request,
      "form.values.proposed",
      {
        capabilityId: "transfer_money",
        values: { recipient: "Restored recipient", amount: 40 },
      },
      `${request.eventId}_proposal`,
    ),
  ]);
}

async function waitUntilReady(): Promise<void> {
  await waitFor(() => {
    expect((screen.getByLabelText("Message") as HTMLInputElement).disabled).toBe(false);
  });
}

function send(text: string): void {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("MashalaChat conversation lifecycle integration", () => {
  it("assembles bounded store context into each follow-up before rerouting", async () => {
    const storage = new MemoryStorage();
    const transport = vi.fn<RuntimeTransport>(transferTransport());
    render(
      <MashalaChat
        application={mashalaApplication}
        conversationStore={storeFor(storage)}
        transport={transport}
      />,
    );
    await waitUntilReady();
    send("transfer 40 to Sam");
    await screen.findByLabelText(/Recipient/);
    fireEvent.change(screen.getByLabelText(/Recipient/), {
      target: { value: "Sam" },
    });
    send("change the amount to 50");
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));

    const followUp = transport.mock.calls[1]?.[0];
    expect(followUp?.type).toBe("user.message");
    if (followUp?.type !== "user.message") return;
    expect(followUp.payload.context).toMatchObject({
      contextVersion: "0.1",
      activeCapability: {
        capabilityId: "transfer_money",
        capabilityKind: "write",
        draft: { recipient: "Sam", amount: 40 },
      },
      transcript: [expect.objectContaining({
        role: "user",
        text: "transfer 40 to Sam",
      })],
    });
    expect(JSON.stringify(followUp.payload.context)).not.toContain("operation");
    expect(JSON.stringify(followUp.payload.context)).not.toContain("confirmation");
  });

  it("restores a bounded transcript and valid draft after refresh without a backend request", async () => {
    const storage = new MemoryStorage();
    const transport = transferTransport();
    const targetRequest = vi.fn<TargetBackendRequest>();
    const first = render(
      <MashalaChat
        application={mashalaApplication}
        conversationStore={storeFor(storage)}
        transport={transport}
        targetBackendBaseUrl="https://target.example"
        targetBackendRequest={targetRequest}
      />,
    );
    await waitUntilReady();
    send("transfer 40");
    const recipient = (await screen.findByLabelText(/Recipient/)) as HTMLInputElement;
    expect(recipient.value).toBe("Restored recipient");
    fireEvent.change(screen.getByLabelText(/Transfer speed/), {
      target: { value: "standard" },
    });
    first.unmount();

    render(
      <MashalaChat
        application={mashalaApplication}
        conversationStore={storeFor(storage)}
        transport={transport}
        targetBackendBaseUrl="https://target.example"
        targetBackendRequest={targetRequest}
      />,
    );

    expect(await screen.findByText("transfer 40")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/A safe draft was restored/)).toBeInstanceOf(HTMLElement);
    expect(screen.queryByLabelText(/Recipient/)).toBeNull();
    expect(targetRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Resume saved draft" }));
    expect((await screen.findByLabelText(/Recipient/) as HTMLInputElement).value).toBe(
      "Restored recipient",
    );
    expect((screen.getByLabelText(/Transfer speed/) as HTMLSelectElement).value).toBe("standard");
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it("clears transcript, draft, correlations, and conversation identity", async () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    const transport = transferTransport();
    render(
      <MashalaChat
        application={mashalaApplication}
        conversationStore={store}
        transport={transport}
      />,
    );
    await waitUntilReady();
    send("transfer 40");
    await screen.findByLabelText(/Recipient/);

    const before = JSON.parse(storage.getItem(store.storageKey) ?? "null") as {
      conversationId: string;
    };
    fireEvent.click(screen.getByRole("button", { name: "Clear conversation" }));
    expect(screen.getByText("Conversation cleared.")).toBeInstanceOf(HTMLElement);
    expect(screen.queryByText("transfer 40")).toBeNull();
    expect(screen.queryByLabelText(/Recipient/)).toBeNull();
    expect(screen.getByTestId("workflow-state").textContent).toContain("IDLE");
    const after = JSON.parse(storage.getItem(store.storageKey) ?? "null") as {
      conversationId: string;
      transcript: unknown[];
    };
    expect(after.conversationId).not.toBe(before.conversationId);
    expect(after.transcript).toEqual([]);
  });

  it("discards the rendered conversation when the auth-scope identity changes", async () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage, "auth_scope_a");
    const transport = transferTransport();
    const view = render(
      <MashalaChat
        application={mashalaApplication}
        authScopeTag="auth_scope_a"
        conversationStore={store}
        transport={transport}
      />,
    );
    await waitUntilReady();
    send("private user A request");
    await screen.findByLabelText(/Recipient/);

    view.rerender(
      <MashalaChat
        application={mashalaApplication}
        authScopeTag="auth_scope_b"
        conversationStore={store}
        transport={transport}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText("private user A request")).toBeNull();
      expect(screen.getByTestId("workflow-state").textContent).toContain("IDLE");
    });
    expect(storage.getItem(store.storageKey)).not.toContain("private user A request");
  });

  it("fails closed on storage errors before runtime or target-backend side effects", async () => {
    const failingStorage: ConversationStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("private quota detail");
      },
      removeItem: () => undefined,
    };
    const transport = vi.fn<RuntimeTransport>();
    const targetRequest = vi.fn<TargetBackendRequest>();
    render(
      <MashalaChat
        application={mashalaApplication}
        conversationStore={storeFor(failingStorage)}
        transport={transport}
        targetBackendRequest={targetRequest}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Conversation memory is unavailable. The request was not sent.",
    );
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).not.toContain("private quota detail");
    expect(transport).not.toHaveBeenCalled();
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it("does not start an automatically routed read when its lifecycle update cannot persist", async () => {
    let writes = 0;
    const storage = new MemoryStorage();
    const failingUpdateStorage: ConversationStorage = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        writes += 1;
        if (writes === 4) throw new Error("private quota detail");
        storage.setItem(key, value);
      },
      removeItem: (key) => storage.removeItem(key),
    };
    const transport = vi.fn<RuntimeTransport>(async (request) => [
      responseEvent(
        request,
        "capability.route.result",
        { outcome: "matched", capabilityId: "account_balance" },
        `${request.eventId}_route`,
      ),
    ]);
    const targetRequest = vi.fn<TargetBackendRequest>();
    render(
      <MashalaChat
        application={mashalaApplication}
        conversationStore={storeFor(failingUpdateStorage)}
        transport={transport}
        targetBackendRequest={targetRequest}
      />,
    );
    await waitUntilReady();
    send("show my balance");

    expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
    expect(screen.getByTestId("workflow-state").textContent).toContain("IDLE");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it("renders a bounded restored history as display-only transcript items", async () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    await store.load();
    for (let index = 0; index < 12; index += 1) {
      const appended = store.append({
        eventId: `history_${String(index)}`,
        role: index % 2 === 0 ? "user" : "assistant",
        text: `Historical message ${String(index)}`,
      });
      expect(appended.ok).toBe(true);
    }
    const transport = vi.fn<RuntimeTransport>();
    const targetRequest = vi.fn<TargetBackendRequest>();
    render(
      <MashalaChat
        application={mashalaApplication}
        conversationStore={store}
        transport={transport}
        targetBackendRequest={targetRequest}
      />,
    );

    await waitUntilReady();
    const transcript = screen.getByRole("list", { name: "Conversation transcript" });
    expect(within(transcript).getByText("Historical message 11")).toBeInstanceOf(HTMLElement);
    expect(within(transcript).getAllByText("Restored", { exact: true })).toHaveLength(12);
    expect(transport).not.toHaveBeenCalled();
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it("retries only a failed runtime message and never retries a browser operation", async () => {
    const transport = vi.fn<RuntimeTransport>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    const targetRequest = vi.fn<TargetBackendRequest>();
    render(
      <MashalaChat
        application={mashalaApplication}
        transport={transport}
        targetBackendRequest={targetRequest}
        conversationId="retry_conversation"
      />,
    );

    send("retry this safely");
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry message" }));

    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it("starts a new conversation from the session-local transcript and returns focus to the composer", async () => {
    const storage = new MemoryStorage();
    const store = storeFor(storage);
    render(
      <MashalaChat
        application={mashalaApplication}
        conversationStore={store}
        transport={transferTransport()}
      />,
    );
    await waitUntilReady();
    send("transfer 40");
    await screen.findByLabelText(/Recipient/);

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));

    expect(screen.getByText("New conversation started.")).toBeInstanceOf(HTMLElement);
    expect(screen.queryByText("transfer 40")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Message")));
  });
});
