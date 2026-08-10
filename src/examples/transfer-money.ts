import { defineCapability } from "../capabilities";
import { f } from "../fields";
import type { MashalaSpec } from "../spec";

/** Executable counterpart of docs/CANONICAL_SPEC.md's v0.1 example. */
export const transferMoney = defineCapability({
  id: "transfer_money",
  description: "Transfer money to a recipient from the user's account.",
  fields: {
    recipient: f.text({
      label: "Recipient",
      helpText: "Enter the recipient name or identifier.",
      required: true,
      minLength: 1,
      maxLength: 100,
    }),
    amount: f.number({
      label: "Amount",
      required: true,
      minimum: 0.01,
    }),
    note: f.longText({
      label: "Note",
      helpText: "Optional note shown with the transfer.",
      maxLength: 140,
    }),
    speed: f.select({
      label: "Transfer speed",
      required: true,
      options: [
        { value: "standard", label: "Standard" },
        { value: "instant", label: "Instant" },
      ],
    }),
    saveRecipient: f.boolean({ label: "Save this recipient" }),
  },
  operation: {
    method: "POST",
    path: "/transfers",
  },
  confirmation: "required",
});

export const mashalaBankDemo: MashalaSpec = Object.freeze({
  specVersion: "0.1",
  app: Object.freeze({
    id: "mashala_bank_demo",
    name: "Mashala Bank Demo",
    description:
      "A demonstration application for common retail banking tasks.",
  }),
  capabilities: Object.freeze([transferMoney]),
});
