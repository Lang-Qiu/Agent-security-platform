import type { EngineType } from "../../../../../shared/types/task.ts";
import { DomainError } from "../../../common/errors/domain-error.ts";
import type { EngineClient } from "./engine-client.ts";

export class EngineClientRegistry {
  clientsByEngineType: Map<EngineType, EngineClient>;

  constructor(clients: EngineClient[]) {
    this.clientsByEngineType = new Map();

    for (const client of clients) {
      if (this.clientsByEngineType.has(client.engineType)) {
        throw new DomainError(
          "An engine client is already registered for the requested engine type",
          "ENGINE_CLIENT_DUPLICATE_REGISTRATION",
          500
        );
      }

      this.clientsByEngineType.set(client.engineType, client);
    }
  }

  getRequiredClient(engineType: EngineType): EngineClient {
    const client = this.clientsByEngineType.get(engineType);

    if (!client) {
      throw new DomainError(
        "No engine client is registered for the requested engine type",
        "ENGINE_CLIENT_NOT_FOUND",
        500
      );
    }

    return client;
  }

  hasClient(engineType: EngineType): boolean {
    return this.clientsByEngineType.has(engineType);
  }
}
