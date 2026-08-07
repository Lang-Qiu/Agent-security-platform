import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SHA = "a".repeat(64);
const BINDING = "b".repeat(64);

type ReplayEnvelope = Readonly<{
  schema_version: string;
  fixture_id: string;
  ollama: readonly unknown[];
  judge: readonly unknown[];
  decision_projection_sha256: string;
  judge_binding_sha256: string;
}>;

type HermeticModule = {
  manifestToCandidateCaptureManifest?: (
    manifest: Readonly<Record<string, unknown>>
  ) => Readonly<Record<string, unknown>>;
  validateAndStripReplayEnvelopes: (
    manifest: Readonly<{
      fixture_ids: readonly string[];
      judge_binding_sha256: string;
    }>,
    envelopes: readonly ReplayEnvelope[]
  ) => readonly unknown[];
  buildHermeticReplayChildCommands: (input: Readonly<Record<string, string>>) => Readonly<{
    engine: Readonly<{ args: readonly string[]; env: Readonly<Record<string, string | undefined>> }>;
    evaluator: Readonly<{ args: readonly string[]; env: Readonly<Record<string, string | undefined>> }>;
  }>;
  validateNetworkIsolationProof: (value: unknown) => Readonly<{ network_attempts: number }>;
  validateNetworkNamespaceIsolation: (
    parent_namespace: unknown,
    child_namespace: unknown
  ) => Readonly<{ network_attempts: number }>;
  assertNoRawContentLeaks: (value: unknown) => void;
  cleanupSandboxSecurityHermeticReplayStaging: (input: Readonly<{
    staging_root: string;
    remove: (path: string) => void;
  }>) => void;
  runSandboxSecurityHermeticReplay: (input: Readonly<{ root: string }>) => Promise<Readonly<{
    evaluated_inputs: number;
    network_attempts: number;
    openai_key_present: boolean;
    decision_projection_tree_sha256: string;
    metrics: Readonly<Record<string, unknown>>;
  }>>;
  assertSandboxSecurityHermeticReplayCompleteRun: (input: Readonly<{
    input_count: number;
    accepted_metrics: unknown;
  }>) => void;
  hasSandboxSecurityHermeticReadPermission: (
    scope: string,
    hasPermission: (reference: string) => boolean,
    representative?: string
  ) => boolean;
};

async function hermeticModule(): Promise<HermeticModule> {
  let module: Partial<HermeticModule> = {};
  try {
    module = await import("../../scripts/benchmark/sandbox-security/replay-hermetic.ts") as Partial<HermeticModule>;
  } catch {
    module = {};
  }
  assert.equal(typeof module.validateAndStripReplayEnvelopes, "function");
  assert.equal(typeof module.buildHermeticReplayChildCommands, "function");
  assert.equal(typeof module.validateNetworkNamespaceIsolation, "function");
  assert.equal(typeof module.assertNoRawContentLeaks, "function");
  assert.equal(typeof module.cleanupSandboxSecurityHermeticReplayStaging, "function");
  assert.equal(typeof module.runSandboxSecurityHermeticReplay, "function");
  return module as HermeticModule;
}

function fixtureIds(count: number): readonly string[] {
  return Array.from(
    { length: count },
    (_, index) => `ssb-v1-${String(index + 1).padStart(4, "0")}`
  );
}

function envelopes(count = 300): readonly ReplayEnvelope[] {
  return fixtureIds(count).map((fixture_id) => ({
    schema_version: "sandbox-security-benchmark-replay.v2",
    fixture_id,
    ollama: [],
    judge: [],
    decision_projection_sha256: SHA,
    judge_binding_sha256: BINDING
  }));
}

test("REQ-SBX-GENERAL-002 replay strips fixture IDs before constructing anonymous units", async () => {
  const module = await hermeticModule();
  const units = module.validateAndStripReplayEnvelopes(
    { fixture_ids: fixtureIds(300), judge_binding_sha256: BINDING },
    envelopes()
  );
  assert.equal(units.length, 300);
  assert.doesNotMatch(JSON.stringify(units), /fixture_id/);
});

test("REQ-SBX-GENERAL-002 replay rejects 299 or 301 ordered envelopes", async () => {
  const module = await hermeticModule();
  assert.throws(
    () => module.validateAndStripReplayEnvelopes(
      { fixture_ids: fixtureIds(300), judge_binding_sha256: BINDING },
      envelopes(299)
    ),
    /replay|count|envelope/i
  );
  assert.throws(
    () => module.validateAndStripReplayEnvelopes(
      { fixture_ids: fixtureIds(300), judge_binding_sha256: BINDING },
      envelopes(301)
    ),
    /replay|count|envelope/i
  );
});

test("REQ-SBX-GENERAL-002 replay rejects an envelope with the wrong schema version", async () => {
  const module = await hermeticModule();
  const invalid = [...envelopes()] as Array<ReplayEnvelope>;
  invalid[0] = { ...invalid[0]!, schema_version: "sandbox-security-replay.invalid" };
  assert.throws(
    () => module.validateAndStripReplayEnvelopes(
      { fixture_ids: fixtureIds(300), judge_binding_sha256: BINDING },
      invalid
    ),
    /schema|replay|invalid/i
  );
});

test("REQ-SBX-P6-RETRY replay preserves anonymous ordered attempt arrays", async () => {
  const module = await hermeticModule();
  const input = [...envelopes()] as Array<ReplayEnvelope>;
  input[0] = {
    ...input[0]!,
    ollama: [
      { status: "transport_error", error_code: "connection_failed" },
      {
        status: "response",
        http_status: 200,
        content_type: "application/json",
        normalized_response: { provider: "local" }
      }
    ]
  };
  const units = module.validateAndStripReplayEnvelopes(
    { fixture_ids: fixtureIds(300), judge_binding_sha256: BINDING },
    input
  );
  assert.deepEqual(units[0], {
    ollama: input[0]!.ollama,
    judge: [],
    decision_projection_sha256: SHA,
    judge_binding_sha256: BINDING
  });
  assert.doesNotMatch(JSON.stringify(units), /fixture_id/);
});

test("REQ-SBX-P6-RETRY replay rejects embedded not_called attempts and scalar v1 envelopes", async () => {
  const module = await hermeticModule();
  const embeddedNotCalled = [...envelopes()] as Array<ReplayEnvelope>;
  embeddedNotCalled[0] = {
    ...embeddedNotCalled[0]!,
    ollama: [{ status: "not_called" }]
  };
  assert.throws(
    () => module.validateAndStripReplayEnvelopes(
      { fixture_ids: fixtureIds(300), judge_binding_sha256: BINDING },
      embeddedNotCalled
    ),
    /attempt|not_called|replay/i
  );

  const scalarV1 = [...envelopes()] as Array<ReplayEnvelope>;
  scalarV1[0] = {
    ...scalarV1[0]!,
    schema_version: "sandbox-security-benchmark-replay.v1",
    ollama: { status: "response" } as unknown as readonly unknown[]
  };
  assert.throws(
    () => module.validateAndStripReplayEnvelopes(
      { fixture_ids: fixtureIds(300), judge_binding_sha256: BINDING },
      scalarV1
    ),
    /schema|attempt|replay/i
  );
});

test("REQ-SBX-P6-RETRY hermetic replay writes v2 replay-input and cassette artifacts", () => {
  const replay = readFileSync(
    join(REPO_ROOT, "scripts/benchmark/sandbox-security/replay-hermetic.ts"),
    "utf8"
  );
  assert.match(replay, /sandbox-security-hermetic-replay-input\.v2/u);
  assert.match(
    replay,
    /sandbox-security-benchmark-candidate-cassette\.v2/u
  );
});

test("REQ-SBX-GENERAL-002 hermetic child commands separate Engine and evaluator capabilities", async () => {
  const module = await hermeticModule();
  const commands = module.buildHermeticReplayChildCommands({
    root: "/tmp/accepted",
    staging_root: "/tmp/staging",
    input_root: "/tmp/staging/engine-workspace/anonymous-inputs",
    replay_input: "/tmp/staging/engine-workspace/replay-input.json",
    sealed_config: "/tmp/staging/engine-workspace/sealed-config.json",
    projection_root: "/tmp/staging/evaluator-capture/decisions",
    truth_root: "/tmp/staging/evaluator-corpus/truth",
    expected_metrics: "/tmp/staging/expected-metrics/metrics.json",
    result_path: "/tmp/staging/result.json"
  });
  assert.doesNotMatch(commands.engine.args.join(" "), /truth|evaluate\.ts/i);
  assert.doesNotMatch(
    commands.evaluator.args.join(" "),
    /benchmark-composition|http-transport|replay-transport|(?:ollama|openai)-(?:local|judge)-detector|composition\.ts/i
  );
  assert.equal(commands.engine.env.SANDBOX_SECURITY_JUDGE_API_KEY, undefined);
  assert.equal(commands.evaluator.env.SANDBOX_SECURITY_JUDGE_API_KEY, undefined);
  assert.ok(commands.engine.args.some((arg) => arg.includes("permission")));
  assert.ok(commands.evaluator.args.some((arg) => arg.includes("permission")));
  const engineReads = commands.engine.args.filter((arg) => arg.startsWith("--allow-fs-read="));
  const evaluatorReads = commands.evaluator.args.filter((arg) => arg.startsWith("--allow-fs-read="));
  assert.ok(
    engineReads.includes("--allow-fs-read=/proc/self/net"),
    "Engine must have the narrow read capability needed for its OS network proof"
  );
  assert.ok(
    engineReads.includes(
      `--allow-fs-read=${join(REPO_ROOT, "scripts/benchmark/sandbox-security/fs-snapshot.ts")}`
    ),
    "Engine must be able to load its snapshot boundary"
  );
  assert.ok(
    engineReads.some((arg) => arg.endsWith("/engines/sandbox/src/security/canonical-json.ts")),
    "Engine must be able to load canonical JSON"
  );
  for (const directory of ["base-filter", "monitoring", "simulated-tools"]) {
    assert.ok(
      engineReads.includes(
        `--allow-fs-read=${join(REPO_ROOT, "engines/sandbox/src", directory)}`
      ),
      `Engine must be able to load the ${directory} runtime dependency`
    );
  }
  assert.doesNotMatch(
    engineReads.join("\n"),
    /\/anonymous-inputs(?:\n|$)/u,
    "The Engine parent workspace scope already covers the generated input subtree"
  );
  assert.doesNotMatch(
    evaluatorReads.join("\n"),
    /\/(?:evaluator-capture\/decisions|evaluator-corpus\/truth)(?:\n|$)/u,
    "Evaluator parent roots already cover their generated child subtrees"
  );
  assert.doesNotMatch(
    engineReads.join("\n"),
    /\/scripts\/benchmark\/sandbox-security(?:\n|$)/u
  );
  assert.doesNotMatch(
    evaluatorReads.join("\n"),
    /\/engines\/sandbox(?:\n|$)/u
  );
  assert.doesNotMatch(
    evaluatorReads.join("\n"),
    /(?:p6-live-capture-profile|judge-protocol-adapter)\.ts/u
  );
  assert.match(
    evaluatorReads.join("\n"),
    /\/expected-metrics$/u
  );
  assert.throws(
    () => module.buildHermeticReplayChildCommands({
      root: "/tmp/accepted",
      staging_root: "/tmp/staging",
      input_root: "/tmp/outside/inputs",
      replay_input: "/tmp/staging/engine-workspace/replay-input.json",
      sealed_config: "/tmp/staging/engine-workspace/sealed-config.json",
      projection_root: "/tmp/staging/evaluator-capture/decisions",
      truth_root: "/tmp/staging/evaluator-corpus/truth",
      expected_metrics: "/tmp/staging/expected-metrics/metrics.json",
      result_path: "/tmp/staging/result.json"
    }),
    /path|binding|root|invalid|overlap/i
  );
});

test("REQ-SBX-GENERAL-002 evaluator reads expected metrics through an isolated directory scope", async () => {
  const module = await hermeticModule();
  const paths = {
    root: "/tmp/accepted",
    staging_root: "/tmp/staging",
    input_root: "/tmp/staging/engine-workspace/anonymous-inputs",
    replay_input: "/tmp/staging/engine-workspace/replay-input.json",
    sealed_config: "/tmp/staging/engine-workspace/sealed-config.json",
    projection_root: "/tmp/staging/evaluator-capture/decisions",
    truth_root: "/tmp/staging/evaluator-corpus/truth",
    expected_metrics: "/tmp/staging/expected-metrics/metrics.json",
    result_path: "/tmp/staging/result.json"
  };
  const commands = module.buildHermeticReplayChildCommands(paths);
  const evaluatorReads = commands.evaluator.args.filter((arg) =>
    arg.startsWith("--allow-fs-read=")
  );
  assert.ok(
    evaluatorReads.includes("--allow-fs-read=/tmp/staging/expected-metrics"),
    "evaluator must read the isolated expected-metrics directory root"
  );
  assert.doesNotMatch(
    evaluatorReads.join("\n"),
    /\/expected-metrics\/metrics\.json$/u,
    "evaluator must not rely on a file scope when fs-snapshot binds the parent root"
  );
  for (const expected_metrics of [
    "/tmp/staging/engine-workspace/expected-metrics/metrics.json",
    "/tmp/staging/evaluator-corpus/truth/expected-metrics/metrics.json",
    "/tmp/staging/metrics.json"
  ]) {
    assert.throws(
      () => module.buildHermeticReplayChildCommands({ ...paths, expected_metrics }),
      /overlap|workspace|expected|root|invalid/i
    );
  }
});

test("REQ-SBX-GENERAL-002 hermetic child entrypoint enforces the exact generated filesystem scopes", () => {
  const replay = readFileSync(
    join(REPO_ROOT, "scripts/benchmark/sandbox-security/replay-hermetic.ts"),
    "utf8"
  );
  assert.match(replay, /function assertExactHermeticChildPermissions/u);
  assert.match(replay, /permissionFlagValues\("--allow-fs-read"\)/u);
  assert.match(replay, /sameStrings\(readScopes, expectedReadScopes\)/u);
  assert.match(replay, /sameStrings\(writeScopes, \[resultPath\]\)/u);
});

test("REQ-SBX-GENERAL-002 hermetic permission checks tolerate overlapping directory and file read scopes", async () => {
  const module = await hermeticModule();
  assert.equal(
    typeof module.hasSandboxSecurityHermeticReadPermission,
    "function"
  );
  const directory = "/tmp/security";
  const file = "/tmp/security/canonical-json.ts";
  const checked: string[] = [];
  assert.equal(
    module.hasSandboxSecurityHermeticReadPermission(directory, (reference) => {
      checked.push(reference);
      return reference === `${directory}/`;
    }),
    true
  );
  assert.deepEqual(checked, [directory, `${directory}/`]);
  const fallbackChecked: string[] = [];
  assert.equal(
    module.hasSandboxSecurityHermeticReadPermission(directory, (reference) => {
      fallbackChecked.push(reference);
      return reference === `${directory}/index.ts`;
    }, `${directory}/index.ts`),
    true
  );
  assert.deepEqual(
    fallbackChecked,
    [directory, `${directory}/`, `${directory}/index.ts`]
  );
  assert.equal(
    module.hasSandboxSecurityHermeticReadPermission(file, (reference) =>
      reference === file
    ),
    true
  );
});

test("REQ-SBX-GENERAL-002 hermetic permission checks do not use Node's false-positive root read probe", () => {
  const replay = readFileSync(
    join(REPO_ROOT, "scripts/benchmark/sandbox-security/replay-hermetic.ts"),
    "utf8"
  );
  assert.doesNotMatch(
    replay,
    /permission\.has\("fs\.read", "\/"\)/u
  );
});

test("REQ-SBX-GENERAL-002 network attempt count is derived from an OS isolation proof", () => {
  const replay = readFileSync(
    join(REPO_ROOT, "scripts/benchmark/sandbox-security/replay-hermetic.ts"),
    "utf8"
  );
  assert.match(replay, /network_proof/u);
  assert.match(replay, /readNetworkNamespaceSnapshot/u);
  assert.match(replay, /network_attempts:\s*networkProof\.network_attempts/u);
  assert.doesNotMatch(
    replay,
    /network_attempts:\s*0,\s*openai_key_present/u,
    "network_attempts must not be a hardcoded child result"
  );
});

test("REQ-SBX-GENERAL-002 network isolation proof rejects tampered snapshots and granted net permission", async () => {
  const module = await hermeticModule();
  const table = (sha256: string) => ({ entry_count: 0, sha256 });
  const before = {
    tcp: table(SHA),
    tcp6: table(SHA),
    udp: table(SHA),
    udp6: table(SHA)
  };
  const proof = {
    schema_version: "sandbox-security-hermetic-network-proof.v1",
    before,
    after: before,
    net_permission_granted: false,
    socket_tables_unchanged: true,
    network_attempts: 0
  };
  assert.equal(module.validateNetworkIsolationProof(proof).network_attempts, 0);
  assert.throws(
    () => module.validateNetworkIsolationProof({
      ...proof,
      after: { ...before, tcp: table(BINDING) }
    }),
    /network_proof/i
  );
  assert.throws(
    () => module.validateNetworkIsolationProof({
      ...proof,
      net_permission_granted: true
    }),
    /network_proof/i
  );
});

test("REQ-SBX-GENERAL-002 parent proof rejects a child that shares its network namespace", async () => {
  const module = await hermeticModule();
  assert.equal(
    module.validateNetworkNamespaceIsolation("net:[100]", "net:[101]").network_attempts,
    0
  );
  assert.throws(
    () => module.validateNetworkNamespaceIsolation("net:[100]", "net:[100]"),
    /network_namespace/i
  );
});

test("REQ-SBX-GENERAL-002 evaluator contract graph excludes live Judge and profile modules", () => {
  const contracts = readFileSync(
    join(REPO_ROOT, "scripts/benchmark/sandbox-security/contracts.ts"),
    "utf8"
  );
  assert.doesNotMatch(
    contracts,
    /(?:p6-live-capture-profile|judge-protocol-adapter)\.ts/u
  );
});

test("REQ-SBX-GENERAL-002 hermetic artifact scanner rejects raw provider payload keys", async () => {
  const module = await hermeticModule();
  assert.doesNotThrow(() =>
    module.assertNoRawContentLeaks({
      schema_version: "sandbox-security-benchmark-decision-projection.v1",
      projection: {
        schema_version: "sandbox-security-decision.v1",
        verdict: "no_detected_risk",
        action: "allow",
        risk_level: "info",
        finding_count: 0,
        detector_run_count: 1,
        evidence_ref_count: 0
      }
    })
  );
  assert.throws(
    () =>
      module.assertNoRawContentLeaks({
        response: { content: "raw provider payload" }
      }),
    /raw_content_leak/i
  );
});

test("REQ-SBX-GENERAL-002 replay keeps raw benchmark input writes outside content-free artifact scanning", () => {
  const replay = readFileSync(
    join(REPO_ROOT, "scripts/benchmark/sandbox-security/replay-hermetic.ts"),
    "utf8"
  );
  assert.doesNotMatch(
    replay,
    /writeJson\(join\(anonymousRoot, entry\)/u,
    "anonymous input envelopes are intentionally raw input and need a dedicated bounded writer"
  );
});

test("REQ-SBX-GENERAL-002 replay keeps expected metrics outside the evaluator capture root", () => {
  const replay = readFileSync(
    join(REPO_ROOT, "scripts/benchmark/sandbox-security/replay-hermetic.ts"),
    "utf8"
  );
  assert.doesNotMatch(
    replay,
    /const expectedMetricsPath = join\(evaluatorRoot, "expected-metrics\.json"\)/u,
    "expected metrics must be isolated from the evaluator capture subtree"
  );
});

test("REQ-SBX-GENERAL-002 replay rebuilds the evaluator candidate capture manifest", async () => {
  const module = await hermeticModule();
  assert.equal(typeof module.manifestToCandidateCaptureManifest, "function");
  const candidate = module.manifestToCandidateCaptureManifest!({
    schema_version: "sandbox-security-benchmark-capture.v2",
    benchmark_manifest_sha256: "c".repeat(64),
    sources_lock_sha256: "d".repeat(64),
    inputs_tree_sha256: SHA,
    decisions_tree_sha256: "e".repeat(64),
    cassette_tree_sha256: "f".repeat(64),
    execution_profile_id: "sandbox-security-p6-live-capture.v8",
    readiness_timeout_ms: 40000,
    qualification_timeout_ms: 40000,
    local_detector_slot_timeout_ms: 60000,
    judge_detector_slot_timeout_ms: 300000,
    normal_work_budget_ms: 360000,
    ollama_model: "qwen3:8b",
    ollama_digest: `sha256:${"1".repeat(64)}`,
    ollama_qualification: { inventory: [], prewarm: [] },
    judge_protocol_id: "openai_chat_completions_v1",
    judge_endpoint_policy_id: "sandbox-security-operator-https-fqdn-v1",
    judge_base_url: "https://judge.example.test",
    judge_endpoint_url: "https://judge.example.test/v1/chat/completions",
    judge_requested_model: "judge-model",
    judge_resolved_model: "judge-model",
    judge_binding_sha256: BINDING,
    local_prompt_version: "sandbox-security-ollama-local-prompt.v2",
    judge_prompt_version: "sandbox-security-openai-judge-prompt.v2",
    local_schema_version: "sandbox-security-local-model.v1",
    judge_schema_version: "sandbox-security-judge.v1",
    rule_catalog_version: "sandbox-security-rule-catalog.v1",
    sanitizer_version: "sandbox-security-deterministic-sanitizer.v1"
  });

  assert.equal(candidate.fixture_count, 300);
  assert.equal(candidate.inputs_tree_sha256, SHA);
  assert.equal("benchmark_manifest_sha256" in candidate, false);
  assert.equal("sources_lock_sha256" in candidate, false);
  assert.equal("decisions_tree_sha256" in candidate, false);
  assert.equal("cassette_tree_sha256" in candidate, false);
});

test("REQ-SBX-GENERAL-002 hermetic replay fails closed when accepted evidence is absent", async () => {
  const module = await hermeticModule();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-hermetic-red-"));
  try {
    await assert.rejects(
      module.runSandboxSecurityHermeticReplay({ root }),
      /live_evidence|seal|accepted|replay/i
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-002 hermetic replay accepts complete quality-failed metrics with indeterminate outputs", async () => {
  const module = await hermeticModule();
  assert.equal(typeof module.assertSandboxSecurityHermeticReplayCompleteRun, "function");
  assert.doesNotThrow(() =>
    module.assertSandboxSecurityHermeticReplayCompleteRun({
      input_count: 300,
      accepted_metrics: {
        accepted: false,
        numerators: { decided: 298 }
      }
    })
  );
  assert.throws(
    () =>
      module.assertSandboxSecurityHermeticReplayCompleteRun({
        input_count: 299,
        accepted_metrics: {
          accepted: false,
          numerators: { decided: 298 }
        }
      }),
    /accepted_seal_invalid|complete|count/i
  );
});

test("REQ-SBX-GENERAL-002 hermetic replay fails closed when staging cleanup fails", async () => {
  const module = await hermeticModule();
  assert.throws(
    () => module.cleanupSandboxSecurityHermeticReplayStaging({
      staging_root: "/tmp/sandbox-security-staging",
      remove: () => {
        throw new Error("cleanup sentinel");
      }
    }),
    /staging_cleanup_failed/i
  );
});
