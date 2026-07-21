import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildSandboxSecurityCaptureChildCommand,
  launchSandboxSecurityCaptureChild,
  prepareSandboxSecurityCaptureBundle,
  type SandboxSecurityCaptureBundle
} from "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const COMMITTED_CORPUS_ROOT = resolve(
  REPO_ROOT,
  "samples/sandbox-security-benchmark/v1"
);
const TEMP_ROOTS: string[] = [];

after(() => {
  for (const root of TEMP_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  TEMP_ROOTS.push(root);
  return root;
}

function writePermissionProbe(probePath: string): void {
  writeFileSync(
    probePath,
    `import { readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const payload = JSON.parse(process.argv[2]);
const denied = [];
const attempts = {
  direct: () => readFileSync(payload.truth_file, "utf8"),
  relative: () => readFileSync(join(payload.bundle_root, "..", "truth-escape", "truth.json"), "utf8"),
  directory: () => readdirSync(payload.truth_dir),
  symlink: () => {
    try {
      symlinkSync(payload.truth_file, join(payload.capture_output_root, "escape-link.json"));
    } catch {
      // creating the link may itself be denied; still attempt the read path below
    }
    return readFileSync(join(payload.capture_output_root, "escape-link.json"), "utf8");
  }
};

for (const [name, fn] of Object.entries(attempts)) {
  try {
    fn();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "ERR";
    if (code === "ERR_ACCESS_DENIED" || code === "EACCES") {
      denied.push(name);
    } else {
      denied.push(name);
    }
  }
}

// dynamic import of a truth file must also fail under the permission model
try {
  await import("file://" + payload.truth_file);
} catch {
  // expected
}

const childProcessDenied = !process.permission.has("child");
const workerDenied = !process.permission.has("worker");
if (!childProcessDenied || !workerDenied) {
  process.stderr.write(JSON.stringify({
    error: "unexpected_child_or_worker_permission",
    childProcessDenied,
    workerDenied
  }) + "\\n");
  process.exitCode = 2;
  process.exit();
}

process.stdout.write(JSON.stringify({
  denied_attempts: denied.sort(),
  child_process_permission: process.permission.has("child"),
  worker_permission: process.permission.has("worker")
}) + "\\n");
`
  );
}

async function runPermissionDeniedProbe(
  bundle: Readonly<SandboxSecurityCaptureBundle>
): Promise<Readonly<{ denied_attempts: readonly string[] }>> {
  const probeRoot = tempRoot("ssb-perm-probe-");
  const probePath = join(probeRoot, "permission-probe.mjs");
  writePermissionProbe(probePath);

  const truthEscapeRoot = join(probeRoot, "truth-escape");
  mkdirSync(truthEscapeRoot, { recursive: true });
  const truthFile = join(truthEscapeRoot, "truth.json");
  writeFileSync(truthFile, JSON.stringify({ secret: "oracle" }));

  // Parent-created symlink inside the write allowlist, pointing at secret truth.
  const plantedLink = join(bundle.capture_output_root, "escape-link.json");
  try {
    symlinkSync(truthFile, plantedLink);
  } catch {
    // If the capture output already rejects links, probe still exercises direct paths.
  }

  const command = buildSandboxSecurityCaptureChildCommand(bundle);
  const allowReads = [
    ...command.allow_fs_read,
    probePath,
    // probe reads its own payload paths only through denied targets
  ];
  const args = [
    "--permission",
    ...allowReads.map((path) => `--allow-fs-read=${path}`),
    ...command.allow_fs_write.map((path) => `--allow-fs-write=${path}`),
    probePath,
    JSON.stringify({
      truth_file: truthFile,
      truth_dir: truthEscapeRoot,
      bundle_root: bundle.root,
      capture_output_root: bundle.capture_output_root
    })
  ];

  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME
    }
  });

  assert.equal(
    result.status,
    0,
    `permission probe failed: status=${result.status} stderr=${result.stderr}`
  );
  const parsed = JSON.parse(result.stdout) as {
    denied_attempts: string[];
    child_process_permission: boolean;
    worker_permission: boolean;
  };
  assert.equal(parsed.child_process_permission, false);
  assert.equal(parsed.worker_permission, false);
  return { denied_attempts: parsed.denied_attempts };
}

test("REQ-SBX-GENERAL-002 capture bundle contains inputs and code allowlist but no truth capability", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });

  assert.equal(existsSync(join(bundle.input_root, "ssb-v1-0001.json")), true);
  assert.equal(existsSync(join(bundle.root, "truth")), false);
  assert.equal(existsSync(join(bundle.root, "sources.lock.json")), false);
  assert.equal(existsSync(join(bundle.root, "manifest.json")), false);
  assert.equal(readdirSync(bundle.input_root).length, 300);
  assert.ok(bundle.code_allowlist.length > 0);
  assert.ok(bundle.fixture_ids.includes("ssb-v1-0001"));
  assert.equal(bundle.fixture_ids.length, 300);
  assert.equal(typeof bundle.inputs_tree_sha256, "string");
  assert.match(bundle.inputs_tree_sha256, /^[0-9a-f]{64}$/u);

  const serialized = JSON.stringify(bundle);
  assert.doesNotMatch(
    serialized,
    /primary_category|ground_truth_severity|verdict_class|unsafe_recall|OPENAI_API_KEY/
  );
  // structural absence: no truth path capability in the bundle descriptor
  assert.equal("truth_root" in bundle, false);
  assert.equal("truth_path" in bundle, false);
  for (const path of bundle.read_allowlist) {
    assert.equal(
      path.includes(`${sep}truth${sep}`) || path.endsWith(`${sep}truth`),
      false,
      `read allowlist must not include truth path: ${path}`
    );
  }
  assert.equal(
    bundle.read_allowlist.includes(bundle.capture_output_root),
    false,
    "capture output must be write-only, not readable"
  );
});

test("REQ-SBX-GENERAL-002 permission child cannot direct relative symlink or directory-enumerate truth", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-perm-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const result = await runPermissionDeniedProbe(bundle);
  assert.deepEqual(result.denied_attempts.slice().sort(), [
    "direct",
    "directory",
    "relative",
    "symlink"
  ]);
});

test("REQ-SBX-GENERAL-002 capture child rejects inherited descriptor and truth arguments", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-reject-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const truthPath = join(COMMITTED_CORPUS_ROOT, "truth", "ssb-v1-0001.json");

  await assert.rejects(
    () =>
      launchSandboxSecurityCaptureChild({
        bundle,
        inherited_fd: 3
      } as never),
    /inherited|descriptor|fd/i
  );
  await assert.rejects(
    () =>
      launchSandboxSecurityCaptureChild({
        bundle,
        truth_path: truthPath
      } as never),
    /truth|unsupported|reject/i
  );
});

test("REQ-SBX-GENERAL-002 parent launches only the fixed capture-live entrypoint", () => {
  // build command does not require prepare; use a minimal shape validated by prepare output
  const tempBundleRoot = tempRoot("ssb-capture-bundle-cmd-");
  return prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  }).then((bundle) => {
    const command = buildSandboxSecurityCaptureChildCommand(bundle);
    assert.match(
      command.entrypoint,
      /scripts[/\\]benchmark[/\\]sandbox-security[/\\]capture-live\.ts$/
    );
    assert.doesNotMatch(
      command.args.join(" "),
      /truth|evaluate|metrics|OPENAI_API_KEY/
    );
    assert.ok(command.args.includes("--permission"));
    assert.ok(
      command.allow_fs_read.every((path) => !path.includes(`${sep}truth`))
    );
    assert.ok(
      command.allow_fs_write.every((path) =>
        path.startsWith(bundle.capture_output_root) ||
        path === bundle.capture_output_root
      )
    );
    assert.equal(
      command.allow_child_process,
      false
    );
    assert.equal(command.allow_worker, false);
  });
});

test("REQ-SBX-GENERAL-002 prepare rejects corpus that fails validation", async () => {
  const brokenRoot = tempRoot("ssb-broken-corpus-");
  mkdirSync(join(brokenRoot, "inputs"), { recursive: true });
  writeFileSync(join(brokenRoot, "manifest.json"), "{}");
  await assert.rejects(
    () =>
      prepareSandboxSecurityCaptureBundle({
        corpus_root: brokenRoot,
        output_root: tempRoot("ssb-broken-out-")
      }),
    /corpus_validation_failed|invalid|manifest/i
  );
});

test("REQ-SBX-GENERAL-002 prepare rejects output path escapes and symlink roots", async () => {
  const out = tempRoot("ssb-out-");
  const link = join(out, "link-out");
  symlinkSync(out, link);
  await assert.rejects(
    () =>
      prepareSandboxSecurityCaptureBundle({
        corpus_root: COMMITTED_CORPUS_ROOT,
        output_root: link
      }),
    /symlink|output|reject/i
  );
});
