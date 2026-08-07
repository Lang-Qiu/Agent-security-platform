import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type RecordValue = Record<string, unknown>;

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const PATCH_PATH = join(
  PACKAGE_ROOT,
  "patches",
  "openclaw-2026.6.34-general-security.patch"
);
const OPENCLAW_VERSION = "2026.6.34";
const SECURITY_PLUGIN_ID = "agent-security-sandbox-general";
const BLOCKED_TEXT = "Blocked by sandbox security policy.";
const UNAVAILABLE_TEXT =
  "Security evaluation unavailable. This action was not completed.";
const TURN_CONTEXT_SCHEMA = "openclaw-security-turn-context.v1";
const HOOK_EVENT_SCHEMA = "openclaw-security-hook-event.v1";
const ASSISTANT_PROJECTION_SCHEMA =
  "openclaw-security-assistant-projection.v1";
const TOOL_BARRIER_MARKER = "openclaw-security-tool-barrier.v1";

const AGENT_TOOLS_FILE = "agent-tools.before-tool-call-59sE70R-.js";
const TOOL_SPLIT_FILE = "tool-split-BKKaUdyz.js";
const LIFECYCLE_FILE = "lifecycle-hook-helpers-Dowa8zK4.js";
const HOOK_RUNNER_FILE = "hook-runner-global-D_43rcnU.js";

const fixtures: string[] = [];

process.on("exit", () => {
  for (const root of fixtures) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

type Fixture = { root: string; openclawDir: string };

function installedOpenClawRoot(): string {
  const link = join(PACKAGE_ROOT, "node_modules", "openclaw");
  assert.equal(
    existsSync(link),
    true,
    "nested OpenClaw must be installed before P4-T5 behavior specs run"
  );
  const real = realpathSync(link);
  const manifest = JSON.parse(
    readFileSync(join(real, "package.json"), "utf8")
  ) as RecordValue;
  assert.equal(manifest.name, "openclaw");
  assert.equal(manifest.version, OPENCLAW_VERSION);
  return real;
}

function buildFixture(applyPatch: boolean): Fixture {
  const source = installedOpenClawRoot();
  const root = mkdtempSync(join(tmpdir(), "g4-p45-"));
  fixtures.push(root);
  const nodeModules = join(root, "node_modules");
  const openclawDir = join(nodeModules, "openclaw");
  mkdirSync(nodeModules, { recursive: true });
  cpSync(source, openclawDir, { recursive: true, dereference: true });

  for (const entry of readdirSync(dirname(source))) {
    if (entry === "openclaw") continue;
    try {
      symlinkSync(join(dirname(source), entry), join(nodeModules, entry), "dir");
    } catch {
      // The OpenClaw chunk only needs the dependencies it imports.
    }
  }

  if (applyPatch) {
    execFileSync("git", ["apply", "--whitespace=nowarn", PATCH_PATH], {
      cwd: openclawDir,
      stdio: "pipe"
    });
  }
  return { root, openclawDir };
}

let patchedFixture: Fixture | null = null;
let pristineFixture: Fixture | null = null;

function patched(): Fixture {
  patchedFixture ??= buildFixture(true);
  return patchedFixture;
}

function pristine(): Fixture {
  pristineFixture ??= buildFixture(false);
  return pristineFixture;
}

async function importChunk(
  fixture: Fixture,
  file: string
): Promise<RecordValue> {
  return (await import(
    pathToFileURL(join(fixture.openclawDir, "dist", file)).href
  )) as RecordValue;
}

function sha256OfFile(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

type TypedHook = {
  hookName: string;
  pluginId: string;
  handler: (event: unknown, ctx: unknown) => unknown;
  priority?: number;
};

type Modules = {
  lifecycle: RecordValue;
  agentTools: RecordValue;
  toolSplit: RecordValue;
  hookRunner: RecordValue;
};

async function modules(): Promise<Modules> {
  return {
    lifecycle: await importChunk(patched(), LIFECYCLE_FILE),
    agentTools: await importChunk(patched(), AGENT_TOOLS_FILE),
    toolSplit: await importChunk(patched(), TOOL_SPLIT_FILE),
    hookRunner: await importChunk(patched(), HOOK_RUNNER_FILE)
  };
}

function assertFunction(module: RecordValue, name: string): Function {
  const value = module[name];
  assert.equal(typeof value, "function", `${name} must be exported`);
  return value as Function;
}

function makeRegistry(typedHooks: TypedHook[]): RecordValue {
  return {
    hooks: [],
    typedHooks,
    plugins: [{ id: SECURITY_PLUGIN_ID, status: "loaded" }],
    trustedToolPolicies: []
  };
}

async function configureRunner(
  hookRunner: RecordValue,
  options: {
    securityDecision?: (event: RecordValue, ctx: RecordValue) => unknown;
    onOrdinary?: (event: RecordValue, ctx: RecordValue) => unknown;
  } = {}
): Promise<void> {
  const reset = assertFunction(hookRunner, "a");
  const initialize = assertFunction(hookRunner, "i");
  reset();
  const ordinary = options.onOrdinary ?? ((event) => ({ params: event.params }));
  const security =
    options.securityDecision ??
    (() => ({
      schema_version: "openclaw-security-hook-result.v1",
      correlation: {
        runId: "run-1",
        sessionKey: "session-1",
        callId: "call-1"
      },
      health: { enforcement: "healthy", audit: "healthy" },
      barrier: { outcome: "pass" }
    }));
  initialize(
    makeRegistry([
      {
        hookName: "before_tool_call",
        pluginId: SECURITY_PLUGIN_ID,
        priority: 100,
        handler: (event, ctx) =>
          ordinary(event as RecordValue, ctx as RecordValue)
      },
      {
        hookName: "before_tool_execution",
        pluginId: SECURITY_PLUGIN_ID,
        priority: 100,
        handler: (event, ctx) =>
          security(event as RecordValue, ctx as RecordValue)
      }
    ])
  );
}

function turnTuple(overrides: RecordValue = {}): RecordValue {
  return {
    prompt: "read the final secret",
    runId: "run-1",
    sessionKey: "session-1",
    ...overrides
  };
}

async function withTurn<T>(
  lifecycle: RecordValue,
  callback: () => Promise<T>,
  overrides: RecordValue = {}
): Promise<T> {
  const create = assertFunction(
    lifecycle,
    "createOpenClawSecurityTurnCapsule"
  );
  const runWith = assertFunction(
    lifecycle,
    "runWithOpenClawSecurityTurnCapsule"
  );
  const activate = assertFunction(
    lifecycle,
    "activateOpenClawSecurityTurnCapsule"
  );
  const capsule = create();
  return (await runWith(capsule, async () => {
    activate(turnTuple(overrides));
    return callback();
  })) as T;
}

function toolContext(overrides: RecordValue = {}): RecordValue {
  return {
    runId: "run-1",
    sessionKey: "session-1",
    sessionId: "session-id-1",
    ...overrides
  };
}

type ToolRun = {
  tool: RecordValue;
  order: string[];
  securityEvents: RecordValue[];
  executions: RecordValue[];
};

function makeTool(order: string[], executions: RecordValue[]): RecordValue {
  return {
    name: "read_file",
    description: "Read a file",
    parameters: { type: "object" },
    prepareBeforeToolCallParams: async (params: RecordValue) => params,
    finalizeBeforeToolCallParams: (
      params: RecordValue
    ): RecordValue => {
      order.push("finalize");
      return { ...params, secret: "final" };
    },
    execute: async (_toolCallId: unknown, params: RecordValue) => {
      order.push("execute");
      executions.push(params);
      return { content: [{ type: "text", text: "tool result" }] };
    }
  };
}

async function runDefinition(
  modulesValue: Modules,
  options: {
    wrapped: boolean;
    barrier?: RecordValue;
    turn?: RecordValue;
    toolCallId?: string;
    onSecurity?: (event: RecordValue, ctx: RecordValue) => void;
  }
): Promise<ToolRun & { result: RecordValue; replacement: RecordValue | null }> {
  const order: string[] = [];
  const executions: RecordValue[] = [];
  const securityEvents: RecordValue[] = [];
  await configureRunner(modulesValue.hookRunner, {
    onOrdinary: (event) => {
      order.push("ordinary");
      return { params: event.params };
    },
    securityDecision: (event, ctx) => {
      order.push("security");
      const record = event as RecordValue;
      securityEvents.push(record);
      options.onSecurity?.(record, ctx as RecordValue);
      return {
        schema_version: "openclaw-security-hook-result.v1",
        correlation: {
          runId: "run-1",
          sessionKey: "session-1",
          callId: options.toolCallId ?? "call-1"
        },
        health: { enforcement: "healthy", audit: "healthy" },
        barrier: options.barrier ?? { outcome: "pass" }
      };
    }
  });

  const context = toolContext(options.turn ? { ...options.turn } : {});
  const sourceTool = makeTool(order, executions);
  let tool = sourceTool;
  if (options.wrapped) {
    const wrap = assertFunction(
      modulesValue.agentTools,
      "h"
    );
    tool = wrap(sourceTool, context) as RecordValue;
  }
  const toToolDefinitions = assertFunction(modulesValue.toolSplit, "o");
  const definition = toToolDefinitions([tool], context)[0] as RecordValue;
  const execute = assertFunction(definition, "execute");
  const readReplacement = assertFunction(
    modulesValue.lifecycle,
    "readOpenClawSecurityFixedReplacement"
  );
  let replacement: RecordValue | null = null;
  const result = await withTurn(
    modulesValue.lifecycle,
    async () => {
      const value = await execute(
        options.toolCallId ?? "call-1",
        { secret: "raw", path: "/tmp/file" },
        void 0,
        void 0
      ) as RecordValue;
      replacement = readReplacement() as RecordValue | null;
      return value;
    },
    options.turn
  );
  return { tool, order, securityEvents, executions, result, replacement };
}

test("REQ-SBX-GENERAL-004 P4-T5 unwrapped tools finalize before the awaited security barrier", async () => {
  let securityContext: RecordValue | undefined;
  const value = await runDefinition(await modules(), {
    wrapped: false,
    onSecurity: (_event, ctx) => {
      securityContext = ctx;
    }
  });
  assert.deepEqual(value.order, ["ordinary", "finalize", "security", "execute"]);
  assert.deepEqual(value.securityEvents[0], {
    schema_version: HOOK_EVENT_SCHEMA,
    runId: "run-1",
    sessionKey: "session-1",
    callId: "call-1",
    assistant: {
      schema_version: ASSISTANT_PROJECTION_SCHEMA,
      text_parts: [],
      tool_calls: [
        {
          call_id: "call-1",
          tool_name: "read_file",
          arguments: { secret: "final", path: "/tmp/file" }
        }
      ]
    },
    tool: {
      call_id: "call-1",
      tool_name: "read_file",
      arguments: { secret: "final", path: "/tmp/file" }
    }
  });
  assert.deepEqual(securityContext, {
    schema_version: TURN_CONTEXT_SCHEMA,
    prompt: "read the final secret",
    runId: "run-1",
    sessionKey: "session-1"
  });
  assert.equal(value.executions[0]?.secret, "final");
});

test("REQ-SBX-GENERAL-004 P4-T5 wrapped tools use the same final security barrier exactly once", async () => {
  const value = await runDefinition(await modules(), { wrapped: true });
  assert.deepEqual(value.order, ["ordinary", "finalize", "security", "execute"]);
  assert.equal(value.securityEvents.length, 1);
  assert.equal((value.securityEvents[0]?.tool as RecordValue).arguments instanceof Object, true);
});

test("REQ-SBX-GENERAL-004 P4-T5 a deny replacement blocks execution and exposes only the fixed result", async () => {
  const modulesValue = await modules();
  const value = await runDefinition(modulesValue, {
    wrapped: false,
    barrier: {
      outcome: "replace",
      replacement_code: "sandbox_security_policy_blocked",
      replacement_text: BLOCKED_TEXT
    }
  });
  assert.deepEqual(value.order, ["ordinary", "finalize", "security"]);
  assert.equal(value.executions.length, 0);
  const serialized = JSON.stringify(value.result);
  assert.equal(serialized.includes("raw"), false);
  assert.equal(serialized.includes("final"), false);
  assert.equal((value.result.details as RecordValue).status, "blocked");
  assert.equal(
    (value.result.content as Array<RecordValue>)[0]?.text,
    BLOCKED_TEXT
  );
});

test("REQ-SBX-GENERAL-004 P4-T5 missing carrier and identity drift use the tool deny floor", async () => {
  const modulesValue = await modules();
  await configureRunner(modulesValue.hookRunner, {
    securityDecision: () => {
      throw new Error("security hook must not run without a host tuple");
    }
  });
  const toToolDefinitions = assertFunction(modulesValue.toolSplit, "o");
  const executions: RecordValue[] = [];
  const order: string[] = [];
  const tool = makeTool(order, executions);
  const definition = toToolDefinitions([tool], toolContext())[0] as RecordValue;
  const execute = assertFunction(definition, "execute");
  const missing = await execute("call-1", { secret: "raw" }, void 0, void 0);
  assert.equal((missing.details as RecordValue).status, "blocked");
  assert.equal(
    (missing.content as Array<RecordValue>)[0]?.text,
    BLOCKED_TEXT
  );
  assert.equal(executions.length, 0);

  const drift = await runDefinition(modulesValue, {
    wrapped: false,
    turn: { runId: "run-other" }
  });
  assert.equal((drift.result.details as RecordValue).status, "blocked");
  assert.equal(drift.executions.length, 0);
});

test("REQ-SBX-GENERAL-004 P4-T5 concurrent same-session tool barriers retain their own prompt and run", async () => {
  const modulesValue = await modules();
  const seen: Array<{ event: RecordValue; ctx: RecordValue }> = [];
  await configureRunner(modulesValue.hookRunner, {
    securityDecision: async (event, ctx) => {
      await new Promise((resolve) => setTimeout(resolve, event.runId === "run-a" ? 8 : 1));
      seen.push({ event, ctx });
      return {
        schema_version: "openclaw-security-hook-result.v1",
        correlation: { runId: event.runId, sessionKey: event.sessionKey, callId: event.callId },
        health: { enforcement: "healthy", audit: "healthy" },
        barrier: { outcome: "pass" }
      };
    }
  });
  const toToolDefinitions = assertFunction(modulesValue.toolSplit, "o");
  const run = async (label: string): Promise<void> => {
    const order: string[] = [];
    const executions: RecordValue[] = [];
    const tool = makeTool(order, executions);
    const context = toolContext({ runId: `run-${label}`, sessionKey: "session-shared" });
    const definition = toToolDefinitions([tool], context)[0] as RecordValue;
    const execute = assertFunction(definition, "execute");
    await withTurn(
      modulesValue.lifecycle,
      () => execute(`call-${label}`, { secret: label }, void 0, void 0) as Promise<unknown>,
      { prompt: `prompt-${label}`, runId: `run-${label}`, sessionKey: "session-shared" }
    );
  };
  await Promise.all([run("a"), run("b")]);
  assert.deepEqual(
    seen.map((event) => [
      event.event.runId,
      event.event.sessionKey,
      event.ctx.prompt
    ]).sort(),
    [
      ["run-a", "session-shared", "prompt-a"],
      ["run-b", "session-shared", "prompt-b"]
    ]
  );
});

test("REQ-SBX-GENERAL-004 P4-T5 host replacement creates the private marker and rejects a second barrier", async () => {
  const modulesValue = await modules();
  const value = await runDefinition(modulesValue, {
    wrapped: true,
    barrier: {
      outcome: "replace",
      replacement_code: "sandbox_security_policy_blocked",
      replacement_text: BLOCKED_TEXT
    }
  });
  assert.equal(value.replacement?.provenance, "openclaw-security-fixed-replacement.v1");
  assert.equal((value.result.details as RecordValue).status, "blocked");
  assert.equal(JSON.stringify(value.result).includes("raw"), false);
  const source = readFileSync(
    join(patched().openclawDir, "dist", AGENT_TOOLS_FILE),
    "utf8"
  );
  assert.equal(source.includes(TOOL_BARRIER_MARKER), true);
});

test("REQ-SBX-GENERAL-004 P4-T5 unpatched tool adapters have no final security barrier", () => {
  for (const file of [AGENT_TOOLS_FILE, TOOL_SPLIT_FILE]) {
    assert.equal(
      readFileSync(join(pristine().openclawDir, "dist", file), "utf8").includes(
        "runBeforeToolExecution"
      ),
      false
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T5 patch touches only the two new reviewed tool files", () => {
  const targets = [
    ...new Set(
      readFileSync(PATCH_PATH, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("+++ b/"))
        .map((line) => line.slice("+++ b/".length).trim())
    )
  ].sort();
  assert.deepEqual(targets.includes(`dist/${AGENT_TOOLS_FILE}`), true);
  assert.deepEqual(targets.includes(`dist/${TOOL_SPLIT_FILE}`), true);
  assert.deepEqual(targets.includes("dist/registry-BiuJAn1Z.js"), false);
  assert.equal(
    targets.every((target) => target.startsWith("dist/")),
    true
  );
});
