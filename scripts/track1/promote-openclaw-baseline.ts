import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateTrack1Acceptance,
  type Track1AcceptanceSource
} from "./acceptance-validator.ts";

export const TRACK1_BASELINE_PATHS = Object.freeze([
  "security-risk-analysis.md",
  "security-risk-analysis.pdf",
  "manifest.json",
  "campaign.json",
  "screenshots/campaign-running.png",
  "screenshots/campaign-overview.png",
  "screenshots/scenario-1-prompt-injection.png",
  "screenshots/scenario-2-tool-hijack.png",
  "screenshots/scenario-3-memory-poisoning.png"
] as const);

export interface Track1BaselineSourceEntry {
  path: string;
  kind: string;
  bytes: Uint8Array;
}

export interface Track1BaselinePromotionPorts {
  baselineExists(): Promise<boolean>;
  readSource(): Promise<{
    acceptance_source: Track1AcceptanceSource;
    entries: Track1BaselineSourceEntry[];
  }>;
  createTemporaryDirectory(): Promise<string>;
  copyFile(
    temporary: string,
    path: string,
    bytes: Uint8Array
  ): Promise<void>;
  rereadTemporary(
    temporary: string
  ): Promise<ReadonlyMap<string, Uint8Array>>;
  publish(temporary: string): Promise<void>;
  cleanupTemporary(temporary: string): Promise<void>;
}

export interface Track1BaselinePromotionResult {
  campaign_id: string;
  file_count: 9;
  manifest_sha256: string;
}

const CAMPAIGN_ID = /^campaign:t1:[a-f0-9]{32}$/;
const RUNTIME_SENTINEL =
  /runtime_(?:prompt|output|credential|provider)_secret_|MUTATION_SECRET_/i;

function fail(): never {
  throw new Error("track1_baseline_promotion_failed");
}

function normalizeRequest(value: unknown): { campaign_id: string } {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return fail();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.campaign_id !== "string" ||
    !CAMPAIGN_ID.test(record.campaign_id)
  ) {
    return fail();
  }
  return { campaign_id: record.campaign_id };
}

function validateEntries(
  entries: Track1BaselineSourceEntry[],
  acceptedFiles: ReadonlyMap<string, Uint8Array>
): Track1BaselineSourceEntry[] {
  if (entries.length !== TRACK1_BASELINE_PATHS.length) fail();
  const byPath = new Map<string, Track1BaselineSourceEntry>();
  for (const entry of entries) {
    if (byPath.has(entry.path)) fail();
    byPath.set(entry.path, entry);
  }
  for (let index = 0; index < TRACK1_BASELINE_PATHS.length; index += 1) {
    const expectedPath = TRACK1_BASELINE_PATHS[index];
    const entry = byPath.get(expectedPath);
    if (
      !entry ||
      Object.keys(entry).length !== 3 ||
      entry.path !== expectedPath ||
      entry.kind !== "file" ||
      !(entry.bytes instanceof Uint8Array) ||
      entry.bytes.byteLength === 0 ||
      entry.path.includes("\\") ||
      entry.path.includes(":") ||
      entry.path.startsWith("/") ||
      entry.path.split("/").some((segment) => segment.startsWith("."))
    ) {
      fail();
    }
    const accepted = acceptedFiles.get(entry.path);
    if (
      !(accepted instanceof Uint8Array) ||
      !Buffer.from(entry.bytes).equals(Buffer.from(accepted)) ||
      RUNTIME_SENTINEL.test(Buffer.from(entry.bytes).toString("utf8"))
    ) {
      fail();
    }
  }
  return TRACK1_BASELINE_PATHS.map((path) => byPath.get(path)!);
}

export async function promoteTrack1Baseline(
  rawRequest: unknown,
  ports: Track1BaselinePromotionPorts
): Promise<Readonly<Track1BaselinePromotionResult>> {
  const request = normalizeRequest(rawRequest);
  if (await ports.baselineExists()) {
    throw new Error("track1_baseline_exists");
  }
  let source: Awaited<ReturnType<Track1BaselinePromotionPorts["readSource"]>>;
  let acceptance: ReturnType<typeof validateTrack1Acceptance>;
  try {
    source = await ports.readSource();
    acceptance = validateTrack1Acceptance(source.acceptance_source);
    if (acceptance.campaign_id !== request.campaign_id) fail();
    source.entries = validateEntries(
      source.entries,
      source.acceptance_source.artifact_files
    );
  } catch {
    return fail();
  }

  let temporary: string | null = null;
  try {
    temporary = await ports.createTemporaryDirectory();
    for (const entry of source.entries) {
      await ports.copyFile(
        temporary,
        entry.path,
        Uint8Array.from(entry.bytes)
      );
    }
    const reread = await ports.rereadTemporary(temporary);
    if (
      !(reread instanceof Map) ||
      reread.size !== TRACK1_BASELINE_PATHS.length
    ) {
      fail();
    }
    for (const entry of source.entries) {
      const bytes = reread.get(entry.path);
      if (
        !(bytes instanceof Uint8Array) ||
        !Buffer.from(bytes).equals(Buffer.from(entry.bytes))
      ) {
        fail();
      }
    }
    await ports.publish(temporary);
    temporary = null;
  } catch {
    if (temporary !== null) {
      await ports.cleanupTemporary(temporary).catch(() => undefined);
    }
    return fail();
  }
  return Object.freeze({
    campaign_id: request.campaign_id,
    file_count: 9 as const,
    manifest_sha256: acceptance.manifest_sha256
  });
}

async function listFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) fail();
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        results.push(relative(root, path).split(sep).join("/"));
      } else {
        fail();
      }
    }
  }
  await visit(root);
  return results.sort();
}

function assertWithin(root: string, path: string): void {
  const normalizedRoot = `${resolve(root)}${sep}`;
  const normalizedPath = resolve(path);
  if (
    normalizedPath !== resolve(root) &&
    !normalizedPath.startsWith(normalizedRoot)
  ) {
    fail();
  }
}

function createFilesystemPorts(campaignId: string): Track1BaselinePromotionPorts {
  const campaignHex = campaignId.slice("campaign:t1:".length);
  const sourceRoot = resolve("artifacts/track1", campaignHex);
  const acceptancePath = resolve(
    "artifacts/track1/.acceptance",
    campaignHex,
    "source.json"
  );
  const destination = resolve("docs/track1/evidence/openclaw-baseline");
  const destinationParent = dirname(destination);
  assertWithin(resolve("artifacts/track1"), sourceRoot);
  assertWithin(resolve("artifacts/track1"), acceptancePath);
  assertWithin(resolve("docs/track1/evidence"), destination);
  return {
    async baselineExists() {
      try {
        await lstat(destination);
        return true;
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return false;
        }
        throw error;
      }
    },
    async readSource() {
      const paths = await listFiles(sourceRoot);
      const entries = [];
      for (const path of paths) {
        const absolute = join(sourceRoot, ...path.split("/"));
        assertWithin(sourceRoot, absolute);
        entries.push({
          path,
          kind: "file",
          bytes: await readFile(absolute)
        });
      }
      const serialized = JSON.parse(await readFile(acceptancePath, "utf8"));
      return {
        acceptance_source: {
          ...serialized,
          artifact_files: new Map(
            entries.map((entry) => [entry.path, Uint8Array.from(entry.bytes)])
          )
        } as Track1AcceptanceSource,
        entries
      };
    },
    async createTemporaryDirectory() {
      await mkdir(destinationParent, { recursive: true });
      return mkdtemp(join(destinationParent, ".openclaw-baseline-"));
    },
    async copyFile(temporary, path, bytes) {
      const target = join(temporary, ...path.split("/"));
      assertWithin(temporary, target);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    },
    async rereadTemporary(temporary) {
      const files = new Map<string, Uint8Array>();
      for (const path of await listFiles(temporary)) {
        files.set(path, await readFile(join(temporary, ...path.split("/"))));
      }
      return files;
    },
    async publish(temporary) {
      await rename(temporary, destination);
    },
    async cleanupTemporary(temporary) {
      await rm(temporary, { recursive: true, force: true });
    }
  };
}

async function runCli(): Promise<void> {
  if (
    process.argv.length !== 4 ||
    process.argv[2] !== "--campaign-id" ||
    !CAMPAIGN_ID.test(process.argv[3])
  ) {
    fail();
  }
  const result = await promoteTrack1Baseline(
    { campaign_id: process.argv[3] },
    createFilesystemPorts(process.argv[3])
  );
  process.stdout.write(
    `files=${result.file_count} manifest_sha256=${result.manifest_sha256}\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await runCli();
  } catch (error) {
    const code =
      error instanceof Error && error.message === "track1_baseline_exists"
        ? "track1_baseline_exists"
        : "track1_baseline_promotion_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
