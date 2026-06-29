import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { AppModule, createAppModule } from "./app.module.ts";

export { createAppModule } from "./app.module.ts";
export type { AppModule } from "./app.module.ts";

export function createAppServer(appModule: AppModule = createAppModule()): Server {
  return createServer((request, response) => {
    void appModule.handle(request, response);
  });
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
  const server = createAppServer();
  server.listen(port, "127.0.0.1");
}
