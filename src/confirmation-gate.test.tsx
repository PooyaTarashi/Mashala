// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import type { BackendOperationResult } from "./backend-executor";
import { defineCapability } from "./capabilities";
import {
  ConfirmationGate,
  type ConfirmationGateProps,
  type ConfirmationPolicy,
} from "./confirmation-gate";
import { f } from "./fields";
import { compileForm } from "./forms";

afterEach(cleanup);

function createForm() {
  return compileForm(createFields());
}

function createFields() {
  return {
    recipient: f.text({ label: "Recipient", required: true }),
    note: f.longText({ label: "Note" }),
    amount: f.number({ label: "Amount", required: true, minimum: 1 }),
    speed: f.select({
      label: "Transfer speed",
      required: true,
      options: [
        { value: "standard", label: "Standard delivery" },
        { value: "instant", label: "Instant delivery" },
      ],
    }),
    saveRecipient: f.boolean({ label: "Save this recipient" }),
  };
}

function createCapability(confirmation: ConfirmationPolicy) {
  return defineCapability({
    id: "transfer_money",
    description: "Transfer money to a recipient.",
    fields: createFields(),
    operation: { method: "POST", path: "/transfers" },
    confirmation,
  });
}

function validValues() {
  return {
    recipient: "Sam",
    amount: 25,
    speed: "standard",
    saveRecipient: false,
  } as const;
}

function successfulFetch() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 201 }));
}

function renderGate(
  confirmation: ConfirmationPolicy,
  overrides: Partial<ConfirmationGateProps> = {},
) {
  const fetchImpl = overrides.fetchImpl ?? successfulFetch();
  const view = render(
    <ConfirmationGate
      capability={createCapability(confirmation)}
      baseUrl="https://target.example/application/"
      initialValues={validValues()}
      fetchImpl={fetchImpl}
      submitLabel="Review transfer"
      {...overrides}
    />,
  );

  return view;
}

describe("ConfirmationGate required policy", () => {
  it("keeps invalid submissions outside review and execution", () => {
    const fetchImpl = successfulFetch();
    renderGate("required", { initialValues: {}, fetchImpl });

    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));

    expect(screen.getByRole("alert").textContent).toContain("Check the form");
    expect(
      screen.queryByRole("region", { name: "Review and confirm" }),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("enters an accessible ordered review without executing", () => {
    const fetchImpl = successfulFetch();
    renderGate("required", { fetchImpl });

    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));

    const review = screen.getByRole("region", { name: "Review and confirm" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      Array.from(review.querySelectorAll("dt"), (term) => term.textContent),
    ).toEqual([
      "Recipient",
      "Note",
      "Amount",
      "Transfer speed",
      "Save this recipient",
    ]);
    expect(within(review).getByText('"Sam"')).toBeInstanceOf(HTMLElement);
    expect(within(review).getByText("25")).toBeInstanceOf(HTMLElement);
    expect(within(review).getByText('"standard"')).toBeInstanceOf(HTMLElement);
    expect(within(review).getByText("false")).toBeInstanceOf(HTMLElement);
    expect(within(review).getByText("Not provided (omitted)")).toBeInstanceOf(
      HTMLElement,
    );
    expect(
      (
        within(review).getByRole("button", {
          name: "Confirm and send",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      (
        within(review).getByRole("button", {
          name: "Back to form",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("sends the exact reviewed snapshot directly to the target backend once", async () => {
    const initialValues = {
      recipient: "Sam",
      amount: 25,
      speed: "standard",
      saveRecipient: false,
    };
    const fetchImpl = successfulFetch();
    renderGate("required", { initialValues, fetchImpl });

    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    const hiddenRecipient = screen.getByLabelText(
      /Recipient/,
    ) as HTMLInputElement;
    initialValues.recipient = "Changed by caller";
    fireEvent.change(hiddenRecipient, { target: { value: "Edited too late" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));

    await screen.findByRole("heading", { name: "Request result" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://target.example/transfers",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"recipient":"Sam","amount":25,"speed":"standard","saveRecipient":false}',
      },
    );
    expect(fetchImpl.mock.calls[0]?.[0]).not.toContain("/api/");
  });

  it("returns to the same editable form without executing", () => {
    const fetchImpl = successfulFetch();
    renderGate("required", { fetchImpl });

    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to form" }));

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Review and confirm" }),
    ).toBeNull();
    expect((screen.getByLabelText(/Recipient/) as HTMLInputElement).value).toBe(
      "Sam",
    );
  });

  it("guards repeated confirmation while execution is pending", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    renderGate("required", { fetchImpl });
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));

    const confirm = screen.getByRole("button", { name: "Confirm and send" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Back to form" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen
        .getByRole("region", { name: "Review and confirm" })
        .getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Request pending.");

    resolveRequest?.(new Response(null, { status: 204 }));
    await screen.findByRole("heading", { name: "Request result" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not let a cancelled review authorize a replacement value", async () => {
    const fetchImpl = successfulFetch();
    renderGate("required", { fetchImpl });
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to form" }));

    fireEvent.change(screen.getByLabelText(/Recipient/), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    expect(
      within(
        screen.getByRole("region", { name: "Review and confirm" }),
      ).getByText('"Alex"'),
    ).toBeInstanceOf(HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));

    await screen.findByRole("heading", { name: "Request result" });
    const body = String(fetchImpl.mock.calls[0]?.[1]?.body);
    expect(JSON.parse(body)).toEqual({
      recipient: "Alex",
      amount: 25,
      speed: "standard",
      saveRecipient: false,
    });
    expect(body).not.toContain("Sam");
  });
});

describe("ConfirmationGate none policy", () => {
  it("does not execute an explicit invalid submission", () => {
    const fetchImpl = successfulFetch();
    renderGate("none", { initialValues: {}, fetchImpl });

    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));

    expect(screen.getByRole("alert").textContent).toContain("Check the form");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("executes only from an explicit valid submission, never render or rerender", async () => {
    const fetchImpl = successfulFetch();
    const { rerender } = renderGate("none", { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Recipient/), {
      target: { value: "Alex" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    rerender(
      <ConfirmationGate
        capability={createCapability("none")}
        baseUrl="https://target.example"
        initialValues={validValues()}
        fetchImpl={fetchImpl}
        submitLabel="Review transfer"
      />,
    );
    expect(fetchImpl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    await screen.findByRole("heading", { name: "Request result" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("region", { name: "Review and confirm" }),
    ).toBeNull();
  });
});

describe("ConfirmationGate results and inputs", () => {
  it.each([
    {
      name: "success",
      fetchResult: new Response(null, { status: 200 }),
      expectedOutcome: "success",
      expectedMessage: "The target backend accepted the request.",
    },
    {
      name: "HTTP failure",
      fetchResult: new Response(null, { status: 422 }),
      expectedOutcome: "http-error",
      expectedMessage: "The target backend returned HTTP 422.",
    },
  ] as const)(
    "preserves a $name result",
    async ({ fetchResult, expectedOutcome, expectedMessage }) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(fetchResult);
      const onResult = vi.fn<(result: BackendOperationResult) => void>();
      renderGate("none", { fetchImpl, onResult });

      fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));

      await screen.findByText(expectedMessage);
      expect(screen.getByRole("status").textContent).toBe(expectedMessage);
      expect(onResult).toHaveBeenCalledTimes(1);
      expect(onResult.mock.calls[0]?.[0].outcome).toBe(expectedOutcome);
      expect(onResult.mock.calls[0]?.[0]).toEqual({
        outcome: expectedOutcome,
        response: fetchResult,
      });
    },
  );

  it("preserves the sanitized network-failure result", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private network detail"));
    const onResult = vi.fn<(result: BackendOperationResult) => void>();
    renderGate("none", { fetchImpl, onResult });

    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));

    await screen.findByText("The target backend could not be reached.");
    expect(screen.getByRole("status").textContent).toBe(
      "The target backend could not be reached.",
    );
    expect(onResult).toHaveBeenCalledWith({ outcome: "network-error" });
    expect(onResult.mock.calls[0]?.[0]).not.toHaveProperty("error");
  });

  it("does not mutate the form, operation, or caller values", async () => {
    const form = createForm();
    const operation = Object.freeze({
      method: "PATCH" as const,
      path: "/transfers/selected",
    });
    const initialValues = Object.freeze(validValues());
    const formBefore = JSON.stringify(form);
    const operationBefore = JSON.stringify(operation);
    const valuesBefore = JSON.stringify(initialValues);
    const fetchImpl = successfulFetch();
    const capability = Object.freeze({
      id: "transfer_money",
      description: "Transfer money to a recipient.",
      form,
      operation,
      confirmation: "required" as const,
    });
    renderGate("required", {
      capability,
      initialValues,
      fetchImpl,
    });

    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    await screen.findByRole("heading", { name: "Request result" });

    expect(JSON.stringify(form)).toBe(formBefore);
    expect(JSON.stringify(operation)).toBe(operationBefore);
    expect(JSON.stringify(initialValues)).toBe(valuesBefore);
  });

  it("rejects a malformed serialized confirmation policy before execution", () => {
    const fetchImpl = successfulFetch();
    const capability = {
      ...createCapability("required"),
      confirmation: "unexpected" as unknown as ConfirmationPolicy,
    };

    expect(() =>
      renderGate("required", { capability, fetchImpl }),
    ).toThrow(
      'Invalid confirmation policy: expected "required" or "none".',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("renders deterministically without executing", () => {
    const form = createForm();
    const props = {
      capability: {
        id: "transfer_money",
        description: "Transfer money to a recipient.",
        form,
        operation: { method: "POST", path: "/transfers" } as const,
        confirmation: "none" as const,
      },
      baseUrl: "https://target.example",
      initialValues: validValues(),
      formId: "deterministic-confirmation",
    };

    expect(renderToStaticMarkup(<ConfirmationGate {...props} />)).toBe(
      renderToStaticMarkup(<ConfirmationGate {...props} />),
    );
  });
});

describe("ConfirmationGate types", () => {
  it("uses the exact canonical confirmation-policy union", () => {
    expectTypeOf<ConfirmationPolicy>().toEqualTypeOf<"required" | "none">();
    expectTypeOf<
      ConfirmationGateProps["capability"]["confirmation"]
    >().toEqualTypeOf<"required" | "none">();
  });
});

if (false) {
  <ConfirmationGate
    capability={{
      ...createCapability("required"),
      // @ts-expect-error Confirmation policies are exactly "required" or "none".
      confirmation: "automatic",
    }}
    baseUrl="https://target.example"
  />;
}
