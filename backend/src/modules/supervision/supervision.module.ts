import type { TaskRepository } from "../task-center/repositories/task.repository.ts";
import { SupervisionController } from "./supervision.controller.ts";
import { SupervisionService } from "./supervision.service.ts";

export interface SupervisionModule {
  controller: SupervisionController;
  service: SupervisionService;
}

export function createSupervisionModule(input: {
  repository: TaskRepository;
}): SupervisionModule {
  const service = new SupervisionService(input.repository);
  const controller = new SupervisionController(service);
  return { controller, service };
}
