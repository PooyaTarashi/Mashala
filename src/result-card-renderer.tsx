"use client";

import { useId, useState } from "react";

import type { JsonObject } from "./forms";
import type { ReadResultData } from "./read-capability-executor";
import type {
  ResultCard,
  ResultPropertyValue,
  ResultText,
  ResultView,
} from "./spec";
import { resolveTargetBackendUrl } from "./target-backend-url";
import styles from "./result-card-renderer.module.css";

export interface ResultCardRendererProps {
  readonly view: ResultView;
  readonly data: ReadResultData;
  readonly baseUrl: string | URL;
}

interface RenderedFact {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

interface RenderedCard {
  readonly title: string;
  readonly description?: string;
  readonly image?: { readonly src: string; readonly alt: string };
  readonly facts: readonly RenderedFact[];
}

function directProperty(item: JsonObject, property: string): unknown {
  return Object.prototype.hasOwnProperty.call(item, property) &&
    Object.prototype.propertyIsEnumerable.call(item, property)
    ? item[property]
    : undefined;
}

const DECIMAL_STRING = /^-?\d+(?:\.\d+)?$/;

function coerceNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && DECIMAL_STRING.test(value)) {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
}

function formatProperty(
  descriptor: ResultPropertyValue,
  item: JsonObject,
): string | undefined {
  const value = directProperty(item, descriptor.property);
  try {
    switch (descriptor.formatter.kind) {
      case "text":
        return typeof value === "string" ? value : undefined;
      case "number": {
        const numeric = coerceNumericValue(value);
        return numeric !== undefined
          ? new Intl.NumberFormat(descriptor.formatter.locale).format(numeric)
          : undefined;
      }
      case "currency": {
        const numeric = coerceNumericValue(value);
        return numeric !== undefined
          ? new Intl.NumberFormat(descriptor.formatter.locale, {
              style: "currency",
              currency: descriptor.formatter.currency,
            }).format(numeric)
          : undefined;
      }
      case "date":
        return typeof value === "string"
          ? new Intl.DateTimeFormat(descriptor.formatter.locale, {
              dateStyle: "medium",
              timeZone: "UTC",
            }).format(new Date(`${value}T00:00:00.000Z`))
          : undefined;
      case "dateTime":
        return typeof value === "string"
          ? new Intl.DateTimeFormat(descriptor.formatter.locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: descriptor.formatter.timeZone,
            }).format(new Date(value))
          : undefined;
    }
  } catch {
    return undefined;
  }
}

function formatText(text: ResultText, item: JsonObject): string | undefined {
  return text.kind === "fixed" ? text.text : formatProperty(text, item);
}

function safeImageSource(
  value: unknown,
  baseUrl: string | URL,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    try {
      return resolveTargetBackendUrl(
        baseUrl,
        value,
        "Invalid result image URL.",
      ).href;
    } catch {
      return undefined;
    }
  }
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function prepareCard(
  card: ResultCard,
  item: JsonObject,
  baseUrl: string | URL,
): RenderedCard | undefined {
  const title = formatText(card.title, item);
  const description =
    card.description === undefined
      ? undefined
      : formatText(card.description, item);
  const facts = (card.facts ?? []).map((fact) => ({
    id: fact.id,
    label: fact.label,
    value: formatProperty(fact.value, item),
  }));
  const imageSource =
    card.image === undefined
      ? undefined
      : safeImageSource(
          directProperty(item, card.image.source.property),
          baseUrl,
        );

  if (
    title === undefined ||
    (card.description !== undefined && description === undefined) ||
    facts.some((fact) => fact.value === undefined) ||
    (card.image !== undefined && imageSource === undefined)
  ) {
    return undefined;
  }

  return {
    title,
    ...(description === undefined ? {} : { description }),
    ...(card.image === undefined || imageSource === undefined
      ? {}
      : { image: { src: imageSource, alt: card.image.alt } }),
    facts: facts as readonly RenderedFact[],
  };
}

function ResultImage({ src, alt }: { readonly src: string; readonly alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={styles.imageFallback}
        {...(alt === ""
          ? { "aria-hidden": true }
          : { role: "img", "aria-label": alt })}
      >
        <span aria-hidden="true">Image unavailable</span>
      </div>
    );
  }

  return (
    // Dynamic target-backend hosts cannot be enumerated in Next image config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.image}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function Card({ card, index }: { readonly card: RenderedCard; readonly index: number }) {
  const reactId = useId();
  const titleId = `result-card-${reactId}-${String(index)}`;
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      {card.image === undefined ? null : (
        <ResultImage src={card.image.src} alt={card.image.alt} />
      )}
      <div className={styles.content}>
        <h3 id={titleId}>{card.title}</h3>
        {card.description === undefined ? null : <p>{card.description}</p>}
        {card.facts.length === 0 ? null : (
          <dl className={styles.facts}>
            {card.facts.map((fact) => (
              <div key={fact.id} className={styles.fact}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

/** Renders only the developer-declared card fields from an already-validated read. */
export function ResultCardRenderer({ view, data, baseUrl }: ResultCardRendererProps) {
  const items = view.kind === "card"
    ? Array.isArray(data)
      ? undefined
      : [data]
    : Array.isArray(data)
      ? data
      : undefined;
  const cards = items?.map((item) => prepareCard(view.card, item, baseUrl));

  if (cards === undefined || cards.some((card) => card === undefined)) {
    return (
      <p className={styles.invalid} role="alert">
        The result could not be displayed because it does not match the declared view.
      </p>
    );
  }

  if (view.kind === "cardList" && cards.length === 0) {
    return <p className={styles.empty}>{view.emptyText}</p>;
  }

  if (view.kind === "card") {
    return <Card card={cards[0]!} index={0} />;
  }

  return (
    <ul className={styles.list} aria-label="Read results">
      {cards.map((card, index) => (
        <li key={index}>
          <Card card={card!} index={index} />
        </li>
      ))}
    </ul>
  );
}
