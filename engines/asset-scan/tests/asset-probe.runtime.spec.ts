import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";

import type { Task } from "../../../shared/types/task.ts";
import { runAssetScanTask } from "../src/runtime/run-task.ts";

function createLiveProbeTask(baseUrl: string, probeTargetId: string, probePortHint?: number): Task {
  return {
    task_id: `task_probe_${probeTargetId}`,
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "pending",
    title: `Live probe ${probeTargetId}`,
    target: {
      target_type: "url",
      target_value: baseUrl
    },
    parameters: {
      probe_mode: "live",
      probe_target_id: probeTargetId,
      probe_port_hint: probePortHint
    },
    created_at: "2026-04-13T00:00:00Z",
    updated_at: "2026-04-13T00:00:00Z"
  };
}

test("asset-scan runtime detects langflow in live probe mode", async () => {
  const probeServer = createServer((request, response) => {
    if (request.url === "/api/v1/flows") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ flows: [{ flow_id: "flow-live-001" }] }));
      return;
    }

    response.statusCode = 404;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const startedProbeServer = await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolvePromise, rejectPromise) => {
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

  try {
    const details = await runAssetScanTask(createLiveProbeTask(startedProbeServer.baseUrl, "langflow"));

    assert.equal(details.fingerprint?.framework, "langflow");
    assert.equal(details.fingerprint?.agent_name, "LangFlow");
    assert.ok((details.confidence ?? 0) >= 0.7);
    assert.equal(details.http_endpoints?.[0]?.path, "/api/v1/flows");
    assert.equal(details.http_endpoints?.[0]?.status_code, 200);
    assert.ok((details.matched_features?.length ?? 0) >= 2);
  } finally {
    await startedProbeServer.close();
  }
});

test("asset-scan runtime detects ollama in live probe mode with a port hint", async () => {
  const probeServer = createServer((request, response) => {
    if (request.url === "/api/tags") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ models: [{ name: "qwen2.5:latest" }] }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const startedProbeServer = await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolvePromise, rejectPromise) => {
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

  try {
    const details = await runAssetScanTask(createLiveProbeTask(startedProbeServer.baseUrl, "ollama", 11434));

    assert.equal(details.fingerprint?.framework, "ollama");
    assert.equal(details.fingerprint?.agent_name, "Ollama");
    assert.ok((details.confidence ?? 0) >= 0.8);
    assert.equal(details.open_ports?.[0]?.port, 11434);
    assert.ok((details.matched_features?.length ?? 0) >= 3);
  } finally {
    await startedProbeServer.close();
  }
});

test("asset-scan runtime detects openclaw gateway in live websocket probe mode", async () => {
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

  const startedWebsocketServer = await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolvePromise, rejectPromise) => {
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

  try {
    const details = await runAssetScanTask(createLiveProbeTask(startedWebsocketServer.baseUrl, "openclaw-gateway", 18789));

    assert.equal(details.fingerprint?.framework, "openclaw-gateway");
    assert.equal(details.fingerprint?.agent_name, "OpenClaw Gateway");
    assert.ok((details.confidence ?? 0) >= 0.8);
    assert.equal(details.open_ports?.[0]?.port, 18789);
    assert.ok((details.matched_features?.length ?? 0) >= 3);
  } finally {
    await startedWebsocketServer.close();
  }
});
