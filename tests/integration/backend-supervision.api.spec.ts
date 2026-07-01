import assert from "node:assert/strict";
import type { Server } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  makeStoredSandboxRecord,
  RAW_NARRATIVE_SENTINEL
} from "../fixtures/track1-supervision.fixture.ts";
import {
  makeCompletedCampaignRecord,
  makeCampaignEvidenceRegistration,
  FIXED_CAMPAIGN_ID
} from "../../backend/tests/fixtures/track1-campaign.fixture.ts";

const mainModulePath = resolve(import.meta.dirname, "../../backend/src/main.ts");
const sharedEntrypointPath = resolve(import.meta.dirname, "../../shared/index.ts");

type AppModule = {
  taskCenterModule: {
    repository: {
      save: (record: unknown) => void;
    };
  };
  supervisionModule: {
    campaignRepository: {
      create: (record: unknown) => unknown;
    };
  };
};

type MainModule = {
  createAppModule?: () => AppModule;
  createAppServer?: (appModule?: AppModule) => Server;
};

type SharedModule = {
  normalizeSandboxSupervisionOverview?: (value: unknown) => unknown;
  normalizeSandboxSupervisionSessionDetail?: (value: unknown) => unknown;
  normalizeSandboxSupervisionEvidenceExport?: (value: unknown) => unknown;
  normalizeTrack1CampaignDetail?: (value: unknown) => unknown;
  normalizeTrack1CampaignEvidenceExport?: (value: unknown) => unknown;
  normalizeTrack1CampaignSummary?: (value: unknown) => unknown;
  isApiResponse?: (value: unknown) => boolean;
};

async function importIfExists<TModule>(filePath: string): Promise<TModule | null> {
  if (!existsSync(filePath)) {
    return null;
  }
  return import(pathToFileURL(filePath).href) as Promise<TModule>;
}

async function startServer(server: Server): Promise<{ baseUrl: string; close: () => Promise<void> }> {
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

async function getJson(baseUrl: string, path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
}

// -- List, detail, evidence GET routes ----------------------------------------

test("REQ-T1-SUPERVISION-UI-009 exposes list detail and evidence GET routes", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  const sharedModule = await importIfExists<SharedModule>(sharedEntrypointPath);

  assert.notEqual(mainModule?.createAppModule, undefined);
  assert.notEqual(mainModule?.createAppServer, undefined);
  assert.notEqual(sharedModule, null);

  if (!mainModule?.createAppModule || !mainModule?.createAppServer || !sharedModule) {
    return;
  }

  const app = mainModule.createAppModule();
  app.taskCenterModule.repository.save(
    makeStoredSandboxRecord({ sessionId: "session:api:001", taskId: "task:api:001" })
  );
  const server = mainModule.createAppServer(app);
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const encodedSessionId = encodeURIComponent("session:api:001");

  const listResult = await getJson(baseUrl, "/api/supervision/sessions");
  const detailResult = await getJson(
    baseUrl,
    `/api/supervision/sessions/${encodedSessionId}`
  );
  const evidenceResult = await getJson(
    baseUrl,
    `/api/supervision/sessions/${encodedSessionId}/evidence`
  );

  assert.equal(listResult.status, 200);
  assert.equal(detailResult.status, 200);
  assert.equal(evidenceResult.status, 200);

  const listBody = listResult.body as { success: boolean; request_id: string; data: unknown };
  const detailBody = detailResult.body as { success: boolean; request_id: string; data: unknown };
  const evidenceBody = evidenceResult.body as { success: boolean; request_id: string; data: unknown };

  assert.equal(listBody.success, true);
  assert.equal(detailBody.success, true);
  assert.equal(evidenceBody.success, true);
  assert.equal(typeof listBody.request_id, "string");
  assert.equal(typeof detailBody.request_id, "string");
  assert.equal(typeof evidenceBody.request_id, "string");

  assert.notEqual(
    sharedModule.normalizeSandboxSupervisionOverview?.(listBody.data),
    null
  );
  assert.notEqual(
    sharedModule.normalizeSandboxSupervisionSessionDetail?.(detailBody.data),
    null
  );
  assert.notEqual(
    sharedModule.normalizeSandboxSupervisionEvidenceExport?.(evidenceBody.data),
    null
  );
});

// -- Invalid query rejection --------------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 rejects invalid queries safely", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppServer) return;

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const result = await getJson(baseUrl, "/api/supervision/sessions?unknown=value");
  const body = result.body as {
    success: boolean;
    error_code: string;
    request_id: string;
  };

  assert.equal(result.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error_code, "INVALID_SUPERVISION_QUERY");
  assert.equal(typeof body.request_id, "string");
  assert.equal(JSON.stringify(body).includes("stack"), false);
});

// -- Query parameters reach the service ---------------------------------------

test("REQ-T1-SUPERVISION-UI-009 query parameters reach the service", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppModule);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppModule || !mainModule?.createAppServer) return;

  const app = mainModule.createAppModule();
  app.taskCenterModule.repository.save(
    makeStoredSandboxRecord({
      sessionId: "session:filter:running",
      taskId: "task:filter:running",
      status: "running",
      action: "allow"
    })
  );
  app.taskCenterModule.repository.save(
    makeStoredSandboxRecord({
      sessionId: "session:filter:blocked",
      taskId: "task:filter:blocked",
      status: "blocked",
      action: "deny"
    })
  );

  const server = mainModule.createAppServer(app);
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const runningResult = await getJson(baseUrl, "/api/supervision/sessions?status=running");
  const blockedResult = await getJson(baseUrl, "/api/supervision/sessions?status=blocked");

  assert.equal(runningResult.status, 200);
  assert.equal(blockedResult.status, 200);

  const runningBody = runningResult.body as {
    data: { sessions: Array<{ session_id: string }> };
  };
  const blockedBody = blockedResult.body as {
    data: { sessions: Array<{ session_id: string }> };
  };

  assert.equal(runningBody.data.sessions.length, 1);
  assert.equal(runningBody.data.sessions[0].session_id, "session:filter:running");
  assert.equal(blockedBody.data.sessions.length, 1);
  assert.equal(blockedBody.data.sessions[0].session_id, "session:filter:blocked");
});

// -- Malformed encoded session ID returns 400 ---------------------------------

test("REQ-T1-SUPERVISION-UI-009 malformed encoded session ID returns 400", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppServer) return;

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const result = await getJson(baseUrl, "/api/supervision/sessions/%E0%A4%A");
  const body = result.body as { error_code: string };

  assert.equal(result.status, 400);
  assert.equal(body.error_code, "INVALID_SUPERVISION_QUERY");
});

// -- Unknown session returns 404 ----------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 unknown session returns 404", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppServer) return;

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const result = await getJson(baseUrl, "/api/supervision/sessions/session:unknown");
  const body = result.body as { error_code: string };

  assert.equal(result.status, 404);
  assert.equal(body.error_code, "SUPERVISION_SESSION_NOT_FOUND");
});

// -- Duplicate session returns 409 --------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 duplicate session returns 409", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppModule);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppModule || !mainModule?.createAppServer) return;

  const app = mainModule.createAppModule();
  app.taskCenterModule.repository.save(
    makeStoredSandboxRecord({
      sessionId: "session:dup:001",
      taskId: "task:dup:a"
    })
  );
  app.taskCenterModule.repository.save(
    makeStoredSandboxRecord({
      sessionId: "session:dup:001",
      taskId: "task:dup:b"
    })
  );

  const server = mainModule.createAppServer(app);
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const encodedSessionId = encodeURIComponent("session:dup:001");
  const detailResult = await getJson(
    baseUrl,
    `/api/supervision/sessions/${encodedSessionId}`
  );
  const evidenceResult = await getJson(
    baseUrl,
    `/api/supervision/sessions/${encodedSessionId}/evidence`
  );

  assert.equal(detailResult.status, 409);
  assert.equal(
    (detailResult.body as { error_code: string }).error_code,
    "SUPERVISION_SESSION_AMBIGUOUS"
  );
  assert.equal(evidenceResult.status, 409);
  assert.equal(
    (evidenceResult.body as { error_code: string }).error_code,
    "SUPERVISION_SESSION_AMBIGUOUS"
  );
});

// -- Incomplete evidence returns 409 ------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 incomplete evidence returns 409", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppModule);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppModule || !mainModule?.createAppServer) return;

  const app = mainModule.createAppModule();
  app.taskCenterModule.repository.save(
    makeStoredSandboxRecord({
      sessionId: "session:running:001",
      taskId: "task:running:001",
      status: "running",
      action: "allow"
    })
  );

  const server = mainModule.createAppServer(app);
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const encodedSessionId = encodeURIComponent("session:running:001");
  const detailResult = await getJson(
    baseUrl,
    `/api/supervision/sessions/${encodedSessionId}`
  );
  const evidenceResult = await getJson(
    baseUrl,
    `/api/supervision/sessions/${encodedSessionId}/evidence`
  );

  assert.equal(detailResult.status, 200);
  assert.equal(evidenceResult.status, 409);
  assert.equal(
    (evidenceResult.body as { error_code: string }).error_code,
    "SUPERVISION_EVIDENCE_NOT_AVAILABLE"
  );
});

// -- Response JSON excludes raw narrative sentinel ----------------------------

test("REQ-T1-SUPERVISION-UI-009 response JSON excludes raw narrative sentinel", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppModule);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppModule || !mainModule?.createAppServer) return;

  const app = mainModule.createAppModule();
  app.taskCenterModule.repository.save(
    makeStoredSandboxRecord({
      sessionId: "session:sentinel:001",
      taskId: "task:sentinel:001",
      producerNarrative: RAW_NARRATIVE_SENTINEL
    })
  );

  const server = mainModule.createAppServer(app);
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const encodedSessionId = encodeURIComponent("session:sentinel:001");
  const listResult = await getJson(baseUrl, "/api/supervision/sessions");
  const detailResult = await getJson(
    baseUrl,
    `/api/supervision/sessions/${encodedSessionId}`
  );
  const evidenceResult = await getJson(
    baseUrl,
    `/api/supervision/sessions/${encodedSessionId}/evidence`
  );

  assert.equal(listResult.status, 200);
  assert.equal(detailResult.status, 200);
  assert.equal(evidenceResult.status, 200);

  assert.equal(JSON.stringify(listResult.body).includes(RAW_NARRATIVE_SENTINEL), false);
  assert.equal(JSON.stringify(detailResult.body).includes(RAW_NARRATIVE_SENTINEL), false);
  assert.equal(JSON.stringify(evidenceResult.body).includes(RAW_NARRATIVE_SENTINEL), false);
});

// -- Unsupported POST returns route-not-found behavior ------------------------

test("REQ-T1-SUPERVISION-UI-009 unsupported POST returns route-not-found", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppServer) return;

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const response = await fetch(`${baseUrl}/api/supervision/sessions`, {
    method: "POST"
  });
  assert.equal(response.status, 404);
});

// -- Existing task and health routes remain green ------------------------------

test("REQ-T1-SUPERVISION-UI-009 existing task and health routes remain green", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppServer) return;

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const healthResult = await getJson(baseUrl, "/health");
  const tasksResult = await getJson(baseUrl, "/api/tasks");

  assert.equal(healthResult.status, 200);
  assert.equal(tasksResult.status, 200);
  assert.equal((healthResult.body as { success: boolean }).success, true);
  assert.equal((tasksResult.body as { success: boolean }).success, true);
});

// -- P2-T7: Campaign public read API ------------------------------------------

async function startBackendWithCompletedCampaign(options?: {
  evidence: boolean;
}): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  if (!mainModule?.createAppModule || !mainModule?.createAppServer) {
    throw new Error("Backend module not available");
  }

  const app = mainModule.createAppModule();
  const record = makeCompletedCampaignRecord();
  if (options?.evidence) {
    record.evidence = makeCampaignEvidenceRegistration();
  } else {
    record.evidence = null;
  }
  app.supervisionModule.campaignRepository.create(record);

  const server = mainModule.createAppServer(app);
  const { baseUrl, close } = await startServer(server);
  return { baseUrl, close };
}

test("REQ-T1-DEMO-010 exposes campaign list detail and evidence reads", async (t) => {
  const sharedModule = await importIfExists<SharedModule>(sharedEntrypointPath);
  assert.ok(sharedModule?.normalizeTrack1CampaignDetail);
  assert.ok(sharedModule?.normalizeTrack1CampaignEvidenceExport);

  const { baseUrl, close } = await startBackendWithCompletedCampaign({
    evidence: true
  });
  t.after(close);

  const encodedCampaignId = encodeURIComponent(FIXED_CAMPAIGN_ID);

  const listResult = await getJson(baseUrl, "/api/supervision/campaigns");
  const detailResult = await getJson(
    baseUrl,
    `/api/supervision/campaigns/${encodedCampaignId}`
  );
  const evidenceResult = await getJson(
    baseUrl,
    `/api/supervision/campaigns/${encodedCampaignId}/evidence`
  );

  assert.equal(listResult.status, 200);
  assert.equal(detailResult.status, 200);
  assert.equal(evidenceResult.status, 200);

  const listBody = listResult.body as { success: boolean; data: unknown };
  const detailBody = detailResult.body as { success: boolean; data: unknown };
  const evidenceBody = evidenceResult.body as { success: boolean; data: unknown };

  assert.equal(listBody.success, true);
  assert.equal(detailBody.success, true);
  assert.equal(evidenceBody.success, true);

  assert.ok(Array.isArray(listBody.data));
  assert.notEqual(
    sharedModule.normalizeTrack1CampaignDetail?.(detailBody.data),
    null
  );
  assert.notEqual(
    sharedModule.normalizeTrack1CampaignEvidenceExport?.(evidenceBody.data),
    null
  );
});

test("REQ-T1-DEMO-010 rejects unknown campaign query keys", async (t) => {
  const { baseUrl, close } = await startBackendWithCompletedCampaign({
    evidence: false
  });
  t.after(close);

  const result = await getJson(baseUrl, "/api/supervision/campaigns?raw_prompt=sentinel");
  assert.equal(result.status, 400);
  assert.equal(
    (result.body as { error_code: string }).error_code,
    "INVALID_CAMPAIGN_QUERY"
  );
});

test("REQ-T1-DEMO-010 campaign detail returns 404 for unknown campaign", async (t) => {
  const { baseUrl, close } = await startBackendWithCompletedCampaign({
    evidence: false
  });
  t.after(close);

  const unknownId = encodeURIComponent("campaign:t1:ffffffffffffffffffffffffffffffff");
  const result = await getJson(baseUrl, `/api/supervision/campaigns/${unknownId}`);
  assert.equal(result.status, 404);
  assert.equal(
    (result.body as { error_code: string }).error_code,
    "CAMPAIGN_NOT_FOUND"
  );
});

test("REQ-T1-DEMO-010 campaign evidence returns 409 before registration", async (t) => {
  const { baseUrl, close } = await startBackendWithCompletedCampaign({
    evidence: false
  });
  t.after(close);

  const encodedCampaignId = encodeURIComponent(FIXED_CAMPAIGN_ID);
  const result = await getJson(
    baseUrl,
    `/api/supervision/campaigns/${encodedCampaignId}/evidence`
  );
  assert.equal(result.status, 409);
  assert.equal(
    (result.body as { error_code: string }).error_code,
    "CAMPAIGN_EVIDENCE_NOT_READY"
  );
});

test("REQ-T1-DEMO-010 campaign list filters by status", async (t) => {
  const { baseUrl, close } = await startBackendWithCompletedCampaign({
    evidence: false
  });
  t.after(close);

  const completedResult = await getJson(baseUrl, "/api/supervision/campaigns?status=completed");
  const createdResult = await getJson(baseUrl, "/api/supervision/campaigns?status=created");

  assert.equal(completedResult.status, 200);
  assert.equal(createdResult.status, 200);

  const completedBody = completedResult.body as { data: Array<{ status: string }> };
  const createdBody = createdResult.body as { data: Array<{ status: string }> };

  assert.equal(completedBody.data.length, 1);
  assert.equal(completedBody.data[0].status, "completed");
  assert.equal(createdBody.data.length, 0);
});

test("REQ-T1-DEMO-010 existing session routes remain green alongside campaign routes", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  assert.ok(mainModule?.createAppModule);
  assert.ok(mainModule?.createAppServer);
  if (!mainModule?.createAppModule || !mainModule?.createAppServer) return;

  const app = mainModule.createAppModule();
  app.taskCenterModule.repository.save(
    makeStoredSandboxRecord({ sessionId: "session:compat:001", taskId: "task:compat:001" })
  );
  const server = mainModule.createAppServer(app);
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const sessionList = await getJson(baseUrl, "/api/supervision/sessions");
  assert.equal(sessionList.status, 200);
  assert.equal((sessionList.body as { success: boolean }).success, true);
});
