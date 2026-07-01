import { InMemoryCampaignRepository } from "./modules/supervision/repositories/in-memory-campaign.repository.ts";
import { InMemoryTaskRepository } from "./modules/task-center/repositories/in-memory-task.repository.ts";

// P2-T4: Single composition root for runtime repositories.
// One task repository and one campaign repository are created together so the
// public AppModule and the internal ingest AppModule can share the same state
// without either module owning the other's repository.
export interface RuntimeDependencies {
  taskRepository: InMemoryTaskRepository;
  campaignRepository: InMemoryCampaignRepository;
}

export function createRuntimeDependencies(): RuntimeDependencies {
  return {
    taskRepository: new InMemoryTaskRepository(),
    campaignRepository: new InMemoryCampaignRepository()
  };
}
