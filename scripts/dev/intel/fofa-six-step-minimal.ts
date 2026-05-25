import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { RiskLevel } from "../../../shared/types/task.ts";
import type { PortCollectorCommandRunner } from "./oss-port-collector.ts";
import { NaabuPortCollector } from "./oss-port-collector.ts";

type FofaLikeRecord = {
  host: string | null;
  ip: string | null;
  port: number | null;
  protocol: string | null;
  title: string | null;
  domain: string | null;
  country: string | null;
  city: string | null;
  link: string | null;
  org: string | null;
};

type TargetCandidate = {
  ip: string;
  port: number;
  source: FofaLikeRecord;
};

type FingerprintEvidence = {
  http_title: string | null;
  tls_subject: string | null;
  api_routes: string[];
  nmap_output: string;
};

type FingerprintMatch = {
  name: string;
  confidence: number;
  matched_signals: string[];
};

type SixStepAsset = {
  ip: string;
  port: number;
  fingerprint: FingerprintMatch;
  risk: {
    level: RiskLevel;
    reason: string;
  };
  raw_data: {
    fofa: FofaLikeRecord;
    naabu_output: string;
    nmap_output: string;
  };
};

export type SixStepOutput = {
  output_standard: string;
  generated_at: string;
  summary: {
    input_records: number;
    step1_discovered_targets: number;
    step1_converged_targets: number;
    step2_live_targets: number;
    step3_fingerprinted_targets: number;
    step4_matched_assets: number;
    step6_high_risk_assets: number;
  };
  assets: SixStepAsset[];
};

function splitSimpleCsvLine(line: string): string[] {
  // Minimal CSV parser that handles quoted fields in FOFA export.
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      columns.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  columns.push(current);
  return columns;
}

function normalizeNullable(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseFofaCsv(content: string): FofaLikeRecord[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const header = splitSimpleCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const index = new Map<string, number>();
  header.forEach((h, i) => index.set(h, i));

  const records: FofaLikeRecord[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = splitSimpleCsvLine(lines[i]);
    const portText = normalizeNullable(row[index.get("port") ?? -1]);
    const portValue = portText ? Number(portText) : null;

    records.push({
      host: normalizeNullable(row[index.get("host") ?? -1]),
      ip: normalizeNullable(row[index.get("ip") ?? -1]),
      port: Number.isFinite(portValue) ? portValue : null,
      protocol: normalizeNullable(row[index.get("protocol") ?? -1]),
      title: normalizeNullable(row[index.get("title") ?? -1]),
      domain: normalizeNullable(row[index.get("domain") ?? -1]),
      country: normalizeNullable(row[index.get("country") ?? -1]),
      city: normalizeNullable(row[index.get("city") ?? -1]),
      link: normalizeNullable(row[index.get("link") ?? -1]),
      org: normalizeNullable(row[index.get("org") ?? -1])
    });
  }

  return records;
}

function uniqueByIpPort(records: FofaLikeRecord[], maxTargets: number): TargetCandidate[] {
  const dedup = new Set<string>();
  const targets: TargetCandidate[] = [];

  for (const record of records) {
    if (!record.ip || !record.port) {
      continue;
    }

    const key = `${record.ip}:${record.port}`;
    if (dedup.has(key)) {
      continue;
    }

    dedup.add(key);
    targets.push({
      ip: record.ip,
      port: record.port,
      source: record
    });

    if (targets.length >= maxTargets) {
      break;
    }
  }

  return targets;
}

function parseNmapFingerprint(stdout: string): FingerprintEvidence {
  let httpTitle: string | null = null;
  let tlsSubject: string | null = null;
  const apiRoutes: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const titleMatch = line.match(/http-title:\s*(.+)$/i);
    if (titleMatch && !httpTitle) {
      httpTitle = titleMatch[1].trim();
    }

    const subjectMatch = line.match(/ssl-cert:\s*Subject:\s*(.+)$/i);
    if (subjectMatch && !tlsSubject) {
      tlsSubject = subjectMatch[1].trim();
    }

    const apiMatch = line.match(/\|\s+((?:\/api|\/v1)[^\s:]*)(?::|\s|$)/i);
    if (apiMatch) {
      apiRoutes.push(apiMatch[1]);
    }
  }

  return {
    http_title: httpTitle,
    tls_subject: tlsSubject,
    api_routes: [...new Set(apiRoutes)],
    nmap_output: stdout
  };
}

async function runNmapFingerprint(options: {
  runner: PortCollectorCommandRunner;
  ip: string;
  port: number;
  timeoutMs: number;
}): Promise<{ success: boolean; rawOutput: string; evidence: FingerprintEvidence }> {
  const execution = await options.runner.run(
    "nmap",
    [
      "-Pn",
      "-sV",
      "--script",
      "http-title,ssl-cert,http-enum",
      "-p",
      String(options.port),
      options.ip
    ],
    options.timeoutMs
  );

  const rawOutput = execution.stdout || execution.stderr;
  const evidence = parseNmapFingerprint(rawOutput);
  return {
    success: execution.exitCode === 0,
    rawOutput,
    evidence
  };
}

function evaluateOllamaFingerprint(port: number, evidence: FingerprintEvidence): FingerprintMatch | null {
  let score = 0;
  const matchedSignals: string[] = [];

  if (port === 11434) {
    score += 0.35;
    matchedSignals.push("open_port:11434");
  }

  if (evidence.api_routes.includes("/api/tags")) {
    score += 0.35;
    matchedSignals.push("api_path:/api/tags");
  }

  if (evidence.http_title && /ollama/i.test(evidence.http_title)) {
    score += 0.2;
    matchedSignals.push("http_title:ollama");
  }

  if (evidence.tls_subject && /ollama/i.test(evidence.tls_subject)) {
    score += 0.1;
    matchedSignals.push("tls_subject:ollama");
  }

  const confidence = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  if (confidence < 0.7) {
    return null;
  }

  return {
    name: "ollama",
    confidence,
    matched_signals: matchedSignals
  };
}

function assessRisk(match: FingerprintMatch): { level: RiskLevel; reason: string } {
  if (match.name === "ollama" && match.confidence >= 0.8) {
    return {
      level: "high",
      reason: "公网暴露的 Ollama API 具备高被滥用风险，需要最小化暴露与访问控制。"
    };
  }

  if (match.confidence >= 0.7) {
    return {
      level: "medium",
      reason: "识别到疑似智能体服务暴露，建议继续复核鉴权与访问边界。"
    };
  }

  return {
    level: "low",
    reason: "匹配置信度较低，建议保留观察。"
  };
}

class ShellCommandRunner implements PortCollectorCommandRunner {
  async run(command: string, args: string[], timeoutMs = 10_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { spawn } = await import("node:child_process");

    return await new Promise((resolvePromise) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout.on("data", (buf: Buffer) => {
        stdout += buf.toString();
      });

      child.stderr.on("data", (buf: Buffer) => {
        stderr += buf.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolvePromise({
          stdout,
          stderr,
          exitCode: code ?? 1
        });
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        resolvePromise({
          stdout,
          stderr: stderr ? `${stderr}\n${error.message}` : error.message,
          exitCode: 1
        });
      });
    });
  }
}

// 确保仅保留一个导出的 runFofaSixStepMinimal 函数
// 删除所有重复定义，避免语法冲突

export async function runFofaSixStepMinimal(options: {
  csvPath: string;
  outputPath?: string;
  maxTargets?: number;
  naabuTimeoutMs?: number;
  nmapTimeoutMs?: number;
  runner?: PortCollectorCommandRunner;
}): Promise<{ summary: SixStepOutput["summary"]; outputPath: string | null }> {
  const csvText = await readFile(options.csvPath, "utf8");
  const records = parseFofaCsv(csvText);

  const maxTargets = options.maxTargets && options.maxTargets > 0 ? Math.floor(options.maxTargets) : 50;
  const convergedTargets = uniqueByIpPort(records, maxTargets);

  const commandRunner = options.runner ?? new ShellCommandRunner();
  const naabu = new NaabuPortCollector({
    runner: commandRunner,
    timeoutMs: options.naabuTimeoutMs ?? 10_000
  });

  const assets: SixStepAsset[] = [];
  for (const target of convergedTargets) {
    const naabuResult = await naabu.collect(target.ip);
    const isLive = naabuResult.open_ports.includes(target.port);
    if (!isLive) {
      continue;
    }

    const nmap = await runNmapFingerprint({
      runner: commandRunner,
      ip: target.ip,
      port: target.port,
      timeoutMs: options.nmapTimeoutMs ?? 12_000
    });

    if (!nmap.success) {
      continue;
    }

    const match = evaluateOllamaFingerprint(target.port, nmap.evidence);
    if (!match) {
      continue;
    }

    assets.push({
      ip: target.ip,
      port: target.port,
      fingerprint: match,
      risk: assessRisk(match),
      raw_data: {
        fofa: target.source,
        naabu_output: naabuResult.raw_output,
        nmap_output: nmap.rawOutput
      }
    });
  }

  const summary: SixStepOutput["summary"] = {
    input_records: records.length,
    step1_discovered_targets: uniqueByIpPort(records, Number.MAX_SAFE_INTEGER).length,
    step1_converged_targets: convergedTargets.length,
    step2_live_targets: assets.length,
    step3_fingerprinted_targets: assets.length,
    step4_matched_assets: assets.length,
    step6_high_risk_assets: assets.filter((asset) => asset.risk.level === "high" || asset.risk.level === "critical").length
  };

  const payload: SixStepOutput = {
    output_standard: "资产测绘_指纹整理.v1-minimal",
    generated_at: new Date().toISOString(),
    summary,
    assets
  };

  if (options.outputPath) {
    const resolvedOutput = resolve(options.outputPath);
    await writeFile(resolvedOutput, JSON.stringify(payload, null, 2), "utf8");
    return { summary, outputPath: resolvedOutput };
  }

  console.log(JSON.stringify(payload, null, 2));
  return { summary, outputPath: null };
}

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
}

function readIntArg(flag: string): number | undefined {
  const raw = readArg(flag);
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === new URL(process.argv[1], "file://").href;

if (isDirectExecution) {
  const csvPath = readArg("--csv");
  const outputPath = readArg("--output");
  const maxTargets = readIntArg("--maxTargets");
  const naabuTimeoutMs = readIntArg("--naabuTimeoutMs");
  const nmapTimeoutMs = readIntArg("--nmapTimeoutMs");

  if (!csvPath) {
    console.error(
      "Usage: node --experimental-strip-types scripts/dev/intel/fofa-six-step-minimal.ts --csv <fofa.csv> [--output <json>] [--maxTargets <n>]"
    );
    process.exitCode = 1;
  } else {
    runFofaSixStepMinimal({ csvPath, outputPath, maxTargets, naabuTimeoutMs, nmapTimeoutMs })
      .then((result) => {
        console.log("[FOFA SIX STEP] step1_discovered_targets:", result.summary.step1_discovered_targets);
        console.log("[FOFA SIX STEP] step1_converged_targets:", result.summary.step1_converged_targets);
        console.log("[FOFA SIX STEP] step2_live_targets:", result.summary.step2_live_targets);
        console.log("[FOFA SIX STEP] step4_matched_assets:", result.summary.step4_matched_assets);
        console.log("[FOFA SIX STEP] step6_high_risk_assets:", result.summary.step6_high_risk_assets);
        if (result.outputPath) {
          console.log("[FOFA SIX STEP] outputPath:", result.outputPath);
        }
      })
      .catch((error) => {
        console.error("[FOFA SIX STEP] failed:", error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}

// 修复 naabuCalled 和 convergedTargets 的定义问题
let naabuCalled = 0;
let nmapCalled = 0;

// // 确保 options 参数在函数签名中正确声明
// async function runFofaSixStepMinimal(options: {
//   csvPath: string;
//   outputPath?: string;
//   maxTargets?: number;
// }) {
//   const csvPath = options.csvPath;
//   const records: FofaLikeRecord[] = await parseFofaCsv(csvPath);
//   const targetCandidates: TargetCandidate[] = records.map(record => ({
//     ip: record.ip || "",
//     port: record.port || 80,
//     source: record,
//   }));
//   const convergedTargets = targetCandidates.slice(0, options.maxTargets || 20);
//   const liveTargets = await validateTargets(convergedTargets);
//   console.log(`[FOFA SIX STEP] step2_live_targets: ${liveTargets.length}`);
// }
