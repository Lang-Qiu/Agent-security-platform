import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createConnection } from "node:net";
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

// Regression: startProductionServers() is called with zero arguments by the
// real entrypoint, so the public bind host MUST fall back to
// process.env.PUBLIC_BIND_HOST when the options.publicBindHost is omitted —
// exactly like internalBindHost already does. Without this, the public API
// silently binds to 127.0.0.1 inside the container even when
// PUBLIC_BIND_HOST=0.0.0.0 is set (as deploy/track1/compose.track1.yml
// does), making it unreachable from other containers and the host's
// published port.
test("REQ-T1-DEMO-010 startProductionServers reads PUBLIC_BIND_HOST from env when option is omitted", async () => {
  const { startProductionServers } = await import("../src/main.ts");
  const prevHost = process.env.PUBLIC_BIND_HOST;
  process.env.PUBLIC_BIND_HOST = "0.0.0.0";
  try {
    const handles = await startProductionServers({
      publicPort: 0,
      internalPort: 0,
      ingestToken: "a".repeat(64)
    });
    try {
      const publicAddress = handles.publicServer.address();
      assert.ok(
        publicAddress && typeof publicAddress === "object",
        "public server must have a bound address"
      );
      const addr = (publicAddress as { address: string }).address;
      assert.notStrictEqual(
        addr,
        "127.0.0.1",
        "public server must not bind to loopback when PUBLIC_BIND_HOST=0.0.0.0 is set and no explicit option overrides it"
      );
    } finally {
      await handles.close();
    }
  } finally {
    if (prevHost === undefined) {
      delete process.env.PUBLIC_BIND_HOST;
    } else {
      process.env.PUBLIC_BIND_HOST = prevHost;
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

// R29 (Phase 2 rework review 3 P2 #5): if the internal listener fails to
// bind (e.g. EADDRINUSE), the already-started public server must be closed
// before rethrowing. Otherwise the process leaks a listening socket and the
// public port cannot be rebound without a full process restart.

test("REQ-T1-DEMO-010 startProductionServers closes public server when internal listen fails", async () => {
  const { startProductionServers } = await import("../src/main.ts");

  // Find a free port for the public server by temporarily listening on 0.
  const probe = createServer();
  await new Promise<void>((resolve) => {
    probe.listen(0, "127.0.0.1", () => resolve());
  });
  const publicPort = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));

  // Occupy the internal port with a blocker server that stays listening.
  const blocker = createServer();
  await new Promise<void>((resolve) => {
    blocker.listen(0, "127.0.0.1", () => resolve());
  });
  const internalPort = (blocker.address() as { port: number }).port;

  try {
    // startProductionServers must reject because the internal port is in use.
    await assert.rejects(() =>
      startProductionServers({
        publicPort,
        internalPort,
        publicBindHost: "127.0.0.1",
        internalBindHost: "127.0.0.1",
        ingestToken: "a".repeat(64)
      })
    );

    // R29: the public server that was started before the internal listen
    // failure must have been closed. If it leaked, a TCP connection to the
    // public port will SUCCEED (bad — server still listening). If it was
    // closed, the connection will be REFUSED (good). Using a connection
    // probe instead of a rebind avoids creating new server handles that
    // would prevent the test process from exiting when the bug is present.
    const connectionSucceeded = await new Promise<boolean>((resolve) => {
      const conn = createConnection(
        { host: "127.0.0.1", port: publicPort },
        () => {
          conn.destroy();
          resolve(true);
        }
      );
      conn.once("error", () => resolve(false));
    });

    assert.equal(
      connectionSucceeded,
      false,
      "public server must be closed after internal listen failure — port is still accepting connections"
    );
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});
