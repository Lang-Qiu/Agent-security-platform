import type { EngineType } from "../../../../../shared/types/task.ts";
import type { SkillsStaticMockResult } from "../adapters/skills-static.adapter.ts";
import type { EngineDispatchTicket } from "../adapters/engine-adapter.ts";

interface BaseEngineClientDispatchReceipt<T extends EngineType> {
  accepted: boolean;
  engine_type: T;
  endpoint: string;
}

export type EngineClientDispatchReceipt =
  | BaseEngineClientDispatchReceipt<"asset_scan">
  | BaseEngineClientDispatchReceipt<"sandbox">
  | (BaseEngineClientDispatchReceipt<"skills_static"> & {
      mock_result?: SkillsStaticMockResult;
    });

export interface EngineClient {
  engineType: EngineDispatchTicket["engine_type"];
  endpoint: string;
  dispatch(ticket: EngineDispatchTicket): Promise<EngineClientDispatchReceipt>;
}
