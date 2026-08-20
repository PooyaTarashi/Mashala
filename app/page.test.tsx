import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Mashala home page", () => {
  it("renders the sign-in form for unauthenticated users", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("<h1>Sign in to AI Wallet</h1>");
    expect(html).toContain("<form");
    expect(html).toContain("Username");
    expect(html).toContain("Password");
  });
});
