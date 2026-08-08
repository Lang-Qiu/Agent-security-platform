import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
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
const TURN_CONTEXT_SCHEMA = "openclaw-security-turn-context.v1";
const HOOK_EVENT_SCHEMA = "openclaw-security-hook-event.v1";
const REPLACEMENT_MARKER = "openclaw-security-fixed-replacement.v1";
const REVIEW_TEXT = "Security review required. This action was not completed.";
const UNAVAILABLE_TEXT =
  "Security evaluation unavailable. This action was not completed.";

const LIFECYCLE_FILE = "lifecycle-hook-helpers-Dowa8zK4.js";
const HOOK_RUNNER_FILE = "hook-runner-global-D_43rcnU.js";
const COMMAND_REGISTRATION_FILE = "command-registration-BBago94k.js";
const DISPATCH_FILE = "dispatch-BSYjC-fp.js";
const AGENT_RUNNER_FILE = "agent-runner.runtime-BUWW8f6n.js";
const AGENT_TOOLS_FILE = "agent-tools.before-tool-call-59sE70R-.js";
const DELIVER_FILE = "deliver-CJEsHkyF.js";
const DELIVERY_FILE = "delivery-CExBlTq2.js";

const fixtures: string[] = [];
process.on("exit", () => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true });
});

type Fixture = { root: string; openclawDir: string };

function installedOpenClawRoot(): string {
  const link = join(PACKAGE_ROOT, "node_modules", "openclaw");
  assert.equal(
    existsSync(link),
    true,
    "nested OpenClaw must be installed before P4-T6 behavior specs run"
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
  const root = mkdtempSync(join(tmpdir(), "g4-p46-"));
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
      // The tested chunks only need the dependencies already installed nearby.
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

function assertFunction(module: RecordValue, name: string): Function {
  const value = module[name];
  assert.equal(typeof value, "function", `${name} must be exported`);
  return value as Function;
}

function makeRegistry(
  handler: (event: RecordValue, ctx: RecordValue) => unknown
): RecordValue {
  return {
    hooks: [],
    typedHooks: [
      {
        hookName: "before_message_delivery",
        pluginId: SECURITY_PLUGIN_ID,
        priority: 100,
        handler
      }
    ],
    plugins: [{ id: SECURITY_PLUGIN_ID, status: "loaded" }],
    trustedToolPolicies: []
  };
}

async function configureRunner(
  hookRunner: RecordValue,
  handler: (event: RecordValue, ctx: RecordValue) => unknown
): Promise<void> {
  assertFunction(hookRunner, "a")();
  assertFunction(hookRunner, "i")(makeRegistry(handler));
}

function context(overrides: RecordValue = {}): RecordValue {
  return {
    schema_version: TURN_CONTEXT_SCHEMA,
    prompt: "current exact prompt",
    runId: "run-1",
    sessionKey: "session-1",
    ...overrides
  };
}

function payload(overrides: RecordValue = {}): RecordValue {
  return {
    text: "final rewritten payload",
    channelData: { telegram: { threadId: "thread-1" } },
    ...overrides
  };
}

function passEnvelope(): RecordValue {
  return {
    schema_version: "openclaw-security-hook-result.v1",
    correlation: { runId: "run-1", sessionKey: "session-1", callId: null },
    health: { enforcement: "healthy", audit: "healthy" },
    barrier: { outcome: "pass" }
  };
}

function replaceEnvelope(
  code = "security_review_required",
  text = REVIEW_TEXT
): RecordValue {
  return {
    schema_version: "openclaw-security-hook-result.v1",
    correlation: { runId: "run-1", sessionKey: "session-1", callId: null },
    health: { enforcement: "healthy", audit: "healthy" },
    barrier: {
      outcome: "replace",
      replacement_code: code,
      replacement_text: text
    }
  };
}

type BarrierResult = RecordValue & {
  outcome: "pass" | "replace";
  text?: string;
  replacement_code?: string;
  provenance?: string;
};

async function invokeOutbound(
  lifecycle: RecordValue,
  runner: RecordValue,
  options: {
    caller: "deliver" | "delivery" | "dispatch";
    value?: RecordValue;
    ctx?: RecordValue;
    localRunId?: string;
    localSessionKey?: string;
    inCurrentScope?: boolean;
  }
): Promise<BarrierResult> {
  const call = async (): Promise<BarrierResult> => {
    const helperName =
      options.caller === "deliver"
        ? "runOpenClawSecurityOutboundBarrier"
        : options.caller === "delivery"
          ? "runOpenClawSecurityTelegramMessageBarrier"
          : "runOpenClawSecurityDispatchMessageBarrier";
    const helper = assertFunction(
      options.caller === "deliver"
        ? await importChunk(patched(), DELIVER_FILE)
        : options.caller === "delivery"
          ? await importChunk(patched(), DELIVERY_FILE)
          : await importChunk(patched(), DISPATCH_FILE),
      helperName
    );
    const result = (await helper({
      payload: options.value ?? payload(),
      ctx: options.ctx ?? context(),
      runId: options.localRunId ?? "run-1",
      sessionKey: options.localSessionKey ?? "session-1",
      hookRunner: assertFunction(runner, "t")()
    })) as BarrierResult;
    return result;
  };
  if (options.inCurrentScope === true) return call();
  if (Object.hasOwn(options, "ctx") && options.ctx === undefined) return call();
  const create = assertFunction(lifecycle, "createOpenClawSecurityTurnCapsule");
  const runWith = assertFunction(lifecycle, "runWithOpenClawSecurityTurnCapsule");
  const activate = assertFunction(lifecycle, "activateOpenClawSecurityTurnCapsule");
  const capsule = create();
  return (await runWith(capsule, async () => {
    const current = options.ctx ?? context();
    activate({
      prompt: current.prompt,
      runId: current.runId,
      sessionKey: current.sessionKey
    });
    return call();
  })) as BarrierResult;
}

test("REQ-SBX-GENERAL-004 P4-T6 the patch catalogs exactly the reviewed outbound callers", async () => {
  const patchedSource = readFileSync(
    join(patched().openclawDir, "dist", DELIVER_FILE),
    "utf8"
  );
  const sourceFiles = [DISPATCH_FILE, DELIVER_FILE, DELIVERY_FILE, AGENT_RUNNER_FILE];
  for (const file of sourceFiles) {
    const source = readFileSync(join(patched().openclawDir, "dist", file), "utf8");
    assert.equal(typeof source, "string");
  }
  assert.match(patchedSource, /runOpenClawSecurityOutboundBarrier/);
  assert.match(
    readFileSync(join(patched().openclawDir, "dist", DELIVERY_FILE), "utf8"),
    /runOpenClawSecurityTelegramMessageBarrier/
  );
  assert.match(
    readFileSync(join(patched().openclawDir, "dist", DISPATCH_FILE), "utf8"),
    /runOpenClawSecurityDispatchMessageBarrier/
  );
  const patchTargets = [
    ...new Set(
      readFileSync(PATCH_PATH, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("+++ b/"))
        .map((line) => line.slice("+++ b/".length).trim())
    )
  ].sort();
  assert.deepEqual(patchTargets, [
    `dist/${AGENT_RUNNER_FILE}`,
    `dist/${AGENT_TOOLS_FILE}`,
    `dist/${COMMAND_REGISTRATION_FILE}`,
    `dist/${DELIVER_FILE}`,
    `dist/${DELIVERY_FILE}`,
    `dist/${DISPATCH_FILE}`,
    `dist/${HOOK_RUNNER_FILE}`,
    `dist/${LIFECYCLE_FILE}`,
    "dist/plugin-sdk/hook-types-H9SC6W-p.d.ts",
    "dist/run-attempt-6K7vbtby.js",
    "dist/selection-DopzNY3I.js",
    `dist/${"tool-split-BKKaUdyz.js"}`,
    "dist/cli-runner-B0eKIePw.js"
  ].sort());
  assert.deepEqual(
    [
      LIFECYCLE_FILE,
      "dist/plugin-sdk/hook-types-H9SC6W-p.d.ts",
      `dist/${COMMAND_REGISTRATION_FILE}`,
      `dist/${HOOK_RUNNER_FILE}`,
      `dist/${DISPATCH_FILE}`,
      `dist/${AGENT_RUNNER_FILE}`,
      `dist/${DELIVER_FILE}`,
      `dist/${DELIVERY_FILE}`,
      "dist/selection-DopzNY3I.js",
      "dist/cli-runner-B0eKIePw.js",
      "dist/run-attempt-6K7vbtby.js",
      "dist/agent-tools.before-tool-call-59sE70R-.js",
      "dist/tool-split-BKKaUdyz.js"
    ].sort(),
    [
      LIFECYCLE_FILE,
      "dist/plugin-sdk/hook-types-H9SC6W-p.d.ts",
      `dist/${COMMAND_REGISTRATION_FILE}`,
      `dist/${HOOK_RUNNER_FILE}`,
      `dist/${DISPATCH_FILE}`,
      `dist/${AGENT_RUNNER_FILE}`,
      `dist/${DELIVER_FILE}`,
      `dist/${DELIVERY_FILE}`,
      "dist/selection-DopzNY3I.js",
      "dist/cli-runner-B0eKIePw.js",
      "dist/run-attempt-6K7vbtby.js",
      "dist/agent-tools.before-tool-call-59sE70R-.js",
      "dist/tool-split-BKKaUdyz.js"
    ].sort()
  );
});

test("REQ-SBX-GENERAL-004 P4-T6 queued follow-up owns one capsule across model run and routed delivery", () => {
  const source = readFileSync(
    join(patched().openclawDir, "dist", AGENT_RUNNER_FILE),
    "utf8"
  );
  for (const marker of [
    "createOpenClawSecurityTurnCapsule",
    "runWithOpenClawSecurityTurnCapsule",
    "activateOpenClawSecurityTurnCapsule",
    "invalidateOpenClawSecurityTurnCapsule",
    "sendFollowupPayloads",
    "routeReply",
    "runQueuedFollowup"
  ]) {
    assert.match(source, new RegExp(marker), marker);
  }
  const runIdAt = source.indexOf("const runId = crypto.randomUUID()");
  const activationAt = source.indexOf("activateOpenClawSecurityTurnCapsule", runIdAt);
  const sendFollowupAt = source.indexOf("sendFollowupPayloads", activationAt);
  const routeReplyAt = source.indexOf("routeReply");
  const invalidateAt = source.lastIndexOf("invalidateOpenClawSecurityTurnCapsule");
  assert.notEqual(runIdAt, -1);
  assert.equal(activationAt > runIdAt, true);
  assert.equal(sendFollowupAt > activationAt, true);
  assert.equal(routeReplyAt !== -1, true);
  assert.equal(routeReplyAt < activationAt, true);
  assert.equal(invalidateAt > sendFollowupAt, true);
  assert.equal(
    source.includes("queued.queuedExecutionContext(() => runQueuedFollowup(queued))"),
    true
  );
});

test("REQ-SBX-GENERAL-004 P4-T6 ordinary rewrite precedes one final outbound barrier", async () => {
  const lifecycle = await importChunk(patched(), LIFECYCLE_FILE);
  const runner = await importChunk(patched(), HOOK_RUNNER_FILE);
  const order: string[] = [];
  let observed: RecordValue | null = null;
  await configureRunner(runner, (event, ctx) => {
    order.push("security");
    observed = { event, ctx };
    return passEnvelope();
  });
  const barrier = await invokeOutbound(lifecycle, runner, {
    caller: "deliver",
    value: payload({ text: "ordinary rewritten" })
  });
  order.push("send");
  assert.deepEqual(order, ["security", "send"]);
  assert.deepEqual(barrier, { outcome: "pass" });
  assert.deepEqual(observed, {
    event: {
      schema_version: HOOK_EVENT_SCHEMA,
      runId: "run-1",
      sessionKey: "session-1",
      outbound: { text: "ordinary rewritten", channelData: { telegram: { threadId: "thread-1" } } }
    },
    ctx: context()
  });
});

test("REQ-SBX-GENERAL-004 P4-T6 replace returns only the fixed host replacement and does not re-enter", async () => {
  const lifecycle = await importChunk(patched(), LIFECYCLE_FILE);
  const runner = await importChunk(patched(), HOOK_RUNNER_FILE);
  let securityCalls = 0;
  let ordinaryCalls = 0;
  await configureRunner(runner, () => {
    securityCalls += 1;
    return replaceEnvelope();
  });
  const result = await invokeOutbound(lifecycle, runner, {
    caller: "deliver",
    value: payload()
  });
  ordinaryCalls += 1;
  assert.equal(result.outcome, "replace");
  assert.equal(result.text, REVIEW_TEXT);
  assert.equal(result.replacement_code, "security_review_required");
  assert.equal(result.provenance, REPLACEMENT_MARKER);
  assert.equal(securityCalls, 1);
  assert.equal(ordinaryCalls, 1);
});

test("REQ-SBX-GENERAL-004 P4-T6 each real caller passes its local correlation checks", async () => {
  const lifecycle = await importChunk(patched(), LIFECYCLE_FILE);
  const runner = await importChunk(patched(), HOOK_RUNNER_FILE);
  const seen: RecordValue[] = [];
  await configureRunner(runner, (event, ctx) => {
    seen.push({ event, ctx });
    return passEnvelope();
  });
  for (const caller of ["deliver", "delivery", "dispatch"] as const) {
    const result = await invokeOutbound(lifecycle, runner, { caller });
    assert.deepEqual(result, { outcome: "pass" });
  }
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.map((item) => (item.event as RecordValue).outbound), [
    payload(),
    payload(),
    payload()
  ]);
});

test("REQ-SBX-GENERAL-004 P4-T6 missing or mismatched carrier fails closed without original delivery", async () => {
  const lifecycle = await importChunk(patched(), LIFECYCLE_FILE);
  const runner = await importChunk(patched(), HOOK_RUNNER_FILE);
  let calls = 0;
  await configureRunner(runner, () => {
    calls += 1;
    return passEnvelope();
  });
  const cases = [
    { caller: "deliver" as const, ctx: undefined },
    { caller: "delivery" as const, ctx: context({ sessionKey: "other-session" }) },
    { caller: "dispatch" as const, localRunId: "other-run" }
  ];
  for (const current of cases) {
    const result = await invokeOutbound(lifecycle, runner, current);
    assert.equal(result.outcome, "replace");
    assert.equal(result.text, UNAVAILABLE_TEXT);
    assert.equal(result.replacement_code, "sandbox_security_evaluation_unavailable");
  }
  assert.equal(calls, 0);
});

test("REQ-SBX-GENERAL-004 P4-T6 nested turn scopes restore the outer carrier", async () => {
  const lifecycle = await importChunk(patched(), LIFECYCLE_FILE);
  const runner = await importChunk(patched(), HOOK_RUNNER_FILE);
  const create = assertFunction(lifecycle, "createOpenClawSecurityTurnCapsule");
  const runWith = assertFunction(lifecycle, "runWithOpenClawSecurityTurnCapsule");
  const activate = assertFunction(lifecycle, "activateOpenClawSecurityTurnCapsule");
  const observed: string[] = [];
  await configureRunner(runner, (event) => {
    observed.push((event as RecordValue).runId as string);
    return passEnvelope();
  });
  const outer = create();
  await runWith(outer, async () => {
    activate({ prompt: "outer", runId: "run-1", sessionKey: "session-1" });
    await invokeOutbound(lifecycle, runner, { caller: "deliver" });
    const inner = create();
    await runWith(inner, async () => {
      activate({ prompt: "inner", runId: "run-2", sessionKey: "session-2" });
      await invokeOutbound(lifecycle, runner, {
        caller: "deliver",
        ctx: context({ prompt: "inner", runId: "run-2", sessionKey: "session-2" }),
        localRunId: "run-2",
        localSessionKey: "session-2",
        inCurrentScope: true
      });
    });
    await invokeOutbound(lifecycle, runner, { caller: "deliver", inCurrentScope: true });
  });
  assert.deepEqual(observed, ["run-1", "run-2", "run-1"]);
});

test("REQ-SBX-GENERAL-004 P4-T6 unpatched delivery callers do not invoke the final barrier", async () => {
  for (const file of [DISPATCH_FILE, DELIVER_FILE, DELIVERY_FILE, AGENT_RUNNER_FILE]) {
    const source = readFileSync(
      join(pristine().openclawDir, "dist", file),
      "utf8"
    );
    assert.equal(source.includes("runOpenClawSecurity"), false, file);
  }
});
