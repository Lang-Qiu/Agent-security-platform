import { AssetScanTaskAdapter } from "./adapters/asset-scan.adapter.ts";
import { SandboxTaskAdapter } from "./adapters/sandbox.adapter.ts";
import { SkillsStaticTaskAdapter } from "./adapters/skills-static.adapter.ts";
import { InMemoryTaskRepository } from "./repositories/in-memory-task.repository.ts";
import { TaskCenterController } from "./task-center.controller.ts";
import { TaskCenterService } from "./task-center.service.ts";

export interface TaskCenterModule {
  controller: TaskCenterController;
  service: TaskCenterService;
  repository: InMemoryTaskRepository;
}

export function createTaskCenterModule(): TaskCenterModule {
  const repository = new InMemoryTaskRepository();
  const service = new TaskCenterService({
    repository,
    adapters: [new AssetScanTaskAdapter(), new SkillsStaticTaskAdapter(), new SandboxTaskAdapter()]
  });

  return {
    controller: new TaskCenterController(service),
    service,
    repository
  };
}
