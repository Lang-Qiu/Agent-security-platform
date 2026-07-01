import assert from "node:assert/strict";
import { test } from "node:test";

import { createProductionServers, startServer } from "../src/main.ts";
import { createRuntimeDependencies } from "../src/runtime-dependencies.ts";

// R8 (Phase 2 rework finding 1): the production entrypoint must start both
// the public server (port 3000) and the internal campaign ingest server
// (port 3001) with shared dependencies. Previously main.ts only started the
// public server; the internal server, ingest token, and shared deps were
// only assembled manually in the test harness, so real deployments could
// not accept campaign snapshots.

test("REQ-T1-DEMO-010 createProductionServers creates both public and internal servers", () => {
  const servers = createProductionServers({
    ingestToken: "a".repeat(64)
  });
  assert.ok(servers.publicServer, "publicServer must be provided");
  assert.ok(servers.internalServer, "internalServer must be provided");
  assert.notStrictEqual(servers.publicServer, servers.internalServer);
});

test("REQ-T1-DEMO-010 production servers share the same task and campaign repositories", () => {
  const deps = createRuntimeDependencies();
  const servers = createProductionServers({
    deps,
    ingestToken: "a".repeat(64)
  });
  assert.equal(servers.deps.taskRepository, deps.taskRepository);
  assert.equal(servers.deps.campaignRepository, deps.campaignRepository);
});

test("REQ-T1-DEMO-010 production internal module is wired with the shared taskRepository", () => {
  const deps = createRuntimeDependencies();
  const servers = createProductionServers({
    deps,
    ingestToken: "a".repeat(64)
  });
  // The internal module must have the same campaignRepository reference.
  assert.equal(
    servers.internalAppModule.campaignRepository,
    deps.campaignRepository
  );
});

test("REQ-T1-DEMO-010 production servers can be started and closed", async () => {
  const servers = createProductionServers({
    ingestToken: "a".repeat(64)
  });
  const publicHandle = await startServer(servers.publicServer);
  const internalHandle = await startServer(servers.internalServer);
  await publicHandle.close();
  await internalHandle.close();
});
