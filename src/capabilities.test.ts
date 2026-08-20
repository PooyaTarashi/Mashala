import { describe, expect, expectTypeOf, it } from "vitest";

import mashalaBankDemo from "./test-application";
import { defineCapability } from "./capabilities";
import {
  accountBalance,
  productList,
  singleProduct,
} from "./examples/read-capabilities";
import { transferMoney } from "./examples/transfer-money";
import { f } from "./fields";
import { compileForm } from "./forms";
import type {
  BackendOperation,
  CapabilitySpec,
  ConfirmationPolicy,
  MashalaSpec,
} from "./spec";

function transferFields() {
  return {
    recipient: f.text({ label: "Recipient", required: true }),
    amount: f.number({
      label: "Amount",
      required: true,
      minimum: 0.01,
    }),
  };
}

describe("defineCapability", () => {
  it("assembles the canonical capability shape through compileForm", () => {
    const fields = transferFields();
    const capability = defineCapability({
      id: "transfer_money",
      description: "Transfer money to another recipient",
      fields,
      operation: { method: "POST", path: "/transfers" },
      confirmation: "required",
    });

    expect(capability).toEqual({
      kind: "write",
      id: "transfer_money",
      description: "Transfer money to another recipient",
      form: compileForm(fields),
      operation: { method: "POST", path: "/transfers" },
      confirmation: "required",
    });
    expect(capability.form.schema.properties).toEqual({
      recipient: { type: "string" },
      amount: { type: "number", minimum: 0.01 },
    });
    expect(capability.form.schema.required).toEqual(["recipient", "amount"]);
  });

  it("returns isolated frozen plain data containing only canonical keys", () => {
    const operation = {
      method: "PATCH" as const,
      path: "/transfers/selected",
    };
    const capability = defineCapability({
      id: "transfer_money",
      description: "Transfer money to another recipient",
      fields: transferFields(),
      operation,
      confirmation: "none",
    });
    const serialized = JSON.parse(JSON.stringify(capability)) as unknown;

    operation.path = "/changed";

    expect(capability.operation.path).toBe("/transfers/selected");
    expect(serialized).toEqual(capability);
    expect(Object.keys(capability)).toEqual([
      "kind",
      "id",
      "description",
      "form",
      "operation",
      "confirmation",
    ]);
    expect(Object.isFrozen(capability)).toBe(true);
    expect(Object.isFrozen(capability.operation)).toBe(true);
  });

  it("keeps canonical reference data serializable and credential-free", () => {
    const source = {
      method: "GET" as const,
      path: "/accounts",
      headers: { authorization: "Bearer target-secret" },
      accessToken: "target-secret",
    };
    const capability = defineCapability({
      id: "pay_bill",
      description: "Pay a bill from one of the user's accounts",
      fields: {
        account: f.reference({
          label: "Account",
          source,
          value: "id",
          labelFrom: "display_name",
        }),
      },
      operation: { method: "POST", path: "/bill-payments" },
      confirmation: "required",
    });
    const serialized = JSON.stringify(capability);

    expect(capability.form.fields.account).toEqual({
      kind: "reference",
      label: "Account",
      source: { method: "GET", path: "/accounts" },
      value: "id",
      labelFrom: "display_name",
    });
    expect(serialized).not.toContain("target-secret");
    expect(serialized).not.toContain("headers");
    expect(serialized).not.toContain("accessToken");
    expect(JSON.parse(serialized)).toEqual(capability);
  });

  it("rejects invalid stable IDs and malformed serialized policies or operations", () => {
    expect(() =>
      defineCapability({
        id: "Transfer-Money",
        description: "Transfer money",
        fields: transferFields(),
        operation: { method: "POST", path: "/transfers" },
        confirmation: "required",
      }),
    ).toThrow(/^Invalid capability ID:/);

    expect(() =>
      defineCapability({
        id: "transfer_money",
        description: "Transfer money",
        fields: transferFields(),
        operation: {
          method: "POST",
          path: "/transfers",
          headers: { authorization: "secret" },
        } as unknown as BackendOperation,
        confirmation: "required",
      }),
    ).toThrow(/^Invalid backend operation:/);

    expect(() =>
      defineCapability({
        id: "transfer_money",
        description: "Transfer money",
        fields: transferFields(),
        operation: { method: "POST", path: "/transfers" },
        confirmation: "automatic" as unknown as ConfirmationPolicy,
      }),
    ).toThrow(/^Invalid confirmation policy:/);

    expect(() =>
      defineCapability({
        id: "transfer_money",
        description: "Transfer money",
        fields: transferFields(),
        operation: {
          method: "DELETE",
          path: "/transfers",
        } as unknown as BackendOperation,
        confirmation: "automatic" as unknown as ConfirmationPolicy,
      }),
    ).toThrow(/^Invalid backend operation:/);
  });
});

describe("canonical executable example", () => {
  it("binds the transfer form, operation, and policy in one object", () => {
    expect(transferMoney.id).toBe("transfer_money");
    expect(transferMoney.kind).toBe("write");
    expect(transferMoney.form.fields.recipient).toEqual({
      kind: "text",
      label: "Recipient",
      helpText: "Enter the recipient name or identifier.",
    });
    expect(transferMoney.operation).toEqual({
      method: "POST",
      path: "/transfers",
    });
    expect(transferMoney.confirmation).toBe("required");
    expect(mashalaBankDemo.capabilities).toEqual([
      transferMoney,
      accountBalance,
      singleProduct,
      productList,
    ]);
  });

  it("conforms to the canonical capability and top-level spec types", () => {
    expectTypeOf(transferMoney).toMatchTypeOf<CapabilitySpec>();
    expectTypeOf(mashalaBankDemo).toMatchTypeOf<MashalaSpec>();
    expectTypeOf<BackendOperation["method"]>().toEqualTypeOf<
      "POST" | "PUT" | "PATCH"
    >();
    expectTypeOf<ConfirmationPolicy>().toEqualTypeOf<"required" | "none">();
  });
});

if (false) {
  defineCapability({
    id: "unsupported_confirmation",
    description: "Compile-time confirmation test",
    fields: transferFields(),
    operation: { method: "POST", path: "/transfers" },
    // @ts-expect-error Confirmation policies are exactly required or none.
    confirmation: "automatic",
  });

  defineCapability({
    id: "unsupported_method",
    description: "Compile-time method test",
    fields: transferFields(),
    // @ts-expect-error Canonical writes support only POST, PUT, and PATCH.
    operation: { method: "DELETE", path: "/transfers" },
    confirmation: "required",
  });

  defineCapability({
    id: "malformed_field",
    description: "Compile-time field test",
    fields: {
      // @ts-expect-error Date is not a v0.1 static field definition.
      date: { kind: "date", label: "Date" },
    },
    operation: { method: "POST", path: "/transfers" },
    confirmation: "required",
  });
}
