import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Mashala home page", () => {
  it("renders the scaffold identity and readiness message", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("<h1>Mashala</h1>");
    expect(html).toContain("The application scaffold is ready.");
  });
});

