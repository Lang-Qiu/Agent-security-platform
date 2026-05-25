import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../../scripts/dev/intel/fofa-api-task-scan.ts");
const DEFAULT_OLLAMA_APP_QUERY = 'app="Ollama" && is_domain=false';

type FetchCall = {
  input: string | URL;
  init?: RequestInit;
};

type FofaApiTaskScanModule = {
  resolveFofaCredentials?: (options?: {
    email?: string;
    key?: string;
    env?: Record<string, string | undefined>;
    homeDir?: string;
    cwd?: string;
    readTextFile?: (filePath: string) => Promise<string>;
  }) => Promise<{ email: string; key: string; loadedFiles: string[] }>;
  buildFofaSearchUrl?: (options: {
    baseUrl?: string;
    email: string;
    key: string;
    query: string;
    fields?: string[];
    page?: number;
    size?: number;
  }) => string;
  buildAssetScanTaskRequest?: (options: {
    record: {
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
    probeTargetId: string;
    requestedBy?: string;
  }) => {
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
  runFofaApiTaskScan?: (options: {
    fofaEmail: string;
    fofaKey: string;
    backendBaseUrl: string;
    query?: string;
    page?: number;
    size?: number;
    fields?: string[];
    probeTargetId?: string;
    requestedBy?: string;
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  }) => Promise<{
    query: string;
    fetched: number;
    created: number;
    tasks: Array<{
      task_id: string;
      target_value: string;
      source_ip: string | null;
      source_port: number | null;
    }>;
  }>;
};

test("resolveFofaCredentials loads FOFA credentials from a local env file fallback", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as FofaApiTaskScanModule;

  assert.equal(typeof module.resolveFofaCredentials, "function", "resolveFofaCredentials should be exported");

  if (!module.resolveFofaCredentials) {
    return;
  }

  const files = new Map<string, string>([
    [
      "/home/tester/.config/agent-security-platform/fofa.env",
      "export FOFA_EMAIL='env@example.com'\nexport FOFA_KEY='env-secret'\n"
    ]
  ]);

  const credentials = await module.resolveFofaCredentials({
    env: {},
    cwd: "/workspace/app",
    homeDir: "/home/tester",
    readTextFile: async (filePath) => {
      const content = files.get(filePath);
      if (!content) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return content;
    }
  });

  assert.deepEqual(credentials, {
    email: "env@example.com",
    key: "env-secret",
    loadedFiles: ["/home/tester/.config/agent-security-platform/fofa.env"]
  });
});

test("resolveFofaCredentials prefers .env.fofa.local over other local env files", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as FofaApiTaskScanModule;

  assert.equal(typeof module.resolveFofaCredentials, "function", "resolveFofaCredentials should be exported");

  if (!module.resolveFofaCredentials) {
    return;
  }

  const files = new Map<string, string>([
    ["/workspace/app/.env.fofa.local", "FOFA_EMAIL=fofa-local@example.com\nFOFA_KEY=fofa-local-secret\n"],
    ["/workspace/app/.env.local", "FOFA_EMAIL=env-local@example.com\nFOFA_KEY=env-local-secret\n"],
    ["/workspace/app/.env", "FOFA_EMAIL=env@example.com\nFOFA_KEY=env-secret\n"]
  ]);

  const credentials = await module.resolveFofaCredentials({
    env: {},
    cwd: "/workspace/app",
    readTextFile: async (filePath) => {
      const content = files.get(filePath);
      if (!content) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return content;
    }
  });

  assert.deepEqual(credentials, {
    email: "fofa-local@example.com",
    key: "fofa-local-secret",
    loadedFiles: ["/workspace/app/.env.fofa.local", "/workspace/app/.env.local", "/workspace/app/.env"]
  });
});

test("buildFofaSearchUrl encodes the ollama query and selected fields for the official FOFA search API", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as FofaApiTaskScanModule;

  assert.equal(typeof module.buildFofaSearchUrl, "function", "buildFofaSearchUrl should be exported");

  if (!module.buildFofaSearchUrl) {
    return;
  }

  const url = new URL(
    module.buildFofaSearchUrl({
      baseUrl: "https://en.fofa.info",
      email: "dev@example.com",
      key: "secret-key",
      query: DEFAULT_OLLAMA_APP_QUERY,
      fields: ["host", "ip", "port", "protocol", "org"],
      page: 2,
      size: 50
    })
  );

  assert.equal(url.origin, "https://en.fofa.info");
  assert.equal(url.pathname, "/api/v1/search/all");
  assert.equal(url.searchParams.get("email"), "dev@example.com");
  assert.equal(url.searchParams.get("key"), "secret-key");
  assert.equal(url.searchParams.get("fields"), "host,ip,port,protocol,org");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("size"), "50");
  assert.equal(Buffer.from(url.searchParams.get("qbase64") ?? "", "base64").toString("utf8"), DEFAULT_OLLAMA_APP_QUERY);
});

test("buildAssetScanTaskRequest maps a FOFA ollama record into the current asset_scan API contract", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as FofaApiTaskScanModule;

  assert.equal(typeof module.buildAssetScanTaskRequest, "function", "buildAssetScanTaskRequest should be exported");

  if (!module.buildAssetScanTaskRequest) {
    return;
  }

  const request = module.buildAssetScanTaskRequest({
    record: {
      host: "https://47.96.196.35:11434",
      ip: "47.96.196.35",
      port: 11434,
      protocol: "https",
      org: "Hangzhou Alibaba Advertising Co.,Ltd.",
      city: "Hangzhou",
      country: "CN"
    },
    probeTargetId: "ollama",
    requestedBy: "fofa-dev-script"
  });

  assert.equal(request.task_type, "asset_scan");
  assert.equal(request.requested_by, "fofa-dev-script");
  assert.equal(request.target.target_type, "url");
  assert.equal(request.target.target_value, "https://47.96.196.35:11434");
  assert.equal(request.target.display_name?.includes("ollama"), true);
  assert.deepEqual(request.target.metadata, {
    intel_source: "fofa_api",
    source_ip: "47.96.196.35",
    source_port: 11434,
    source_protocol: "https"
  });
  assert.deepEqual(request.parameters, {
    probe_mode: "live",
    probe_target_id: "ollama",
    probe_port_hint: 11434,
    intel_source: "fofa_api"
  });
});

test("runFofaApiTaskScan queries FOFA and submits mapped asset_scan tasks to the backend API", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as FofaApiTaskScanModule;

  assert.equal(typeof module.runFofaApiTaskScan, "function", "runFofaApiTaskScan should be exported");

  if (!module.runFofaApiTaskScan) {
    return;
  }

  const calls: FetchCall[] = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ input, init });

    const url = String(input);
    if (url.startsWith("https://en.fofa.info/api/v1/search/all")) {
      return new Response(
        JSON.stringify({
          error: false,
          mode: "extended",
          page: 1,
          size: 2,
          query: DEFAULT_OLLAMA_APP_QUERY,
          results: [
            ["https://47.96.196.35:11434", "47.96.196.35", 11434, "https", "Hangzhou Alibaba Advertising Co.,Ltd."],
            ["47.113.241.78:11434", "47.113.241.78", 11434, "http", "Hangzhou Alibaba Advertising Co.,Ltd."]
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    if (url === "http://127.0.0.1:3000/api/tasks") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const taskTarget = body.target as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            task_id: `task_${String(taskTarget.target_value).replace(/[^a-zA-Z0-9]/g, "_")}`,
            target: taskTarget
          }
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const result = await module.runFofaApiTaskScan({
    fofaEmail: "dev@example.com",
    fofaKey: "secret-key",
    backendBaseUrl: "http://127.0.0.1:3000",
    query: DEFAULT_OLLAMA_APP_QUERY,
    size: 2,
    probeTargetId: "ollama",
    requestedBy: "fofa-dev-script",
    fields: ["host", "ip", "port", "protocol", "org"],
    fetchImpl
  });

  assert.equal(result.query, DEFAULT_OLLAMA_APP_QUERY);
  assert.equal(result.fetched, 2);
  assert.equal(result.created, 2);
  assert.deepEqual(
    result.tasks.map((task) => ({ target_value: task.target_value, source_ip: task.source_ip, source_port: task.source_port })),
    [
      {
        target_value: "https://47.96.196.35:11434",
        source_ip: "47.96.196.35",
        source_port: 11434
      },
      {
        target_value: "http://47.113.241.78:11434",
        source_ip: "47.113.241.78",
        source_port: 11434
      }
    ]
  );

  assert.equal(calls.length, 3);
  assert.equal(String(calls[1].input), "http://127.0.0.1:3000/api/tasks");
  assert.equal(String(calls[2].input), "http://127.0.0.1:3000/api/tasks");

  const firstTaskBody = JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>;
  assert.deepEqual(firstTaskBody.parameters, {
    probe_mode: "live",
    probe_target_id: "ollama",
    probe_port_hint: 11434,
    intel_source: "fofa_api"
  });
});

test("runFofaApiTaskScan defaults to app-based Ollama query when query is omitted", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as FofaApiTaskScanModule;

  assert.equal(typeof module.runFofaApiTaskScan, "function", "runFofaApiTaskScan should be exported");

  if (!module.runFofaApiTaskScan) {
    return;
  }

  const calls: FetchCall[] = [];
  const fetchImpl = async (input: string | URL): Promise<Response> => {
    calls.push({ input });
    const url = String(input);

    if (url.startsWith("https://en.fofa.info/api/v1/search/all")) {
      return new Response(
        JSON.stringify({
          error: false,
          mode: "extended",
          page: 1,
          size: 1,
          query: DEFAULT_OLLAMA_APP_QUERY,
          results: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const result = await module.runFofaApiTaskScan({
    fofaEmail: "dev@example.com",
    fofaKey: "secret-key",
    backendBaseUrl: "http://127.0.0.1:3000",
    size: 1,
    fetchImpl
  });

  assert.equal(result.query, DEFAULT_OLLAMA_APP_QUERY);
  assert.equal(calls.length, 1);

  const fofaUrl = new URL(String(calls[0].input));
  const decodedQuery = Buffer.from(fofaUrl.searchParams.get("qbase64") ?? "", "base64").toString("utf8");
  assert.equal(decodedQuery, DEFAULT_OLLAMA_APP_QUERY);
});