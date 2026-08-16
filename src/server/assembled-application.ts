import "server-only";

import mashalaApplication from "../../mashala.config";
import { assembleMashalaApplication } from "./application-runtime";
import { createGeminiProviderFromEnv } from "./llm/gemini";
import { createPythonRagRetriever } from "./retrieval/python-rag-client";

const DEFAULT_RAG_SERVICE_ORIGIN = "http://127.0.0.1:8765";

/** The repository application's validated server-only runtime assembly. */
export const assembledMashalaApplication = assembleMashalaApplication({
  application: mashalaApplication,
  serverDependencies: {
    llmProvider: createGeminiProviderFromEnv(),
    documentationRetriever: createPythonRagRetriever({
      baseUrl:
        process.env.MASHALA_RAG_SERVICE_URL ?? DEFAULT_RAG_SERVICE_ORIGIN,
    }),
  },
});
