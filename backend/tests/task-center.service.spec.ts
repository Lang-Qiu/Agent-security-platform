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
