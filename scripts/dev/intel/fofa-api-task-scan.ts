import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const DEFAULT_FOFA_BASE_URL = "https://en.fofa.info";
const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_OLLAMA_QUERY = 'port="11434" && protocol="http"';
const DEFAULT_FIELDS = ["host", "ip", "port", "protocol", "org"];

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type TextFileReader = (filePath: string) => Promise<string>;

function appendPath(basePath: string, ...segments: string[]): string {
  const normalizedBase = basePath.replace(/[\\/]+$/, "");

  if (normalizedBase.startsWith("/")) {
    return [normalizedBase, ...segments].join("/");
  }

  return join(normalizedBase, ...segments);
}

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
  const candidates = [appendPath(cwd, ".env.fofa.local"), appendPath(cwd, ".env.local"), appendPath(cwd, ".env")];

  if (homeDir) {
    candidates.push(appendPath(homeDir, ".config", "agent-security-platform", "fofa.env"));
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
  url.searchParams.set("fields", (options.fields ?? DEFAULT_FIELDS).join(","));

  if (options.page) {
    url.searchParams.set("page", String(options.page));
  }

  if (options.size) {
    url.searchParams.set("size", String(options.size));
  }

  return url.toString();
}

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
        intel_source: "fofa_api",
        source_ip: options.record.ip,
        source_port: options.record.port,
        source_protocol: options.record.protocol
      }
    },
    parameters: {
      probe_mode: "live",
      probe_target_id: options.probeTargetId,
      probe_port_hint: options.record.port ?? undefined,
      intel_source: "fofa_api"
    }
  };

  if (options.requestedBy) {
    taskRequest.requested_by = options.requestedBy;
  }

  return taskRequest;
}

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
