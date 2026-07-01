import type { TaskRepository } from "../task-center/repositories/task.repository.ts";
import { CampaignSupervisionController } from "./campaign-supervision.controller.ts";
import { CampaignSupervisionService } from "./campaign-supervision.service.ts";
import { InMemoryCampaignRepository } from "./repositories/in-memory-campaign.repository.ts";
import { SupervisionController } from "./supervision.controller.ts";
import { SupervisionService } from "./supervision.service.ts";

export interface SupervisionModule {
  controller: SupervisionController;
  service: SupervisionService;
  campaignRepository: InMemoryCampaignRepository;
  campaignSupervisionController: CampaignSupervisionController;
  campaignSupervisionService: CampaignSupervisionService;
}

export function createSupervisionModule(input: {
  taskRepository: TaskRepository;
  campaignRepository?: InMemoryCampaignRepository;
}): SupervisionModule {
  const campaignRepository =
    input.campaignRepository ?? new InMemoryCampaignRepository();
  const service = new SupervisionService(input.taskRepository);
  const controller = new SupervisionController(service);
  const campaignSupervisionService = new CampaignSupervisionService(
    campaignRepository
  );
  const campaignSupervisionController = new CampaignSupervisionController(
    campaignSupervisionService
  );
  return {
    controller,
    service,
    campaignRepository,
    campaignSupervisionController,
    campaignSupervisionService
  };
}
