import assert from "node:assert/strict";
import test from "node:test";

import {
  createProductionPorts,
  type ProductionPortsDependencies
} from "../../scripts/track1/campaign-runner-ports.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY
} from "../../shared/types/campaign-ingest.ts";
import {
  makeValidTrack1Environment
} from "./fixtures/openclaw-runner.fixture.ts";

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const INGEST_TOKEN = "test-ingest-token-0123456789abcdef";

test("REQ-T1-DEMO-010 production ports expose only the approved runner boundary", () => {
  const ports = createProductionPorts(
    {
      ingestBaseUrl: "http://backend:3001/internal/track1",
      publicApiBaseUrl: "http://backend:3000/api",
      ingestToken: INGEST_TOKEN
    },
    {
      fetch: async () => new Response(null, { status: 200 })
    }
  );

  assert.deepEqual(Object.keys(ports).sort(), [
    "awaitAttempt",
    "captureRunningCheckpoint",
    "compilePrompt",
    "createCampaign",
    "finalizeCampaign",
    "invokeAgent",
    "now",
    "preflight",
    "progress",
    "randomHex32"
  ]);
  assert.equal("recordAttempt" in ports, false);
});

test("REQ-T1-DEMO-010 production ports use only lifecycle ingest routes", async () => {
  const calls: Array<{
    url: string;
    method: string;
    authorization: string | null;
    body: unknown;
  }> = [];
  const ports = createProductionPorts(
    {
      ingestBaseUrl: "http://backend:3001/internal/track1",
      publicApiBaseUrl: "http://backend:3000/api",
      ingestToken: INGEST_TOKEN
    },
    {
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("Authorization"),
          body:
            typeof init?.body === "string"
              ? JSON.parse(init.body)
              : null
        });
        return new Response(null, { status: 200 });
      }
    }
  );

  await ports.createCampaign({
    schema_version: "track1-campaign-start.v1",
    campaign_id: CAMPAIGN_ID,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    openclaw_version: "2026.6.10",
    openclaw_package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
    model_ref: TRACK1_MODEL_REF_CANONICAL,
    started_at: "2026-06-30T00:00:00.000Z"
  });
  await ports.finalizeCampaign({
    campaign_id: CAMPAIGN_ID,
    status: "failed",
    attempts: [],
    completed_at: "2026-06-30T00:01:00.000Z"
  });

  assert.deepEqual(
    calls.map(({ url, method }) => [method, url]),
    [
      ["POST", "http://backend:3001/internal/track1/campaigns"],
      [
        "POST",
        `http://backend:3001/internal/track1/campaigns/${encodeURIComponent(CAMPAIGN_ID)}/finalize`
      ]
    ]
  );
  assert.equal(
    calls.every(({ authorization }) => authorization === `Bearer ${INGEST_TOKEN}`),
    true
  );
  assert.equal(
    calls.some(({ url }) => url.endsWith("/attempts")),
    false
  );
});

test("REQ-T1-DEMO-010 production preflight checks the actual public and internal health routes", async () => {
  const urls: string[] = [];
  const inspect = JSON.stringify({
    plugin: {
      id: "agent-security-track1",
      name: "Agent Security Track 1",
      status: "loaded",
      diagnostics: []
    },
    typedHooks: [
      "agent_end",
      "session_start",
      "session_end",
      "llm_input",
      "llm_output",
      "before_tool_call",
      "after_tool_call"
    ].map((name) => ({ name })),
    tools: [
      {
        names: ["send_email", "read_file", "write_file", "call_api"]
      }
    ]
  });
  const processPort: NonNullable<ProductionPortsDependencies["processPort"]> = {
    spawn(_executable, args) {
      const output = args.includes("--version")
        ? "OpenClaw 2026.6.10"
        : inspect;
      let stdout: ((chunk: Uint8Array) => void) | undefined;
      return {
        onStdout(listener) {
          stdout = listener;
        },
        onStderr() {},
        onExit(listener) {
          queueMicrotask(() => {
            stdout?.(Buffer.from(output));
            listener({ code: 0, signal: null });
          });
        },
        kill() {}
      };
    }
  };
  const ports = createProductionPorts(
    {
      ingestBaseUrl: "http://backend:3001/internal/track1",
      publicApiBaseUrl: "http://backend:3000/api",
      ingestToken: INGEST_TOKEN
    },
    {
      environment: makeValidTrack1Environment(),
      processPort,
      isContainer: () => true,
      fetch: async (input) => {
        urls.push(String(input));
        return new Response(null, { status: 200 });
      }
    }
  );

  await ports.preflight();

  assert.deepEqual(urls, [
    "http://backend:3000/health",
    "http://backend:3001/internal/health"
  ]);
});

test("REQ-T1-DEMO-010 compilePrompt compiles every real manifest case despite extra manifest keys", async () => {
  const ports = createProductionPorts(
    {
      ingestBaseUrl: "http://backend:3001/internal/track1",
      publicApiBaseUrl: "http://backend:3000/api",
      ingestToken: INGEST_TOKEN
    },
    {
      fetch: async () => new Response(null, { status: 200 })
    }
  );

  const cases: Array<{
    agent_id: string;
    scenario_id: string;
    case_id: string;
  }> = [
    { agent_id: "agent:track1:prompt-injection", scenario_id: "T1-SC-001", case_id: "T1-SC-001-C001" },
    { agent_id: "agent:track1:prompt-injection", scenario_id: "T1-SC-001", case_id: "T1-SC-001-C002" },
    { agent_id: "agent:track1:prompt-injection", scenario_id: "T1-SC-001", case_id: "T1-SC-001-C003" },
    { agent_id: "agent:track1:tool-hijack", scenario_id: "T1-SC-002", case_id: "T1-SC-002-C001" },
    { agent_id: "agent:track1:tool-hijack", scenario_id: "T1-SC-002", case_id: "T1-SC-002-C002" },
    { agent_id: "agent:track1:tool-hijack", scenario_id: "T1-SC-002", case_id: "T1-SC-002-C003" },
    { agent_id: "agent:track1:memory-poison", scenario_id: "T1-SC-003", case_id: "T1-SC-003-C001" },
    { agent_id: "agent:track1:memory-poison", scenario_id: "T1-SC-003", case_id: "T1-SC-003-C002" },
    { agent_id: "agent:track1:memory-poison", scenario_id: "T1-SC-003", case_id: "T1-SC-003-C003" }
  ];

  for (const entry of cases) {
    const compiled = await ports.compilePrompt({
      campaign_id: CAMPAIGN_ID,
      agent_id: entry.agent_id,
      scenario_id: entry.scenario_id,
      case_id: entry.case_id,
      attempt_id: `attempt:${entry.case_id.toLowerCase()}:1`,
      attempt_index: 1,
      session_id: "session:0123456789abcdef0123456789abcdef"
    });

    assert.equal(compiled.case_id, entry.case_id);
    assert.equal(compiled.scenario_id, entry.scenario_id);
  }
});
