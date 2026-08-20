import { defineCapability, defineReadCapability, result } from "../capabilities";
import { f } from "../fields";

export const transferMoney = defineCapability({
  id: "transfer_money",
  description:
    "Transfer money from the authenticated user's account to a recipient account number.",
  fields: {
    recipient_account: f.text({
      label: "Recipient account number",
      required: true,
      minLength: 1,
    }),
    amount: f.number({
      label: "Amount",
      required: true,
      minimum: 0.01,
    }),
    description: f.longText({
      label: "Transfer description",
      helpText: "Optional description for the transfer.",
    }),
  },
  operation: {
    method: "POST",
    path: "/api/v1/banking/transfer/",
  },
  confirmation: "required",
});

export const payBill = defineCapability({
  id: "pay_bill",
  description:
    "Pay one of the authenticated user's bills when the user provides its bill ID.",
  fields: {
    bill_id: f.text({
      label: "Bill ID",
      helpText: "Enter the UUID returned by the banking bill list.",
      required: true,
    }),
  },
  operation: {
    method: "POST",
    path: "/api/v1/banking/bills/pay/",
  },
  confirmation: "required",
});

export const requestLoan = defineCapability({
  id: "request_loan",
  description:
    "Submit a car, personal, or home loan request for the authenticated user.",
  fields: {
    loan_type: f.select({
      label: "Loan type",
      required: true,
      options: [
        { value: "car", label: "Car" },
        { value: "personal", label: "Personal" },
        { value: "home", label: "Home" },
      ],
    }),
    amount: f.number({
      label: "Requested amount",
      required: true,
      minimum: 0.01,
    }),
    salary: f.number({
      label: "Salary",
      required: true,
      minimum: 0.01,
    }),
    description: f.longText({
      label: "Loan request description",
      helpText: "Optional information to include with the request.",
    }),
  },
  operation: {
    method: "POST",
    path: "/api/v1/banking/loans/request/",
  },
  confirmation: "required",
});

export const accountBalance = defineReadCapability({
  id: "account_balance",
  description: "Show the signed-in user's current account balance, account number, and status.",
  operation: {
    method: "GET",
    path: "/api/v1/banking/balance/",
  },
  result: result.card({
    root: "balance",
    card: {
      title: { kind: "fixed", text: "Account Balance" },
      facts: [
        {
          id: "balance",
          label: "Available Balance",
          value: {
            kind: "property",
            property: "balance",
            formatter: {
              kind: "currency",
              locale: "en-US",
              currency: "USD",
            },
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
        {
          id: "account_number",
          label: "Account Number",
          value: {
            kind: "property",
            property: "account_number",
            formatter: { kind: "text" },
          },
        },
      ],
    },
  }),
});
