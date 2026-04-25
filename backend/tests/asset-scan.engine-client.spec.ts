// 该测试文件用于验证 `AssetScanTaskAdapter` 适配器在处理资产扫描任务时，
// 能正确地将“样本回扫”和“实时探测”两种流程委托给注入的引擎客户端执行，
// 并原样透传引擎返回的扫描结果，确保职责分离与结果一致性。

import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type { AssetScanResultDetails } from "../../shared/types/result.ts";
import type { Task } from "../../shared/types/task.ts";

const assetAdapterPath = resolve(import.meta.dirname, "../src/modules/task-center/adapters/asset-scan.adapter.ts");

type EngineClient = {
  scan: (task: Task) => Promise<AssetScanResultDetails | null>;
};

type AssetAdapterModule = {
  AssetScanTaskAdapter?: new (options?: { engineClient?: EngineClient }) => {
    createInitialDetails: (task: Task) => Promise<AssetScanResultDetails>;
  };
};

function createAssetTask(parameters?: Record<string, unknown>): Task {
  return {
    task_id: "task_asset_engine_client",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "pending",
    title: "Asset task",
    target: {
      target_type: "url",
      target_value: "http://127.0.0.1:19090"
    },
    parameters,
    created_at: "2026-04-11T00:00:00Z",
    updated_at: "2026-04-11T00:00:00Z"
  };
}

test("asset adapter delegates sample_ref flow to engine client", async () => {
  const module = (await import(pathToFileURL(assetAdapterPath).href)) as AssetAdapterModule;
  assert.ok(module.AssetScanTaskAdapter);

  const calls: Task[] = [];
  const detailsFromEngine: AssetScanResultDetails = {
    target: {
      target_type: "url",
      target_value: "http://127.0.0.1:19090"
    },
    fingerprint: {
      framework: "ollama",
      agent_name: "Ollama"
    },
    confidence: 0.95,
    matched_features: ["port_11434", "path_api_tags"],
    findings: []
  };

  const engineClient: EngineClient = {
    async scan(task) {
      calls.push(task);
      return detailsFromEngine;
    }
  };

  const adapter = new module.AssetScanTaskAdapter({ engineClient });
  const details = await adapter.createInitialDetails(
    createAssetTask({
      sample_ref: "samples/assets/fingerprint-positive/ollama.s001.json"
    })
  );

  assert.deepEqual(details, detailsFromEngine);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].task_type, "asset_scan");
});

test("asset adapter delegates live probe flow to engine client", async () => {
  const module = (await import(pathToFileURL(assetAdapterPath).href)) as AssetAdapterModule;
  assert.ok(module.AssetScanTaskAdapter);

  const calls: Task[] = [];
  const detailsFromEngine: AssetScanResultDetails = {
    target: {
      target_type: "url",
      target_value: "http://127.0.0.1:19091"
    },
    fingerprint: {
      framework: "langflow",
      agent_name: "Langflow"
    },
    confidence: 0.9,
    matched_features: ["path_api_v1_flows"],
    findings: []
  };

  const engineClient: EngineClient = {
    async scan(task) {
      calls.push(task);
      return detailsFromEngine;
    }
  };

  const adapter = new module.AssetScanTaskAdapter({ engineClient });
  const details = await adapter.createInitialDetails(
    createAssetTask({
      probe_mode: "live",
      probe_target_id: "langflow"
    })
  );

  assert.deepEqual(details, detailsFromEngine);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parameters?.probe_mode, "live");
  assert.equal(calls[0].parameters?.probe_target_id, "langflow");
});
