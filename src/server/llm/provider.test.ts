import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  LlmProvider,
  LlmProviderResult,
  StructuredLlmRequest,
} from "./provider";

const request: StructuredLlmRequest = {
  instructions: "Return the requested structured proposal.",
  input: "Example input",
  outputSchema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  },
};

async function invokeProvider(provider: LlmProvider): Promise<LlmProviderResult> {
  return provider.generateStructured(request);
}

describe("LLM provider boundary", () => {
  it("can be replaced with a provider-neutral fake", async () => {
    const generateStructured = vi.fn<LlmProvider["generateStructured"]>();
    generateStructured.mockResolvedValue({
      outcome: "success",
      output: { answer: "fake output" },
    });
    const fake: LlmProvider = { generateStructured };

    await expect(invokeProvider(fake)).resolves.toEqual({
      outcome: "success",
      output: { answer: "fake output" },
    });
    expect(generateStructured).toHaveBeenCalledWith(request);
  });

  it("contains only model instructions, input, and an output schema", () => {
    expect(Object.keys(request)).toEqual([
      "instructions",
      "input",
      "outputSchema",
    ]);
    expect(request).not.toHaveProperty("operation");
    expect(request).not.toHaveProperty("credentials");
    expect(request).not.toHaveProperty("headers");
    expectTypeOf<keyof StructuredLlmRequest>().toEqualTypeOf<
      "instructions" | "input" | "outputSchema"
    >();
  });
});

if (false) {
  const provider = {} as LlmProvider;

  void provider.generateStructured({
    ...request,
    // @ts-expect-error Target-backend operations are not provider input.
    operation: { method: "POST", path: "/transfers" },
  });

  void provider.generateStructured({
    ...request,
    // @ts-expect-error Target-backend credentials are not provider input.
    credentials: "target-backend-secret",
  });
}
