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
      { task_type: "static_analysis", engine_type: "skills_static", status: "finished" },
      { task_type: "sandbox_run", engine_type: "sandbox", status: "pending" }
    ]
  );
});

test("backend task center keeps static-analysis creation on POST /api/tasks with parameters as the engine options slot", async (t) => {
  const mainModule = await importIfExists<MainModule>(mainModulePath);

  assert.notEqual(mainModule, null, "backend main module should exist before static-analysis task creation can be verified");

  if (!mainModule?.createAppServer) {
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
  assert.equal(createdTask.body.success, true);

  const createdTaskData = createdTask.body.data as {
    task_id: string;
    task_type: string;
    engine_type: string;
    status: string;
    parameters?: Record<string, unknown>;
  };

  assert.equal(createdTaskData.task_type, "static_analysis");
  assert.equal(createdTaskData.engine_type, "skills_static");
  assert.equal(createdTaskData.status, "pending");
  assert.deepEqual(createdTaskData.parameters, {
    language: "typescript",
    include_paths: ["src/**/*.ts"],
    include_dependencies: true
  });

  const taskResponse = await fetch(`${baseUrl}/api/tasks/${createdTaskData.task_id}`);
  const taskBody = (await taskResponse.json()) as {
    success: boolean;
    data: {
      task_id: string;
      status: string;
      risk_level?: string;
      summary?: string;
    };
  };
  const resultResponse = await fetch(`${baseUrl}/api/tasks/${createdTaskData.task_id}/result`);
  const resultBody = (await resultResponse.json()) as {
    success: boolean;
    data: {
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
        rule_hits?: unknown[];
        sensitive_capabilities?: string[];
        dependency_summary?: Record<string, unknown>;
      };
    };
  };
  const riskSummaryResponse = await fetch(`${baseUrl}/api/tasks/${createdTaskData.task_id}/risk-summary`);
  const riskSummaryBody = (await riskSummaryResponse.json()) as {
    success: boolean;
    data: {
      status: string;
      risk_level: string;
      summary: string;
      total_findings: number;
      info_count: number;
      low_count: number;
      medium_count: number;
      high_count: number;
      critical_count: number;
    };
  };

  assert.equal(taskResponse.status, 200);
  assert.equal(taskBody.success, true);
  assert.equal(taskBody.data.task_id, createdTaskData.task_id);
  assert.equal(taskBody.data.status, "finished");
  assert.equal(taskBody.data.risk_level, "high");
  assert.equal(taskBody.data.summary, "Static analysis finished with 2 rule hits");
  assert.equal(resultResponse.status, 200);
  assert.equal(resultBody.success, true);
  assert.equal(resultBody.data.task_type, "static_analysis");
  assert.equal(resultBody.data.engine_type, "skills_static");
  assert.equal(resultBody.data.status, "finished");
  assert.equal(resultBody.data.risk_level, "high");
  assert.equal(resultBody.data.summary, "Static analysis finished with 2 rule hits");
  assert.equal(resultBody.data.details.sample_name, "demo-email-skill");
  assert.equal(resultBody.data.details.language, "typescript");
  assert.deepEqual(resultBody.data.details.entry_files, ["src/index.ts", "src/report.ts"]);
  assert.equal(resultBody.data.details.files_scanned, 2);
  assert.deepEqual(resultBody.data.details.rule_hits, [
    {
      rule_id: "SK001",
      title: "Dangerous command execution",
      category: "command_execution",
      severity: "high",
      message: "Detected child_process.exec with untrusted input",
      file_path: "src/index.ts",
      line_start: 12,
      line_end: 14,
      code_snippet: "exec(userInput)",
      recommendation: "Replace shell execution with a safe allowlist wrapper",
      source_type: "user_input",
      sink_type: "command_execution",
      tags: ["command", "unsafe-input"]
    },
    {
      rule_id: "SK002",
      title: "Network egress without allowlist",
      category: "network_access",
      severity: "medium",
      message: "Detected outbound fetch to an unapproved endpoint",
      file_path: "src/report.ts",
      line_start: 8,
      line_end: 9,
      code_snippet: "fetch(reportUrl)",
      recommendation: "Restrict outbound destinations with an allowlist",
      source_type: "config",
      sink_type: "network_request",
      tags: ["network", "egress"]
    }
  ]);
  assert.deepEqual(resultBody.data.details.sensitive_capabilities, ["command_execution", "network_access"]);
  assert.deepEqual(resultBody.data.details.dependency_summary, {
    direct_dependency_count: 2,
    flagged_dependency_count: 1
  });
  assert.equal(riskSummaryResponse.status, 200);
  assert.equal(riskSummaryBody.success, true);
  assert.equal(riskSummaryBody.data.status, "finished");
  assert.equal(riskSummaryBody.data.risk_level, "high");
  assert.equal(riskSummaryBody.data.summary, "Static analysis finished with 2 rule hits");
  assert.equal(riskSummaryBody.data.total_findings, 2);
  assert.equal(riskSummaryBody.data.info_count, 0);
  assert.equal(riskSummaryBody.data.low_count, 0);
  assert.equal(riskSummaryBody.data.medium_count, 1);
  assert.equal(riskSummaryBody.data.high_count, 1);
  assert.equal(riskSummaryBody.data.critical_count, 0);
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
