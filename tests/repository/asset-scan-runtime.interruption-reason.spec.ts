import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../../engines/asset-scan/src/runtime/run-task.ts");

type RuntimeModule = {
  runAssetScanTask?: (
    task: Record<string, unknown>,
    options?: {
      pipelineFactory?: () => {
        run: (targetUrl: string) => Promise<Record<string, unknown>>;
      };
    }
  ) => Promise<{
    status: string;
    target: { target_type: string; target_value: string };
    findings: unknown[];
    execution_context?: {
      audit?: {
        interruption_reason?: string;
      };
    };
  }>;
};

test("asset-scan runtime reports partial_success when pipeline returns a timeout interruption reason", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as RuntimeModule;

  assert.equal(typeof module.runAssetScanTask, "function", "runAssetScanTask should be exported");

  if (!module.runAssetScanTask) {
    return;
  }

  const result = await module.runAssetScanTask(
    {
      task_id: "task_runtime_timeout_001",
      task_type: "asset_scan",
      engine_type: "asset_scan",
      status: "pending",
      title: "Runtime timeout case",
      target: {
        target_type: "url",
        target_value: "http://127.0.0.1:11434"
      },
      created_at: "2026-05-08T14:00:00.000Z",
      updated_at: "2026-05-08T14:00:00.000Z"
    },
    {
      pipelineFactory: () => ({
        async run(targetUrl: string) {
          assert.equal(targetUrl, "http://127.0.0.1:11434");

          return {
            target: {
              target_type: "url",
              target_value: targetUrl
            },
            application: {
              http_endpoints: [],
              auth: {
                auth_detected: false,
                auth_type: "none"
              }
            },
            findings: [],
            execution_context: {
              audit: {
                interruption_reason: "timeout"
              }
            }
          };
        }
      })
    }
  );

  assert.equal(result.status, "partial_success");
  assert.equal(result.execution_context?.audit?.interruption_reason, "timeout");
});

test("asset-scan runtime records timeout interruption reason when pipeline throws timeout error", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as RuntimeModule;

  assert.equal(typeof module.runAssetScanTask, "function", "runAssetScanTask should be exported");

  if (!module.runAssetScanTask) {
    return;
  }

  const result = await module.runAssetScanTask(
    {
      task_id: "task_runtime_timeout_throw_001",
      task_type: "asset_scan",
      engine_type: "asset_scan",
      status: "pending",
      title: "Runtime timeout throw case",
      target: {
        target_type: "url",
        target_value: "http://127.0.0.1:11434"
      },
      created_at: "2026-05-08T15:00:00.000Z",
      updated_at: "2026-05-08T15:00:00.000Z"
    },
    {
      pipelineFactory: () => ({
        async run() {
          throw new Error("probe timeout reached");
        }
      })
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.execution_context?.audit?.interruption_reason, "timeout");
});