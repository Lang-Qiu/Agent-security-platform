import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
const bridgeScriptPath = resolve(import.meta.dirname, "../src/bridge/scan-task.ts");

test("asset-scan bridge consumes task payload from stdin and returns details json", async () => {
  const taskPayload = {
    task: {
      task_id: "task_bridge_001",
      task_type: "asset_scan",
      engine_type: "asset_scan",
      status: "pending",
      title: "bridge sample",
      target: {
        target_type: "url",
        target_value: "http://127.0.0.1:19999"
      },
      parameters: {
        sample_ref: "samples/assets/fingerprint-positive/ollama.s001.json"
      },
      created_at: "2026-04-11T00:00:00Z",
      updated_at: "2026-04-11T00:00:00Z"
    }
  };

  const stdout = execFileSync(process.execPath, ["--experimental-strip-types", bridgeScriptPath], {
    cwd: resolve(import.meta.dirname, "../../.."),
    input: JSON.stringify(taskPayload)
  }).toString("utf8");

  const output = JSON.parse(stdout) as {
    success: boolean;
    details?: { fingerprint?: { framework?: string }; confidence?: number };
  };

  assert.equal(output.success, true);
  assert.equal(output.details?.fingerprint?.framework, "ollama");
  assert.ok((output.details?.confidence ?? 0) >= 0.8);
});
