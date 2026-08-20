import { defineMashalaApplication } from "./application";
import {
  accountBalance,
  productList,
  singleProduct,
} from "./examples/read-capabilities";
import { transferMoney } from "./examples/transfer-money";

/** Stable application fixture for framework tests; independent of developer config. */
const testApplication = defineMashalaApplication({
  app: {
    id: "mashala_bank_demo_test",
    name: "Mashala Bank Demo Test",
    description: "A framework test application.",
  },
  capabilities: [transferMoney, accountBalance, singleProduct, productList],
});

export default testApplication;
