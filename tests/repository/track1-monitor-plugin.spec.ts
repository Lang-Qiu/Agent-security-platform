import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { normalizeBaseResult } from "../../shared/contracts/result.ts";

// -- paths -----------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

function readModuleFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>();

  function walk(currentDir: string) {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith(".ts")) {
        files.set(fullPath, readFileSync(fullPath, "utf8"));
      }
    }
  }

  walk(dir);
  return files;
}

// -- Step 1: Safety scan tests ---------------------------------------------

const MONITORING_DIR = resolve(REPO_ROOT, "engines", "sandbox", "src", "monitoring");
const DEMO_DIR = resolve(REPO_ROOT, "samples", "track1", "monitor-plugin");

const monitoringFiles = readModuleFiles(MONITORING_DIR);
const demoFiles = readModuleFiles(DEMO_DIR);

const allSourceFiles = new Map([...monitoringFiles, ...demoFiles]);

test("monitoring source contains no network or shell imports", () => {
  const forbidden = [
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "node:child_process",
    "from \"openai\"",
    "from \"@anthropic-ai",
    "from \"nodemailer\"",
    "require(\"http\")",
    "require(\"https\")",
    "require(\"net\")"
  ];

  for (const [path, content] of allSourceFiles) {
    for (const pattern of forbidden) {
      assert.ok(
        !content.includes(pattern),
        `${path} should not contain ${pattern}`
      );
    }
  }
});

test("monitoring source contains no real network/shell/fs calls", () => {
  const forbidden = [
    "fetch(",
    "new WebSocket(",
    "exec(",
    "execSync(",
    "spawn(",
    "spawnSync(",
    "fork(",
    "process.argv",
    "process.env"
  ];

  for (const [path, content] of allSourceFiles) {
    for (const pattern of forbidden) {
      assert.ok(
        !content.includes(pattern),
        `${path} should not contain ${pattern}`
      );
    }
  }
});

test("monitoring runtime contains no console or process stdio logging", () => {
  for (const [path, content] of monitoringFiles) {
    // Allow only the demo entrypoint to have process.stdout
    if (path.includes("demo.ts")) continue;
    assert.ok(
      !content.includes("console.log") &&
      !content.includes("console.error") &&
      !content.includes("console.warn") &&
      !content.includes("process.stdout") &&
      !content.includes("process.stderr"),
      `${path} should not contain console or process stdio logging`
    );
  }
});

test("monitoring source contains no credentials or tokens", () => {
  const forbidden = [
    "api_key",
    "apiKey",
    "API_KEY",
    "token:",
    "Bearer",
    "password",
    "secret"
  ];

  for (const [path, content] of allSourceFiles) {
    for (const pattern of forbidden) {
      assert.ok(
        !content.includes(pattern),
        `${path} should not contain ${pattern}`
      );
    }
  }
});

test("monitoring source imports no backend or frontend module", () => {
  for (const [path, content] of allSourceFiles) {
    assert.ok(
      !content.includes("backend/") && !content.includes("frontend/"),
      `${path} should not import backend or frontend`
    );
  }
});

// -- Step 2: Behavioral assertion using the demo ---------------------------

test("all nine demo results normalize and are raw-content free", async () => {
  const { runAllTrack1MonitorCases } = await import(
    "../../engines/sandbox/src/monitoring/index.ts"
  );
  const { loadTrack1ReplayScenario } = await import(
    "../../engines/sandbox/src/replay/loader.ts"
  );

  const results = await runAllTrack1MonitorCases();
  assert.equal(results.length, 9);

  const serialized = JSON.stringify(results);

  for (const sid of ["T1-SC-001", "T1-SC-002", "T1-SC-003"] as const) {
    const bundle = loadTrack1ReplayScenario(sid);
    for (const fixture of bundle.cases) {
      assert.ok(!serialized.includes(fixture.input.user_prompt));
      assert.ok(!serialized.includes(fixture.expected_outcome.model_behavior));
      for (const mem of fixture.input.memory_entries) {
        assert.ok(!serialized.includes(mem.content));
      }
    }
  }

  for (const result of results) {
    assert.ok(normalizeBaseResult(result));
  }
});
