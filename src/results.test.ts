import { describe, expect, expectTypeOf, it } from "vitest";

import { copyResultView, result } from "./results";
import type {
  CardListResultView,
  CardResultView,
  ResultCard,
  ResultPropertyValue,
  ResultView,
  TextResultFormatter,
} from "./spec";

const fixedTitle = { kind: "fixed", text: "Account balance" } as const;

function productCard(): ResultCard {
  return {
    title: {
      kind: "property",
      property: "title",
      formatter: { kind: "text" },
    },
    image: {
      source: {
        kind: "property",
        property: "image_url",
        formatter: { kind: "imageUrl" },
      },
      alt: "Product image",
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
  };
}

describe("result-card DSL and compiler", () => {
  it("compiles an account-balance card with fixed text and labeled facts", () => {
    const view = result.card({
      title: fixedTitle,
      facts: [
        {
          id: "balance",
          label: "Balance",
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
    });

    expect(view).toEqual({
      kind: "card",
      card: {
        title: { kind: "fixed", text: "Account balance" },
        facts: [
          {
            id: "balance",
            label: "Balance",
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
      },
    });
    expectTypeOf(view).toEqualTypeOf<CardResultView>();
  });

  it("compiles a product card with image, backend title/description, and explicit price currency", () => {
    const view = result.card(productCard());

    expect(view.card).toEqual(productCard());
    expect(view.card.image?.source.formatter).toEqual({ kind: "imageUrl" });
    expect(view.card.facts?.[0]?.value.formatter).toEqual({
      kind: "currency",
      locale: "en-US",
      currency: "USD",
    });
  });

  it("compiles a wrapped account-balance card with single-segment and multi-segment root paths", () => {
    const singleSegment = result.card({
      root: "balance",
      card: {
        title: fixedTitle,
        facts: [
          {
            id: "balance",
            label: "Balance",
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
        ],
      },
    });

    expect(singleSegment).toEqual({
      kind: "card",
      root: "balance",
      card: {
        title: fixedTitle,
        facts: [
          {
            id: "balance",
            label: "Balance",
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
        ],
      },
    });
    expect(singleSegment.root).toBe("balance");
    expectTypeOf(singleSegment).toEqualTypeOf<CardResultView>();

    const multiSegment = result.card({
      root: "data.account.balance",
      card: {
        title: fixedTitle,
      },
    });
    expect(multiSegment.root).toBe("data.account.balance");
    expect(Object.isFrozen(multiSegment)).toBe(true);
  });

  it("compiles a wrapped cardList with root path", () => {
    const wrappedList = result.cardList({
      root: "results",
      emptyText: "No products matched.",
      card: productCard(),
    });

    expect(wrappedList).toEqual({
      kind: "cardList",
      root: "results",
      emptyText: "No products matched.",
      card: productCard(),
    });
    expect(wrappedList.root).toBe("results");
    expect(Object.isFrozen(wrappedList)).toBe(true);
    expectTypeOf(wrappedList).toEqualTypeOf<CardListResultView>();

    const multiSegmentList = result.cardList({
      root: "data.items",
      emptyText: "No items.",
      card: productCard(),
    });
    expect(multiSegmentList.root).toBe("data.items");
  });

  it.each([
    ["an empty string", ""],
    ["consecutive dots", "data..balance"],
    ["a leading dot", ".balance"],
    ["a trailing dot", "balance."],
    ["array indexing", "items[0]"],
    ["hyphens", "data-balance"],
    ["slashes", "data/balance"],
    ["spaces", "data balance"],
    ["wildcards", "*.id"],
    ["a non-string type", 123 as unknown as string],
  ])("rejects invalid root path with %s", (_case, invalidRoot) => {
    expect(() =>
      result.card({
        root: invalidRoot,
        card: { title: fixedTitle },
      }),
    ).toThrow(/root must be a dot-separated property path/);

    expect(() =>
      result.cardList({
        root: invalidRoot,
        emptyText: "Empty",
        card: { title: fixedTitle },
      }),
    ).toThrow(/root must be a dot-separated property path/);
  });

  it("compiles one repeated product-card template and fixed empty text", () => {
    const view = result.cardList({
      emptyText: "No products matched.",
      card: productCard(),
    });

    expect(view).toEqual({
      kind: "cardList",
      emptyText: "No products matched.",
      card: productCard(),
    });
    expectTypeOf(view).toEqualTypeOf<CardListResultView>();
  });

  it("keeps developer-authored title and description text distinct from property mappings", () => {
    const view = result.card({
      title: { kind: "fixed", text: "Service status" },
      description: {
        kind: "fixed",
        text: "This text is supplied by the application developer.",
      },
    });

    expect(view.card.title).toEqual({ kind: "fixed", text: "Service status" });
    expect(view.card.description).toEqual({
      kind: "fixed",
      text: "This text is supplied by the application developer.",
    });
  });

  it("accepts only the closed deterministic text-formatter allowlist", () => {
    const formatters = [
      { kind: "text" },
      { kind: "number", locale: "en-US" },
      {
        kind: "currency",
        locale: "fa-IR",
        currency: "IRR",
      },
      { kind: "date", locale: "en-GB" },
      {
        kind: "dateTime",
        locale: "en-US",
        timeZone: "Asia/Tehran",
      },
    ] satisfies readonly TextResultFormatter[];
    const view = result.card({
      title: fixedTitle,
      facts: formatters.map((formatter, index) => ({
        id: `value_${index}`,
        label: `Value ${index}`,
        value: {
          kind: "property" as const,
          property: `value_${index}`,
          formatter,
        },
      })),
    });

    expect(view.card.facts?.map((fact) => fact.value.formatter.kind)).toEqual([
      "text",
      "number",
      "currency",
      "date",
      "dateTime",
    ]);
  });

  it("requires explicit, well-formed currency configuration", () => {
    expect(() =>
      copyResultView({
        kind: "card",
        card: {
          title: fixedTitle,
          facts: [
            {
              id: "price",
              label: "Price",
              value: {
                kind: "property",
                property: "price",
                formatter: { kind: "currency", locale: "en-US" },
              },
            },
          ],
        },
      }),
    ).toThrow(/^Invalid result view: currency formatter/);

    expect(() =>
      copyResultView({
        kind: "card",
        card: {
          title: {
            kind: "property",
            property: "price",
            formatter: {
              kind: "currency",
              locale: "en-US",
              currency: "usd",
            },
          },
        },
      }),
    ).toThrow(/uppercase three-letter ISO 4217 code/);
  });

  it("rejects unsupported formatters and executable formatter values", () => {
    for (const formatter of [
      { kind: "percent", locale: "en-US" },
      () => "formatted",
    ]) {
      expect(() =>
        copyResultView({
          kind: "card",
          card: {
            title: {
              kind: "property",
              property: "value",
              formatter,
            },
          },
        }),
      ).toThrow(/^Invalid result view:/);
    }
  });

  it("rejects duplicate fact IDs", () => {
    expect(() =>
      result.card({
        title: fixedTitle,
        facts: [
          {
            id: "status",
            label: "Current status",
            value: {
              kind: "property",
              property: "status",
              formatter: { kind: "text" },
            },
          },
          {
            id: "status",
            label: "Previous status",
            value: {
              kind: "property",
              property: "previous_status",
              formatter: { kind: "text" },
            },
          },
        ],
      }),
    ).toThrow(/fact IDs must be unique within a card/);
  });

  it.each([
    ["a missing title", { kind: "card", card: {} }],
    [
      "a missing source property",
      {
        kind: "card",
        card: {
          title: {
            kind: "property",
            formatter: { kind: "text" },
          },
        },
      },
    ],
    [
      "a fact whose value is fixed text",
      {
        kind: "card",
        card: {
          title: fixedTitle,
          facts: [
            {
              id: "status",
              label: "Status",
              value: { kind: "fixed", text: "available" },
            },
          ],
        },
      },
    ],
  ])("rejects malformed mappings with %s", (_case, declaration) => {
    expect(() => copyResultView(declaration)).toThrow(/^Invalid result view:/);
  });

  it("rejects incompatible single-card and card-list root declarations", () => {
    expect(() =>
      copyResultView({
        kind: "card",
        card: { title: fixedTitle },
        emptyText: "Not valid for one card.",
      }),
    ).toThrow(/card views contain only kind, card/);
    expect(() =>
      copyResultView({
        kind: "cardList",
        card: { title: fixedTitle },
      }),
    ).toThrow(/cardList views contain only kind, card/);
  });

  it.each([
    [
      "a non-property source",
      {
        source: { kind: "fixed", text: "javascript:alert(1)" },
        alt: "Product",
      },
    ],
    [
      "a non-image formatter",
      {
        source: {
          kind: "property",
          property: "image_url",
          formatter: { kind: "text" },
        },
        alt: "Product",
      },
    ],
    [
      "developer-controlled image attributes",
      {
        source: {
          kind: "property",
          property: "image_url",
          formatter: { kind: "imageUrl" },
        },
        alt: "Product",
        onError: "javascript:alert(1)",
      },
    ],
  ])("rejects unsafe image configuration with %s", (_case, image) => {
    expect(() =>
      copyResultView({
        kind: "card",
        card: { title: fixedTitle, image },
      }),
    ).toThrow(/images require one direct property with the imageUrl formatter/);
  });

  it("emits deterministic, isolated, deeply frozen plain data", () => {
    const authoring = {
      title: {
        kind: "property" as const,
        property: "title",
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
    const first = result.card(authoring);
    const second = result.card(authoring);

    authoring.title.property = "changed_title";
    authoring.facts[0]!.label = "Changed label";
    authoring.facts[0]!.value.formatter.currency = "EUR";

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.card.title).toEqual({
      kind: "property",
      property: "title",
      formatter: { kind: "text" },
    });
    expect(first.card.facts?.[0]?.label).toBe("Price");
    expect(first.card.facts?.[0]?.value.formatter).toEqual({
      kind: "currency",
      locale: "en-US",
      currency: "USD",
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.card)).toBe(true);
    expect(Object.isFrozen(first.card.title)).toBe(true);
    expect(Object.isFrozen(first.card.facts)).toBe(true);
    expect(Object.isFrozen(first.card.facts?.[0])).toBe(true);
    expect(Object.isFrozen(first.card.facts?.[0]?.value)).toBe(true);
    expect(Object.isFrozen(first.card.facts?.[0]?.value.formatter)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(
      /function|onError|operation|confirmation|workflow|provider/,
    );
  });

  it("rejects presentation declarations that contain control or UI implementation data", () => {
    expect(() =>
      copyResultView({
        kind: "card",
        card: {
          title: fixedTitle,
          html: "<strong>Result</strong>",
          className: "injected-style",
          operation: { method: "POST", path: "/admin" },
        },
      }),
    ).toThrow(/cards contain title and optional image, description, and facts/);
  });

  it("exposes the accepted closed result-view union", () => {
    expectTypeOf<ResultView["kind"]>().toEqualTypeOf<"card" | "cardList">();
    expectTypeOf<ResultPropertyValue["formatter"]>().toEqualTypeOf<
      TextResultFormatter
    >();
  });
});

if (false) {
  // @ts-expect-error A card requires a title mapping.
  result.card({ facts: [] });

  result.card({
    title: {
      kind: "property",
      property: "title",
      // @ts-expect-error Formatter kinds are a closed allowlist.
      formatter: { kind: "markdown" },
    },
  });

  result.card({
    title: {
      kind: "property",
      property: "price",
      // @ts-expect-error Currency requires explicit locale and currency.
      formatter: { kind: "currency", locale: "en-US" },
    },
  });

  result.card({
    title: fixedTitle,
    image: {
      source: {
        kind: "property",
        property: "image_url",
        // @ts-expect-error Images require the imageUrl formatter.
        formatter: { kind: "text" },
      },
      alt: "Product",
    },
  });

  result.card({
    title: fixedTitle,
    facts: [
      {
        id: "status",
        label: "Status",
        // @ts-expect-error Fact values must map a backend property.
        value: { kind: "fixed", text: "available" },
      },
    ],
  });

  // @ts-expect-error A card list requires fixed developer-authored empty text.
  result.cardList({ card: { title: fixedTitle } });

  const executableFormatter = () => "formatted";
  result.card({
    title: {
      kind: "property",
      property: "value",
      // @ts-expect-error Arbitrary formatter functions are forbidden.
      formatter: executableFormatter,
    },
  });
}
