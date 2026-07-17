import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const MASTER_PATH =
  "docs/superpowers/plans/2026-07-16-sandbox-security-production-002-master.md";

const PHASE_PATHS = [
  "docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-1-boundaries-rules.md",
  "docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-2-transport-local.md",
  "docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-3-sanitizer-judge.md",
  "docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-4-production-composition.md",
  "docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-5-benchmark-corpus.md",
  "docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-6-live-capture.md",
  "docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-7-hermetic-closure.md"
] as const;

const EXPECTED_TASK_COUNTS = [4, 5, 4, 4, 4, 4, 4] as const;

function readRequired(relativePath: string): string {
  assert.equal(existsSync(relativePath), true, `missing plan ${relativePath}`);
  return readFileSync(relativePath, "utf8");
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ");
}

function assertNoPlanPlaceholders(text: string): void {
  assert.doesNotMatch(
    text,
    /\b(?:TBD|TODO|implement later|fill in details|similar to Task)\b/i
  );
}

function taskSections(phase: string): Array<Readonly<{
  taskId: string;
  text: string;
}>> {
  const matches = [...phase.matchAll(/^### (P[1-7]-T[1-9][0-9]*):/gm)];
  return matches.map((match, index) => ({
    taskId: match[1]!,
    text: phase.slice(match.index!, matches[index + 1]?.index ?? phase.length)
  }));
}

function assertSemanticPlanContracts(input: Readonly<{
  master: string;
  phases: readonly string[];
}>): void {
  const [phase1, , phase3, phase4, phase5, phase6, phase7] = input.phases;
  assert.match(input.master, /Specification Compliance Review/);
  assert.match(input.master, /Code Quality\/Security Review/);
  assert.match(input.master, /typecheck:benchmark:sandbox-security/);
  assert.match(input.master, /external-pipeline\.ts/);
  assert.match(input.master, /seal\.ts/);

  assert.match(phase1!, /Content-free replay outcome\/interface names/);
  assert.match(phase1!, /rejects dynamic import[\s\S]*every production module/);
  assert.doesNotMatch(
    phase1!,
    /truth\|replay\/iu/,
    "anti-oracle gate must not ban required content-free replay names"
  );

  assert.match(phase3!, /engineValidRequestWithSanitizerInvalidUrl/);
  assert.doesNotMatch(phase3!, /throwingSanitizer/);
  assert.match(phase3!, /createSandboxSecurityExternalPipeline/);

  assert.match(phase4!, /createSandboxSecurityProductionCompositionWithPorts/);
  assert.match(phase4!, /never exported by index\.ts/);
  assert.match(phase4!, /public index only for[\s\S]*rule_only success/);

  assert.match(phase5!, /scripts\/benchmark\/sandbox-security\/tsconfig\.json/);
  assert.match(phase5!, /typecheck:benchmark:sandbox-security/);
  assert.match(phase5!, /buildSandboxSecurityCaptureChildCommand/);

  assert.match(phase6!, /scripts\/benchmark\/sandbox-security\/seal\.ts/);
  assert.match(phase6!, /truth-blind sealer/);
  assert.doesNotMatch(
    phase6!,
    /prepare-capture-bundle\.ts\s*\nnode .*capture-live\.ts/,
    "live capture must run only through the permission parent"
  );

  assert.match(phase7!, /inputs: readonly SandboxSecurityReplayInputUnit\[\]/);
  assert.doesNotMatch(phase7!, /inputs: readonly SandboxSecurityReplayEnvelope\[\]/);
  assert.match(phase7!, /Engine and truth evaluator run in separate permission children/);
  assert.match(phase7!, /tests\/repository\/sandbox-security-benchmark\.spec\.ts/);
  assert.doesNotMatch(phase7!, /sandbox-security-production-global\.spec\.ts/);
  assert.match(phase7!, /confirm RED against the still-in-progress sprint status/);
}

test("REQ-SBX-GENERAL-002 plan set has one Master and seven Phase plans", () => {
  const master = readRequired(MASTER_PATH);
  assert.match(master, /^# REQ-SBX-GENERAL-002 Master Implementation Plan/m);
  assert.match(master, /REQUIRED SUB-SKILL/);
  assert.match(master, /superpowers:subagent-driven-development/);
  assert.match(master, /superpowers:test-driven-development/);
  assert.match(master, /2026-07-16-sandbox-security-production-detectors-spec\.md/);
  assert.match(master, /## Phase DAG/);
  assert.match(master, /## Production File Unique Ownership/);
  assert.match(master, /## Spec Coverage Matrix/);
  assert.match(master, /## Required Evidence Per Task/);
  assert.match(master, /## Requirement Exit Gate/);
  assert.match(compact(master), /Phase 1.*Phase 2.*Phase 3.*Phase 4.*Phase 5.*Phase 6.*Phase 7/);

  for (const [phaseIndex, phasePath] of PHASE_PATHS.entries()) {
    assert.match(master, new RegExp(phasePath.split("/").at(-1)!.replaceAll(".", "\\.")));
    const phase = readRequired(phasePath);
    assert.match(phase, /^# Phase [1-7].*Implementation Plan/m);
    assert.match(phase, /- \[ \] \*\*Step 1:/);
    assert.match(phase, /## Phase Entry Gate/);
    assert.match(phase, /## Task DAG/);
    assert.match(phase, /## Phase Exit Gate/);
    assert.match(phase, /RED command/);
    assert.match(phase, /Independent Review/);
    assert.match(phase, /Re-review/);
    assert.match(phase, /npm run build --prefix frontend/);
    assert.match(phase, /git diff --check/);
    assertNoPlanPlaceholders(phase);

    const tasks = taskSections(phase);
    assert.equal(tasks.length, EXPECTED_TASK_COUNTS[phaseIndex]);
    assert.deepEqual(
      tasks.map((task) => task.taskId),
      Array.from(
        { length: EXPECTED_TASK_COUNTS[phaseIndex] },
        (_, taskIndex) => `P${phaseIndex + 1}-T${taskIndex + 1}`
      )
    );
    for (const task of tasks) {
      assert.match(task.text, /- \[ \] \*\*Step 1:/, `${task.taskId} needs Step 1`);
      assert.match(task.text, /RED command/, `${task.taskId} needs RED command`);
      assert.match(task.text, /focused GREEN/, `${task.taskId} needs GREEN command`);
      assert.match(task.text, /Independent Review/, `${task.taskId} needs independent review`);
      assert.match(task.text, /Re-review/, `${task.taskId} needs re-review`);
      assert.match(task.text, /tsc --noEmit -p engines\/sandbox\/tsconfig\.json/, `${task.taskId} needs sandbox typecheck`);
      assert.match(task.text, /npm run build --prefix frontend/, `${task.taskId} needs frontend build`);
      assert.match(task.text, /git diff --check/, `${task.taskId} needs diff check`);
      assert.match(task.text, /docs\/progress\.md/, `${task.taskId} needs status synchronization`);
      assert.match(task.text, /git add /, `${task.taskId} needs exact staging`);
      assert.match(task.text, /git commit -m /, `${task.taskId} needs exact commit`);
      if (phaseIndex >= 4) {
        assert.match(
          task.text,
          /npm run typecheck:benchmark:sandbox-security/,
          `${task.taskId} needs benchmark typecheck`
        );
      }
    }
  }
  assertNoPlanPlaceholders(master);
  assertSemanticPlanContracts({
    master,
    phases: PHASE_PATHS.map((phasePath) => readRequired(phasePath))
  });
});

test("REQ-SBX-GENERAL-002 semantic plan gate rejects weakened review and isolation plans", () => {
  const master = readRequired(MASTER_PATH);
  const phases = PHASE_PATHS.map((phasePath) => readRequired(phasePath));
  const mutations: Array<Readonly<{
    label: string;
    master?: string;
    phases?: string[];
  }>> = [
    {
      label: "single merged review",
      master: master.replaceAll("Code Quality/Security Review", "Combined Review")
    },
    {
      label: "fixture-bearing replay transport",
      phases: phases.map((phase, index) =>
        index === 6
          ? phase.replace("inputs: readonly SandboxSecurityReplayInputUnit[]", "inputs: readonly SandboxSecurityReplayEnvelope[]")
          : phase
      )
    },
    {
      label: "direct unpermissioned live child",
      phases: phases.map((phase, index) =>
        index === 5
          ? phase.replace(
              "node --experimental-strip-types scripts/benchmark/sandbox-security/prepare-capture-bundle.ts",
              "node --experimental-strip-types scripts/benchmark/sandbox-security/prepare-capture-bundle.ts\nnode --experimental-strip-types scripts/benchmark/sandbox-security/capture-live.ts"
            )
          : phase
      )
    }
  ];

  for (const mutation of mutations) {
    assert.throws(
      () => assertSemanticPlanContracts({
        master: mutation.master ?? master,
        phases: mutation.phases ?? phases
      }),
      mutation.label
    );
  }
});

test("REQ-SBX-GENERAL-002 Master separates every minimum Spec workstream", () => {
  const master = compact(readRequired(MASTER_PATH));
  for (const required of [
    "production ownership and capability gates",
    "rule catalog and detector",
    "HTTP transport and production config",
    "Ollama adapter",
    "deterministic sanitizer",
    "OpenAI Judge adapter",
    "production composition",
    "source lock and corpus contracts",
    "sealed input and truth curation",
    "live capture and evaluator",
    "hermetic replay and anti-oracle gates",
    "documentation, full regression, and global review"
  ]) {
    assert.match(master, new RegExp(required, "i"));
  }
});

test("REQ-SBX-GENERAL-002 plan gate is permanently registered", () => {
  const packageJson = JSON.parse(readRequired("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.match(
    packageJson.scripts?.["test:repo"] ?? "",
    /tests\/repository\/sandbox-security-production-plan\.spec\.ts/
  );
});
