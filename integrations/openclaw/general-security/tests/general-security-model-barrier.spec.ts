import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// REQ-SBX-GENERAL-004 P4-T4 awaited final assistant-projection barrier.
//
// Scope note: this spec owns the host-side awaited model-output barrier helper,
// its use of the P4-T3 turn-context carrier and host-only fixed replacement
// marker, and the structural contract of the three real final-acceptance sites
// (selection embedded attempt, CLI runner, and codex run-attempt). Driving a
// complete live agent turn through the patched CLI is owned by P4-T8's
// nested-CLI runtime probe, not by this spec.
// ---------------------------------------------------------------------------

type RecordValue = Record<string, unknown>;

const OPENCLAW_VERSION = "2026.6.34";
const FIXED_REPLACEMENT_MARKER = "openclaw-security-fixed-replacement.v1";

const REVIEW_TEXT = "Security review required. This action was not completed.";
const BLOCKED_TEXT = "Blocked by sandbox security policy.";
const UNAVAILABLE_TEXT =
  "Security evaluation unavailable. This action was not completed.";

const LIFECYCLE_FILE = "lifecycle-hook-helpers-Dowa8zK4.js";
const SELECTION_FILE = "selection-DopzNY3I.js";
const CLI_FILE = "cli-runner-B0eKIePw.js";
const RUN_ATTEMPT_FILE = "run-attempt-6K7vbtby.js";

const PATCH_PATH = new URL(
  "../patches/openclaw-2026.6.34-general-security.patch",
  import.meta.url
).pathname;

const fixtures: string[] = [];

process.on("exit", () => {
  for (const dir of fixtures) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

type Fixture = { root: string; openclawDir: string };

function installedOpenClawRoot(): string {
  const resolved = new URL(
    "../node_modules/openclaw/package.json",
    import.meta.url
  ).pathname;
  assert.equal(
    existsSync(resolved),
    true,
    "nested openclaw must be installed before P4 behavior specs run"
  );
  const manifest = JSON.parse(readFileSync(resolved, "utf8")) as RecordValue;
  assert.equal(manifest.name, "openclaw");
  assert.equal(manifest.version, OPENCLAW_VERSION);
  return path.dirname(resolved);
}

function buildFixture(applyPatch: boolean): Fixture {
  const pristine = installedOpenClawRoot();
  const root = mkdtempSync(path.join(tmpdir(), "g4-p44-"));
  fixtures.push(root);
  const openclawDir = path.join(root, "node_modules", "openclaw");
  cpSync(pristine, openclawDir, { recursive: true, dereference: true });

  // Sibling runtime dependencies (chalk and friends) live beside the real
  // package in the pnpm layout; link them so bare specifiers resolve.
  const siblingRoot = path.dirname(pristine);
  for (const entry of readdirSync(siblingRoot)) {
    if (entry === "openclaw") continue;
    try {
      symlinkSync(
        path.join(siblingRoot, entry),
        path.join(root, "node_modules", entry),
        "dir"
      );
    } catch {
      // duplicate or unsupported entry
    }
  }

  if (applyPatch) {
    assert.equal(
      existsSync(PATCH_PATH),
      true,
      "the production patch must exist before the patched fixture can be built"
    );
    execFileSync("git", ["apply", "--whitespace=nowarn", PATCH_PATH], {
      cwd: openclawDir,
      encoding: "utf8"
    });
  }
  return { root, openclawDir };
}

let patchedFixture: Fixture | null = null;
function patched(): Fixture {
  patchedFixture ??= buildFixture(true);
  return patchedFixture;
}

let pristineFixture: Fixture | null = null;
function pristine(): Fixture {
  pristineFixture ??= buildFixture(false);
  return pristineFixture;
}

async function importChunk(fixture: Fixture, file: string): Promise<RecordValue> {
  const target = path.join(fixture.openclawDir, "dist", file);
  return (await import(pathToFileURL(target).href)) as RecordValue;
}

function patchedSource(file: string): string {
  return readFileSync(path.join(patched().openclawDir, "dist", file), "utf8");
}

function pristineSource(file: string): string {
  return readFileSync(path.join(pristine().openclawDir, "dist", file), "utf8");
}

// ---------------------------------------------------------------------------
// Carrier + barrier surface
// ---------------------------------------------------------------------------

type Carrier = {
  createCapsule: () => unknown;
  runWithCapsule: <T>(capsule: unknown, fn: () => T) => T;
  activate: (input: RecordValue) => unknown;
  read: () => RecordValue | null;
  invalidate: () => void;
  runModelOutputBarrier: (params: RecordValue) => Promise<RecordValue>;
};

async function carrier(): Promise<Carrier> {
  const mod = await importChunk(patched(), LIFECYCLE_FILE);
  const names = {
    createCapsule: "createOpenClawSecurityTurnCapsule",
    runWithCapsule: "runWithOpenClawSecurityTurnCapsule",
    activate: "activateOpenClawSecurityTurnCapsule",
    read: "readOpenClawSecurityTurnContext",
    invalidate: "invalidateOpenClawSecurityTurnCapsule",
    runModelOutputBarrier: "runOpenClawSecurityModelOutputBarrier"
  } as const;
  const resolved: RecordValue = {};
  for (const [key, exportName] of Object.entries(names)) {
    const fn = mod[exportName];
    assert.equal(
      typeof fn,
      "function",
      `${exportName} must be exported from ${LIFECYCLE_FILE}`
    );
    resolved[key] = fn;
  }
  return resolved as unknown as Carrier;
}

function activeTuple(overrides: RecordValue = {}): RecordValue {
  return {
    prompt: "please read the secret file",
    runId: "run-1",
    sessionKey: "session-1",
    ...overrides
  };
}

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 1));

type FakeHookRunner = {
  hasHooks: (name: string) => boolean;
  runBeforeModelOutputDelivery: (event: RecordValue, ctx: RecordValue) => Promise<RecordValue>;
  observations: RecordValue[];
};

function fakeHookRunner(
  decide: () => Promise<RecordValue> | RecordValue,
  options: { hasBarrier?: boolean } = {}
): FakeHookRunner {
  const hasBarrier = options.hasBarrier ?? true;
  const observations: RecordValue[] = [];
  return {
    observations,
    hasHooks: (name: string) => hasBarrier && name === "before_model_output_delivery",
    runBeforeModelOutputDelivery: async (event: RecordValue) => {
      observations.push(event);
      return await decide();
    }
  };
}

function passDecision(): RecordValue {
  return { outcome: "pass" };
}
function blockedDecision(): RecordValue {
  return {
    outcome: "replace",
    replacement_code: "sandbox_security_policy_blocked",
    replacement_text: BLOCKED_TEXT
  };
}
function reviewDecision(): RecordValue {
  return {
    outcome: "replace",
    replacement_code: "security_review_required",
    replacement_text: REVIEW_TEXT
  };
}

function modelEvent(overrides: RecordValue = {}): RecordValue {
  return {
    runId: "run-1",
    sessionId: "sess-id-1",
    provider: "anthropic",
    model: "claude",
    assistantTexts: ["final answer"],
    lastAssistant: {
      role: "assistant",
      toolCalls: [{ name: "read_file", arguments: { path: "/etc/secret" } }]
    },
    ...overrides
  };
}

function modelCtx(overrides: RecordValue = {}): RecordValue {
  return {
    runId: "run-1",
    sessionKey: "session-1",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Acceptance-site inventory
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T4 exactly three real final model-output acceptance sites exist", () => {
  const distDir = path.join(pristine().openclawDir, "dist");
  const observationCallers: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      const text = readFileSync(full, "utf8");
      const rel = path.relative(distDir, full);
      // Fire-and-forget observation helper callers (cli-runner, run-attempt).
      const usesHelper =
        /[^A-Za-z0-9_]runAgentHarnessLlmOutputHook\(/.test(text) &&
        rel !== LIFECYCLE_FILE;
      // Direct final llm_output runner caller (selection embedded attempt).
      const usesDirectRunner =
        /hookRunner\?\.hasHooks\("llm_output"\)/.test(text) &&
        /\.runLlmOutput\(/.test(text) &&
        rel !== LIFECYCLE_FILE;
      if (usesHelper || usesDirectRunner) observationCallers.push(rel);
    }
  };
  walk(distDir);

  assert.deepEqual(
    [...new Set(observationCallers)].slice().sort(),
    [CLI_FILE, RUN_ATTEMPT_FILE, SELECTION_FILE].slice().sort(),
    `an unreviewed final model-output acceptance caller appeared: ${observationCallers.join(",")}`
  );
});

test("REQ-SBX-GENERAL-004 P4-T4 the unpatched acceptance sites are fire-and-forget", () => {
  // Baseline defect this task closes: the final assistant projection is only
  // observed via a fire-and-forget llm_output dispatch; nothing awaits a closed
  // security decision or produces a host replacement before delivery.
  for (const file of [SELECTION_FILE, CLI_FILE, RUN_ATTEMPT_FILE]) {
    const source = pristineSource(file);
    assert.equal(
      source.includes("runOpenClawSecurityModelOutputBarrier"),
      false,
      `${file} baseline must not yet await the closed model-output barrier`
    );
  }
});

// ---------------------------------------------------------------------------
// Helper behavior: awaited barrier, carrier read, observation, replacement
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T4 the barrier is awaited before delivery on replace", async () => {
  const c = await carrier();
  const order: string[] = [];
  const runner = fakeHookRunner(async () => {
    order.push("security");
    await tick();
    order.push("security_done");
    return blockedDecision();
  });

  const capsule = c.createCapsule();
  const decision = await c.runWithCapsule(capsule, async () => {
    c.activate(activeTuple());
    const result = await c.runModelOutputBarrier({
      event: modelEvent(),
      ctx: modelCtx(),
      hookRunner: runner
    });
    order.push("replacement_send");
    return result;
  });

  assert.deepEqual(order, ["security", "security_done", "replacement_send"]);
  assert.equal(decision.outcome, "replace");
  assert.equal(decision.text, BLOCKED_TEXT);
  assert.equal(decision.replacement_code, "sandbox_security_policy_blocked");
  assert.equal(decision.provenance, FIXED_REPLACEMENT_MARKER);
});

test("REQ-SBX-GENERAL-004 P4-T4 a pass decision delivers the original output", async () => {
  const c = await carrier();
  const runner = fakeHookRunner(() => passDecision());
  const capsule = c.createCapsule();
  const decision = await c.runWithCapsule(capsule, async () => {
    c.activate(activeTuple());
    return c.runModelOutputBarrier({
      event: modelEvent(),
      ctx: modelCtx(),
      hookRunner: runner
    });
  });
  assert.deepEqual(decision, { outcome: "pass" });
});

test("REQ-SBX-GENERAL-004 P4-T4 the observation carries the turn tuple and exact projection", async () => {
  const c = await carrier();
  const runner = fakeHookRunner(() => passDecision());
  const capsule = c.createCapsule();
  await c.runWithCapsule(capsule, async () => {
    c.activate(activeTuple());
    // A hostile event that tries to smuggle a different prompt must not win:
    // the observation prompt must come from the active carrier only.
    await c.runModelOutputBarrier({
      event: modelEvent({ prompt: "attacker-supplied prompt" }),
      ctx: modelCtx(),
      hookRunner: runner
    });
  });
  assert.equal(runner.observations.length, 1);
  const obs = runner.observations[0];
  assert.equal(obs.prompt, "please read the secret file");
  assert.equal(obs.runId, "run-1");
  assert.equal(obs.sessionKey, "session-1");
  assert.deepEqual(obs.assistantTexts, ["final answer"]);
  assert.deepEqual(obs.tool_calls, [
    { name: "read_file", arguments: { path: "/etc/secret" } }
  ]);
});

test("REQ-SBX-GENERAL-004 P4-T4 observation-only path passes when no barrier hook is registered", async () => {
  const c = await carrier();
  const runner = fakeHookRunner(() => reviewDecision(), { hasBarrier: false });
  const capsule = c.createCapsule();
  const decision = await c.runWithCapsule(capsule, async () => {
    c.activate(activeTuple());
    return c.runModelOutputBarrier({
      event: modelEvent(),
      ctx: modelCtx(),
      hookRunner: runner
    });
  });
  assert.deepEqual(decision, { outcome: "pass" });
  assert.equal(
    runner.observations.length,
    0,
    "the barrier hook must not be invoked when unregistered"
  );
});

// ---------------------------------------------------------------------------
// Failure floors and correlation drift
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T4 a missing carrier floors to the fixed unavailable replacement", async () => {
  const c = await carrier();
  const runner = fakeHookRunner(() => passDecision());
  // No capsule scope at all: read must fail closed and never deliver original.
  const decision = await c.runModelOutputBarrier({
    event: modelEvent(),
    ctx: modelCtx(),
    hookRunner: runner
  });
  assert.equal(decision.outcome, "replace");
  assert.equal(decision.replacement_code, "sandbox_security_evaluation_unavailable");
  assert.equal(decision.text, UNAVAILABLE_TEXT);
  assert.equal(decision.provenance, FIXED_REPLACEMENT_MARKER);
  assert.equal(
    runner.observations.length,
    0,
    "a floored barrier must not invoke the security hook"
  );
});

test("REQ-SBX-GENERAL-004 P4-T4 an inactive capsule floors to the fixed unavailable replacement", async () => {
  const c = await carrier();
  const runner = fakeHookRunner(() => passDecision());
  const capsule = c.createCapsule();
  const decision = await c.runWithCapsule(capsule, async () =>
    // capsule created but never activated
    c.runModelOutputBarrier({
      event: modelEvent(),
      ctx: modelCtx(),
      hookRunner: runner
    })
  );
  assert.equal(decision.outcome, "replace");
  assert.equal(decision.replacement_code, "sandbox_security_evaluation_unavailable");
  assert.equal(runner.observations.length, 0);
});

test("REQ-SBX-GENERAL-004 P4-T4 run/session correlation drift floors closed", async () => {
  const c = await carrier();
  for (const drift of [
    { event: modelEvent({ runId: "run-other" }), ctx: modelCtx() },
    { event: modelEvent(), ctx: modelCtx({ runId: "run-other" }) },
    { event: modelEvent(), ctx: modelCtx({ sessionKey: "session-other" }) }
  ]) {
    const runner = fakeHookRunner(() => passDecision());
    const capsule = c.createCapsule();
    const decision = await c.runWithCapsule(capsule, async () => {
      c.activate(activeTuple());
      return c.runModelOutputBarrier({
        event: drift.event,
        ctx: drift.ctx,
        hookRunner: runner
      });
    });
    assert.equal(decision.outcome, "replace");
    assert.equal(decision.replacement_code, "sandbox_security_evaluation_unavailable");
    assert.equal(
      runner.observations.length,
      0,
      "correlation drift must not invoke the security hook"
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T4 a thrown barrier floors to the fixed unavailable replacement", async () => {
  const c = await carrier();
  const runner = fakeHookRunner(() => {
    throw new Error("engine exploded");
  });
  const capsule = c.createCapsule();
  const decision = await c.runWithCapsule(capsule, async () => {
    c.activate(activeTuple());
    return c.runModelOutputBarrier({
      event: modelEvent(),
      ctx: modelCtx(),
      hookRunner: runner
    });
  });
  assert.equal(decision.outcome, "replace");
  assert.equal(decision.replacement_code, "sandbox_security_evaluation_unavailable");
});

test("REQ-SBX-GENERAL-004 P4-T4 a malformed barrier decision floors closed", async () => {
  const c = await carrier();
  for (const bad of [
    null,
    {},
    { outcome: "block" },
    { outcome: "replace" },
    { outcome: "replace", replacement_code: "made_up", replacement_text: "x" },
    {
      outcome: "replace",
      replacement_code: "security_review_required",
      replacement_text: "wrong text"
    }
  ]) {
    const runner = fakeHookRunner(() => bad as RecordValue);
    const capsule = c.createCapsule();
    const decision = await c.runWithCapsule(capsule, async () => {
      c.activate(activeTuple());
      return c.runModelOutputBarrier({
        event: modelEvent(),
        ctx: modelCtx(),
        hookRunner: runner
      });
    });
    assert.equal(decision.outcome, "replace");
    assert.equal(
      decision.replacement_code,
      "sandbox_security_evaluation_unavailable",
      `a malformed decision ${JSON.stringify(bad)} must floor closed`
    );
  }
});

// ---------------------------------------------------------------------------
// Carrier isolation for concurrent / nested turns
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T4 concurrent same-session barriers cannot cross prompts", async () => {
  const c = await carrier();
  const seen = new Map<string, string>();

  const turn = async (label: string): Promise<void> => {
    const runner = fakeHookRunner(async () => {
      await new Promise((resolve) => setTimeout(resolve, label === "a" ? 15 : 4));
      return passDecision();
    });
    const capsule = c.createCapsule();
    await c.runWithCapsule(capsule, async () => {
      c.activate(
        activeTuple({
          prompt: `prompt-${label}`,
          runId: `run-${label}`,
          sessionKey: "session-shared"
        })
      );
      await c.runModelOutputBarrier({
        event: modelEvent({ runId: `run-${label}` }),
        ctx: modelCtx({ runId: `run-${label}`, sessionKey: "session-shared" }),
        hookRunner: runner
      });
      const obs = runner.observations[0];
      seen.set(obs.runId as string, obs.prompt as string);
      c.invalidate();
    });
  };

  await Promise.all([turn("a"), turn("b")]);
  assert.equal(seen.get("run-a"), "prompt-a");
  assert.equal(seen.get("run-b"), "prompt-b");
});

test("REQ-SBX-GENERAL-004 P4-T4 a nested turn restores the outer carrier for the barrier", async () => {
  const c = await carrier();
  const outerRunner = fakeHookRunner(() => passDecision());
  const innerRunner = fakeHookRunner(() => passDecision());
  const outer = c.createCapsule();
  await c.runWithCapsule(outer, async () => {
    c.activate(activeTuple({ prompt: "outer", runId: "run-outer" }));
    const inner = c.createCapsule();
    await c.runWithCapsule(inner, async () => {
      c.activate(activeTuple({ prompt: "inner", runId: "run-inner" }));
      await c.runModelOutputBarrier({
        event: modelEvent({ runId: "run-inner" }),
        ctx: modelCtx({ runId: "run-inner" }),
        hookRunner: innerRunner
      });
    });
    await c.runModelOutputBarrier({
      event: modelEvent({ runId: "run-outer" }),
      ctx: modelCtx({ runId: "run-outer" }),
      hookRunner: outerRunner
    });
  });
  assert.equal(innerRunner.observations[0].prompt, "inner");
  assert.equal(outerRunner.observations[0].prompt, "outer");
});

// ---------------------------------------------------------------------------
// Structural contract of the three real acceptance sites
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T4 all three acceptance sites await the closed model-output barrier", () => {
  for (const file of [SELECTION_FILE, CLI_FILE, RUN_ATTEMPT_FILE]) {
    const source = patchedSource(file);
    assert.equal(
      source.includes("runOpenClawSecurityModelOutputBarrier"),
      true,
      `${file} must invoke the closed model-output barrier`
    );
    assert.equal(
      /await\s+runOpenClawSecurityModelOutputBarrier/.test(source),
      true,
      `${file} must await the closed model-output barrier`
    );
    assert.equal(
      source.includes('=== "replace"'),
      true,
      `${file} must branch on the closed replace outcome`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T4 the barrier runs before the fire-and-forget observation at each site", () => {
  for (const file of [SELECTION_FILE, CLI_FILE, RUN_ATTEMPT_FILE]) {
    const source = patchedSource(file);
    const barrierAt = source.indexOf("runOpenClawSecurityModelOutputBarrier");
    assert.notEqual(barrierAt, -1, `${file} must call the barrier`);
    // The final gate must precede the ordinary observation-only dispatch so the
    // observation cannot deliver output the barrier is about to suppress.
    const observationRe =
      file === SELECTION_FILE ? /\.runLlmOutput\(/ : /runAgentHarnessLlmOutputHook\(/;
    const observationAt = source.slice(barrierAt).search(observationRe);
    assert.notEqual(
      observationAt,
      -1,
      `${file} must retain an observation-only dispatch after the gate`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T4 the model-output helper reads the carrier and forbids recovery paths", () => {
  const lifecycle = patchedSource(LIFECYCLE_FILE);
  const start = lifecycle.indexOf("runOpenClawSecurityModelOutputBarrier");
  assert.notEqual(start, -1, "the helper must be defined");
  const region = lifecycle.slice(start, start + 4000);
  assert.equal(
    region.includes("readOpenClawSecurityTurnContext"),
    true,
    "the helper must read the active host turn carrier"
  );
  assert.equal(
    region.includes("createOpenClawSecurityFixedReplacement"),
    true,
    "the helper must mint the host-only marker"
  );
  for (const forbidden of ["BodyForAgent", "transcript", "getEntries", "enterWith"]) {
    assert.equal(
      region.includes(forbidden),
      false,
      `the helper must not recover turn state through ${forbidden}`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T4 no acceptance site keeps a global prompt map or uses enterWith", () => {
  for (const file of [SELECTION_FILE, CLI_FILE, RUN_ATTEMPT_FILE, LIFECYCLE_FILE]) {
    const source = patchedSource(file);
    assert.equal(
      source.includes("enterWith"),
      false,
      `${file} must not use enterWith`
    );
    assert.equal(
      /new Map\(\)[^\n]*openClawSecurity/i.test(source),
      false,
      `${file} must not keep a global security prompt map`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T4 the patch touches only the reviewed files", () => {
  const patchText = readFileSync(PATCH_PATH, "utf8");
  const targets = [
    ...new Set(
      patchText
        .split("\n")
        .filter((line) => line.startsWith("+++ b/"))
        .map((line) => line.slice("+++ b/".length).trim())
    )
  ].slice().sort();

  const allowed = [
    "dist/command-registration-BBago94k.js",
    "dist/hook-runner-global-D_43rcnU.js",
    "dist/plugin-sdk/hook-types-H9SC6W-p.d.ts",
    `dist/${LIFECYCLE_FILE}`,
    "dist/dispatch-BSYjC-fp.js",
    `dist/${SELECTION_FILE}`,
    `dist/${CLI_FILE}`,
    `dist/${RUN_ATTEMPT_FILE}`
  ].slice().sort();

  assert.deepEqual(
    targets,
    allowed,
    `the patch must touch only reviewed files, saw ${targets.join(",")}`
  );
  for (const target of targets) {
    assert.equal(target.startsWith("dist/"), true);
    assert.equal(target.includes(".."), false);
    assert.equal(target.includes("integrations/openclaw/dist"), false);
  }
});
