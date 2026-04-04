import assert from "node:assert/strict";
import type { Server } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { STATIC_ANALYSIS_PENDING_SUMMARY, summarizeStaticAnalysisRuleHits } from "../fixtures/static-analysis-contract.fixture.ts";

const mainModulePath = resolve(import.meta.dirname, "../../backend/src/main.ts");
const sharedEntrypointPath = resolve(import.meta.dirname, "../../shared/index.ts");

type MainModule = {
  createAppServer?: () => Server;
};

type SharedModule = {
  isApiResponse?: (value: unknown) => boolean;
  normalizeTask?: (value: unknown) => unknown;
  normalizeBaseResult?: (value: unknown) => unknown;
  normalizeRiskSummary?: (value: unknown) => unknown;
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
  const sharedModule = await importIfExists<SharedModule>(sharedEntrypointPath);

  assert.notEqual(mainModule, null, "backend main module should exist before task creation can be verified");
  assert.notEqual(sharedModule, null, "shared module should exist before public API shells can be validated");

  if (!mainModule?.createAppServer || !sharedModule) {
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
  assert.equal(sharedModule.isApiResponse?.(createdAssetTask.body), true);
  assert.equal(sharedModule.isApiResponse?.(createdStaticTask.body), true);
  assert.equal(sharedModule.isApiResponse?.(createdSandboxTask.body), true);

  const listResponse = await fetch(`${baseUrl}/api/tasks`);
  const listBody = (await listResponse.json()) as Record<string, unknown>;

  assert.equal(listResponse.status, 200);
  assert.equal(sharedModule.isApiResponse?.(listBody), true);
  assert.ok(Array.isArray(listBody.data));
  assert.equal(listBody.data.length, 3);
  assert.deepEqual(
    listBody.data.map((task) => {
      const normalizedTask = sharedModule.normalizeTask?.(task) as
        | {
            task_type: string;
            engine_type: string;
            status: string;
          }
        | null;

      assert.notEqual(normalizedTask, null);

      return {
        task_type: normalizedTask?.task_type,
        engine_type: normalizedTask?.engine_type,
        status: normalizedTask?.status
      };
    }),
    [
      { task_type: "asset_scan", engine_type: "asset_scan", status: "pending" },
      { task_type: "static_analysis", engine_type: "skills_static", status: "finished" },
      { task_type: "sandbox_run", engine_type: "sandbox", status: "pending" }
    ]
  );
});

test("backend task center keeps static-analysis creation on POST /api/tasks with parameters as the engine options slot", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);
  const sharedModule = await importIfExists<SharedModule>(sharedEntrypointPath);

  assert.notEqual(mainModule, null, "backend main module should exist before static-analysis task creation can be verified");
  assert.notEqual(sharedModule, null, "shared module should exist before static-analysis API contracts can be verified");

  if (!mainModule?.createAppServer || !sharedModule) {
    return;
  }

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const createdTask = await createTask(baseUrl, {
    task_type: "static_analysis",
    title: "Analyze demo skill with explicit parameters",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/demo-email-skill",
      display_name: "demo-email-skill"
    },
    parameters: {
      language: "typescript",
      include_paths: ["src/**/*.ts"],
      include_dependencies: true
    }
  });

  assert.equal(createdTask.status, 201);
  assert.equal(sharedModule.isApiResponse?.(createdTask.body), true);

  const createdTaskData = sharedModule.normalizeTask?.(createdTask.body.data) as
    | {
        task_id: string;
        task_type: string;
        engine_type: string;
        status: string;
        summary?: string;
        parameters?: Record<string, unknown>;
      }
    | null;

  assert.notEqual(createdTaskData, null);

  if (!createdTaskData) {
    return;
  }

  assert.equal(createdTaskData.task_type, "static_analysis");
  assert.equal(createdTaskData.engine_type, "skills_static");
  assert.equal(createdTaskData.status, "pending");
  assert.equal(createdTaskData.summary, STATIC_ANALYSIS_PENDING_SUMMARY);
  assert.deepEqual(createdTaskData.parameters, {
    language: "typescript",
    include_paths: ["src/**/*.ts"],
    include_dependencies: true
  });

  const taskResponse = await fetch(`${baseUrl}/api/tasks/${createdTaskData.task_id}`);
  const taskBody = (await taskResponse.json()) as Record<string, unknown>;
  const resultResponse = await fetch(`${baseUrl}/api/tasks/${createdTaskData.task_id}/result`);
  const resultBody = (await resultResponse.json()) as Record<string, unknown>;
  const riskSummaryResponse = await fetch(`${baseUrl}/api/tasks/${createdTaskData.task_id}/risk-summary`);
  const riskSummaryBody = (await riskSummaryResponse.json()) as Record<string, unknown>;

  assert.equal(taskResponse.status, 200);
  assert.equal(resultResponse.status, 200);
  assert.equal(riskSummaryResponse.status, 200);
  assert.equal(sharedModule.isApiResponse?.(taskBody), true);
  assert.equal(sharedModule.isApiResponse?.(resultBody), true);
  assert.equal(sharedModule.isApiResponse?.(riskSummaryBody), true);

  const normalizedTask = sharedModule.normalizeTask?.(taskBody.data) as
    | {
        task_id: string;
        task_type: string;
        engine_type: string;
        status: string;
        risk_level?: string;
        summary?: string;
        updated_at: string;
      }
    | null;
  const normalizedResult = sharedModule.normalizeBaseResult?.(resultBody.data) as
    | {
        task_id: string;
        task_type: string;
        engine_type: string;
        status: string;
        risk_level: string;
        summary: string;
        details: {
          sample_name?: string;
          language?: string;
          entry_files?: string[];
          files_scanned?: number;
          rule_hits?: Array<{ rule_id: string; severity: "info" | "low" | "medium" | "high" | "critical" }>;
          sensitive_capabilities?: string[];
          dependency_summary?: Record<string, unknown>;
        };
        updated_at: string;
      }
    | null;
  const normalizedRiskSummary = sharedModule.normalizeRiskSummary?.(riskSummaryBody.data) as
    | {
        task_id: string;
        task_type: string;
        status: string;
        risk_level: string;
        summary: string;
        total_findings: number;
        info_count: number;
        low_count: number;
        medium_count: number;
        high_count: number;
        critical_count: number;
        updated_at: string;
      }
    | null;

  assert.notEqual(normalizedTask, null);
  assert.notEqual(normalizedResult, null);
  assert.notEqual(normalizedRiskSummary, null);

  if (!normalizedTask || !normalizedResult || !normalizedRiskSummary) {
    return;
  }

  const ruleHits = normalizedResult.details.rule_hits ?? [];
  const riskCounts = summarizeStaticAnalysisRuleHits(ruleHits);

  assert.equal(normalizedTask.task_id, createdTaskData.task_id);
  assert.equal(normalizedTask.task_type, "static_analysis");
  assert.equal(normalizedTask.engine_type, "skills_static");
  assert.equal(normalizedTask.status, "finished");
  assert.equal(normalizedResult.task_id, createdTaskData.task_id);
  assert.equal(normalizedResult.task_type, "static_analysis");
  assert.equal(normalizedResult.engine_type, "skills_static");
  assert.equal(normalizedResult.status, "finished");
  assert.equal(normalizedRiskSummary.task_id, createdTaskData.task_id);
  assert.equal(normalizedRiskSummary.task_type, "static_analysis");
  assert.equal(normalizedRiskSummary.status, "finished");

  assert.ok(typeof normalizedResult.details.sample_name === "string" && normalizedResult.details.sample_name.length > 0);
  assert.ok(typeof normalizedResult.details.language === "string" && normalizedResult.details.language.length > 0);
  assert.ok(Array.isArray(normalizedResult.details.entry_files) && normalizedResult.details.entry_files.length > 0);
  assert.ok(
    typeof normalizedResult.details.files_scanned === "number" &&
      normalizedResult.details.files_scanned >= normalizedResult.details.entry_files.length
  );
  assert.ok(ruleHits.length > 0);
  assert.ok(Array.isArray(normalizedResult.details.sensitive_capabilities) && normalizedResult.details.sensitive_capabilities.length > 0);
  assert.equal(typeof normalizedResult.details.dependency_summary, "object");
  assert.notEqual(normalizedResult.details.dependency_summary, null);

  assert.equal(normalizedTask.risk_level, riskCounts.risk_level);
  assert.equal(normalizedResult.risk_level, riskCounts.risk_level);
  assert.equal(normalizedRiskSummary.risk_level, riskCounts.risk_level);
  assert.equal(normalizedRiskSummary.total_findings, riskCounts.total_findings);
  assert.equal(normalizedRiskSummary.info_count, riskCounts.info_count);
  assert.equal(normalizedRiskSummary.low_count, riskCounts.low_count);
  assert.equal(normalizedRiskSummary.medium_count, riskCounts.medium_count);
  assert.equal(normalizedRiskSummary.high_count, riskCounts.high_count);
  assert.equal(normalizedRiskSummary.critical_count, riskCounts.critical_count);

  assert.equal(normalizedTask.summary, normalizedResult.summary);
  assert.equal(normalizedResult.summary, normalizedRiskSummary.summary);
  assert.notEqual(normalizedTask.summary, STATIC_ANALYSIS_PENDING_SUMMARY);
  assert.notEqual(normalizedTask.summary, createdTaskData.summary);
  assert.equal(normalizedTask.updated_at, normalizedResult.updated_at);
  assert.equal(normalizedResult.updated_at, normalizedRiskSummary.updated_at);
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

test("backend task center supports live probe mode for langflow and autogpt without sample_ref", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.notEqual(mainModule, null, "backend main module should exist before live probe mode can be verified");

  if (!mainModule?.createAppServer) {
    return;
  }

  const probeServer = await import("node:http").then(({ createServer }) =>
    createServer((request, response) => {
      if (request.url === "/api/v1/flows") {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ flows: [{ flow_id: "flow-live-001" }] }));
        return;
      }

      if (request.url === "/api/agent/status") {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ agent_id: "agent-live-001", status: "running" }));
        return;
      }

      response.statusCode = 404;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "not_found" }));
    })
  );

  const probeBaseUrl = await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolvePromise, rejectPromise) => {
    probeServer.once("error", rejectPromise);
    probeServer.listen(0, "127.0.0.1", () => {
      const address = probeServer.address();

      if (!address || typeof address === "string") {
        rejectPromise(new Error("probe server did not expose a numeric port"));
        return;
      }

      resolvePromise({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            probeServer.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }

              resolveClose();
            });
          })
      });
    });
  });

  t.after(async () => {
    await probeBaseUrl.close();
  });

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const createdLangflowTask = await createTask(baseUrl, {
    task_type: "asset_scan",
    title: "Live probe langflow",
    target: {
      target_type: "url",
      target_value: probeBaseUrl.baseUrl
    },
    parameters: {
      probe_mode: "live",
      probe_target_id: "langflow"
    }
  });

  const createdAutogptTask = await createTask(baseUrl, {
    task_type: "asset_scan",
    title: "Live probe autogpt",
    target: {
      target_type: "url",
      target_value: probeBaseUrl.baseUrl
    },
    parameters: {
      probe_mode: "live",
      probe_target_id: "autogpt"
    }
  });

  assert.equal(createdLangflowTask.status, 201);
  assert.equal(createdAutogptTask.status, 201);

  const langflowTaskId = ((createdLangflowTask.body.data as { task_id: string }).task_id);
  const autogptTaskId = ((createdAutogptTask.body.data as { task_id: string }).task_id);

  const langflowResultResponse = await fetch(`${baseUrl}/api/tasks/${langflowTaskId}/result`);
  const langflowResultBody = (await langflowResultResponse.json()) as {
    success: boolean;
    data: {
      details: {
        fingerprint?: { framework?: string; agent_name?: string };
        confidence?: number;
        matched_features?: string[];
      };
    };
  };

  const autogptResultResponse = await fetch(`${baseUrl}/api/tasks/${autogptTaskId}/result`);
  const autogptResultBody = (await autogptResultResponse.json()) as {
    success: boolean;
    data: {
      details: {
        fingerprint?: { framework?: string; agent_name?: string };
        confidence?: number;
        matched_features?: string[];
      };
    };
  };

  assert.equal(langflowResultResponse.status, 200);
  assert.equal(langflowResultBody.success, true);
  assert.equal(langflowResultBody.data.details.fingerprint?.framework, "langflow");
  assert.equal(langflowResultBody.data.details.fingerprint?.agent_name, "LangFlow");
  assert.ok((langflowResultBody.data.details.confidence ?? 0) >= 0.7);
  assert.ok((langflowResultBody.data.details.matched_features?.length ?? 0) >= 2);

  assert.equal(autogptResultResponse.status, 200);
  assert.equal(autogptResultBody.success, true);
  assert.equal(autogptResultBody.data.details.fingerprint?.framework, "autogpt");
  assert.equal(autogptResultBody.data.details.fingerprint?.agent_name, "AutoGPT");
  assert.ok((autogptResultBody.data.details.confidence ?? 0) >= 0.7);
  assert.ok((autogptResultBody.data.details.matched_features?.length ?? 0) >= 2);
});

test("backend task center supports live probe mode for ollama with a probe port hint", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.ok(mainModule?.createAppServer);

  if (!mainModule?.createAppServer) {
    return;
  }

  const probeServer = await import("node:http").then(({ createServer }) =>
    createServer((request, response) => {
      if (request.url === "/api/tags") {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ models: [{ name: "qwen2.5:latest" }] }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not_found" }));
    })
  );

  const probeBaseUrl = await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolvePromise, rejectPromise) => {
    probeServer.once("error", rejectPromise);
    probeServer.listen(0, "127.0.0.1", () => {
      const address = probeServer.address();

      if (!address || typeof address === "string") {
        rejectPromise(new Error("probe server did not expose a numeric port"));
        return;
      }

      resolvePromise({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            probeServer.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }

              resolveClose();
            });
          })
      });
    });
  });

  t.after(async () => {
    await probeBaseUrl.close();
  });

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const createdTask = await createTask(baseUrl, {
    task_type: "asset_scan",
    title: "Live probe ollama",
    target: {
      target_type: "url",
      target_value: probeBaseUrl.baseUrl
    },
    parameters: {
      probe_mode: "live",
      probe_target_id: "ollama",
      probe_port_hint: 11434
    }
  });

  assert.equal(createdTask.status, 201);

  const taskId = ((createdTask.body.data as { task_id: string }).task_id);
  const resultResponse = await fetch(`${baseUrl}/api/tasks/${taskId}/result`);
  const resultBody = (await resultResponse.json()) as {
    success: boolean;
    data: {
      details: {
        fingerprint?: { framework?: string; agent_name?: string };
        confidence?: number;
        matched_features?: string[];
        open_ports?: Array<{ port?: number }>;
      };
    };
  };

  assert.equal(resultResponse.status, 200);
  assert.equal(resultBody.success, true);
  assert.equal(resultBody.data.details.fingerprint?.framework, "ollama");
  assert.equal(resultBody.data.details.fingerprint?.agent_name, "Ollama");
  assert.ok((resultBody.data.details.confidence ?? 0) >= 0.8);
  assert.equal(resultBody.data.details.open_ports?.[0]?.port, 11434);
  assert.ok((resultBody.data.details.matched_features?.length ?? 0) >= 3);
});

test("backend task center supports live probe mode for openclaw gateway over websocket", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.ok(mainModule?.createAppServer);

  if (!mainModule?.createAppServer) {
    return;
  }

  const { createServer } = await import("node:http");
  const { createHash } = await import("node:crypto");
  const websocketServer = createServer();

  websocketServer.on("upgrade", (request, socket) => {
    const websocketKey = request.headers["sec-websocket-key"];

    if (typeof websocketKey !== "string") {
      socket.destroy();
      return;
    }

    const acceptKey = createHash("sha1")
      .update(`${websocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${acceptKey}`,
        "",
        ""
      ].join("\r\n")
    );

    socket.once("data", () => {
      const payload = JSON.stringify({
        type: "res",
        ok: true,
        payload: {
          type: "hello-ok",
          protocol: 3,
          presence: {
            state: "available"
          }
        }
      });
      const payloadBuffer = Buffer.from(payload);
      const frame = Buffer.alloc(2 + payloadBuffer.length);
      frame[0] = 0x81;
      frame[1] = payloadBuffer.length;
      payloadBuffer.copy(frame, 2);
      socket.write(frame);
      socket.end();
    });
  });

  const probeBaseUrl = await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolvePromise, rejectPromise) => {
    websocketServer.once("error", rejectPromise);
    websocketServer.listen(0, "127.0.0.1", () => {
      const address = websocketServer.address();

      if (!address || typeof address === "string") {
        rejectPromise(new Error("websocket server did not expose a numeric port"));
        return;
      }

      resolvePromise({
        baseUrl: `ws://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            websocketServer.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }

              resolveClose();
            });
          })
      });
    });
  });

  t.after(async () => {
    await probeBaseUrl.close();
  });

  const server = mainModule.createAppServer();
  const { baseUrl, close } = await startServer(server);
  t.after(close);

  const createdTask = await createTask(baseUrl, {
    task_type: "asset_scan",
    title: "Live probe openclaw gateway",
    target: {
      target_type: "url",
      target_value: probeBaseUrl.baseUrl
    },
    parameters: {
      probe_mode: "live",
      probe_target_id: "openclaw-gateway",
      probe_port_hint: 18789
    }
  });

  assert.equal(createdTask.status, 201);

  const taskId = ((createdTask.body.data as { task_id: string }).task_id);
  const resultResponse = await fetch(`${baseUrl}/api/tasks/${taskId}/result`);
  const resultBody = (await resultResponse.json()) as {
    success: boolean;
    data: {
      details: {
        fingerprint?: { framework?: string; agent_name?: string };
        confidence?: number;
        matched_features?: string[];
        open_ports?: Array<{ port?: number }>;
      };
    };
  };

  assert.equal(resultResponse.status, 200);
  assert.equal(resultBody.success, true);
  assert.equal(resultBody.data.details.fingerprint?.framework, "openclaw-gateway");
  assert.equal(resultBody.data.details.fingerprint?.agent_name, "OpenClaw Gateway");
  assert.ok((resultBody.data.details.confidence ?? 0) >= 0.8);
  assert.equal(resultBody.data.details.open_ports?.[0]?.port, 18789);
  assert.ok((resultBody.data.details.matched_features?.length ?? 0) >= 3);
});
