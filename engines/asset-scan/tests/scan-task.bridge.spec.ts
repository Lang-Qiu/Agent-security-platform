import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssetScanResult } from "../../../shared/types/asset-scan.ts";
import type { Task } from "../../../shared/types/task.ts";
import { runAssetScanTask } from "../src/runtime/run-task.ts";

test("runAssetScanTask preserves step 1 to 3 outputs in the final engine result", async () => {
  const task: Task = {
    task_id: "task_asset_runtime_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "pending",
    title: "Local discovery task",
    target: {
      target_type: "url",
      target_value: "http://localhost:11434"
    },
    parameters: {
      discovery_seed: ["localhost", "127.0.0.1"]
    },
    created_at: "2026-04-13T10:00:00Z",
    updated_at: "2026-04-13T10:00:00Z"
  };

  const result = await runAssetScanTask(task, {
    pipeline: {
      run: async () =>
        ({
          target: task.target,
          asset: {
            ip: "127.0.0.1",
            domain: "localhost",
            source: ["dns", "seed"],
            timestamp: "2026-04-13T10:00:00Z"
          },
          network: {
            open_ports: [
              {
                port: 11434,
                protocol: "tcp",
                service: "http",
                status: "open"
              }
            ],
            protocols: [
              {
                port: 11434,
                protocol: "http",
                subprotocol: "http/1.1",
                service: "ollama"
              }
            ]
          },
          application: {
            http_endpoints: [],
            auth: {
              auth_detected: false,
              auth_type: "none"
            }
          },
          fingerprints: {},
          inferred_attributes: {},
          findings: []
        }) satisfies Partial<AssetScanResult>
    }
  });

  assert.deepEqual(result.asset, {
    ip: "127.0.0.1",
    domain: "localhost",
    source: ["dns", "seed"],
    timestamp: "2026-04-13T10:00:00Z"
  });
  assert.deepEqual(result.network?.protocols, [
    {
      port: 11434,
      protocol: "http",
      subprotocol: "http/1.1",
      service: "ollama"
    }
  ]);
});
