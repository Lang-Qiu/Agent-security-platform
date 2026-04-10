import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type { Task } from "../../shared/types/task.ts";

const semgrepRunnerPath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/skills-static/semgrep-runner.ts"
);
const semgrepOutputMapperPath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/skills-static/semgrep-output-mapper.ts"
);
const normalizerPath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/skills-static/skills-static-result-normalizer.ts"
);
const deriverPath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/skills-static/risk-summary-deriver.ts"
);
const clientPath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/clients/skills-static.engine-client.ts"
);

type SemgrepRunnerModule = {
  runSemgrepScan?: (options: { targetPath: string; rulePath: string }) => Promise<unknown>;
};

type SemgrepOutputMapperModule = {
  mapSemgrepOutputToEngineOutput?: (rawOutput: unknown, task: Task) => unknown;
};

type SkillsStaticNormalizerModule = {
  normalizeSkillsStaticEngineOutput?: (value: unknown, task: Task) => unknown;
};

type RiskSummaryDeriverModule = {
  deriveStaticAnalysisRiskSummary?: (details: unknown) => unknown;
};

type SkillsStaticClientModule = {
  SkillsStaticEngineClient?: new () => {
    dispatch: (ticket: unknown) => Promise<unknown>;
  };
};

async function importIfExists<TModule>(filePath: string): Promise<TModule | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return import(pathToFileURL(filePath).href) as Promise<TModule>;
}

function createRealScanTask(): Task {
  return {
    task_id: "task_static_real_scan_001",
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "pending",
    title: "Analyze real scan fixture",
    target: {
      target_type: "skill_package",
      target_value: resolve(import.meta.dirname, "../../tests/fixtures/skills-static-real-scan"),
      display_name: "skills-static-real-scan"
    },
    parameters: {
      language: "typescript"
    },
    risk_level: "info",
    summary: "Task accepted and waiting for engine dispatch",
    created_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:00Z"
  };
}

test("semgrep output mapper adapts raw semgrep JSON into SkillsStaticEngineOutput", async () => {
  const mapperModule = await importIfExists<SemgrepOutputMapperModule>(semgrepOutputMapperPath);

  assert.notEqual(mapperModule, null, "semgrep output mapper module should exist before raw output can be adapted");
  assert.ok(mapperModule?.mapSemgrepOutputToEngineOutput, "semgrep output mapper should expose a concrete mapping function");

  if (!mapperModule?.mapSemgrepOutputToEngineOutput) {
    return;
  }

  const task = createRealScanTask();
  const engineOutput = mapperModule.mapSemgrepOutputToEngineOutput(
    {
      results: [
        {
          check_id: "skills-static.command-execution",
          path: "src/commands.ts",
          start: { line: 3 },
          end: { line: 3 },
          extra: {
            message: "Potential command execution sink reached",
            lines: "return exec(commandInput);",
            metadata: {
              title: "Shell command reaches an execution sink",
              category: "command_execution",
              platform_severity: "high",
              recommendation: "Replace shell execution with an allowlisted wrapper",
              source_type: "user_input",
              sink_type: "command_execution",
              tags: ["command", "input-flow"],
              engine_private_debug: "hidden"
            }
          }
        },
        {
          check_id: "skills-static.network-egress",
          path: "src/network.ts",
          start: { line: 2 },
          end: { line: 2 },
          extra: {
            message: "Outbound network request lacks destination allowlist",
            lines: "return fetch(targetUrl);",
            metadata: {
              title: "Outbound network request lacks destination allowlist",
              category: "network_access",
              platform_severity: "medium",
              recommendation: "Restrict outbound destinations to an allowlist",
              source_type: "config",
              sink_type: "network_request",
              tags: ["network", "egress"]
            }
          }
        }
      ],
      paths: {
        scanned: ["src/commands.ts", "src/network.ts"]
      }
    },
    task
  ) as {
    sample_name?: string;
    language?: string;
    entry_files?: string[];
    files_scanned?: number;
    rule_hits?: Array<{ rule_id?: string; severity?: string; category?: string; title?: string }>;
    sensitive_capabilities?: string[];
    dependency_summary?: Record<string, unknown>;
  };

  assert.deepEqual(engineOutput, {
    sample_name: "skills-static-real-scan",
    language: "typescript",
    entry_files: ["src/commands.ts", "src/network.ts"],
    files_scanned: 2,
    rule_hits: [
      {
        rule_id: "skills-static.command-execution",
        title: "Shell command reaches an execution sink",
        category: "command_execution",
        severity: "high",
        message: "Potential command execution sink reached",
        file_path: "src/commands.ts",
        line_start: 3,
        line_end: 3,
        code_snippet: "return exec(commandInput);",
        recommendation: "Replace shell execution with an allowlisted wrapper",
        source_type: "user_input",
        sink_type: "command_execution",
        tags: ["command", "input-flow"]
      },
      {
        rule_id: "skills-static.network-egress",
        title: "Outbound network request lacks destination allowlist",
        category: "network_access",
        severity: "medium",
        message: "Outbound network request lacks destination allowlist",
        file_path: "src/network.ts",
        line_start: 2,
        line_end: 2,
        code_snippet: "return fetch(targetUrl);",
        recommendation: "Restrict outbound destinations to an allowlist",
        source_type: "config",
        sink_type: "network_request",
        tags: ["network", "egress"]
      }
    ],
    sensitive_capabilities: ["command_execution", "network_access"],
    dependency_summary: {
      source: "semgrep",
      manifests_scanned: 0
    }
  });
});

test("skills-static engine client can run semgrep against the local sample and still satisfy the normalized result contract", async () => {
  const runnerModule = await importIfExists<SemgrepRunnerModule>(semgrepRunnerPath);
  const mapperModule = await importIfExists<SemgrepOutputMapperModule>(semgrepOutputMapperPath);
  const normalizerModule = await importIfExists<SkillsStaticNormalizerModule>(normalizerPath);
  const deriverModule = await importIfExists<RiskSummaryDeriverModule>(deriverPath);
  const clientModule = await importIfExists<SkillsStaticClientModule>(clientPath);

  assert.notEqual(runnerModule, null, "semgrep runner module should exist before the real detection path can be verified");
  assert.notEqual(mapperModule, null, "semgrep output mapper module should exist before the real detection path can be verified");
  assert.notEqual(normalizerModule, null, "skills-static normalizer should exist before the real detection path can be verified");
  assert.notEqual(deriverModule, null, "risk summary deriver should exist before the real detection path can be verified");
  assert.notEqual(clientModule, null, "skills-static engine client module should exist before provider switching can be verified");
  assert.ok(runnerModule?.runSemgrepScan, "semgrep runner should expose a concrete scan function");
  assert.ok(mapperModule?.mapSemgrepOutputToEngineOutput, "semgrep output mapper should expose a concrete mapping function");
  assert.ok(normalizerModule?.normalizeSkillsStaticEngineOutput, "skills-static normalizer should expose a concrete normalization function");
  assert.ok(deriverModule?.deriveStaticAnalysisRiskSummary, "risk summary deriver should expose a concrete derivation function");
  assert.ok(clientModule?.SkillsStaticEngineClient, "skills-static engine client should expose a concrete client class");

  if (
    !runnerModule?.runSemgrepScan ||
    !mapperModule?.mapSemgrepOutputToEngineOutput ||
    !normalizerModule?.normalizeSkillsStaticEngineOutput ||
    !deriverModule?.deriveStaticAnalysisRiskSummary ||
    !clientModule?.SkillsStaticEngineClient
  ) {
    return;
  }

  const task = createRealScanTask();
  const rulePath = resolve(import.meta.dirname, "../../engines/skills-static/rules/semgrep-minimal.yml");

  const rawOutput = await runnerModule.runSemgrepScan({
    targetPath: task.target.target_value,
    rulePath
  });
  const mappedOutput = mapperModule.mapSemgrepOutputToEngineOutput(rawOutput, task);
  const normalizedDetails = normalizerModule.normalizeSkillsStaticEngineOutput(mappedOutput, task) as {
    sample_name?: string;
    language?: string;
    entry_files?: string[];
    files_scanned?: number;
    rule_hits?: Array<{ rule_id?: string; severity?: string; category?: string }>;
    sensitive_capabilities?: string[];
    dependency_summary?: Record<string, unknown>;
  };
  const derivedSummary = deriverModule.deriveStaticAnalysisRiskSummary(normalizedDetails) as {
    risk_level: string;
    total_findings: number;
    info_count: number;
    low_count: number;
    medium_count: number;
    high_count: number;
    critical_count: number;
  };

  const previousProvider = process.env.SKILLS_STATIC_ENGINE_PROVIDER;
  process.env.SKILLS_STATIC_ENGINE_PROVIDER = "semgrep";

  try {
    const client = new clientModule.SkillsStaticEngineClient();
    const receipt = await client.dispatch({
      task_id: task.task_id,
      task_type: task.task_type,
      engine_type: task.engine_type,
      payload: {
        target: task.target,
        analysis_parameters: task.parameters
      }
    });

    assert.equal((receipt as { accepted?: boolean }).accepted, true);
    assert.equal((receipt as { engine_type?: string }).engine_type, "skills_static");
    assert.ok((receipt as { mock_result?: unknown }).mock_result);
  } finally {
    if (previousProvider === undefined) {
      delete process.env.SKILLS_STATIC_ENGINE_PROVIDER;
    } else {
      process.env.SKILLS_STATIC_ENGINE_PROVIDER = previousProvider;
    }
  }

  assert.equal(normalizedDetails.sample_name, "skills-static-real-scan");
  assert.equal(normalizedDetails.language, "typescript");
  assert.ok(Array.isArray(normalizedDetails.entry_files) && normalizedDetails.entry_files.length >= 2);
  assert.ok(typeof normalizedDetails.files_scanned === "number" && normalizedDetails.files_scanned >= 2);
  assert.ok(Array.isArray(normalizedDetails.rule_hits) && normalizedDetails.rule_hits.length >= 2);
  assert.ok(normalizedDetails.rule_hits?.some((ruleHit) => ruleHit.category === "command_execution"));
  assert.ok(normalizedDetails.rule_hits?.some((ruleHit) => ruleHit.category === "network_access"));
  assert.deepEqual(normalizedDetails.sensitive_capabilities, ["command_execution", "network_access"]);
  assert.deepEqual(normalizedDetails.dependency_summary, {
    source: "semgrep",
    manifests_scanned: 0
  });
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
