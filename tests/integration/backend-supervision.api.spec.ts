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

const mainModulePath = resolve(import.meta.dirname, "../../backend/src/main.ts");
const sharedEntrypointPath = resolve(import.meta.dirname, "../../shared/index.ts");

type AppModule = {
  taskCenterModule: {
    repository: {
      save: (record: unknown) => void;
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
