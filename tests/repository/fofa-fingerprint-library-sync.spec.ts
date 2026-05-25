import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../../scripts/dev/intel/fofa-fingerprint-library-sync.ts");

type SyncModule = {
  syncOllamaFingerprintLibrary?: (options: {
    verifiedCandidatesFile: string;
    negativeCandidatesFile: string;
    positiveLibraryDir: string;
    negativeLibraryDir: string;
    now?: () => string;
  }) => Promise<{
    verifiedWritten: number;
    negativeWritten: number;
    positiveFiles: string[];
    negativeFiles: string[];
  }>;
};

type EnrichedCandidate = {
  task_id?: string;
  target_value?: string;
  probe_url?: string;
  status?: number | null;
  error?: string;
  checked_at?: string;
  json_parse_ok?: boolean | null;
  has_models_key?: boolean | null;
  response_body_excerpt?: string | null;
  exclusion_reason?: string | null;
};

test("syncOllamaFingerprintLibrary writes verified and negative samples into fingerprint library with incremental naming", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as SyncModule;
  assert.equal(typeof module.syncOllamaFingerprintLibrary, "function", "syncOllamaFingerprintLibrary should be exported");

  if (!module.syncOllamaFingerprintLibrary) {
    return;
  }

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-ollama-lib-sync-"));
  const positiveDir = resolve(tmpDir, "fingerprint-positive");
  const negativeDir = resolve(tmpDir, "fingerprint-negative");
  await mkdir(positiveDir, { recursive: true });
  await mkdir(negativeDir, { recursive: true });

  await writeFile(
    resolve(positiveDir, "ollama.s001.json"),
    JSON.stringify({ sample_id: "s001", target_id: "ollama" }, null, 2),
    "utf8"
  );
  await writeFile(
    resolve(negativeDir, "ollama.neg.n001.json"),
    JSON.stringify({ sample_id: "n001", target_id: "ollama" }, null, 2),
    "utf8"
  );

  const verifiedCandidatesFile = resolve(tmpDir, "verified.json");
  const negativeCandidatesFile = resolve(tmpDir, "negative.json");

  // 输入夹具模拟复核阶段在 docs/temp 产出的分层结果。

  await writeFile(
    verifiedCandidatesFile,
    JSON.stringify(
      {
        query: 'app="Ollama" && is_domain=false',
        items: [
          {
            task_id: "task_v_01",
            target_value: "http://1.2.3.4:11434",
            probe_url: "http://1.2.3.4:11434/api/tags",
            status: 200,
            json_parse_ok: true,
            has_models_key: true,
            response_body_excerpt: "{\"models\":[{\"name\":\"qwen\"}]}",
            checked_at: "2026-05-09T00:00:00.000Z"
          },
          {
            task_id: "task_v_02",
            target_value: "https://4.3.2.1:443",
            probe_url: "https://4.3.2.1/api/tags",
            status: 200,
            json_parse_ok: true,
            has_models_key: true,
            response_body_excerpt: "{\"models\":[{\"name\":\"llama\"}]}",
            checked_at: "2026-05-09T00:01:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    negativeCandidatesFile,
    JSON.stringify(
      {
        query: 'app="Ollama" && is_domain=false',
        items: [
          {
            task_id: "task_n_01",
            target_value: "http://5.6.7.8:55555",
            probe_url: "http://5.6.7.8:55555/api/tags",
            status: 200,
            json_parse_ok: true,
            has_models_key: false,
            response_body_excerpt: "{\"items\":[{\"name\":\"demo\"}]}",
            exclusion_reason: "missing_models_key",
            checked_at: "2026-05-09T00:02:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const result = await module.syncOllamaFingerprintLibrary({
    verifiedCandidatesFile,
    negativeCandidatesFile,
    positiveLibraryDir: positiveDir,
    negativeLibraryDir: negativeDir,
    now: () => "2026-05-09T00:10:00.000Z"
  });

  assert.equal(result.verifiedWritten, 2);
  assert.equal(result.negativeWritten, 1);

  const positiveFiles = (await readdir(positiveDir)).sort();
  const negativeFiles = (await readdir(negativeDir)).sort();

  assert.deepEqual(positiveFiles, ["ollama.s001.json", "ollama.s002.json", "ollama.s003.json"]);
  assert.deepEqual(negativeFiles, ["ollama.neg.n001.json", "ollama.neg.n002.json"]);

  // 这里校验语义映射是否正确，而不仅仅是文件存在。

  const verifiedSample = JSON.parse(await readFile(resolve(positiveDir, "ollama.s002.json"), "utf8")) as {
    sample_id: string;
    target_id: string;
    request_summary: string;
    response_status: number;
    source: string;
    collected_at: string;
  };

  assert.equal(verifiedSample.sample_id, "s002");
  assert.equal(verifiedSample.target_id, "ollama");
  assert.equal(verifiedSample.request_summary, "GET /api/tags");
  assert.equal(verifiedSample.response_status, 200);
  assert.equal(verifiedSample.source.includes("fofa-verify"), true);

  const negativeSample = JSON.parse(await readFile(resolve(negativeDir, "ollama.neg.n002.json"), "utf8")) as {
    sample_id: string;
    target_id: string;
    exclusion_reason: string;
  };

  assert.equal(negativeSample.sample_id, "n002");
  assert.equal(negativeSample.target_id, "ollama");
  assert.equal(negativeSample.exclusion_reason.includes("missing_models_key"), true);
});

test("syncOllamaFingerprintLibrary only writes strong samples and excludes transport failures", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as SyncModule;
  assert.equal(typeof module.syncOllamaFingerprintLibrary, "function", "syncOllamaFingerprintLibrary should be exported");

  if (!module.syncOllamaFingerprintLibrary) {
    return;
  }

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-ollama-lib-sync-filter-"));
  const positiveDir = resolve(tmpDir, "fingerprint-positive");
  const negativeDir = resolve(tmpDir, "fingerprint-negative");
  await mkdir(positiveDir, { recursive: true });
  await mkdir(negativeDir, { recursive: true });

  const verifiedCandidatesFile = resolve(tmpDir, "verified-filter.json");
  const negativeCandidatesFile = resolve(tmpDir, "negative-filter.json");

  const verifiedItems: EnrichedCandidate[] = [
    {
      task_id: "v_strong",
      target_value: "http://1.2.3.4:11434",
      probe_url: "http://1.2.3.4:11434/api/tags",
      status: 200,
      json_parse_ok: true,
      has_models_key: true,
      response_body_excerpt: "{\"models\":[{\"name\":\"qwen\"}]}",
      checked_at: "2026-05-09T01:00:00.000Z"
    },
    {
      task_id: "v_weak_empty_excerpt",
      target_value: "http://1.2.3.5:11434",
      probe_url: "http://1.2.3.5:11434/api/tags",
      status: 200,
      json_parse_ok: true,
      has_models_key: true,
      response_body_excerpt: "",
      checked_at: "2026-05-09T01:01:00.000Z"
    },
    {
      task_id: "v_weak_no_models",
      target_value: "http://1.2.3.6:11434",
      probe_url: "http://1.2.3.6:11434/api/tags",
      status: 200,
      json_parse_ok: true,
      has_models_key: false,
      response_body_excerpt: "{\"items\":[]}",
      checked_at: "2026-05-09T01:02:00.000Z"
    }
  ];

  const negativeItems: EnrichedCandidate[] = [
    {
      task_id: "n_strong",
      target_value: "http://2.2.2.2:11434",
      probe_url: "http://2.2.2.2:11434/api/tags",
      status: 200,
      json_parse_ok: true,
      has_models_key: false,
      response_body_excerpt: "{\"items\":[]}",
      exclusion_reason: "missing_models_key",
      checked_at: "2026-05-09T01:03:00.000Z"
    },
    {
      task_id: "n_transport",
      target_value: "http://2.2.2.3:11434",
      probe_url: "http://2.2.2.3:11434/api/tags",
      status: null,
      error: "timeout",
      exclusion_reason: "transport_timeout",
      checked_at: "2026-05-09T01:04:00.000Z"
    }
  ];

  await writeFile(verifiedCandidatesFile, JSON.stringify({ items: verifiedItems }, null, 2), "utf8");
  await writeFile(negativeCandidatesFile, JSON.stringify({ items: negativeItems }, null, 2), "utf8");

  const result = await module.syncOllamaFingerprintLibrary({
    verifiedCandidatesFile,
    negativeCandidatesFile,
    positiveLibraryDir: positiveDir,
    negativeLibraryDir: negativeDir,
    now: () => "2026-05-09T01:10:00.000Z"
  });

  assert.equal(result.verifiedWritten, 1);
  assert.equal(result.negativeWritten, 1);

  const positiveFiles = (await readdir(positiveDir)).sort();
  const negativeFiles = (await readdir(negativeDir)).sort();

  assert.deepEqual(positiveFiles, ["ollama.s001.json"]);
  assert.deepEqual(negativeFiles, ["ollama.neg.n001.json"]);

  const positiveSample = JSON.parse(await readFile(resolve(positiveDir, "ollama.s001.json"), "utf8")) as {
    response_body_excerpt: string;
  };

  assert.equal(positiveSample.response_body_excerpt.includes("models"), true);
});
