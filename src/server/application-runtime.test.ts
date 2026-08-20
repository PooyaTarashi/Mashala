import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import mashalaApplication from "../test-application";
import { MashalaApplicationConfigurationError } from "../application";
import type { LlmProvider } from "./llm/provider";
import {
  assembleMashalaApplication,
  MashalaRuntimeAssemblyError,
  type MashalaApplicationAssemblyInput,
} from "./application-runtime";
import type { DocumentationRetriever } from "./retrieval/retriever";

const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
const retrieve = vi.fn<DocumentationRetriever["retrieve"]>();

function dependencies() {
  const llmProvider: LlmProvider & { readonly providerSecret: string } = {
    providerSecret: "server-llm-secret",
    generateStructured,
  };
  const documentationRetriever: DocumentationRetriever & {
    readonly internalServiceUrl: string;
  } = {
    internalServiceUrl: "http://rag.internal:8765",
    retrieve,
  };

  return { llmProvider, documentationRetriever };
}

describe("assembleMashalaApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assembles valid application data with required server-only dependencies", () => {
    const serverDependencies = dependencies();
    const runtime = assembleMashalaApplication({
      application: mashalaApplication,
      serverDependencies,
    });

    expect(runtime.application).toEqual(mashalaApplication);
    expect(runtime.serverDependencies.llmProvider).toBe(
      serverDependencies.llmProvider,
    );
    expect(runtime.serverDependencies.documentationRetriever).toBe(
      serverDependencies.documentationRetriever,
    );
  });

  it("keeps server dependencies outside serializable browser application data", () => {
    const runtime = assembleMashalaApplication({
      application: mashalaApplication,
      serverDependencies: dependencies(),
    });
    const serializedApplication = JSON.stringify(runtime.application);

    expect(Object.keys(runtime.application)).toEqual([
      "specVersion",
      "app",
      "capabilities",
    ]);
    expect(serializedApplication).not.toContain("server-llm-secret");
    expect(serializedApplication).not.toContain("rag.internal");
    expect(serializedApplication).not.toContain("llmProvider");
    expect(serializedApplication).not.toContain("documentationRetriever");
  });

  it("rejects a missing application definition clearly", () => {
    const input = {
      serverDependencies: dependencies(),
    } as unknown as MashalaApplicationAssemblyInput;

    expect(() => assembleMashalaApplication(input)).toThrowError(
      new MashalaApplicationConfigurationError(
        "missing_application_definition",
        "Mashala application configuration is missing a MashalaSpec.",
      ),
    );
  });

  it("rejects malformed and incompatible application specs at assembly", () => {
    const malformed = {
      ...JSON.parse(JSON.stringify(mashalaApplication)),
      capabilities: [{ ...transferFixture(), confirmation: "automatic" }],
    };
    const incompatible = {
      ...JSON.parse(JSON.stringify(mashalaApplication)),
      specVersion: "99.0",
    };

    expect(() =>
      assembleMashalaApplication({
        application: malformed,
        serverDependencies: dependencies(),
      } as unknown as MashalaApplicationAssemblyInput),
    ).toThrowError(expect.objectContaining({ code: "malformed_spec" }));
    expect(() =>
      assembleMashalaApplication({
        application: incompatible,
        serverDependencies: dependencies(),
      } as unknown as MashalaApplicationAssemblyInput),
    ).toThrowError(
      expect.objectContaining({ code: "unsupported_spec_version" }),
    );
  });

  it("rejects each missing required server runtime dependency", () => {
    expect(() =>
      assembleMashalaApplication({
        application: mashalaApplication,
        serverDependencies: {
          documentationRetriever: dependencies().documentationRetriever,
        },
      } as unknown as MashalaApplicationAssemblyInput),
    ).toThrowError(
      new MashalaRuntimeAssemblyError(
        "missing_llm_provider",
        "Mashala server runtime requires an LLM provider.",
      ),
    );

    expect(() =>
      assembleMashalaApplication({
        application: mashalaApplication,
        serverDependencies: {
          llmProvider: dependencies().llmProvider,
        },
      } as unknown as MashalaApplicationAssemblyInput),
    ).toThrowError(
      new MashalaRuntimeAssemblyError(
        "missing_documentation_retriever",
        "Mashala server runtime requires a documentation retriever.",
      ),
    );
  });

  it("resolves the declared transfer fixture for routing, extraction, and rendering", () => {
    const runtime = assembleMashalaApplication({
      application: mashalaApplication,
      serverDependencies: dependencies(),
    });
    const transfer = runtime.resolveCapability("transfer_money");

    expect(transfer).toBe(runtime.application.capabilities[0]);
    expect(transfer).toMatchObject({
      id: "transfer_money",
      description: "Transfer money to a recipient from the user's account.",
      operation: { method: "POST", path: "/transfers" },
      confirmation: "required",
    });
    expect(transfer?.kind).toBe("write");
    if (transfer?.kind !== "write") {
      throw new Error("Transfer fixture must be a write capability.");
    }
    expect(transfer.form.schema.properties).toHaveProperty("recipient");
    expect(transfer.form.fields).toHaveProperty("amount");
    expect(runtime.resolveCapability("invented_capability")).toBeUndefined();
  });
});

function transferFixture() {
  const capability = mashalaApplication.capabilities[0];
  if (capability === undefined) {
    throw new Error("Transfer fixture is missing.");
  }
  return capability;
}
