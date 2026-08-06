import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
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
import {
  materializeSandboxSecurityCandidatePackage
} from "../../scripts/benchmark/sandbox-security/capture-live.ts";
import { hashSandboxSecurityBenchmarkTree } from "../../scripts/benchmark/sandbox-security/contracts.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PREPARE_CAPTURE_BUNDLE_MODULE = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
);
const COMMITTED_CORPUS_ROOT = resolve(
  REPO_ROOT,
  "samples/sandbox-security-benchmark/v1"
);
const TEMP_ROOTS: string[] = [];

type SelectCaptureChildEnvironment = (
  environment: Readonly<Record<string, string | undefined>>
) => Readonly<Record<string, string>>;

let selectSandboxSecurityCaptureChildEnvironment: SelectCaptureChildEnvironment =
  () => {
    throw new TypeError("capture_child_environment_selector_missing");
  };
const captureBundleModule = await import(
  "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
);
if (
  typeof captureBundleModule.selectSandboxSecurityCaptureChildEnvironment ===
  "function"
) {
  selectSandboxSecurityCaptureChildEnvironment =
    captureBundleModule.selectSandboxSecurityCaptureChildEnvironment as SelectCaptureChildEnvironment;
}

test("REQ-SBX-GENERAL-002 prepare CLI rejects unknown arguments without reflecting values", () => {
  const secretLikeValue = "forbidden-prepare-secret-value";
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      PREPARE_CAPTURE_BUNDLE_MODULE,
      `--unknown=${secretLikeValue}`
    ],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    error_code: "capture_bundle_reject:unknown_cli_argument"
  });
  assert.doesNotMatch(result.stderr, new RegExp(secretLikeValue, "u"));
});

test("REQ-SBX-GENERAL-002 prepare parent canonicalizes arbitrary child stderr", () => {
  const sanitizer = (
    captureBundleModule as Readonly<Record<string, unknown>>
  ).sanitizeSandboxSecurityCaptureChildStderr;
  assert.equal(typeof sanitizer, "function");
  if (typeof sanitizer !== "function") return;
  const secretLikeValue = "forbidden-child-provider-body";
  assert.equal(
    (sanitizer as (stderr: string) => string)(secretLikeValue),
    "capture_bundle_reject:capture_child_failed"
  );
});

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

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writePermissionProbe(probePath: string): void {
  writeFileSync(
    probePath,
    [
      "import { readFileSync, readdirSync, symlinkSync } from \"node:fs\";",
      "import { join } from \"node:path\";",
      "",
      "const payload = JSON.parse(process.argv[2]);",
      "const denied = [];",
      "const relativeTarget = join(payload.bundle_root, \"..\", \"truth-escape\", \"truth.json\");",
      "",
      "const attempts = {",
      "  direct: () => readFileSync(payload.truth_file, \"utf8\"),",
      "  relative: () => readFileSync(relativeTarget, \"utf8\"),",
      "  directory: () => readdirSync(payload.truth_dir),",
      "  symlink: () => {",
      "    try {",
      "      symlinkSync(payload.truth_file, join(payload.capture_output_root, \"escape-link.json\"));",
      "    } catch (error) {",
      "      const code = error && typeof error === \"object\" && \"code\" in error",
      "        ? String(error.code)",
      "        : \"ERR\";",
      "      if (code !== \"ERR_ACCESS_DENIED\" && code !== \"EEXIST\") {",
      "        throw error;",
      "      }",
      "    }",
      "    return readFileSync(join(payload.capture_output_root, \"escape-link.json\"), \"utf8\");",
      "  }",
      "};",
      "",
      "for (const [name, fn] of Object.entries(attempts)) {",
      "  try {",
      "    fn();",
      "    process.stderr.write(JSON.stringify({ error: \"forbidden_access_succeeded\", attempt: name }) + \"\\n\");",
      "    process.exit(4);",
      "  } catch (error) {",
      "    const code = error && typeof error === \"object\" && \"code\" in error",
      "      ? String(error.code)",
      "      : \"ERR\";",
      "    if (code !== \"ERR_ACCESS_DENIED\") {",
      "      process.stderr.write(JSON.stringify({ error: \"unexpected_permission_error\", attempt: name, code }) + \"\\n\");",
      "      process.exit(5);",
      "    }",
      "    denied.push(name);",
      "  }",
      "}",
      "",
      "try {",
      "  await import(\"file://\" + payload.truth_file);",
      "  process.stderr.write(JSON.stringify({ error: \"forbidden_import_succeeded\" }) + \"\\n\");",
      "  process.exit(6);",
      "} catch (error) {",
      "  const code = error && typeof error === \"object\" && \"code\" in error",
      "    ? String(error.code)",
      "    : \"ERR\";",
      "  if (code !== \"ERR_ACCESS_DENIED\") {",
      "    process.stderr.write(JSON.stringify({ error: \"unexpected_import_error\", code }) + \"\\n\");",
      "    process.exit(7);",
      "  }",
      "  denied.push(\"dynamic_import\");",
      "}",
      "",
      "const childProcessDenied = !process.permission.has(\"child\");",
      "const workerDenied = !process.permission.has(\"worker\");",
      "if (!childProcessDenied || !workerDenied) {",
      "  process.stderr.write(JSON.stringify({",
      "    error: \"unexpected_child_or_worker_permission\",",
      "    childProcessDenied,",
      "    workerDenied",
      "  }) + \"\\n\");",
      "  process.exitCode = 2;",
      "  process.exit();",
      "}",
      "",
      "process.stdout.write(JSON.stringify({",
      "  denied_attempts: denied.sort(),",
      "  child_process_permission: process.permission.has(\"child\"),",
      "  worker_permission: process.permission.has(\"worker\")",
      "}) + \"\\n\");",
      ""
    ].join("\n")
  );
}

function writePermissionedCaptureSmokeProbe(probePath: string): void {
  writeFileSync(
    probePath,
    `import { runSandboxSecurityLiveCapture } from "./capture-live.ts";

const payload = JSON.parse(process.argv[2]);
let decisionCount = 0;

const result = await runSandboxSecurityLiveCapture({
  bundle_root: payload.bundle_root,
  input_root: payload.input_root,
  capture_output_root: payload.capture_output_root,
  capture_output_binding: payload.capture_output_binding,
  inputs_tree_sha256: payload.inputs_tree_sha256,
  fixture_ids: ["ssb-v1-0001", "ssb-v1-0002"],
  skip_input_hash_check: true,
  require_live_config: () => {},
  live_binding: {
    ollama_digest: "sha256:${"0".repeat(64)}",
    judge_protocol_id: "openai_responses_v1",
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url: "https://judge.example.test/v1",
    judge_endpoint_url: "https://judge.example.test/v1/responses",
    judge_requested_model: "gpt-5.4-mini"
  },
  run_judge_readiness: async () => "permission-smoke-judge",
  runtime: {
    now: () => "2026-07-22T00:00:00.000Z",
    nextDecisionId: () => "permission-smoke-decision",
    monotonicNowMs: () => 0,
    scheduleTimeout: () => () => {}
  },
  create_engine: async ({ capture_sink, transport }) => {
    void transport;
    capture_sink.record({
      capture_phase: "qualification",
      provider: "ollama",
      operation: "model_inventory",
      outcome: {
        status: "response",
        http_status: 200,
        content_type: "application/json",
        normalized_response: {
          model: "qwen3:8b",
          digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        }
      }
    });
    capture_sink.record({
      capture_phase: "qualification",
      provider: "ollama",
      operation: "chat",
      outcome: {
        status: "response",
        http_status: 200,
        content_type: "application/json",
        normalized_response: {
          model: "qwen3:8b",
          verified_ollama_digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          done: true,
          message: {
            role: "assistant",
            parsed: {
              schema_version: "sandbox-security-local-model.v1",
              status: "no_match",
              candidates: []
            }
          }
        }
      }
    });
    return {
      evaluate: async () => {
        decisionCount += 1;
        return {
          schema_version: "sandbox-security-decision.v1",
          decision_id: "permission-smoke-" + decisionCount,
          request_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          evaluation_mode: "simulation",
          stage: "user_input",
          policy_profile_id: "sandbox-security-balanced.v1",
          verdict: "no_detected_risk",
          action: decisionCount === 1 ? "allow" : "deny",
          risk_level: "info",
          findings: [],
          detector_runs: [],
          evidence_refs: [],
          created_at: "2026-07-22T00:00:00.000Z"
        };
      }
    };
  }
});

process.stdout.write(JSON.stringify({
  candidate_root: result.candidate_root,
  decisions_tree_sha256: result.decisions_tree_sha256,
  candidate_package_sha256: result.candidate_package_sha256
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

function runCaptureChildWithoutLiveConfig(
  bundle: Readonly<SandboxSecurityCaptureBundle>
): Readonly<{ status: number | null; stderr: string }> {
  const command = buildSandboxSecurityCaptureChildCommand(bundle);
  const result = spawnSync(command.exec_path, [...command.args], {
    cwd: command.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      LANG: "C"
    }
  });
  return {
    status: result.status,
    stderr: result.stderr
  };
}

function runCaptureChildWithOverbroadPermission(
  bundle: Readonly<SandboxSecurityCaptureBundle>,
  scope: "read" | "write"
): Readonly<{ status: number | null; stderr: string }> {
  const command = buildSandboxSecurityCaptureChildCommand(bundle);
  const entrypointIndex = command.args.indexOf(command.entrypoint);
  assert.notEqual(entrypointIndex, -1);
  const result = spawnSync(
    command.exec_path,
    [
      "--experimental-strip-types",
      "--permission",
      ...(scope === "read"
        ? ["--allow-fs-read=/"]
        : command.allow_fs_read.map((path) => `--allow-fs-read=${path}`)),
      ...(scope === "write"
        ? ["--allow-fs-write=/"]
        : command.allow_fs_write.map((path) => `--allow-fs-write=${path}`)),
      ...command.args.slice(entrypointIndex)
    ],
    {
      cwd: command.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: "C"
      }
    }
  );
  return {
    status: result.status,
    stderr: result.stderr
  };
}

function runPermissionedCaptureSmoke(
  bundle: Readonly<SandboxSecurityCaptureBundle>,
  materialize = true
): Readonly<{
  status: number | null;
  stdout: string;
  stderr: string;
  binding: string;
  candidate_package_sha256: string | null;
}> {
  const probePath = join(
    bundle.root,
    "code",
    "scripts/benchmark/sandbox-security/permission-capture-smoke.mjs"
  );
  const command = buildSandboxSecurityCaptureChildCommand(bundle);
  writePermissionedCaptureSmokeProbe(probePath);

  const result = spawnSync(
    command.exec_path,
    [
      "--experimental-strip-types",
      "--permission",
      ...command.allow_fs_read.map((path) => `--allow-fs-read=${path}`),
      ...command.allow_fs_write.map((path) => `--allow-fs-write=${path}`),
      probePath,
      JSON.stringify({
        bundle_root: bundle.root,
        input_root: bundle.input_root,
        capture_output_root: bundle.capture_output_root,
        capture_output_binding: command.args
          .find((arg) => arg.startsWith("--capture-output-binding="))
          ?.slice("--capture-output-binding=".length),
        inputs_tree_sha256: bundle.inputs_tree_sha256
      })
    ],
    {
      cwd: command.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: "C"
      }
    }
  );
  const binding = command.args
    .find((arg) => arg.startsWith("--capture-output-binding="))
    ?.slice("--capture-output-binding=".length);
  assert.equal(typeof binding, "string");
  let candidatePackageSha256: string | null = null;
  if (result.status === 0) {
    const summary = JSON.parse(result.stdout) as {
      candidate_package_sha256: string;
    };
    candidatePackageSha256 = summary.candidate_package_sha256;
    if (materialize) {
      materializeSandboxSecurityCandidatePackage({
        capture_output_root: bundle.capture_output_root,
        capture_output_binding: binding!,
        fixture_ids: ["ssb-v1-0001", "ssb-v1-0002"],
        candidate_package_sha256: summary.candidate_package_sha256
      });
    }
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    binding: binding!,
    candidate_package_sha256: candidatePackageSha256
  };
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
  assert.ok(
    bundle.capture_live_entrypoint.startsWith(join(bundle.root, "code", "")),
    "capture child entrypoint must be the materialized code mirror"
  );
  assert.equal(
    bundle.read_allowlist.some((path) => path.startsWith(REPO_ROOT)),
    false,
    "capture child must not retain repository source read capability"
  );

  const serialized = JSON.stringify(bundle);
  assert.doesNotMatch(
    serialized,
    /primary_category|ground_truth_severity|verdict_class|unsafe_recall|OPENAI_API_KEY|SANDBOX_SECURITY_JUDGE_API_KEY/
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
    "dynamic_import",
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
    assert.equal(
      command.entrypoint.startsWith(join(bundle.root, "code", "")),
      true,
      "child must execute the mirrored fixed entrypoint"
    );
    assert.equal(
      command.allow_fs_read.some((path) => path.startsWith(REPO_ROOT)),
      false,
      "child must not read mutable repository code"
    );
    assert.doesNotMatch(
      command.args.join(" "),
      /truth|evaluate|metrics|OPENAI_API_KEY|SANDBOX_SECURITY_JUDGE_API_KEY/
    );
    assert.ok(command.args.includes("--permission"));
    for (const dependency of [
      join(bundle.root, "code", "scripts/benchmark/sandbox-security/contracts.ts"),
      join(bundle.root, "code", "scripts/benchmark/sandbox-security/capture-sink.ts"),
      join(
        bundle.root,
        "code",
        "engines/sandbox/src/security-production/openai-chat-judge-contract.ts"
      ),
      join(
        bundle.root,
        "code",
        "engines/sandbox/src/security-production/openai-judge-contract.ts"
      ),
      join(
        bundle.root,
        "code",
        "engines/sandbox/src/security-production/judge-protocol-adapter.ts"
      )
    ]) {
      assert.equal(
        existsSync(dependency),
        true,
        `capture child must contain mirrored dependency: ${dependency}`
      );
      assert.ok(
        command.allow_fs_read.some(
          (path) => dependency === path || dependency.startsWith(`${path}${sep}`)
        ),
        `capture child must be able to load mirrored dependency: ${dependency}`
      );
    }
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

test("REQ-SBX-GENERAL-002 parent rejects cloned capture bundles with caller-supplied code hash", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-cloned-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const clonedBundle = Object.freeze({
    ...bundle,
    code_tree_sha256: hashSandboxSecurityBenchmarkTree(join(bundle.root, "code"))
  });

  assert.notEqual(clonedBundle, bundle);
  await assert.rejects(
    () => launchSandboxSecurityCaptureChild({ bundle: clonedBundle }),
    /bundle.*authority|prepared.*bundle|unsupported.*bundle/i
  );
});

test("REQ-SBX-GENERAL-002 capture child forwards exactly six approved environment keys", () => {
  const environment = selectSandboxSecurityCaptureChildEnvironment({
    SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: "synthetic-digest",
    SANDBOX_SECURITY_JUDGE_PROTOCOL: "openai_chat_completions_json_v1",
    SANDBOX_SECURITY_JUDGE_BASE_URL: "https://judge.example.test/v1",
    SANDBOX_SECURITY_JUDGE_MODEL: "synthetic-model",
    SANDBOX_SECURITY_JUDGE_API_KEY: "synthetic-key",
    SANDBOX_SECURITY_ENABLE_JUDGE: "1",
    OPENAI_BASE_URL: "forbidden-alias",
    OPENAI_MODEL: "forbidden-alias",
    OPENAI_API_KEY: "forbidden-alias",
    SANDBOX_SECURITY_OPENAI_ENDPOINT: "forbidden-alias",
    SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE: "forbidden-alias",
    SANDBOX_SECURITY_JUDGE_PROTOCOL_OVERRIDE: "forbidden-alias",
    PATH: "forbidden-host-environment",
    HOME: "forbidden-host-environment",
    LANG: "forbidden-host-environment"
  });

  assert.deepEqual(Object.keys(environment), [
    "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
    "SANDBOX_SECURITY_JUDGE_PROTOCOL",
    "SANDBOX_SECURITY_JUDGE_BASE_URL",
    "SANDBOX_SECURITY_JUDGE_MODEL",
    "SANDBOX_SECURITY_JUDGE_API_KEY",
    "SANDBOX_SECURITY_ENABLE_JUDGE"
  ]);
  for (const forbidden of [
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "OPENAI_API_KEY",
    "SANDBOX_SECURITY_OPENAI_ENDPOINT",
    "SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE",
    "SANDBOX_SECURITY_JUDGE_PROTOCOL_OVERRIDE",
    "PATH",
    "HOME",
    "LANG"
  ]) {
    assert.equal(Object.hasOwn(environment, forbidden), false, forbidden);
  }
});

test("REQ-SBX-GENERAL-002 mirrored permission child rejects absent live config instead of failing module resolution", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-module-resolution-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });

  const result = runCaptureChildWithoutLiveConfig(bundle);

  assert.equal(
    result.status,
    1,
    `permission child must fail closed for absent config: stderr=${result.stderr}`
  );
  assert.match(
    result.stderr,
    /"error_code":"sandbox_security_capture_live_reject:missing_live_config"/
  );
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
  assert.equal(existsSync(join(bundle.capture_output_root, "candidate")), false);
});

test("REQ-SBX-GENERAL-002 production capture rejects overbroad read and write grants", async () => {
  for (const scope of ["read", "write"] as const) {
    const tempBundleRoot = tempRoot(`ssb-capture-bundle-overbroad-${scope}-`);
    const bundle = await prepareSandboxSecurityCaptureBundle({
      corpus_root: COMMITTED_CORPUS_ROOT,
      output_root: tempBundleRoot
    });

    const result = runCaptureChildWithOverbroadPermission(bundle, scope);

    assert.equal(result.status, 1, `overbroad ${scope} permission must fail`);
    assert.match(
      result.stderr,
      new RegExp(
        `"error_code":"sandbox_security_capture_live_reject:fs_${scope}_permission_scope_invalid"`
      )
    );
    assert.doesNotMatch(result.stderr, /missing_live_config/u);
    assert.equal(existsSync(join(bundle.capture_output_root, "candidate")), false);
  }
});

test("REQ-SBX-GENERAL-002 capture child receives one precreated file write capability", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-file-capability-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const command = buildSandboxSecurityCaptureChildCommand(bundle);

  assert.equal(command.allow_fs_write.length, 1);
  const writeTarget = command.allow_fs_write[0]!;
  assert.notEqual(writeTarget, bundle.capture_output_root);
  assert.equal(dirname(writeTarget), bundle.capture_output_root);
  assert.equal(lstatSync(writeTarget).isFile(), true);
  assert.equal(lstatSync(writeTarget).isSymbolicLink(), false);
  assert.equal(bundle.read_allowlist.includes(writeTarget), false);
});

test("REQ-SBX-GENERAL-002 parent rejects a concurrent production capture reservation", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-parent-concurrent-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  mkdirSync(join(bundle.capture_output_root, ".capture-launch-lock"), {
    mode: 0o700
  });

  await assert.rejects(
    () => launchSandboxSecurityCaptureChild({ bundle }),
    /capture_in_progress/i
  );
  for (const name of ["candidate", "capture.json", "replay", "seal.json"]) {
    assert.equal(existsSync(join(bundle.capture_output_root, name)), false);
  }
});

test("REQ-SBX-GENERAL-002 parent releases the production capture reservation after child failure", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-parent-cleanup-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const launchLock = join(bundle.capture_output_root, ".capture-launch-lock");

  const result = await launchSandboxSecurityCaptureChild({ bundle });

  assert.equal(result.exit_code, 1);
  assert.equal(existsSync(launchLock), false);
  assert.equal(existsSync(join(bundle.capture_output_root, "candidate")), false);
});

test("REQ-SBX-P6-RETRY stream child accepts the parent's atomic running projection before readiness", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-stream-projection-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });

  const result = await launchSandboxSecurityCaptureChild({ bundle });

  assert.equal(result.exit_code, 1);
  assert.match(result.stderr, /missing_live_config/u);
  assert.doesNotMatch(result.stderr, /capture_output_binding_changed/u);
});

test("REQ-SBX-GENERAL-002 permissioned capture can write a candidate with output kept write-only", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-permissioned-smoke-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });

  const result = runPermissionedCaptureSmoke(bundle);

  assert.equal(
    result.status,
    0,
    `permissioned capture smoke failed: stderr=${result.stderr}`
  );
  assert.match(result.stdout, /candidate_root/);
  assert.equal(existsSync(join(bundle.capture_output_root, "candidate", "package.json")), true);
  const summary = JSON.parse(result.stdout) as { decisions_tree_sha256: string };
  assert.equal(
    summary.decisions_tree_sha256,
    hashSandboxSecurityBenchmarkTree(
      join(bundle.capture_output_root, "candidate", "decisions")
    )
  );
  assert.equal(bundle.read_allowlist.includes(bundle.capture_output_root), false);
});

test("REQ-SBX-GENERAL-002 in-process permissioned evaluator authority is removed", async () => {
  const module = await import(
    "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
  );
  assert.equal(
    "evaluateSandboxSecurityPermissionedCapture" in module,
    false,
    "in-process evaluator authority must not exist"
  );
});

test("REQ-SBX-GENERAL-002 parent rejects staging hash mismatch without publishing artifacts", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-staging-hash-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const result = runPermissionedCaptureSmoke(bundle, false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(typeof result.candidate_package_sha256, "string");
  const stagingPath = join(bundle.capture_output_root, ".candidate-package.json");
  writeFileSync(stagingPath, `${readFileSync(stagingPath, "utf8")}\n`);

  assert.throws(
    () =>
      materializeSandboxSecurityCandidatePackage({
        capture_output_root: bundle.capture_output_root,
        capture_output_binding: result.binding,
        fixture_ids: ["ssb-v1-0001", "ssb-v1-0002"],
        candidate_package_sha256: result.candidate_package_sha256!
      }),
    /candidate_package_hash_mismatch/i
  );
  for (const name of ["candidate", "capture.json", "replay", "seal.json"]) {
    assert.equal(existsSync(join(bundle.capture_output_root, name)), false);
  }
});

test("REQ-SBX-GENERAL-002 materializer cleans temporary output on post-write hash mismatch", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-materialize-cleanup-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const result = runPermissionedCaptureSmoke(bundle, false);
  assert.equal(result.status, 0, result.stderr);
  const stagingPath = join(bundle.capture_output_root, ".candidate-package.json");
  const envelope = JSON.parse(readFileSync(stagingPath, "utf8")) as {
    package: { decisions_tree_sha256: string };
  };
  envelope.package.decisions_tree_sha256 =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const serialized = `${JSON.stringify(envelope)}\n`;
  writeFileSync(stagingPath, serialized);
  const tamperedSha256 = sha256Text(serialized);

  assert.throws(
    () =>
      materializeSandboxSecurityCandidatePackage({
        capture_output_root: bundle.capture_output_root,
        capture_output_binding: result.binding,
        fixture_ids: ["ssb-v1-0001", "ssb-v1-0002"],
        candidate_package_sha256: tamperedSha256
      }),
    /candidate_staging_hash_mismatch/i
  );
  assert.equal(existsSync(join(bundle.capture_output_root, "candidate")), false);
  assert.equal(
    readdirSync(bundle.capture_output_root).some((name) =>
      /^\.candidate-[a-f0-9]{64}\.tmp$/u.test(name)
    ),
    false
  );
  for (const name of ["capture.json", "replay", "seal.json"]) {
    assert.equal(existsSync(join(bundle.capture_output_root, name)), false);
  }
});

test("REQ-SBX-GENERAL-002 prepare preserves an existing capture bundle instead of deleting its candidate", async () => {
  const outputRoot = tempRoot("ssb-capture-bundle-preserve-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: outputRoot
  });
  const candidateRoot = join(bundle.capture_output_root, "candidate");
  mkdirSync(candidateRoot);
  writeFileSync(join(candidateRoot, "retained.txt"), "retain\n");

  await assert.rejects(
    () =>
      prepareSandboxSecurityCaptureBundle({
        corpus_root: COMMITTED_CORPUS_ROOT,
        output_root: outputRoot
      }),
    /bundle.*already.*exists|capture_bundle.*exists/i
  );
  assert.equal(readFileSync(join(candidateRoot, "retained.txt"), "utf8"), "retain\n");
});

test("REQ-SBX-GENERAL-002 parent revalidates a symlink-swapped capture output before launch", async () => {
  const outputRoot = tempRoot("ssb-capture-bundle-revalidate-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: outputRoot
  });
  const detachedOutput = join(outputRoot, "detached-capture-output");
  renameSync(bundle.capture_output_root, detachedOutput);
  symlinkSync(detachedOutput, bundle.capture_output_root);

  assert.throws(
    () => buildSandboxSecurityCaptureChildCommand(bundle),
    /symlink|capture.*output|bundle/i
  );
});

test("REQ-SBX-GENERAL-002 permission child rejects staging replacement after command construction", async () => {
  const tempBundleRoot = tempRoot("ssb-capture-bundle-staging-replacement-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const command = buildSandboxSecurityCaptureChildCommand(bundle);
  const stagingPath = command.allow_fs_write[0]!;
  renameSync(stagingPath, `${stagingPath}.detached`);
  writeFileSync(stagingPath, "", { flag: "wx", mode: 0o600 });

  const result = spawnSync(command.exec_path, [...command.args], {
    cwd: command.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      LANG: "C"
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /capture_output_binding_changed/i);
  assert.doesNotMatch(result.stderr, /missing_live_config/i);
  for (const name of ["candidate", "capture.json", "replay", "seal.json"]) {
    assert.equal(existsSync(join(bundle.capture_output_root, name)), false);
  }
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

test("REQ-SBX-GENERAL-002 permission probe only counts ERR_ACCESS_DENIED and requires existing forbidden targets", async () => {
  const tempBundleRoot = tempRoot("ssb-perm-strict-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const result = await runPermissionDeniedProbe(bundle);
  assert.deepEqual(result.denied_attempts, [
    "direct",
    "directory",
    "dynamic_import",
    "relative",
    "symlink"
  ]);
});

interface MutableSnapshotFsExports {
  openSync: typeof import("node:fs").openSync;
  readFileSync: typeof import("node:fs").readFileSync;
  readSync: typeof import("node:fs").readSync;
  readdirSync: typeof import("node:fs").readdirSync;
}

const mutableSnapshotFs = createRequire(import.meta.url)(
  "node:fs"
) as MutableSnapshotFsExports;

type SandboxSecurityFsSnapshotFunction = (
  input: unknown
) => Readonly<Record<string, unknown>>;

const fsSnapshotModule: Readonly<Record<string, unknown>> = await import(
  "../../scripts/benchmark/sandbox-security/fs-snapshot.ts"
).catch(() => Object.freeze({}));

function requireSandboxSecurityFsSnapshotExport(
  name: string
): SandboxSecurityFsSnapshotFunction {
  const candidate = fsSnapshotModule[name];
  assert.equal(
    typeof candidate,
    "function",
    `fs_snapshot_export_missing:${name}`
  );
  return candidate as SandboxSecurityFsSnapshotFunction;
}

function snapshotTempRoot(prefix: string): string {
  return realpathSync(tempRoot(prefix));
}

test("REQ-SBX-GENERAL-002 fs snapshot rejects accessor inputs without invoking getters", () => {
  const snapshotFile = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityFile"
  );
  const snapshotJson = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityJson"
  );
  const snapshotDirectory = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityDirectory"
  );
  const writeExclusive = requireSandboxSecurityFsSnapshotExport(
    "writeSandboxSecurityExclusiveAtomicFile"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-getter-");
  const filePath = join(root, "input.json");
  writeFileSync(filePath, "{\"ok\":true}\n");

  let getterCalls = 0;
  const buildInput = (
    fixed: Record<string, unknown>,
    getterKey: string,
    getterValue: unknown
  ): Record<string, unknown> => {
    const input: Record<string, unknown> = { ...fixed };
    Object.defineProperty(input, getterKey, {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return getterValue;
      }
    });
    return input;
  };

  assert.throws(
    () =>
      snapshotFile(
        buildInput({ real_root: root, max_bytes: 4096 }, "path", filePath)
      ),
    /sandbox_security_fs_snapshot_reject:input_invalid/u
  );
  assert.throws(
    () =>
      snapshotJson(
        buildInput({ real_root: root, max_bytes: 4096 }, "path", filePath)
      ),
    /sandbox_security_fs_snapshot_reject:input_invalid/u
  );
  assert.throws(
    () =>
      snapshotDirectory(
        buildInput(
          { real_root: root, expected_entries: ["input.json"] },
          "path",
          root
        )
      ),
    /sandbox_security_fs_snapshot_reject:input_invalid/u
  );
  assert.throws(
    () =>
      writeExclusive(
        buildInput(
          { real_root: root, path: join(root, "out.json") },
          "data",
          "payload"
        )
      ),
    /sandbox_security_fs_snapshot_reject:input_invalid/u
  );
  assert.equal(getterCalls, 0);
});

test("REQ-SBX-GENERAL-002 fs snapshot rejects symlink and hardlink files", () => {
  const snapshotFile = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityFile"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-links-");
  const target = join(root, "target.json");
  writeFileSync(target, "{\"target\":true}\n");
  symlinkSync(target, join(root, "alias.json"));
  assert.throws(
    () =>
      snapshotFile({
        real_root: root,
        path: join(root, "alias.json"),
        max_bytes: 4096
      }),
    /sandbox_security_fs_snapshot_reject:snapshot_symlink/u
  );
  linkSync(target, join(root, "hard.json"));
  assert.throws(
    () => snapshotFile({ real_root: root, path: target, max_bytes: 4096 }),
    /sandbox_security_fs_snapshot_reject:snapshot_link_count_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 fs snapshot rejects paths outside the bound real root", () => {
  const snapshotFile = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityFile"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-outside-");
  const boundRoot = join(root, "bound");
  mkdirSync(boundRoot);
  const escapePath = join(root, "escape.json");
  writeFileSync(escapePath, "{}\n");
  assert.throws(
    () =>
      snapshotFile({ real_root: boundRoot, path: escapePath, max_bytes: 4096 }),
    /sandbox_security_fs_snapshot_reject:snapshot_path_outside_root/u
  );
  assert.throws(
    () =>
      snapshotFile({
        real_root: boundRoot,
        path: `${boundRoot}${sep}..${sep}escape.json`,
        max_bytes: 4096
      }),
    /sandbox_security_fs_snapshot_reject:snapshot_path_invalid/u
  );

  const aliasTarget = join(root, "alias-target");
  mkdirSync(aliasTarget);
  writeFileSync(join(aliasTarget, "aliased.json"), "{}\n");
  symlinkSync(aliasTarget, join(boundRoot, "lnk"));
  assert.throws(
    () =>
      snapshotFile({
        real_root: boundRoot,
        path: join(boundRoot, "lnk", "aliased.json"),
        max_bytes: 4096
      }),
    /sandbox_security_fs_snapshot_reject:snapshot_parent_alias/u
  );

  const bigPath = join(boundRoot, "big.json");
  writeFileSync(bigPath, `{"pad":"${"x".repeat(5000)}"}\n`);
  assert.throws(
    () => snapshotFile({ real_root: boundRoot, path: bigPath, max_bytes: 4096 }),
    /sandbox_security_fs_snapshot_reject:snapshot_too_large/u
  );
});

test("REQ-SBX-GENERAL-002 fs snapshot rejects replacement between open and descriptor read", () => {
  const snapshotFile = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityFile"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-replace-");
  const target = join(root, "target.json");
  const replacement = join(root, "replacement.json");
  writeFileSync(target, "{\"version\":1}\n");
  writeFileSync(replacement, "{\"version\":2}\n");

  const originalOpenSync = mutableSnapshotFs.openSync;
  let replacements = 0;
  mutableSnapshotFs.openSync = ((...args: unknown[]) => {
    if (args[0] === target && replacements === 0) {
      replacements += 1;
      renameSync(replacement, target);
    }
    return Reflect.apply(originalOpenSync, mutableSnapshotFs, args) as number;
  }) as typeof originalOpenSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => snapshotFile({ real_root: root, path: target, max_bytes: 4096 }),
      /sandbox_security_fs_snapshot_reject:snapshot_binding_changed/u
    );
  } finally {
    mutableSnapshotFs.openSync = originalOpenSync;
    syncBuiltinESMExports();
  }
  assert.equal(replacements, 1);
});

test("REQ-SBX-GENERAL-002 fs snapshot rejects size and metadata mutation during descriptor reads", () => {
  const snapshotFile = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityFile"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-mutate-");
  const grownPath = join(root, "grown.json");
  writeFileSync(grownPath, "{\"grow\":true}\n");
  const grownSize = Number(statSync(grownPath, { bigint: true }).size);

  const originalReadSync = mutableSnapshotFs.readSync;
  let growths = 0;
  mutableSnapshotFs.readSync = ((...args: unknown[]) => {
    if (typeof args[0] === "number" && growths === 0) {
      growths += 1;
      truncateSync(grownPath, grownSize + 1);
    }
    return Reflect.apply(originalReadSync, mutableSnapshotFs, args) as number;
  }) as typeof originalReadSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => snapshotFile({ real_root: root, path: grownPath, max_bytes: 4096 }),
      /sandbox_security_fs_snapshot_reject:snapshot_binding_changed/u
    );
  } finally {
    mutableSnapshotFs.readSync = originalReadSync;
    syncBuiltinESMExports();
  }
  assert.equal(growths, 1);

  const touchedPath = join(root, "touched.json");
  writeFileSync(touchedPath, "{\"touch\":true}\n");
  const fixedTime = new Date("2026-01-02T00:00:00.000Z");
  let touches = 0;
  mutableSnapshotFs.readSync = ((...args: unknown[]) => {
    if (typeof args[0] === "number" && touches === 0) {
      touches += 1;
      utimesSync(touchedPath, fixedTime, fixedTime);
    }
    return Reflect.apply(originalReadSync, mutableSnapshotFs, args) as number;
  }) as typeof originalReadSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () =>
        snapshotFile({ real_root: root, path: touchedPath, max_bytes: 4096 }),
      /sandbox_security_fs_snapshot_reject:snapshot_binding_changed/u
    );
  } finally {
    mutableSnapshotFs.readSync = originalReadSync;
    syncBuiltinESMExports();
  }
  assert.equal(touches, 1);
});

test("REQ-SBX-GENERAL-002 fs snapshot preserves captured bytes after later path mutation", () => {
  const snapshotFile = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityFile"
  );
  const snapshotJson = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityJson"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-frozen-");
  const filePath = join(root, "data.json");
  const originalText = "{\"outer\":{\"inner\":[1,2,3]},\"flag\":true}\n";
  writeFileSync(filePath, originalText);

  const fileSnapshot = snapshotFile({
    real_root: root,
    path: filePath,
    max_bytes: 4096
  });
  const jsonSnapshot = snapshotJson({
    real_root: root,
    path: filePath,
    max_bytes: 4096
  });
  writeFileSync(filePath, "{\"outer\":\"replaced\"}\n");

  assert.equal(fileSnapshot.sha256_hex, sha256Text(originalText));
  assert.equal(
    (fileSnapshot.bytes as Buffer).toString("utf8"),
    originalText
  );
  assert.equal(Object.isFrozen(fileSnapshot), true);
  assert.equal(Object.isFrozen(jsonSnapshot), true);
  assert.deepEqual(jsonSnapshot.json, {
    flag: true,
    outer: { inner: [1, 2, 3] }
  });
  const outer = (jsonSnapshot.json as Readonly<Record<string, unknown>>).outer;
  assert.equal(Object.isFrozen(outer), true);
  assert.equal(
    Object.isFrozen((outer as Readonly<Record<string, unknown>>).inner),
    true
  );
});

test("REQ-SBX-GENERAL-002 fs snapshot json rejects prototype keys malformed encodings and truncated documents", () => {
  const snapshotJson = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityJson"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-json-");
  const protoPath = join(root, "proto.json");
  writeFileSync(protoPath, "{\"__proto__\":{\"polluted\":true}}\n");
  assert.throws(
    () => snapshotJson({ real_root: root, path: protoPath, max_bytes: 4096 }),
    /sandbox_security_fs_snapshot_reject:snapshot_json_invalid/u
  );

  const invalidUtf8Path = join(root, "invalid-utf8.json");
  writeFileSync(invalidUtf8Path, Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));
  assert.throws(
    () =>
      snapshotJson({ real_root: root, path: invalidUtf8Path, max_bytes: 4096 }),
    /sandbox_security_fs_snapshot_reject:snapshot_json_invalid/u
  );

  const truncatedPath = join(root, "truncated.json");
  writeFileSync(truncatedPath, "{\"open\":");
  assert.throws(
    () =>
      snapshotJson({ real_root: root, path: truncatedPath, max_bytes: 4096 }),
    /sandbox_security_fs_snapshot_reject:snapshot_json_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 fs directory snapshot enforces exact declared inventories", () => {
  const snapshotDirectory = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityDirectory"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-dir-");
  const dirPath = join(root, "inventory");
  mkdirSync(dirPath);
  writeFileSync(join(dirPath, "a.json"), "{}\n");
  writeFileSync(join(dirPath, "b.json"), "{}\n");

  const snapshot = snapshotDirectory({
    real_root: root,
    path: dirPath,
    expected_entries: ["a.json", "b.json"]
  });
  assert.deepEqual(snapshot.entries, [
    { kind: "file", name: "a.json" },
    { kind: "file", name: "b.json" }
  ]);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.entries), true);

  writeFileSync(join(dirPath, "c.json"), "{}\n");
  assert.throws(
    () =>
      snapshotDirectory({
        real_root: root,
        path: dirPath,
        expected_entries: ["a.json", "b.json"]
      }),
    /sandbox_security_fs_snapshot_reject:directory_snapshot_inventory_mismatch/u
  );
  assert.throws(
    () =>
      snapshotDirectory({
        real_root: root,
        path: dirPath,
        expected_entries: ["a.json", "b.json", "c.json", "d.json"]
      }),
    /sandbox_security_fs_snapshot_reject:directory_snapshot_inventory_mismatch/u
  );

  unlinkSync(join(dirPath, "c.json"));
  symlinkSync(join(dirPath, "a.json"), join(dirPath, "c.json"));
  assert.throws(
    () =>
      snapshotDirectory({
        real_root: root,
        path: dirPath,
        expected_entries: ["a.json", "b.json", "c.json"]
      }),
    /sandbox_security_fs_snapshot_reject:directory_snapshot_entry_invalid/u
  );

  unlinkSync(join(dirPath, "c.json"));
  assert.throws(
    () =>
      snapshotDirectory({
        real_root: root,
        path: dirPath,
        expected_entries: ["b.json", "a.json"]
      }),
    /sandbox_security_fs_snapshot_reject:directory_snapshot_expected_entries_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 fs directory snapshot rejects directory replacement during enumeration", () => {
  const snapshotDirectory = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityDirectory"
  );
  const base = snapshotTempRoot("ssb-fs-snapshot-dirswap-");
  const dirPath = join(base, "inventory");
  const standby = join(base, "standby");
  const retired = join(base, "retired");
  mkdirSync(dirPath);
  mkdirSync(standby);
  for (const name of ["a.json", "b.json"]) {
    writeFileSync(join(dirPath, name), "{}\n");
    writeFileSync(join(standby, name), "{}\n");
  }

  const originalReaddirSync = mutableSnapshotFs.readdirSync;
  let swaps = 0;
  mutableSnapshotFs.readdirSync = ((...args: unknown[]) => {
    const names = Reflect.apply(
      originalReaddirSync,
      mutableSnapshotFs,
      args
    ) as string[];
    if (args[0] === dirPath && swaps === 0) {
      swaps += 1;
      renameSync(dirPath, retired);
      renameSync(standby, dirPath);
    }
    return names;
  }) as typeof originalReaddirSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () =>
        snapshotDirectory({
          real_root: base,
          path: dirPath,
          expected_entries: ["a.json", "b.json"]
        }),
      /sandbox_security_fs_snapshot_reject:directory_snapshot_binding_changed/u
    );
  } finally {
    mutableSnapshotFs.readdirSync = originalReaddirSync;
    syncBuiltinESMExports();
  }
  assert.equal(swaps, 1);
});

test("REQ-SBX-GENERAL-002 fs snapshot opens read-only no-follow and reads only bounded descriptor bytes", () => {
  const snapshotFile = requireSandboxSecurityFsSnapshotExport(
    "snapshotSandboxSecurityFile"
  );
  const root = snapshotTempRoot("ssb-fs-snapshot-flags-");
  const filePath = join(root, "flags.json");
  writeFileSync(filePath, "{\"flags\":true}\n");
  const validatedSize = Number(statSync(filePath, { bigint: true }).size);

  const originalOpenSync = mutableSnapshotFs.openSync;
  const originalReadFileSync = mutableSnapshotFs.readFileSync;
  const originalReadSync = mutableSnapshotFs.readSync;
  let observedFlags: number | undefined;
  let readFileCalls = 0;
  const requestedLengths: number[] = [];
  mutableSnapshotFs.openSync = ((...args: unknown[]) => {
    if (args[0] === filePath) observedFlags = args[1] as number;
    return Reflect.apply(originalOpenSync, mutableSnapshotFs, args) as number;
  }) as typeof originalOpenSync;
  mutableSnapshotFs.readFileSync = ((...args: unknown[]) => {
    if (args[0] === filePath || typeof args[0] === "number") {
      readFileCalls += 1;
    }
    return Reflect.apply(
      originalReadFileSync,
      mutableSnapshotFs,
      args
    ) as Buffer;
  }) as typeof originalReadFileSync;
  mutableSnapshotFs.readSync = ((...args: unknown[]) => {
    if (typeof args[0] === "number") {
      requestedLengths.push(args[3] as number);
    }
    return Reflect.apply(originalReadSync, mutableSnapshotFs, args) as number;
  }) as typeof originalReadSync;
  syncBuiltinESMExports();
  try {
    snapshotFile({ real_root: root, path: filePath, max_bytes: 4096 });
  } finally {
    mutableSnapshotFs.openSync = originalOpenSync;
    mutableSnapshotFs.readFileSync = originalReadFileSync;
    mutableSnapshotFs.readSync = originalReadSync;
    syncBuiltinESMExports();
  }

  assert.equal(
    observedFlags,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  assert.equal(readFileCalls, 0);
  assert.ok(requestedLengths.length > 0);
  assert.equal(
    requestedLengths.every((length) => length <= validatedSize + 1),
    true
  );
});

const stageProtocolModule: Readonly<Record<string, unknown>> = await import(
  "../../scripts/benchmark/sandbox-security/stage-protocol.ts"
).catch(() => Object.freeze({}));

function requireSandboxSecurityStageProtocolExport(
  name: string
): (...args: readonly unknown[]) => unknown {
  const candidate = stageProtocolModule[name];
  assert.equal(
    typeof candidate,
    "function",
    `stage_protocol_export_missing:${name}`
  );
  return candidate as (...args: readonly unknown[]) => unknown;
}

const SANDBOX_SECURITY_LIVE_ENVIRONMENT_KEYS = [
  "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
  "SANDBOX_SECURITY_JUDGE_PROTOCOL",
  "SANDBOX_SECURITY_JUDGE_BASE_URL",
  "SANDBOX_SECURITY_JUDGE_MODEL",
  "SANDBOX_SECURITY_JUDGE_API_KEY",
  "SANDBOX_SECURITY_ENABLE_JUDGE"
] as const;

test("REQ-SBX-GENERAL-002 worker environment constructors are closed and reject caller maps", () => {
  const constructorNames = [
    "createSandboxSecurityPrepareWorkerEnvironment",
    "createSandboxSecurityCaptureWorkerEnvironment",
    "createSandboxSecurityEvaluateWorkerEnvironment",
    "createSandboxSecuritySealWorkerEnvironment"
  ] as const;
  for (const name of constructorNames) {
    const build = requireSandboxSecurityStageProtocolExport(name);
    assert.equal(build.length, 0, `${name} accepts parameters`);
    assert.throws(
      () =>
        build({
          SANDBOX_SECURITY_JUDGE_API_KEY: "forbidden-caller-credential"
        }),
      /sandbox_security_stage_reject:environment_arguments_forbidden/u,
      `${name} accepted a caller map`
    );
    const environment = build() as Readonly<Record<string, string>>;
    assert.equal(Object.isFrozen(environment), true);
    for (const liveKey of SANDBOX_SECURITY_LIVE_ENVIRONMENT_KEYS) {
      assert.equal(
        liveKey in environment,
        false,
        `${name} exposed ${liveKey}`
      );
    }
    assert.equal("NODE_OPTIONS" in environment, false);
    assert.deepEqual(environment, { NODE_NO_WARNINGS: "1" });
  }
});

test("REQ-SBX-GENERAL-002 worker environment absence guard rejects present live variables", () => {
  const assertAbsent = requireSandboxSecurityStageProtocolExport(
    "assertSandboxSecurityLiveEnvironmentAbsent"
  );
  assert.throws(
    () =>
      assertAbsent({ SANDBOX_SECURITY_ENABLE_JUDGE: "1" }),
    /sandbox_security_stage_reject:environment_arguments_forbidden/u
  );

  // The shared test process may carry leaked live variables from other suites;
  // snapshot and clear the six before exercising the ambient-env guard.
  const previous = new Map(
    SANDBOX_SECURITY_LIVE_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]])
  );
  for (const key of SANDBOX_SECURITY_LIVE_ENVIRONMENT_KEYS) {
    delete process.env[key];
  }
  try {
    assertAbsent();
    process.env.SANDBOX_SECURITY_ENABLE_JUDGE = "1";
    assert.throws(
      () => assertAbsent(),
      /sandbox_security_stage_reject:live_environment_present/u
    );
    delete process.env.SANDBOX_SECURITY_ENABLE_JUDGE;
    assertAbsent();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

const PREPARE_LIVE_WORKER_PATH = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/prepare-live-worker.ts"
);
const CAPTURE_LIVE_WORKER_PATH = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/capture-live-worker.ts"
);
const CAPTURE_CANDIDATE_PATH = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/capture-candidate.ts"
);

function staticImportSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  const pattern =
    /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]!);
  }
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
  while ((match = dynamicPattern.exec(source)) !== null) {
    specifiers.push(match[1]!);
  }
  return specifiers;
}

test("REQ-SBX-GENERAL-002 prepare live worker imports no production, evaluator, or sealer code", () => {
  assert.equal(existsSync(PREPARE_LIVE_WORKER_PATH), true);
  const specifiers = staticImportSpecifiers(
    readFileSync(PREPARE_LIVE_WORKER_PATH, "utf8")
  );
  for (const specifier of specifiers) {
    assert.doesNotMatch(specifier, /security-production/u, specifier);
    assert.doesNotMatch(specifier, /\/security\//u, specifier);
    assert.doesNotMatch(specifier, /(?:^|\/)evaluate\.ts$/u, specifier);
    assert.doesNotMatch(specifier, /(?:^|\/)seal\.ts$/u, specifier);
    assert.doesNotMatch(specifier, /capture-live(?:-worker)?\.ts$/u, specifier);
  }
});

test("REQ-SBX-GENERAL-002 capture live worker imports no truth, evaluator, or sealer code", () => {
  assert.equal(existsSync(CAPTURE_LIVE_WORKER_PATH), true);
  const specifiers = staticImportSpecifiers(
    readFileSync(CAPTURE_LIVE_WORKER_PATH, "utf8")
  );
  for (const specifier of specifiers) {
    assert.doesNotMatch(specifier, /(?:^|\/)evaluate\.ts$/u, specifier);
    assert.doesNotMatch(specifier, /(?:^|\/)seal\.ts$/u, specifier);
    assert.doesNotMatch(specifier, /truth/iu, specifier);
  }
});

test("REQ-SBX-GENERAL-002 capture candidate module owns materialization and is production-neutral", async () => {
  assert.equal(existsSync(CAPTURE_CANDIDATE_PATH), true);
  const candidateModule = await import(
    "../../scripts/benchmark/sandbox-security/capture-candidate.ts"
  );
  assert.equal(
    typeof candidateModule.materializeSandboxSecurityCandidatePackage,
    "function"
  );
  const specifiers = staticImportSpecifiers(
    readFileSync(CAPTURE_CANDIDATE_PATH, "utf8")
  );
  for (const specifier of specifiers) {
    assert.doesNotMatch(specifier, /security-production/u, specifier);
    assert.doesNotMatch(specifier, /(?:^|\/)evaluate\.ts$/u, specifier);
    assert.doesNotMatch(specifier, /(?:^|\/)seal\.ts$/u, specifier);
  }
});

test("REQ-SBX-GENERAL-002 prepare bundle module retains no in-process receipt authorities", async () => {
  const module = (await import(
    "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
  )) as Readonly<Record<string, unknown>>;
  assert.equal(
    "evaluateSandboxSecurityPermissionedCapture" in module,
    false,
    "in-process evaluator authority must be removed"
  );
  assert.equal(
    "consumeSandboxSecurityAcceptedEvaluationReceipt" in module,
    false,
    "in-process evaluation receipt consumer must be removed"
  );
  assert.equal(
    typeof module.normalizeSandboxSecurityPreparedBundleDescriptor,
    "function",
    "serializable prepared-bundle descriptor normalization must exist"
  );
});

test("REQ-SBX-GENERAL-002 prepared bundle descriptor is an exact serializable record with revalidatable hashes", async () => {
  const module = (await import(
    "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
  )) as Readonly<{
    normalizeSandboxSecurityPreparedBundleDescriptor?: (
      input: unknown
    ) => Readonly<Record<string, unknown>>;
  }>;
  const normalize = module.normalizeSandboxSecurityPreparedBundleDescriptor;
  assert.equal(typeof normalize, "function");
  if (typeof normalize !== "function") return;

  const tempBundleRoot = tempRoot("ssb-descriptor-");
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: COMMITTED_CORPUS_ROOT,
    output_root: tempBundleRoot
  });
  const descriptor = normalize(bundle);
  assert.deepEqual(Object.keys(descriptor).sort(), [
    "bundle_root",
    "capture_output_root",
    "code_tree_sha256",
    "fixture_count",
    "fixture_ids",
    "input_root",
    "inputs_tree_sha256",
    "schema_version"
  ]);
  assert.equal(descriptor.schema_version, "sandbox-security-prepared-bundle-descriptor.v1");
  assert.equal(descriptor.bundle_root, bundle.root);
  assert.equal(descriptor.inputs_tree_sha256, bundle.inputs_tree_sha256);
  assert.equal(descriptor.code_tree_sha256, bundle.code_tree_sha256);
  assert.equal(descriptor.fixture_count, bundle.fixture_ids.length);
  assert.equal(Object.isFrozen(descriptor), true);

  const serialized = JSON.stringify(descriptor);
  const roundTripped = normalize(JSON.parse(serialized));
  assert.equal(JSON.stringify(roundTripped), serialized);

  let getterInvoked = false;
  const accessorInput: Record<string, unknown> = { ...descriptor };
  Object.defineProperty(accessorInput, "bundle_root", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return bundle.root;
    }
  });
  assert.throws(() => normalize(accessorInput));
  assert.equal(getterInvoked, false);
});
