import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const chatStyles = readFileSync(
  new URL("./mashala-chat.module.css", import.meta.url),
  "utf8",
);

describe("MashalaChat responsive presentation", () => {
  it("keeps the transcript bounded and defines a mobile composer layout", () => {
    expect(chatStyles).toContain("max-height: min(58vh, 46rem)");
    expect(chatStyles).toContain(".latestAction");
    expect(chatStyles).toContain("@media (max-width: 42rem)");
    expect(chatStyles).toContain(".composerRow");
    expect(chatStyles).toContain("grid-template-columns: 1fr");
  });
});
