import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RAG_BUILDER_IMAGE,
  REQUIRED_OLLAMA_MODEL,
  type CommandRunner,
  type ProcessResult,
  runMashalaCli,
} from "./rag-build";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      expect(directory.startsWith(tmpdir())).toBe(true);
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

async function fixtureWorkspace(): Promise<{
  input: string;
  output: string;
  root: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "mashala-rag-cli-"));
  temporaryDirectories.push(root);
  const input = path.join(root, "developer docs");
  const output = path.join(root, "built artifacts");
  await mkdir(input, { recursive: true });
  await writeFile(path.join(input, "guide.md"), "# Guide\n", "utf8");
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify({
      artifactFormatVersion: "1.0",
      corpus: {
        chunkCount: 2,
        chunks: [
          { provenance: { sourceId: "source:guide" } },
          { provenance: { sourceId: "source:guide" } },
        ],
      },
    }),
    "utf8",
  );
  return {
    input: await realpath(input),
    output: await realpath(output),
    root,
  };
}

function ollamaResponse(models = [REQUIRED_OLLAMA_MODEL]): Response {
  return new Response(
    JSON.stringify({ models: models.map((model) => ({ model })) }),
    { headers: { "Content-Type": "application/json" }, status: 200 },
  );
}

function result(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return { exitCode: 0, stderr: "", stdout: "", ...overrides };
}

describe("mashala rag build", () => {
  it("constructs a versioned container build with safe input/output mappings", async () => {
    const workspace = await fixtureWorkspace();
    const calls: Array<{
      arguments_: readonly string[];
      command: string;
      output: string;
    }> = [];
    const runner: CommandRunner = async (command, arguments_, options) => {
      calls.push({ arguments_, command, output: options.output });
      return command === "docker" && arguments_[0] === "version"
        ? result({ stdout: "28.0.0\n" })
        : result();
    };
    const messages: string[] = [];

    const exitCode = await runMashalaCli(
      [
        "rag",
        "build",
        "--input",
        workspace.input,
        "--output",
        workspace.output,
        "--source",
        "guide.md",
        "--max-chunk-characters",
        "900",
      ],
      {
        cwd: workspace.root,
        fetch: vi.fn(async () => ollamaResponse()),
        getUserSpec: () => "1000:1000",
        platform: "win32",
        ragContextDirectory: path.join(workspace.root, "rag context"),
        runner,
        writeError: messages.push.bind(messages),
        writeOutput: messages.push.bind(messages),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      arguments_: ["version", "--format", "{{.Server.Version}}"],
      command: "docker",
      output: "capture",
    });
    expect(calls[1]).toEqual({
      arguments_: [
        "build",
        "--tag",
        RAG_BUILDER_IMAGE,
        "--label",
        "org.opencontainers.image.version=0.1.0",
        path.join(workspace.root, "rag context"),
      ],
      command: "docker",
      output: "stream",
    });
    expect(calls[2].command).toBe("docker");
    expect(calls[2].output).toBe("stream");
    expect(calls[2].arguments_).toEqual([
      "run",
      "--rm",
      "--add-host",
      "host.docker.internal:host-gateway",
      "--mount",
      `type=bind,src=${workspace.input},dst=/workspace/docs,readonly`,
      "--mount",
      `type=bind,src=${workspace.output},dst=/workspace/output`,
      "--user",
      "1000:1000",
      RAG_BUILDER_IMAGE,
      "build",
      "--input-directory",
      "/workspace/docs",
      "--output-directory",
      "/workspace/output",
      "--ollama-base-url",
      "http://host.docker.internal:11434",
      "--max-chunk-characters",
      "900",
      "--source",
      "guide.md",
    ]);
    expect(calls.every((call) => call.command === "docker")).toBe(true);
    expect(messages).toContain(
      "RAG build complete: 1 document(s), 2 chunk(s), artifact format 1.0.",
    );
    expect(messages).toContain(`Artifacts: ${workspace.output}`);
  });

  it("uses host networking for a loopback Ollama on native Linux", async () => {
    const workspace = await fixtureWorkspace();
    const calls: string[][] = [];
    const runner: CommandRunner = async (_command, arguments_) => {
      calls.push([...arguments_]);
      return arguments_[0] === "version"
        ? result({ stdout: "28.0.0\n" })
        : result();
    };

    const exitCode = await runMashalaCli(
      ["rag", "build", "--input", workspace.input, "--output", workspace.output],
      {
        fetch: vi.fn(async () => ollamaResponse()),
        getUserSpec: () => undefined,
        platform: "linux",
        runner,
        writeError: () => undefined,
        writeOutput: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(calls[2]).toContain("--network");
    expect(calls[2]).toContain("host");
    expect(calls[2]).toContain("http://127.0.0.1:11434");
    expect(calls[2]).not.toContain("host.docker.internal:host-gateway");
    expect(calls[2]).not.toContain("--user");
  });

  it("fails clearly when Docker is missing and does not contact Ollama", async () => {
    const workspace = await fixtureWorkspace();
    const fetchMock = vi.fn(async () => ollamaResponse());
    const errors: string[] = [];

    const exitCode = await runMashalaCli(
      ["rag", "build", "--input", workspace.input, "--output", workspace.output],
      {
        fetch: fetchMock,
        runner: async () => {
          throw new Error("ENOENT");
        },
        writeError: errors.push.bind(errors),
        writeOutput: () => undefined,
      },
    );

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/Docker is required.*unavailable/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails clearly when Ollama is unavailable", async () => {
    const workspace = await fixtureWorkspace();
    const errors: string[] = [];
    const runner = vi.fn<CommandRunner>(async () =>
      result({ stdout: "28.0.0\n" }),
    );

    const exitCode = await runMashalaCli(
      ["rag", "build", "--input", workspace.input, "--output", workspace.output],
      {
        fetch: vi.fn(async () => {
          throw new Error("connection refused");
        }),
        runner,
        writeError: errors.push.bind(errors),
        writeOutput: () => undefined,
      },
    );

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("Ollama is unavailable");
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("requires the exact embedding model without pulling it", async () => {
    const workspace = await fixtureWorkspace();
    const errors: string[] = [];
    const calls: string[][] = [];
    const runner: CommandRunner = async (_command, arguments_) => {
      calls.push([...arguments_]);
      return result({ stdout: "28.0.0\n" });
    };

    const exitCode = await runMashalaCli(
      ["rag", "build", "--input", workspace.input, "--output", workspace.output],
      {
        fetch: vi.fn(async () => ollamaResponse(["nomic-embed-text:latest"])),
        runner,
        writeError: errors.push.bind(errors),
        writeOutput: () => undefined,
      },
    );

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      `ollama pull ${REQUIRED_OLLAMA_MODEL}`,
    );
    expect(calls).toHaveLength(1);
    expect(calls.flat()).not.toContain("pull");
  });

  it("surfaces a non-zero builder container result", async () => {
    const workspace = await fixtureWorkspace();
    const errors: string[] = [];
    let call = 0;
    const runner: CommandRunner = async (_command, _arguments_, options) => {
      call += 1;
      if (call === 1) {
        return result({ stdout: "28.0.0\n" });
      }
      if (call === 3) {
        expect(options.output).toBe("stream");
        return result({ exitCode: 17, stderr: "embedding failed" });
      }
      return result();
    };

    const exitCode = await runMashalaCli(
      ["rag", "build", "--input", workspace.input, "--output", workspace.output],
      {
        fetch: vi.fn(async () => ollamaResponse()),
        runner,
        writeError: errors.push.bind(errors),
        writeOutput: () => undefined,
      },
    );

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/builder container exited with status 17/u);
  });

  it("registers the developer command without a host Python dependency", async () => {
    const packageManifest = JSON.parse(
      await readFile(path.resolve("package.json"), "utf8"),
    ) as {
      bin: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(packageManifest.bin).toEqual({ mashala: "./bin/mashala.mjs" });
    expect(
      Object.keys({
        ...packageManifest.dependencies,
        ...packageManifest.devDependencies,
      }).join(" "),
    ).not.toMatch(/python|faiss|pip/u);
  });
});
