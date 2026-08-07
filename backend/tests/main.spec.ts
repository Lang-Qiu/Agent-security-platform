import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createProductionServers, startProductionServers, startServer } from "../src/main.ts";
import { createRuntimeDependencies } from "../src/runtime-dependencies.ts";
import type { SandboxSecurityModule } from "../src/modules/sandbox-security/sandbox-security.module.ts";

function createStructuralSandboxSecurityModule(): SandboxSecurityModule {
  return {
    publicController: {
      async evaluate() { return { statusCode: 200, body: {} }; },
      async listAuditEvents() { return { statusCode: 200, body: {} }; }
    },
    adminController: {
      async issue() { return { statusCode: 201, body: {} }; },
      async revoke() { return { statusCode: 200, body: {} }; },
      async purge() { return { statusCode: 200, body: {} }; }
    },
    enforcementAuditController: {
      async enforcementAudit() { return { statusCode: 201, body: {} }; }
    },
    async close() {}
  } as SandboxSecurityModule;
}

function createInjectedProductionServerInput() {
  return {
    deps: createRuntimeDependencies(),
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: createStructuralSandboxSecurityModule()
  } as const;
}

const ZERO_ARGUMENT_HMAC_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "ascii"
).toString("base64url");
const ZERO_ARGUMENT_ADMIN_TOKEN = Buffer.from(
  "fedcba9876543210fedcba9876543210",
  "ascii"
).toString("base64url");

async function withZeroArgumentProductionEnvironment<T>(
  callback: () => Promise<T>
): Promise<T> {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-zero-argument-"));
  const values: Record<string, string> = {
    SANDBOX_SECURITY_STORAGE_PATH: join(parent, "sandbox-security.sqlite"),
    SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY: ZERO_ARGUMENT_HMAC_KEY,
    SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN: ZERO_ARGUMENT_ADMIN_TOKEN,
    SANDBOX_SECURITY_PRODUCTION_MODE: "rule_only",
    PORT: "0",
    INTERNAL_PORT: "0",
    PUBLIC_BIND_HOST: "127.0.0.1",
    INTERNAL_BIND_HOST: "127.0.0.1",
    TRACK1_INGEST_TOKEN: "a".repeat(64)
  };
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(parent, { recursive: true, force: true });
  }
}

// R8 (Phase 2 rework finding 1): the production entrypoint must start both
// the public server (port 3000) and the internal campaign ingest server
// (port 3001) with shared dependencies. Previously main.ts only started the
// public server; the internal server, ingest token, and shared deps were
// only assembled manually in the test harness, so real deployments could
// not accept campaign snapshots.

test("REQ-T1-DEMO-010 createProductionServers creates both public and internal servers", () => {
  const servers = createProductionServers(createInjectedProductionServerInput());
  assert.ok(servers.publicServer, "publicServer must be provided");
  assert.ok(servers.internalServer, "internalServer must be provided");
  assert.notStrictEqual(servers.publicServer, servers.internalServer);
});

test("REQ-T1-DEMO-010 production servers share the same task and campaign repositories", () => {
  const deps = createRuntimeDependencies();
  const servers = createProductionServers({
    deps,
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: createStructuralSandboxSecurityModule()
  });
  assert.equal(servers.deps.taskRepository, deps.taskRepository);
  assert.equal(servers.deps.campaignRepository, deps.campaignRepository);
});

test("REQ-T1-DEMO-010 production internal module is wired with the shared taskRepository", () => {
  const deps = createRuntimeDependencies();
  const servers = createProductionServers({
    deps,
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: createStructuralSandboxSecurityModule()
  });
  // The internal module must have the same campaignRepository reference.
  assert.equal(
    servers.internalAppModule.campaignRepository,
    deps.campaignRepository
  );
});

test("REQ-T1-DEMO-010 production servers can be started and closed", async () => {
  const servers = createProductionServers({
    ...createInjectedProductionServerInput()
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

test("REQ-SBX-GENERAL-003 createProductionServers uses only explicitly injected dependencies", () => {
  const token = "t".repeat(64);
  const servers = createProductionServers({
    deps: createRuntimeDependencies(),
    ingestToken: token,
    sandboxSecurityModule: createStructuralSandboxSecurityModule()
  });
  assert.equal(servers.internalAppModule.ingestToken, token);
});

test("REQ-SBX-GENERAL-003 createProductionServers rejects implicit composition", () => {
  assert.throws(
    () => createProductionServers(undefined as never),
    TypeError
  );
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
      ingestToken: "a".repeat(64),
      sandboxSecurityModule: createStructuralSandboxSecurityModule()
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
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: createStructuralSandboxSecurityModule()
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
  await withZeroArgumentProductionEnvironment(async () => {
    const handles = await startProductionServers();
    try {
      assert.ok(handles.publicServer, "public server must be listening");
      assert.ok(handles.internalServer, "internal server must be listening");
    } finally {
      await handles.close();
    }
  });
});

test("REQ-T1-DEMO-010 startProductionServers accepts zero-argument call shape", async () => {
  // The real entrypoint at the bottom of main.ts calls startProductionServers()
  // with no arguments at all. Simulate that exact call shape by passing
  // nothing — the function must treat undefined options as an empty object.
  const { startProductionServers } = await import("../src/main.ts");
  // Use apply with no arguments to simulate the zero-argument call exactly.
  // We need ingestToken from env for the internal module to construct.
  await withZeroArgumentProductionEnvironment(async () => {
    const handles = await startProductionServers.call(null);
    try {
      assert.ok(handles.publicServer, "public server must be listening");
      assert.ok(handles.internalServer, "internal server must be listening");
    } finally {
      await handles.close();
    }
  });
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
        ingestToken: "a".repeat(64),
        sandboxSecurityModule: createStructuralSandboxSecurityModule()
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

test("REQ-SBX-GENERAL-003 production startup validates configuration before either listener binds", async () => {
  const publicProbe = createServer();
  await new Promise<void>((resolve) => publicProbe.listen(0, "127.0.0.1", resolve));
  const publicPort = (publicProbe.address() as { port: number }).port;
  await new Promise<void>((resolve) => publicProbe.close(() => resolve()));

  const internalProbe = createServer();
  await new Promise<void>((resolve) => internalProbe.listen(0, "127.0.0.1", resolve));
  const internalPort = (internalProbe.address() as { port: number }).port;
  await new Promise<void>((resolve) => internalProbe.close(() => resolve()));

  await assert.rejects(
    () => startProductionServers({
      publicPort,
      internalPort,
      publicBindHost: "127.0.0.1",
      internalBindHost: "127.0.0.1",
      environment: {}
    } as never),
    /SANDBOX_SECURITY_CONFIGURATION_INVALID/
  );

  const canConnect = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
  assert.equal(await canConnect(publicPort), false);
  assert.equal(await canConnect(internalPort), false);
});

test("REQ-SBX-GENERAL-003 local mode prerequisite failure occurs before listener bind", async () => {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-local-prereq-"));
  const environment = {
    SANDBOX_SECURITY_STORAGE_PATH: join(parent, "sandbox-security.sqlite"),
    SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY: Buffer.from(
      "0123456789abcdef0123456789abcdef",
      "ascii"
    ).toString("base64url"),
    SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN: Buffer.from(
      "0123456789abcdef0123456789abcdef",
      "ascii"
    ).toString("base64url"),
    SANDBOX_SECURITY_PRODUCTION_MODE: "local"
  } as const;
  try {
    await assert.rejects(
      () => startProductionServers({
        publicPort: 0,
        internalPort: 0,
        ingestToken: "a".repeat(64),
        environment
      }),
      /SANDBOX_SECURITY_CONFIGURATION_INVALID/
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-003 composition failure closes an injected module", async () => {
  const calls: string[] = [];
  const module = createStructuralSandboxSecurityModule();
  const originalClose = module.close;
  module.close = async () => {
    calls.push("module-close");
    await originalClose();
  };
  await assert.rejects(
    () => startProductionServers({
      publicPort: 0,
      internalPort: 0,
      ingestToken: "",
      sandboxSecurityModule: module
    }),
    /Campaign ingest token/
  );
  assert.deepEqual(calls, ["module-close"]);
});

test("REQ-SBX-GENERAL-003 close aggregates module errors after both listeners drain", async () => {
  const module = createStructuralSandboxSecurityModule();
  let closeCalls = 0;
  module.close = async () => {
    closeCalls += 1;
    throw new Error("injected module close failure");
  };
  const handles = await startProductionServers({
    publicPort: 0,
    internalPort: 0,
    publicBindHost: "127.0.0.1",
    internalBindHost: "127.0.0.1",
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: module
  });
  await assert.rejects(
    () => handles.close(),
    (error: unknown) => error instanceof AggregateError
  );
  assert.equal(handles.publicServer.listening, false);
  assert.equal(handles.internalServer.listening, false);
  assert.equal(closeCalls, 1);
});
