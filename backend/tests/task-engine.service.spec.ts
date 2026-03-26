import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type { Task } from "../../shared/types/task.ts";

const engineServicePath = resolve(import.meta.dirname, "../src/modules/task-center/task-engine.service.ts");
const registryPath = resolve(import.meta.dirname, "../src/modules/task-center/adapters/engine-adapter-registry.ts");
const assetAdapterPath = resolve(import.meta.dirname, "../src/modules/task-center/adapters/asset-scan.adapter.ts");
const skillsAdapterPath = resolve(import.meta.dirname, "../src/modules/task-center/adapters/skills-static.adapter.ts");
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
  SandboxTaskAdapter?: new () => {
    taskType: string;
    engineType: string;
    createDispatchPayload: (task: Task) => unknown;
    createInitialDetails: (task: Task) => unknown;
  };
};

type TaskEngineServiceModule = {
  TaskEngineService?: new (options: { adapters: unknown[] }) => {
    createDispatchTicket: (task: Task) => unknown;
    createInitialArtifacts: (task: Task) => unknown;
  };
};

type EngineAdapterRegistryModule = {
  EngineAdapterRegistry?: new (adapters: unknown[]) => {
    getRequiredAdapter: (taskType: Task["task_type"]) => unknown;
  };
};

async function importIfExists<TModule>(filePath: string): Promise<TModule | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return import(pathToFileURL(filePath).href) as Promise<TModule>;
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

  const assetArtifacts = service.createInitialArtifacts(assetTask) as {
    result: { details: unknown; summary: string; engine_type: string; task_type: string };
    riskSummary: { blocked_count?: number; total_findings: number; summary: string };
  };
  const staticArtifacts = service.createInitialArtifacts(staticTask) as {
    result: { details: unknown; summary: string; engine_type: string; task_type: string };
    riskSummary: { blocked_count?: number; total_findings: number; summary: string };
  };
  const sandboxArtifacts = service.createInitialArtifacts(sandboxTask) as {
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
              target_value: "https://demo-agent.example.com",
              display_name: undefined
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
