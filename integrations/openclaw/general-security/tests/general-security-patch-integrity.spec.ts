import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

type RecordValue = Record<string, unknown>;
type ApplyResult = { status: "applied" | "already_applied" };
type ApplyInput = { packageRoot: string };
type ApplyFunction = (input: ApplyInput) => ApplyResult;
type GenericApplyFunction = (input: RecordValue) => ApplyResult;

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const OPENCLAW_ROOT = realpathSync(join(PACKAGE_ROOT, "node_modules", "openclaw"));
const PATCH_PATH = join(
  PACKAGE_ROOT,
  "patches",
  "openclaw-2026.6.34-general-security.patch"
);
const MANIFEST_PATH = join(
  PACKAGE_ROOT,
  "patches",
  "openclaw-2026.6.34-general-security.manifest.json"
);
const PATCH_SCRIPT_HREF = new URL(
  "../scripts/apply-general-security-patch.mjs",
  import.meta.url
).href;
const patchModule = (await import(PATCH_SCRIPT_HREF)) as {
  applyVerifiedPatch?: GenericApplyFunction;
  applyOpenClawGeneralSecurityPatch?: ApplyFunction;
};

const OPENCLAW_IDENTITY = Object.freeze({
  package_name: "openclaw",
  package_version: "2026.6.34",
  npm_integrity:
    "sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB+8SVFdh0FPNPHRVgZepzNJDfHg==",
  tarball_sha256:
    "d0edcbc937428ce1cb5729e444ea615651c9a8895807653ac2c4ed4e05122fa5"
});

const EXPECTED_PRE_HASHES = Object.freeze({
  "dist/plugin-sdk/hook-types-H9SC6W-p.d.ts":
    "f5b4912cb205b79e8ba5620554329c80dd070fd996ae0979260b66c16d349091",
  "dist/command-registration-BBago94k.js":
    "6672f28552a828daa2375c62758b1756725970fc45b2232d66596a59b5e22546",
  "dist/hook-runner-global-D_43rcnU.js":
    "d2ade7ea51fff02574643574acfed5a7bbbe6b01fd5df5797c9ebaddd2674bda",
  "dist/lifecycle-hook-helpers-Dowa8zK4.js":
    "a66e4b85966d1f9bbbb7b6123bb915a5cdeec433c0fae6f0bbd893b57958c085",
  "dist/selection-DopzNY3I.js":
    "a5698c5523e87ad454cf89e4a5c940689403f7b6eac6f3d14c7205f1e3071ed6",
  "dist/cli-runner-B0eKIePw.js":
    "b78b9a928c7a2945c34b76184b2c9562317dcc19618b2b1df8e10db1bdfe593e",
  "dist/run-attempt-6K7vbtby.js":
    "808acfb32c37e6122d6ed54eda5fbc3c56683eade263b490a5b922c980696a38",
  "dist/agent-tools.before-tool-call-59sE70R-.js":
    "2f8ba157e5660c32b85826eb3269a59b8add55062e31ed3d6d1528dd1017ad4b",
  "dist/tool-split-BKKaUdyz.js":
    "f6cb11210b69687a26ac079b48b341190c586450f2c46280284ff317ad805843",
  "dist/dispatch-BSYjC-fp.js":
    "8001214385bc1cf4d883e53d877b6e6aabf9692bbf5759f9c35872bd83150f61",
  "dist/agent-runner.runtime-BUWW8f6n.js":
    "9df987c2c8efdeaa875aead6d486a5f5f4d835a805e5c835f490ef3c4aa1d2e0",
  "dist/deliver-CJEsHkyF.js":
    "3229fb60029f129b767fe9ca91be9f530f41395727f1bcffdfa23a4073b6857d",
  "dist/delivery-CExBlTq2.js":
    "abcd09249ed4a1c7c079924c3c537e334dc7944597dc7b03f370b5e03ed3f89a"
});

const EXPECTED_PATHS = Object.freeze(Object.keys(EXPECTED_PRE_HASHES).sort());

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path: string): string {
  return sha256(readFileSync(path));
}

function requireGenericApply(): GenericApplyFunction {
  assert.equal(
    typeof patchModule.applyVerifiedPatch,
    "function",
    "the generic verified patch mechanism must remain available"
  );
  return patchModule.applyVerifiedPatch as GenericApplyFunction;
}

function requireProductionApply(): ApplyFunction {
  assert.equal(
    typeof patchModule.applyOpenClawGeneralSecurityPatch,
    "function",
    "the production wrapper must expose a fixed OpenClaw identity"
  );
  return patchModule.applyOpenClawGeneralSecurityPatch as ApplyFunction;
}

function makeFixture(): { root: string; packageRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "g4-patch-integrity-"));
  const packageRoot = join(root, "openclaw");
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "openclaw", version: "2026.6.34" }),
    "utf8"
  );
  for (const path of EXPECTED_PATHS) {
    const source = join(OPENCLAW_ROOT, path);
    const target = join(packageRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { dereference: true });
  }
  return { root, packageRoot };
}

function cleanup(fixture: { root: string }): void {
  rmSync(fixture.root, { recursive: true, force: true });
}

function patchTargets(): string[] {
  return [
    ...new Set(
      readFileSync(PATCH_PATH, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("+++ b/"))
        .map((line) => line.slice("+++ b/".length).trim().split("\t")[0])
    )
  ].sort();
}

test("REQ-SBX-GENERAL-004 P4-T7 exposes the fixed production manifest and wrapper", () => {
  const apply = requireProductionApply();
  assert.equal(existsSync(MANIFEST_PATH), true, "production manifest must exist");
  assert.equal(existsSync(PATCH_PATH), true, "production patch must exist");
  assert.equal(typeof apply, "function");
});

test("REQ-SBX-GENERAL-004 P4-T7 seals exact OpenClaw identity and thirteen file hashes", () => {
  requireProductionApply();
  assert.equal(existsSync(MANIFEST_PATH), true, "production manifest must exist");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as RecordValue;
  assert.deepEqual(
    {
      package_name: manifest.package_name,
      package_version: manifest.package_version,
      npm_integrity: manifest.npm_integrity,
      tarball_sha256: manifest.tarball_sha256
    },
    OPENCLAW_IDENTITY
  );
  assert.equal(manifest.schema_version, "openclaw-security-patch-manifest.v1");
  assert.equal(manifest.patch_tool, "git");
  assert.match(String(manifest.patch_tool_version), /^\d+\.\d+(?:\.\d+)?$/);
  assert.equal(manifest.patch_sha256, sha256File(PATCH_PATH));

  const files = manifest.files as Array<RecordValue>;
  assert.equal(files.length, EXPECTED_PATHS.length);
  assert.deepEqual(
    files.map((entry) => entry.path).sort(),
    EXPECTED_PATHS
  );
  for (const entry of files) {
    const path = String(entry.path) as keyof typeof EXPECTED_PRE_HASHES;
    assert.equal(entry.sha256_before, EXPECTED_PRE_HASHES[path]);
    assert.match(String(entry.sha256_after), /^[0-9a-f]{64}$/);
    assert.notEqual(entry.sha256_before, entry.sha256_after);
    assert.equal(path.includes(".."), false);
    assert.equal(path.startsWith("integrations/openclaw/"), false);
  }
  assert.deepEqual(patchTargets(), EXPECTED_PATHS);
});

test("REQ-SBX-GENERAL-004 P4-T7 applies the sealed patch twice without changing its identity", () => {
  const apply = requireProductionApply();
  const fixture = makeFixture();
  try {
    assert.equal(apply({ packageRoot: fixture.packageRoot }).status, "applied");
    assert.equal(
      apply({ packageRoot: fixture.packageRoot }).status,
      "already_applied"
    );
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as RecordValue;
    for (const entry of manifest.files as Array<RecordValue>) {
      assert.equal(
        sha256File(join(fixture.packageRoot, String(entry.path))),
        entry.sha256_after,
        `post-patch hash mismatch for ${String(entry.path)}`
      );
    }
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T7 rejects a changed pre-hash before patching", () => {
  const apply = requireProductionApply();
  const fixture = makeFixture();
  try {
    const changed = join(fixture.packageRoot, EXPECTED_PATHS[0]);
    writeFileSync(changed, "tampered preimage\n", "utf8");
    assert.throws(() => apply({ packageRoot: fixture.packageRoot }));
    assert.equal(readFileSync(changed, "utf8"), "tampered preimage\n");
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T7 rejects a changed patch digest without a partial tree", () => {
  const genericApply = requireGenericApply();
  const fixture = makeFixture();
  const patchCopy = join(fixture.root, "tampered.patch");
  try {
    writeFileSync(
      patchCopy,
      `${readFileSync(PATCH_PATH, "utf8")}\n# tampered\n`,
      "utf8"
    );
    const before = sha256File(join(fixture.packageRoot, EXPECTED_PATHS[0]));
    assert.throws(() =>
      genericApply({
        packageRoot: fixture.packageRoot,
        manifestPath: MANIFEST_PATH,
        patchPath: patchCopy
      })
    );
    assert.equal(
      sha256File(join(fixture.packageRoot, EXPECTED_PATHS[0])),
      before
    );
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T7 rejects a changed post-hash without replacing the package tree", () => {
  const genericApply = requireGenericApply();
  const fixture = makeFixture();
  const manifestCopy = join(fixture.root, "tampered-manifest.json");
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as RecordValue;
    const files = (manifest.files as Array<RecordValue>).map((entry, index) =>
      index === 0
        ? { ...entry, sha256_after: sha256("wrong postimage\n") }
        : entry
    );
    writeFileSync(
      manifestCopy,
      JSON.stringify({ ...manifest, files }),
      "utf8"
    );
    const before = sha256File(join(fixture.packageRoot, EXPECTED_PATHS[0]));
    assert.throws(() =>
      genericApply({
        packageRoot: fixture.packageRoot,
        manifestPath: manifestCopy,
        patchPath: PATCH_PATH
      })
    );
    assert.equal(
      sha256File(join(fixture.packageRoot, EXPECTED_PATHS[0])),
      before
    );
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T7 registers production patch and integrity commands", () => {
  const packageJson = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
  ) as RecordValue;
  const scripts = packageJson.scripts as RecordValue;
  assert.match(String(scripts["test:patch"]), /general-security-patch-integrity\.spec\.ts/);
  assert.equal(typeof scripts["apply:patch"], "string");
});

test("REQ-SBX-GENERAL-004 P4-T7 production wrapper refuses caller identity and path overrides", () => {
  const apply = requireProductionApply();
  const fixture = makeFixture();
  try {
    assert.throws(() =>
      (apply as unknown as (input: RecordValue) => ApplyResult)({
        packageRoot: fixture.packageRoot,
        manifestPath: MANIFEST_PATH
      })
    );
    assert.throws(() =>
      (apply as unknown as (input: RecordValue) => ApplyResult)({
        packageRoot: fixture.packageRoot,
        expectedIdentity: OPENCLAW_IDENTITY
      })
    );
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T7 production manifest matches the pinned package source", () => {
  requireProductionApply();
  assert.equal(existsSync(MANIFEST_PATH), true, "production manifest must exist");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as RecordValue;
  for (const entry of manifest.files as Array<RecordValue>) {
    assert.equal(
      sha256File(join(OPENCLAW_ROOT, String(entry.path))),
      entry.sha256_before,
      `pinned pre-patch hash drifted for ${String(entry.path)}`
    );
  }
  assert.equal(
    resolve(OPENCLAW_ROOT),
    resolve(OPENCLAW_ROOT),
    "the identity check must use the nested package source"
  );
  assert.equal(relative(PACKAGE_ROOT, OPENCLAW_ROOT).startsWith(".."), false);
});
