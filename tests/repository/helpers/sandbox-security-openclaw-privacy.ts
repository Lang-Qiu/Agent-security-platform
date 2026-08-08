import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync
} from "node:fs";
import {
  basename,
  join,
  relative,
  sep
} from "node:path";

export type PrivacyArtifact = Readonly<{
  id: string;
  bytes: Uint8Array;
}>;

export type PrivacyFinding = Readonly<{
  artifact_id: string;
  encoding: string;
}>;

export type Track1Snapshot = Readonly<{
  file_count: number;
  aggregate_sha256: string;
}>;

export type Track1SnapshotExpectation = Readonly<{
  baseline_commit: string;
  file_count: number;
  aggregate_sha256: string;
}>;

const TRACK1_OWNED_SURFACES = [
  "integrations/openclaw",
  "deploy/track1",
  "docs/track1/evidence"
] as const;

const GENERATED_OR_IGNORED_SEGMENTS = new Set([
  ".cache",
  ".generated",
  ".turbo",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "generated",
  "logs",
  "node_modules",
  "reports",
  "sandbox-data",
  "temp",
  "tmp"
]);

function privacyEncodings(sentinel: string): readonly [string, string][] {
  return [
    ["literal", sentinel],
    ["case-folded", sentinel.normalize("NFKC").toLocaleLowerCase()],
    ["nfkc", sentinel.normalize("NFKC")],
    ["json-escaped", JSON.stringify(sentinel).slice(1, -1)],
    ["percent-encoded", encodeURIComponent(sentinel)],
    ["base64", Buffer.from(sentinel, "utf8").toString("base64")],
    ["hex", Buffer.from(sentinel, "utf8").toString("hex")],
    [
      "sha256",
      createHash("sha256").update(sentinel, "utf8").digest("hex")
    ]
  ];
}

export function scanManagedArtifacts(
  artifacts: readonly PrivacyArtifact[],
  sentinel: string
): readonly PrivacyFinding[] {
  if (typeof sentinel !== "string" || sentinel.length === 0) {
    throw new TypeError("privacy sentinel must be a non-empty string");
  }
  const encodings = privacyEncodings(sentinel);
  const findings: PrivacyFinding[] = [];
  for (const artifact of artifacts) {
    if (typeof artifact.id !== "string" || !(artifact.bytes instanceof Uint8Array)) {
      throw new TypeError("privacy artifact must have an id and byte payload");
    }
    const text = Buffer.from(artifact.bytes).toString("utf8");
    for (const [encoding, encoded] of encodings) {
      if (encoded.length > 0 && text.includes(encoded)) {
        findings.push(Object.freeze({ artifact_id: artifact.id, encoding }));
      }
    }
  }
  return Object.freeze(findings);
}

function isTrack1File(relativePath: string): boolean {
  const normalized = relativePath.split(sep).join("/");
  if (normalized.startsWith("integrations/openclaw/general-security/")) {
    return false;
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => GENERATED_OR_IGNORED_SEGMENTS.has(segment))) {
    return false;
  }
  const fileName = basename(normalized);
  return fileName !== ".DS_Store" && fileName !== "Thumbs.db" && !fileName.endsWith(".log");
}

function collectTrack1Files(
  repositoryRoot: string,
  currentPath: string,
  files: string[]
): void {
  const stat = lstatSync(currentPath);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const entry of readdirSync(currentPath)) {
      collectTrack1Files(repositoryRoot, join(currentPath, entry), files);
    }
    return;
  }
  if (!stat.isFile()) return;
  const relativePath = relative(repositoryRoot, currentPath);
  if (isTrack1File(relativePath)) files.push(relativePath.split(sep).join("/"));
}

export function snapshotTrack1OwnedSurfaces(repositoryRoot: string): Track1Snapshot {
  const files: string[] = [];
  for (const surface of TRACK1_OWNED_SURFACES) {
    collectTrack1Files(repositoryRoot, join(repositoryRoot, surface), files);
  }
  const entries = files.toSorted().map((relativePath) => {
    const bytes = readFileSync(join(repositoryRoot, relativePath));
    const digest = createHash("sha256").update(bytes).digest("hex");
    return `${relativePath}\0${digest}\n`;
  });
  return Object.freeze({
    file_count: entries.length,
    aggregate_sha256: createHash("sha256").update(entries.join(""), "utf8").digest("hex")
  });
}

export function assertTrack1Snapshot(
  repositoryRoot: string,
  expected: Track1SnapshotExpectation
): void {
  const actual = snapshotTrack1OwnedSurfaces(repositoryRoot);
  if (
    actual.file_count !== expected.file_count ||
    actual.aggregate_sha256 !== expected.aggregate_sha256
  ) {
    throw new Error(
      `Track 1 snapshot drifted from ${expected.baseline_commit}: ` +
        `${actual.file_count}/${actual.aggregate_sha256}`
    );
  }
}
