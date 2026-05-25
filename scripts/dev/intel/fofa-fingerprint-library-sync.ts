// 负责把复核后的结果写进长期样本库

// 结果：
// strong_positive：真的符合 Ollama 特征的目标，写到 fingerprint-positive
// strong_negative：有明确响应，但不符合 Ollama 结构的目标，写到 fingerprint-negative
// transport_failure：超时、拒绝连接、TLS 失败这类，只保留证据，不进样本库

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type CandidateItem = {
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

type CandidateFile = {
  query?: string;
  items?: CandidateItem[];
};

function extractNextIndex(files: string[], prefix: string, suffix: string): number {
  // 文件命名约定是样本序号的唯一事实来源。
  // 正样本示例: ollama.s002.json，负样本示例: ollama.neg.n010.json。

  // 过滤出匹配前缀和后缀的文件名
  // 提取出中间的数字部分
  // 返回最大值 + 1，若无文件则从 1 开始
  const indexes = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(suffix))
    .map((file) => {
      const middle = file.slice(prefix.length, file.length - suffix.length);
      const parsed = Number(middle);
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .filter((value) => value > 0);

  if (indexes.length === 0) {
    return 1;
  }

  return Math.max(...indexes) + 1;
}

function toIso(now?: () => string): string {
  return now ? now() : new Date().toISOString();
}

function buildRequestSummary(probeUrl?: string): string {
  // 将请求摘要标准化为样本 README 约定的稳定格式。
  if (!probeUrl) {
    return "GET /api/tags";
  }

  try {
    const url = new URL(probeUrl);
    return `GET ${url.pathname || "/"}`;
  } catch {
    return "GET /api/tags";
  }
}

function isStrongPositive(item: CandidateItem): boolean {
  const excerpt = (item.response_body_excerpt ?? "").trim();
  return item.status === 200 && item.json_parse_ok === true && item.has_models_key === true && excerpt.length > 0;
}

function isTransportFailure(item: CandidateItem): boolean {
  const message = `${item.error ?? ""} ${item.exclusion_reason ?? ""}`.toLowerCase();
  return (
    item.status === null ||
    message.includes("timeout") ||
    message.includes("refused") ||
    message.includes("tls") ||
    message.includes("handshake")
  );
}

function isStrongNegative(item: CandidateItem): boolean {
  const reason = (item.exclusion_reason ?? "").trim();
  return !isTransportFailure(item) && typeof item.status === "number" && reason.length > 0;
}

export async function syncOllamaFingerprintLibrary(options: {
  verifiedCandidatesFile: string;
  negativeCandidatesFile: string;
  positiveLibraryDir: string;
  negativeLibraryDir: string;
  now?: () => string;
}): Promise<{
  verifiedWritten: number;
  negativeWritten: number;
  positiveFiles: string[];
  negativeFiles: string[];
}> {
  // 该同步步骤用于把 docs/temp 下的临时复核产物
  // 转换并写入 samples/assets/fingerprint-* 下的长期样本库。
  const positiveLibraryDir = resolve(options.positiveLibraryDir);
  const negativeLibraryDir = resolve(options.negativeLibraryDir);

  await mkdir(positiveLibraryDir, { recursive: true });
  await mkdir(negativeLibraryDir, { recursive: true });

  const verifiedInput = JSON.parse(await readFile(resolve(options.verifiedCandidatesFile), "utf8")) as CandidateFile;
  const negativeInput = JSON.parse(await readFile(resolve(options.negativeCandidatesFile), "utf8")) as CandidateFile;

  const verifiedItems = (verifiedInput.items ?? []).filter((item) => isStrongPositive(item));
  const negativeItems = (negativeInput.items ?? []).filter((item) => isStrongNegative(item));

  const [existingPositive, existingNegative] = await Promise.all([
    readdir(positiveLibraryDir),
    readdir(negativeLibraryDir)
  ]);

  let nextPositive = extractNextIndex(existingPositive, "ollama.s", ".json");
  let nextNegative = extractNextIndex(existingNegative, "ollama.neg.n", ".json");

  const positiveFiles: string[] = [];
  const negativeFiles: string[] = [];

  for (const item of verifiedItems) {
    const sampleId = `s${String(nextPositive).padStart(3, "0")}`;
    const fileName = `ollama.${sampleId}.json`;
    const filePath = resolve(positiveLibraryDir, fileName);

    const payload = {
      sample_id: sampleId,
      target_id: "ollama",
      request_summary: buildRequestSummary(item.probe_url),
      response_status: item.status ?? 200,
      response_headers: {
        "content-type": "application/json"
      },
      // 这里只保存标准化元数据，体量较大的原始证据仍保留在 workflow 输出中。
      response_body_excerpt: (item.response_body_excerpt ?? "").slice(0, 512),
      source: `fofa-verify: ${item.target_value ?? "unknown-target"}`,
      collected_at: item.checked_at ?? toIso(options.now)
    };

    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    positiveFiles.push(filePath);
    nextPositive += 1;
  }

  for (const item of negativeItems) {
    const sampleId = `n${String(nextNegative).padStart(3, "0")}`;
    const fileName = `ollama.neg.${sampleId}.json`;
    const filePath = resolve(negativeLibraryDir, fileName);

    const payload = {
      sample_id: sampleId,
      target_id: "ollama",
      request_summary: buildRequestSummary(item.probe_url),
      response_status: item.status ?? 0,
      response_headers: {},
      response_body_excerpt: (item.response_body_excerpt ?? "").slice(0, 512),
      source: `fofa-verify: ${item.target_value ?? "unknown-target"}`,
      collected_at: item.checked_at ?? toIso(options.now),
      exclusion_reason: item.exclusion_reason ?? item.error ?? "verification_condition_not_met"
    };

    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    negativeFiles.push(filePath);
    nextNegative += 1;
  }

  return {
    verifiedWritten: verifiedItems.length,
    negativeWritten: negativeItems.length,
    positiveFiles,
    negativeFiles
  };
}
