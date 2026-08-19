// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { result } from "./capabilities";
import { ResultCardRenderer } from "./result-card-renderer";

afterEach(cleanup);

const productCard = {
  image: {
    source: {
      kind: "property" as const,
      property: "image_url",
      formatter: { kind: "imageUrl" as const },
    },
    alt: "Product photograph",
  },
  title: {
    kind: "property" as const,
    property: "title",
    formatter: { kind: "text" as const },
  },
  description: {
    kind: "property" as const,
    property: "description",
    formatter: { kind: "text" as const },
  },
  facts: [
    {
      id: "price",
      label: "Price",
      value: {
        kind: "property" as const,
        property: "price",
        formatter: {
          kind: "currency" as const,
          locale: "en-US",
          currency: "USD",
        },
      },
    },
  ],
};

describe("ResultCardRenderer", () => {
  it("renders one declared product card as text with accessible image fallback", () => {
    render(
      <ResultCardRenderer
        view={result.card(productCard)}
        data={{
          title: "<script>unsafe()</script>",
          description: "A declared description.",
          price: 12.5,
          image_url: "/images/product.png",
          private_note: "must not render",
        }}
        baseUrl="https://target.example/app/"
      />,
    );

    const card = screen.getByRole("article", {
      name: "<script>unsafe()</script>",
    });
    expect(within(card).getByRole("heading", { level: 3 }).textContent).toBe(
      "<script>unsafe()</script>",
    );
    expect(card.innerHTML).not.toContain("<script>unsafe()</script>");
    expect(screen.queryByText("must not render")).toBeNull();
    const image = screen.getByRole("img", { name: "Product photograph" });
    expect(image.getAttribute("src")).toBe(
      "https://target.example/images/product.png",
    );

    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "Product photograph" }).textContent).toBe(
      "Image unavailable",
    );
  });

  it("uses semantic list/card structure and renders every large root-array item in order", () => {
    const products = Array.from({ length: 40 }, (_, index) => ({
      title: `Product ${String(index + 1)}`,
    }));
    render(
      <ResultCardRenderer
        view={result.cardList({
          emptyText: "No products matched.",
          card: {
            title: {
              kind: "property",
              property: "title",
              formatter: { kind: "text" },
            },
          },
        })}
        data={products}
        baseUrl="https://target.example"
      />,
    );

    const list = screen.getByRole("list", { name: "Read results" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(40);
    const headings = within(list).getAllByRole("heading", { level: 3 });
    expect(headings[0]?.textContent).toBe("Product 1");
    expect(headings[39]?.textContent).toBe("Product 40");
  });

  it("shows only the developer-authored empty text for an empty list", () => {
    render(
      <ResultCardRenderer
        view={result.cardList({
          emptyText: "No products matched.",
          card: {
            title: { kind: "fixed", text: "Product" },
          },
        })}
        data={[]}
        baseUrl="https://target.example"
      />,
    );

    expect(screen.getByText("No products matched.")).toBeInstanceOf(HTMLElement);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("fails the complete presentation instead of partially rendering malformed data", () => {
    render(
      <ResultCardRenderer
        view={result.cardList({
          emptyText: "None.",
          card: productCard,
        })}
        data={[
          {
            title: "Valid item",
            description: "Valid",
            price: 10,
            image_url: "https://images.example/valid.png",
          },
          {
            title: "Partial item",
            description: "Missing price",
            image_url: "https://images.example/partial.png",
          },
        ]}
        baseUrl="https://target.example"
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "does not match the declared view",
    );
    expect(screen.queryByText("Valid item")).toBeNull();
  });
});
