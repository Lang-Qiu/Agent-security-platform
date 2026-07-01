import type { TaskRepository } from "../task-center/repositories/task.repository.ts";
import { InMemoryCampaignRepository } from "./repositories/in-memory-campaign.repository.ts";
import { SupervisionController } from "./supervision.controller.ts";
import { SupervisionService } from "./supervision.service.ts";

export interface SupervisionModule {
  controller: SupervisionController;
  service: SupervisionService;
  campaignRepository: InMemoryCampaignRepository;
}

export function createSupervisionModule(input: {
  taskRepository: TaskRepository;
  campaignRepository?: InMemoryCampaignRepository;
}): SupervisionModule {
  const campaignRepository =
    input.campaignRepository ?? new InMemoryCampaignRepository();
  const service = new SupervisionService(input.taskRepository);
  const controller = new SupervisionController(service);
  return { controller, service, campaignRepository };
}
