import { defineMashalaApplication } from "./src/application";
import {
  accountBalance,
  payBill,
  requestLoan,
  transferMoney,
} from "./src/examples/ai-wallet-capabilities";

const mashalaApplication = defineMashalaApplication({
  app: {
    id: "ai_wallet",
    name: "AI Wallet",
    description:
      "A conversational frontend for account transfers, bill payments, and loan requests.",
  },
  capabilities: [transferMoney, payBill, requestLoan, accountBalance],
});

export default mashalaApplication;
