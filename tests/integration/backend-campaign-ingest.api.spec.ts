import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  makeCampaignStartEnvelope,
  FIXED_CAMPAIGN_ID
} from "../../backend/tests/fixtures/track1-campaign.fixture.ts";

const mainModulePath = resolve(import.meta.dirname, "../../backend/src/main.ts");
const internalModulePath = resolve(
  import.meta.dirname,
  "../../backend/src/internal-app.module.ts"
);
const runtimeDepsPath = resolve(
  import.meta.dirname,
  "../../backend/src/runtime-dependencies.ts"
);

type RuntimeDeps = {
  taskRepository: unknown;
  campaignRepository: {
    list: () => unknown[];
  };
};

type AppModule = {
  taskCenterModule: { repository: unknown };
  supervisionModule: { campaignRepository: unknown };
};

type InternalAppModule = {
  campaignRepository: { list: () => unknown[] };
  handle: (req: unknown, res: unknown) => Promise<void>;
};

type MainModule = {
  createAppModule?: (deps?: RuntimeDeps) => AppModule;
  createAppServer?: (appModule?: AppModule) => {
    listen: (port: number, host: string, cb: () => void) => void;
    close: (cb: (err?: Error) => void) => void;
    address: () => { port: number } | string | null;
  };
  createInternalAppServer?: (internalAppModule: InternalAppModule) => {
    listen: (port: number, host: string, cb: () => void) => void;
    close: (cb: (err?: Error) => void) => void;
    address: () => { port: number } | string | null;
  };
};

type InternalModuleExports = {
  InternalAppModule?: new (input: {
    campaignRepository: { list: () => unknown[] };
    ingestToken: string;
    taskRepository?: unknown;
  }) => InternalAppModule;
};

type RuntimeDepsModule = {
  createRuntimeDependencies?: () => RuntimeDeps;
};

async function importIfExists<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  return import(pathToFileURL(filePath).href) as Promise<T>;
}

const INGEST_TOKEN = "a".repeat(32);

type ServerHandle = {
  baseUrl: string;
  close: () => Promise<void>;
};

async function startServer(server: {
  listen: (port: number, host: string, cb: () => void) => void;
  close: (cb: (err?: Error) => void) => void;
  address: () => { port: number } | string | null;
}): Promise<ServerHandle> {
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

type DualHarness = {
  publicUrl: string;
  internalUrl: string;
  campaignRepository: { list: () => unknown[] };
  taskRepository: { list: () => unknown[] };
  close: () => Promise<void>;
};

async function startDualServerHarness(): Promise<DualHarness> {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  const internalModule = await importIfExists<InternalModuleExports>(
    internalModulePath
  );
  const runtimeModule = await importIfExists<RuntimeDepsModule>(runtimeDepsPath);

  assert.ok(mainModule?.createAppModule, "createAppModule must exist");
  assert.ok(mainModule?.createAppServer, "createAppServer must exist");
  assert.ok(mainModule?.createInternalAppServer, "createInternalAppServer must exist");
  assert.ok(internalModule?.InternalAppModule, "InternalAppModule must exist");
  assert.ok(runtimeModule?.createRuntimeDependencies, "createRuntimeDependencies must exist");

  const deps = runtimeModule!.createRuntimeDependencies!();
  const appModule = mainModule!.createAppModule!(deps);
  const internalAppModule = new internalModule!.InternalAppModule!({
    campaignRepository: deps.campaignRepository as { list: () => unknown[] },
    ingestToken: INGEST_TOKEN,
    taskRepository: deps.taskRepository
  });

  const publicServer = mainModule!.createAppServer!(appModule);
  const internalServer = mainModule!.createInternalAppServer!(internalAppModule);
  const publicHandle = await startServer(publicServer);
  const internalHandle = await startServer(internalServer);

  return {
    publicUrl: publicHandle.baseUrl,
    internalUrl: internalHandle.baseUrl,
    campaignRepository: deps.campaignRepository as { list: () => unknown[] },
    taskRepository: deps.taskRepository as { list: () => unknown[] },
    close: async () => {
      await publicHandle.close();
      await internalHandle.close();
    }
  };
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown; text: string }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed, text };
}

// -- Public listener cannot reach internal ingest ----------------------------

test("REQ-T1-DEMO-010 public listener returns 404 for internal ingest path", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const result = await postJson(
    harness.publicUrl,
    "/internal/track1/campaigns",
    makeCampaignStartEnvelope()
  );
  assert.equal(result.status, 404);
  assert.equal(harness.campaignRepository.list().length, 0);
});

// -- Internal listener rejects unauthorized start ----------------------------

test("REQ-T1-DEMO-010 internal listener rejects unauthorized start without mutation", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const result = await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    makeCampaignStartEnvelope()
  );
  assert.equal(result.status, 401);
  assert.equal(harness.campaignRepository.list().length, 0);
});

// -- Internal listener accepts authorized start ------------------------------

test("REQ-T1-DEMO-010 internal listener accepts an authorized start", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const result = await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    makeCampaignStartEnvelope(),
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );
  assert.equal(result.status, 201);
  assert.equal(harness.campaignRepository.list().length, 1);
});

// -- Oversized snapshot body rejected ----------------------------------------

test("REQ-T1-DEMO-010 internal listener rejects snapshot body over 2 MiB", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  // First start a campaign so the snapshot route is reachable.
  await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    makeCampaignStartEnvelope(),
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );

  const oversizedBody = "x".repeat(2 * 1024 * 1024 + 1);
  const result = await postJson(
    harness.internalUrl,
    `/internal/track1/campaigns/${FIXED_CAMPAIGN_ID}/snapshots`,
    oversizedBody,
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );
  assert.equal(result.status, 413);
  const body = result.body as { error_code?: string };
  assert.equal(body.error_code, "CAMPAIGN_INGEST_BODY_TOO_LARGE");
});

// -- Oversized lifecycle body rejected ---------------------------------------

test("REQ-T1-DEMO-010 internal listener rejects lifecycle body over 256 KiB", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const oversizedBody = "x".repeat(256 * 1024 + 1);
  const result = await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    oversizedBody,
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );
  assert.equal(result.status, 413);
  const body = result.body as { error_code?: string };
  assert.equal(body.error_code, "CAMPAIGN_INGEST_BODY_TOO_LARGE");
});

// -- Malformed JSON rejected -------------------------------------------------

test("REQ-T1-DEMO-010 internal listener rejects malformed JSON body", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const result = await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    "{not valid json",
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );
  assert.equal(result.status, 400);
  assert.equal(harness.campaignRepository.list().length, 0);
});

// -- Wrong content type rejected ---------------------------------------------

test("REQ-T1-DEMO-010 internal listener rejects wrong content type", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const response = await fetch(
    `${harness.internalUrl}/internal/track1/campaigns`,
    {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        authorization: `Bearer ${INGEST_TOKEN}`
      },
      body: "plain text body"
    }
  );
  assert.equal(response.status, 415);
  assert.equal(harness.campaignRepository.list().length, 0);
});

// R5 (Phase 2 rework finding 8): Content-Type must be parsed strictly by
// splitting on ";" and comparing the media type exactly. The previous
// includes("application/json") logic accepted substring matches like
// "text/application/json-evil", which is not a valid JSON media type.
test("REQ-T1-DEMO-010 internal listener rejects content-type substring bypass", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const response = await fetch(
    `${harness.internalUrl}/internal/track1/campaigns`,
    {
      method: "POST",
      headers: {
        "content-type": "text/application/json-evil",
        authorization: `Bearer ${INGEST_TOKEN}`
      },
      body: JSON.stringify(makeCampaignStartEnvelope())
    }
  );
  assert.equal(response.status, 415);
  assert.equal(harness.campaignRepository.list().length, 0);
});

// -- Unknown internal route rejected -----------------------------------------

test("REQ-T1-DEMO-010 internal listener rejects unknown internal route", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const result = await postJson(
    harness.internalUrl,
    "/internal/track1/unknown",
    {},
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );
  assert.equal(result.status, 404);
});

// -- Error bodies never echo input -------------------------------------------

test("REQ-T1-DEMO-010 error bodies never echo input content", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const sentinel = "INPUT_SENTINEL_VALUE_1234567890";
  const result = await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    { sentinel },
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );
  assert.equal(result.status, 400);
  assert.equal(result.text.includes(sentinel), false);
});

// -- Internal health endpoint ------------------------------------------------

test("REQ-T1-DEMO-010 internal listener exposes a health endpoint", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const response = await fetch(`${harness.internalUrl}/internal/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal((body as { success: boolean }).success, true);
});

// R6 (Phase 2 rework finding 6): auth must precede body read, and the route
// campaignId must match body campaign_id. The previous code read the body
// before checking auth, so an unauthenticated request with malformed JSON
// returned 400 instead of 401. It also ignored route.params.campaignId,
// allowing an authorized client to write to a different campaign by using
// a different path campaignId.

test("REQ-T1-DEMO-010 unauthenticated malformed JSON returns 401 not 400", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  const response = await fetch(
    `${harness.internalUrl}/internal/track1/campaigns`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json"
    }
  );
  assert.equal(response.status, 401);
  assert.equal(harness.campaignRepository.list().length, 0);
});

test("REQ-T1-DEMO-010 snapshot path campaignId must match body campaign_id", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  // Start a campaign first.
  await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    makeCampaignStartEnvelope(),
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );

  // Build a valid snapshot for the started campaign.
  const { makeCampaignSnapshot } = await import(
    "../../backend/tests/fixtures/track1-campaign.fixture.ts"
  );
  const snapshot = makeCampaignSnapshot(1, null);

  // Send it to a DIFFERENT campaign path. The body campaign_id is
  // FIXED_CAMPAIGN_ID, but the path uses a different campaign ID.
  const differentCampaignId = "campaign:t1:fedcba9876543210fedcba9876543210";
  const response = await fetch(
    `${harness.internalUrl}/internal/track1/campaigns/${differentCampaignId}/snapshots`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${INGEST_TOKEN}`
      },
      body: JSON.stringify(snapshot)
    }
  );
  assert.equal(response.status, 400);
  const body = await response.json() as { error_code?: string };
  assert.equal(body.error_code, "CAMPAIGN_PATH_BODY_MISMATCH");
});

test("REQ-T1-DEMO-010 internal campaign routes accept one encoded campaign id segment", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    makeCampaignStartEnvelope(),
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );
  const { makeCampaignSnapshot } = await import(
    "../../backend/tests/fixtures/track1-campaign.fixture.ts"
  );
  const snapshot = makeCampaignSnapshot(1, null);
  const response = await fetch(
    `${harness.internalUrl}/internal/track1/campaigns/${encodeURIComponent(FIXED_CAMPAIGN_ID)}/snapshots`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${INGEST_TOKEN}`
      },
      body: JSON.stringify(snapshot)
    }
  );

  assert.equal(response.status, 200);
});

// R7 (Phase 2 rework finding 3): after ingesting a snapshot via the internal
// API, the session must be queryable via the public supervision session API.
test("REQ-T1-DEMO-010 ingested session is queryable via public supervision API", async (t) => {
  const harness = await startDualServerHarness();
  t.after(() => harness.close());

  await postJson(
    harness.internalUrl,
    "/internal/track1/campaigns",
    makeCampaignStartEnvelope(),
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );

  const { makeCampaignSnapshot } = await import(
    "../../backend/tests/fixtures/track1-campaign.fixture.ts"
  );
  const snapshot = makeCampaignSnapshot(1, null);
  await postJson(
    harness.internalUrl,
    `/internal/track1/campaigns/${FIXED_CAMPAIGN_ID}/snapshots`,
    snapshot,
    { authorization: `Bearer ${INGEST_TOKEN}` }
  );

  // TaskRepository must now have a record.
  assert.equal(harness.taskRepository.list().length, 1);

  // The session must be queryable via the public supervision API.
  const sessionId = (snapshot.result.details as { session_id: string }).session_id;
  const sessionResponse = await fetch(
    `${harness.publicUrl}/api/supervision/sessions/${encodeURIComponent(sessionId)}`
  );
  assert.equal(sessionResponse.status, 200);
  const sessionBody = await sessionResponse.json() as {
    data?: {
      summary?: { session_id?: string; task_id?: string };
    };
  };
  assert.equal(sessionBody.data?.summary?.session_id, sessionId);
  assert.equal(sessionBody.data?.summary?.task_id, snapshot.result.task_id);
});
