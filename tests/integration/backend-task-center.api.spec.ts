import assert from "node:assert/strict";
import type { Server } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const mainModulePath = resolve(import.meta.dirname, "../../backend/src/main.ts");

type MainModule = {
  createAppServer?: () => Server;
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

async function createTask(baseUrl: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
  };
}

test("backend health check returns the unified response shell", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.notEqual(mainModule, null, "backend main module should exist before the HTTP health check can be verified");

  if (!mainModule?.createAppServer) {
    return;
  }

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const response = await fetch(`${baseUrl}/health`);
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.deepEqual(body.success, true);
  assert.deepEqual(body.data, { status: "ok" });
  assert.equal(typeof body.request_id, "string");
});

test("backend task center creates and lists in-memory tasks through the shared response shell", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.notEqual(mainModule, null, "backend main module should exist before task creation can be verified");

  if (!mainModule?.createAppServer) {
    return;
  }

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const createdAssetTask = await createTask(baseUrl, {
    task_type: "asset_scan",
    title: "Scan demo target",
    target: {
      target_type: "url",
      target_value: "https://demo-agent.example.com"
    }
  });

  const createdStaticTask = await createTask(baseUrl, {
    task_type: "static_analysis",
    title: "Analyze demo skill",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/demo-email-skill"
    }
  });

  const createdSandboxTask = await createTask(baseUrl, {
    task_type: "sandbox_run",
    title: "Run demo sandbox session",
    target: {
      target_type: "session",
      target_value: "demo-session"
    }
  });

  assert.equal(createdAssetTask.status, 201);
  assert.equal(createdStaticTask.status, 201);
  assert.equal(createdSandboxTask.status, 201);
  assert.equal(createdAssetTask.body.success, true);
  assert.equal(createdAssetTask.body.error_code, null);

  const listResponse = await fetch(`${baseUrl}/api/tasks`);
  const listBody = (await listResponse.json()) as {
    success: boolean;
    data: Array<{ task_type: string; engine_type: string; status: string }>;
  };

  assert.equal(listResponse.status, 200);
  assert.equal(listBody.success, true);
  assert.equal(listBody.data.length, 3);
  assert.deepEqual(
    listBody.data.map((task) => ({
      task_type: task.task_type,
      engine_type: task.engine_type,
      status: task.status
    })),
    [
      { task_type: "asset_scan", engine_type: "asset_scan", status: "pending" },
      { task_type: "static_analysis", engine_type: "skills_static", status: "pending" },
      { task_type: "sandbox_run", engine_type: "sandbox", status: "pending" }
    ]
  );
});

test("backend task center returns a created task together with its initial result and risk summary", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.notEqual(mainModule, null, "backend main module should exist before task detail endpoints can be verified");

  if (!mainModule?.createAppServer) {
    return;
  }

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const createdTaskResponse = await createTask(baseUrl, {
    task_type: "asset_scan",
    title: "Scan demo target",
    target: {
      target_type: "url",
      target_value: "https://demo-agent.example.com"
    }
  });

  const taskId = ((createdTaskResponse.body.data as { task_id: string }).task_id);

  const taskResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`);
  const taskBody = (await taskResponse.json()) as {
    success: boolean;
    data: { task_id: string; task_type: string; status: string };
  };

  assert.equal(taskResponse.status, 200);
  assert.equal(taskBody.success, true);
  assert.equal(taskBody.data.task_id, taskId);
  assert.equal(taskBody.data.status, "pending");

  const resultResponse = await fetch(`${baseUrl}/api/tasks/${taskId}/result`);
  const resultBody = (await resultResponse.json()) as {
    success: boolean;
    data: {
      task_id: string;
      task_type: string;
      status: string;
      details: Record<string, unknown>;
    };
  };

  assert.equal(resultResponse.status, 200);
  assert.equal(resultBody.success, true);
  assert.equal(resultBody.data.task_id, taskId);
  assert.equal(resultBody.data.task_type, "asset_scan");
  assert.equal(resultBody.data.status, "pending");
  assert.deepEqual(resultBody.data.details.target, {
    target_type: "url",
    target_value: "https://demo-agent.example.com"
  });

  const summaryResponse = await fetch(`${baseUrl}/api/tasks/${taskId}/risk-summary`);
  const summaryBody = (await summaryResponse.json()) as {
    success: boolean;
    data: {
      task_id: string;
      status: string;
      risk_level: string;
      total_findings: number;
    };
  };

  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryBody.success, true);
  assert.equal(summaryBody.data.task_id, taskId);
  assert.equal(summaryBody.data.status, "pending");
  assert.equal(summaryBody.data.risk_level, "info");
  assert.equal(summaryBody.data.total_findings, 0);
});

test("backend task center exposes offline asset fingerprint details when an asset sample reference is provided", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.notEqual(mainModule, null, "backend main module should exist before sample-backed asset fingerprint responses can be verified");

  if (!mainModule?.createAppServer) {
    return;
  }

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const createdTaskResponse = await createTask(baseUrl, {
    task_type: "asset_scan",
    title: "Scan local ollama sample",
    target: {
      target_type: "url",
      target_value: "https://demo-agent.example.com"
    },
    parameters: {
      sample_ref: "samples/assets/fingerprint-positive/ollama.s001.json"
    }
  });

  assert.equal(createdTaskResponse.status, 201);

  const taskId = ((createdTaskResponse.body.data as { task_id: string }).task_id);
  const resultResponse = await fetch(`${baseUrl}/api/tasks/${taskId}/result`);
  const resultBody = (await resultResponse.json()) as {
    success: boolean;
    data: {
      task_id: string;
      task_type: string;
      status: string;
      details: {
        fingerprint?: { framework?: string; agent_name?: string };
        confidence?: number;
        matched_features?: string[];
        open_ports?: Array<{ port: number }>;
        http_endpoints?: Array<{ path: string; status_code: number }>;
      };
    };
  };

  assert.equal(resultResponse.status, 200);
  assert.equal(resultBody.success, true);
  assert.equal(resultBody.data.task_id, taskId);
  assert.equal(resultBody.data.task_type, "asset_scan");
  assert.equal(resultBody.data.details.fingerprint?.framework, "ollama");
  assert.equal(resultBody.data.details.fingerprint?.agent_name, "Ollama");
  assert.ok((resultBody.data.details.confidence ?? 0) >= 0.8);
  assert.ok((resultBody.data.details.matched_features?.length ?? 0) >= 2);
  assert.equal(resultBody.data.details.open_ports?.[0]?.port, 11434);
  assert.equal(resultBody.data.details.http_endpoints?.[0]?.path, "/api/tags");
});

test("backend task center returns TASK_NOT_FOUND when a task id does not exist", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.notEqual(mainModule, null, "backend main module should exist before not-found API behavior can be verified");

  if (!mainModule?.createAppServer) {
    return;
  }

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const response = await fetch(`${baseUrl}/api/tasks/task_missing`);
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error_code, "TASK_NOT_FOUND");
  assert.equal(typeof body.request_id, "string");
});
