/**
 * P6 Stage 2: credentialed capture authority.
 *
 * The only worker that receives the closed six-variable live environment. It
 * reconstructs the prepared bundle from its descriptor, revalidates code/input
 * hashes, launches the Node --permission capture child, and emits exactly one
 * capture_complete frame carrying the content-free capture binding. It never
 * reads corpus truth, imports the evaluator, or imports the sealer.
 */

import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  launchSandboxSecurityCaptureChild,
  reconstructSandboxSecurityCaptureBundleFromDescriptor
} from "./prepare-capture-bundle.ts";
import {
  hashSandboxSecurityBenchmarkCanonicalJson,
  hashSandboxSecurityBenchmarkTree,
  normalizeSandboxSecurityBenchmarkCandidateCaptureManifest,
  normalizeSandboxSecurityBenchmarkCandidatePackage
} from "./contracts.ts";
import {
  assertSandboxSecurityLiveRootBinding,
  snapshotSandboxSecurityJson,
  type SandboxSecurityJsonSnapshot
} from "./fs-snapshot.ts";
import {
  verifySandboxSecurityP6LiveJudgeBinding
} from "./p6-live-judge-binding.ts";
import {
  classifySandboxSecurityFailedStage
} from "./stage-protocol.ts";

const INVALID = "sandbox_security_capture_worker_reject";
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_CANDIDATE_FILE_BYTES = 16 * 1024 * 1024;

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function safeCliErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.length <= 160 &&
    /^(?:sandbox_security_[a-z_]+_reject|capture_bundle_(?:invalid|reject)|corpus_validation_failed):[a-z0-9_]+(?::[a-z0-9_./:-]+)?$/u.test(
      message
    )
    ? message
    : `${INVALID}:internal`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) fail(code);
  return value;
}

function requireSha256(value: unknown, code: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
  return value;
}

export function classifySandboxSecurityCaptureChildFailure(
  stderr: string
): string {
  const classified = classifySandboxSecurityFailedStage({
    exit_code: 1,
    stdout: "",
    stderr
  });
  return classified.startsWith("sandbox_security_capture_live_reject:")
    ? classified
    : `${INVALID}:capture_child_failed`;
}

function loadCandidateJson(
  candidateRoot: string,
  name: string
): SandboxSecurityJsonSnapshot {
  return snapshotSandboxSecurityJson({
    real_root: candidateRoot,
    path: join(candidateRoot, name),
    max_bytes: MAX_CANDIDATE_FILE_BYTES
  });
}

function buildCaptureBinding(input: Readonly<{
  candidate_root: string;
  bundle_descriptor_sha256: string;
  inputs_tree_sha256: string;
  code_tree_sha256: string;
}>): Readonly<Record<string, unknown>> {
  const packageSnapshot = loadCandidateJson(input.candidate_root, "package.json");
  const manifestSnapshot = loadCandidateJson(
    input.candidate_root,
    "capture-manifest.json"
  );
  const candidatePackage = normalizeSandboxSecurityBenchmarkCandidatePackage(
    packageSnapshot.json
  );
  const manifest = normalizeSandboxSecurityBenchmarkCandidateCaptureManifest(
    manifestSnapshot.json
  );

  const manifestRecord = manifestSnapshot.json as Readonly<
    Record<string, unknown>
  >;
  // Bind the three candidate files to each other: the package's declared manifest
  // hash must equal the canonical hash of the manifest we snapshotted, and the
  // package's inputs tree must match the manifest and the reconstructed bundle.
  // This anchors the signed capture binding to the exact content the sandboxed
  // permission child materialized, not to a candidate rewritten afterward.
  const candidatePackageSha256 = hashSandboxSecurityBenchmarkCanonicalJson(
    candidatePackage
  );
  if (
    candidatePackage.capture_manifest_sha256 !==
    hashSandboxSecurityBenchmarkCanonicalJson(manifest)
  ) {
    fail("capture_binding_manifest_hash_mismatch");
  }
  if (
    candidatePackage.inputs_tree_sha256 !== input.inputs_tree_sha256 ||
    manifest.inputs_tree_sha256 !== input.inputs_tree_sha256
  ) {
    fail("capture_binding_inputs_mismatch");
  }

  const executionProfile = Object.freeze({
    execution_profile_id: requireString(
      manifestRecord.execution_profile_id,
      "capture_binding_execution_profile_invalid"
    ),
    readiness_timeout_ms: manifestRecord.readiness_timeout_ms,
    qualification_timeout_ms: manifestRecord.qualification_timeout_ms,
    local_detector_slot_timeout_ms: manifestRecord.local_detector_slot_timeout_ms,
    judge_detector_slot_timeout_ms: manifestRecord.judge_detector_slot_timeout_ms,
    normal_work_budget_ms: manifestRecord.normal_work_budget_ms
  });

  const judgeBaseUrl = requireString(
    manifestRecord.judge_base_url,
    "capture_binding_judge_invalid"
  );
  const judgeEndpointUrl = requireString(
    manifestRecord.judge_endpoint_url,
    "capture_binding_judge_invalid"
  );
  const judgeRequestedModel = requireString(
    manifestRecord.judge_requested_model,
    "capture_binding_judge_invalid"
  );
  const judgeResolvedModel = requireString(
    manifestRecord.judge_resolved_model,
    "capture_binding_judge_invalid"
  );
  const judgeProtocolId = requireString(
    manifestRecord.judge_protocol_id,
    "capture_binding_judge_invalid"
  );
  const judgeEndpointPolicyId = requireString(
    manifestRecord.judge_endpoint_policy_id,
    "capture_binding_judge_invalid"
  );
  // Enforce the reviewed P6 live Judge channel: the runtime-resolved Judge
  // binding must match the source-controlled profile before any of its values
  // may enter signed acceptance evidence. Evidence copies only the profile's
  // reviewed stable model IDs. Any profile or runtime drift fails closed.
  const reviewedIds = verifySandboxSecurityP6LiveJudgeBinding({
    judge_protocol_id: judgeProtocolId,
    judge_endpoint_policy_id: judgeEndpointPolicyId,
    judge_base_url: judgeBaseUrl,
    judge_endpoint_url: judgeEndpointUrl,
    judge_requested_model: judgeRequestedModel,
    judge_resolved_model: judgeResolvedModel
  });
  const judgeBinding = Object.freeze({
    judge_protocol_id: judgeProtocolId,
    judge_endpoint_policy_id: judgeEndpointPolicyId,
    judge_base_url_sha256: sha256Hex(judgeBaseUrl),
    judge_endpoint_url_sha256: sha256Hex(judgeEndpointUrl),
    judge_requested_model_id: reviewedIds.judge_requested_model_id,
    judge_requested_model_sha256: sha256Hex(judgeRequestedModel),
    judge_resolved_model_id: reviewedIds.judge_resolved_model_id,
    judge_resolved_model_sha256: sha256Hex(judgeResolvedModel),
    judge_binding_sha256: requireSha256(
      manifestRecord.judge_binding_sha256,
      "capture_binding_judge_invalid"
    )
  });

  return Object.freeze({
    bundle_descriptor_sha256: input.bundle_descriptor_sha256,
    inputs_tree_sha256: input.inputs_tree_sha256,
    code_tree_sha256: input.code_tree_sha256,
    candidate_package_sha256: candidatePackageSha256,
    candidate_tree_sha256: hashSandboxSecurityBenchmarkTree(input.candidate_root),
    decisions_tree_sha256: candidatePackage.decisions_tree_sha256,
    cassette_tree_sha256: candidatePackage.cassette_tree_sha256,
    fixture_count: candidatePackage.fixture_count,
    execution_profile: executionProfile,
    judge_binding: judgeBinding
  });
}

interface CaptureWorkerOptions {
  readonly descriptor: string;
  readonly corpus_root: string;
  readonly corpus_dev: string;
  readonly corpus_ino: string;
  readonly capture_parent_root: string;
  readonly capture_parent_dev: string;
  readonly capture_parent_ino: string;
  readonly output_root: string;
  readonly output_dev: string;
  readonly output_ino: string;
}

function parseArgv(argv: readonly string[]): CaptureWorkerOptions {
  const values: Record<string, string> = {};
  for (const token of argv) {
    const flag = [
      "--descriptor=",
      "--corpus-root=",
      "--corpus-dev=",
      "--corpus-ino=",
      "--capture-parent-root=",
      "--capture-parent-dev=",
      "--capture-parent-ino=",
      "--output-root=",
      "--output-dev=",
      "--output-ino="
    ].find((candidate) => token.startsWith(candidate));
    if (flag === undefined) {
      fail("unknown_cli_argument");
    }
    values[flag.slice(2, -1)] = token.slice(flag.length);
  }
  const required = [
    "descriptor",
    "corpus-root",
    "corpus-dev",
    "corpus-ino",
    "capture-parent-root",
    "capture-parent-dev",
    "capture-parent-ino",
    "output-root",
    "output-dev",
    "output-ino"
  ] as const;
  for (const key of required) {
    if (values[key] === undefined) fail("missing_cli_arguments");
  }
  return Object.freeze({
    descriptor: values.descriptor!,
    corpus_root: values["corpus-root"]!,
    corpus_dev: values["corpus-dev"]!,
    corpus_ino: values["corpus-ino"]!,
    capture_parent_root: values["capture-parent-root"]!,
    capture_parent_dev: values["capture-parent-dev"]!,
    capture_parent_ino: values["capture-parent-ino"]!,
    output_root: values["output-root"]!,
    output_dev: values["output-dev"]!,
    output_ino: values["output-ino"]!
  });
}

export async function runSandboxSecurityCaptureWorker(input: Readonly<{
  descriptor_path: string;
  corpus_root: string;
  corpus_dev: string;
  corpus_ino: string;
  capture_parent_root: string;
  capture_parent_dev: string;
  capture_parent_ino: string;
  output_root: string;
  output_dev: string;
  output_ino: string;
}>): Promise<Readonly<{
  status: "capture_complete";
  issued_binding: Readonly<Record<string, unknown>>;
}>> {
  assertSandboxSecurityLiveRootBinding({
    root: resolve(input.corpus_root),
    dev: input.corpus_dev,
    ino: input.corpus_ino
  });
  assertSandboxSecurityLiveRootBinding({
    root: resolve(input.capture_parent_root),
    dev: input.capture_parent_dev,
    ino: input.capture_parent_ino
  });
  assertSandboxSecurityLiveRootBinding({
    root: resolve(input.output_root),
    dev: input.output_dev,
    ino: input.output_ino
  });
  const descriptorPath = resolve(input.descriptor_path);
  const descriptorSnapshot = snapshotSandboxSecurityJson({
    real_root: resolve(descriptorPath, ".."),
    path: descriptorPath,
    max_bytes: MAX_CANDIDATE_FILE_BYTES
  });
  const bundle = reconstructSandboxSecurityCaptureBundleFromDescriptor(
    descriptorSnapshot.json
  );

  const child = await launchSandboxSecurityCaptureChild({ bundle });
  if (child.exit_code !== 0) {
    throw new Error(
      classifySandboxSecurityCaptureChildFailure(child.stderr)
    );
  }
  if (
    child.candidate_root === undefined ||
    child.candidate_package_sha256 === undefined
  ) {
    fail("capture_child_failed");
  }

  const issuedBinding = buildCaptureBinding({
    candidate_root: child.candidate_root,
    bundle_descriptor_sha256: hashSandboxSecurityBenchmarkCanonicalJson(
      descriptorSnapshot.json
    ),
    inputs_tree_sha256: bundle.inputs_tree_sha256,
    code_tree_sha256: bundle.code_tree_sha256
  });

  return Object.freeze({
    status: "capture_complete" as const,
    issued_binding: issuedBinding
  });
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const options = parseArgv(argv);
  const summary = await runSandboxSecurityCaptureWorker({
    descriptor_path: options.descriptor,
    corpus_root: options.corpus_root,
    corpus_dev: options.corpus_dev,
    corpus_ino: options.corpus_ino,
    capture_parent_root: options.capture_parent_root,
    capture_parent_dev: options.capture_parent_dev,
    capture_parent_ino: options.capture_parent_ino,
    output_root: options.output_root,
    output_dev: options.output_dev,
    output_ino: options.output_ino
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
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
