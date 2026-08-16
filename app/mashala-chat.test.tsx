// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import mashalaApplication from "../mashala.config";
import type {
  ServerToBrowserEvent,
} from "../src/runtime-protocol";
import type { RuntimeTransport } from "../src/runtime-http-client";
import type { TargetBackendRequest } from "../src/target-backend-request";
import { MashalaChat } from "./mashala-chat";

afterEach(cleanup);

function event(
  type: ServerToBrowserEvent["type"],
  payload: ServerToBrowserEvent["payload"],
  id: number,
): ServerToBrowserEvent {
  return {
    protocolVersion: "0.1",
    eventId: `server_event_${String(id)}`,
    conversationId: "conversation_test",
    inReplyTo: "browser_event_test",
    type,
    payload,
  } as ServerToBrowserEvent;
}

function route(capabilityId = "transfer_money", id = 1): ServerToBrowserEvent {
  return event(
    "capability.route.result",
    { outcome: "matched", capabilityId },
    id,
  );
}

function proposal(
  values: Readonly<Record<string, string | number | boolean>>,
  id = 2,
): ServerToBrowserEvent {
  return event(
    "form.values.proposed",
    { capabilityId: "transfer_money", values },
    id,
  );
}

function renderChat(
  transport: RuntimeTransport,
  targetBackendRequest?: TargetBackendRequest,
) {
  return render(
    <MashalaChat
      application={mashalaApplication}
      transport={transport}
      targetBackendBaseUrl="https://target.example/application/"
      targetBackendRequest={targetBackendRequest}
      conversationId="conversation_test"
      createEventId={() => "browser_event_test"}
    />,
  );
}

function sendMessage(text: string): void {
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("MashalaChat message transport", () => {
  it("types and sends one canonical user.message event", async () => {
    const transport = vi
      .fn<RuntimeTransport>()
      .mockResolvedValue([
        event("assistant.message", { text: "I can help." }, 1),
      ]);
    renderChat(transport);

    sendMessage("  transfer 500 to X  ");

    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    expect(transport).toHaveBeenCalledWith({
      protocolVersion: "0.1",
      eventId: "browser_event_test",
      conversationId: "conversation_test",
      type: "user.message",
      payload: { text: "transfer 500 to X" },
    });
    expect(screen.getByLabelText("Your message").textContent).toContain(
      "transfer 500 to X",
    );
  });

  it("announces pending state and prevents duplicate submissions", async () => {
    let resolveTransport:
      | ((events: readonly ServerToBrowserEvent[]) => void)
      | undefined;
    const transport = vi.fn<RuntimeTransport>().mockReturnValue(
      new Promise((resolve) => {
        resolveTransport = resolve;
      }),
    );
    renderChat(transport);

    sendMessage("transfer 500 to X");
    const form = screen.getByLabelText("Message").closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain(
      "Sending message",
    );
    expect(
      (screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolveTransport?.([
      event("assistant.message", { text: "Ready." }, 1),
    ]);
    await screen.findByLabelText("Assistant message");
    expect(screen.getByRole("button", { name: "Send" })).toBeInstanceOf(
      HTMLButtonElement,
    );
  });

  it("shows a clear transport failure", async () => {
    const transport = vi
      .fn<RuntimeTransport>()
      .mockRejectedValue(new Error("private network detail"));
    renderChat(transport);

    sendMessage("transfer 500 to X");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Transport failure");
    expect(alert.textContent).toContain("runtime could not be reached");
    expect(alert.textContent).not.toContain("private network detail");
  });
});

describe("MashalaChat canonical event handling", () => {
  it("selects and renders only a capability declared by the application", async () => {
    const transport = vi.fn<RuntimeTransport>().mockResolvedValue([route()]);
    renderChat(transport);

    sendMessage("make a transfer");

    expect(
      (await screen.findByLabelText("Matched capability")).textContent,
    ).toContain("transfer_money");
    expect(
      screen.getByRole("heading", { name: "Complete the request" }),
    ).toBeInstanceOf(HTMLElement);
    expect(screen.getByLabelText(/Recipient/)).toBeInstanceOf(HTMLInputElement);
  });

  it("rejects an undeclared raw route ID without rendering a form", async () => {
    const transport = vi
      .fn<RuntimeTransport>()
      .mockResolvedValue([route("model_invented_operation")]);
    renderChat(transport);

    sendMessage("do something invented");

    const error = await screen.findByLabelText("Protocol error");
    expect(error.textContent).toContain("does not declare");
    expect(
      screen.queryByRole("heading", { name: "Complete the request" }),
    ).toBeNull();
  });

  it("puts valid proposals into an editable form", async () => {
    const transport = vi
      .fn<RuntimeTransport>()
      .mockResolvedValue([
        route(),
        proposal({ recipient: "X", amount: 500 }),
      ]);
    renderChat(transport);

    sendMessage("transfer 500 to X");

    const recipient = (await screen.findByLabelText(
      /Recipient/,
    )) as HTMLInputElement;
    const amount = screen.getByLabelText(/Amount/) as HTMLInputElement;
    expect(recipient.value).toBe("X");
    expect(amount.value).toBe("500");
    expect(screen.getByLabelText("Proposed form values").textContent).toContain(
      "editable form",
    );

    fireEvent.change(recipient, { target: { value: "Edited recipient" } });
    expect(recipient.value).toBe("Edited recipient");
  });

  it("does not populate invalid or undeclared proposed values", async () => {
    const transport = vi
      .fn<RuntimeTransport>()
      .mockResolvedValue([
        route(),
        proposal({ recipient: "Invalid candidate", amount: -1 }, 2),
        proposal({ recipient: "Undeclared candidate", admin: true }, 3),
      ]);
    renderChat(transport);

    sendMessage("transfer something invalid");

    const recipient = (await screen.findByLabelText(
      /Recipient/,
    )) as HTMLInputElement;
    expect(recipient.value).toBe("");
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe("");
    expect(screen.getAllByLabelText("Protocol error")).toHaveLength(2);
  });

  it("renders assistant, out-of-scope, and protocol-error events distinctly", async () => {
    const transport = vi.fn<RuntimeTransport>().mockResolvedValue([
      event("assistant.message", { text: "Assistant text" }, 1),
      event(
        "capability.route.out_of_scope",
        { message: "No matching service" },
        2,
      ),
      event(
        "protocol.error",
        {
          code: "invalid_model_output",
          message: "The model response was invalid.",
          retryable: false,
        },
        3,
      ),
    ]);
    renderChat(transport);

    sendMessage("show distinct outcomes");

    expect(
      (await screen.findByLabelText("Assistant message")).textContent,
    ).toContain("Assistant text");
    expect(screen.getByLabelText("Out of scope").textContent).toContain(
      "No matching service",
    );
    expect(screen.getByLabelText("Protocol error").textContent).toContain(
      "invalid_model_output",
    );
  });
});

describe("MashalaChat confirmation and browser execution checkpoint", () => {
  it("flows transfer candidates through editing and confirmation before one browser-side request", async () => {
    const transport = vi
      .fn<RuntimeTransport>()
      .mockResolvedValue([
        route(),
        proposal({ recipient: "X", amount: 500 }),
      ]);
    const targetBackendRequest = vi
      .fn<TargetBackendRequest>()
      .mockResolvedValue(new Response(null, { status: 201 }));
    renderChat(transport, targetBackendRequest);

    sendMessage("transfer 500 to X");
    await screen.findByLabelText(/Recipient/);

    expect(targetBackendRequest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Transfer speed/), {
      target: { value: "standard" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));

    expect(
      screen.getByRole("region", { name: "Review and confirm" }),
    ).toBeInstanceOf(HTMLElement);
    expect(targetBackendRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    await screen.findByRole("heading", { name: "Request result" });

    expect(targetBackendRequest).toHaveBeenCalledTimes(1);
    expect(targetBackendRequest).toHaveBeenCalledWith(
      "https://target.example/transfers",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"recipient":"X","amount":500,"speed":"standard","saveRecipient":false}',
      },
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0].type).toBe("user.message");
  });
});
