import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { AppModule, createAppModule } from "./app.module.ts";
import { InternalAppModule } from "./internal-app.module.ts";
import {
  createRuntimeDependencies,
  type RuntimeDependencies
} from "./runtime-dependencies.ts";

export { createAppModule } from "./app.module.ts";
export type { AppModule } from "./app.module.ts";
export { InternalAppModule } from "./internal-app.module.ts";

export function createAppServer(appModule: AppModule = createAppModule()): Server {
  return createServer((request, response) => {
    void appModule.handle(request, response);
  });
}

export function createInternalAppServer(internalAppModule: InternalAppModule): Server {
  return createServer((request, response) => {
    void internalAppModule.handle(request, response);
  });
}

// R8 (Phase 2 rework finding 1): production composition root that creates
// both the public server (port 3000) and the internal campaign ingest
// server (port 3001) with shared dependencies. Previously main.ts only
// started the public server; the internal server was only assembled in
// the test harness, so real deployments could not accept campaign
// snapshots.
export interface ProductionServers {
  publicServer: Server;
  internalServer: Server;
  internalAppModule: InternalAppModule;
  deps: RuntimeDependencies;
  close: () => Promise<void>;
}

export function createProductionServers(options?: {
  deps?: RuntimeDependencies;
  ingestToken?: string;
}): ProductionServers {
  const deps = options?.deps ?? createRuntimeDependencies();
  const ingestToken =
    options?.ingestToken ??
    process.env.CAMPAIGN_INGEST_TOKEN ??
    "";

  const appModule = createAppModule(deps);
  const internalAppModule = new InternalAppModule({
    campaignRepository: deps.campaignRepository,
    ingestToken,
    taskRepository: deps.taskRepository
  });

  const publicServer = createAppServer(appModule);
  const internalServer = createInternalAppServer(internalAppModule);

  return {
    publicServer,
    internalServer,
    internalAppModule,
    deps,
    close: () =>
      Promise.all([
        new Promise<void>((resolve, reject) => {
          publicServer.close((err) => (err ? reject(err) : resolve()));
        }),
        new Promise<void>((resolve, reject) => {
          internalServer.close((err) => (err ? reject(err) : resolve()));
        })
      ]).then(() => undefined)
  };
}

export async function startServer(server: Server): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Server did not expose a numeric port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise();
        });
      })
  };
}

const entrypoint = process.argv[1];

if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const port = Number(process.env.PORT ?? 3000);
  const internalPort = Number(process.env.INTERNAL_PORT ?? 3001);
  const servers = createProductionServers();
  servers.publicServer.listen(port, "127.0.0.1");
  servers.internalServer.listen(internalPort, "127.0.0.1");
}
