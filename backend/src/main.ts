import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { createAppModule } from "./app.module.ts";

export function createAppServer() {
  const appModule = createAppModule();

  return createServer((request, response) => {
    void appModule.handle(request, response);
  });
}

export async function startServer(port: number): Promise<void> {
  const server = createAppServer();

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

const entrypoint = process.argv[1];

if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const port = Number(process.env.PORT ?? 3000);
  void startServer(port);
}
