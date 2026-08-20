// @vitest-environment jsdom

import { cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import mashalaApplication from "../mashala.config";
import Home from "./page";

afterEach(cleanup);

describe("Mashala home page", () => {
  it("renders the sign-in form for unauthenticated users", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("<h1>Sign in to AI Wallet</h1>");
    expect(html).toContain("<form");
    expect(html).toContain("Username");
    expect(html).toContain("Password");
  });

  it("configures the AI Wallet application with account balance and transaction capabilities", () => {
    expect(mashalaApplication.app.id).toBe("ai_wallet");
    expect(
      mashalaApplication.capabilities.map((capability) => capability.id),
    ).toEqual([
      "transfer_money",
      "pay_bill",
      "request_loan",
      "account_balance",
    ]);
  });
});
