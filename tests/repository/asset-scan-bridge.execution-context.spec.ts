import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const bridgeModulePath = resolve(import.meta.dirname, "../../engines/asset-scan/src/bridge/scan-task.ts");

type BridgeModule = {
  buildExecutionContextFromTask?: (task: {
    parameters?: Record<string, unknown>;
    requested_by?: string;
  }, runtimeExecutionContext?: {
    max_targets?: number;
    max_ports_per_target?: number;
    max_runtime_seconds?: number;
    target_http_rps_cap?: number;
    max_tcp_concurrency_per_target?: number;
    audit?: {
      query?: string;
      source?: string;
      requested_by?: string;
      requested_at?: string;
      interruption_reason?: "none" | "budget" | "timeout" | "manual_stop";
    };
  }) => {
    max_targets?: number;
    max_ports_per_target?: number;
    max_runtime_seconds?: number;
    target_http_rps_cap?: number;
    max_tcp_concurrency_per_target?: number;
    audit?: {
      query?: string;
      source?: string;
      requested_by?: string;
      requested_at?: string;
      interruption_reason?: "none" | "budget" | "timeout" | "manual_stop";
    };
  } | undefined;
};

test("asset-scan bridge builds execution context from normalized task parameters", async () => {
  const module = (await import(pathToFileURL(bridgeModulePath).href)) as BridgeModule;

  assert.equal(typeof module.buildExecutionContextFromTask, "function", "buildExecutionContextFromTask should be exported");

  if (!module.buildExecutionContextFromTask) {
    return;
  }

  const executionContext = module.buildExecutionContextFromTask({
    requested_by: "sec-ops",
    parameters: {
      max_targets: 9,
      max_ports_per_target: 30,
      max_runtime_seconds: 180,
      target_http_rps_cap: 4,
      max_tcp_concurrency_per_target: 6,
      audit: {
        query: 'app="Ollama" && is_domain=false',
        source: "fofa",
        requested_by: "sec-ops",
        requested_at: "2026-05-08T11:30:00.000Z",
        interruption_reason: "budget"
      }
    }
  });

  assert.deepEqual(executionContext, {
    max_targets: 9,
    max_ports_per_target: 30,
    max_runtime_seconds: 180,
    target_http_rps_cap: 4,
    max_tcp_concurrency_per_target: 6,
    audit: {
      query: 'app="Ollama" && is_domain=false',
      source: "fofa",
      requested_by: "sec-ops",
      requested_at: "2026-05-08T11:30:00.000Z",
      interruption_reason: "budget"
    }
  });
});

test("asset-scan bridge falls back interruption_reason to none when input is invalid", async () => {
  const module = (await import(pathToFileURL(bridgeModulePath).href)) as BridgeModule;

  assert.equal(typeof module.buildExecutionContextFromTask, "function", "buildExecutionContextFromTask should be exported");

  if (!module.buildExecutionContextFromTask) {
    return;
  }

  const executionContext = module.buildExecutionContextFromTask({
    requested_by: "sec-ops",
    parameters: {
      max_targets: 1,
      audit: {
        interruption_reason: "oops"
      }
    }
  });

  assert.equal(executionContext?.audit?.interruption_reason, "none");
});

test("asset-scan bridge preserves runtime interruption reason when task audit remains none", async () => {
  const module = (await import(pathToFileURL(bridgeModulePath).href)) as BridgeModule;

  assert.equal(typeof module.buildExecutionContextFromTask, "function", "buildExecutionContextFromTask should be exported");

  if (!module.buildExecutionContextFromTask) {
    return;
  }

  const executionContext = module.buildExecutionContextFromTask(
    {
      requested_by: "sec-ops",
      parameters: {
        max_targets: 1,
        audit: {
          interruption_reason: "none"
        }
      }
    },
    {
      audit: {
        interruption_reason: "timeout"
      }
    }
  );

  assert.equal(executionContext?.audit?.interruption_reason, "timeout");
});
