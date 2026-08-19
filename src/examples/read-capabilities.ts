import { defineReadCapability, result } from "../capabilities";
import { f } from "../fields";
import type { ResultCard } from "../spec";

const productCard = {
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
        formatter: {
          kind: "currency",
          locale: "en-US",
          currency: "USD",
        },
      },
    },
  ],
} as const satisfies ResultCard;

/** Zero-input authenticated read rendered as one deterministic card. */
export const accountBalance = defineReadCapability({
  id: "account_balance",
  description: "Show the signed-in user's current account balance.",
  operation: { method: "GET", path: "/account/balance" },
  result: result.card({
    title: { kind: "fixed", text: "Account balance" },
    facts: [
      {
        id: "balance",
        label: "Available balance",
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
        label: "Account number",
        value: {
          kind: "property",
          property: "account_number",
          formatter: { kind: "text" },
        },
      },
    ],
  }),
});

/** Form-backed read whose validated identifier is bound to one path slot. */
export const singleProduct = defineReadCapability({
  id: "show_product",
  description: "Show one product by its product ID.",
  input: {
    productId: f.text({
      label: "Product ID",
      helpText: "Enter the product identifier from the catalog.",
      required: true,
      minLength: 1,
      maxLength: 80,
    }),
  },
  operation: {
    method: "GET",
    path: "/products/{id}",
    bindings: { path: { id: "productId" } },
  },
  result: result.card(productCard),
});

/** Zero-input collection read rendered through one repeated card template. */
export const productList = defineReadCapability({
  id: "list_products",
  description: "Show the products currently available in the catalog.",
  operation: { method: "GET", path: "/products" },
  result: result.cardList({
    emptyText: "No products are currently available.",
    card: productCard,
  }),
});

