import { describe, expect, expectTypeOf, it } from "vitest";

import mashalaApplication from "../mashala.config";
import {
  defineMashalaApplication,
  MashalaApplicationConfigurationError,
  validateMashalaSpec,
} from "./application";
import { transferMoney } from "./examples/transfer-money";
import type { MashalaSpec } from "./spec";

describe("defineMashalaApplication", () => {
  it("provides the canonical application metadata and declared capabilities", () => {
    expect(mashalaApplication).toEqual({
      specVersion: "0.3",
      app: {
        id: "mashala_bank_demo",
        name: "Mashala Bank Demo",
        description:
          "A demonstration application for common retail banking tasks.",
      },
      capabilities: [transferMoney],
    });
    expectTypeOf(mashalaApplication).toMatchTypeOf<MashalaSpec>();
    expect(JSON.parse(JSON.stringify(mashalaApplication))).toEqual(
      mashalaApplication,
    );
  });

  it("isolates and freezes the browser-visible application data", () => {
    const metadata = {
      id: "example_app",
      name: "Example",
      description: "Example application",
    };
    const capabilities = [transferMoney];
    const application = defineMashalaApplication({ app: metadata, capabilities });

    metadata.name = "Changed";
    capabilities.length = 0;

    expect(application.app.name).toBe("Example");
    expect(application.capabilities).toHaveLength(1);
    expect(Object.isFrozen(application)).toBe(true);
    expect(Object.isFrozen(application.app)).toBe(true);
    expect(Object.isFrozen(application.capabilities)).toBe(true);
    expect(Object.isFrozen(application.capabilities[0]?.form)).toBe(true);
  });

  it("rejects malformed declared capability data with a sanitized error", () => {
    const malformedCapability = {
      ...JSON.parse(JSON.stringify(transferMoney)),
      form: {
        ...transferMoney.form,
        fields: {},
      },
      providerSecret: "do-not-leak-this-secret",
    };

    expect(() =>
      defineMashalaApplication({
        app: mashalaApplication.app,
        capabilities: [malformedCapability],
      } as never),
    ).toThrowError(
      new MashalaApplicationConfigurationError(
        "malformed_spec",
        "Mashala application configuration contains a malformed MashalaSpec.",
      ),
    );

    try {
      defineMashalaApplication({
        app: mashalaApplication.app,
        capabilities: [malformedCapability],
      } as never);
    } catch (error) {
      expect(String(error)).not.toContain("do-not-leak-this-secret");
    }
  });

  it("rejects incompatible compiled spec versions", () => {
    const incompatible = {
      ...JSON.parse(JSON.stringify(mashalaApplication)),
      specVersion: "0.1",
    };

    expect(() => validateMashalaSpec(incompatible)).toThrowError(
      expect.objectContaining({
        code: "unsupported_spec_version",
        message:
          "Mashala application configuration requires MashalaSpec version 0.3.",
      }),
    );
  });

  it("does not accept credential, proxy, or executable transformation configuration", () => {
    const prohibitedConfiguration = {
      app: mashalaApplication.app,
      capabilities: mashalaApplication.capabilities,
      bearerToken: "target-secret",
      cookies: "target-session",
      targetBackendProxy: "https://proxy.example.test",
      requestTransform: () => ({ authorization: "target-secret" }),
    };

    expect(() =>
      defineMashalaApplication(prohibitedConfiguration as never),
    ).toThrowError(
      expect.objectContaining({ code: "malformed_spec" }),
    );
  });
});
