import { AssetScanTaskAdapter } from "./adapters/asset-scan.adapter.ts";
import { SandboxTaskAdapter } from "./adapters/sandbox.adapter.ts";
import { SkillsStaticTaskAdapter } from "./adapters/skills-static.adapter.ts";
import { SkillsStaticEngineClient } from "./clients/skills-static.engine-client.ts";
import { InMemoryTaskRepository } from "./repositories/in-memory-task.repository.ts";
import { TaskCenterController } from "./task-center.controller.ts";
import { TaskEngineService } from "./task-engine.service.ts";
import { TaskCenterService } from "./task-center.service.ts";

export interface TaskCenterModule {
  controller: TaskCenterController;
  service: TaskCenterService;
  taskEngineService: TaskEngineService;
  repository: InMemoryTaskRepository;
}

export function createTaskCenterModule(): TaskCenterModule {
  const repository = new InMemoryTaskRepository();
  const taskEngineService = new TaskEngineService({
    adapters: [new AssetScanTaskAdapter(), new SkillsStaticTaskAdapter(), new SandboxTaskAdapter()],
    engineClients: [new SkillsStaticEngineClient()]
  });
  const service = new TaskCenterService({
    repository,
    taskEngineService
  });

  return {
    controller: new TaskCenterController(service),
    service,
    taskEngineService,
    repository
  };
}
