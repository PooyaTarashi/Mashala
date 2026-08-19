// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import mashalaApplication from "../mashala.config";
import { defineMashalaApplication } from "../src/application";
import { defineCapability } from "../src/capabilities";
import { f } from "../src/fields";
import type {
  BrowserToServerEvent,
  ServerToBrowserEvent,
} from "../src/runtime-protocol";
import type { RuntimeTransport } from "../src/runtime-http-client";
import type { TargetBackendRequest } from "../src/target-backend-request";
import { MashalaChat } from "./mashala-chat";

afterEach(cleanup);

function responseEvent(
  request: BrowserToServerEvent,
  type: ServerToBrowserEvent["type"],
  payload: ServerToBrowserEvent["payload"],
  id: string,
): ServerToBrowserEvent {
  return {
    protocolVersion: "0.1",
    eventId: id,
    conversationId: request.conversationId,
    inReplyTo: request.eventId,
    type,
    payload,
  } as ServerToBrowserEvent;
}

function routeAndProposal(
  request: BrowserToServerEvent,
  values: Readonly<Record<string, string | number | boolean>>,
  capabilityId = "transfer_money",
): readonly ServerToBrowserEvent[] {
  return [
    responseEvent(
      request,
      "capability.route.result",
      { outcome: "matched", capabilityId },
      `${request.eventId}_route`,
    ),
    responseEvent(
      request,
      "form.values.proposed",
      { capabilityId, values },
      `${request.eventId}_proposal`,
    ),
  ];
}

function eventIdFactory() {
  let sequence = 0;
  return () => `browser_${String(++sequence)}`;
}

function renderWorkflow(
  transport: RuntimeTransport,
  targetBackendRequest?: TargetBackendRequest,
) {
  return render(
    <MashalaChat
      application={mashalaApplication}
      transport={transport}
      targetBackendBaseUrl="https://target.example/application/"
      targetBackendRequest={targetBackendRequest}
      conversationId="workflow_conversation"
      createEventId={eventIdFactory()}
    />,
  );
}

function send(text: string): void {
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

function workflowState(): string {
  return screen.getByTestId("workflow-state").textContent ?? "";
}

function completeTransferForm(): void {
  fireEvent.change(screen.getByLabelText(/Transfer speed/), {
    target: { value: "standard" },
  });
}

describe("MashalaChat page capability workflow", () => {
  it("runs route, partial extraction, editable completion, exact review, and browser execution to completion", async () => {
    let resolveWrite: ((response: Response) => void) | undefined;
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (request) =>
      routeAndProposal(request, { recipient: "Proposed", amount: 500 }),
    );
    const targetRequest = vi.fn<TargetBackendRequest>().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveWrite = resolve;
      }),
    );
    renderWorkflow(transport, targetRequest);

    expect(workflowState()).toContain("IDLE");
    send("transfer 500 to Proposed");
    expect(workflowState()).toContain("ROUTING");

    const recipient = (await screen.findByLabelText(/Recipient/)) as HTMLInputElement;
    expect(workflowState()).toContain("FILLING");
    expect(recipient.value).toBe("Proposed");
    expect((screen.getByLabelText(/Transfer speed/) as HTMLSelectElement).value).toBe("");

    fireEvent.change(recipient, { target: { value: "Reviewed recipient" } });
    completeTransferForm();
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(workflowState()).toContain("CONFIRMING");
    expect(
      within(screen.getByRole("region", { name: "Review and confirm" })).getByText(
        '"Reviewed recipient"',
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(targetRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(workflowState()).toContain("EXECUTING");
    expect(targetRequest).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(targetRequest.mock.calls[0]?.[1]?.body))).toEqual({
      recipient: "Reviewed recipient",
      amount: 500,
      speed: "standard",
      saveRecipient: false,
    });

    resolveWrite?.(new Response(null, { status: 201 }));
    await screen.findByText("The target backend accepted the request.");
    expect(workflowState()).toContain("COMPLETED");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid proposal and permits deterministic user correction", async () => {
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (request) =>
      routeAndProposal(request, { recipient: "Bad", amount: -5 }),
    );
    const targetRequest = vi
      .fn<TargetBackendRequest>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    renderWorkflow(transport, targetRequest);

    send("make an invalid transfer proposal");
    const recipient = (await screen.findByLabelText(/Recipient/)) as HTMLInputElement;
    expect(recipient.value).toBe("");
    expect(screen.getByLabelText("Protocol error").textContent).toContain(
      "rejected",
    );

    fireEvent.change(recipient, { target: { value: "Corrected" } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "10" } });
    completeTransferForm();
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));

    await screen.findByText("The target backend accepted the request.");
    expect(targetRequest).toHaveBeenCalledTimes(1);
  });

  it("cancels review without authorizing a write", async () => {
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (request) =>
      routeAndProposal(request, { recipient: "Sam", amount: 20, speed: "standard" }),
    );
    const targetRequest = vi
      .fn<TargetBackendRequest>()
      .mockResolvedValue(new Response(null, { status: 201 }));
    renderWorkflow(transport, targetRequest);

    send("transfer to Sam");
    await screen.findByLabelText(/Recipient/);
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(workflowState()).toContain("CONFIRMING");
    fireEvent.click(screen.getByRole("button", { name: "Cancel current request" }));

    expect(workflowState()).toContain("IDLE");
    expect(screen.queryByRole("button", { name: "Confirm and send" })).toBeNull();
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "HTTP failure",
      request: () => Promise.resolve(new Response(null, { status: 422 })),
      message: "The target backend returned HTTP 422.",
    },
    {
      name: "network failure",
      request: () => Promise.reject(new Error("private network detail")),
      message: "The target backend could not be reached.",
    },
  ])("shows a distinct $name and enters FAILED", async ({ request, message }) => {
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (runtimeEvent) =>
      routeAndProposal(runtimeEvent, {
        recipient: "Sam",
        amount: 20,
        speed: "standard",
      }),
    );
    const targetRequest = vi.fn<TargetBackendRequest>().mockImplementation(request);
    renderWorkflow(transport, targetRequest);

    send("transfer to Sam");
    await screen.findByLabelText(/Recipient/);
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));

    await screen.findByText(message);
    expect(workflowState()).toContain("FAILED");
    expect(targetRequest).toHaveBeenCalledTimes(1);
  });

  it("returns an out-of-scope request to IDLE without rendering or executing", async () => {
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (request) => [
      responseEvent(
        request,
        "capability.route.out_of_scope",
        { message: "No declared transaction matches." },
        "out_of_scope",
      ),
    ]);
    const targetRequest = vi.fn<TargetBackendRequest>();
    renderWorkflow(transport, targetRequest);

    send("book a flight");
    await screen.findByText("No declared transaction matches.");
    expect(workflowState()).toContain("IDLE");
    expect(screen.queryByText("Complete the request")).toBeNull();
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it("returns a documentation assistant answer to IDLE without rendering or executing", async () => {
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (request) => [
      responseEvent(
        request,
        "assistant.message",
        { text: "Transfers require explicit confirmation." },
        "documentation_answer",
      ),
    ]);
    const targetRequest = vi.fn<TargetBackendRequest>();
    renderWorkflow(transport, targetRequest);

    send("Do transfers require confirmation?");
    await screen.findByText("Transfers require explicit confirmation.");
    expect(workflowState()).toContain("IDLE");
    expect(screen.queryByText("Complete the request")).toBeNull();
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it("ignores a stale route response after cancellation and a newer request", async () => {
    const resolvers = new Map<
      string,
      (events: readonly ServerToBrowserEvent[]) => void
    >();
    const transport = vi.fn<RuntimeTransport>().mockImplementation(
      (request) =>
        new Promise((resolve) => {
          resolvers.set(request.eventId, resolve);
        }),
    );
    renderWorkflow(transport);

    send("old request");
    fireEvent.click(screen.getByRole("button", { name: "Cancel current request" }));
    send("new request");
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    const first = transport.mock.calls[0]?.[0];
    const second = transport.mock.calls[1]?.[0];
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    resolvers.get(second!.eventId)?.(
      routeAndProposal(second!, { recipient: "New", amount: 30 }),
    );
    const recipient = (await screen.findByLabelText(/Recipient/)) as HTMLInputElement;
    expect(recipient.value).toBe("New");

    resolvers.get(first!.eventId)?.(
      routeAndProposal(first!, { recipient: "Stale", amount: 999 }),
    );
    await waitFor(() => expect(recipient.value).toBe("New"));
    expect(workflowState()).toContain("FILLING");
  });

  it("invalidates the editable draft while a follow-up is rerouted and ignores it after cancellation", async () => {
    let resolveFollowUp:
      | ((events: readonly ServerToBrowserEvent[]) => void)
      | undefined;
    const transport = vi.fn<RuntimeTransport>().mockImplementation((request) => {
      if (request.type === "user.message" && request.payload.activeCapabilityId) {
        return new Promise((resolve) => {
          resolveFollowUp = resolve;
        });
      }
      return Promise.resolve(
        routeAndProposal(request, {
          recipient: "Reviewed",
          amount: 40,
          speed: "standard",
        }),
      );
    });
    const targetRequest = vi
      .fn<TargetBackendRequest>()
      .mockResolvedValue(new Response(null, { status: 201 }));
    renderWorkflow(transport, targetRequest);

    send("initial transfer");
    await screen.findByLabelText(/Recipient/);
    send("change it from stale language");
    expect(workflowState()).toContain("ROUTING");
    expect(screen.queryByRole("button", { name: "Review request" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel current request" }));

    const followUpRequest = transport.mock.calls[1]?.[0];
    expect(followUpRequest).toBeDefined();
    resolveFollowUp?.(routeAndProposal(followUpRequest!, { recipient: "Stale" }));

    await waitFor(() => expect(workflowState()).toContain("IDLE"));
    expect(screen.queryByText("Complete the request")).toBeNull();
    expect(targetRequest).not.toHaveBeenCalled();
  });

  it("guards duplicate confirmation while one browser write is pending", async () => {
    let resolveWrite: ((response: Response) => void) | undefined;
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (request) =>
      routeAndProposal(request, { recipient: "Sam", amount: 20, speed: "standard" }),
    );
    const targetRequest = vi.fn<TargetBackendRequest>().mockReturnValue(
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
    );
    renderWorkflow(transport, targetRequest);

    send("transfer to Sam");
    await screen.findByLabelText(/Recipient/);
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    const confirm = screen.getByRole("button", { name: "Confirm and send" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(workflowState()).toContain("EXECUTING");
    expect(targetRequest).toHaveBeenCalledTimes(1);
    resolveWrite?.(new Response(null, { status: 201 }));
    await screen.findByText("The target backend accepted the request.");
  });
});

function referenceApplication(withProjection: boolean) {
  const capability = defineCapability({
    id: "pay_bill",
    description: "Pay a bill from a declared account.",
    fields: {
      account: f.reference({
        label: "Account",
        required: true,
        source: {
          method: "GET",
          path: "/accounts",
          ...(withProjection
            ? {
                modelContext: {
                  purpose: "reference_resolution" as const,
                  fields: { id: "id", label: "display_name" },
                },
              }
            : {}),
        },
        value: "id",
        labelFrom: "display_name",
      }),
    },
    operation: { method: "POST", path: "/bill-payments" },
    confirmation: "required",
  });

  return defineMashalaApplication({
    app: {
      id: "reference_demo",
      name: "Reference demo",
      description: "Reference workflow test application.",
    },
    capabilities: [capability],
  });
}

describe("MashalaChat reference reads and ADR-016 context", () => {
  it("keeps the read and write browser-side and sends only declared projection data", async () => {
    const application = referenceApplication(true);
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (request) => {
      if (request.type === "backend.context.selected") {
        return [
          responseEvent(
            request,
            "assistant.message",
            { text: "Projected account context received." },
            "context_ack",
          ),
        ];
      }
      return routeAndProposal(request, {}, "pay_bill");
    });
    const targetRequest = vi.fn<TargetBackendRequest>().mockImplementation(
      async (_input, init) =>
        init?.method === "GET"
          ? Response.json([
              {
                id: "acct_1",
                display_name: "Checking",
                balance: 999,
                private_note: "not projected",
              },
            ])
          : new Response(null, { status: 201 }),
    );
    render(
      <MashalaChat
        application={application}
        transport={transport}
        targetBackendBaseUrl="https://target.example/app/"
        targetBackendRequest={targetRequest}
        conversationId="reference_conversation"
        createEventId={eventIdFactory()}
      />,
    );

    send("pay a bill");
    await screen.findByRole("option", { name: "Checking" });
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(targetRequest).toHaveBeenNthCalledWith(
      1,
      "https://target.example/accounts",
      { method: "GET" },
    );
    const contextEvent = transport.mock.calls[1]?.[0];
    expect(contextEvent?.type).toBe("backend.context.selected");
    if (contextEvent?.type !== "backend.context.selected") {
      throw new Error("Expected selected backend context.");
    }
    expect(contextEvent.payload).toEqual({
      capabilityId: "pay_bill",
      purpose: "reference_resolution",
      data: [{ id: "acct_1", label: "Checking" }],
    });
    expect(JSON.stringify(contextEvent)).not.toContain("balance");
    expect(JSON.stringify(contextEvent)).not.toContain("private_note");

    fireEvent.change(screen.getByLabelText(/Account/), {
      target: { value: "acct_1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    await screen.findByText("The target backend accepted the request.");
    expect(targetRequest).toHaveBeenNthCalledWith(
      2,
      "https://target.example/bill-payments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"account":"acct_1"}',
      },
    );
    expect(transport.mock.calls.some(([event]) => event.type === "user.message")).toBe(true);
    expect(
      transport.mock.calls.some(([event]) =>
        "operation" in event.payload,
      ),
    ).toBe(false);
  });

  it("emits no backend context event when the read has no projection descriptor", async () => {
    const application = referenceApplication(false);
    const transport = vi.fn<RuntimeTransport>().mockImplementation(async (request) =>
      routeAndProposal(request, {}, "pay_bill"),
    );
    const targetRequest = vi
      .fn<TargetBackendRequest>()
      .mockResolvedValue(Response.json([{ id: "acct_1", display_name: "Checking" }]));
    render(
      <MashalaChat
        application={application}
        transport={transport}
        targetBackendBaseUrl="https://target.example"
        targetBackendRequest={targetRequest}
        conversationId="no_projection_conversation"
        createEventId={eventIdFactory()}
      />,
    );

    send("pay a bill");
    await screen.findByRole("option", { name: "Checking" });
    await waitFor(() => expect(targetRequest).toHaveBeenCalledTimes(1));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0].type).toBe("user.message");
  });
});
