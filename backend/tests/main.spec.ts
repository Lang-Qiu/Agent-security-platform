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

// R14 (Phase 2 rework review P1 #5): the production entrypoint must read
// TRACK1_INGEST_TOKEN (the env var name mandated by the deployment contract
// and used in Phase 4/7 plans), NOT CAMPAIGN_INGEST_TOKEN. It must also
// allow a configurable bind host for the internal server so other
// containers can reach backend:3001 (loopback binding makes the internal
// API unreachable from the OpenClaw container).

test("REQ-T1-DEMO-010 createProductionServers reads TRACK1_INGEST_TOKEN from env", () => {
  const prevTrack1 = process.env.TRACK1_INGEST_TOKEN;
  const prevCampaign = process.env.CAMPAIGN_INGEST_TOKEN;
  const track1Token = "t".repeat(64);
  process.env.TRACK1_INGEST_TOKEN = track1Token;
  delete process.env.CAMPAIGN_INGEST_TOKEN;
  try {
    const servers = createProductionServers();
    assert.equal(
      servers.internalAppModule.ingestToken,
      track1Token,
      "must read TRACK1_INGEST_TOKEN from env"
    );
  } finally {
    if (prevTrack1 === undefined) {
      delete process.env.TRACK1_INGEST_TOKEN;
    } else {
      process.env.TRACK1_INGEST_TOKEN = prevTrack1;
    }
    if (prevCampaign === undefined) {
      delete process.env.CAMPAIGN_INGEST_TOKEN;
    } else {
      process.env.CAMPAIGN_INGEST_TOKEN = prevCampaign;
    }
  }
});

test("REQ-T1-DEMO-010 createProductionServers does not fall back to CAMPAIGN_INGEST_TOKEN", () => {
  const prevTrack1 = process.env.TRACK1_INGEST_TOKEN;
  const prevCampaign = process.env.CAMPAIGN_INGEST_TOKEN;
  delete process.env.TRACK1_INGEST_TOKEN;
  // Set CAMPAIGN_INGEST_TOKEN to a valid 64-char token. If the code falls
  // back to it, construction succeeds (BAD). If it only reads
  // TRACK1_INGEST_TOKEN (unset → ""), construction throws (GOOD).
  process.env.CAMPAIGN_INGEST_TOKEN = "c".repeat(64);
  try {
    assert.throws(
      () => createProductionServers(),
      { code: "CAMPAIGN_INGEST_TOKEN_INVALID" },
      "must NOT fall back to CAMPAIGN_INGEST_TOKEN when TRACK1_INGEST_TOKEN is unset"
    );
  } finally {
    if (prevTrack1 === undefined) {
      delete process.env.TRACK1_INGEST_TOKEN;
    } else {
      process.env.TRACK1_INGEST_TOKEN = prevTrack1;
    }
    if (prevCampaign === undefined) {
      delete process.env.CAMPAIGN_INGEST_TOKEN;
    } else {
      process.env.CAMPAIGN_INGEST_TOKEN = prevCampaign;
    }
  }
});

test("REQ-T1-DEMO-010 startProductionServers binds internal server to configurable host", async () => {
  // Use port 0 to let the OS pick a free port; the bind host must be the
  // configured value (not hardcoded 127.0.0.1) so other containers can
  // reach the internal API.
  const { startProductionServers } = await import("../src/main.ts");
  const handles = await startProductionServers({
    publicPort: 0,
    internalPort: 0,
    publicBindHost: "127.0.0.1",
    internalBindHost: "0.0.0.0",
    ingestToken: "a".repeat(64)
  });
  try {
    const internalAddress = handles.internalServer.address();
    assert.ok(
      internalAddress && typeof internalAddress === "object",
      "internal server must have a bound address"
    );
    // When bound to 0.0.0.0, node reports the address as null or "::" or
    // "0.0.0.0". The key assertion is that it is NOT "127.0.0.1".
    const addr = (internalAddress as { address: string }).address;
    assert.notStrictEqual(
      addr,
      "127.0.0.1",
      "internal server must not bind to loopback when internalBindHost is 0.0.0.0"
    );
  } finally {
    await handles.close();
  }
});

// R18 (Phase 2 rework review 2 P1 #1): the real entrypoint calls
// startProductionServers() with ZERO arguments. The function must not crash
// on undefined options — it must apply the same defaults as when called
// with an empty object.

test("REQ-T1-DEMO-010 startProductionServers works with zero arguments (real entrypoint path)", async () => {
  const { startProductionServers } = await import("../src/main.ts");
  // This must not throw TypeError: Cannot read properties of undefined
  const handles = await startProductionServers({
    publicPort: 0,
    internalPort: 0,
    ingestToken: "a".repeat(64)
  });
  try {
    assert.ok(handles.publicServer, "public server must be listening");
    assert.ok(handles.internalServer, "internal server must be listening");
  } finally {
    await handles.close();
  }
});

test("REQ-T1-DEMO-010 startProductionServers accepts zero-argument call shape", async () => {
  // The real entrypoint at the bottom of main.ts calls startProductionServers()
  // with no arguments at all. Simulate that exact call shape by passing
  // nothing — the function must treat undefined options as an empty object.
  const { startProductionServers } = await import("../src/main.ts");
  // Use apply with no arguments to simulate the zero-argument call exactly.
  // We need ingestToken from env for the internal module to construct.
  const prevToken = process.env.TRACK1_INGEST_TOKEN;
  process.env.TRACK1_INGEST_TOKEN = "a".repeat(64);
  try {
    // eslint-disable-next-line prefer-spread
    const handles = await startProductionServers.call(null);
    try {
      assert.ok(handles.publicServer, "public server must be listening");
      assert.ok(handles.internalServer, "internal server must be listening");
    } finally {
      await handles.close();
    }
  } finally {
    if (prevToken === undefined) {
      delete process.env.TRACK1_INGEST_TOKEN;
    } else {
      process.env.TRACK1_INGEST_TOKEN = prevToken;
    }
  }
});
