import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGeminiProvider,
  createGeminiProviderFromEnv,
} from "./gemini";
import type { StructuredLlmRequest } from "./provider";

const API_KEY = "gemini-test-api-key";
const MODEL = "gemini-2.5-flash";

const request: StructuredLlmRequest = {
  instructions: "Propose structured data. Do not execute anything.",
  input: "Return a greeting for Sam.",
  outputSchema: {
    type: "object",
    properties: {
      greeting: { type: "string" },
      confidence: { type: "number" },
    },
    required: ["greeting"],
    additionalProperties: false,
  },
};

function geminiResponse(text: string): Response {
  return Response.json({
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text }],
        },
        finishReason: "STOP",
      },
    ],
  });
}

function successfulFetch(text = '{"greeting":"Hello, Sam","confidence":0.9}') {
  return vi.fn<typeof fetch>().mockResolvedValue(geminiResponse(text));
}

describe("Gemini generateContent adapter", () => {
  it("translates a neutral structured request to native generateContent REST", async () => {
    const fetchImpl = successfulFetch();
    const provider = createGeminiProviderFromEnv({
      env: { GEMINI_API_KEY: API_KEY, GEMINI_MODEL: MODEL },
      fetchImpl,
    });

    await provider.generateStructured(request);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.instructions }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: request.input }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: request.outputSchema,
          },
        }),
      },
    );
  });

  it("places the API key only in X-goog-api-key", async () => {
    const fetchImpl = successfulFetch();
    const provider = createGeminiProvider({
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl,
    });

    const result = await provider.generateStructured(request);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    const headers = init?.headers as Record<string, string>;

    expect(headers).toEqual({
      "Content-Type": "application/json",
      "X-goog-api-key": API_KEY,
    });
    expect(headers).not.toHaveProperty("Authorization");
    expect(String(url)).not.toContain(API_KEY);
    expect(String(init?.body)).not.toContain(API_KEY);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it("normalizes parsed structured output without provider response details", async () => {
    const provider = createGeminiProvider({
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl: successfulFetch(),
    });

    const result = await provider.generateStructured(request);

    expect(result).toEqual({
      outcome: "success",
      output: { greeting: "Hello, Sam", confidence: 0.9 },
    });
    expect(result).not.toHaveProperty("candidates");
    expect(result).not.toHaveProperty("usageMetadata");
  });

  it.each([
    ["missing candidates", {}],
    ["missing content", { candidates: [{}] }],
    [
      "non-text part",
      { candidates: [{ content: { parts: [{ inlineData: {} }] } }] },
    ],
  ])("normalizes a malformed response with %s", async (_case, payload) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(payload));
    const provider = createGeminiProvider({
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl,
    });

    await expect(provider.generateStructured(request)).resolves.toEqual({
      outcome: "failure",
      error: {
        code: "invalid_response",
        message: "The LLM provider returned an unusable structured response.",
        retryable: false,
      },
    });
  });

  it("rejects model text that is not valid JSON", async () => {
    const provider = createGeminiProvider({
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl: successfulFetch("not JSON"),
    });

    await expect(provider.generateStructured(request)).resolves.toEqual({
      outcome: "failure",
      error: {
        code: "invalid_response",
        message: "The LLM provider returned an unusable structured response.",
        retryable: false,
      },
    });
  });

  it("normalizes a non-JSON provider response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not JSON", { status: 200 }));
    const provider = createGeminiProvider({
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl,
    });

    await expect(provider.generateStructured(request)).resolves.toMatchObject({
      outcome: "failure",
      error: { code: "invalid_response", retryable: false },
    });
  });

  it("normalizes rejected fetches without leaking raw network details", async () => {
    const privateDetail = `network failed while using ${API_KEY}`;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(privateDetail));
    const provider = createGeminiProvider({
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl,
    });

    const result = await provider.generateStructured(request);

    expect(result).toEqual({
      outcome: "failure",
      error: {
        code: "provider_failure",
        message: "The LLM provider request failed.",
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(JSON.stringify(result)).not.toContain(privateDetail);
  });

  it.each([
    [401, false],
    [429, true],
    [503, true],
  ])(
    "normalizes HTTP %s provider failures with retryable=%s",
    async (status, retryable) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          { error: { message: `provider detail containing ${API_KEY}` } },
          { status },
        ),
      );
      const provider = createGeminiProvider({
        apiKey: API_KEY,
        model: MODEL,
        fetchImpl,
      });

      const result = await provider.generateStructured(request);

      expect(result).toEqual({
        outcome: "failure",
        error: {
          code: "provider_failure",
          message: "The LLM provider returned an unsuccessful response.",
          retryable,
        },
      });
      expect(JSON.stringify(result)).not.toContain(API_KEY);
      expect(JSON.stringify(result)).not.toContain("provider detail");
    },
  );

  it.each([
    [
      "missing API key",
      { GEMINI_MODEL: MODEL },
      "Gemini provider is not configured: GEMINI_API_KEY is required.",
    ],
    [
      "missing model",
      { GEMINI_API_KEY: API_KEY },
      "Gemini provider is not configured: GEMINI_MODEL is required.",
    ],
    [
      "invalid model path",
      { GEMINI_API_KEY: API_KEY, GEMINI_MODEL: "models/gemini-2.5-flash" },
      "Gemini provider configuration is invalid: GEMINI_MODEL must be a model name without a path.",
    ],
  ])("fails clearly for %s", async (_case, env, message) => {
    const fetchImpl = successfulFetch();
    const provider = createGeminiProviderFromEnv({ env, fetchImpl });

    await expect(provider.generateStructured(request)).resolves.toEqual({
      outcome: "failure",
      error: {
        code: "invalid_configuration",
        message,
        retryable: false,
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
