import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type { Task } from "../../shared/types/task.ts";
import {
  CANONICAL_STATIC_ANALYSIS_DETAILS,
  CANONICAL_STATIC_ANALYSIS_STRONG_DETAILS_PROJECTION,
  STATIC_ANALYSIS_PENDING_SUMMARY,
  createCanonicalStaticAnalysisBaseResult,
  createCanonicalStaticAnalysisFinishedTask,
  createCanonicalStaticAnalysisRiskSummary
} from "../../tests/fixtures/static-analysis-contract.fixture.ts";

const engineServicePath = resolve(import.meta.dirname, "../src/modules/task-center/task-engine.service.ts");
const registryPath = resolve(import.meta.dirname, "../src/modules/task-center/adapters/engine-adapter-registry.ts");
const engineClientRegistryPath = resolve(import.meta.dirname, "../src/modules/task-center/clients/engine-client-registry.ts");
const assetAdapterPath = resolve(import.meta.dirname, "../src/modules/task-center/adapters/asset-scan.adapter.ts");
const skillsAdapterPath = resolve(import.meta.dirname, "../src/modules/task-center/adapters/skills-static.adapter.ts");
const skillsClientPath = resolve(import.meta.dirname, "../src/modules/task-center/clients/skills-static.engine-client.ts");
const skillsStaticNormalizerPath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/skills-static/skills-static-result-normalizer.ts"
);
const sandboxAdapterPath = resolve(import.meta.dirname, "../src/modules/task-center/adapters/sandbox.adapter.ts");

type AdapterModule = {
  AssetScanTaskAdapter?: new () => {
    taskType: string;
    engineType: string;
    createDispatchPayload: (task: Task) => unknown;
    createInitialDetails: (task: Task) => unknown;
  };
  SkillsStaticTaskAdapter?: new () => {
    taskType: string;
    engineType: string;
    createDispatchPayload: (task: Task) => unknown;
    createInitialDetails: (task: Task) => unknown;
  };
  mapSkillsStaticEngineResultToDetails?: (engineResult: unknown, task: Task) => unknown;
  SandboxTaskAdapter?: new () => {
    taskType: string;
    engineType: string;
    createDispatchPayload: (task: Task) => unknown;
    createInitialDetails: (task: Task) => unknown;
  };
};

type TaskEngineServiceModule = {
  TaskEngineService?: new (options: { adapters: unknown[]; engineClients?: unknown[] }) => {
    createDispatchTicket: (task: Task) => unknown;
    createInitialArtifacts: (task: Task) => Promise<unknown>;
    dispatchTask: (task: Task) => Promise<unknown>;
    createCompletedStaticAnalysisArtifacts?: (task: Task, mockResult: unknown, updatedAt: string) => unknown;
  };
};

type EngineAdapterRegistryModule = {
  EngineAdapterRegistry?: new (adapters: unknown[]) => {
    getRequiredAdapter: (taskType: Task["task_type"]) => unknown;
  };
};

type EngineClientRegistryModule = {
  EngineClientRegistry?: new (clients: unknown[]) => {
    getRequiredClient: (engineType: Task["engine_type"]) => unknown;
  };
};

type SkillsStaticEngineClientModule = {
  SkillsStaticEngineClient?: new (options?: {
    endpoint?: string;
    onDispatch?: (ticket: unknown) => void | Promise<void>;
  }) => {
    engineType: string;
    endpoint: string;
    dispatch: (ticket: unknown) => Promise<unknown>;
  };
};

type SkillsStaticNormalizerModule = {
  normalizeSkillsStaticEngineOutput?: (value: unknown, task: Task) => unknown;
};

async function importIfExists<TModule>(filePath: string): Promise<TModule | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return import(pathToFileURL(filePath).href) as Promise<TModule>;
}

function projectStandardizedDetails(value: {
  sample_name?: string;
  language?: string;
  rule_hits?: Array<{
    rule_id?: string;
    severity?: string;
    message?: string;
    file_path?: string;
    line_start?: number;
    line_end?: number;
  }>;
}) {
  return {
    sample_name: value.sample_name,
    language: value.language,
    rule_hits: (value.rule_hits ?? []).map((ruleHit) => ({
      rule_id: ruleHit.rule_id,
      severity: ruleHit.severity,
      message: ruleHit.message,
      file_path: ruleHit.file_path,
      line_start: ruleHit.line_start,
      line_end: ruleHit.line_end
    }))
  };
}

function createTask(taskType: Task["task_type"]): Task {
  const baseTask: Task = {
    task_id: `task_${taskType}`,
    task_type: taskType,
    engine_type:
      taskType === "asset_scan"
        ? "asset_scan"
        : taskType === "static_analysis"
          ? "skills_static"
          : "sandbox",
    status: "pending",
    title: `Demo ${taskType} task`,
    target: {
      target_type:
        taskType === "asset_scan"
          ? "url"
          : taskType === "static_analysis"
            ? "skill_package"
            : "session",
      target_value:
        taskType === "asset_scan"
          ? "https://demo-agent.example.com"
          : taskType === "static_analysis"
            ? "samples/skills/demo-package"
            : "sandbox-session-001",
      display_name: taskType === "static_analysis" ? "demo-package" : undefined
    },
    parameters: {
      profile: taskType,
      depth: "minimal"
    },
    requested_by: "ops@example.com",
    risk_level: "info",
    summary: "Task accepted and waiting for engine dispatch",
    created_at: "2026-03-26T02:00:00Z",
    updated_at: "2026-03-26T02:00:00Z"
  };

  return baseTask;
}

test("engine adapters expose stable dispatch placeholders for asset, static-analysis, and sandbox tasks", async () => {
  const assetAdapterModule = await importIfExists<AdapterModule>(assetAdapterPath);
  const skillsAdapterModule = await importIfExists<AdapterModule>(skillsAdapterPath);
  const sandboxAdapterModule = await importIfExists<AdapterModule>(sandboxAdapterPath);

  assert.notEqual(assetAdapterModule, null, "asset-scan adapter module should exist before adapter placeholders can be verified");
  assert.notEqual(skillsAdapterModule, null, "skills-static adapter module should exist before adapter placeholders can be verified");
  assert.notEqual(sandboxAdapterModule, null, "sandbox adapter module should exist before adapter placeholders can be verified");
  assert.ok(assetAdapterModule?.AssetScanTaskAdapter, "asset-scan adapter should expose a concrete adapter class");
  assert.ok(skillsAdapterModule?.SkillsStaticTaskAdapter, "skills-static adapter should expose a concrete adapter class");
  assert.ok(sandboxAdapterModule?.SandboxTaskAdapter, "sandbox adapter should expose a concrete adapter class");

  const assetAdapter = new assetAdapterModule.AssetScanTaskAdapter();
  const skillsAdapter = new skillsAdapterModule.SkillsStaticTaskAdapter();
  const sandboxAdapter = new sandboxAdapterModule.SandboxTaskAdapter();

  assert.deepEqual(
    [
      {
        taskType: assetAdapter.taskType,
        engineType: assetAdapter.engineType,
        payload: assetAdapter.createDispatchPayload(createTask("asset_scan"))
      },
      {
        taskType: skillsAdapter.taskType,
        engineType: skillsAdapter.engineType,
        payload: skillsAdapter.createDispatchPayload(createTask("static_analysis"))
      },
      {
        taskType: sandboxAdapter.taskType,
        engineType: sandboxAdapter.engineType,
        payload: sandboxAdapter.createDispatchPayload(createTask("sandbox_run"))
      }
    ],
    [
      {
        taskType: "asset_scan",
        engineType: "asset_scan",
        payload: {
          target: {
            target_type: "url",
            target_value: "https://demo-agent.example.com",
            display_name: undefined
          },
          scan_parameters: {
            profile: "asset_scan",
            depth: "minimal"
          }
        }
      },
      {
        taskType: "static_analysis",
        engineType: "skills_static",
        payload: {
          target: {
            target_type: "skill_package",
            target_value: "samples/skills/demo-package",
            display_name: "demo-package"
          },
          analysis_parameters: {
            profile: "static_analysis",
            depth: "minimal"
          }
        }
      },
      {
        taskType: "sandbox_run",
        engineType: "sandbox",
        payload: {
          target: {
            target_type: "session",
            target_value: "sandbox-session-001",
            display_name: undefined
          },
          runtime_parameters: {
            profile: "sandbox_run",
            depth: "minimal"
          }
        }
      }
    ]
  );
});

test("skills-static adapter maps engine output into base-result compatible details without introducing risk_score", async () => {
  const skillsAdapterModule = await importIfExists<AdapterModule>(skillsAdapterPath);

  assert.notEqual(skillsAdapterModule, null, "skills-static adapter module should exist before engine result mapping can be verified");
  assert.ok(
    skillsAdapterModule?.mapSkillsStaticEngineResultToDetails,
    "skills-static adapter should expose a result-to-details mapper for static analysis"
  );

  if (!skillsAdapterModule?.mapSkillsStaticEngineResultToDetails) {
    return;
  }

  const details = skillsAdapterModule.mapSkillsStaticEngineResultToDetails(
    {
      sample_name: "demo-package",
      language: "typescript",
      risk_level: "high",
      risk_score: 98,
      entry_files: ["src/index.ts"],
      files_scanned: 1,
      rule_hits: [
        {
          rule_id: "SK001",
          title: "Dangerous command execution",
          category: "command_execution",
          severity: "critical",
          message: "Detected child_process.exec with untrusted input",
          file_path: "src/index.ts",
          line_start: 12,
          line_end: 14,
          code_snippet: "exec(userInput)",
          recommendation: "Replace shell execution with a safe allowlist wrapper",
          tags: ["command", "unsafe-input"],
          engine_private_debug: "should be stripped"
        }
      ],
      sensitive_capabilities: ["command_execution"],
      dependency_summary: {
        manifest_count: 1
      }
    },
    createTask("static_analysis")
  );

  assert.deepEqual(details, {
    sample_name: "demo-package",
    language: "typescript",
    entry_files: ["src/index.ts"],
    files_scanned: 1,
    rule_hits: [
      {
        rule_id: "SK001",
        title: "Dangerous command execution",
        category: "command_execution",
        severity: "critical",
        message: "Detected child_process.exec with untrusted input",
        file_path: "src/index.ts",
        line_start: 12,
        line_end: 14,
        code_snippet: "exec(userInput)",
        recommendation: "Replace shell execution with a safe allowlist wrapper",
        tags: ["command", "unsafe-input"]
      }
    ],
    sensitive_capabilities: ["command_execution"],
    dependency_summary: {
      manifest_count: 1
    }
  });
});

test("task engine service maps tasks into initial result and risk summary shells without leaking engine internals", async () => {
  const serviceModule = await importIfExists<TaskEngineServiceModule>(engineServicePath);
  const assetAdapterModule = await importIfExists<AdapterModule>(assetAdapterPath);
  const skillsAdapterModule = await importIfExists<AdapterModule>(skillsAdapterPath);
  const sandboxAdapterModule = await importIfExists<AdapterModule>(sandboxAdapterPath);

  assert.notEqual(serviceModule, null, "task-engine service module should exist before task result mapping can be verified");
  assert.notEqual(assetAdapterModule, null, "asset-scan adapter should exist before task result mapping can be verified");
  assert.notEqual(skillsAdapterModule, null, "skills-static adapter should exist before task result mapping can be verified");
  assert.notEqual(sandboxAdapterModule, null, "sandbox adapter should exist before task result mapping can be verified");
  assert.ok(serviceModule?.TaskEngineService, "task-engine service should expose a concrete service class");
  assert.ok(assetAdapterModule?.AssetScanTaskAdapter, "asset-scan adapter should expose a concrete adapter class");
  assert.ok(skillsAdapterModule?.SkillsStaticTaskAdapter, "skills-static adapter should expose a concrete adapter class");
  assert.ok(sandboxAdapterModule?.SandboxTaskAdapter, "sandbox adapter should expose a concrete adapter class");

  const service = new serviceModule.TaskEngineService({
    adapters: [
      new assetAdapterModule.AssetScanTaskAdapter(),
      new skillsAdapterModule.SkillsStaticTaskAdapter(),
      new sandboxAdapterModule.SandboxTaskAdapter()
    ]
  });

  const assetTask = createTask("asset_scan");
  const staticTask = createTask("static_analysis");
  const sandboxTask = createTask("sandbox_run");

  const assetArtifacts = (await service.createInitialArtifacts(assetTask)) as {
    result: { details: unknown; summary: string; engine_type: string; task_type: string };
    riskSummary: { blocked_count?: number; total_findings: number; summary: string };
  };
  const staticArtifacts = (await service.createInitialArtifacts(staticTask)) as {
    result: { details: unknown; summary: string; engine_type: string; task_type: string };
    riskSummary: { blocked_count?: number; total_findings: number; summary: string };
  };
  const sandboxArtifacts = (await service.createInitialArtifacts(sandboxTask)) as {
    result: { details: unknown; summary: string; engine_type: string; task_type: string };
    riskSummary: { blocked_count?: number; total_findings: number; summary: string };
  };

  assert.deepEqual(
    [
      {
        dispatch: service.createDispatchTicket(assetTask),
        result: assetArtifacts.result,
        riskSummary: assetArtifacts.riskSummary
      },
      {
        dispatch: service.createDispatchTicket(staticTask),
        result: staticArtifacts.result,
        riskSummary: staticArtifacts.riskSummary
      },
      {
        dispatch: service.createDispatchTicket(sandboxTask),
        result: sandboxArtifacts.result,
        riskSummary: sandboxArtifacts.riskSummary
      }
    ],
    [
      {
        dispatch: {
          task_id: "task_asset_scan",
          task_type: "asset_scan",
          engine_type: "asset_scan",
          payload: {
            target: {
              target_type: "url",
              target_value: "https://demo-agent.example.com",
              display_name: undefined
            },
            scan_parameters: {
              profile: "asset_scan",
              depth: "minimal"
            }
          }
        },
        result: {
          task_id: "task_asset_scan",
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            target: {
              target_type: "url",
              target_value: "https://demo-agent.example.com"
            },
            findings: []
          },
          created_at: "2026-03-26T02:00:00Z",
          updated_at: "2026-03-26T02:00:00Z"
        },
        riskSummary: {
          task_id: "task_asset_scan",
          task_type: "asset_scan",
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-03-26T02:00:00Z"
        }
      },
      {
        dispatch: {
          task_id: "task_static_analysis",
          task_type: "static_analysis",
          engine_type: "skills_static",
          payload: {
            target: {
              target_type: "skill_package",
              target_value: "samples/skills/demo-package",
              display_name: "demo-package"
            },
            analysis_parameters: {
              profile: "static_analysis",
              depth: "minimal"
            }
          }
        },
        result: {
          task_id: "task_static_analysis",
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            sample_name: "demo-package",
            rule_hits: []
          },
          created_at: "2026-03-26T02:00:00Z",
          updated_at: "2026-03-26T02:00:00Z"
        },
        riskSummary: {
          task_id: "task_static_analysis",
          task_type: "static_analysis",
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-03-26T02:00:00Z"
        }
      },
      {
        dispatch: {
          task_id: "task_sandbox_run",
          task_type: "sandbox_run",
          engine_type: "sandbox",
          payload: {
            target: {
              target_type: "session",
              target_value: "sandbox-session-001",
              display_name: undefined
            },
            runtime_parameters: {
              profile: "sandbox_run",
              depth: "minimal"
            }
          }
        },
        result: {
          task_id: "task_sandbox_run",
          task_type: "sandbox_run",
          engine_type: "sandbox",
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            session_id: "sandbox-session-001",
            alerts: [],
            blocked: false
          },
          created_at: "2026-03-26T02:00:00Z",
          updated_at: "2026-03-26T02:00:00Z"
        },
        riskSummary: {
          task_id: "task_sandbox_run",
          task_type: "sandbox_run",
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          blocked_count: 0,
          updated_at: "2026-03-26T02:00:00Z"
        }
      }
    ]
  );
});

test("asset-scan adapter materializes offline fingerprint details when a bundled sample reference is provided", async () => {
  const assetAdapterModule = await importIfExists<AdapterModule>(assetAdapterPath);

  assert.notEqual(assetAdapterModule, null, "asset-scan adapter module should exist before sample-backed fingerprint details can be verified");
  assert.ok(assetAdapterModule?.AssetScanTaskAdapter, "asset-scan adapter should expose a concrete adapter class");

  if (!assetAdapterModule?.AssetScanTaskAdapter) {
    return;
  }

  const assetAdapter = new assetAdapterModule.AssetScanTaskAdapter();
  const task = createTask("asset_scan");
  task.parameters = {
    sample_ref: "samples/assets/fingerprint-positive/ollama.s001.json"
  };

  const details = (await assetAdapter.createInitialDetails(task)) as {
    fingerprint?: { framework?: string; agent_name?: string };
    confidence?: number;
    matched_features?: string[];
    findings?: unknown[];
  };

  assert.equal(details.fingerprint?.framework, "ollama");
  assert.equal(details.fingerprint?.agent_name, "Ollama");
  assert.ok((details.confidence ?? 0) >= 0.8);
  assert.ok((details.matched_features?.length ?? 0) >= 2);
  assert.deepEqual(details.findings, []);
});

test("engine adapter registry rejects duplicate adapter registration for the same task type", async () => {
  const registryModule = await importIfExists<EngineAdapterRegistryModule>(registryPath);
  const assetAdapterModule = await importIfExists<AdapterModule>(assetAdapterPath);

  assert.notEqual(registryModule, null, "engine adapter registry module should exist before duplicate registration protection can be verified");
  assert.notEqual(assetAdapterModule, null, "asset-scan adapter should exist before duplicate registration protection can be verified");
  assert.ok(registryModule?.EngineAdapterRegistry, "engine adapter registry should expose a concrete registry class");
  assert.ok(assetAdapterModule?.AssetScanTaskAdapter, "asset-scan adapter should expose a concrete adapter class");

  assert.throws(
    () =>
      new registryModule.EngineAdapterRegistry([
        new assetAdapterModule.AssetScanTaskAdapter(),
        new assetAdapterModule.AssetScanTaskAdapter()
      ]),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.notEqual(error, null);
      assert.equal((error as { name?: string }).name, "DomainError");
      assert.equal((error as { code?: string }).code, "ENGINE_ADAPTER_DUPLICATE_REGISTRATION");
      return true;
    }
  );
});

test("engine client registry resolves skills-static engine clients and rejects duplicate engine registration", async () => {
  const registryModule = await importIfExists<EngineClientRegistryModule>(engineClientRegistryPath);
  const skillsClientModule = await importIfExists<SkillsStaticEngineClientModule>(skillsClientPath);

  assert.notEqual(registryModule, null, "engine client registry module should exist before engine client registration can be verified");
  assert.notEqual(skillsClientModule, null, "skills-static engine client module should exist before engine client registration can be verified");
  assert.ok(registryModule?.EngineClientRegistry, "engine client registry should expose a concrete registry class");
  assert.ok(skillsClientModule?.SkillsStaticEngineClient, "skills-static engine client should expose a concrete client class");

  if (!registryModule?.EngineClientRegistry || !skillsClientModule?.SkillsStaticEngineClient) {
    return;
  }

  const engineClient = new skillsClientModule.SkillsStaticEngineClient();
  const registry = new registryModule.EngineClientRegistry([engineClient]);

  assert.equal(registry.getRequiredClient("skills_static"), engineClient);

  assert.throws(
    () =>
      new registryModule.EngineClientRegistry([
        new skillsClientModule.SkillsStaticEngineClient(),
        new skillsClientModule.SkillsStaticEngineClient()
      ]),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.notEqual(error, null);
      assert.equal((error as { name?: string }).name, "DomainError");
      assert.equal((error as { code?: string }).code, "ENGINE_CLIENT_DUPLICATE_REGISTRATION");
      return true;
    }
  );
});

test("task engine service dispatches static-analysis tickets through the registered skills-static engine client", async () => {
  const serviceModule = await importIfExists<TaskEngineServiceModule>(engineServicePath);
  const skillsAdapterModule = await importIfExists<AdapterModule>(skillsAdapterPath);
  const skillsClientModule = await importIfExists<SkillsStaticEngineClientModule>(skillsClientPath);
  const skillsStaticNormalizerModule = await importIfExists<SkillsStaticNormalizerModule>(skillsStaticNormalizerPath);

  assert.notEqual(serviceModule, null, "task-engine service module should exist before dispatch routing can be verified");
  assert.notEqual(skillsAdapterModule, null, "skills-static adapter module should exist before dispatch routing can be verified");
  assert.notEqual(skillsClientModule, null, "skills-static engine client module should exist before dispatch routing can be verified");
  assert.notEqual(skillsStaticNormalizerModule, null, "skills-static normalizer module should exist before dispatch output can be validated");
  assert.ok(serviceModule?.TaskEngineService, "task-engine service should expose a concrete service class");
  assert.ok(skillsAdapterModule?.SkillsStaticTaskAdapter, "skills-static adapter should expose a concrete adapter class");
  assert.ok(skillsClientModule?.SkillsStaticEngineClient, "skills-static engine client should expose a concrete client class");
  assert.ok(skillsStaticNormalizerModule?.normalizeSkillsStaticEngineOutput, "skills-static normalizer should expose a concrete normalization function");

  if (
    !serviceModule?.TaskEngineService ||
    !skillsAdapterModule?.SkillsStaticTaskAdapter ||
    !skillsClientModule?.SkillsStaticEngineClient ||
    !skillsStaticNormalizerModule?.normalizeSkillsStaticEngineOutput
  ) {
    return;
  }

  const dispatchedTickets: unknown[] = [];
  const service = new serviceModule.TaskEngineService({
    adapters: [new skillsAdapterModule.SkillsStaticTaskAdapter()],
    engineClients: [
      new skillsClientModule.SkillsStaticEngineClient({
        onDispatch: (ticket) => {
          dispatchedTickets.push(ticket);
        }
      })
    ]
  });

  const receipt = await service.dispatchTask(createTask("static_analysis")) as {
    accepted: boolean;
    engine_type: string;
    endpoint: string;
    mock_result?: unknown;
  };
  const normalizedMockResult = skillsStaticNormalizerModule.normalizeSkillsStaticEngineOutput(
    receipt.mock_result,
    createTask("static_analysis")
  ) as {
    sample_name?: string;
    language?: string;
    entry_files?: string[];
    files_scanned?: number;
    rule_hits?: Array<{
      rule_id?: string;
      severity?: string;
      message?: string;
      file_path?: string;
      line_start?: number;
      line_end?: number;
    }>;
    sensitive_capabilities?: string[];
    dependency_summary?: Record<string, unknown>;
  };

  assert.deepEqual(dispatchedTickets, [
    {
      task_id: "task_static_analysis",
      task_type: "static_analysis",
      engine_type: "skills_static",
      payload: {
        target: {
          target_type: "skill_package",
          target_value: "samples/skills/demo-package",
          display_name: "demo-package"
        },
        analysis_parameters: {
          profile: "static_analysis",
          depth: "minimal"
        }
      }
    }
  ]);
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.engine_type, "skills_static");
  assert.equal(receipt.endpoint, "internal://skills-static");
  assert.deepEqual(projectStandardizedDetails(normalizedMockResult), {
    ...CANONICAL_STATIC_ANALYSIS_STRONG_DETAILS_PROJECTION,
    sample_name: "demo-package"
  });
  assert.ok(Array.isArray(normalizedMockResult.entry_files) && normalizedMockResult.entry_files.length > 0);
  assert.ok(typeof normalizedMockResult.files_scanned === "number" && normalizedMockResult.files_scanned >= 1);
  assert.ok(Array.isArray(normalizedMockResult.sensitive_capabilities) && normalizedMockResult.sensitive_capabilities.length > 0);
  assert.equal(typeof normalizedMockResult.dependency_summary, "object");
  assert.notEqual(normalizedMockResult.dependency_summary, null);
});

test("task engine service materializes a finished static-analysis shell from a deterministic mock result", async () => {
  const serviceModule = await importIfExists<TaskEngineServiceModule>(engineServicePath);
  const skillsAdapterModule = await importIfExists<AdapterModule>(skillsAdapterPath);

  assert.notEqual(serviceModule, null, "task-engine service module should exist before static-analysis completion mapping can be verified");
  assert.notEqual(skillsAdapterModule, null, "skills-static adapter module should exist before static-analysis completion mapping can be verified");
  assert.ok(serviceModule?.TaskEngineService, "task-engine service should expose a concrete service class");
  assert.ok(skillsAdapterModule?.SkillsStaticTaskAdapter, "skills-static adapter should expose a concrete adapter class");

  if (!serviceModule?.TaskEngineService || !skillsAdapterModule?.SkillsStaticTaskAdapter) {
    return;
  }

  const service = new serviceModule.TaskEngineService({
    adapters: [new skillsAdapterModule.SkillsStaticTaskAdapter()]
  });
  const expectedTask = createCanonicalStaticAnalysisFinishedTask("2026-03-26T02:05:00Z");
  const expectedResult = createCanonicalStaticAnalysisBaseResult("2026-03-26T02:05:00Z");
  const expectedRiskSummary = createCanonicalStaticAnalysisRiskSummary("2026-03-26T02:05:00Z");

  const completedArtifacts = service.createCompletedStaticAnalysisArtifacts?.(
    {
      ...createTask("static_analysis"),
      task_id: expectedTask.task_id,
      title: expectedTask.title,
      target: expectedTask.target,
      parameters: expectedTask.parameters,
      requested_by: expectedTask.requested_by,
      created_at: expectedTask.created_at,
      updated_at: expectedTask.created_at
    },
    CANONICAL_STATIC_ANALYSIS_DETAILS,
    "2026-03-26T02:05:00Z"
  ) as
    | {
        task: {
          status: string;
          risk_level?: string;
          summary?: string;
          updated_at: string;
        };
        result: {
          status: string;
          risk_level: string;
          summary: string;
          updated_at: string;
          details: unknown;
        };
        riskSummary: {
          status: string;
          risk_level: string;
          summary: string;
          total_findings: number;
          info_count: number;
          low_count: number;
          medium_count: number;
          high_count: number;
          critical_count: number;
          updated_at: string;
        };
      }
    | undefined;

  assert.notEqual(completedArtifacts, undefined);

  if (!completedArtifacts) {
    return;
  }

  assert.deepEqual(completedArtifacts.result.details, CANONICAL_STATIC_ANALYSIS_DETAILS);
  assert.equal(completedArtifacts.task.task_id, expectedTask.task_id);
  assert.equal(completedArtifacts.task.task_type, "static_analysis");
  assert.equal(completedArtifacts.task.engine_type, "skills_static");
  assert.equal(completedArtifacts.task.status, "finished");
  assert.equal(completedArtifacts.result.status, "finished");
  assert.equal(completedArtifacts.riskSummary.status, "finished");
  assert.equal(completedArtifacts.task.risk_level, expectedRiskSummary.risk_level);
  assert.equal(completedArtifacts.result.risk_level, expectedRiskSummary.risk_level);
  assert.equal(completedArtifacts.riskSummary.risk_level, expectedRiskSummary.risk_level);
  assert.equal(completedArtifacts.riskSummary.total_findings, expectedRiskSummary.total_findings);
  assert.equal(completedArtifacts.riskSummary.info_count, expectedRiskSummary.info_count);
  assert.equal(completedArtifacts.riskSummary.low_count, expectedRiskSummary.low_count);
  assert.equal(completedArtifacts.riskSummary.medium_count, expectedRiskSummary.medium_count);
  assert.equal(completedArtifacts.riskSummary.high_count, expectedRiskSummary.high_count);
  assert.equal(completedArtifacts.riskSummary.critical_count, expectedRiskSummary.critical_count);
  assert.equal(completedArtifacts.task.summary, completedArtifacts.result.summary);
  assert.equal(completedArtifacts.result.summary, completedArtifacts.riskSummary.summary);
  assert.notEqual(completedArtifacts.task.summary, STATIC_ANALYSIS_PENDING_SUMMARY);
  assert.equal(completedArtifacts.task.updated_at, expectedTask.updated_at);
  assert.equal(completedArtifacts.result.updated_at, expectedResult.updated_at);
  assert.equal(completedArtifacts.riskSummary.updated_at, expectedRiskSummary.updated_at);
});

test("task engine service materializes a failed static-analysis shell when execution governance prevents a finished backfill", async () => {
  const serviceModule = await importIfExists<TaskEngineServiceModule>(engineServicePath);
  const skillsAdapterModule = await importIfExists<AdapterModule>(skillsAdapterPath);

  assert.notEqual(serviceModule, null, "task-engine service module should exist before static-analysis failure shells can be verified");
  assert.notEqual(skillsAdapterModule, null, "skills-static adapter module should exist before static-analysis failure shells can be verified");
  assert.ok(serviceModule?.TaskEngineService, "task-engine service should expose a concrete service class");
  assert.ok(skillsAdapterModule?.SkillsStaticTaskAdapter, "skills-static adapter should expose a concrete adapter class");

  if (!serviceModule?.TaskEngineService || !skillsAdapterModule?.SkillsStaticTaskAdapter) {
    return;
  }

  const service = new serviceModule.TaskEngineService({
    adapters: [new skillsAdapterModule.SkillsStaticTaskAdapter()]
  });

  const failedArtifacts = service.createFailedStaticAnalysisArtifacts?.(
    {
      ...createTask("static_analysis"),
      task_id: "task_static_analysis_failed",
      title: "Analyze failed static-analysis task",
      created_at: "2026-03-26T02:00:00Z",
      updated_at: "2026-03-26T02:00:00Z"
    },
    "2026-03-26T02:05:00Z",
    "runner"
  ) as
    | {
        task: { status: string; risk_level?: string; summary?: string; updated_at: string };
        result: { status: string; risk_level: string; summary: string; updated_at: string; details: { sample_name?: string; rule_hits?: unknown[] } };
        riskSummary: {
          status: string;
          risk_level: string;
          summary: string;
          total_findings: number;
          info_count: number;
          low_count: number;
          medium_count: number;
          high_count: number;
          critical_count: number;
          updated_at: string;
        };
      }
    | undefined;

  assert.notEqual(failedArtifacts, undefined);

  if (!failedArtifacts) {
    return;
  }

  assert.equal(failedArtifacts.task.status, "failed");
  assert.equal(failedArtifacts.result.status, "failed");
  assert.equal(failedArtifacts.riskSummary.status, "failed");
  assert.equal(failedArtifacts.task.risk_level, "info");
  assert.equal(failedArtifacts.result.risk_level, "info");
  assert.equal(failedArtifacts.riskSummary.risk_level, "info");
  assert.equal(failedArtifacts.task.summary, "Static analysis failed during engine execution");
  assert.equal(failedArtifacts.result.summary, failedArtifacts.task.summary);
  assert.equal(failedArtifacts.riskSummary.summary, failedArtifacts.task.summary);
  assert.equal(failedArtifacts.result.details.sample_name, "demo-package");
  assert.deepEqual(failedArtifacts.result.details.rule_hits, []);
  assert.equal(failedArtifacts.riskSummary.total_findings, 0);
  assert.equal(failedArtifacts.riskSummary.info_count, 0);
  assert.equal(failedArtifacts.riskSummary.low_count, 0);
  assert.equal(failedArtifacts.riskSummary.medium_count, 0);
  assert.equal(failedArtifacts.riskSummary.high_count, 0);
  assert.equal(failedArtifacts.riskSummary.critical_count, 0);
  assert.equal(failedArtifacts.task.updated_at, "2026-03-26T02:05:00Z");
  assert.equal(failedArtifacts.result.updated_at, "2026-03-26T02:05:00Z");
  assert.equal(failedArtifacts.riskSummary.updated_at, "2026-03-26T02:05:00Z");
});

test("task engine service rejects a misconfigured adapter whose engine type does not match the task contract", async () => {
  const serviceModule = await importIfExists<TaskEngineServiceModule>(engineServicePath);
  const assetAdapterModule = await importIfExists<AdapterModule>(assetAdapterPath);

  assert.notEqual(serviceModule, null, "task-engine service module should exist before adapter engine type validation can be verified");
  assert.notEqual(assetAdapterModule, null, "asset-scan adapter should exist before adapter engine type validation can be verified");
  assert.ok(serviceModule?.TaskEngineService, "task-engine service should expose a concrete service class");
  assert.ok(assetAdapterModule?.AssetScanTaskAdapter, "asset-scan adapter should expose a concrete adapter class");

  const misconfiguredAdapter = new assetAdapterModule.AssetScanTaskAdapter();
  misconfiguredAdapter.engineType = "sandbox";

  const service = new serviceModule.TaskEngineService({
    adapters: [misconfiguredAdapter]
  });

  assert.throws(
    () => service.createDispatchTicket(createTask("asset_scan")),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.notEqual(error, null);
      assert.equal((error as { name?: string }).name, "DomainError");
      assert.equal((error as { code?: string }).code, "ENGINE_ADAPTER_ENGINE_TYPE_MISMATCH");
      return true;
    }
  );
});
