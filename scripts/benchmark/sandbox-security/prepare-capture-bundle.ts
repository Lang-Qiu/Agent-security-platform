/**
 * P5-T4: Truth-blind input-only capture bundle preparation and parent launcher.
 *
 * Materializes inputs + exact code/read/write allowlists. The only child_process
 * owner launches the fixed capture-live.ts entrypoint under Node --permission.
 * Truth, source lock, evaluator, metrics, and inherited descriptors are rejected.
 */

import { spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
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
  hashSandboxSecurityBenchmarkTree,
  normalizeSandboxSecurityBenchmarkManifest,
  normalizeSandboxSecurityBenchmarkSourcesLock,
  type SandboxSecurityBenchmarkSha256
} from "./contracts.ts";
import { validateSandboxSecurityBenchmarkCorpus } from "./validate-corpus.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "../../..");
const FIXED_CAPTURE_LIVE_RELATIVE =
  "scripts/benchmark/sandbox-security/capture-live.ts";
const FIXED_CAPTURE_LIVE_PATH = resolve(
  REPOSITORY_ROOT,
  FIXED_CAPTURE_LIVE_RELATIVE
);

/** Fixed code trees required by capture-live + production/shared runtime. */
const FIXED_CODE_ALLOWLIST_RELATIVE: readonly string[] = Object.freeze([
  "engines/sandbox/src/security-production",
  "engines/sandbox/src/security",
  "engines/sandbox/src/base-filter",
  "engines/sandbox/src/monitoring",
  "engines/sandbox/src/simulated-tools",
  "shared/contracts",
  "shared/types",
  "shared/utils",
  "shared/index.ts",
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
}

function fail(code: string): never {
  throw new Error(code);
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
  if (existsSync(bundleRoot)) {
    const existing = lstatSync(bundleRoot);
    if (existing.isSymbolicLink()) {
      fail("capture_bundle_reject:symlink_output");
    }
    rmSync(bundleRoot, { recursive: true, force: true });
  }
  mkdirSync(bundleRoot, { recursive: true });

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
  const mirroredCode = materializeCodeMirror(bundleRoot, codeAllowlist);
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

  // Read allowlist: inputs + mirrored/repo code only.
  // capture_output_root is write-only so parent-planted symlinks cannot be
  // followed as a read path into oracle material.
  const codeMirrorRoot = realpathSync(join(bundleRoot, "code"));
  const readAllowlist = Object.freeze(
    Array.from(
      new Set<string>([
        inputReal,
        codeMirrorRoot,
        ...codeAllowlist.filter((path) => existsSync(path)),
        ...mirroredCode.filter((path) => existsSync(path)),
        // Node must read the entrypoint when present (repo path, not write dir).
        ...(existsSync(FIXED_CAPTURE_LIVE_PATH)
          ? [realpathSync(FIXED_CAPTURE_LIVE_PATH)]
          : [FIXED_CAPTURE_LIVE_PATH])
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

  const writeAllowlist = Object.freeze([captureReal]);

  return Object.freeze({
    root: bundleReal,
    input_root: inputReal,
    capture_output_root: captureReal,
    fixture_ids: Object.freeze([...fixtureIds]),
    inputs_tree_sha256: inputsTreeSha256,
    code_allowlist: Object.freeze([...codeAllowlist]),
    read_allowlist: readAllowlist,
    write_allowlist: writeAllowlist,
    capture_live_entrypoint: FIXED_CAPTURE_LIVE_PATH,
    repository_root: REPOSITORY_ROOT
  });
}

export function buildSandboxSecurityCaptureChildCommand(
  bundle: Readonly<SandboxSecurityCaptureBundle>
): Readonly<SandboxSecurityCaptureChildCommand> {
  if (bundle === null || typeof bundle !== "object") {
    fail("capture_bundle_invalid:bundle");
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
  if (entrypoint !== FIXED_CAPTURE_LIVE_PATH) {
    fail("capture_bundle_reject:entrypoint_not_fixed");
  }

  const allowFsRead = [...bundle.read_allowlist];
  const allowFsWrite = [...bundle.write_allowlist];

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
      path !== bundle.capture_output_root &&
      !isPathInside(bundle.capture_output_root, path)
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
    `--inputs-tree-sha256=${bundle.inputs_tree_sha256}`
  ]);

  const joined = args.join(" ");
  if (/(?:^|[\s=])(?:truth|evaluate|metrics|OPENAI_API_KEY)(?:$|[\s=/])/iu.test(joined)) {
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
    cwd: REPOSITORY_ROOT
  });
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

  // stdio: ignore stdin, capture stdout/stderr. No fd inheritance beyond that.
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command.exec_path, [...command.args], {
      cwd: command.cwd,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "C"
      },
      stdio: ["ignore", "pipe", "pipe"],
      // Never pass custom uid/gid or detached with inherited sockets.
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      rejectPromise(error);
    });
    child.on("close", (code) => {
      resolvePromise(
        Object.freeze({
          exit_code: code ?? 1,
          stdout,
          stderr
        })
      );
    });
  });
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
    fail(`capture_bundle_reject:unknown_cli_argument:${token}`);
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
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  basename(fileURLToPath(import.meta.url)) === basename(resolve(entrypoint)) &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "capture_bundle_failed:internal";
    process.stderr.write(`${JSON.stringify({ error_code: message })}\n`);
    process.exitCode = 1;
  });
}
