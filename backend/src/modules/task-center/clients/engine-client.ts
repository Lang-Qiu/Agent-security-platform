import type { EngineType } from "../../../../../shared/types/task.ts";
import type { EngineDispatchTicket } from "../adapters/engine-adapter.ts";
import type { SkillsStaticEngineOutput } from "../skills-static/skills-static-engine-output.ts";

interface BaseEngineClientDispatchReceipt<T extends EngineType> {
  accepted: boolean;
  engine_type: T;
  endpoint: string;
}

export type EngineClientDispatchReceipt =
  | BaseEngineClientDispatchReceipt<"asset_scan">
  | BaseEngineClientDispatchReceipt<"sandbox">
  | (BaseEngineClientDispatchReceipt<"skills_static"> & {
      mock_result?: SkillsStaticEngineOutput;
    });

export interface EngineClient {
  engineType: EngineDispatchTicket["engine_type"];
  endpoint: string;
  dispatch(ticket: EngineDispatchTicket): Promise<EngineClientDispatchReceipt>;
}
