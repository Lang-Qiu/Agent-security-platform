import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const sharedEntrypointPath = resolve(import.meta.dirname, "../index.ts");

type SharedModule = {
  TASK_TYPES?: string[];
  TASK_STATUSES?: string[];
  ENGINE_TYPES?: string[];
  RISK_LEVELS?: string[];
  TASK_TYPE_TO_ENGINE_TYPE?: Record<string, string>;
  isTaskType?: (value: unknown) => boolean;
  isTaskStatus?: (value: unknown) => boolean;
  isEngineType?: (value: unknown) => boolean;
  isRiskLevel?: (value: unknown) => boolean;
  normalizeTask?: (value: unknown) => unknown;
  normalizeRiskSummary?: (value: unknown) => unknown;
};

async function loadSharedModule(): Promise<SharedModule | null> {
  if (!existsSync(sharedEntrypointPath)) {
    return null;
  }

  return import(pathToFileURL(sharedEntrypointPath).href);
}

test("task contract exports the supported task, engine, status, and risk enums", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before the contract can be consumed");

  if (!sharedModule) {
    return;
  }

  assert.deepEqual(sharedModule.TASK_TYPES, ["asset_scan", "static_analysis", "sandbox_run"]);
  assert.deepEqual(sharedModule.TASK_STATUSES, [
    "pending",
    "running",
    "finished",
    "failed",
    "blocked",
    "partial_success"
  ]);
  assert.deepEqual(sharedModule.ENGINE_TYPES, ["asset_scan", "skills_static", "sandbox"]);
  assert.deepEqual(sharedModule.RISK_LEVELS, ["info", "low", "medium", "high", "critical"]);
  assert.deepEqual(sharedModule.TASK_TYPE_TO_ENGINE_TYPE, {
    asset_scan: "asset_scan",
    static_analysis: "skills_static",
    sandbox_run: "sandbox"
  });
});

test("task contract runtime guards accept only declared enum values", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before runtime guards can be validated");

  if (!sharedModule) {
    return;
  }

  assert.equal(sharedModule.isTaskType?.("asset_scan"), true);
  assert.equal(sharedModule.isTaskType?.("asset_scan_v2"), false);
  assert.equal(sharedModule.isTaskStatus?.("running"), true);
  assert.equal(sharedModule.isTaskStatus?.("queued"), false);
  assert.equal(sharedModule.isEngineType?.("skills_static"), true);
  assert.equal(sharedModule.isEngineType?.("skills-static"), false);
  assert.equal(sharedModule.isRiskLevel?.("critical"), true);
  assert.equal(sharedModule.isRiskLevel?.("urgent"), false);
});

test("task contract normalizes task and risk summary shells for platform consumers", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before task shells can be normalized");

  if (!sharedModule) {
    return;
  }

  const normalizedTask = sharedModule.normalizeTask?.({
    task_id: "task_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "pending",
    title: "Scan demo target",
    target: {
      target_type: "url",
      target_value: "https://demo-agent.example.com"
    },
    created_at: "2026-03-26T00:00:00Z",
    updated_at: "2026-03-26T00:00:00Z",
    unexpected_field: "should be stripped"
  });

  assert.deepEqual(normalizedTask, {
    task_id: "task_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "pending",
    title: "Scan demo target",
    target: {
      target_type: "url",
      target_value: "https://demo-agent.example.com"
    },
    created_at: "2026-03-26T00:00:00Z",
    updated_at: "2026-03-26T00:00:00Z"
  });

  const normalizedRiskSummary = sharedModule.normalizeRiskSummary?.({
    task_id: "task_001",
    task_type: "asset_scan",
    status: "pending",
    risk_level: "info",
    summary: "Task accepted and waiting for engine dispatch",
    total_findings: 0,
    info_count: 0,
    low_count: 0,
    medium_count: 0,
    high_count: 0,
    critical_count: 0,
    updated_at: "2026-03-26T00:00:00Z",
    ignored: true
  });

  assert.deepEqual(normalizedRiskSummary, {
    task_id: "task_001",
    task_type: "asset_scan",
    status: "pending",
    risk_level: "info",
    summary: "Task accepted and waiting for engine dispatch",
    total_findings: 0,
    info_count: 0,
    low_count: 0,
    medium_count: 0,
    high_count: 0,
    critical_count: 0,
    updated_at: "2026-03-26T00:00:00Z"
  });
});
