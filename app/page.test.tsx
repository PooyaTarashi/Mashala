import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Mashala home page", () => {
  it("renders the assembled application and chat input", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("<h1>Mashala Bank Demo</h1>");
    expect(html).toContain("<label for=\"mashala-message\">Message</label>");
    expect(html).toContain("Describe what you want to do.");
  });
});
