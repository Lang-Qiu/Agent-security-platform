import type { EngineDispatchTicket } from "../adapters/engine-adapter.ts";

export interface EngineClientDispatchReceipt {
  accepted: boolean;
  engine_type: EngineDispatchTicket["engine_type"];
  endpoint: string;
  mock_result?: unknown;
}

export interface EngineClient {
  engineType: EngineDispatchTicket["engine_type"];
  endpoint: string;
  dispatch(ticket: EngineDispatchTicket): Promise<EngineClientDispatchReceipt>;
}
