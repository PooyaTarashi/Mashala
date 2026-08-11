// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import { f } from "./fields";
import {
  CompiledForm,
  type CompiledFormProps,
  type FormValue,
} from "./form-renderer";
import {
  compileForm,
  type FieldMetadata,
  type FormDefinition,
} from "./forms";

afterEach(cleanup);

function createForm() {
  return compileForm({
    recipient: f.text({
      label: "Recipient",
      helpText: "Enter a name.",
      required: true,
      minLength: 2,
      maxLength: 5,
    }),
    note: f.longText({
      label: "Note",
      helpText: "An optional short note.",
      minLength: 3,
      maxLength: 10,
    }),
    amount: f.number({
      label: "Amount",
      required: true,
      minimum: 1,
      maximum: 100,
    }),
    speed: f.select({
      label: "Transfer speed",
      required: true,
      options: [
        { value: "standard", label: "Standard delivery" },
        { value: "instant", label: "Instant delivery" },
      ],
    }),
    saveRecipient: f.boolean({
      label: "Save this recipient",
      helpText: "Keep this recipient for later.",
    }),
  });
}

function validInitialValues() {
  return {
    recipient: "Sam",
    note: "Dinner",
    amount: 25,
    speed: "standard",
    saveRecipient: false,
  } as const;
}

function createReferenceForm() {
  return compileForm({
    account: f.reference({
      label: "From account",
      helpText: "Choose the source account.",
      required: true,
      source: { method: "GET", path: "/accounts" },
      value: "id",
      labelFrom: "display_name",
    }),
    note: f.text({ label: "Note" }),
  });
}

function accountResponse() {
  return Response.json([
    { id: "acct_1", display_name: "Checking" },
    { id: "acct_2", display_name: "Savings" },
  ]);
}

describe("CompiledForm rendering", () => {
  it("renders all five field kinds in declaration order", () => {
    const { container } = render(
      <CompiledForm form={createForm()} onSubmit={() => undefined} />,
    );

    expect(screen.getByLabelText(/Recipient/)).toBeInstanceOf(HTMLInputElement);
    expect(
      (screen.getByLabelText(/Recipient/) as HTMLInputElement).type,
    ).toBe("text");
    expect(screen.getByLabelText("Note")).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByLabelText(/Amount/)).toBeInstanceOf(HTMLInputElement);
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).type).toBe(
      "number",
    );
    expect(screen.getByLabelText(/Transfer speed/)).toBeInstanceOf(
      HTMLSelectElement,
    );
    expect(screen.getByLabelText("Save this recipient")).toBeInstanceOf(
      HTMLInputElement,
    );
    expect(
      (screen.getByLabelText("Save this recipient") as HTMLInputElement).type,
    ).toBe("checkbox");

    expect(
      Array.from(container.querySelectorAll("input, textarea, select"), (node) =>
        node.getAttribute("name"),
      ),
    ).toEqual(["recipient", "note", "amount", "speed", "saveRecipient"]);
  });

  it("associates labels, help text, and schema-derived required status", () => {
    render(
      <CompiledForm
        form={createForm()}
        formId="transfer-form"
        onSubmit={() => undefined}
      />,
    );

    const recipient = screen.getByLabelText(/Recipient/) as HTMLInputElement;
    const note = screen.getByLabelText("Note") as HTMLTextAreaElement;
    const amount = screen.getByLabelText(/Amount/) as HTMLInputElement;
    const speed = screen.getByLabelText(/Transfer speed/) as HTMLSelectElement;
    const checkbox = screen.getByLabelText(
      "Save this recipient",
    ) as HTMLInputElement;

    expect(recipient.id).toBe("74-72-61-6e-73-66-65-72-2d-66-6f-72-6d-field-72-65-63-69-70-69-65-6e-74");
    expect(recipient.labels?.[0]?.htmlFor).toBe(recipient.id);
    expect(recipient.required).toBe(true);
    expect(amount.required).toBe(true);
    expect(speed.required).toBe(true);
    expect(note.required).toBe(false);
    expect(checkbox.required).toBe(false);
    expect(checkbox.getAttribute("aria-required")).toBe("false");

    const helpIds = recipient.getAttribute("aria-describedby")?.split(" ");
    expect(helpIds).toHaveLength(1);
    expect(document.getElementById(helpIds?.[0] ?? "")?.textContent).toBe(
      "Enter a name.",
    );
    expect(note.getAttribute("aria-describedby")).toBeTruthy();
    expect(checkbox.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getAllByText("(required)")).toHaveLength(3);
  });

  it("derives select values from enum and labels from metadata", () => {
    render(
      <CompiledForm form={createForm()} onSubmit={() => undefined} />,
    );

    const select = screen.getByLabelText(
      /Transfer speed/,
    ) as HTMLSelectElement;
    const options = within(select).getAllByRole("option") as HTMLOptionElement[];

    expect(options.map(({ value, textContent }) => [value, textContent])).toEqual([
      ["", "Select an option"],
      ["standard", "Standard delivery"],
      ["instant", "Instant delivery"],
    ]);
  });

  it("renders deterministic markup and IDs", () => {
    const form = createForm();
    const first = renderToStaticMarkup(
      <CompiledForm
        form={form}
        formId="stable-form"
        onSubmit={() => undefined}
      />,
    );
    const second = renderToStaticMarkup(
      <CompiledForm
        form={form}
        formId="stable-form"
        onSubmit={() => undefined}
      />,
    );

    expect(first).toBe(second);
    expect(first).toContain("73-74-61-62-6c-65-2d-66-6f-72-6d-field");
  });

  it("accepts matching schema and metadata keys in different insertion order", () => {
    const form: FormDefinition<"amount" | "recipient"> = {
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          amount: { type: "number", minimum: 1 },
          recipient: { type: "string", minLength: 2 },
        },
        required: ["amount", "recipient"],
        additionalProperties: false,
      },
      fields: {
        recipient: { kind: "text", label: "Recipient" },
        amount: { kind: "number", label: "Amount" },
      },
    };
    const onSubmit = vi.fn();
    const { container } = render(
      <CompiledForm form={form} onSubmit={onSubmit} />,
    );

    expect(
      Array.from(container.querySelectorAll("input"), (control) =>
        control.getAttribute("name"),
      ),
    ).toEqual(["recipient", "amount"]);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Recipient is required.")).toHaveLength(2);
    expect(screen.getAllByText("Amount is required.")).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/Recipient/), {
      target: { value: "Sam" },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ recipient: "Sam", amount: 25 });
  });

  it("rejects a schema property without field metadata", () => {
    const malformed: FormDefinition = {
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { amount: { type: "number" } },
        additionalProperties: false,
      },
      fields: {},
    };

    expect(() =>
      render(<CompiledForm form={malformed} onSubmit={() => undefined} />),
    ).toThrow(
      "Invalid compiled form: schema properties and field metadata must have the same keys.",
    );
  });

  it("rejects field metadata without a schema property", () => {
    const malformed: FormDefinition = {
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      fields: {
        recipient: { kind: "text", label: "Recipient" },
      },
    };

    expect(() =>
      render(<CompiledForm form={malformed} onSubmit={() => undefined} />),
    ).toThrow(
      "Invalid compiled form: schema properties and field metadata must have the same keys.",
    );
  });

  it("throws a deterministic developer error for mismatched select metadata", () => {
    const malformed: FormDefinition<"speed"> = {
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          speed: { type: "string", enum: ["standard", "instant"] },
        },
        additionalProperties: false,
      },
      fields: {
        speed: {
          kind: "select",
          label: "Speed",
          optionLabels: { standard: "Standard" },
        },
      },
    };

    expect(() =>
      render(<CompiledForm form={malformed} onSubmit={() => undefined} />),
    ).toThrow(
      'Invalid compiled form: field "speed" must have exactly one option label for every schema enum value.',
    );
  });
});

describe("CompiledForm state and submission", () => {
  it("edits every control and submits correctly typed values", () => {
    const onSubmit = vi.fn();
    render(
      <CompiledForm
        form={createForm()}
        onSubmit={onSubmit}
        submitLabel="Continue"
      />,
    );

    fireEvent.change(screen.getByLabelText(/Recipient/), {
      target: { value: "Sam" },
    });
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Dinner" },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText(/Transfer speed/), {
      target: { value: "instant" },
    });
    fireEvent.click(screen.getByLabelText("Save this recipient"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      recipient: "Sam",
      note: "Dinner",
      amount: 25,
      speed: "instant",
      saveRecipient: true,
    });
    expect(typeof onSubmit.mock.calls[0][0].amount).toBe("number");
    expect(typeof onSubmit.mock.calls[0][0].saveRecipient).toBe("boolean");
  });

  it("omits empty optional text values", () => {
    const onSubmit = vi.fn();
    render(
      <CompiledForm
        form={createForm()}
        initialValues={{
          recipient: "Sam",
          amount: 25,
          speed: "standard",
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({
      recipient: "Sam",
      amount: 25,
      speed: "standard",
      saveRecipient: false,
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("note");
  });

  it("uses isolated initial state without mutating values or the compiled form", () => {
    const form = createForm();
    const initial = { ...validInitialValues() };
    const formBefore = JSON.stringify(form);
    const initialBefore = JSON.stringify(initial);
    const onSubmit = vi.fn();

    render(
      <CompiledForm form={form} initialValues={initial} onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByLabelText(/Recipient/), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({ ...initial, recipient: "Alex" });
    expect(JSON.stringify(initial)).toBe(initialBefore);
    expect(JSON.stringify(form)).toBe(formBefore);
    expect(Object.isFrozen(form)).toBe(true);
    expect(onSubmit.mock.calls[0][0]).not.toBe(initial);
  });
});

describe("CompiledForm reference resolution", () => {
  it("shows loading, renders resolved options, and submits a valid selection", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const onSubmit = vi.fn();

    render(
      <CompiledForm
        form={createReferenceForm()}
        baseUrl="https://target.example/application/"
        request={fetchImpl}
        onSubmit={onSubmit}
      />,
    );

    const account = screen.getByLabelText(/From account/) as HTMLSelectElement;
    expect(account.disabled).toBe(true);
    expect(account.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Loading options.");
    expect(within(account).getByRole("option").textContent).toBe(
      "Loading options…",
    );

    resolveFetch?.(accountResponse());

    await waitFor(() => expect(account.disabled).toBe(false));
    expect(account.getAttribute("aria-busy")).toBeNull();
    expect(
      within(account).getAllByRole("option").map((option) => [
        (option as HTMLOptionElement).value,
        option.textContent,
      ]),
    ).toEqual([
      ["", "Select an option"],
      ["acct_1", "Checking"],
      ["acct_2", "Savings"],
    ]);

    fireEvent.change(account, { target: { value: "acct_2" } });
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Primary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({
      account: "acct_2",
      note: "Primary",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://target.example/accounts",
      { method: "GET" },
    );
  });

  it.each([
    ["HTTP failure", new Response(null, { status: 500 })],
    ["malformed backend response", Response.json([{ id: "acct_1" }])],
  ])("shows retrieval failure for %s", async (_case, response) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);

    render(
      <CompiledForm
        form={createReferenceForm()}
        baseUrl="https://target.example"
        request={fetchImpl}
        onSubmit={() => undefined}
      />,
    );

    const failure = await screen.findByRole("alert");
    expect(failure.textContent).toBe("Options could not be loaded.");
    const account = screen.getByLabelText(/From account/) as HTMLSelectElement;
    expect(account.disabled).toBe(true);
    expect(within(account).getByRole("option").textContent).toBe(
      "Options unavailable",
    );
  });

  it("rejects an arbitrary initial value outside the resolved options", async () => {
    const onSubmit = vi.fn();
    render(
      <CompiledForm
        form={createReferenceForm()}
        baseUrl="https://target.example"
        request={vi.fn<typeof fetch>().mockResolvedValue(accountResponse())}
        initialValues={{ account: "invented_account" }}
        onSubmit={onSubmit}
      />,
    );

    await waitFor(() =>
      expect(
        (screen.getByLabelText(/From account/) as HTMLSelectElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("From account must be one of the resolved options."),
    ).toHaveLength(2);
  });

  it("rejects a value while its allowed options remain unresolved", () => {
    const onSubmit = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(
      new Promise<Response>(() => undefined),
    );

    render(
      <CompiledForm
        form={createReferenceForm()}
        baseUrl="https://target.example"
        request={fetchImpl}
        initialValues={{ account: "acct_1" }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("From account options are still loading."),
    ).toHaveLength(2);
  });
});

describe("CompiledForm validation", () => {
  it("blocks invalid submission and exposes linked required errors", () => {
    const onSubmit = vi.fn();
    render(<CompiledForm form={createForm()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).not.toHaveBeenCalled();
    const summary = screen.getByRole("alert");
    expect(summary.getAttribute("aria-labelledby")).toBeTruthy();
    expect(within(summary).getByText("Recipient is required.")).toBeInstanceOf(
      HTMLAnchorElement,
    );
    expect(within(summary).getByText("Amount is required.")).toBeInstanceOf(
      HTMLAnchorElement,
    );
    expect(
      within(summary).getByText("Transfer speed is required."),
    ).toBeInstanceOf(HTMLAnchorElement);

    const recipient = screen.getByLabelText(/Recipient/);
    expect(recipient.getAttribute("aria-invalid")).toBe("true");
    const describedIds =
      recipient.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(
      describedIds.some(
        (id) => document.getElementById(id)?.textContent === "Recipient is required.",
      ),
    ).toBe(true);
    expect(
      within(summary).getByText("Recipient is required.").getAttribute("href"),
    ).toBe(`#${recipient.id}`);
  });

  it("clears a stale field error predictably after an edit", () => {
    render(<CompiledForm form={createForm()} onSubmit={() => undefined} />);
    const recipient = screen.getByLabelText(/Recipient/);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(recipient.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(recipient, { target: { value: "Sam" } });

    expect(recipient.getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByText("Recipient is required.")).toBeNull();
  });

  it("reports string minimum and maximum violations", () => {
    render(
      <CompiledForm
        form={createForm()}
        initialValues={{
          recipient: "A",
          note: "This is too long",
          amount: 25,
          speed: "standard",
        }}
        onSubmit={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getAllByText("Recipient must be at least 2 characters.")).toHaveLength(2);
    expect(screen.getAllByText("Note must be at most 10 characters.")).toHaveLength(2);
    expect(screen.getByLabelText(/Recipient/).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.getByLabelText("Note").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("updates numeric minimum and maximum violations after edits", () => {
    render(
      <CompiledForm
        form={createForm()}
        initialValues={{ recipient: "Sam", amount: 0, speed: "standard" }}
        onSubmit={() => undefined}
      />,
    );
    const amount = screen.getByLabelText(/Amount/);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getAllByText("Amount must be at least 1.")).toHaveLength(2);

    fireEvent.change(amount, { target: { value: "101" } });
    expect(screen.queryByText("Amount must be at least 1.")).toBeNull();
    expect(screen.getAllByText("Amount must be at most 100.")).toHaveLength(2);
  });

  it("rejects an initial select value outside the schema enum", () => {
    const invalidInitial = {
      recipient: "Sam",
      amount: 25,
      speed: "overnight",
    };
    const onSubmit = vi.fn();
    render(
      <CompiledForm
        form={createForm()}
        initialValues={invalidInitial}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(
        "Transfer speed must be one of the declared options.",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByLabelText(/Transfer speed/).getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("reports invalid primitive types and unknown initial properties", () => {
    const invalidInitial = {
      recipient: true,
      amount: 25,
      speed: "standard",
      unexpected: "value",
    };
    const onSubmit = vi.fn();
    render(
      <CompiledForm
        form={createForm()}
        initialValues={invalidInitial}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Recipient must be a string.")).toHaveLength(2);
    expect(
      screen.getByText("Unknown field “unexpected” is not allowed."),
    ).toBeInstanceOf(HTMLLIElement);
  });
});

describe("CompiledForm types", () => {
  it("preserves field names and the complete static value union", () => {
    type Names = "recipient" | "note" | "amount" | "speed" | "saveRecipient";

    expectTypeOf<FormValue<Names>>().toEqualTypeOf<
      Readonly<Partial<Record<Names, string | number | boolean>>>
    >();
    expectTypeOf<CompiledFormProps<Names>["form"]>().toEqualTypeOf<
      FormDefinition<Names>
    >();
    expectTypeOf<FieldMetadata["kind"]>().toEqualTypeOf<
      "text" | "longText" | "number" | "select" | "boolean" | "reference"
    >();
  });
});

if (false) {
  const form = compileForm({ name: f.text({ label: "Name" }) });

  <CompiledForm<"name">
    form={form}
    // @ts-expect-error Initial values may contain only declared field names.
    initialValues={{ unknown: "value" }}
    onSubmit={() => undefined}
  />;
}
