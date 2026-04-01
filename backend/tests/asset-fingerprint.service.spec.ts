import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const servicePath = resolve(
  import.meta.dirname,
  "../src/modules/task-center/asset-fingerprint/asset-fingerprint.service.ts"
);

type MatchResult = {
  disposition: "direct" | "suspected" | "log_only" | "unknown";
  confidence: number;
  topCandidate?: {
    target_id: string;
    product_name: string;
    confidence: number;
    matched_signal_ids: string[];
  };
  details: {
    fingerprint?: {
      agent_name?: string;
      framework?: string;
      version?: string;
    };
    confidence?: number;
    matched_features?: string[];
    open_ports?: Array<{ port: number }>;
    http_endpoints?: Array<{ path: string; status_code: number }>;
    auth_detected?: boolean;
    findings?: unknown[];
  };
};

type AssetFingerprintServiceModule = {
  AssetFingerprintService?: new () => {
    evaluateSampleFromFile: (samplePath: string) => MatchResult;
  };
};

async function importIfExists<TModule>(filePath: string): Promise<TModule | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return import(pathToFileURL(filePath).href) as Promise<TModule>;
}

test("asset fingerprint service classifies P0 positive samples with rule-driven confidence", async () => {
  const serviceModule = await importIfExists<AssetFingerprintServiceModule>(servicePath);

  assert.notEqual(
    serviceModule,
    null,
    "asset fingerprint service module should exist before offline sample matching can be verified"
  );
  assert.ok(serviceModule?.AssetFingerprintService, "asset fingerprint service should expose a concrete service class");

  if (!serviceModule?.AssetFingerprintService) {
    return;
  }

  const service = new serviceModule.AssetFingerprintService();
  const positiveCases = [
    {
      samplePath: resolve(import.meta.dirname, "../../samples/assets/fingerprint-positive/ollama.s001.json"),
      expectedTargetId: "ollama",
      expectedDisposition: "direct",
      minimumConfidence: 0.8
    },
    {
      samplePath: resolve(import.meta.dirname, "../../samples/assets/fingerprint-positive/langflow.s001.json"),
      expectedTargetId: "langflow",
      expectedDisposition: "direct",
      minimumConfidence: 0.8
    },
    {
      samplePath: resolve(import.meta.dirname, "../../samples/assets/fingerprint-positive/autogpt.s001.json"),
      expectedTargetId: "autogpt",
      expectedDisposition: "direct",
      minimumConfidence: 0.8
    },
    {
      samplePath: resolve(import.meta.dirname, "../../samples/assets/fingerprint-positive/openclaw-gateway.s001.json"),
      expectedTargetId: "openclaw-gateway",
      expectedDisposition: "direct",
      minimumConfidence: 0.8
    }
  ] as const;

  for (const positiveCase of positiveCases) {
    const result = service.evaluateSampleFromFile(positiveCase.samplePath);

    assert.equal(result.topCandidate?.target_id, positiveCase.expectedTargetId);
    assert.equal(result.disposition, positiveCase.expectedDisposition);
    assert.ok(result.confidence >= positiveCase.minimumConfidence);
    assert.equal(result.details.confidence, result.confidence);
    assert.ok((result.topCandidate?.matched_signal_ids.length ?? 0) > 0);

    if (positiveCase.expectedDisposition === "direct") {
      assert.equal(result.details.fingerprint?.framework, positiveCase.expectedTargetId);
      assert.ok((result.details.matched_features?.length ?? 0) > 0);
    }
  }
});

test("asset fingerprint service suppresses negative samples below the conservative output threshold", async () => {
  const serviceModule = await importIfExists<AssetFingerprintServiceModule>(servicePath);

  assert.notEqual(
    serviceModule,
    null,
    "asset fingerprint service module should exist before negative sample suppression can be verified"
  );
  assert.ok(serviceModule?.AssetFingerprintService, "asset fingerprint service should expose a concrete service class");

  if (!serviceModule?.AssetFingerprintService) {
    return;
  }

  const service = new serviceModule.AssetFingerprintService();
  const negativeSamples = [
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/openclaw_gateway.neg.n001.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/openclaw_gateway.neg.n005.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/openclaw_gateway.neg.n006.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/openclaw_gateway.neg.n007.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/openclaw_gateway.neg.n008.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/openclaw_gateway.neg.n009.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/ollama_html.neg.n001.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/ollama.neg.n005.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/ollama.neg.n006.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/ollama.neg.n007.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/ollama.neg.n008.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/ollama.neg.n009.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/langflow.neg.n001.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/langflow.neg.n005.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/langflow.neg.n006.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/langflow.neg.n007.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/langflow.neg.n008.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/langflow.neg.n009.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/autogpt.neg.n001.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/autogpt.neg.n005.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/autogpt.neg.n006.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/autogpt.neg.n007.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/autogpt.neg.n008.json"),
    resolve(import.meta.dirname, "../../samples/assets/fingerprint-negative/autogpt.neg.n009.json")
  ];

  for (const samplePath of negativeSamples) {
    const result = service.evaluateSampleFromFile(samplePath);

    assert.ok(result.confidence < 0.7);
    assert.match(result.disposition, /log_only|unknown/);
    assert.equal(result.details.fingerprint, undefined);
  }
});