/**
 * P6 Stage 1 → Stage 2 handoff: uncredentialed prepare worker.
 *
 * Creates the input-only capture bundle and its exact serializable descriptor
 * with every live variable absent. Emits exactly one bounded prepare_complete
 * stdout frame and no other output. Imports no production, evaluator, or sealer
 * code.
 */

import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeSandboxSecurityPreparedBundleDescriptor,
  prepareSandboxSecurityCaptureBundle
} from "./prepare-capture-bundle.ts";
import { writeSandboxSecurityExclusiveAtomicFile } from "./fs-snapshot.ts";
import { assertSandboxSecurityLiveEnvironmentAbsent } from "./stage-protocol.ts";

const INVALID = "sandbox_security_prepare_worker_reject";

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function safeCliErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.length <= 160 &&
    /^(?:sandbox_security_[a-z_]+_reject|capture_bundle_(?:invalid|reject)|corpus_validation_failed):[a-z0-9_]+(?::[a-z0-9_./-]+)?$/u.test(
      message
    )
    ? message
    : `${INVALID}:internal`;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

interface PrepareWorkerOptions {
  readonly corpus_root: string;
  readonly capture_parent_root: string;
  readonly descriptor_out: string;
}

function parseArgv(argv: readonly string[]): PrepareWorkerOptions {
  let corpusRoot: string | undefined;
  let captureParentRoot: string | undefined;
  let descriptorOut: string | undefined;
  for (const token of argv) {
    if (token.startsWith("--corpus-root=")) {
      corpusRoot = token.slice("--corpus-root=".length);
    } else if (token.startsWith("--capture-parent-root=")) {
      captureParentRoot = token.slice("--capture-parent-root=".length);
    } else if (token.startsWith("--descriptor-out=")) {
      descriptorOut = token.slice("--descriptor-out=".length);
    } else {
      fail("unknown_cli_argument");
    }
  }
  if (
    corpusRoot === undefined ||
    captureParentRoot === undefined ||
    descriptorOut === undefined
  ) {
    fail("missing_cli_arguments");
  }
  return Object.freeze({
    corpus_root: corpusRoot,
    capture_parent_root: captureParentRoot,
    descriptor_out: descriptorOut
  });
}

export async function runSandboxSecurityPrepareWorker(input: Readonly<{
  corpus_root: string;
  capture_parent_root: string;
  descriptor_out: string;
}>): Promise<Readonly<{
  status: "prepare_complete";
  bundle_descriptor_sha256: string;
  inputs_tree_sha256: string;
  code_tree_sha256: string;
  fixture_count: number;
}>> {
  assertSandboxSecurityLiveEnvironmentAbsent();

  const corpusRoot = resolve(input.corpus_root);
  const captureParentReal = resolve(input.capture_parent_root);
  const bundle = await prepareSandboxSecurityCaptureBundle({
    corpus_root: corpusRoot,
    output_root: captureParentReal
  });
  const descriptor = normalizeSandboxSecurityPreparedBundleDescriptor(bundle);
  const descriptorJson = `${JSON.stringify(descriptor, null, 2)}\n`;
  const descriptorOut = resolve(input.descriptor_out);
  const written = writeSandboxSecurityExclusiveAtomicFile({
    real_root: captureParentReal,
    path: descriptorOut,
    data: descriptorJson
  });
  const bundleDescriptorSha256 = createHash("sha256")
    .update(canonicalJson(descriptor), "utf8")
    .digest("hex");
  void written;

  return Object.freeze({
    status: "prepare_complete" as const,
    bundle_descriptor_sha256: bundleDescriptorSha256,
    inputs_tree_sha256: descriptor.inputs_tree_sha256,
    code_tree_sha256: descriptor.code_tree_sha256,
    fixture_count: descriptor.fixture_count
  });
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const options = parseArgv(argv);
  const summary = await runSandboxSecurityPrepareWorker(options);
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
