import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { registerTrack1Tools } from "../src/tool-adapters.ts";
import {
  makeCampaignToolRuntime,
  makeRecordingPluginApi,
  nextCallId
} from "./fixtures/openclaw-plugin.fixture.ts";

// -- manifest + registration -----------------------------------------------

test("REQ-T1-DEMO-010 plugin registers exactly four native simulated tools", () => {
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, makeCampaignToolRuntime());

  assert.deepEqual(
    api.tools.map((tool) => tool.name).sort(),
    ["call_api", "read_file", "send_email", "write_file"]
  );
  assert.equal(new Set(api.tools.map((tool) => tool.name)).size, 4);
  for (const tool of api.tools) {
    assert.equal(tool.parameters.additionalProperties, false);
  }
});

test("REQ-T1-DEMO-010 manifest has no unknown key and exactly four tool contracts", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../openclaw.plugin.json", import.meta.url),
      "utf8"
    )
  ) as Record<string, unknown>;

  const allowedKeys = new Set([
    "id",
    "name",
    "version",
    "description",
    "main",
    "activation",
    "contracts",
    "configSchema"
  ]);
  for (const key of Object.keys(manifest)) {
    assert.equal(allowedKeys.has(key), true, `unknown manifest key: ${key}`);
  }
  assert.equal(manifest.id, "agent-security-track1");
  assert.equal(manifest.main, "./src/plugin.ts");
  const contracts = manifest.contracts as { tools: string[] };
  assert.deepEqual(
    [...contracts.tools].sort(),
    ["call_api", "read_file", "send_email", "write_file"]
  );
});

test("REQ-T1-DEMO-010 configSchema rejects unknown properties and marks token writeOnly", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../openclaw.plugin.json", import.meta.url),
      "utf8"
    )
  ) as {
    configSchema: {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { type?: string; writeOnly?: boolean; default?: string }>;
    };
  };
  assert.equal(manifest.configSchema.type, "object");
  assert.equal(manifest.configSchema.additionalProperties, false);
  assert.deepEqual(
    [...manifest.configSchema.required].sort(),
    ["ingestEndpoint", "ingestToken"]
  );
  assert.equal(manifest.configSchema.properties.ingestToken.writeOnly, true);
  assert.equal(
    manifest.configSchema.properties.ingestEndpoint.default,
    "http://backend:3001/internal/track1/campaigns"
  );
});

// -- forbidden imports -----------------------------------------------------

test("REQ-T1-DEMO-010 tool adapters cannot import real-world side-effect surfaces", async () => {
  const source = await readFile(
    new URL("../src/tool-adapters.ts", import.meta.url),
    "utf8"
  );
  const forbidden = [
    "node:fs",
    "node:child_process",
    "node:net",
    "node:http",
    "node:https",
    "fetch(",
    "nodemailer",
    "playwright",
    "puppeteer",
    "mcp"
  ];
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, token);
  }
});

// -- send_email: positive + boundary --------------------------------------

test("REQ-T1-DEMO-010 send_email appends one item to in-memory outbox", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, runtime);

  const tool = api.tools.find((t) => t.name === "send_email")!;
  const result = await tool.execute(
    {
      recipient: "user@local.invalid",
      subject: "Test subject",
      body: "Test body"
    },
    { call_id: nextCallId() }
  );

  const snapshot = runtime.state.snapshot();
  assert.equal(snapshot.outbox.length, 1);
  assert.equal(snapshot.outbox[0]!.recipient, "user@local.invalid");

  const payload = result as { content: Array<{ type: string; text: string }> };
  assert.equal(payload.content[0]!.type, "text");
  // Safe JSON must not echo the body
  const safeJson = payload.content[0]!.text;
  assert.equal(safeJson.includes("Test body"), false);
  assert.equal(safeJson.includes("simulated_success"), true);
});

test("REQ-T1-DEMO-010 send_email rejects non-local recipient", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, runtime);

  const tool = api.tools.find((t) => t.name === "send_email")!;
  const result = await tool.execute(
    {
      recipient: "attacker@evil.com",
      subject: "Bypass",
      body: "Payload"
    },
    { call_id: nextCallId() }
  );

  const snapshot = runtime.state.snapshot();
  assert.equal(snapshot.outbox.length, 0);
  const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("rejected"), true);
});

// -- read_file: positive + boundary ---------------------------------------

test("REQ-T1-DEMO-010 read_file returns seeded virtual file content", async () => {
  const runtime = makeCampaignToolRuntime({
    files: { "sandbox://fixtures/seeded.txt": "seeded-content" }
  });
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, runtime);

  const tool = api.tools.find((t) => t.name === "read_file")!;
  const result = await tool.execute(
    { path: "sandbox://fixtures/seeded.txt" },
    { call_id: nextCallId() }
  );

  const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("simulated_success"), true);
  // Safe JSON must not echo the file content
  assert.equal(safeJson.includes("seeded-content"), false);
});

test("REQ-T1-DEMO-010 read_file rejects traversal and unknown host paths", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, runtime);

  const tool = api.tools.find((t) => t.name === "read_file")!;
  for (const path of [
    "sandbox://fixtures/../etc/passwd",
    "/etc/passwd",
    "C:\\Windows\\System32\\config\\SAM"
  ]) {
    const result = await tool.execute({ path }, { call_id: nextCallId() });
    const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
    assert.equal(safeJson.includes("rejected"), true, path);
  }
});

// -- write_file: positive + boundary --------------------------------------

test("REQ-T1-DEMO-010 write_file only changes virtual file state", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, runtime);

  const tool = api.tools.find((t) => t.name === "write_file")!;
  const result = await tool.execute(
    {
      path: "sandbox://fixtures/output.txt",
      content: "written-content"
    },
    { call_id: nextCallId() }
  );

  const snapshot = runtime.state.snapshot();
  assert.equal(snapshot.files["sandbox://fixtures/output.txt"], "written-content");
  const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("simulated_success"), true);
  assert.equal(safeJson.includes("written-content"), false);
});

test("REQ-T1-DEMO-010 write_file rejects host paths", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, runtime);

  const tool = api.tools.find((t) => t.name === "write_file")!;
  const result = await tool.execute(
    {
      path: "/etc/passwd",
      content: "pwned"
    },
    { call_id: nextCallId() }
  );
  const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("rejected"), true);
  assert.equal(runtime.state.snapshot().files["/etc/passwd"], undefined);
});

// -- call_api: positive + boundary ----------------------------------------

test("REQ-T1-DEMO-010 call_api returns fixed mock route", async () => {
  const runtime = makeCampaignToolRuntime({
    api_routes: [
      {
        endpoint: "mock://api.local/status",
        method: "GET",
        status_code: 200,
        body: { status: "ok" }
      }
    ]
  });
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, runtime);

  const tool = api.tools.find((t) => t.name === "call_api")!;
  const result = await tool.execute(
    { endpoint: "mock://api.local/status", method: "GET" },
    { call_id: nextCallId() }
  );

  const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("simulated_success"), true);
  assert.equal(safeJson.includes("200"), true);
});

test("REQ-T1-DEMO-010 call_api rejects arbitrary URLs", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, runtime);

  const tool = api.tools.find((t) => t.name === "call_api")!;
  const result = await tool.execute(
    { endpoint: "https://evil.com/exfil", method: "GET" },
    { call_id: nextCallId() }
  );
  const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("rejected"), true);
});

// -- campaign isolation ----------------------------------------------------

test("REQ-T1-DEMO-010 two runtimes with different campaign ids cannot observe each other", async () => {
  const runtimeA = makeCampaignToolRuntime({
    campaign_id: "campaign:A",
    agent_id: "agent:A",
    attempt_id: "attempt:A",
    files: { "sandbox://fixtures/shared.txt": "from-A" }
  });
  const runtimeB = makeCampaignToolRuntime({
    campaign_id: "campaign:B",
    agent_id: "agent:B",
    attempt_id: "attempt:B"
  });

  const apiA = makeRecordingPluginApi();
  const apiB = makeRecordingPluginApi();
  registerTrack1Tools(apiA, runtimeA);
  registerTrack1Tools(apiB, runtimeB);

  // A writes to its outbox
  await apiA.tools
    .find((t) => t.name === "send_email")!
    .execute(
      { recipient: "a@local.invalid", subject: "A", body: "from-A" },
      { call_id: nextCallId() }
    );

  // B must not see A's outbox
  assert.equal(runtimeB.state.snapshot().outbox.length, 0);
  assert.equal(runtimeA.state.snapshot().outbox.length, 1);

  // B cannot read A's files
  const readResult = await apiB.tools
    .find((t) => t.name === "read_file")!
    .execute(
      { path: "sandbox://fixtures/shared.txt" },
      { call_id: nextCallId() }
    );
  const safeJson = (readResult as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("rejected"), true);
  assert.equal(safeJson.includes("from-A"), false);
});
