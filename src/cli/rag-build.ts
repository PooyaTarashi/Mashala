import { spawn } from "node:child_process";
import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAG_BUILDER_VERSION = "0.1.0";
export const RAG_BUILDER_IMAGE = `mashala-rag-builder:${RAG_BUILDER_VERSION}`;
export const REQUIRED_OLLAMA_MODEL = "nomic-embed-text:v1.5";
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
export const DEFAULT_RAG_INPUT = "docs";
export const DEFAULT_RAG_OUTPUT = ".mashala/rag";

export const CLI_USAGE = `Usage:
  mashala rag build [options]

Options:
  --input <directory>        Documentation root (default: docs)
  --output <directory>       Host artifact directory (default: .mashala/rag)
  --source <relative-path>   Markdown file/directory below input; repeatable
  --ollama-url <url>         Host Ollama origin (default: http://127.0.0.1:11434)
  --max-chunk-characters <n> Chunk target passed to the builder (default: 1600)
  -h, --help                 Show this help`;

type ProcessOutput = "capture" | "stream";

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  (
    command: string,
    arguments_: readonly string[],
    options: { output: ProcessOutput },
  ): Promise<ProcessResult>;
}

export interface RagBuildDependencies {
  cwd?: string;
  fetch?: typeof fetch;
  getUserSpec?: () => string | undefined;
  platform?: NodeJS.Platform;
  ragContextDirectory?: string;
  runner?: CommandRunner;
  writeError?: (message: string) => void;
  writeOutput?: (message: string) => void;
}

interface RagBuildOptions {
  input: string;
  maxChunkCharacters: number;
  ollamaUrl: string;
  output: string;
  sources: string[];
}

interface BuildSummary {
  artifactFormatVersion: string;
  chunkCount: number;
  documentCount: number;
}

export class MashalaCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MashalaCliError";
  }
}

export async function runMashalaCli(
  arguments_: readonly string[],
  dependencies: RagBuildDependencies = {},
): Promise<number> {
  const writeOutput = dependencies.writeOutput ?? console.log;
  const writeError = dependencies.writeError ?? console.error;

  if (
    arguments_.length === 0 ||
    arguments_[0] === "--help" ||
    arguments_[0] === "-h"
  ) {
    writeOutput(CLI_USAGE);
    return 0;
  }

  if (arguments_[0] !== "rag" || arguments_[1] !== "build") {
    writeError(`Unknown command: ${arguments_.join(" ")}\n\n${CLI_USAGE}`);
    return 1;
  }

  try {
    const parsed = parseRagBuildArguments(arguments_.slice(2));
    if (parsed === "help") {
      writeOutput(CLI_USAGE);
      return 0;
    }
    await buildRagArtifacts(parsed, dependencies);
    return 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown CLI failure";
    writeError(`RAG build failed: ${detail}`);
    return 1;
  }
}

export async function buildRagArtifacts(
  options: RagBuildOptions,
  dependencies: RagBuildDependencies = {},
): Promise<BuildSummary> {
  const cwd = dependencies.cwd ?? process.cwd();
  const runner = dependencies.runner ?? runProcess;
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const writeOutput = dependencies.writeOutput ?? console.log;
  const ragContextDirectory =
    dependencies.ragContextDirectory ??
    fileURLToPath(new URL("../../rag/", import.meta.url));

  const inputCandidate = path.resolve(cwd, options.input);
  const outputCandidate = path.resolve(cwd, options.output);
  const inputDirectory = await requireInputDirectory(inputCandidate);
  const outputDirectory = await requireOutputDirectory(outputCandidate);
  requireDockerMountablePath(inputDirectory, "input");
  requireDockerMountablePath(outputDirectory, "output");
  if (inputDirectory === outputDirectory) {
    throw new MashalaCliError(
      "documentation input and artifact output must be different directories",
    );
  }

  const ollama = parseOllamaUrl(
    options.ollamaUrl,
    dependencies.platform ?? process.platform,
  );

  writeOutput("Checking Docker...");
  await checkDocker(runner);
  writeOutput(`Checking Ollama model ${REQUIRED_OLLAMA_MODEL}...`);
  await checkOllama(fetchImplementation, ollama.hostUrl);

  writeOutput(`Building versioned RAG image ${RAG_BUILDER_IMAGE}...`);
  const imageBuild = await runner(
    "docker",
    [
      "build",
      "--tag",
      RAG_BUILDER_IMAGE,
      "--label",
      `org.opencontainers.image.version=${RAG_BUILDER_VERSION}`,
      ragContextDirectory,
    ],
    { output: "stream" },
  );
  if (imageBuild.exitCode !== 0) {
    throw new MashalaCliError(
      `Docker could not build ${RAG_BUILDER_IMAGE} (exit ${imageBuild.exitCode}); review the Docker output above`,
    );
  }

  const runArguments = dockerRunArguments({
    inputDirectory,
    maxChunkCharacters: options.maxChunkCharacters,
    network: ollama.network,
    ollamaContainerUrl: ollama.containerUrl,
    outputDirectory,
    sources: options.sources,
    userSpec:
      dependencies.getUserSpec === undefined
        ? getCurrentUserSpec()
        : dependencies.getUserSpec(),
  });
  writeOutput("Building RAG artifacts...");
  const build = await runner("docker", runArguments, { output: "stream" });
  if (build.exitCode !== 0) {
    throw new MashalaCliError(
      `the RAG builder container exited with status ${build.exitCode}; review its output above`,
    );
  }

  const summary = await readBuildSummary(outputDirectory);
  writeOutput(
    `RAG build complete: ${summary.documentCount} document(s), ${summary.chunkCount} chunk(s), artifact format ${summary.artifactFormatVersion}.`,
  );
  writeOutput(`Artifacts: ${outputDirectory}`);
  return summary;
}

function parseRagBuildArguments(
  arguments_: readonly string[],
): RagBuildOptions | "help" {
  const options: RagBuildOptions = {
    input: DEFAULT_RAG_INPUT,
    maxChunkCharacters: 1_600,
    ollamaUrl: DEFAULT_OLLAMA_URL,
    output: DEFAULT_RAG_OUTPUT,
    sources: [],
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      return "help";
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new MashalaCliError(`${argument} requires a value`);
    }
    index += 1;
    if (argument === "--input") {
      options.input = value;
    } else if (argument === "--output") {
      options.output = value;
    } else if (argument === "--source") {
      options.sources.push(value);
    } else if (argument === "--ollama-url") {
      options.ollamaUrl = value;
    } else if (argument === "--max-chunk-characters") {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new MashalaCliError(
          "--max-chunk-characters must be a positive integer",
        );
      }
      options.maxChunkCharacters = parsed;
    } else {
      throw new MashalaCliError(`unknown option ${argument}`);
    }
  }
  return options;
}

async function requireInputDirectory(candidate: string): Promise<string> {
  try {
    const details = await stat(candidate);
    if (!details.isDirectory()) {
      throw new MashalaCliError(
        `documentation input is not a directory: ${candidate}`,
      );
    }
    return await realpath(candidate);
  } catch (error) {
    if (error instanceof MashalaCliError) {
      throw error;
    }
    throw new MashalaCliError(
      `documentation input is unavailable: ${candidate}`,
    );
  }
}

async function requireOutputDirectory(candidate: string): Promise<string> {
  try {
    await mkdir(candidate, { recursive: true });
    const details = await stat(candidate);
    if (!details.isDirectory()) {
      throw new Error("not a directory");
    }
    return await realpath(candidate);
  } catch {
    throw new MashalaCliError(
      `artifact output cannot be created or opened: ${candidate}`,
    );
  }
}

function requireDockerMountablePath(candidate: string, label: string): void {
  if (candidate.includes(",")) {
    throw new MashalaCliError(
      `${label} path cannot contain a comma because Docker bind mounts cannot represent it safely: ${candidate}`,
    );
  }
}

function parseOllamaUrl(
  value: string,
  platform: NodeJS.Platform,
): {
  containerUrl: string;
  hostUrl: string;
  network?: "host" | "host-gateway";
} {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MashalaCliError(
      "--ollama-url must be an HTTP(S) origin without credentials or a path",
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !["", "/"].includes(parsed.pathname) ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new MashalaCliError(
      "--ollama-url must be an HTTP(S) origin without credentials or a path",
    );
  }

  const hostUrl = parsed.origin;
  if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    if (platform === "linux") {
      return { containerUrl: hostUrl, hostUrl, network: "host" };
    }
    parsed.hostname = "host.docker.internal";
    return {
      containerUrl: parsed.origin,
      hostUrl,
      network: "host-gateway",
    };
  }
  return { containerUrl: parsed.origin, hostUrl };
}

async function checkDocker(runner: CommandRunner): Promise<void> {
  let result: ProcessResult;
  try {
    result = await runner(
      "docker",
      ["version", "--format", "{{.Server.Version}}"],
      { output: "capture" },
    );
  } catch {
    throw new MashalaCliError(
      "Docker is required for RAG builds but the docker command is unavailable; install Docker and ensure it is on PATH",
    );
  }
  if (result.exitCode !== 0 || result.stdout.trim() === "") {
    const detail = result.stderr.trim();
    throw new MashalaCliError(
      `Docker is installed but its daemon is unavailable${detail ? `: ${detail}` : "; start Docker and try again"}`,
    );
  }
}

async function checkOllama(
  fetchImplementation: typeof fetch,
  ollamaUrl: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImplementation(new URL("/api/tags", ollamaUrl), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new MashalaCliError(
      `Ollama is unavailable at ${ollamaUrl}; start Ollama and make sure the URL is reachable`,
    );
  }
  if (!response.ok) {
    throw new MashalaCliError(
      `Ollama is unavailable at ${ollamaUrl} (HTTP ${response.status}); start Ollama and try again`,
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new MashalaCliError(
      `Ollama returned an invalid model list from ${ollamaUrl}`,
    );
  }
  const modelNames = modelNamesFromTags(value);
  if (!modelNames.has(REQUIRED_OLLAMA_MODEL)) {
    throw new MashalaCliError(
      `Ollama model ${REQUIRED_OLLAMA_MODEL} is unavailable; install it explicitly with "ollama pull ${REQUIRED_OLLAMA_MODEL}" and retry`,
    );
  }
}

function modelNamesFromTags(value: unknown): Set<string> {
  if (
    typeof value !== "object" ||
    value === null ||
    !("models" in value) ||
    !Array.isArray(value.models)
  ) {
    return new Set();
  }
  const names = new Set<string>();
  for (const model of value.models) {
    if (typeof model !== "object" || model === null) {
      continue;
    }
    for (const key of ["name", "model"] as const) {
      const candidate = key in model ? model[key] : undefined;
      if (typeof candidate === "string") {
        names.add(candidate);
      }
    }
  }
  return names;
}

function dockerRunArguments(options: {
  inputDirectory: string;
  maxChunkCharacters: number;
  network?: "host" | "host-gateway";
  ollamaContainerUrl: string;
  outputDirectory: string;
  sources: readonly string[];
  userSpec?: string;
}): string[] {
  const arguments_ = ["run", "--rm"];
  if (options.network === "host") {
    arguments_.push("--network", "host");
  } else if (options.network === "host-gateway") {
    arguments_.push(
      "--add-host",
      "host.docker.internal:host-gateway",
    );
  }
  arguments_.push(
    "--mount",
    `type=bind,src=${options.inputDirectory},dst=/workspace/docs,readonly`,
    "--mount",
    `type=bind,src=${options.outputDirectory},dst=/workspace/output`,
  );
  if (options.userSpec !== undefined) {
    arguments_.push("--user", options.userSpec);
  }
  arguments_.push(
    RAG_BUILDER_IMAGE,
    "build",
    "--input-directory",
    "/workspace/docs",
    "--output-directory",
    "/workspace/output",
    "--ollama-base-url",
    options.ollamaContainerUrl,
    "--max-chunk-characters",
    String(options.maxChunkCharacters),
  );
  for (const source of options.sources) {
    arguments_.push("--source", source);
  }
  return arguments_;
}

function getCurrentUserSpec(): string | undefined {
  if (
    typeof process.getuid !== "function" ||
    typeof process.getgid !== "function"
  ) {
    return undefined;
  }
  return `${process.getuid()}:${process.getgid()}`;
}

async function readBuildSummary(outputDirectory: string): Promise<BuildSummary> {
  const manifestPath = path.join(outputDirectory, "manifest.json");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch {
    throw new MashalaCliError(
      `the builder exited successfully but did not produce a readable manifest at ${manifestPath}`,
    );
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("artifactFormatVersion" in value) ||
    typeof value.artifactFormatVersion !== "string" ||
    !("corpus" in value) ||
    typeof value.corpus !== "object" ||
    value.corpus === null ||
    !("chunkCount" in value.corpus) ||
    typeof value.corpus.chunkCount !== "number" ||
    !Number.isSafeInteger(value.corpus.chunkCount) ||
    !("chunks" in value.corpus) ||
    !Array.isArray(value.corpus.chunks)
  ) {
    throw new MashalaCliError(
      `the builder produced an invalid summary manifest at ${manifestPath}`,
    );
  }

  const sourceIds = new Set<string>();
  for (const chunk of value.corpus.chunks) {
    if (
      typeof chunk === "object" &&
      chunk !== null &&
      "provenance" in chunk &&
      typeof chunk.provenance === "object" &&
      chunk.provenance !== null &&
      "sourceId" in chunk.provenance &&
      typeof chunk.provenance.sourceId === "string"
    ) {
      sourceIds.add(chunk.provenance.sourceId);
    }
  }
  return {
    artifactFormatVersion: value.artifactFormatVersion,
    chunkCount: value.corpus.chunkCount as number,
    documentCount: sourceIds.size,
  };
}

async function runProcess(
  command: string,
  arguments_: readonly string[],
  options: { output: ProcessOutput },
): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (options.output === "stream") {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (options.output === "stream") {
        process.stderr.write(chunk);
      }
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stderr, stdout });
    });
  });
}
