import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type { Task } from "../../shared/types/task.ts";

const normalizerModulePath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/skills-static/skills-static-result-normalizer.ts"
);
const deriverModulePath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/skills-static/risk-summary-deriver.ts"
);

type NormalizerModule = {
  normalizeSkillsStaticEngineOutput?: (value: unknown, task: Task) => unknown;
};

type DeriverModule = {
  deriveStaticAnalysisRiskSummary?: (details: unknown) => unknown;
};

async function importIfExists<TModule>(filePath: string): Promise<TModule | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return import(pathToFileURL(filePath).href) as Promise<TModule>;
}

function createStaticAnalysisTask(): Task {
  return {
    task_id: "task_static_core_001",
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "pending",
    title: "Analyze canonical skill",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/canonical-skill-package",
      display_name: "canonical-skill-package"
    },
    parameters: {
      language: "typescript"
    },
    risk_level: "info",
    summary: "Task accepted and waiting for engine dispatch",
    created_at: "2026-04-04T00:00:00Z",
    updated_at: "2026-04-04T00:00:00Z"
  };
}

test("skills-static result normalizer strips engine-private fields and risk_score from a loose engine output", async () => {
  const normalizerModule = await importIfExists<NormalizerModule>(normalizerModulePath);

  assert.notEqual(normalizerModule, null, "skills-static result normalizer module should exist before engine output can be normalized");
  assert.ok(
    normalizerModule?.normalizeSkillsStaticEngineOutput,
    "skills-static result normalizer should expose a concrete engine-output normalizer"
  );

  if (!normalizerModule?.normalizeSkillsStaticEngineOutput) {
    return;
  }

  const normalizedDetails = normalizerModule.normalizeSkillsStaticEngineOutput(
    {
      sample_name: "canonical-skill-package",
      language: "typescript",
      entry_files: ["src/index.ts", "src/network.ts"],
      files_scanned: 4,
      risk_score: 92,
      engine_private_session_id: "private-session",
      rule_hits: [
        {
          rule_id: "SA001",
          severity: "high",
          title: "Shell command reaches an execution sink",
          engine_private_trace_id: "private-trace"
        },
        {
          rule_id: "SA002",
          severity: "medium",
          title: "Outbound network request lacks destination allowlist",
          risk_score: 55
        }
      ],
      sensitive_capabilities: ["command_execution", "network_access"],
      dependency_summary: {
        manifest_count: 1,
        dependency_count: 4
      }
    },
    createStaticAnalysisTask()
  ) as {
    sample_name?: string;
    language?: string;
    entry_files?: string[];
    files_scanned?: number;
    rule_hits?: Array<Record<string, unknown>>;
    sensitive_capabilities?: string[];
    dependency_summary?: Record<string, unknown>;
  };

  assert.deepEqual(normalizedDetails, {
    sample_name: "canonical-skill-package",
    language: "typescript",
    entry_files: ["src/index.ts", "src/network.ts"],
    files_scanned: 4,
    rule_hits: [
      {
        rule_id: "SA001",
        severity: "high",
        title: "Shell command reaches an execution sink"
      },
      {
        rule_id: "SA002",
        severity: "medium",
        title: "Outbound network request lacks destination allowlist"
      }
    ],
    sensitive_capabilities: ["command_execution", "network_access"],
    dependency_summary: {
      manifest_count: 1,
      dependency_count: 4
    }
  });
});

test("skills-static result normalizer raises SKILLS_STATIC_INVALID_ENGINE_OUTPUT when a rule hit is missing rule_id", async () => {
  const normalizerModule = await importIfExists<NormalizerModule>(normalizerModulePath);

  assert.ok(normalizerModule?.normalizeSkillsStaticEngineOutput);

  if (!normalizerModule?.normalizeSkillsStaticEngineOutput) {
    return;
  }

  assert.throws(
    () =>
      normalizerModule.normalizeSkillsStaticEngineOutput?.(
        {
          sample_name: "canonical-skill-package",
          language: "typescript",
          entry_files: ["src/index.ts"],
          files_scanned: 1,
          rule_hits: [
            {
              severity: "high"
            }
          ],
          sensitive_capabilities: ["command_execution"],
          dependency_summary: {}
        },
        createStaticAnalysisTask()
      ),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.notEqual(error, null);
      assert.equal((error as { name?: string }).name, "DomainError");
      assert.equal((error as { code?: string }).code, "SKILLS_STATIC_INVALID_ENGINE_OUTPUT");
      return true;
    }
  );
});

test("skills-static result normalizer raises SKILLS_STATIC_INVALID_ENGINE_OUTPUT when a rule hit has an invalid severity", async () => {
  const normalizerModule = await importIfExists<NormalizerModule>(normalizerModulePath);

  assert.ok(normalizerModule?.normalizeSkillsStaticEngineOutput);

  if (!normalizerModule?.normalizeSkillsStaticEngineOutput) {
    return;
  }

  assert.throws(
    () =>
      normalizerModule.normalizeSkillsStaticEngineOutput?.(
        {
          sample_name: "canonical-skill-package",
          language: "typescript",
          entry_files: ["src/index.ts"],
          files_scanned: 1,
          rule_hits: [
            {
              rule_id: "SA001",
              severity: "urgent"
            }
          ],
          sensitive_capabilities: ["command_execution"],
          dependency_summary: {}
        },
        createStaticAnalysisTask()
      ),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.notEqual(error, null);
      assert.equal((error as { name?: string }).name, "DomainError");
      assert.equal((error as { code?: string }).code, "SKILLS_STATIC_INVALID_ENGINE_OUTPUT");
      return true;
    }
  );
});

test("risk summary deriver aggregates severity counts and chooses the highest risk level", async () => {
  const deriverModule = await importIfExists<DeriverModule>(deriverModulePath);

  assert.notEqual(deriverModule, null, "risk summary deriver module should exist before severity aggregation can be verified");
  assert.ok(deriverModule?.deriveStaticAnalysisRiskSummary, "risk summary deriver should expose a concrete aggregation function");

  if (!deriverModule?.deriveStaticAnalysisRiskSummary) {
    return;
  }

  const derivedSummary = deriverModule.deriveStaticAnalysisRiskSummary({
    sample_name: "canonical-skill-package",
    rule_hits: [
      {
        rule_id: "SA001",
        severity: "high"
      },
      {
        rule_id: "SA002",
        severity: "medium"
      }
    ]
  }) as {
    risk_level: string;
    total_findings: number;
    info_count: number;
    low_count: number;
    medium_count: number;
    high_count: number;
    critical_count: number;
  };

  assert.deepEqual(derivedSummary, {
    risk_level: "high",
    total_findings: 2,
    info_count: 0,
    low_count: 0,
    medium_count: 1,
    high_count: 1,
    critical_count: 0
  });
});

test("risk summary deriver falls back to info when there are no rule hits", async () => {
  const deriverModule = await importIfExists<DeriverModule>(deriverModulePath);

  assert.ok(deriverModule?.deriveStaticAnalysisRiskSummary);

  if (!deriverModule?.deriveStaticAnalysisRiskSummary) {
    return;
  }

  const derivedSummary = deriverModule.deriveStaticAnalysisRiskSummary({
    sample_name: "canonical-skill-package",
    rule_hits: []
  }) as {
    risk_level: string;
    total_findings: number;
    info_count: number;
    low_count: number;
    medium_count: number;
    high_count: number;
    critical_count: number;
  };

  assert.deepEqual(derivedSummary, {
    risk_level: "info",
    total_findings: 0,
    info_count: 0,
    low_count: 0,
    medium_count: 0,
    high_count: 0,
    critical_count: 0
  });
});
