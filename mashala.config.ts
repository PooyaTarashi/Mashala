import { defineMashalaApplication } from "./src/application";
import {
  accountBalance,
  productList,
  singleProduct,
} from "./src/examples/read-capabilities";
import { transferMoney } from "./src/examples/transfer-money";

/** Browser-visible developer application definition; contains declarative data only. */
const mashalaApplication = defineMashalaApplication({
  app: {
    id: "mashala_bank_demo",
    name: "Mashala Bank Demo",
    description:
      "A demonstration application for common retail banking tasks.",
  },
  capabilities: [transferMoney, accountBalance, singleProduct, productList],
});

export default mashalaApplication;
