import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { AppModule, createAppModule } from "./app.module.ts";
import { InternalAppModule } from "./internal-app.module.ts";
import {
  createSandboxSecurityProductionModule,
  type SandboxSecurityModule
} from "./modules/sandbox-security/sandbox-security.module.ts";
import {
  loadSandboxSecurityConfiguration
} from "./modules/sandbox-security/sandbox-security.config.ts";
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

export function createProductionServers(input: Readonly<{
  deps: RuntimeDependencies;
  ingestToken: string;
  sandboxSecurityModule: SandboxSecurityModule;
}>): ProductionServers {
  const deps = input.deps;
  const appModule = createAppModule(deps, input.sandboxSecurityModule);
  const internalAppModule = new InternalAppModule({
    campaignRepository: deps.campaignRepository,
    ingestToken: input.ingestToken,
    taskRepository: deps.taskRepository,
    sandboxSecurityModule: input.sandboxSecurityModule
  });

  const publicServer = createAppServer(appModule);
  const internalServer = createInternalAppServer(internalAppModule);
  let closePromise: Promise<void> | null = null;

  return {
    publicServer,
    internalServer,
    internalAppModule,
    deps,
    close: () => {
      if (closePromise !== null) return closePromise;
      closePromise = (async () => {
        const errors: unknown[] = [];
        const closeServer = (server: Server): Promise<void> => {
          if (!server.listening) return Promise.resolve();
          return new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          });
        };
        const listenerResults = await Promise.allSettled([
          closeServer(publicServer),
          closeServer(internalServer)
        ]);
        for (const result of listenerResults) {
          if (result.status === "rejected") errors.push(result.reason);
        }
        try {
          await input.sandboxSecurityModule.close();
        } catch (error) {
          errors.push(error);
        }
        if (errors.length > 0) {
          throw new AggregateError(errors, "production server close failed");
        }
      })();
      return closePromise;
    }
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

// R14 (Phase 2 rework review P1 #5): start both production servers with
// configurable bind hosts. The internal server must NOT be hardcoded to
// 127.0.0.1 — other containers (e.g. OpenClaw) reach the backend via
// `backend:3001`, which requires binding to a container-reachable host
// like 0.0.0.0. The public server bind host is also configurable for
// symmetry, defaulting to 127.0.0.1 for backward compatibility.
export interface ProductionServerHandles {
  publicServer: Server;
  internalServer: Server;
  close: () => Promise<void>;
}

export async function startProductionServers(options: {
  publicPort?: number;
  internalPort?: number;
  publicBindHost?: string;
  internalBindHost?: string;
  deps?: RuntimeDependencies;
  ingestToken?: string;
  sandboxSecurityModule?: SandboxSecurityModule;
  environment?: Readonly<Record<string, string | undefined>>;
} = {}): Promise<ProductionServerHandles> {
  const publicPort = options.publicPort ?? Number(process.env.PORT ?? 3000);
  const internalPort =
    options.internalPort ?? Number(process.env.INTERNAL_PORT ?? 3001);
  const publicBindHost =
    options.publicBindHost ?? process.env.PUBLIC_BIND_HOST ?? "127.0.0.1";
  // R23 (Phase 2 rework review 2 P2): default internal bind host to 0.0.0.0
  // so other containers (e.g. OpenClaw) can reach backend:3001 via the
  // Docker network. The previous 127.0.0.1 default made the internal API
  // unreachable from other containers even when INTERNAL_BIND_HOST was
  // not explicitly set.
  const internalBindHost =
    options.internalBindHost ?? process.env.INTERNAL_BIND_HOST ?? "0.0.0.0";

  const deps = options.deps ?? createRuntimeDependencies();
  const ingestToken =
    options.ingestToken ?? process.env.TRACK1_INGEST_TOKEN ?? "";
  let sandboxSecurityModule = options.sandboxSecurityModule;
  if (sandboxSecurityModule === undefined) {
    const configuration = loadSandboxSecurityConfiguration(
      options.environment ?? process.env
    );
    sandboxSecurityModule = await createSandboxSecurityProductionModule({
      configuration
    });
  }
  let servers: ProductionServers;
  try {
    servers = createProductionServers({
      deps,
      ingestToken,
      sandboxSecurityModule
    });
  } catch (error) {
    try {
      await sandboxSecurityModule.close();
    } catch {
      // Preserve the composition error while attempting module cleanup.
    }
    throw error;
  }

  const bind = (server: Server, port: number, host: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.removeListener("error", onError);
        reject(error);
      };
      server.once("error", onError);
      server.listen(port, host, () => {
        server.removeListener("error", onError);
        resolve();
      });
    });

  // Await both listen calls so the servers are fully bound before returning.
  try {
    await bind(servers.publicServer, publicPort, publicBindHost);
  } catch (err) {
    try {
      await servers.close();
    } catch {
      // Preserve the bind error while attempting every cleanup step.
    }
    throw err;
  }
  try {
    await bind(servers.internalServer, internalPort, internalBindHost);
  } catch (err) {
    // R29 (Phase 2 rework review 3 P2 #5): close the already-started public
    // server before rethrowing so the caller does not leak a listening
    // socket. Without this, an EADDRINUSE on the internal port leaves the
    // public server bound with no handle for the caller to close it.
    try {
      await servers.close();
    } catch {
      // Preserve the bind error while attempting every cleanup step.
    }
    throw err;
  }

  return {
    publicServer: servers.publicServer,
    internalServer: servers.internalServer,
    close: servers.close
  };
}

const entrypoint = process.argv[1];

if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await startProductionServers();
}
