import "server-only";

import { validateMashalaSpec } from "../application";
import type { CapabilitySpec, MashalaSpec } from "../spec";
import type { LlmProvider } from "./llm/provider";
import type { DocumentationRetriever } from "./retrieval/retriever";

export interface MashalaServerRuntimeDependencies {
  readonly llmProvider: LlmProvider;
  readonly documentationRetriever: DocumentationRetriever;
}

export interface MashalaApplicationAssemblyInput {
  readonly application: MashalaSpec;
  readonly serverDependencies: MashalaServerRuntimeDependencies;
}

export interface MashalaApplicationRuntime {
  /** The isolated, serializable application data safe to pass to the browser. */
  readonly application: MashalaSpec;

  /** Server-only instances. Never serialize or pass this object to the browser. */
  readonly serverDependencies: MashalaServerRuntimeDependencies;

  /** Resolves only capabilities present in the validated developer spec. */
  readonly resolveCapability: (capabilityId: string) => CapabilitySpec | undefined;
}

export type MashalaRuntimeAssemblyErrorCode =
  | "missing_llm_provider"
  | "missing_documentation_retriever"
  | "malformed_server_dependencies";

/** A stable, sanitized server-runtime dependency failure. */
export class MashalaRuntimeAssemblyError extends Error {
  readonly code: MashalaRuntimeAssemblyErrorCode;

  constructor(code: MashalaRuntimeAssemblyErrorCode, message: string) {
    super(message);
    this.name = "MashalaRuntimeAssemblyError";
    this.code = code;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function dependencyError(
  code: MashalaRuntimeAssemblyErrorCode,
  message: string,
): never {
  throw new MashalaRuntimeAssemblyError(code, message);
}

function validateServerDependencies(
  value: unknown,
): MashalaServerRuntimeDependencies {
  if (!isPlainRecord(value)) {
    dependencyError(
      "malformed_server_dependencies",
      "Mashala server runtime dependencies are malformed.",
    );
  }

  const keys = Object.keys(value);
  if (
    keys.some(
      (key) =>
        key !== "llmProvider" && key !== "documentationRetriever",
    )
  ) {
    dependencyError(
      "malformed_server_dependencies",
      "Mashala server runtime dependencies are malformed.",
    );
  }

  const llmProvider = value.llmProvider;
  if (
    typeof llmProvider !== "object" ||
    llmProvider === null ||
    typeof Reflect.get(llmProvider, "generateStructured") !== "function"
  ) {
    dependencyError(
      "missing_llm_provider",
      "Mashala server runtime requires an LLM provider.",
    );
  }

  const documentationRetriever = value.documentationRetriever;
  if (
    typeof documentationRetriever !== "object" ||
    documentationRetriever === null ||
    typeof Reflect.get(documentationRetriever, "retrieve") !== "function"
  ) {
    dependencyError(
      "missing_documentation_retriever",
      "Mashala server runtime requires a documentation retriever.",
    );
  }

  return Object.freeze({
    llmProvider: llmProvider as LlmProvider,
    documentationRetriever:
      documentationRetriever as DocumentationRetriever,
  });
}

/**
 * Assembles validated developer application data with server-only runtime
 * instances without adding either dependency to the serializable spec.
 */
export function assembleMashalaApplication(
  input: MashalaApplicationAssemblyInput,
): MashalaApplicationRuntime {
  const untrustedInput: unknown = input;
  const application =
    isPlainRecord(untrustedInput) && "application" in untrustedInput
      ? validateMashalaSpec(untrustedInput.application)
      : validateMashalaSpec(undefined);
  const serverDependencies = validateServerDependencies(
    isPlainRecord(untrustedInput)
      ? untrustedInput.serverDependencies
      : undefined,
  );
  const capabilitiesById = new Map(
    application.capabilities.map((capability) => [capability.id, capability]),
  );

  return Object.freeze({
    application,
    serverDependencies,
    resolveCapability(capabilityId: string): CapabilitySpec | undefined {
      return capabilitiesById.get(capabilityId);
    },
  });
}
