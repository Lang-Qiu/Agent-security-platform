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
    taskEngineService?: {
      createInitialArtifacts: (task: unknown) => Promise<unknown>;
      hasRegisteredClient: (task: unknown) => boolean;
      dispatchTask: (task: unknown) => Promise<unknown>;
      createCompletedStaticAnalysisArtifacts?: (task: unknown, mockResult: unknown, updatedAt: string) => unknown;
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
        status: "pending",
        summary: "Task accepted and waiting for engine dispatch"
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

test("task center service does not backfill static-analysis artifacts when the engine client returns a malformed mock result", async () => {
  const serviceModule = await importIfExists<ServiceModule>(modulePath);

  assert.notEqual(serviceModule, null, "task-center service module should exist before malformed static-analysis payload handling can be verified");
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
    "dispatchTask:task_static_invalid_mock_001:static_analysis:skills_static"
  ]);
  assert.deepEqual(savedStatuses, ["pending/pending/pending"]);
});
