import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../../scripts/dev/intel/fofa-mainline-portscan.ts");

type TaskScanTask = {
  task_id: string;
  target_value: string;
  source_ip?: string | null;
  source_port?: number | null;
};

type MainlinePortscanModule = {
  extractJsonObjectFromMixedOutput?: (raw: string) => unknown;
  buildPortscanTargetsFromTaskScan?: (options: {
    taskScanPayload: { query?: string; tasks?: TaskScanTask[] };
    probeTargetId: string;
    requestedBy: string;
  }) => Array<{
    source_query: string;
    source_ip: string;
    source_port: number;
    protocol: string;
    target_value: string;
    probe_target_id: string;
    task_id: string;
    requested_by: string;
  }>;
};

test("REQ-ASSET-SCAN-PORT-007 extracts JSON body from mixed CLI output", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as MainlinePortscanModule;
  assert.equal(typeof module.extractJsonObjectFromMixedOutput, "function");

  if (!module.extractJsonObjectFromMixedOutput) {
    return;
  }

  const payload = module.extractJsonObjectFromMixedOutput(
    [
      "> run:fofa:api:task-scan",
      "{",
      '  "query": "app=\\"Ollama\\"",',
      '  "tasks": []',
      "}"
    ].join("\n")
  ) as { query?: string };

  assert.equal(payload.query, 'app="Ollama"');
});

test("REQ-ASSET-SCAN-PORT-007 builds workflow targets and falls back to target URL host/port", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as MainlinePortscanModule;
  assert.equal(typeof module.buildPortscanTargetsFromTaskScan, "function");

  if (!module.buildPortscanTargetsFromTaskScan) {
    return;
  }

  const targets = module.buildPortscanTargetsFromTaskScan({
    taskScanPayload: {
      query: 'app="Ollama"',
      tasks: [
        {
          task_id: "task_1",
          target_value: "http://198.51.100.10:11434",
          source_ip: "198.51.100.10",
          source_port: 11434
        },
        {
          task_id: "task_2",
          target_value: "https://198.51.100.20:9443"
        }
      ]
    },
    probeTargetId: "ollama",
    requestedBy: "fofa-dev-script"
  });

  assert.equal(targets.length, 2);
  assert.equal(targets[0].source_ip, "198.51.100.10");
  assert.equal(targets[0].source_port, 11434);
  assert.equal(targets[1].source_ip, "198.51.100.20");
  assert.equal(targets[1].source_port, 9443);
  assert.equal(targets[1].protocol, "https");
});
