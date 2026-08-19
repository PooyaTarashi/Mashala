import type {
  CardListResultView,
  CardResultView,
  ResultCard,
  ResultFact,
  ResultImage,
  ResultPropertyValue,
  ResultText,
  ResultView,
  TextResultFormatter,
} from "./spec";

const STABLE_ID = /^[a-z][a-z0-9_]*$/;

function invalidResult(message: string): never {
  throw new TypeError(`Invalid result view: ${message}`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): boolean {
  const keys = Object.keys(value);
  return (
    keys.every((key) => allowed.includes(key)) &&
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function assertString(value: unknown, description: string): asserts value is string {
  if (typeof value !== "string") {
    invalidResult(`${description} must be a string.`);
  }
}

function assertDirectProperty(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    invalidResult("response property names must be non-empty strings.");
  }
}

function assertLocale(locale: unknown): asserts locale is string {
  assertString(locale, "formatter locale");
  try {
    if (Intl.getCanonicalLocales(locale).length !== 1) {
      invalidResult("formatter locale must be a valid BCP 47 locale.");
    }
  } catch {
    invalidResult("formatter locale must be a valid BCP 47 locale.");
  }
}

function copyTextFormatter(value: unknown): TextResultFormatter {
  if (!isPlainRecord(value) || typeof value.kind !== "string") {
    invalidResult("formatter must be a declared formatter object.");
  }

  switch (value.kind) {
    case "text":
      if (!hasExactKeys(value, ["kind"])) {
        invalidResult("text formatter contains undeclared properties.");
      }
      return Object.freeze({ kind: "text" });

    case "number":
    case "date":
      if (!hasExactKeys(value, ["kind", "locale"])) {
        invalidResult(`${value.kind} formatter contains undeclared properties.`);
      }
      assertLocale(value.locale);
      return Object.freeze({ kind: value.kind, locale: value.locale });

    case "currency":
      if (!hasExactKeys(value, ["kind", "locale", "currency"])) {
        invalidResult("currency formatter contains undeclared properties.");
      }
      assertLocale(value.locale);
      assertString(value.currency, "formatter currency");
      try {
        new Intl.NumberFormat(value.locale, {
          style: "currency",
          currency: value.currency,
        });
      } catch {
        invalidResult("formatter currency must be a valid ISO 4217 code.");
      }
      return Object.freeze({
        kind: "currency",
        locale: value.locale,
        currency: value.currency,
      });

    case "dateTime":
      if (!hasExactKeys(value, ["kind", "locale", "timeZone"])) {
        invalidResult("dateTime formatter contains undeclared properties.");
      }
      assertLocale(value.locale);
      assertString(value.timeZone, "formatter timeZone");
      try {
        new Intl.DateTimeFormat(value.locale, { timeZone: value.timeZone });
      } catch {
        invalidResult("formatter timeZone must be a valid IANA time zone.");
      }
      return Object.freeze({
        kind: "dateTime",
        locale: value.locale,
        timeZone: value.timeZone,
      });

    default:
      return invalidResult("formatter kind is not supported.");
  }
}

function copyPropertyValue(value: unknown): ResultPropertyValue {
  if (
    !isPlainRecord(value) ||
    value.kind !== "property" ||
    !hasExactKeys(value, ["kind", "property", "formatter"])
  ) {
    invalidResult("property values must contain only kind, property, and formatter.");
  }
  assertDirectProperty(value.property);
  return Object.freeze({
    kind: "property",
    property: value.property,
    formatter: copyTextFormatter(value.formatter),
  });
}

function copyResultText(value: unknown): ResultText {
  if (!isPlainRecord(value) || typeof value.kind !== "string") {
    invalidResult("card text must be fixed text or a declared property value.");
  }
  if (value.kind === "fixed") {
    if (!hasExactKeys(value, ["kind", "text"])) {
      invalidResult("fixed text contains undeclared properties.");
    }
    assertString(value.text, "fixed text");
    return Object.freeze({ kind: "fixed", text: value.text });
  }
  return copyPropertyValue(value);
}

function copyImage(value: unknown): ResultImage {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["source", "alt"]) ||
    !isPlainRecord(value.source) ||
    !hasExactKeys(value.source, ["kind", "property", "formatter"]) ||
    value.source.kind !== "property" ||
    !isPlainRecord(value.source.formatter) ||
    !hasExactKeys(value.source.formatter, ["kind"]) ||
    value.source.formatter.kind !== "imageUrl"
  ) {
    invalidResult("images require one direct property with the imageUrl formatter.");
  }
  assertDirectProperty(value.source.property);
  assertString(value.alt, "image alternative text");
  return Object.freeze({
    source: Object.freeze({
      kind: "property",
      property: value.source.property,
      formatter: Object.freeze({ kind: "imageUrl" }),
    }),
    alt: value.alt,
  });
}

function copyFact(value: unknown): ResultFact {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["id", "label", "value"])) {
    invalidResult("facts must contain only id, label, and value.");
  }
  if (typeof value.id !== "string" || !STABLE_ID.test(value.id)) {
    invalidResult("fact IDs must be stable lowercase machine IDs.");
  }
  assertString(value.label, "fact label");
  return Object.freeze({
    id: value.id,
    label: value.label,
    value: copyPropertyValue(value.value),
  });
}

function copyCard(value: unknown): ResultCard {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(
      value,
      ["title", "image", "description", "facts"],
      ["title"],
    )
  ) {
    invalidResult("cards contain title and optional image, description, and facts.");
  }
  let facts: readonly ResultFact[] | undefined;
  if (value.facts !== undefined) {
    if (!Array.isArray(value.facts)) {
      invalidResult("card facts must be an array.");
    }
    facts = Object.freeze(value.facts.map(copyFact));
    const ids = facts.map((fact) => fact.id);
    if (new Set(ids).size !== ids.length) {
      invalidResult("fact IDs must be unique within a card.");
    }
  }
  return Object.freeze({
    title: copyResultText(value.title),
    ...(value.image === undefined ? {} : { image: copyImage(value.image) }),
    ...(value.description === undefined
      ? {}
      : { description: copyResultText(value.description) }),
    ...(facts === undefined ? {} : { facts }),
  });
}

/** Validates and isolates a canonical result-view declaration. */
export function copyResultView(value: unknown): ResultView {
  if (!isPlainRecord(value) || typeof value.kind !== "string") {
    invalidResult("expected a card or cardList declaration.");
  }
  if (value.kind === "card") {
    if (!hasExactKeys(value, ["kind", "card"])) {
      invalidResult("card views contain only kind and card.");
    }
    return Object.freeze({ kind: "card", card: copyCard(value.card) });
  }
  if (value.kind === "cardList") {
    if (!hasExactKeys(value, ["kind", "card", "emptyText"])) {
      invalidResult("cardList views contain only kind, card, and emptyText.");
    }
    assertString(value.emptyText, "card-list empty text");
    return Object.freeze({
      kind: "cardList",
      card: copyCard(value.card),
      emptyText: value.emptyText,
    });
  }
  return invalidResult("result kind must be card or cardList.");
}

export const result = Object.freeze({
  card(card: ResultCard): CardResultView {
    return copyResultView({ kind: "card", card }) as CardResultView;
  },

  cardList(config: {
    readonly card: ResultCard;
    readonly emptyText: string;
  }): CardListResultView {
    return copyResultView({
      kind: "cardList",
      card: config.card,
      emptyText: config.emptyText,
    }) as CardListResultView;
  },
});
