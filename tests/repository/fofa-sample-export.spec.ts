import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../../scripts/dev/intel/fofa-sample-export.ts");

type SampleExportModule = {
  exportFofaSamples?: (options: {
    outputDir: string;
    exposureCandidates: Array<Record<string, unknown>>;
    verifiedFingerprints: Array<Record<string, unknown>>;
    rawEvidence: Array<Record<string, unknown>>;
  }) => Promise<{ candidatePath: string; verifiedPath: string; evidencePath: string }>;
};

test("REQ-ASSET-SCAN-PORT-007 sample export writes three separated JSON files", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as SampleExportModule;
  assert.equal(typeof module.exportFofaSamples, "function", "exportFofaSamples should be exported");

  if (!module.exportFofaSamples) {
    return;
  }

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-sample-export-"));

  const result = await module.exportFofaSamples({
    outputDir: tmpDir,
    exposureCandidates: [
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.10",
        source_port: 11434,
        protocol: "http",
        target_value: "http://198.51.100.10:11434",
        probe_target_id: "ollama_api_tags",
        task_id: "task_1",
        status: "candidate",
        requested_by: "fofa-dev-script"
      }
    ],
    verifiedFingerprints: [
      {
        sample_id: "ollama.s001",
        target_id: "198.51.100.10:11434",
        response_status: 200,
        response_headers: { "content-type": "application/json" },
        response_body_excerpt: '{"models":[{"name":"qwen2.5"}]}',
        source: "fofa_scan",
        collected_at: "2026-05-08T10:00:00.000Z"
      }
    ],
    rawEvidence: [
      {
        naabu_output: "198.51.100.10:11434",
        nmap_output: "11434/tcp open  unknown",
        probe_response_excerpt: '{"models":[{"name":"qwen2.5"}]}'
      }
    ]
  });

  const [candidateText, verifiedText, evidenceText] = await Promise.all([
    readFile(result.candidatePath, "utf8"),
    readFile(result.verifiedPath, "utf8"),
    readFile(result.evidencePath, "utf8")
  ]);

  const candidates = JSON.parse(candidateText) as Array<Record<string, unknown>>;
  const verified = JSON.parse(verifiedText) as Array<Record<string, unknown>>;
  const evidence = JSON.parse(evidenceText) as Array<Record<string, unknown>>;

  assert.equal(candidates.length, 1);
  assert.equal(verified.length, 1);
  assert.equal(evidence.length, 1);
  assert.equal(candidates[0].status, "candidate");
  assert.equal(verified[0].sample_id, "ollama.s001");
});

test("REQ-ASSET-SCAN-PORT-007 sample export keeps candidate and verified layers strictly separated", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as SampleExportModule;
  assert.equal(typeof module.exportFofaSamples, "function", "exportFofaSamples should be exported");

  if (!module.exportFofaSamples) {
    return;
  }

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-sample-export-"));

  const result = await module.exportFofaSamples({
    outputDir: tmpDir,
    exposureCandidates: [
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.99",
        source_port: 11434,
        status: "candidate"
      }
    ],
    verifiedFingerprints: [],
    rawEvidence: []
  });

  const [candidateText, verifiedText] = await Promise.all([
    readFile(result.candidatePath, "utf8"),
    readFile(result.verifiedPath, "utf8")
  ]);

  const candidates = JSON.parse(candidateText) as Array<Record<string, unknown>>;
  const verified = JSON.parse(verifiedText) as Array<Record<string, unknown>>;

  assert.equal(candidates.length, 1, "candidate should remain persisted");
  assert.equal(verified.length, 0, "no verified fingerprints should be promoted without validation");
}
);
