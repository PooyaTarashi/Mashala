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

import { defineMashalaApplication } from "../src/application";
import { defineReadCapability, result } from "../src/capabilities";
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

function routeTransport(
  capabilityId: string,
  proposedValues?: Readonly<Record<string, string | number | boolean>>,
): RuntimeTransport {
  return vi.fn<RuntimeTransport>().mockImplementation(async (request) => [
    responseEvent(
      request,
      "capability.route.result",
      { outcome: "matched", capabilityId },
      `${request.eventId}_route`,
    ),
    ...(proposedValues === undefined
      ? []
      : [
          responseEvent(
            request,
            "form.values.proposed",
            { capabilityId, values: proposedValues },
            `${request.eventId}_proposal`,
          ),
        ]),
  ]);
}

function applicationWith(capability: ReturnType<typeof defineReadCapability>) {
  return defineMashalaApplication({
    app: {
      id: "read_workflow_test",
      name: "Read workflow test",
      description: "Tests deterministic browser reads.",
    },
    capabilities: [capability],
  });
}

function renderRead(
  capability: ReturnType<typeof defineReadCapability>,
  transport: RuntimeTransport,
  request: TargetBackendRequest,
) {
  return render(
    <MashalaChat
      application={applicationWith(capability)}
      transport={transport}
      targetBackendBaseUrl="https://target.example/app/"
      targetBackendRequest={request}
      conversationId="read_conversation"
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

const balanceCapability = defineReadCapability({
  id: "account_balance",
  description: "Show the current account balance.",
  operation: { method: "GET", path: "/account/balance" },
  result: result.card({
    title: { kind: "fixed", text: "Account balance" },
    facts: [
      {
        id: "balance",
        label: "Balance",
        value: {
          kind: "property",
          property: "balance",
          formatter: { kind: "currency", locale: "en-US", currency: "USD" },
        },
      },
      {
        id: "status",
        label: "Status",
        value: {
          kind: "property",
          property: "status",
          formatter: { kind: "text" },
        },
      },
    ],
  }),
});

const oneProductCapability = defineReadCapability({
  id: "show_product",
  description: "Show one product by ID.",
  input: {
    productId: f.text({ label: "Product ID", required: true }),
  },
  operation: {
    method: "GET",
    path: "/products/{id}",
    bindings: { path: { id: "productId" } },
  },
  result: result.card({
    image: {
      source: {
        kind: "property",
        property: "image_url",
        formatter: { kind: "imageUrl" },
      },
      alt: "Product photograph",
    },
    title: {
      kind: "property",
      property: "title",
      formatter: { kind: "text" },
    },
    description: {
      kind: "property",
      property: "description",
      formatter: { kind: "text" },
    },
    facts: [
      {
        id: "price",
        label: "Price",
        value: {
          kind: "property",
          property: "price",
          formatter: { kind: "currency", locale: "en-US", currency: "USD" },
        },
      },
    ],
  }),
});

const productListCapability = defineReadCapability({
  id: "list_products",
  description: "Show all products.",
  operation: { method: "GET", path: "/products" },
  result: result.cardList({
    emptyText: "No products matched.",
    card: {
      title: {
        kind: "property",
        property: "title",
        formatter: { kind: "text" },
      },
    },
  }),
});

describe("MashalaChat integrated read workflow", () => {
  it("executes a zero-input balance GET immediately after routing and presents one declared card", async () => {
    let resolveRead: ((response: Response) => void) | undefined;
    const request = vi.fn<TargetBackendRequest>().mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    renderRead(
      balanceCapability,
      routeTransport("account_balance"),
      request,
    );

    send("What is my account balance?");
    await screen.findByRole("status", { name: "Loading read result" });
    expect(workflowState()).toContain("FETCHING");
    expect(screen.queryByText("Choose read inputs")).toBeNull();
    expect(request).toHaveBeenCalledWith(
      "https://target.example/account/balance",
      expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) }),
    );

    resolveRead?.(Response.json({
      balance: 1250.5,
      status: "Available",
      private_note: "browser only",
    }));
    const resultEntry = await screen.findByRole("article", { name: "Read result" });
    expect(workflowState()).toContain("PRESENTING");
    expect(within(resultEntry).getByRole("heading", { name: "Account balance" })).toBeInstanceOf(
      HTMLElement,
    );
    expect(within(resultEntry).getByText("$1,250.50")).toBeInstanceOf(HTMLElement);
    expect(screen.queryByText("browser only")).toBeNull();
  });

  it("collects and permits editing parameterized input before fetching one product", async () => {
    const request = vi.fn<TargetBackendRequest>().mockResolvedValue(
      Response.json({
        title: "Notebook",
        description: "A paper notebook.",
        price: 9.5,
        image_url: "/images/notebook.png",
      }),
    );
    renderRead(
      oneProductCapability,
      routeTransport("show_product", { productId: "42" }),
      request,
    );

    send("Show product 42");
    const input = (await screen.findByLabelText(/Product ID/)) as HTMLInputElement;
    expect(workflowState()).toContain("COLLECTING");
    expect(input.value).toBe("42");
    expect(request).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "43" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch result" }));
    await screen.findByRole("heading", { name: "Notebook" });
    expect(request).toHaveBeenCalledWith(
      "https://target.example/products/43",
      expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole("img", { name: "Product photograph" }).getAttribute("src")).toBe(
      "https://target.example/images/notebook.png",
    );
  });

  it("renders a successful root array only as the declared card list", async () => {
    const request = vi.fn<TargetBackendRequest>().mockResolvedValue(
      Response.json([{ title: "Pencil" }, { title: "Notebook" }]),
    );
    renderRead(
      productListCapability,
      routeTransport("list_products"),
      request,
    );

    send("Show me the products");
    const list = await screen.findByRole("list", { name: "Read results" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    expect(workflowState()).toContain("PRESENTING");
  });

  it("uses the declared empty state for a successful empty root array", async () => {
    const request = vi.fn<TargetBackendRequest>().mockResolvedValue(Response.json([]));
    renderRead(
      productListCapability,
      routeTransport("list_products"),
      request,
    );

    send("Show products");
    const empty = await screen.findByRole("status", { name: "Empty read result" });
    expect(empty.textContent).toContain("No products matched.");
    expect(workflowState()).toContain("EMPTY");
    expect(screen.queryByRole("list", { name: "Read results" })).toBeNull();
  });

  it.each([
    {
      name: "malformed JSON",
      response: () => Promise.resolve(new Response("{bad-json", { status: 200 })),
      message: "returned malformed JSON",
    },
    {
      name: "HTTP failure",
      response: () => Promise.resolve(new Response(null, { status: 403 })),
      message: "returned HTTP 403",
    },
    {
      name: "network failure",
      response: () => Promise.reject(new Error("private network detail")),
      message: "could not be reached",
    },
  ])("shows sanitized $name as a failed read", async ({ response, message }) => {
    const request = vi.fn<TargetBackendRequest>().mockImplementation(response);
    renderRead(
      balanceCapability,
      routeTransport("account_balance"),
      request,
    );

    send("Show balance");
    const failure = await screen.findByRole("alert", { name: "Read failure" });
    expect(failure.textContent).toContain(message);
    expect(failure.textContent).not.toContain("private network detail");
    expect(workflowState()).toContain("FAILED");
  });

  it("fails the complete list when any item is partial", async () => {
    const request = vi.fn<TargetBackendRequest>().mockResolvedValue(
      Response.json([{ title: "Valid" }, { id: "missing-title" }]),
    );
    renderRead(
      productListCapability,
      routeTransport("list_products"),
      request,
    );

    send("Show products");
    const failure = await screen.findByRole("alert", { name: "Read failure" });
    expect(failure.textContent).toContain("does not match the declared result view");
    expect(screen.queryByText("Valid")).toBeNull();
  });

  it("ignores a cancelled stale fetch after a newer overlapping run presents", async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const request = vi
      .fn<TargetBackendRequest>()
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(Response.json([{ title: "Fresh product" }]));
    renderRead(
      productListCapability,
      routeTransport("list_products"),
      request,
    );

    send("Old products");
    await screen.findByRole("status", { name: "Loading read result" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel current request" }));
    expect(workflowState()).toContain("IDLE");
    send("New products");
    await screen.findByRole("heading", { name: "Fresh product" });

    resolveFirst?.(Response.json([{ title: "Stale product" }]));
    await waitFor(() => expect(screen.queryByText("Stale product")).toBeNull());
    expect(screen.getByText("Fresh product")).toBeInstanceOf(HTMLElement);
    expect(workflowState()).toContain("PRESENTING");
  });

  it("keeps full rendered responses browser-local even when ADR-016 projection is declared", async () => {
    const projectedCapability = defineReadCapability({
      id: "projected_product",
      description: "Show a projected product.",
      operation: {
        method: "GET",
        path: "/projected-product",
        modelContext: {
          purpose: "result_interpretation",
          fields: { productTitle: "title" },
        },
      },
      result: result.card({
        title: {
          kind: "property",
          property: "title",
          formatter: { kind: "text" },
        },
      }),
    });
    const transport = routeTransport("projected_product") as ReturnType<typeof vi.fn<RuntimeTransport>>;
    const request = vi.fn<TargetBackendRequest>().mockResolvedValue(
      Response.json({
        title: "Visible product",
        internal_secret: "never crosses the runtime transport",
      }),
    );
    renderRead(projectedCapability, transport, request);

    send("Show projected product");
    await screen.findByRole("heading", { name: "Visible product" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0].type).toBe("user.message");
    expect(
      transport.mock.calls.some(([event]) => event.type === "backend.context.selected"),
    ).toBe(false);
    expect(JSON.stringify(transport.mock.calls)).not.toContain("internal_secret");
    expect(screen.queryByText("never crosses the runtime transport")).toBeNull();
  });
});
