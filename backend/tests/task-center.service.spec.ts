import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../src/modules/task-center/task-center.service.ts");

type ServiceModule = {
  TaskCenterService?: new (options: {
    repository: unknown;
    adapters: unknown[];
    now?: () => string;
    nextTaskId?: () => string;
    logSkillsStaticEvent?: (event: unknown) => void | Promise<void>;
    taskEngineService?: {
      createInitialArtifacts: (task: unknown) => Promise<unknown>;
      hasRegisteredClient: (task: unknown) => boolean;
      dispatchTask: (task: unknown) => Promise<unknown>;
      createCompletedStaticAnalysisArtifacts?: (task: unknown, mockResult: unknown, updatedAt: string) => unknown;
      createFailedStaticAnalysisArtifacts?: (task: unknown, updatedAt: string, phase: string) => unknown;
    };
  }) => {
    createTask: (input: unknown) => Promise<unknown>;
    getTaskById: (taskId: string) => unknown;
    listTasks: () => unknown[];
    getTaskResult: (taskId: string) => unknown;
    getRiskSummary: (taskId: string) => unknown;
  };
};

type RepositoryModule = {
  InMemoryTaskRepository?: new () => unknown;
};

type AdapterModule = {
  AssetScanTaskAdapter?: new () => unknown;
  SkillsStaticTaskAdapter?: new () => unknown;
  SandboxTaskAdapter?: new () => unknown;
};

type ErrorModule = {
  DomainError?: new (message: string, code: string, statusCode: number) => Error & {
    code: string;
    statusCode: number;
  };
  SkillsStaticExecutionError?: new (options: {
    provider: string;
    phase: string;
    reason: string;
    detail?: string;
  }) => Error & {
    code: string;
    phase: string;
    reason: string;
    provider: string;
  };
};

type SkillsStaticExecutionErrorModule = {
  SkillsStaticExecutionError?: new (options: {
    provider: string;
    phase: string;
    reason: string;
    detail?: string;
  }) => Error & {
    code: string;
    phase: string;
    reason: string;
    provider: string;
  };
};

async function importIfExists<TModule>(filePath: string): Promise<TModule | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return import(pathToFileURL(filePath).href) as Promise<TModule>;
}

test("task center service creates asset, static-analysis, and sandbox tasks with the shared defaults", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);
  const repositoryModule = await importIfExists<RepositoryModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/repositories/in-memory-task.repository.ts")
  );
  const adapterModule = await importIfExists<AdapterModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/adapters/asset-scan.adapter.ts")
  );
  const skillsAdapterModule = await importIfExists<AdapterModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/adapters/skills-static.adapter.ts")
  );
  const sandboxAdapterModule = await importIfExists<AdapterModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/adapters/sandbox.adapter.ts")
  );

  assert.notEqual(serviceModule, null, "task-center service module should exist before service behavior can be verified");
  assert.notEqual(repositoryModule, null, "in-memory task repository should exist before service behavior can be verified");
  assert.notEqual(adapterModule, null, "asset-scan adapter should exist before service behavior can be verified");
  assert.notEqual(skillsAdapterModule, null, "skills-static adapter should exist before service behavior can be verified");
  assert.notEqual(sandboxAdapterModule, null, "sandbox adapter should exist before service behavior can be verified");

  if (
    !serviceModule?.TaskCenterService ||
    !repositoryModule?.InMemoryTaskRepository ||
    !adapterModule?.AssetScanTaskAdapter ||
    !skillsAdapterModule?.SkillsStaticTaskAdapter ||
    !sandboxAdapterModule?.SandboxTaskAdapter
  ) {
    return;
  }

  const service = new serviceModule.TaskCenterService({
    repository: new repositoryModule.InMemoryTaskRepository(),
    adapters: [
      new adapterModule.AssetScanTaskAdapter(),
      new skillsAdapterModule.SkillsStaticTaskAdapter(),
      new sandboxAdapterModule.SandboxTaskAdapter()
    ],
    now: () => "2026-03-26T01:00:00Z",
    nextTaskId: (() => {
      const ids = ["task_asset_001", "task_static_001", "task_sandbox_001"];
      let index = 0;

      return () => ids[index++] ?? `task_extra_${index}`;
    })()
  });

  const createdAssetTask = await service.createTask({
    task_type: "asset_scan",
    title: "Scan demo target",
    target: {
      target_type: "url",
      target_value: "https://demo-agent.example.com"
    }
  }) as {
    task_id: string;
    engine_type: string;
    status: string;
    summary: string;
  };

  const createdStaticTask = await service.createTask({
    task_type: "static_analysis",
    title: "Analyze demo skill",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/demo-email-skill"
    }
  }) as {
    task_id: string;
    engine_type: string;
    status: string;
    summary: string;
  };

  const createdSandboxTask = await service.createTask({
    task_type: "sandbox_run",
    title: "Run demo sandbox session",
    target: {
      target_type: "session",
      target_value: "demo-session"
    }
  }) as {
    task_id: string;
    engine_type: string;
    status: string;
    summary: string;
  };

  assert.deepEqual(
    [
      {
        task_id: createdAssetTask.task_id,
        engine_type: createdAssetTask.engine_type,
        status: createdAssetTask.status,
        summary: createdAssetTask.summary
      },
      {
        task_id: createdStaticTask.task_id,
        engine_type: createdStaticTask.engine_type,
        status: createdStaticTask.status,
        summary: createdStaticTask.summary
      },
      {
        task_id: createdSandboxTask.task_id,
        engine_type: createdSandboxTask.engine_type,
        status: createdSandboxTask.status,
        summary: createdSandboxTask.summary
      }
    ],
    [
      {
        task_id: "task_asset_001",
        engine_type: "asset_scan",
        status: "finished",
        summary: "Asset scan finished with 0 findings"
      },
      {
        task_id: "task_static_001",
        engine_type: "skills_static",
        status: "pending",
        summary: "Task accepted and waiting for engine dispatch"
      },
      {
        task_id: "task_sandbox_001",
        engine_type: "sandbox",
        status: "pending",
        summary: "Task accepted and waiting for engine dispatch"
      }
    ]
  );

  assert.equal(service.listTasks().length, 3);
});

test("task center service raises a domain not-found error for an unknown task id", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);
  const repositoryModule = await importIfExists<RepositoryModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/repositories/in-memory-task.repository.ts")
  );
  const adapterModule = await importIfExists<AdapterModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/adapters/asset-scan.adapter.ts")
  );
  const skillsAdapterModule = await importIfExists<AdapterModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/adapters/skills-static.adapter.ts")
  );
  const sandboxAdapterModule = await importIfExists<AdapterModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/adapters/sandbox.adapter.ts")
  );
  const errorModule = await importIfExists<ErrorModule>(
    resolve(import.meta.dirname, "../src/common/errors/domain-error.ts")
  );

  assert.notEqual(serviceModule, null, "task-center service module should exist before not-found behavior can be verified");
  assert.notEqual(repositoryModule, null, "in-memory task repository should exist before not-found behavior can be verified");
  assert.notEqual(adapterModule, null, "asset-scan adapter should exist before not-found behavior can be verified");
  assert.notEqual(skillsAdapterModule, null, "skills-static adapter should exist before not-found behavior can be verified");
  assert.notEqual(sandboxAdapterModule, null, "sandbox adapter should exist before not-found behavior can be verified");
  assert.notEqual(errorModule, null, "domain error type should exist before not-found behavior can be verified");

  if (
    !serviceModule?.TaskCenterService ||
    !repositoryModule?.InMemoryTaskRepository ||
    !adapterModule?.AssetScanTaskAdapter ||
    !skillsAdapterModule?.SkillsStaticTaskAdapter ||
    !sandboxAdapterModule?.SandboxTaskAdapter
  ) {
    return;
  }

  const service = new serviceModule.TaskCenterService({
    repository: new repositoryModule.InMemoryTaskRepository(),
    adapters: [
      new adapterModule.AssetScanTaskAdapter(),
      new skillsAdapterModule.SkillsStaticTaskAdapter(),
      new sandboxAdapterModule.SandboxTaskAdapter()
    ]
  });

  assert.throws(
    () => service.getTaskById("task_missing"),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as ErrorModule["DomainError"] & { code?: string; statusCode?: number }).code, "TASK_NOT_FOUND");
      assert.equal((error as ErrorModule["DomainError"] & { statusCode?: number }).statusCode, 404);
      assert.match((error as Error).message, /task/i);
      return true;
    }
  );
});

test("task center service dispatches static-analysis tasks after saving their initial artifacts", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before dispatch ordering can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  const events: string[] = [];
  const repository = {
    save(record: {
      task: { task_id: string };
      result: unknown;
      riskSummary: unknown;
    }) {
      events.push(`save:${record.task.task_id}`);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      events.push(`createInitialArtifacts:${task.task_id}`);
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: []
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: "2026-03-26T01:00:00Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-03-26T01:00:00Z"
        }
      };
    },
    hasRegisteredClient() {
      return true;
    },
    async dispatchTask(task: { task_id: string; task_type: string; engine_type: string }) {
      events.push(`dispatchTask:${task.task_id}:${task.task_type}:${task.engine_type}`);
      return {
        accepted: true
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: () => "2026-03-26T01:00:00Z",
    nextTaskId: () => "task_static_dispatch_001"
  });

  const createdTask = await service.createTask({
    task_type: "static_analysis",
    title: "Analyze demo skill",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/demo-email-skill",
      display_name: "demo-email-skill"
    },
    parameters: {
      language: "typescript"
    }
  }) as {
    task_id: string;
    task_type: string;
    engine_type: string;
  };

  assert.equal(createdTask.task_id, "task_static_dispatch_001");
  assert.deepEqual(events, [
    "createInitialArtifacts:task_static_dispatch_001",
    "save:task_static_dispatch_001",
    "dispatchTask:task_static_dispatch_001:static_analysis:skills_static"
  ]);
});

test("task center service backfills static-analysis artifacts when the engine client returns a mock result", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before static-analysis backfill behavior can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  const events: string[] = [];
  const savedStatuses: string[] = [];
  const repository = {
    save(record: {
      task: { task_id: string; status: string };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      events.push(`save:${record.task.task_id}:${record.task.status}`);
      savedStatuses.push(`${record.task.status}/${record.result.status}/${record.riskSummary.status}`);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      events.push(`createInitialArtifacts:${task.task_id}`);
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: []
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: "2026-03-26T01:00:00Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-03-26T01:00:00Z"
        }
      };
    },
    hasRegisteredClient() {
      return true;
    },
    async dispatchTask(task: { task_id: string; task_type: string; engine_type: string }) {
      events.push(`dispatchTask:${task.task_id}:${task.task_type}:${task.engine_type}`);
      return {
        accepted: true,
        engine_type: "skills_static",
        endpoint: "internal://skills-static",
        mock_result: {
          sample_name: "demo-email-skill",
          language: "typescript",
          entry_files: ["src/commands.ts", "src/network.ts"],
          files_scanned: 2,
          rule_hits: [
            {
              rule_id: "command_execution.shell_exec",
              severity: "high",
              message: "Potential command execution sink reached",
              file_path: "src/commands.ts",
              line_start: 4,
              line_end: 4
            },
            {
              rule_id: "network_access.outbound_fetch",
              severity: "medium",
              message: "Outbound network request lacks destination allowlist",
              file_path: "src/network.ts",
              line_start: 2,
              line_end: 2
            }
          ],
          sensitive_capabilities: ["command_execution", "network_access"],
          dependency_summary: {
            direct_dependency_count: 2,
            flagged_dependency_count: 1
          }
        }
      };
    },
    createCompletedStaticAnalysisArtifacts(task: { task_id: string }, _mockResult: unknown, updatedAt: string) {
      events.push(`createCompletedStaticAnalysisArtifacts:${task.task_id}:${updatedAt}`);
      return {
        task: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "finished",
          title: "Analyze demo skill",
          target: {
            target_type: "skill_package",
            target_value: "samples/skills/demo-email-skill",
            display_name: "demo-email-skill"
          },
          risk_level: "high",
          summary: "Static analysis finished with 2 rule hits",
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "finished",
          risk_level: "high",
          summary: "Static analysis finished with 2 rule hits",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: [
              {
                rule_id: "command_execution.shell_exec",
                severity: "high",
                message: "Potential command execution sink reached",
                file_path: "src/commands.ts",
                line_start: 4,
                line_end: 4
              },
              {
                rule_id: "network_access.outbound_fetch",
                severity: "medium",
                message: "Outbound network request lacks destination allowlist",
                file_path: "src/network.ts",
                line_start: 2,
                line_end: 2
              }
            ]
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "static_analysis",
          status: "finished",
          risk_level: "high",
          summary: "Static analysis finished with 2 rule hits",
          total_findings: 2,
          info_count: 0,
          low_count: 0,
          medium_count: 1,
          high_count: 1,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    },
    createFailedStaticAnalysisArtifacts() {
      throw new Error("failed artifacts should not be used on the success path");
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: (() => {
      const timestamps = ["2026-03-26T01:00:00Z", "2026-03-26T01:05:00Z"];
      let index = 0;
      return () => timestamps[index++] ?? "2026-03-26T01:05:00Z";
    })(),
    nextTaskId: () => "task_static_backfill_001"
  });

  const createdTask = await service.createTask({
    task_type: "static_analysis",
    title: "Analyze demo skill",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/demo-email-skill",
      display_name: "demo-email-skill"
    }
  }) as {
    task_id: string;
    status: string;
  };

  assert.equal(createdTask.task_id, "task_static_backfill_001");
  assert.equal(createdTask.status, "pending");
  assert.deepEqual(events, [
    "createInitialArtifacts:task_static_backfill_001",
    "save:task_static_backfill_001:pending",
    "dispatchTask:task_static_backfill_001:static_analysis:skills_static",
    "createCompletedStaticAnalysisArtifacts:task_static_backfill_001:2026-03-26T01:05:00Z",
    "save:task_static_backfill_001:finished"
  ]);
  assert.deepEqual(savedStatuses, ["pending/pending/pending", "finished/finished/finished"]);
});

test("task center service backfills asset-scan artifacts from the initial engine details", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before asset-scan backfill behavior can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  const events: string[] = [];
  const savedStatuses: string[] = [];
  const repository = {
    save(record: {
      task: { task_id: string; status: string };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      events.push(`save:${record.task.task_id}:${record.task.status}`);
      savedStatuses.push(`${record.task.status}/${record.result.status}/${record.riskSummary.status}`);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const assetDetails = {
    target: {
      target_type: "url",
      target_value: "http://127.0.0.1:11434"
    },
    open_ports: [{ port: 11434, protocol: "tcp", service: "http", status: "open" }],
    http_endpoints: [{ method: "GET", path: "/api/tags", status_code: 200, auth_required: false }],
    auth_detected: false,
    findings: [
      {
        finding_id: "finding_001",
        type: "exposed_api",
        title: "Ollama API is publicly accessible without Auth",
        risk_level: "high",
        reason: "Detected exposed API",
        evidence: [],
        related_fingerprints: ["ollama"],
        recommendation: "Restrict network access"
      }
    ]
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      events.push(`createInitialArtifacts:${task.task_id}`);
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: assetDetails,
          created_at: "2026-03-26T01:00:00Z",
          updated_at: "2026-03-26T01:00:00Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-03-26T01:00:00Z"
        }
      };
    },
    hasRegisteredClient() {
      return false;
    },
    createCompletedAssetScanArtifacts(task: { task_id: string }, details: unknown, updatedAt: string) {
      events.push(`createCompletedAssetScanArtifacts:${task.task_id}:${updatedAt}`);
      return {
        task: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "finished",
          title: "Scan demo target",
          target: {
            target_type: "url",
            target_value: "http://127.0.0.1:11434"
          },
          risk_level: "high",
          summary: "Asset scan finished with 1 finding",
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "finished",
          risk_level: "high",
          summary: "Asset scan finished with 1 finding",
          details,
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "asset_scan",
          status: "finished",
          risk_level: "high",
          summary: "Asset scan finished with 1 finding",
          total_findings: 1,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 1,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: () => "2026-03-26T01:00:00Z",
    nextTaskId: () => "task_asset_finished_001"
  });

  const createdTask = await service.createTask({
    task_type: "asset_scan",
    title: "Scan demo target",
    target: {
      target_type: "url",
      target_value: "http://127.0.0.1:11434"
    }
  }) as {
    task_id: string;
    task_type: string;
    engine_type: string;
    status: string;
    risk_level: string;
    summary: string;
  };

  assert.equal(createdTask.task_id, "task_asset_finished_001");
  assert.equal(createdTask.status, "finished");
  assert.equal(createdTask.risk_level, "high");
  assert.equal(createdTask.summary, "Asset scan finished with 1 finding");
  assert.deepEqual(events, [
    "createInitialArtifacts:task_asset_finished_001",
    "save:task_asset_finished_001:pending",
    "createCompletedAssetScanArtifacts:task_asset_finished_001:2026-03-26T01:00:00Z",
    "save:task_asset_finished_001:finished"
  ]);
  assert.deepEqual(savedStatuses, ["pending/pending/pending", "finished/finished/finished"]);
});

test("task engine service marks asset-scan as partial_success when interruption reason is non-none but evidence exists", async () => {
  const taskEngineModule = await importIfExists<{
    TaskEngineService?: new (options: { adapters: unknown[]; engineClients?: unknown[] }) => {
      createCompletedAssetScanArtifacts: (task: Record<string, unknown>, details: Record<string, unknown>, updatedAt: string) => {
        task: { status: string; summary: string };
        result: { status: string; summary: string };
        riskSummary: { status: string; summary: string };
      };
    };
  }>(resolve(import.meta.dirname, "../src/modules/task-center/task-engine.service.ts"));

  assert.notEqual(taskEngineModule, null, "task-engine service module should exist before partial_success asset-scan behavior can be verified");
  assert.ok(taskEngineModule?.TaskEngineService, "task-engine service should expose a concrete service class");

  if (!taskEngineModule?.TaskEngineService) {
    return;
  }

  const service = new taskEngineModule.TaskEngineService({
    adapters: []
  });

  const artifacts = service.createCompletedAssetScanArtifacts(
    {
      task_id: "task_asset_partial_001",
      task_type: "asset_scan",
      engine_type: "asset_scan",
      status: "pending",
      title: "Partial asset scan",
      target: {
        target_type: "ip",
        target_value: "1.1.1.1"
      },
      created_at: "2026-05-08T13:00:00.000Z",
      updated_at: "2026-05-08T13:00:00.000Z"
    },
    {
      target: {
        target_type: "ip",
        target_value: "1.1.1.1"
      },
      findings: [
        {
          title: "Management endpoint exposed",
          risk_level: "high"
        }
      ],
      execution_context: {
        audit: {
          interruption_reason: "budget"
        }
      }
    },
    "2026-05-08T13:05:00.000Z"
  );

  assert.equal(artifacts.task.status, "partial_success");
  assert.equal(artifacts.result.status, "partial_success");
  assert.equal(artifacts.riskSummary.status, "partial_success");
  assert.equal(artifacts.task.summary, "Asset scan partially completed with 1 finding");
});

test("task center service normalizes asset-scan governance budget and audit fields on task creation", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before asset-scan governance normalization can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  const repository = {
    savedRecords: [] as Array<{
      task: {
        task_id: string;
        task_type: string;
        requested_by?: string;
        parameters?: Record<string, unknown>;
      };
      result: { status: string };
      riskSummary: { status: string };
    }>,
    save(record: {
      task: {
        task_id: string;
        task_type: string;
        requested_by?: string;
        parameters?: Record<string, unknown>;
      };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      this.savedRecords.push(record);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            target: {
              target_type: "ip",
              target_value: "1.1.1.1"
            },
            open_ports: [],
            http_endpoints: [],
            auth_detected: false,
            findings: []
          },
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: "2026-05-08T10:00:00.000Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-05-08T10:00:00.000Z"
        }
      };
    },
    hasRegisteredClient() {
      return false;
    },
    createCompletedAssetScanArtifacts(task: { parameters?: Record<string, unknown> }, details: unknown, updatedAt: string) {
      return {
        task: {
          task_id: "task_asset_governance_001",
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "finished",
          title: "Public asset scan",
          target: {
            target_type: "ip",
            target_value: "1.1.1.1"
          },
          parameters: task.parameters,
          risk_level: "info",
          summary: "Asset scan finished with 0 findings",
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        result: {
          task_id: "task_asset_governance_001",
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "finished",
          risk_level: "info",
          summary: "Asset scan finished with 0 findings",
          details,
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        riskSummary: {
          task_id: "task_asset_governance_001",
          task_type: "asset_scan",
          status: "finished",
          risk_level: "info",
          summary: "Asset scan finished with 0 findings",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: () => "2026-05-08T10:00:00.000Z",
    nextTaskId: () => "task_asset_governance_001"
  });

  const createdTask = await service.createTask({
    task_type: "asset_scan",
    title: "Public asset scan",
    target: {
      target_type: "ip",
      target_value: "1.1.1.1"
    },
    requested_by: "sec-ops",
    parameters: {
      query: "port=\"11434\" && protocol=\"http\"",
      source: "fofa",
      max_targets: 0,
      max_ports_per_target: 1000,
      max_runtime_seconds: -3,
      target_http_rps_cap: "9",
      max_tcp_concurrency_per_target: 0
    }
  }) as {
    parameters?: {
      max_targets?: number;
      max_ports_per_target?: number;
      max_runtime_seconds?: number;
      target_http_rps_cap?: number;
      max_tcp_concurrency_per_target?: number;
      audit?: {
        query?: string;
        source?: string;
        requested_by?: string;
        requested_at?: string;
      };
    };
  };

  assert.equal(repository.savedRecords.length >= 2, true);
  const firstSavedTask = repository.savedRecords[0]?.task;
  assert.notEqual(firstSavedTask, undefined);

  assert.deepEqual(firstSavedTask?.parameters, {
    query: "port=\"11434\" && protocol=\"http\"",
    source: "fofa",
    max_targets: 1,
    max_ports_per_target: 128,
    max_runtime_seconds: 60,
    target_http_rps_cap: 9,
    max_tcp_concurrency_per_target: 1,
    audit: {
      query: "port=\"11434\" && protocol=\"http\"",
      source: "fofa",
      requested_by: "sec-ops",
      requested_at: "2026-05-08T10:00:00.000Z",
      interruption_reason: "none"
    }
  });

  assert.deepEqual(createdTask.parameters, firstSavedTask?.parameters);
});

test("task center service persists asset-scan interruption reason into result details execution context", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before interruption reason persistence can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  let capturedCompletedDetails: Record<string, unknown> | null = null;

  const repository = {
    save(record: {
      task: { status: string };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            target: {
              target_type: "ip",
              target_value: "1.1.1.1"
            },
            open_ports: [],
            http_endpoints: [],
            auth_detected: false,
            findings: []
          },
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: "2026-05-08T10:00:00.000Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-05-08T10:00:00.000Z"
        }
      };
    },
    hasRegisteredClient() {
      return false;
    },
    createCompletedAssetScanArtifacts(task: { task_id: string }, details: Record<string, unknown>, updatedAt: string) {
      capturedCompletedDetails = details;
      return {
        task: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "finished",
          title: "Public asset scan",
          target: {
            target_type: "ip",
            target_value: "1.1.1.1"
          },
          risk_level: "info",
          summary: "Asset scan finished with 0 findings",
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "finished",
          risk_level: "info",
          summary: "Asset scan finished with 0 findings",
          details,
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "asset_scan",
          status: "finished",
          risk_level: "info",
          summary: "Asset scan finished with 0 findings",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: () => "2026-05-08T10:00:00.000Z",
    nextTaskId: () => "task_asset_interrupt_001"
  });

  await service.createTask({
    task_type: "asset_scan",
    title: "Public asset scan",
    target: {
      target_type: "ip",
      target_value: "1.1.1.1"
    },
    requested_by: "sec-ops",
    parameters: {
      query: "port=\"11434\" && protocol=\"http\"",
      source: "fofa",
      max_targets: 12,
      max_ports_per_target: 48,
      max_runtime_seconds: 300,
      target_http_rps_cap: 5,
      max_tcp_concurrency_per_target: 8,
      audit: {
        interruption_reason: "timeout"
      }
    }
  });

  assert.notEqual(capturedCompletedDetails, null);

  const executionContext =
    capturedCompletedDetails &&
    typeof capturedCompletedDetails === "object" &&
    "execution_context" in capturedCompletedDetails
      ? (capturedCompletedDetails.execution_context as Record<string, unknown>)
      : undefined;

  assert.notEqual(executionContext, undefined);
  assert.equal(executionContext?.max_targets, 12);
  assert.equal(executionContext?.max_ports_per_target, 48);
  assert.equal(executionContext?.max_runtime_seconds, 300);
  assert.equal(executionContext?.target_http_rps_cap, 5);
  assert.equal(executionContext?.max_tcp_concurrency_per_target, 8);

  const audit = executionContext?.audit as Record<string, unknown> | undefined;
  assert.notEqual(audit, undefined);
  assert.equal(audit?.interruption_reason, "timeout");
  assert.equal(audit?.requested_by, "sec-ops");
  assert.equal(typeof audit?.requested_at, "string");
});

test("task center service preserves engine-derived interruption reason when task audit defaults to none", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before engine-derived interruption reason preservation can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  let capturedCompletedDetails: Record<string, unknown> | null = null;

  const repository = {
    save(record: {
      task: { status: string };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            target: {
              target_type: "ip",
              target_value: "1.1.1.1"
            },
            open_ports: [],
            http_endpoints: [],
            auth_detected: false,
            findings: [],
            execution_context: {
              audit: {
                interruption_reason: "timeout"
              }
            }
          },
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: "2026-05-08T10:00:00.000Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-05-08T10:00:00.000Z"
        }
      };
    },
    hasRegisteredClient() {
      return false;
    },
    createCompletedAssetScanArtifacts(task: { task_id: string }, details: Record<string, unknown>, updatedAt: string) {
      capturedCompletedDetails = details;
      return {
        task: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "partial_success",
          title: "Public asset scan",
          target: {
            target_type: "ip",
            target_value: "1.1.1.1"
          },
          risk_level: "info",
          summary: "Asset scan partially completed with 0 findings",
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "partial_success",
          risk_level: "info",
          summary: "Asset scan partially completed with 0 findings",
          details,
          created_at: "2026-05-08T10:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "asset_scan",
          status: "partial_success",
          risk_level: "info",
          summary: "Asset scan partially completed with 0 findings",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: () => "2026-05-08T10:00:00.000Z",
    nextTaskId: () => "task_asset_interrupt_engine_001"
  });

  await service.createTask({
    task_type: "asset_scan",
    title: "Public asset scan",
    target: {
      target_type: "ip",
      target_value: "1.1.1.1"
    },
    requested_by: "sec-ops",
    parameters: {
      query: "port=\"11434\" && protocol=\"http\"",
      source: "fofa",
      audit: {
        interruption_reason: "none"
      }
    }
  });

  assert.notEqual(capturedCompletedDetails, null);

  const executionContext =
    capturedCompletedDetails &&
    typeof capturedCompletedDetails === "object" &&
    "execution_context" in capturedCompletedDetails
      ? (capturedCompletedDetails.execution_context as Record<string, unknown>)
      : undefined;

  const audit = executionContext?.audit as Record<string, unknown> | undefined;
  assert.equal(audit?.interruption_reason, "timeout");
});

test("task center service backfills failed asset-scan artifacts when initial engine execution throws", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before asset-scan failure backfill can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  const events: string[] = [];
  const savedStatuses: string[] = [];
  const repository = {
    save(record: {
      task: { task_id: string; status: string };
      result: { status: string; details: Record<string, unknown> };
      riskSummary: { status: string };
    }) {
      events.push(`save:${record.task.task_id}:${record.task.status}`);
      savedStatuses.push(`${record.task.status}/${record.result.status}/${record.riskSummary.status}`);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: { task_id: string }) {
      events.push(`createInitialArtifacts:${task.task_id}`);
      throw new Error("asset-scan timeout reached");
    },
    hasRegisteredClient() {
      return false;
    },
    createFailedAssetScanArtifacts(task: { task_id: string }, updatedAt: string, interruptionReason: string) {
      events.push(`createFailedAssetScanArtifacts:${task.task_id}:${interruptionReason}:${updatedAt}`);
      return {
        task: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "failed",
          title: "Public asset scan",
          target: {
            target_type: "ip",
            target_value: "1.1.1.1"
          },
          risk_level: "info",
          summary: "Asset scan failed during initial execution",
          created_at: "2026-05-08T11:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "failed",
          risk_level: "info",
          summary: "Asset scan failed during initial execution",
          details: {
            target: {
              target_type: "ip",
              target_value: "1.1.1.1"
            },
            findings: [],
            execution_context: {
              audit: {
                interruption_reason: interruptionReason,
                requested_by: "sec-ops",
                requested_at: "2026-05-08T11:00:00.000Z"
              }
            }
          },
          created_at: "2026-05-08T11:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "asset_scan",
          status: "failed",
          risk_level: "info",
          summary: "Asset scan failed during initial execution",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: () => "2026-05-08T11:00:00.000Z",
    nextTaskId: () => "task_asset_failed_001"
  });

  const createdTask = await service.createTask({
    task_type: "asset_scan",
    title: "Public asset scan",
    target: {
      target_type: "ip",
      target_value: "1.1.1.1"
    },
    requested_by: "sec-ops",
    parameters: {
      query: "port=\"11434\" && protocol=\"http\"",
      source: "fofa",
      audit: {
        interruption_reason: "timeout"
      }
    }
  }) as { status: string; summary: string };

  assert.equal(createdTask.status, "failed");
  assert.equal(createdTask.summary, "Asset scan failed during initial execution");
  assert.deepEqual(events, [
    "createInitialArtifacts:task_asset_failed_001",
    "createFailedAssetScanArtifacts:task_asset_failed_001:timeout:2026-05-08T11:00:00.000Z",
    "save:task_asset_failed_001:failed"
  ]);
  assert.deepEqual(savedStatuses, ["failed/failed/failed"]);
});

test("task center service derives interruption reason from engine error when audit does not provide one", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before interruption reason derivation can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  const events: string[] = [];
  const repository = {
    save(record: {
      task: { task_id: string; status: string };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      events.push(`save:${record.task.task_id}:${record.task.status}`);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts() {
      throw new Error("scan aborted: budget exceeded");
    },
    hasRegisteredClient() {
      return false;
    },
    createFailedAssetScanArtifacts(task: { task_id: string }, updatedAt: string, interruptionReason: string) {
      events.push(`createFailedAssetScanArtifacts:${task.task_id}:${interruptionReason}:${updatedAt}`);
      return {
        task: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "failed",
          title: "Public asset scan",
          target: {
            target_type: "ip",
            target_value: "1.1.1.1"
          },
          risk_level: "info",
          summary: "Asset scan failed during initial execution",
          created_at: "2026-05-08T12:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "asset_scan",
          engine_type: "asset_scan",
          status: "failed",
          risk_level: "info",
          summary: "Asset scan failed during initial execution",
          details: {
            target: {
              target_type: "ip",
              target_value: "1.1.1.1"
            },
            findings: [],
            execution_context: {
              audit: {
                interruption_reason: interruptionReason
              }
            }
          },
          created_at: "2026-05-08T12:00:00.000Z",
          updated_at: updatedAt,
          finished_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "asset_scan",
          status: "failed",
          risk_level: "info",
          summary: "Asset scan failed during initial execution",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: () => "2026-05-08T12:00:00.000Z",
    nextTaskId: () => "task_asset_failed_002"
  });

  const createdTask = await service.createTask({
    task_type: "asset_scan",
    title: "Public asset scan",
    target: {
      target_type: "ip",
      target_value: "1.1.1.1"
    },
    requested_by: "sec-ops",
    parameters: {
      query: "port=\"11434\" && protocol=\"http\"",
      source: "fofa",
      audit: {}
    }
  }) as { status: string };

  assert.equal(createdTask.status, "failed");
  assert.deepEqual(events, [
    "createFailedAssetScanArtifacts:task_asset_failed_002:budget:2026-05-08T12:00:00.000Z",
    "save:task_asset_failed_002:failed"
  ]);
});

test("task center service backfills failed static-analysis artifacts when dispatch raises a stable execution error", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);
  const executionErrorModule = await importIfExists<SkillsStaticExecutionErrorModule>(
    resolve(import.meta.dirname, "../src/modules/task-center/skills-static/skills-static-execution-error.ts")
  );

  assert.notEqual(serviceModule, null, "task-center service module should exist before dispatch failure backfill can be verified");
  assert.notEqual(executionErrorModule, null, "skills-static execution error module should exist before dispatch failure backfill can be verified");
  assert.ok(serviceModule?.TaskCenterService);
  assert.ok(executionErrorModule?.SkillsStaticExecutionError);

  if (!serviceModule?.TaskCenterService || !executionErrorModule?.SkillsStaticExecutionError) {
    return;
  }

  const events: string[] = [];
  const savedStatuses: string[] = [];
  const repository = {
    save(record: {
      task: { task_id: string; status: string };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      events.push(`save:${record.task.task_id}:${record.task.status}`);
      savedStatuses.push(`${record.task.status}/${record.result.status}/${record.riskSummary.status}`);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      events.push(`createInitialArtifacts:${task.task_id}`);
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: []
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: "2026-03-26T01:00:00Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-03-26T01:00:00Z"
        }
      };
    },
    hasRegisteredClient() {
      return true;
    },
    async dispatchTask(task: { task_id: string; task_type: string; engine_type: string }) {
      events.push(`dispatchTask:${task.task_id}:${task.task_type}:${task.engine_type}`);
      throw new executionErrorModule.SkillsStaticExecutionError({
        provider: "semgrep",
        phase: "runner",
        reason: "timeout"
      });
    },
    createFailedStaticAnalysisArtifacts(task: { task_id: string }, updatedAt: string, phase: string) {
      events.push(`createFailedStaticAnalysisArtifacts:${task.task_id}:${phase}:${updatedAt}`);
      return {
        task: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "failed",
          title: "Analyze demo skill",
          target: {
            target_type: "skill_package",
            target_value: "samples/skills/demo-email-skill",
            display_name: "demo-email-skill"
          },
          risk_level: "info",
          summary: "Static analysis failed during engine execution",
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "failed",
          risk_level: "info",
          summary: "Static analysis failed during engine execution",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: []
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "static_analysis",
          status: "failed",
          risk_level: "info",
          summary: "Static analysis failed during engine execution",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    now: (() => {
      const timestamps = ["2026-03-26T01:00:00Z", "2026-03-26T01:05:00Z"];
      let index = 0;
      return () => timestamps[index++] ?? "2026-03-26T01:05:00Z";
    })(),
    nextTaskId: () => "task_static_dispatch_failure_001"
  });

  const createdTask = await service.createTask({
    task_type: "static_analysis",
    title: "Analyze demo skill",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/demo-email-skill",
      display_name: "demo-email-skill"
    }
  }) as {
    task_id: string;
    status: string;
  };

  assert.equal(createdTask.task_id, "task_static_dispatch_failure_001");
  assert.equal(createdTask.status, "pending");
  assert.deepEqual(events, [
    "createInitialArtifacts:task_static_dispatch_failure_001",
    "save:task_static_dispatch_failure_001:pending",
    "dispatchTask:task_static_dispatch_failure_001:static_analysis:skills_static",
    "createFailedStaticAnalysisArtifacts:task_static_dispatch_failure_001:runner:2026-03-26T01:05:00Z",
    "save:task_static_dispatch_failure_001:failed"
  ]);
  assert.deepEqual(savedStatuses, ["pending/pending/pending", "failed/failed/failed"]);
});

test("task center service backfills failed static-analysis artifacts when the engine client returns a malformed mock result", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before malformed static-analysis payload handling can be verified");
  assert.ok(serviceModule?.TaskCenterService, "task-center service should expose a concrete service class");

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  const events: string[] = [];
  const savedStatuses: string[] = [];
  const loggedEvents: Array<Record<string, unknown>> = [];
  const repository = {
    save(record: {
      task: { task_id: string; status: string };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      events.push(`save:${record.task.task_id}:${record.task.status}`);
      savedStatuses.push(`${record.task.status}/${record.result.status}/${record.riskSummary.status}`);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      events.push(`createInitialArtifacts:${task.task_id}`);
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: []
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: "2026-03-26T01:00:00Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-03-26T01:00:00Z"
        }
      };
    },
    hasRegisteredClient() {
      return true;
    },
    async dispatchTask(task: { task_id: string; task_type: string; engine_type: string }) {
      events.push(`dispatchTask:${task.task_id}:${task.task_type}:${task.engine_type}`);
      return {
        accepted: true,
        engine_type: "skills_static",
        provider: "mock",
        endpoint: "internal://skills-static",
        mock_result: {
          sample_name: "demo-email-skill",
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
        }
      };
    },
    createCompletedStaticAnalysisArtifacts(task: { task_id: string }, _mockResult: unknown, updatedAt: string) {
      events.push(`createCompletedStaticAnalysisArtifacts:${task.task_id}:${updatedAt}`);
      return {
        task: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "finished",
          title: "Analyze demo skill",
          target: {
            target_type: "skill_package",
            target_value: "samples/skills/demo-email-skill",
            display_name: "demo-email-skill"
          },
          risk_level: "high",
          summary: "Static analysis finished with 1 rule hit",
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "finished",
          risk_level: "high",
          summary: "Static analysis finished with 1 rule hit",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: [{ rule_id: "SK001", severity: "high" }]
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "static_analysis",
          status: "finished",
          risk_level: "high",
          summary: "Static analysis finished with 1 rule hit",
          total_findings: 1,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 1,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    },
    createFailedStaticAnalysisArtifacts(task: { task_id: string }, updatedAt: string, phase: string) {
      events.push(`createFailedStaticAnalysisArtifacts:${task.task_id}:${phase}:${updatedAt}`);
      return {
        task: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "failed",
          title: "Analyze demo skill",
          target: {
            target_type: "skill_package",
            target_value: "samples/skills/demo-email-skill",
            display_name: "demo-email-skill"
          },
          risk_level: "info",
          summary: "Static analysis failed during result normalization",
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "failed",
          risk_level: "info",
          summary: "Static analysis failed during result normalization",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: []
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "static_analysis",
          status: "failed",
          risk_level: "info",
          summary: "Static analysis failed during result normalization",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    logSkillsStaticEvent: (event) => {
      loggedEvents.push(event as Record<string, unknown>);
    },
    now: (() => {
      const timestamps = ["2026-03-26T01:00:00Z", "2026-03-26T01:05:00Z"];
      let index = 0;
      return () => timestamps[index++] ?? "2026-03-26T01:05:00Z";
    })(),
    nextTaskId: () => "task_static_invalid_mock_001"
  });

  const createdTask = await service.createTask({
    task_type: "static_analysis",
    title: "Analyze demo skill",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/demo-email-skill",
      display_name: "demo-email-skill"
    }
  }) as {
    task_id: string;
    status: string;
  };

  assert.equal(createdTask.task_id, "task_static_invalid_mock_001");
  assert.equal(createdTask.status, "pending");
  assert.deepEqual(events, [
    "createInitialArtifacts:task_static_invalid_mock_001",
    "save:task_static_invalid_mock_001:pending",
    "dispatchTask:task_static_invalid_mock_001:static_analysis:skills_static",
    "createFailedStaticAnalysisArtifacts:task_static_invalid_mock_001:normalizer:2026-03-26T01:05:00Z",
    "save:task_static_invalid_mock_001:failed"
  ]);
  assert.deepEqual(savedStatuses, ["pending/pending/pending", "failed/failed/failed"]);
  assert.deepEqual(loggedEvents, [
    {
      event: "scan_failed",
      task_id: "task_static_invalid_mock_001",
      engine_type: "skills_static",
      provider: "mock",
      target_ref: "demo-email-skill",
      phase: "normalizer",
      reason: "normalization_failed",
      error_summary: "Skills-static engine output is missing a required rule_id"
    }
  ]);
});

test("task center service backfills failed static-analysis artifacts when result derivation throws", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before derivation failure backfill can be verified");
  assert.ok(serviceModule?.TaskCenterService);

  if (!serviceModule?.TaskCenterService) {
    return;
  }

  const events: string[] = [];
  const savedStatuses: string[] = [];
  const loggedEvents: Array<Record<string, unknown>> = [];
  const repository = {
    save(record: {
      task: { task_id: string; status: string };
      result: { status: string };
      riskSummary: { status: string };
    }) {
      events.push(`save:${record.task.task_id}:${record.task.status}`);
      savedStatuses.push(`${record.task.status}/${record.result.status}/${record.riskSummary.status}`);
      return record;
    },
    list() {
      return [];
    },
    findById() {
      return null;
    }
  };

  const taskEngineService = {
    async createInitialArtifacts(task: {
      task_id: string;
      task_type: string;
      engine_type: string;
    }) {
      events.push(`createInitialArtifacts:${task.task_id}`);
      return {
        result: {
          task_id: task.task_id,
          task_type: task.task_type,
          engine_type: task.engine_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: []
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: "2026-03-26T01:00:00Z"
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: task.task_type,
          status: "pending",
          risk_level: "info",
          summary: "Task accepted and waiting for engine dispatch",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: "2026-03-26T01:00:00Z"
        }
      };
    },
    hasRegisteredClient() {
      return true;
    },
    async dispatchTask(task: { task_id: string; task_type: string; engine_type: string }) {
      events.push(`dispatchTask:${task.task_id}:${task.task_type}:${task.engine_type}`);
      return {
        accepted: true,
        engine_type: "skills_static",
        provider: "mock",
        endpoint: "internal://skills-static",
        mock_result: {
          sample_name: "demo-email-skill",
          language: "typescript",
          entry_files: ["src/commands.ts", "src/network.ts"],
          files_scanned: 2,
          rule_hits: [
            {
              rule_id: "command_execution.shell_exec",
              severity: "high",
              message: "Potential command execution sink reached",
              file_path: "src/commands.ts",
              line_start: 4,
              line_end: 4
            }
          ],
          sensitive_capabilities: ["command_execution"],
          dependency_summary: {}
        }
      };
    },
    createCompletedStaticAnalysisArtifacts(task: { task_id: string }, _mockResult: unknown, updatedAt: string) {
      events.push(`createCompletedStaticAnalysisArtifacts:${task.task_id}:${updatedAt}`);
      throw new Error("deriver exploded");
    },
    createFailedStaticAnalysisArtifacts(task: { task_id: string }, updatedAt: string, phase: string) {
      events.push(`createFailedStaticAnalysisArtifacts:${task.task_id}:${phase}:${updatedAt}`);
      return {
        task: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "failed",
          title: "Analyze demo skill",
          target: {
            target_type: "skill_package",
            target_value: "samples/skills/demo-email-skill",
            display_name: "demo-email-skill"
          },
          risk_level: "info",
          summary: "Static analysis failed during risk summary derivation",
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        result: {
          task_id: task.task_id,
          task_type: "static_analysis",
          engine_type: "skills_static",
          status: "failed",
          risk_level: "info",
          summary: "Static analysis failed during risk summary derivation",
          details: {
            sample_name: "demo-email-skill",
            rule_hits: []
          },
          created_at: "2026-03-26T01:00:00Z",
          updated_at: updatedAt
        },
        riskSummary: {
          task_id: task.task_id,
          task_type: "static_analysis",
          status: "failed",
          risk_level: "info",
          summary: "Static analysis failed during risk summary derivation",
          total_findings: 0,
          info_count: 0,
          low_count: 0,
          medium_count: 0,
          high_count: 0,
          critical_count: 0,
          updated_at: updatedAt
        }
      };
    }
  };

  const service = new serviceModule.TaskCenterService({
    repository,
    adapters: [],
    taskEngineService,
    logSkillsStaticEvent: (event) => {
      loggedEvents.push(event as Record<string, unknown>);
    },
    now: (() => {
      const timestamps = ["2026-03-26T01:00:00Z", "2026-03-26T01:05:00Z"];
      let index = 0;
      return () => timestamps[index++] ?? "2026-03-26T01:05:00Z";
    })(),
    nextTaskId: () => "task_static_deriver_failure_001"
  });

  const createdTask = await service.createTask({
    task_type: "static_analysis",
    title: "Analyze demo skill",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/demo-email-skill",
      display_name: "demo-email-skill"
    }
  }) as {
    task_id: string;
    status: string;
  };

  assert.equal(createdTask.task_id, "task_static_deriver_failure_001");
  assert.equal(createdTask.status, "pending");
  assert.deepEqual(events, [
    "createInitialArtifacts:task_static_deriver_failure_001",
    "save:task_static_deriver_failure_001:pending",
    "dispatchTask:task_static_deriver_failure_001:static_analysis:skills_static",
    "createCompletedStaticAnalysisArtifacts:task_static_deriver_failure_001:2026-03-26T01:05:00Z",
    "createFailedStaticAnalysisArtifacts:task_static_deriver_failure_001:deriver:2026-03-26T01:05:00Z",
    "save:task_static_deriver_failure_001:failed"
  ]);
  assert.deepEqual(savedStatuses, ["pending/pending/pending", "failed/failed/failed"]);
  assert.deepEqual(loggedEvents, [
    {
      event: "scan_failed",
      task_id: "task_static_deriver_failure_001",
      engine_type: "skills_static",
      provider: "mock",
      target_ref: "demo-email-skill",
      phase: "deriver",
      reason: "derivation_failed",
      error_summary: "deriver exploded"
    }
  ]);
});
