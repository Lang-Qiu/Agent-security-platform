import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function requireCandidateProgressFunction<T>(
  module: Readonly<Record<string, unknown>>,
  name: string
): T {
  const value = module[name];
  assert.equal(typeof value, "function", `candidate_progress_${name}_missing`);
  return value as T;
}

test("REQ-SBX-GENERAL-002 exposes strict candidate progress helpers", async () => {
  const captureModule = await import(
    "../../scripts/benchmark/sandbox-security/capture-live.ts"
  );
  const prepareModule = await import(
    "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
  );
  assert.equal(
    typeof (captureModule as Record<string, unknown>)
      .normalizeSandboxSecurityCandidateOutputFrame,
    "function",
    "candidate_frame_normalizer_missing"
  );
  assert.equal(
    typeof (prepareModule as Record<string, unknown>)
      .writeSandboxSecurityCandidateFileAtomic,
    "function",
    "candidate_atomic_writer_missing"
  );
});

test("REQ-SBX-GENERAL-002 stops consuming a stdout chunk after protocol failure", async () => {
  const module = (await import(
    "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
  )) as Readonly<Record<string, unknown>>;
  const consume = module.consumeSandboxSecurityCaptureOutputLines as
    | ((lines: readonly string[], consumeLine: (line: string) => boolean) => void)
    | undefined;
  assert.equal(typeof consume, "function", "capture_output_line_consumer_missing");
  if (typeof consume !== "function") return;

  const consumed: string[] = [];
  consume(["malformed", "valid-after-failure"], (line) => {
    consumed.push(line);
    return false;
  });

  assert.deepEqual(consumed, ["malformed"]);
});

test("REQ-SBX-GENERAL-002 normalizes zero-count progress as valid JSON", async () => {
  const module = (await import(
    "../../scripts/benchmark/sandbox-security/capture-live.ts"
  )) as unknown as Readonly<Record<string, unknown>>;
  const create = requireCandidateProgressFunction<
    (fixtureIds: readonly string[]) => Record<string, unknown>
  >(module, "createSandboxSecurityCandidateProgressDocument");

  assert.deepEqual(create(["ssb-v1-0001", "ssb-v1-0002"]), {
    schema_version: "sandbox-security-benchmark-candidate-progress.v1",
    status: "running",
    fixture_count: 2,
    completed_count: 0,
    decisions: []
  });
});

test("REQ-SBX-GENERAL-002 rejects raw and oracle fields from progress frames", async () => {
  const module = (await import(
    "../../scripts/benchmark/sandbox-security/capture-live.ts"
  )) as unknown as Readonly<Record<string, unknown>>;
  const normalize = requireCandidateProgressFunction<
    (value: unknown, fixtureIds: readonly string[]) => unknown
  >(module, "normalizeSandboxSecurityCandidateOutputFrame");

  assert.throws(
    () =>
      normalize(
        {
          schema_version: "sandbox-security-benchmark-candidate-output.v1",
          event: "candidate_progress",
          input_ordinal: 1,
          fixture_count: 1,
          completed_count: 1,
          decision: {
            schema_version: "sandbox-security-benchmark-decision-projection.v1",
            fixture_id: "ssb-v1-0001",
            decision_projection_sha256:
              "2210877330abfcf76395365d72f2964740b142a2650f827dd36585498f0af3ba",
            projection: {
              schema_version: "sandbox-security-decision.v1",
              verdict: "no_detected_risk",
              action: "allow",
              risk_level: "info",
              finding_count: 0,
              detector_run_count: 0,
              evidence_ref_count: 0
            }
          },
          raw_body: "provider body",
          truth: "oracle"
        },
        ["ssb-v1-0001"]
      ),
    /candidate_progress.*(?:invalid|oracle|raw)/i
  );
});

test("REQ-SBX-GENERAL-002 preserves completed decisions in failed progress", async () => {
  const module = (await import(
    "../../scripts/benchmark/sandbox-security/capture-live.ts"
  )) as unknown as Readonly<Record<string, unknown>>;
  const fixtureIds = ["ssb-v1-0001"] as const;
  const create = requireCandidateProgressFunction<
    (ids: readonly string[]) => Record<string, unknown>
  >(module, "createSandboxSecurityCandidateProgressDocument");
  const append = requireCandidateProgressFunction<
    (
      current: Record<string, unknown>,
      frame: Record<string, unknown>,
      ids: readonly string[]
    ) => Record<string, unknown>
  >(module, "appendSandboxSecurityCandidateProgress");
  const markFailed = requireCandidateProgressFunction<
    (
      current: Record<string, unknown>,
      code: string,
      ids: readonly string[]
    ) => Record<string, unknown>
  >(module, "markSandboxSecurityCandidateProgressFailed");
  const normalize = requireCandidateProgressFunction<
    (value: unknown, ids: readonly string[]) => Record<string, unknown>
  >(module, "normalizeSandboxSecurityCandidateOutputFrame");
  const decision = {
    schema_version: "sandbox-security-benchmark-decision-projection.v1",
    fixture_id: "ssb-v1-0001",
    decision_projection_sha256:
      "2210877330abfcf76395365d72f2964740b142a2650f827dd36585498f0af3ba",
    projection: {
      schema_version: "sandbox-security-decision.v1",
      verdict: "no_detected_risk",
      action: "allow",
      risk_level: "info",
      finding_count: 0,
      detector_run_count: 0,
      evidence_ref_count: 0
    }
  };
  const frame = normalize(
    {
      schema_version: "sandbox-security-benchmark-candidate-output.v1",
      event: "candidate_progress",
      input_ordinal: 1,
      fixture_count: 1,
      completed_count: 1,
      decision
    },
    fixtureIds
  );
  const running = append(create(fixtureIds), frame, fixtureIds);
  const failed = markFailed(
    running,
    "sandbox_security_capture_live_reject:provider_failed",
    fixtureIds
  );

  assert.equal(failed.status, "failed");
  assert.equal(failed.completed_count, 1);
  assert.deepEqual(failed.decisions, running.decisions);
});

test("REQ-SBX-GENERAL-002 atomically replaces the cumulative candidate progress file", async () => {
  const captureModule = (await import(
    "../../scripts/benchmark/sandbox-security/capture-live.ts"
  )) as unknown as Readonly<Record<string, unknown>>;
  const prepareModule = (await import(
    "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
  )) as unknown as Readonly<Record<string, unknown>>;
  const create = requireCandidateProgressFunction<(
    fixtureIds: readonly string[]
  ) => Record<string, unknown>>(
    captureModule,
    "createSandboxSecurityCandidateProgressDocument"
  );
  const writeAtomic = requireCandidateProgressFunction<(
    input: Readonly<{ capture_output_root: string; serialized: string }>
  ) => void>(prepareModule, "writeSandboxSecurityCandidateFileAtomic");

  const root = mkdtempSync(join(tmpdir(), "ssb-candidate-progress-"));
  try {
    mkdirSync(root, { recursive: true });
    const target = join(root, ".candidate-package.json");
    writeFileSync(target, "", { encoding: "utf8", mode: 0o600 });
    const first = create(["ssb-v1-0001"]);
    writeAtomic({
      capture_output_root: root,
      serialized: `${JSON.stringify(first)}\n`
    });
    const firstInode = lstatSync(target).ino;
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), first);

    const second = { ...first, status: "failed", failure_code: "capture_bundle_reject:child_failed" };
    writeAtomic({
      capture_output_root: root,
      serialized: `${JSON.stringify(second)}\n`
    });
    const secondInode = lstatSync(target).ino;
    assert.notEqual(secondInode, firstInode);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), second);
    assert.equal(lstatSync(target).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(root), [".candidate-package.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-002 only accepts complete formal staging after progress matches", async () => {
  const {
    appendSandboxSecurityCandidateProgress,
    assertSandboxSecurityCandidateStagingMatchesProgress,
    createSandboxSecurityCandidateProgressDocument,
    normalizeSandboxSecurityCandidateOutputFrame
  } = await import(
    "../../scripts/benchmark/sandbox-security/candidate-progress.ts"
  );
  const fixtureIds = ["ssb-v1-0001"] as const;
  const frame = normalizeSandboxSecurityCandidateOutputFrame(
    {
      schema_version: "sandbox-security-benchmark-candidate-output.v1",
      event: "candidate_progress",
      input_ordinal: 1,
      fixture_count: 1,
      completed_count: 1,
      decision: {
        schema_version: "sandbox-security-benchmark-decision-projection.v1",
        fixture_id: "ssb-v1-0001",
        decision_projection_sha256:
          "2210877330abfcf76395365d72f2964740b142a2650f827dd36585498f0af3ba",
        projection: {
          schema_version: "sandbox-security-decision.v1",
          verdict: "no_detected_risk",
          action: "allow",
          risk_level: "info",
          finding_count: 0,
          detector_run_count: 0,
          evidence_ref_count: 0
        }
      }
    },
    fixtureIds
  );
  assert.equal(frame.event, "candidate_progress");
  if (frame.event !== "candidate_progress") return;
  const progress = appendSandboxSecurityCandidateProgress(
    createSandboxSecurityCandidateProgressDocument(fixtureIds),
    frame,
    fixtureIds
  );
  const staging = `${JSON.stringify({
    schema_version: "sandbox-security-benchmark-candidate-staging.v2",
    capture_manifest: {},
    cassette: {},
    package: {},
    decisions: progress.decisions
  })}\n`;
  assert.doesNotThrow(() =>
    assertSandboxSecurityCandidateStagingMatchesProgress(
      staging,
      progress,
      fixtureIds
    )
  );
  assert.throws(
    () =>
      assertSandboxSecurityCandidateStagingMatchesProgress(
        `${JSON.stringify(progress)}\n`,
        progress,
        fixtureIds
      ),
    /candidate_progress_not_complete|candidate_staging_(?:schema|keys)/i
  );
  const legacyStaging = staging.replace(
    "sandbox-security-benchmark-candidate-staging.v2",
    "sandbox-security-benchmark-candidate-staging.v1"
  );
  assert.throws(
    () =>
      assertSandboxSecurityCandidateStagingMatchesProgress(
        legacyStaging,
        progress,
        fixtureIds
      ),
    /candidate_staging_schema/i
  );
});

test("REQ-SBX-GENERAL-002 treats capture_complete as a terminal output frame", async () => {
  const module = await import(
    "../../scripts/benchmark/sandbox-security/candidate-progress.ts"
  );
  const fixtureIds = ["ssb-v1-0001"] as const;
  const decision = {
    schema_version: "sandbox-security-benchmark-decision-projection.v1",
    fixture_id: "ssb-v1-0001",
    decision_projection_sha256:
      "2210877330abfcf76395365d72f2964740b142a2650f827dd36585498f0af3ba",
    projection: {
      schema_version: "sandbox-security-decision.v1",
      verdict: "no_detected_risk",
      action: "allow",
      risk_level: "info",
      finding_count: 0,
      detector_run_count: 0,
      evidence_ref_count: 0
    }
  };
  const progressFrame = module.normalizeSandboxSecurityCandidateOutputFrame(
    {
      schema_version: "sandbox-security-benchmark-candidate-output.v1",
      event: "candidate_progress",
      input_ordinal: 1,
      fixture_count: 1,
      completed_count: 1,
      decision
    },
    fixtureIds
  );
  assert.equal(progressFrame.event, "candidate_progress");
  if (progressFrame.event !== "candidate_progress") return;
  const progress = module.appendSandboxSecurityCandidateProgress(
    module.createSandboxSecurityCandidateProgressDocument(fixtureIds),
    progressFrame,
    fixtureIds
  );
  const stagingSerialized = `${JSON.stringify({
    schema_version: "sandbox-security-benchmark-candidate-staging.v2",
    capture_manifest: {},
    cassette: {},
    package: {},
    decisions: progress.decisions
  })}\n`;
  const completeFrame = module.normalizeSandboxSecurityCandidateOutputFrame(
    {
      schema_version: "sandbox-security-benchmark-candidate-output.v1",
      event: "capture_complete",
      status: "capture_complete",
      decision_count: 1,
      fixture_count: 1,
      candidate_package_sha256: createHash("sha256")
        .update(stagingSerialized, "utf8")
        .digest("hex"),
      staging_serialized: stagingSerialized
    },
    fixtureIds
  );
  const appendOutput = (module as Record<string, unknown>)
    .appendSandboxSecurityCandidateOutputFrame as (
    current: Readonly<{
      progress: typeof progress;
      complete_frame?: Readonly<{ event?: string }>;
    }>,
    frame: unknown,
    fixtureIds: readonly string[]
  ) => Readonly<{
    progress: typeof progress;
    complete_frame?: Readonly<{ event?: string }>;
  }>;
  assert.equal(typeof appendOutput, "function");

  const afterComplete = appendOutput(
    { progress },
    completeFrame,
    fixtureIds
  );
  assert.equal(afterComplete.complete_frame?.event, "capture_complete");
  assert.throws(
    () => appendOutput(afterComplete, progressFrame, fixtureIds),
    /candidate_progress_after_complete/i
  );
});

test("REQ-SBX-GENERAL-002 never materializes a partial progress schema", async () => {
  const captureModule = (await import(
    "../../scripts/benchmark/sandbox-security/capture-live.ts"
  )) as unknown as Readonly<Record<string, unknown>>;
  const prepareModule = (await import(
    "../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
  )) as unknown as Readonly<Record<string, unknown>>;
  const create = requireCandidateProgressFunction<(
    fixtureIds: readonly string[]
  ) => Record<string, unknown>>(
    captureModule,
    "createSandboxSecurityCandidateProgressDocument"
  );
  const writeAtomic = requireCandidateProgressFunction<(
    input: Readonly<{ capture_output_root: string; serialized: string }>
  ) => void>(prepareModule, "writeSandboxSecurityCandidateFileAtomic");
  const materialize = requireCandidateProgressFunction<(
    input: Readonly<{
      capture_output_root: string;
      capture_output_binding: string;
      fixture_ids: readonly string[];
      candidate_package_sha256: string;
    }>
  ) => string>(captureModule, "materializeSandboxSecurityCandidatePackage");

  const root = mkdtempSync(join(tmpdir(), "ssb-candidate-partial-"));
  try {
    const target = join(root, ".candidate-package.json");
    writeFileSync(target, "", { encoding: "utf8", mode: 0o600 });
    const fixtureIds = ["ssb-v1-0001"] as const;
    const serialized = `${JSON.stringify(create(fixtureIds))}\n`;
    writeAtomic({ capture_output_root: root, serialized });
    const stat = lstatSync(target, { bigint: true });
    const binding = `${stat.dev}:${stat.ino}`;
    const hash = createHash("sha256").update(serialized, "utf8").digest("hex");
    assert.throws(
      () =>
        materialize({
          capture_output_root: root,
          capture_output_binding: binding,
          fixture_ids: fixtureIds,
          candidate_package_sha256: hash
        }),
      /candidate_staging_(?:schema|invalid)/i
    );
    assert.equal(readdirSync(root).includes("candidate"), false);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), create(fixtureIds));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
