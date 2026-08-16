import { defineMashalaApplication } from "./src/application";
import { transferMoney } from "./src/examples/transfer-money";

/** Browser-visible developer application definition; contains declarative data only. */
const mashalaApplication = defineMashalaApplication({
  app: {
    id: "mashala_bank_demo",
    name: "Mashala Bank Demo",
    description:
      "A demonstration application for common retail banking tasks.",
  },
  capabilities: [transferMoney],
});

export default mashalaApplication;
