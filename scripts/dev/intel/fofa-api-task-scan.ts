/**
 * FOFA 资产扫描任务编排器 (Fofa Asset Scan Orchestrator)
 * 
 * 该脚本是一个自动化数据管道，用于将 FOFA 空间测绘数据转化为本地安全扫描任务。
 * 
 * 核心功能：
 * 1. 凭证管理：自动按优先级加载 FOFA Email/Key (CLI > Env > .env files)。
 * 2. 智能搜索：默认搜索暴露的 Ollama 服务 (app="Ollama")，支持自定义 FOFA 语法。
 * 3. 数据清洗：将 FOFA 原始数组数据归一化为标准 URL (http://ip:port)。
 * 4. 任务下发：将清洗后的资产包装为 AssetScanTaskRequest，发送至本地后端 API。
 * 
 * 默认配置：
 * - FOFA 查询: app="Ollama" && is_domain=false
 * - 后端地址: http://127.0.0.1:3000
 * - 字段映射: host, ip, port, protocol, org
 * 
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const DEFAULT_FOFA_BASE_URL = "https://en.fofa.info";
// 后端地址
const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:3000";
// 查询语句
const DEFAULT_OLLAMA_QUERY = 'app="Ollama" && is_domain=false';
// 字段映射
const DEFAULT_FIELDS = ["host", "ip", "port", "protocol", "org"];

// 通过注入 fetch 与文件读取依赖，保证脚本在测试中尽量无副作用。

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type TextFileReader = (filePath: string) => Promise<string>;

type FofaApiRecord = {
  host: string | null;
  ip: string | null;
  port: number | null;
  protocol: string | null;
  title?: string | null;
  domain?: string | null;
  country?: string | null;
  city?: string | null;
  org?: string | null;
};

type FofaSearchResponse = {
  error?: boolean;
  errmsg?: string;
  query?: string;
  results?: unknown[];
};

type AssetScanTaskRequest = {
  task_type: "asset_scan";
  title: string;
  requested_by?: string;
  target: {
    target_type: "url";
    target_value: string;
    display_name?: string;
    location?: string;
    metadata?: Record<string, unknown>;
  };
  parameters: {
    probe_mode: "live";
    probe_target_id: string;
    probe_port_hint?: number;
    intel_source: "fofa_api";
  };
};

function normalizeNullable(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePort(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}

function buildTargetUrl(record: FofaApiRecord): string {
  // FOFA 可能返回完整 host URL，也可能拆分为 host/ip/protocol/port 字段。
  // 这里统一归一化为 POST /api/tasks 可直接接收的 target URL。
  const host = record.host?.trim();
  if (host && /^https?:\/\//i.test(host)) {
    return host;
  }

  const targetHost = record.ip ?? host;
  if (!targetHost) {
    throw new Error("FOFA record is missing both host and ip");
  }

  const scheme = record.protocol === "https" ? "https" : "http";
  const portSuffix = record.port ? `:${record.port}` : "";
  return `${scheme}://${targetHost}${portSuffix}`;
}

function normalizeFofaRecord(row: unknown, fields: string[]): FofaApiRecord {
  // FOFA 返回行是位置数组，因此先按请求 fields 顺序建立 field->value 映射，
  // 再做类型归一化，避免字段错位。
  if (!Array.isArray(row)) {
    throw new Error("FOFA API result row must be an array");
  }

  const index = new Map<string, unknown>();
  fields.forEach((field, position) => {
    index.set(field, row[position]);
  });

  return {
    host: normalizeNullable(index.get("host")),
    ip: normalizeNullable(index.get("ip")),
    port: normalizePort(index.get("port")),
    protocol: normalizeNullable(index.get("protocol")),
    title: normalizeNullable(index.get("title")),
    domain: normalizeNullable(index.get("domain")),
    country: normalizeNullable(index.get("country")),
    city: normalizeNullable(index.get("city")),
    org: normalizeNullable(index.get("org"))
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

  // 同时兼容 .env 与 export KEY=value 两种写法，降低本地配置成本。
function parseShellEnvText(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

  // 优先级: CLI 参数 > 进程环境变量 > 本地 env 文件 > 用户目录 env 文件。
  // 本地文件只补齐缺失值，不覆盖显式传入或现有环境变量。
export async function resolveFofaCredentials(options?: {
  email?: string;
  key?: string;
  env?: Record<string, string | undefined>;
  homeDir?: string;
  cwd?: string;
  readTextFile?: TextFileReader;
}): Promise<{ email: string; key: string; loadedFiles: string[] }> {
  const env = options?.env ?? process.env;
  const readTextFile = options?.readTextFile ?? ((filePath: string) => readFile(filePath, "utf8"));
  const cwd = options?.cwd ?? process.cwd();
  const homeDir = options?.homeDir ?? env.HOME;

  const mergedEnv: Record<string, string | undefined> = { ...env };
  const loadedFiles: string[] = [];
  const candidates = [resolve(cwd, ".env.fofa.local"), resolve(cwd, ".env.local"), resolve(cwd, ".env")];

  if (homeDir) {
    candidates.push(join(homeDir, ".config/agent-security-platform/fofa.env"));
  }

  for (const filePath of candidates) {
    try {
      const content = await readTextFile(filePath);
      const parsedValues = parseShellEnvText(content);
      for (const [key, value] of Object.entries(parsedValues)) {
        if (mergedEnv[key] === undefined || mergedEnv[key] === "") {
          mergedEnv[key] = value;
        }
      }
      loadedFiles.push(filePath);
    } catch {
      // Ignore missing or unreadable local env files and continue with the next candidate.
    }
  }

  const email = options?.email ?? mergedEnv.FOFA_EMAIL;
  const key = options?.key ?? mergedEnv.FOFA_KEY;

  if (!email || !key) {
    throw new Error("FOFA email/key are required. Use --email/--key, env vars, or a local env file.");
  }

  return { email, key, loadedFiles };
}

/**
 * 构建 FOFA 搜索 API 的完整 URL。
 * 自动处理 query 的 base64 编码、字段排序和分页参数。
 */
export function buildFofaSearchUrl(options: {
  baseUrl?: string;
  email: string;
  key: string;
  query: string;
  fields?: string[];
  page?: number;
  size?: number;
}): string {
  const baseUrl = options.baseUrl ?? DEFAULT_FOFA_BASE_URL;
  const url = new URL("/api/v1/search/all", baseUrl);

  url.searchParams.set("email", options.email);
  url.searchParams.set("key", options.key);
  url.searchParams.set("qbase64", Buffer.from(options.query, "utf8").toString("base64"));
  // 使用确定性字段顺序，保证测试夹具与解析行为稳定。
  url.searchParams.set("fields", (options.fields ?? DEFAULT_FIELDS).join(","));

  if (options.page) {
    url.searchParams.set("page", String(options.page));
  }

  if (options.size) {
    url.searchParams.set("size", String(options.size));
  }

  return url.toString();
}

/**
 * 将单个 FOFA 资产记录转换为 AssetScanTaskRequest 格式。
 * 目标 URL 归一化为 http://ip:port 或 https://... 形式。
 * 通过 metadata 保留来源 ip/port/protocol，便于审计与下游处理。
 */
export function buildAssetScanTaskRequest(options: {
  record: FofaApiRecord;
  probeTargetId: string;
  requestedBy?: string;
}): AssetScanTaskRequest {
  const targetValue = buildTargetUrl(options.record);
  const taskRequest: AssetScanTaskRequest = {
    task_type: "asset_scan",
    title: `FOFA ${options.probeTargetId} scan ${targetValue}`,
    target: {
      target_type: "url",
      target_value: targetValue,
      display_name: `${options.probeTargetId} candidate ${targetValue}`,
      metadata: {
        // 保留 FOFA 来源信息，便于后续审计与离线样本处理。
        intel_source: "fofa_api",
        source_ip: options.record.ip,
        source_port: options.record.port,
        source_protocol: options.record.protocol
      }
    },
    parameters: {
      probe_mode: "live",
      probe_target_id: options.probeTargetId,
      // probe_port_hint 让下游扫描流程优先尝试来源端口。
      probe_port_hint: options.record.port ?? undefined,
      intel_source: "fofa_api"
    }
  };

  if (options.requestedBy) {
    taskRequest.requested_by = options.requestedBy;
  }

  return taskRequest;
}

/**
 * 主编排函数：
 * 1. 调用 FOFA API 获取资产列表；
 * 2. 逐条创建本地后端扫描任务；
 * 3. 返回统计信息和任务清单。
 */
export async function runFofaApiTaskScan(options: {
  fofaEmail: string;
  fofaKey: string;
  backendBaseUrl: string;
  query?: string;
  page?: number;
  size?: number;
  fields?: string[];
  probeTargetId?: string;
  requestedBy?: string;
  fetchImpl?: FetchLike;
  fofaBaseUrl?: string;
}): Promise<{
  query: string;
  fetched: number;
  created: number;
  tasks: Array<{
    task_id: string;
    target_value: string;
    source_ip: string | null;
    source_port: number | null;
  }>;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const query = options.query ?? DEFAULT_OLLAMA_QUERY;
  const fields = options.fields ?? DEFAULT_FIELDS;
  const probeTargetId = options.probeTargetId ?? "ollama";

  const fofaUrl = buildFofaSearchUrl({
    baseUrl: options.fofaBaseUrl,
    email: options.fofaEmail,
    key: options.fofaKey,
    query,
    fields,
    page: options.page,
    size: options.size
  });

  const fofaResponse = await fetchImpl(fofaUrl, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  if (!fofaResponse.ok) {
    throw new Error(`FOFA API request failed with status ${fofaResponse.status}`);
  }

  const fofaPayload = (await fofaResponse.json()) as FofaSearchResponse;
  if (fofaPayload.error) {
    throw new Error(fofaPayload.errmsg ?? "FOFA API returned an error response");
  }

  const records = (fofaPayload.results ?? []).map((row) => normalizeFofaRecord(row, fields));
  // 返回任务级 source_ip/source_port，供 naabu+nmap 复核与样本入库流程继续使用。
  const taskResults: Array<{ task_id: string; target_value: string; source_ip: string | null; source_port: number | null }> = [];

  for (const record of records) {
    const taskRequest = buildAssetScanTaskRequest({
      record,
      probeTargetId,
      requestedBy: options.requestedBy
    });

    const createTaskResponse = await fetchImpl(new URL("/api/tasks", options.backendBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(taskRequest)
    });

    if (!createTaskResponse.ok) {
      throw new Error(`Backend task API request failed with status ${createTaskResponse.status}`);
    }

    const createTaskPayload = (await createTaskResponse.json()) as {
      success?: boolean;
      data?: { task_id?: string };
    };

    if (createTaskPayload.success !== true || !readString(createTaskPayload.data?.task_id)) {
      throw new Error("Backend task API returned an invalid response shell");
    }

    taskResults.push({
      task_id: createTaskPayload.data.task_id, 
      target_value: taskRequest.target.target_value,
      source_ip: record.ip,
      source_port: record.port
    });
  }

  return {
    query,
    fetched: records.length,
    created: taskResults.length,
    tasks: taskResults
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      key: { type: "string" },
      backend: { type: "string", default: DEFAULT_BACKEND_BASE_URL },
      query: { type: "string", default: DEFAULT_OLLAMA_QUERY },
      probeTargetId: { type: "string", default: "ollama" },
      requestedBy: { type: "string", default: "fofa-dev-script" },
      page: { type: "string", default: "1" },
      size: { type: "string", default: "20" },
      fields: { type: "string", default: DEFAULT_FIELDS.join(",") },
      fofaBaseUrl: { type: "string", default: DEFAULT_FOFA_BASE_URL },
      help: { type: "boolean", short: "h" }
    }
  });

  if (values.help) {
    console.log([
      "Usage: node --experimental-strip-types scripts/dev/intel/fofa-api-task-scan.ts [options]",
      "",
      "Options:",
      "  --email <fofa_email>        FOFA account email. Defaults to FOFA_EMAIL env.",
      "  --key <fofa_key>            FOFA API key. Defaults to FOFA_KEY env.",
      `  --backend <url>             Backend base URL. Defaults to ${DEFAULT_BACKEND_BASE_URL}.`,
      `  --query <query>             FOFA query. Defaults to ${DEFAULT_OLLAMA_QUERY}.`,
      "  --probeTargetId <id>        Probe target id passed to asset_scan. Defaults to ollama.",
      "  --requestedBy <name>        requested_by field for POST /api/tasks.",
      "  --page <n>                  FOFA page number. Defaults to 1.",
      "  --size <n>                  FOFA page size. Defaults to 20.",
      "  --fields <csv>              FOFA fields list. Defaults to host,ip,port,protocol,org.",
      `  --fofaBaseUrl <url>         FOFA base URL. Defaults to ${DEFAULT_FOFA_BASE_URL}.`
    ].join("\n"));
    return;
  }

  const credentials = await resolveFofaCredentials({
    email: values.email,
    key: values.key
  });

  const result = await runFofaApiTaskScan({
    fofaEmail: credentials.email,
    fofaKey: credentials.key,
    backendBaseUrl: values.backend,
    query: values.query,
    page: Number(values.page),
    size: Number(values.size),
    fields: String(values.fields)
      .split(",")
      .map((field) => field.trim())
      .filter((field) => field.length > 0),
    probeTargetId: values.probeTargetId,
    requestedBy: values.requestedBy,
    fofaBaseUrl: values.fofaBaseUrl
  });

  console.log(JSON.stringify(result, null, 2));
}

const isDirectExecution = typeof process.argv[1] === "string" && import.meta.url === new URL(process.argv[1], "file://").href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error("[FOFA API TASK SCAN] failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
