/**
 * P5-T4: Truth-blind input-only capture bundle preparation and parent launcher.
 *
 * Materializes inputs + exact code/read/write allowlists. The only child_process
 * owner launches the fixed capture-live.ts entrypoint under Node --permission.
 * Truth, source lock, evaluator, metrics, and inherited descriptors are rejected.
 */

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  hashSandboxSecurityBenchmarkCanonicalJson,
  hashSandboxSecurityBenchmarkTree,
  normalizeSandboxSecurityBenchmarkCandidatePackage,
  normalizeSandboxSecurityBenchmarkManifest,
  normalizeSandboxSecurityBenchmarkSourcesLock,
  type SandboxSecurityBenchmarkSha256
} from "./contracts.ts";
import { validateSandboxSecurityBenchmarkCorpus } from "./validate-corpus.ts";
import { materializeSandboxSecurityCandidatePackage } from "./capture-candidate.ts";
import {
  appendSandboxSecurityCandidateOutputFrame,
  assertSandboxSecurityCandidateStagingMatchesProgress,
  createSandboxSecurityCandidateProgressDocument,
  createSandboxSecurityCandidateOutputAcknowledgement,
  markSandboxSecurityCandidateProgressFailed,
  normalizeSandboxSecurityCandidateOutputFrame,
  type SandboxSecurityCandidateCompleteFrame,
  type SandboxSecurityCandidateOutputState
} from "./candidate-progress.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "../../..");
const FIXED_CAPTURE_LIVE_RELATIVE =
  "scripts/benchmark/sandbox-security/capture-live.ts";
const CAPTURE_CHILD_ENVIRONMENT_KEYS = [
  "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
  "SANDBOX_SECURITY_JUDGE_PROTOCOL",
  "SANDBOX_SECURITY_JUDGE_BASE_URL",
  "SANDBOX_SECURITY_JUDGE_MODEL",
  "SANDBOX_SECURITY_JUDGE_API_KEY",
  "SANDBOX_SECURITY_ENABLE_JUDGE"
] as const;
const CANDIDATE_STAGING_FILENAME = ".candidate-package.json" as const;
const CAPTURE_LAUNCH_LOCK_NAME = ".capture-launch-lock" as const;
const CAPTURE_OUTPUT_BINDING = /^(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PREPARED_CAPTURE_BUNDLES = new WeakSet<object>();

/** Fixed code trees required by capture-live + production/shared runtime. */
const FIXED_CODE_ALLOWLIST_RELATIVE: readonly string[] = Object.freeze([
  "engines/sandbox/src/security-production",
  "engines/sandbox/src/security",
  "engines/sandbox/src/base-filter",
  "engines/sandbox/src/monitoring",
  "engines/sandbox/src/simulated-tools",
  "shared/constants",
  "shared/contracts",
  "shared/types",
  "shared/utils",
  "shared/index.ts",
  "scripts/benchmark/sandbox-security/contracts.ts",
  "scripts/benchmark/sandbox-security/capture-sink.ts",
  "scripts/benchmark/sandbox-security/capture-candidate.ts",
  "scripts/benchmark/sandbox-security/candidate-progress.ts",
  FIXED_CAPTURE_LIVE_RELATIVE
]);

const FORBIDDEN_BUNDLE_NAME_RE =
  /(?:^|[/\\])(truth|sources\.lock\.json|reviews|request-ids|evaluate\.ts|seal\.ts|capture\.json|replay)(?:$|[/\\])/iu;

export interface SandboxSecurityCaptureBundle {
  readonly root: string;
  readonly input_root: string;
  readonly capture_output_root: string;
  readonly fixture_ids: readonly string[];
  readonly inputs_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly code_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly code_allowlist: readonly string[];
  readonly read_allowlist: readonly string[];
  readonly write_allowlist: readonly string[];
  readonly capture_live_entrypoint: string;
  readonly repository_root: string;
}

export interface SandboxSecurityCaptureChildCommand {
  readonly entrypoint: string;
  readonly args: readonly string[];
  readonly allow_fs_read: readonly string[];
  readonly allow_fs_write: readonly string[];
  readonly allow_child_process: false;
  readonly allow_worker: false;
  readonly exec_path: string;
  readonly cwd: string;
}

export interface SandboxSecurityCaptureChildResult {
  readonly exit_code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly candidate_root?: string;
  readonly candidate_package_sha256?: string;
}

function fail(code: string): never {
  throw new Error(code);
}

export const SANDBOX_SECURITY_PREPARED_BUNDLE_DESCRIPTOR_SCHEMA_VERSION =
  "sandbox-security-prepared-bundle-descriptor.v1" as const;

export interface SandboxSecurityPreparedBundleDescriptor {
  readonly schema_version: typeof SANDBOX_SECURITY_PREPARED_BUNDLE_DESCRIPTOR_SCHEMA_VERSION;
  readonly bundle_root: string;
  readonly input_root: string;
  readonly capture_output_root: string;
  readonly inputs_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly code_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly fixture_count: number;
  readonly fixture_ids: readonly string[];
}

const PREPARED_BUNDLE_DESCRIPTOR_FIXTURE_ID_RE = /^ssb-v1-\d{4}$/u;

function dataPropertyValue(
  source: object,
  key: string,
  code: string
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  ) {
    fail(code);
  }
  return descriptor.value;
}

function assertAbsoluteDescriptorPath(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    value.includes("\0") ||
    !isAbsolute(value)
  ) {
    fail(code);
  }
  return value;
}

/**
 * Produces the exact serializable prepared-bundle descriptor passed from the
 * prepare worker to the credentialed capture worker. Uses only own enumerable
 * data properties so a getter-bearing input cannot forge fields. The capture
 * worker revalidates code/input tree hashes against disk before launch.
 */
export function normalizeSandboxSecurityPreparedBundleDescriptor(
  input: unknown
): Readonly<SandboxSecurityPreparedBundleDescriptor> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    fail("capture_bundle_reject:prepared_bundle_descriptor_invalid");
  }
  const code = "capture_bundle_reject:prepared_bundle_descriptor_invalid";
  const source = input as Record<string, unknown>;

  const rawSchemaVersion =
    Object.getOwnPropertyDescriptor(source, "schema_version") === undefined
      ? SANDBOX_SECURITY_PREPARED_BUNDLE_DESCRIPTOR_SCHEMA_VERSION
      : dataPropertyValue(source, "schema_version", code);
  if (
    rawSchemaVersion !==
    SANDBOX_SECURITY_PREPARED_BUNDLE_DESCRIPTOR_SCHEMA_VERSION
  ) {
    fail(code);
  }

  const bundleRoot = assertAbsoluteDescriptorPath(
    dataPropertyValue(source, "root" in source ? "root" : "bundle_root", code),
    code
  );
  const inputRoot = assertAbsoluteDescriptorPath(
    dataPropertyValue(source, "input_root", code),
    code
  );
  const captureOutputRoot = assertAbsoluteDescriptorPath(
    dataPropertyValue(source, "capture_output_root", code),
    code
  );
  const inputsTreeSha256 = dataPropertyValue(source, "inputs_tree_sha256", code);
  const codeTreeSha256 = dataPropertyValue(source, "code_tree_sha256", code);
  if (
    typeof inputsTreeSha256 !== "string" ||
    !SHA256.test(inputsTreeSha256) ||
    typeof codeTreeSha256 !== "string" ||
    !SHA256.test(codeTreeSha256)
  ) {
    fail(code);
  }

  const rawFixtureIds = dataPropertyValue(source, "fixture_ids", code);
  if (!Array.isArray(rawFixtureIds) || rawFixtureIds.length === 0) fail(code);
  const fixtureIds: string[] = [];
  for (let index = 0; index < rawFixtureIds.length; index += 1) {
    const fixtureId = dataPropertyValue(rawFixtureIds, String(index), code);
    if (
      typeof fixtureId !== "string" ||
      !PREPARED_BUNDLE_DESCRIPTOR_FIXTURE_ID_RE.test(fixtureId)
    ) {
      fail(code);
    }
    fixtureIds.push(fixtureId);
  }
  if (new Set(fixtureIds).size !== fixtureIds.length) fail(code);

  const rawFixtureCount =
    Object.getOwnPropertyDescriptor(source, "fixture_count") === undefined
      ? fixtureIds.length
      : dataPropertyValue(source, "fixture_count", code);
  if (rawFixtureCount !== fixtureIds.length) fail(code);

  return Object.freeze({
    schema_version: SANDBOX_SECURITY_PREPARED_BUNDLE_DESCRIPTOR_SCHEMA_VERSION,
    bundle_root: bundleRoot,
    input_root: inputRoot,
    capture_output_root: captureOutputRoot,
    inputs_tree_sha256: inputsTreeSha256 as SandboxSecurityBenchmarkSha256,
    code_tree_sha256: codeTreeSha256 as SandboxSecurityBenchmarkSha256,
    fixture_count: fixtureIds.length,
    fixture_ids: Object.freeze([...fixtureIds])
  });
}

function safeCliErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.length <= 160 &&
    /^(?:capture_bundle_(?:invalid|reject)|corpus_validation_failed):[a-z0-9_]+$/u.test(
      message
    )
    ? message
    : "capture_bundle_reject:internal";
}

export function sanitizeSandboxSecurityCaptureChildStderr(
  stderr: string
): string {
  void stderr;
  return "capture_bundle_reject:capture_child_failed";
}

function assertAbsolutePath(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    fail(`capture_bundle_invalid:${label}`);
  }
  if (!isAbsolute(value)) {
    fail(`capture_bundle_invalid:${label}_not_absolute`);
  }
  return value;
}

function assertRealDirectory(path: string, label: string): string {
  const absolute = assertAbsolutePath(path, label);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    fail(`capture_bundle_invalid:${label}_missing`);
  }
  if (stat.isSymbolicLink()) {
    fail(`capture_bundle_reject:symlink_${label}`);
  }
  if (!stat.isDirectory()) {
    fail(`capture_bundle_invalid:${label}_not_directory`);
  }
  return realpathSync(absolute);
}

function assertRealFile(path: string, label: string): string {
  const absolute = assertAbsolutePath(path, label);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    fail(`capture_bundle_invalid:${label}_missing`);
  }
  if (stat.isSymbolicLink()) {
    fail(`capture_bundle_reject:symlink_${label}`);
  }
  if (!stat.isFile()) {
    fail(`capture_bundle_invalid:${label}_not_file`);
  }
  return realpathSync(absolute);
}

function isPathInside(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function captureOutputBindingFromStat(
  stat: Readonly<{ dev: bigint; ino: bigint }>
): string {
  return `${stat.dev}:${stat.ino}`;
}

function assertCaptureOutputBinding(value: string): string {
  if (!CAPTURE_OUTPUT_BINDING.test(value)) {
    fail("capture_bundle_invalid:capture_output_binding");
  }
  return value;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function candidateStagingPath(captureOutputRoot: string): string {
  return join(captureOutputRoot, CANDIDATE_STAGING_FILENAME);
}

export function writeSandboxSecurityCandidateFileAtomic(input: Readonly<{
  capture_output_root: string;
  serialized: string;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(",") !== "capture_output_root,serialized"
  ) {
    fail("capture_bundle_reject:candidate_atomic_input_invalid");
  }
  const captureOutputRoot = assertRealDirectory(
    input.capture_output_root,
    "capture_output_root"
  );
  if (captureOutputRoot !== resolve(input.capture_output_root)) {
    fail("capture_bundle_reject:candidate_atomic_path_changed");
  }
  if (
    typeof input.serialized !== "string" ||
    input.serialized.length === 0 ||
    Buffer.byteLength(input.serialized, "utf8") > 16 * 1024 * 1024
  ) {
    fail("capture_bundle_reject:candidate_atomic_size_invalid");
  }
  try {
    JSON.parse(input.serialized) as unknown;
  } catch {
    fail("capture_bundle_reject:candidate_atomic_json_invalid");
  }

  const target = candidateStagingPath(captureOutputRoot);
  let targetStat;
  try {
    targetStat = lstatSync(target, { bigint: true });
  } catch {
    fail("capture_bundle_reject:candidate_staging_invalid");
  }
  if (
    targetStat.isSymbolicLink() ||
    !targetStat.isFile() ||
    targetStat.nlink !== 1n
  ) {
    fail("capture_bundle_reject:candidate_staging_invalid");
  }

  const temporaryPath = join(
    captureOutputRoot,
    `.${CANDIDATE_STAGING_FILENAME}.${randomUUID()}.tmp`
  );
  let temporaryFd: number | undefined;
  let renamed = false;
  try {
    temporaryFd = openSync(
      temporaryPath,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600
    );
    writeFileSync(temporaryFd, input.serialized, { encoding: "utf8" });
    fsyncSync(temporaryFd);
    closeSync(temporaryFd);
    temporaryFd = undefined;
    renameSync(temporaryPath, target);
    renamed = true;

    const directoryFd = openSync(captureOutputRoot, fsConstants.O_RDONLY);
    try {
      fsyncSync(directoryFd);
    } finally {
      closeSync(directoryFd);
    }
  } catch {
    if (temporaryFd !== undefined) {
      try {
        closeSync(temporaryFd);
      } catch {
        // Preserve the atomic-write failure.
      }
    }
    if (!renamed) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // The temporary file may not have been created.
      }
    }
    fail("capture_bundle_reject:candidate_atomic_write_failed");
  }
}

export function consumeSandboxSecurityCaptureOutputLines(
  lines: readonly string[],
  consumeLine: (line: string) => boolean
): void {
  for (const line of lines) {
    if (!consumeLine(line)) break;
  }
}


function prepareCandidateStagingFile(captureOutputRoot: string): Readonly<{
  path: string;
  binding: string;
}> {
  const path = candidateStagingPath(captureOutputRoot);
  try {
    writeFileSync(path, "", { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch {
    fail("capture_bundle_reject:candidate_staging_already_exists");
  }
  const stat = lstatSync(path, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== 0n || stat.nlink !== 1n) {
    fail("capture_bundle_reject:candidate_staging_invalid");
  }
  return Object.freeze({
    path: realpathSync(path),
    binding: captureOutputBindingFromStat(stat)
  });
}

function resolveCodeAllowlist(): readonly string[] {
  const resolved: string[] = [];
  for (const relativePath of FIXED_CODE_ALLOWLIST_RELATIVE) {
    const absolute = resolve(REPOSITORY_ROOT, relativePath);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch {
      // capture-live.ts is intentionally absent until P6-T2; keep the fixed
      // path in the allowlist so the launcher remains stable.
      if (relativePath === FIXED_CAPTURE_LIVE_RELATIVE) {
        resolved.push(absolute);
        continue;
      }
      fail(`capture_bundle_invalid:code_allowlist_missing:${relativePath}`);
    }
    if (stat.isSymbolicLink()) {
      fail(`capture_bundle_reject:symlink_code_allowlist:${relativePath}`);
    }
    resolved.push(stat.isDirectory() || stat.isFile() ? realpathSync(absolute) : absolute);
  }
  return Object.freeze(resolved);
}

function materializeCodeMirror(
  bundleRoot: string,
  codeAllowlist: readonly string[]
): readonly string[] {
  const mirrored: string[] = [];
  const codeRoot = join(bundleRoot, "code");
  mkdirSync(codeRoot, { recursive: true });

  for (const sourcePath of codeAllowlist) {
    const relativePath = relative(REPOSITORY_ROOT, sourcePath);
    if (
      relativePath.startsWith(`..${sep}`) ||
      relativePath === ".." ||
      isAbsolute(relativePath)
    ) {
      // Fixed capture-live may not exist yet; still reserve the relative slot.
      if (sourcePath.endsWith(`${sep}${FIXED_CAPTURE_LIVE_RELATIVE}`) ||
        sourcePath.endsWith(`/${FIXED_CAPTURE_LIVE_RELATIVE}`) ||
        basename(sourcePath) === "capture-live.ts") {
        const target = join(codeRoot, FIXED_CAPTURE_LIVE_RELATIVE);
        mkdirSync(dirname(target), { recursive: true });
        if (existsSync(sourcePath) && lstatSync(sourcePath).isFile()) {
          copyFileSync(sourcePath, target);
        }
        mirrored.push(target);
        continue;
      }
      fail("capture_bundle_invalid:code_allowlist_outside_repository");
    }

    const target = join(codeRoot, relativePath);
    if (!existsSync(sourcePath)) {
      if (relativePath === FIXED_CAPTURE_LIVE_RELATIVE) {
        mkdirSync(dirname(target), { recursive: true });
        mirrored.push(target);
        continue;
      }
      fail(`capture_bundle_invalid:code_source_missing:${relativePath}`);
    }

    const stat = lstatSync(sourcePath);
    if (stat.isSymbolicLink()) {
      fail(`capture_bundle_reject:symlink_code_source:${relativePath}`);
    }
    if (stat.isDirectory()) {
      mkdirSync(dirname(target), { recursive: true });
      cpSync(sourcePath, target, {
        recursive: true,
        verbatimSymlinks: true,
        filter: (src) => {
          try {
            return !lstatSync(src).isSymbolicLink();
          } catch {
            return false;
          }
        }
      });
    } else if (stat.isFile()) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(sourcePath, target);
    } else {
      fail(`capture_bundle_invalid:code_source_type:${relativePath}`);
    }
    mirrored.push(realpathSync(target));
  }

  return Object.freeze(mirrored);
}

function parseManifestFixtureIds(corpusRoot: string): readonly string[] {
  const raw = JSON.parse(
    readFileSync(join(corpusRoot, "manifest.json"), "utf8")
  ) as unknown;
  const manifest = normalizeSandboxSecurityBenchmarkManifest(raw);
  return manifest.fixture_ids;
}

function copyInputEnvelopes(
  corpusRoot: string,
  inputRoot: string,
  fixtureIds: readonly string[]
): void {
  mkdirSync(inputRoot, { recursive: true });
  for (const fixtureId of fixtureIds) {
    if (!/^ssb-v1-\d{4}$/u.test(fixtureId)) {
      fail(`capture_bundle_invalid:fixture_id:${fixtureId}`);
    }
    const source = join(corpusRoot, "inputs", `${fixtureId}.json`);
    const target = join(inputRoot, `${fixtureId}.json`);
    const sourceReal = assertRealFile(source, "input_source");
    // Refuse to copy anything that is not a plain file under inputs/.
    if (!isPathInside(resolve(corpusRoot, "inputs"), sourceReal)) {
      fail("capture_bundle_reject:input_outside_inputs_tree");
    }
    copyFileSync(sourceReal, target);
  }
}

function assertBundleHasNoForbiddenArtifacts(bundleRoot: string): void {
  const stack = [bundleRoot];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const rel = relative(bundleRoot, full).split(sep).join("/");
      if (FORBIDDEN_BUNDLE_NAME_RE.test(rel)) {
        fail(`capture_bundle_reject:forbidden_artifact:${rel}`);
      }
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        fail(`capture_bundle_reject:symlink_in_bundle:${rel}`);
      }
      if (stat.isDirectory()) {
        // Skip deep traversal of mirrored code for forbidden names that are
        // legitimate production identifiers (e.g. none of the forbidden roots).
        if (rel === "code" || rel.startsWith("code/")) {
          // Still ensure no truth/ directory was mirrored.
          if (name === "truth" || name === "reviews" || name === "request-ids") {
            fail(`capture_bundle_reject:forbidden_artifact:${rel}`);
          }
          stack.push(full);
          continue;
        }
        stack.push(full);
      }
    }
  }
}

export async function prepareSandboxSecurityCaptureBundle(input: Readonly<{
  corpus_root: string;
  output_root: string;
}>): Promise<Readonly<SandboxSecurityCaptureBundle>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("capture_bundle_invalid:input");
  }
  const keys = Object.keys(input).sort();
  if (keys.join(",") !== "corpus_root,output_root") {
    fail("capture_bundle_reject:unsupported_prepare_argument");
  }

  const corpusRoot = assertRealDirectory(input.corpus_root, "corpus_root");
  const outputRootParent = assertRealDirectory(input.output_root, "output_root");

  // Refuse to place the bundle on a symlink root or outside the provided root.
  const bundleRoot = resolve(outputRootParent, "capture-bundle");
  if (!isPathInside(outputRootParent, bundleRoot)) {
    fail("capture_bundle_reject:output_path_escape");
  }
  try {
    mkdirSync(bundleRoot, { mode: 0o700 });
  } catch {
    fail("capture_bundle_reject:bundle_already_exists");
  }

  const sourcesLockPath = join(corpusRoot, "sources.lock.json");
  let sourcesLock;
  try {
    sourcesLock = normalizeSandboxSecurityBenchmarkSourcesLock(
      JSON.parse(readFileSync(sourcesLockPath, "utf8")) as unknown
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("capture_bundle_")) {
      throw error;
    }
    fail("corpus_validation_failed:sources_lock_invalid");
  }
  try {
    validateSandboxSecurityBenchmarkCorpus({
      corpus_root: corpusRoot,
      sources_lock: sourcesLock
    });
  } catch (error) {
    if (error instanceof Error && /^corpus_validation_failed:/u.test(error.message)) {
      throw error;
    }
    fail(
      error instanceof Error && error.message.startsWith("capture_bundle_")
        ? error.message
        : "corpus_validation_failed:invalid_corpus"
    );
  }

  const fixtureIds = parseManifestFixtureIds(corpusRoot);
  const inputRoot = join(bundleRoot, "inputs");
  const captureOutputRoot = join(bundleRoot, "capture-output");
  mkdirSync(captureOutputRoot, { recursive: true });
  copyInputEnvelopes(corpusRoot, inputRoot, fixtureIds);

  const codeAllowlist = resolveCodeAllowlist();
  materializeCodeMirror(bundleRoot, codeAllowlist);
  assertBundleHasNoForbiddenArtifacts(bundleRoot);

  const inputsTreeSha256 = hashSandboxSecurityBenchmarkTree(inputRoot);
  // Integrity: copied inputs must match the committed corpus inputs tree.
  const corpusInputsTree = hashSandboxSecurityBenchmarkTree(
    join(corpusRoot, "inputs")
  );
  if (inputsTreeSha256 !== corpusInputsTree) {
    fail("capture_bundle_invalid:inputs_tree_hash_mismatch");
  }

  const bundleReal = realpathSync(bundleRoot);
  const inputReal = realpathSync(inputRoot);
  const captureReal = realpathSync(captureOutputRoot);

  // Read allowlist: inputs + immutable code mirror only.
  // capture_output_root is write-only so parent-planted symlinks cannot be
  // followed as a read path into oracle material.
  const codeMirrorRoot = realpathSync(join(bundleRoot, "code"));
  const codeTreeSha256 = hashSandboxSecurityBenchmarkTree(codeMirrorRoot);
  const captureLiveEntrypoint = realpathSync(
    join(codeMirrorRoot, FIXED_CAPTURE_LIVE_RELATIVE)
  );
  const readAllowlist = Object.freeze(
    Array.from(
      new Set<string>([
        inputReal,
        codeMirrorRoot
      ])
    ).sort()
  );

  for (const path of readAllowlist) {
    if (FORBIDDEN_BUNDLE_NAME_RE.test(path) && !path.includes(`${sep}code${sep}`)) {
      // Defensive: never grant corpus truth/reviews paths.
      if (
        path.includes(`${sep}truth${sep}`) ||
        path.endsWith(`${sep}truth`) ||
        path.includes(`${sep}reviews${sep}`) ||
        path.includes(`sources.lock.json`)
      ) {
        fail(`capture_bundle_reject:read_allowlist_forbidden:${path}`);
      }
    }
  }

  const candidateStaging = prepareCandidateStagingFile(captureReal);
  const writeAllowlist = Object.freeze([candidateStaging.path]);

  const bundle = Object.freeze({
    root: bundleReal,
    input_root: inputReal,
    capture_output_root: captureReal,
    fixture_ids: Object.freeze([...fixtureIds]),
    inputs_tree_sha256: inputsTreeSha256,
    code_tree_sha256: codeTreeSha256,
    code_allowlist: Object.freeze([...codeAllowlist]),
    read_allowlist: readAllowlist,
    write_allowlist: writeAllowlist,
    capture_live_entrypoint: captureLiveEntrypoint,
    repository_root: REPOSITORY_ROOT
  });
  PREPARED_CAPTURE_BUNDLES.add(bundle);
  return bundle;
}

/**
 * Reconstructs and revalidates a prepared bundle from its serializable
 * descriptor inside the separate credentialed capture worker. Every path and
 * tree hash is rechecked against disk; the returned bundle is registered so the
 * fixed child command can only launch a bundle whose code/input trees still
 * match what the prepare worker committed.
 */
export function reconstructSandboxSecurityCaptureBundleFromDescriptor(
  descriptorInput: unknown
): Readonly<SandboxSecurityCaptureBundle> {
  const descriptor =
    normalizeSandboxSecurityPreparedBundleDescriptor(descriptorInput);
  const bundleRoot = assertRealDirectory(descriptor.bundle_root, "bundle_root");
  const inputRoot = assertRealDirectory(descriptor.input_root, "input_root");
  const captureOutputRoot = assertRealDirectory(
    descriptor.capture_output_root,
    "capture_output_root"
  );
  if (
    bundleRoot !== descriptor.bundle_root ||
    inputRoot !== join(bundleRoot, "inputs") ||
    captureOutputRoot !== join(bundleRoot, "capture-output")
  ) {
    fail("capture_bundle_reject:descriptor_layout_invalid");
  }

  const codeMirrorRoot = assertRealDirectory(
    join(bundleRoot, "code"),
    "code_root"
  );
  if (hashSandboxSecurityBenchmarkTree(codeMirrorRoot) !== descriptor.code_tree_sha256) {
    fail("capture_bundle_reject:code_tree_hash_changed");
  }
  if (hashSandboxSecurityBenchmarkTree(inputRoot) !== descriptor.inputs_tree_sha256) {
    fail("capture_bundle_reject:inputs_tree_hash_changed");
  }
  assertBundleHasNoForbiddenArtifacts(bundleRoot);

  const captureLiveEntrypoint = realpathSync(
    join(codeMirrorRoot, FIXED_CAPTURE_LIVE_RELATIVE)
  );
  const readAllowlist = Object.freeze(
    Array.from(new Set<string>([inputRoot, codeMirrorRoot])).sort()
  );
  const stagingPath = candidateStagingPath(captureOutputRoot);
  const stagingStat = lstatSync(stagingPath, { bigint: true });
  if (
    stagingStat.isSymbolicLink() ||
    !stagingStat.isFile() ||
    stagingStat.size !== 0n ||
    stagingStat.nlink !== 1n
  ) {
    fail("capture_bundle_reject:candidate_staging_invalid");
  }
  const writeAllowlist = Object.freeze([realpathSync(stagingPath)]);

  const bundle = Object.freeze({
    root: bundleRoot,
    input_root: inputRoot,
    capture_output_root: captureOutputRoot,
    fixture_ids: Object.freeze([...descriptor.fixture_ids]),
    inputs_tree_sha256: descriptor.inputs_tree_sha256,
    code_tree_sha256: descriptor.code_tree_sha256,
    code_allowlist: resolveCodeAllowlist(),
    read_allowlist: readAllowlist,
    write_allowlist: writeAllowlist,
    capture_live_entrypoint: captureLiveEntrypoint,
    repository_root: REPOSITORY_ROOT
  });
  PREPARED_CAPTURE_BUNDLES.add(bundle);
  return bundle;
}

export function buildSandboxSecurityCaptureChildCommand(
  bundle: Readonly<SandboxSecurityCaptureBundle>
): Readonly<SandboxSecurityCaptureChildCommand> {
  if (bundle === null || typeof bundle !== "object") {
    fail("capture_bundle_invalid:bundle");
  }
  if (!PREPARED_CAPTURE_BUNDLES.has(bundle as object)) {
    fail("capture_bundle_reject:prepared_bundle_authority_invalid");
  }
  const bundleRoot = assertRealDirectory(bundle.root, "bundle_root");
  const inputRoot = assertRealDirectory(bundle.input_root, "input_root");
  const captureOutputRoot = assertRealDirectory(
    bundle.capture_output_root,
    "capture_output_root"
  );
  const codeRoot = assertRealDirectory(join(bundleRoot, "code"), "code_root");
  if (
    !SHA256.test(bundle.code_tree_sha256) ||
    hashSandboxSecurityBenchmarkTree(codeRoot) !== bundle.code_tree_sha256
  ) {
    fail("capture_bundle_reject:code_tree_hash_changed");
  }
  if (
    inputRoot !== join(bundleRoot, "inputs") ||
    captureOutputRoot !== join(bundleRoot, "capture-output")
  ) {
    fail("capture_bundle_reject:bundle_path_revalidation");
  }

  const entrypoint = bundle.capture_live_entrypoint;
  if (
    typeof entrypoint !== "string" ||
    (
      !entrypoint.endsWith(`${sep}capture-live.ts`) &&
      !entrypoint.endsWith("/capture-live.ts")
    )
  ) {
    fail("capture_bundle_reject:entrypoint_not_capture_live");
  }
  const expectedEntrypoint = resolve(
    bundleRoot,
    "code",
    FIXED_CAPTURE_LIVE_RELATIVE
  );
  if (entrypoint !== expectedEntrypoint) {
    fail("capture_bundle_reject:entrypoint_not_fixed");
  }
  const entrypointStat = lstatSync(entrypoint);
  if (entrypointStat.isSymbolicLink() || !entrypointStat.isFile()) {
    fail("capture_bundle_reject:entrypoint_invalid");
  }

  const allowFsRead = [...bundle.read_allowlist];
  const allowFsWrite = [...bundle.write_allowlist];
  if (
    allowFsRead.length !== 2 ||
    !allowFsRead.includes(inputRoot) ||
    !allowFsRead.includes(codeRoot)
  ) {
    fail("capture_bundle_reject:read_allowlist_revalidation");
  }
  const candidateStagingPathValue = candidateStagingPath(captureOutputRoot);
  if (allowFsWrite.length !== 1 || allowFsWrite[0] !== candidateStagingPathValue) {
    fail("capture_bundle_reject:write_allowlist_revalidation");
  }
  const stagingStat = lstatSync(candidateStagingPathValue, { bigint: true });
  if (
    stagingStat.isSymbolicLink() ||
    !stagingStat.isFile() ||
    stagingStat.size !== 0n ||
    stagingStat.nlink !== 1n
  ) {
    fail("capture_bundle_reject:candidate_staging_invalid");
  }
  const captureOutputBinding = assertCaptureOutputBinding(
    captureOutputBindingFromStat(stagingStat)
  );

  for (const path of allowFsRead) {
    if (
      path.includes(`${sep}truth${sep}`) ||
      path.endsWith(`${sep}truth`) ||
      /sources\.lock\.json$/u.test(path) ||
      path.includes(`${sep}reviews${sep}`) ||
      path.includes(`${sep}request-ids${sep}`)
    ) {
      fail("capture_bundle_reject:read_allowlist_contains_oracle");
    }
  }
  for (const path of allowFsWrite) {
    if (
      path !== candidateStagingPathValue
    ) {
      fail("capture_bundle_reject:write_allowlist_escape");
    }
  }

  const args = Object.freeze([
    "--experimental-strip-types",
    "--permission",
    ...allowFsRead.map((path) => `--allow-fs-read=${path}`),
    ...allowFsWrite.map((path) => `--allow-fs-write=${path}`),
    entrypoint,
    `--bundle-root=${bundle.root}`,
    `--input-root=${bundle.input_root}`,
    `--capture-output=${bundle.capture_output_root}`,
    `--capture-output-binding=${captureOutputBinding}`,
    `--inputs-tree-sha256=${bundle.inputs_tree_sha256}`
  ]);

  const joined = args.join(" ");
  if (/(?:^|[\s=])(?:truth|evaluate|metrics|OPENAI_API_KEY|SANDBOX_SECURITY_JUDGE_API_KEY)(?:$|[\s=/])/iu.test(joined)) {
    fail("capture_bundle_reject:command_contains_forbidden_token");
  }

  return Object.freeze({
    entrypoint,
    args,
    allow_fs_read: Object.freeze(allowFsRead),
    allow_fs_write: Object.freeze(allowFsWrite),
    allow_child_process: false,
    allow_worker: false,
    exec_path: process.execPath,
    cwd: bundle.root
  });
}

export function selectSandboxSecurityCaptureChildEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Readonly<Record<string, string>> {
  const selected: Record<string, string> = {};
  for (const key of CAPTURE_CHILD_ENVIRONMENT_KEYS) {
    const value = environment[key];
    if (typeof value === "string" && value.length > 0) {
      selected[key] = value;
    }
  }
  return Object.freeze(selected);
}

export async function launchSandboxSecurityCaptureChild(input: Readonly<{
  bundle: Readonly<SandboxSecurityCaptureBundle>;
}>): Promise<Readonly<SandboxSecurityCaptureChildResult>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("capture_bundle_reject:launch_input_invalid");
  }
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "bundle") {
    if (keys.includes("inherited_fd") || keys.includes("fd")) {
      fail("capture_bundle_reject:inherited_descriptor");
    }
    if (keys.includes("truth_path") || keys.includes("truth")) {
      fail("capture_bundle_reject:truth_argument");
    }
    fail("capture_bundle_reject:unsupported_launch_argument");
  }
  if ("inherited_fd" in input || "truth_path" in input) {
    fail("capture_bundle_reject:unsupported_launch_argument");
  }

  const command = buildSandboxSecurityCaptureChildCommand(input.bundle);
  const launchLock = join(input.bundle.capture_output_root, CAPTURE_LAUNCH_LOCK_NAME);
  try {
    mkdirSync(launchLock, { mode: 0o700 });
  } catch {
    fail("capture_bundle_reject:capture_in_progress");
  }

  try {
  let progress = createSandboxSecurityCandidateProgressDocument(
    input.bundle.fixture_ids
  );
  writeSandboxSecurityCandidateFileAtomic({
    capture_output_root: input.bundle.capture_output_root,
    serialized: `${JSON.stringify(progress)}\n`
  });

  let outputState: SandboxSecurityCandidateOutputState = Object.freeze({
    progress
  });
  let completeFrame: SandboxSecurityCandidateCompleteFrame | undefined;
  let protocolFailure: string | undefined;
  const childResult = await new Promise<Readonly<SandboxSecurityCaptureChildResult>>((resolvePromise) => {
    const child = spawn(command.exec_path, [...command.args], {
      cwd: command.cwd,
      env: selectSandboxSecurityCaptureChildEnvironment(process.env),
      stdio: ["pipe", "pipe", "pipe"],
      // Never pass custom uid/gid or detached with inherited sockets.
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let pending = "";
    let childKilled = false;

    const rejectProtocol = (code: string): void => {
      if (protocolFailure !== undefined) return;
      protocolFailure = code;
      if (!childKilled) {
        childKilled = true;
        child.kill("SIGKILL");
      }
    };

    const acknowledgeFrame = (
      frame: Readonly<
        ReturnType<typeof normalizeSandboxSecurityCandidateOutputFrame>
      >
    ): void => {
      if (protocolFailure !== undefined) return;
      try {
        if (child.stdin === null || !child.stdin.writable) {
          throw new Error("candidate_output_ack_pipe_closed");
        }
        child.stdin.write(
          `${JSON.stringify(createSandboxSecurityCandidateOutputAcknowledgement(frame))}\n`,
          "utf8"
        );
        if (frame.event === "capture_complete") {
          child.stdin.end();
        }
      } catch {
        rejectProtocol("capture_bundle_reject:capture_output_ack_failed");
      }
    };

    const consumeLine = (line: string): boolean => {
      if (protocolFailure !== undefined) return false;
      if (line.length === 0) return true;
      let raw: unknown;
      try {
        raw = JSON.parse(line) as unknown;
      } catch {
        rejectProtocol("capture_bundle_reject:capture_child_protocol_invalid");
        return false;
      }
      let frame;
      try {
        frame = normalizeSandboxSecurityCandidateOutputFrame(
          raw,
          input.bundle.fixture_ids
        );
      } catch {
        rejectProtocol("capture_bundle_reject:capture_child_protocol_invalid");
        return false;
      }
      try {
        const nextState = appendSandboxSecurityCandidateOutputFrame(
          outputState,
          frame,
          input.bundle.fixture_ids
        );
        if (frame.event === "candidate_progress") {
          writeSandboxSecurityCandidateFileAtomic({
            capture_output_root: input.bundle.capture_output_root,
            serialized: `${JSON.stringify(nextState.progress)}\n`
          });
        } else {
          if (
            sha256Text(frame.staging_serialized) !==
            frame.candidate_package_sha256
          ) {
            throw new TypeError("candidate_package_hash_mismatch");
          }
          assertSandboxSecurityCandidateStagingMatchesProgress(
            frame.staging_serialized,
            nextState.progress,
            input.bundle.fixture_ids
          );
          writeSandboxSecurityCandidateFileAtomic({
            capture_output_root: input.bundle.capture_output_root,
            serialized: frame.staging_serialized
          });
        }
        outputState = nextState;
        progress = nextState.progress;
        completeFrame = nextState.complete_frame;
        acknowledgeFrame(frame);
        return protocolFailure === undefined;
      } catch (error) {
        if (error instanceof Error && error.message.includes("candidate_package_hash_mismatch")) {
          rejectProtocol("capture_bundle_reject:candidate_package_hash_mismatch");
        } else if (
          error instanceof Error &&
          error.message.startsWith("sandbox_security_candidate_progress_invalid:")
        ) {
          rejectProtocol("capture_bundle_reject:capture_child_protocol_invalid");
        } else {
          rejectProtocol("capture_bundle_reject:capture_progress_write_failed");
        }
        return false;
      }
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (protocolFailure !== undefined) return;
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > 32 * 1024 * 1024) {
        rejectProtocol("capture_bundle_reject:capture_child_output_too_large");
        return;
      }
      pending += chunk;
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? "";
      consumeSandboxSecurityCaptureOutputLines(lines, consumeLine);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", () => {
      rejectProtocol("capture_bundle_reject:capture_child_failed");
    });
    child.on("close", (code) => {
      if (protocolFailure === undefined && pending.trim().length > 0) {
        consumeLine(pending.trim());
      }
      resolvePromise(
        Object.freeze({
          exit_code: protocolFailure === undefined ? code ?? 1 : 1,
          stdout,
          stderr
        })
      );
    });
  });

  let candidateRoot: string | undefined;
  let candidatePackageSha256: string | undefined;
  if (childResult.exit_code !== 0 || protocolFailure !== undefined) {
    const failureCode =
      protocolFailure ?? sanitizeSandboxSecurityCaptureChildStderr(childResult.stderr);
    const failed = markSandboxSecurityCandidateProgressFailed(
      progress,
      failureCode,
      input.bundle.fixture_ids
    );
    writeSandboxSecurityCandidateFileAtomic({
      capture_output_root: input.bundle.capture_output_root,
      serialized: `${JSON.stringify(failed)}\n`
    });
  } else {
    try {
      if (completeFrame === undefined) {
        fail("capture_bundle_reject:capture_child_summary_missing");
      }
      if (progress.completed_count !== input.bundle.fixture_ids.length) {
        fail("capture_bundle_reject:capture_progress_count_mismatch");
      }
      if (
        sha256Text(completeFrame.staging_serialized) !==
        completeFrame.candidate_package_sha256
      ) {
        fail("capture_bundle_reject:candidate_package_hash_mismatch");
      }
      assertSandboxSecurityCandidateStagingMatchesProgress(
        completeFrame.staging_serialized,
        progress,
        input.bundle.fixture_ids
      );
      const stagingPath = candidateStagingPath(input.bundle.capture_output_root);
      const stagingStat = lstatSync(stagingPath, { bigint: true });
      if (
        stagingStat.isSymbolicLink() ||
        !stagingStat.isFile() ||
        stagingStat.nlink !== 1n
      ) {
        fail("capture_bundle_reject:candidate_staging_invalid");
      }
      const captureOutputBinding = assertCaptureOutputBinding(
        captureOutputBindingFromStat(stagingStat)
      );
      candidateRoot = materializeSandboxSecurityCandidatePackage({
        capture_output_root: input.bundle.capture_output_root,
        capture_output_binding: captureOutputBinding,
        fixture_ids: input.bundle.fixture_ids,
        candidate_package_sha256: completeFrame.candidate_package_sha256
      });
      candidatePackageSha256 = completeFrame.candidate_package_sha256;
    } catch (error) {
      const failed = markSandboxSecurityCandidateProgressFailed(
        progress,
        "capture_bundle_reject:candidate_staging_invalid",
        input.bundle.fixture_ids
      );
      try {
        writeSandboxSecurityCandidateFileAtomic({
          capture_output_root: input.bundle.capture_output_root,
          serialized: `${JSON.stringify(failed)}\n`
        });
      } catch {
        // Preserve the original fail-closed candidate error.
      }
      throw error;
    }
  }

  return Object.freeze({
    ...childResult,
    ...(candidateRoot === undefined ? {} : { candidate_root: candidateRoot }),
    ...(candidatePackageSha256 === undefined
      ? {}
      : { candidate_package_sha256: candidatePackageSha256 })
  });
  } finally {
    try {
      rmdirSync(launchLock);
    } catch {
      fail("capture_bundle_reject:capture_lock_cleanup_failed");
    }
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options: { corpus_root?: string; output_root?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--corpus-root") {
      options.corpus_root = argv[++index];
      continue;
    }
    if (token === "--output-root") {
      options.output_root = argv[++index];
      continue;
    }
    fail("capture_bundle_reject:unknown_cli_argument");
  }

  const corpusRoot = options.corpus_root ??
    resolve(REPOSITORY_ROOT, "samples/sandbox-security-benchmark/v1");
  const outputRoot = options.output_root ??
    resolve(REPOSITORY_ROOT, "tmp/sandbox-security-capture-bundle");

  mkdirSync(outputRoot, { recursive: true });
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: corpusRoot,
    output_root: outputRoot
  });
  const command = buildSandboxSecurityCaptureChildCommand(bundle);
  const summary = {
    root: bundle.root,
    input_root: bundle.input_root,
    capture_output_root: bundle.capture_output_root,
    fixture_count: bundle.fixture_ids.length,
    inputs_tree_sha256: bundle.inputs_tree_sha256,
    entrypoint: command.entrypoint,
    allow_fs_read: command.allow_fs_read,
    allow_fs_write: command.allow_fs_write,
    allow_child_process: command.allow_child_process,
    allow_worker: command.allow_worker
  };
  writeFileSync(
    join(bundle.root, "bundle-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  process.stdout.write(`${JSON.stringify({ phase: "bundle_ready", ...summary })}\n`);

  // Parent owns child_process: launch the fixed capture-live entrypoint under
  // Node --permission with the exact allowlists (truth-blind).
  const child = await launchSandboxSecurityCaptureChild({ bundle });
  process.stdout.write(
    `${JSON.stringify({
      phase: "capture_child_finished",
      exit_code: child.exit_code,
      stdout_bytes: child.stdout.length,
      stderr_bytes: child.stderr.length
    })}\n`
  );
  if (child.stderr.length > 0) {
    process.stderr.write(
      `${JSON.stringify({
        error_code: sanitizeSandboxSecurityCaptureChildStderr(child.stderr)
      })}\n`
    );
  }
  if (child.exit_code !== 0) {
    process.exitCode = child.exit_code;
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  basename(fileURLToPath(import.meta.url)) === basename(resolve(entrypoint)) &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ error_code: safeCliErrorCode(error) })}\n`
    );
    process.exitCode = 1;
  });
}
