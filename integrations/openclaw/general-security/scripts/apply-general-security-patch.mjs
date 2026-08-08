import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_SCHEMA = "openclaw-security-patch-manifest.v1";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-+][0-9A-Za-z.-]+)?$/;
const MAX_FILE_ENTRIES = 64;

function fail(message) {
  const error = new Error(`general-security patch refused: ${message}`);
  error.name = "openclaw_security_patch_invalid";
  throw error;
}

function isOrdinaryRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnDataKeys(value, required, optional = []) {
  if (!isOrdinaryRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined && descriptor.enumerable && "value" in descriptor
    );
  });
}

function sha256OfFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function resolveRealDirectory(path, label) {
  if (typeof path !== "string" || path.length === 0) {
    fail(`${label} must be a non-empty path`);
  }
  if (!existsSync(path)) fail(`${label} does not exist`);
  if (lstatSync(path).isSymbolicLink()) fail(`${label} must not be a symlink`);
  const real = realpathSync(path);
  if (!lstatSync(real).isDirectory()) fail(`${label} must be a directory`);
  return real;
}

function resolveRealFile(path, label) {
  if (typeof path !== "string" || path.length === 0) {
    fail(`${label} must be a non-empty path`);
  }
  if (!existsSync(path)) fail(`${label} does not exist`);
  if (lstatSync(path).isSymbolicLink()) fail(`${label} must not be a symlink`);
  const real = realpathSync(path);
  if (!lstatSync(real).isFile()) fail(`${label} must be a regular file`);
  return real;
}

function readManifest(manifestPath) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      readFileSync(manifestPath)
    );
  } catch {
    fail("manifest is not valid UTF-8");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("manifest is not valid JSON");
  }
  if (
    !hasExactOwnDataKeys(parsed, [
      "schema_version",
      "package_name",
      "package_version",
      "npm_integrity",
      "tarball_sha256",
      "patch_tool",
      "patch_tool_version",
      "patch_sha256",
      "files"
    ]) ||
    parsed.schema_version !== MANIFEST_SCHEMA ||
    typeof parsed.package_name !== "string" ||
    parsed.package_name.length === 0 ||
    typeof parsed.package_version !== "string" ||
    parsed.package_version.length === 0 ||
    typeof parsed.npm_integrity !== "string" ||
    !parsed.npm_integrity.startsWith("sha512-") ||
    typeof parsed.tarball_sha256 !== "string" ||
    !SHA256_PATTERN.test(parsed.tarball_sha256) ||
    parsed.patch_tool !== "git" ||
    typeof parsed.patch_tool_version !== "string" ||
    !SEMVER_PATTERN.test(parsed.patch_tool_version) ||
    typeof parsed.patch_sha256 !== "string" ||
    !SHA256_PATTERN.test(parsed.patch_sha256) ||
    !Array.isArray(parsed.files) ||
    parsed.files.length === 0 ||
    parsed.files.length > MAX_FILE_ENTRIES
  ) {
    fail("manifest schema is invalid");
  }

  const seen = new Set();
  const files = parsed.files.map((entry) => {
    if (
      !hasExactOwnDataKeys(entry, ["path", "sha256_before", "sha256_after"]) ||
      typeof entry.path !== "string" ||
      entry.path.length === 0 ||
      !SHA256_PATTERN.test(entry.sha256_before) ||
      !SHA256_PATTERN.test(entry.sha256_after) ||
      entry.sha256_before === entry.sha256_after
    ) {
      fail("manifest file entry is invalid");
    }
    if (isAbsolute(entry.path) || entry.path.includes("\\")) {
      fail(`manifest path must be relative and POSIX: ${entry.path}`);
    }
    const segments = entry.path.split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      fail(`manifest path must not traverse: ${entry.path}`);
    }
    if (seen.has(entry.path)) fail(`duplicate manifest path: ${entry.path}`);
    seen.add(entry.path);
    return Object.freeze({
      path: entry.path,
      sha256_before: entry.sha256_before,
      sha256_after: entry.sha256_after
    });
  });

  return Object.freeze({
    schema_version: parsed.schema_version,
    package_name: parsed.package_name,
    package_version: parsed.package_version,
    npm_integrity: parsed.npm_integrity,
    tarball_sha256: parsed.tarball_sha256,
    patch_tool: parsed.patch_tool,
    patch_tool_version: parsed.patch_tool_version,
    patch_sha256: parsed.patch_sha256,
    files: Object.freeze(files)
  });
}

function containedRealFile(packageRoot, relativePath) {
  const target = resolve(packageRoot, relativePath);
  const rel = relative(packageRoot, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    fail(`manifest path escapes the package root: ${relativePath}`);
  }
  let current = packageRoot;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    if (!existsSync(current)) fail(`patched file is missing: ${relativePath}`);
    if (lstatSync(current).isSymbolicLink()) {
      fail(`manifest path must not contain a symlink: ${relativePath}`);
    }
  }
  if (!lstatSync(target).isFile()) {
    fail(`manifest path is not a regular file: ${relativePath}`);
  }
  return target;
}

function verifyExpectedIdentity(packageRoot, manifest, expectedIdentity) {
  if (expectedIdentity === undefined) return;
  if (
    !hasExactOwnDataKeys(expectedIdentity, [
      "package_name",
      "package_version",
      "npm_integrity",
      "tarball_sha256"
    ])
  ) {
    fail("expectedIdentity schema is invalid");
  }
  for (const key of [
    "package_name",
    "package_version",
    "npm_integrity",
    "tarball_sha256"
  ]) {
    if (expectedIdentity[key] !== manifest[key]) {
      fail(`manifest ${key} does not match the expected identity`);
    }
  }
  const packageJsonPath = containedRealFile(packageRoot, "package.json");
  let installed;
  try {
    installed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    fail("package.json is not valid JSON");
  }
  if (
    !isOrdinaryRecord(installed) ||
    installed.name !== manifest.package_name ||
    installed.version !== manifest.package_version
  ) {
    fail("installed package identity does not match the manifest");
  }
}

function gitVersion() {
  try {
    const raw = execFileSync("git", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const match = /^git version ([0-9]+\.[0-9]+(?:\.[0-9]+)?)/.exec(raw);
    return match === null ? null : match[1];
  } catch {
    return null;
  }
}

function classifyCurrentState(packageRoot, manifest) {
  let beforeMatches = 0;
  let afterMatches = 0;
  for (const entry of manifest.files) {
    const target = containedRealFile(packageRoot, entry.path);
    const actual = sha256OfFile(target);
    if (actual === entry.sha256_before) beforeMatches += 1;
    else if (actual === entry.sha256_after) afterMatches += 1;
    else fail(`unexpected content for ${entry.path}`);
  }
  if (afterMatches === manifest.files.length) return "already_applied";
  if (beforeMatches === manifest.files.length) return "pristine";
  return fail("package tree is partially patched");
}

function patchTargets(patchText) {
  const targets = new Set();
  for (const line of patchText.split("\n")) {
    if (!line.startsWith("+++ ")) continue;
    const raw = line.slice(4).trim().split("\t")[0];
    if (raw === "/dev/null") fail("patch must not delete files");
    const stripped = raw.startsWith("b/") ? raw.slice(2) : raw;
    targets.add(stripped);
  }
  if (targets.size === 0) fail("patch declares no target files");
  return targets;
}

export function applyVerifiedPatch(input) {
  if (
    !hasExactOwnDataKeys(
      input,
      ["packageRoot", "manifestPath", "patchPath"],
      ["expectedIdentity"]
    )
  ) {
    fail("input schema is invalid");
  }

  const packageRoot = resolveRealDirectory(input.packageRoot, "packageRoot");
  const manifestPath = resolveRealFile(input.manifestPath, "manifestPath");
  const patchPath = resolveRealFile(input.patchPath, "patchPath");

  const manifest = readManifest(manifestPath);
  verifyExpectedIdentity(packageRoot, manifest, input.expectedIdentity);

  const patchBytes = readFileSync(patchPath);
  const actualPatchSha = createHash("sha256").update(patchBytes).digest("hex");
  if (actualPatchSha !== manifest.patch_sha256) {
    fail("patch SHA-256 does not match the manifest");
  }

  // `patch_tool_version` records the git version that generated the patch. The
  // applying host only needs a usable git; requiring equality would make a
  // sealed manifest unusable on any other machine.
  if (gitVersion() === null) {
    fail("git is not available to apply the verified patch");
  }

  const declaredTargets = patchTargets(patchBytes.toString("utf8"));
  const manifestPaths = new Set(manifest.files.map((entry) => entry.path));
  for (const target of declaredTargets) {
    if (!manifestPaths.has(target)) {
      fail(`patch targets an unlisted file: ${target}`);
    }
  }
  for (const declared of manifestPaths) {
    if (!declaredTargets.has(declared)) {
      fail(`manifest lists a file the patch does not modify: ${declared}`);
    }
  }

  const state = classifyCurrentState(packageRoot, manifest);
  if (state === "already_applied") {
    return Object.freeze({ status: "already_applied" });
  }

  const disposableParent = mkdtempSync(
    join(tmpdir(), "general-security-patch-")
  );
  const copyRoot = join(disposableParent, "package");
  try {
    cpSync(packageRoot, copyRoot, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true
    });

    execFileSync(
      "git",
      ["apply", "--check", "-p1", "--whitespace=nowarn", patchPath],
      { cwd: copyRoot, stdio: "pipe" }
    );
    execFileSync("git", ["apply", "-p1", "--whitespace=nowarn", patchPath], {
      cwd: copyRoot,
      stdio: "pipe"
    });

    for (const entry of manifest.files) {
      const patched = containedRealFile(copyRoot, entry.path);
      const actual = sha256OfFile(patched);
      if (actual !== entry.sha256_after) {
        fail(`post-patch hash mismatch for ${entry.path}`);
      }
    }

    const retired = join(disposableParent, "retired");
    renameSync(packageRoot, retired);
    try {
      renameSync(copyRoot, packageRoot);
    } catch (error) {
      renameSync(retired, packageRoot);
      throw error;
    }
    rmSync(retired, { recursive: true, force: true });

    return Object.freeze({ status: "applied" });
  } finally {
    rmSync(disposableParent, { recursive: true, force: true });
  }
}

export function applyOpenClawGeneralSecurityPatch(input) {
  if (!hasExactOwnDataKeys(input, ["packageRoot"])) {
    fail("production input schema is invalid");
  }
  return applyVerifiedPatch({
    packageRoot: input.packageRoot,
    manifestPath: PRODUCTION_MANIFEST_PATH,
    patchPath: PRODUCTION_PATCH_PATH,
    expectedIdentity: PRODUCTION_EXPECTED_IDENTITY
  });
}

const PRODUCTION_PATCH_PATH = fileURLToPath(
  new URL("../patches/openclaw-2026.6.34-general-security.patch", import.meta.url)
);
const PRODUCTION_MANIFEST_PATH = fileURLToPath(
  new URL(
    "../patches/openclaw-2026.6.34-general-security.manifest.json",
    import.meta.url
  )
);
const PRODUCTION_EXPECTED_IDENTITY = Object.freeze({
  package_name: "openclaw",
  package_version: "2026.6.34",
  npm_integrity:
    "sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB+8SVFdh0FPNPHRVgZepzNJDfHg==",
  tarball_sha256:
    "d0edcbc937428ce1cb5729e444ea615651c9a8895807653ac2c4ed4e05122fa5"
});

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  );
}

if (isMainModule()) {
  const packageRoot = process.argv[2] ?? resolve(process.cwd(), "node_modules/openclaw");
  try {
    process.stdout.write(
      `${JSON.stringify(applyOpenClawGeneralSecurityPatch({ packageRoot }))}\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "patch failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

export default applyVerifiedPatch;
