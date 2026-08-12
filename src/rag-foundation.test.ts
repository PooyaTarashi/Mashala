import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const ragRoot = fileURLToPath(new URL("../rag/", import.meta.url));

function readRepositoryFile(relativePath: string): string {
  return readFileSync(`${repositoryRoot}${relativePath}`, "utf8");
}

function readRagFile(relativePath: string): string {
  return readFileSync(`${ragRoot}${relativePath}`, "utf8");
}

describe("containerized Python RAG foundation", () => {
  it("pins the Python image and complete Python distribution set", () => {
    const dockerfile = readRagFile("Dockerfile");
    const requirementsLock = readRagFile("requirements.lock");
    const requirements = requirementsLock
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => /^[\w-]+==\d+(?:\.\d+)+/u.test(line))
      .map((line) => line.replace(/ \\$/u, ""));

    expect(dockerfile).toContain(
      "FROM python:3.13.14-slim-bookworm@sha256:67a1e1f215ccda113cfc024e8639049257e88f273898f595b61476d128d387e8",
    );
    expect(dockerfile).toContain("--no-deps");
    expect(dockerfile).toContain("--only-binary=:all:");
    expect(dockerfile).toContain("--require-hashes");
    expect(requirements).toEqual([
      "faiss-cpu==1.14.3",
      "numpy==2.5.1",
      "packaging==26.2",
    ]);
    expect(
      requirements.every((requirement) =>
        /^[\w-]+==\d+(?:\.\d+)+$/u.test(requirement),
      ),
    ).toBe(true);
    expect(requirementsLock.match(/--hash=sha256:[a-f0-9]{64}/gu)).toHaveLength(
      5,
    );
  });

  it("keeps the build context and FAISS smoke check inside the RAG boundary", () => {
    const dockerfile = readRagFile("Dockerfile");
    const smokeCommand = readRagFile("src/mashala_rag/__main__.py");

    expect(dockerfile).toContain("COPY requirements.lock ./requirements.lock");
    expect(dockerfile).toContain("COPY src ./src");
    expect(dockerfile).toContain("COPY tests ./tests");
    expect(dockerfile).toContain(
      'RUN python -m unittest discover -s tests -p "test_*.py"',
    );
    expect(dockerfile).toContain("RUN python -m mashala_rag");
    expect(dockerfile).not.toMatch(/^EXPOSE /mu);
    expect(smokeCommand).toContain("import faiss");
    expect(smokeCommand).toContain('"faiss-cpu": "1.14.3"');
  });

  it("adds no Python, FAISS, target-backend, or LLM integration to Node", () => {
    const packageManifest = JSON.parse(readRepositoryFile("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const nodeConfiguration = JSON.stringify(packageManifest).toLowerCase();
    const ragImplementation = [
      readRagFile("src/mashala_rag/__init__.py"),
      readRagFile("src/mashala_rag/__main__.py"),
    ].join("\n").toLowerCase();

    expect(nodeConfiguration).not.toMatch(/python|pip|faiss/u);
    expect(Object.keys(packageManifest.scripts)).not.toContain("rag");
    expect(ragImplementation).not.toMatch(
      /target.?backend|credential|gemini|llm|capability.?rout|slot.?extract|confirmation|workflow/u,
    );
  });
});
