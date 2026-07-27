/**
 * P6 capture-candidate materialization (moved out of capture-live.ts).
 *
 * Production-neutral: validates and commits the content-free candidate package
 * from the capture staging envelope. Never imports production detectors,
 * network, evaluator, or sealer code.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import {
  assertSandboxSecurityBenchmarkAcceptedProviderOutcomes,
  assertSandboxSecurityBenchmarkCandidatePackageLayout,
  hashSandboxSecurityBenchmarkCanonicalJson,
  hashSandboxSecurityBenchmarkCandidateCassette,
  hashSandboxSecurityBenchmarkTree,
  normalizeSandboxSecurityBenchmarkCandidateCaptureManifest,
  normalizeSandboxSecurityBenchmarkCandidateCassette,
  normalizeSandboxSecurityBenchmarkCandidateDecisionEnvelope,
  normalizeSandboxSecurityBenchmarkCandidatePackage
} from "./contracts.ts";

const INVALID = "sandbox_security_capture_live_reject";
const SHA256 = /^[0-9a-f]{64}$/u;
const CAPTURE_OUTPUT_BINDING = /^(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)$/u;
export const SANDBOX_SECURITY_CANDIDATE_STAGING_FILENAME =
  ".candidate-package.json" as const;
export const SANDBOX_SECURITY_CANDIDATE_STAGING_SCHEMA_VERSION =
  "sandbox-security-benchmark-candidate-staging.v1" as const;
export const SANDBOX_SECURITY_MAX_CANDIDATE_STAGING_BYTES = 16 * 1024 * 1024;

function fail(code: string): never {
  const error = new Error(`${INVALID}:${code}`);
  error.name = INVALID;
  throw error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function hasExactOwnKeys(
  value: unknown,
  expected: readonly string[]
): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return sameStrings(actual, sortedExpected);
}

function assertRealDirectory(path: string, label: string): string {
  if (typeof path !== "string" || path.length === 0) fail(`${label}_missing`);
  if (!existsSync(path)) fail(`${label}_missing`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail(`${label}_symlink`);
  if (!stat.isDirectory()) fail(`${label}_not_directory`);
  return realpathSync(path);
}

function captureOutputBindingFromStat(
  stat: Readonly<{ dev: bigint; ino: bigint }>
): string {
  return `${stat.dev}:${stat.ino}`;
}

function assertCaptureOutputBinding(value: unknown): string {
  if (typeof value !== "string" || !CAPTURE_OUTPUT_BINDING.test(value)) {
    fail("capture_output_binding_invalid");
  }
  return value;
}

export function sandboxSecurityCandidateStagingPath(
  captureOutputRoot: string
): string {
  return join(captureOutputRoot, SANDBOX_SECURITY_CANDIDATE_STAGING_FILENAME);
}

export function materializeSandboxSecurityCandidatePackage(input: Readonly<{
  capture_output_root: string;
  capture_output_binding: string;
  fixture_ids: readonly string[];
  candidate_package_sha256: string;
}>): string {
  if (!hasExactOwnKeys(input, [
    "capture_output_root",
    "capture_output_binding",
    "fixture_ids",
    "candidate_package_sha256"
  ])) {
    fail("candidate_materialize_input_invalid");
  }
  const binding = assertCaptureOutputBinding(input.capture_output_binding);
  if (!SHA256.test(input.candidate_package_sha256)) {
    fail("candidate_package_sha256_invalid");
  }

  let captureOutputRoot: string;
  try {
    captureOutputRoot = assertRealDirectory(
      input.capture_output_root,
      "capture_output_root"
    );
  } catch {
    fail("capture_output_path_changed");
  }
  if (captureOutputRoot !== resolve(input.capture_output_root)) {
    fail("capture_output_path_changed");
  }

  const stagingPath = sandboxSecurityCandidateStagingPath(captureOutputRoot);
  let stagingStat;
  try {
    stagingStat = lstatSync(stagingPath, { bigint: true });
  } catch {
    fail("capture_output_path_changed");
  }
  if (
    stagingStat.isSymbolicLink() ||
    !stagingStat.isFile() ||
    stagingStat.nlink !== 1n ||
    captureOutputBindingFromStat(stagingStat) !== binding ||
    stagingStat.size <= 0n ||
    stagingStat.size > BigInt(SANDBOX_SECURITY_MAX_CANDIDATE_STAGING_BYTES)
  ) {
    fail("capture_output_binding_changed");
  }

  const serialized = readFileSync(stagingPath, "utf8");
  if (sha256Text(serialized) !== input.candidate_package_sha256) {
    fail("candidate_package_hash_mismatch");
  }

  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(serialized) as unknown;
  } catch {
    fail("candidate_staging_invalid");
  }
  if (!hasExactOwnKeys(rawEnvelope, [
    "schema_version",
    "capture_manifest",
    "cassette",
    "package",
    "decisions"
  ])) {
    fail("candidate_staging_invalid");
  }
  if (rawEnvelope.schema_version !== SANDBOX_SECURITY_CANDIDATE_STAGING_SCHEMA_VERSION) {
    fail("candidate_staging_schema");
  }
  if (!Array.isArray(rawEnvelope.decisions)) {
    fail("candidate_staging_decisions");
  }

  let captureManifest;
  let cassette;
  let candidatePackage;
  let decisions;
  try {
    captureManifest = normalizeSandboxSecurityBenchmarkCandidateCaptureManifest(
      rawEnvelope.capture_manifest
    );
    cassette = normalizeSandboxSecurityBenchmarkCandidateCassette(
      rawEnvelope.cassette
    );
    assertSandboxSecurityBenchmarkAcceptedProviderOutcomes(cassette);
    candidatePackage = normalizeSandboxSecurityBenchmarkCandidatePackage(
      rawEnvelope.package
    );
    decisions = rawEnvelope.decisions.map((decision) =>
      normalizeSandboxSecurityBenchmarkCandidateDecisionEnvelope(decision)
    );
  } catch {
    fail("candidate_staging_invalid");
  }

  const fixtureIds = [...input.fixture_ids];
  if (
    fixtureIds.length === 0 ||
    new Set(fixtureIds).size !== fixtureIds.length ||
    decisions.length !== fixtureIds.length ||
    cassette.inputs.length !== fixtureIds.length ||
    candidatePackage.fixture_count !== fixtureIds.length ||
    captureManifest.fixture_count !== fixtureIds.length
  ) {
    fail("candidate_staging_count_mismatch");
  }
  for (let index = 0; index < fixtureIds.length; index += 1) {
    const fixtureId = fixtureIds[index]!;
    if (
      decisions[index]!.fixture_id !== fixtureId ||
      cassette.inputs[index]!.fixture_id !== fixtureId ||
      decisions[index]!.decision_projection_sha256 !==
        cassette.inputs[index]!.decision_projection_sha256
    ) {
      fail("candidate_staging_fixture_mismatch");
    }
  }
  if (
    candidatePackage.inputs_tree_sha256 !== captureManifest.inputs_tree_sha256 ||
    candidatePackage.capture_manifest_sha256 !==
      hashSandboxSecurityBenchmarkCanonicalJson(captureManifest) ||
    candidatePackage.cassette_tree_sha256 !==
      hashSandboxSecurityBenchmarkCandidateCassette(cassette)
  ) {
    fail("candidate_staging_hash_mismatch");
  }

  const candidateRoot = join(captureOutputRoot, "candidate");
  const temporaryRoot = join(
    captureOutputRoot,
    `.candidate-${input.candidate_package_sha256}.tmp`
  );
  if (existsSync(candidateRoot) || existsSync(temporaryRoot)) {
    fail("candidate_already_exists");
  }

  let committed = false;
  try {
    mkdirSync(temporaryRoot, { mode: 0o700 });
    const decisionsRoot = join(temporaryRoot, "decisions");
    mkdirSync(decisionsRoot, { mode: 0o700 });
    writeFileSync(
      join(temporaryRoot, "capture-manifest.json"),
      `${JSON.stringify(captureManifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    writeFileSync(
      join(temporaryRoot, "cassette.json"),
      `${JSON.stringify(cassette, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    writeFileSync(
      join(temporaryRoot, "package.json"),
      `${JSON.stringify(candidatePackage, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    for (const decision of decisions) {
      writeFileSync(
        join(decisionsRoot, `${decision.fixture_id}.json`),
        `${JSON.stringify(decision)}\n`,
        { encoding: "utf8", flag: "wx", mode: 0o600 }
      );
    }
    assertSandboxSecurityBenchmarkCandidatePackageLayout(
      temporaryRoot,
      fixtureIds
    );
    if (
      hashSandboxSecurityBenchmarkTree(decisionsRoot) !==
      candidatePackage.decisions_tree_sha256
    ) {
      fail("candidate_staging_hash_mismatch");
    }
    unlinkSync(stagingPath);
    renameSync(temporaryRoot, candidateRoot);
    committed = true;
    return candidateRoot;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${INVALID}:`)) {
      throw error;
    }
    fail("candidate_materialize_failed");
  } finally {
    if (!committed) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
  return fail("candidate_materialize_failed");
}
