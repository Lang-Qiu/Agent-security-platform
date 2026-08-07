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
// REQ-SBX-GENERAL-004 P4-T3 real awaited user-input barrier.
//
// Scope note: this spec owns the host-side turn-context carrier, the
// dispatcher-owned AsyncLocalStorage scope, the host-only fixed replacement
// marker, and the structural contract of the two real acceptance sites.
// Driving a complete live agent turn through the patched CLI is owned by
// P4-T8's nested-CLI runtime probe, not by this spec.
// ---------------------------------------------------------------------------

type RecordValue = Record<string, unknown>;

const OPENCLAW_VERSION = "2026.6.34";
const SECURITY_PLUGIN_ID = "agent-security-sandbox-general";
const FIXED_REPLACEMENT_MARKER = "openclaw-security-fixed-replacement.v1";
const TURN_CONTEXT_SCHEMA = "openclaw-security-turn-context.v1";

const REVIEW_TEXT = "Security review required. This action was not completed.";
const BLOCKED_TEXT = "Blocked by sandbox security policy.";
const UNAVAILABLE_TEXT =
  "Security evaluation unavailable. This action was not completed.";

const LIFECYCLE_FILE = "lifecycle-hook-helpers-Dowa8zK4.js";
const DISPATCH_FILE = "dispatch-BSYjC-fp.js";
const SELECTION_FILE = "selection-DopzNY3I.js";
const CLI_FILE = "cli-runner-B0eKIePw.js";

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
  const root = mkdtempSync(path.join(tmpdir(), "g4-p43-"));
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
// Carrier surface
// ---------------------------------------------------------------------------

type Carrier = {
  createCapsule: () => unknown;
  runWithCapsule: <T>(capsule: unknown, fn: () => T) => T;
  activate: (input: RecordValue) => unknown;
  read: () => RecordValue | null;
  invalidate: () => void;
  createFixedReplacement: (barrier: unknown) => RecordValue;
  readFixedReplacement: () => RecordValue | null;
};

async function carrier(): Promise<Carrier> {
  const mod = await importChunk(patched(), LIFECYCLE_FILE);
  const names = {
    createCapsule: "createOpenClawSecurityTurnCapsule",
    runWithCapsule: "runWithOpenClawSecurityTurnCapsule",
    activate: "activateOpenClawSecurityTurnCapsule",
    read: "readOpenClawSecurityTurnContext",
    invalidate: "invalidateOpenClawSecurityTurnCapsule",
    createFixedReplacement: "createOpenClawSecurityFixedReplacement",
    readFixedReplacement: "readOpenClawSecurityFixedReplacement"
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

// ---------------------------------------------------------------------------
// Acceptance-site inventory
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T3 exactly two real acceptance sites call the closed input barrier", () => {
  const distDir = path.join(pristine().openclawDir, "dist");
  const callers: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      const text = readFileSync(full, "utf8");
      if (text.includes("runBeforeAgentRun(")) {
        callers.push(path.relative(distDir, full));
      }
    }
  };
  walk(distDir);

  assert.deepEqual(
    callers.slice().sort(),
    [CLI_FILE, "hook-runner-global-D_43rcnU.js", SELECTION_FILE].slice().sort(),
    `an unreviewed before_agent_run acceptance caller appeared: ${callers.join(",")}`
  );
});

test("REQ-SBX-GENERAL-004 P4-T3 the unpatched acceptance sites drop the barrier outcome", () => {
  // Baseline defect this task closes: P4-T2 made the runner return
  // pass|replace, but both sites still branch on the legacy block outcome, so
  // a replace decision is silently discarded and the model still runs.
  for (const file of [SELECTION_FILE, CLI_FILE]) {
    const source = pristineSource(file);
    assert.equal(
      source.includes('beforeRunDecision?.outcome === "block"'),
      true,
      `${file} baseline must still contain the legacy block branch`
    );
    assert.equal(
      source.includes("replacement_code"),
      false,
      `${file} baseline must not yet consume the closed barrier`
    );
  }
});

// ---------------------------------------------------------------------------
// Carrier lifecycle
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T3 a pending capsule exposes no prompt before activation", async () => {
  const c = await carrier();
  const capsule = c.createCapsule();
  c.runWithCapsule(capsule, () => {
    assert.equal(
      c.read(),
      null,
      "an inactive capsule must not expose a turn context"
    );
  });
});

test("REQ-SBX-GENERAL-004 P4-T3 activation exposes the exact frozen tuple", async () => {
  const c = await carrier();
  const capsule = c.createCapsule();
  c.runWithCapsule(capsule, () => {
    c.activate(activeTuple());
    const read = c.read();
    assert.notEqual(read, null);
    assert.deepEqual(read, {
      schema_version: TURN_CONTEXT_SCHEMA,
      prompt: "please read the secret file",
      runId: "run-1",
      sessionKey: "session-1"
    });
    assert.equal(Object.isFrozen(read), true, "the tuple must be frozen");
  });
});

test("REQ-SBX-GENERAL-004 P4-T3 reads outside any capsule scope fail closed", async () => {
  const c = await carrier();
  assert.equal(
    c.read(),
    null,
    "a detached read must not resolve a turn context"
  );
  assert.throws(
    () => c.activate(activeTuple()),
    "activation outside a capsule scope must be refused"
  );
});

test("REQ-SBX-GENERAL-004 P4-T3 a capsule activates at most once", async () => {
  const c = await carrier();
  const capsule = c.createCapsule();
  c.runWithCapsule(capsule, () => {
    c.activate(activeTuple());
    assert.throws(
      () => c.activate(activeTuple({ prompt: "second" })),
      "a capsule must refuse a second activation"
    );
    assert.equal((c.read() as RecordValue).prompt, "please read the secret file");
  });
});

test("REQ-SBX-GENERAL-004 P4-T3 invalidation clears the prompt and fails later reads", async () => {
  const c = await carrier();
  const capsule = c.createCapsule();
  c.runWithCapsule(capsule, () => {
    c.activate(activeTuple());
    assert.notEqual(c.read(), null);
    c.invalidate();
    assert.equal(
      c.read(),
      null,
      "a post-invalidation read must fail closed"
    );
  });
  assert.equal(
    JSON.stringify(capsule).includes("secret"),
    false,
    "an invalidated capsule must retain no prompt bytes"
  );
});

test("REQ-SBX-GENERAL-004 P4-T3 rejects malformed activation tuples", async () => {
  const c = await carrier();
  for (const bad of [
    activeTuple({ prompt: 42 }),
    activeTuple({ runId: "" }),
    activeTuple({ sessionKey: null }),
    activeTuple({ extra: true }),
    { prompt: "p", runId: "r" },
    null,
    "string"
  ]) {
    const capsule = c.createCapsule();
    c.runWithCapsule(capsule, () => {
      assert.throws(
        () => c.activate(bad as RecordValue),
        `activation must reject ${JSON.stringify(bad)}`
      );
      assert.equal(c.read(), null);
    });
  }
});

test("REQ-SBX-GENERAL-004 P4-T3 nested scopes restore the outer capsule", async () => {
  const c = await carrier();
  const outer = c.createCapsule();
  c.runWithCapsule(outer, () => {
    c.activate(activeTuple({ prompt: "outer", runId: "run-outer" }));
    const inner = c.createCapsule();
    c.runWithCapsule(inner, () => {
      c.activate(activeTuple({ prompt: "inner", runId: "run-inner" }));
      assert.equal((c.read() as RecordValue).prompt, "inner");
      assert.equal((c.read() as RecordValue).runId, "run-inner");
    });
    assert.equal(
      (c.read() as RecordValue).prompt,
      "outer",
      "the outer capsule must be restored after a nested scope"
    );
    assert.equal((c.read() as RecordValue).runId, "run-outer");
  });
});

test("REQ-SBX-GENERAL-004 P4-T3 concurrent same-session turns cannot cross", async () => {
  const c = await carrier();
  const seen: RecordValue[] = [];

  const turn = async (label: string): Promise<void> => {
    const capsule = c.createCapsule();
    await c.runWithCapsule(capsule, async () => {
      c.activate(
        activeTuple({
          prompt: `prompt-${label}`,
          runId: `run-${label}`,
          sessionKey: "session-shared"
        })
      );
      await new Promise((resolve) => setTimeout(resolve, label === "a" ? 20 : 5));
      seen.push(c.read() as RecordValue);
      c.invalidate();
    });
  };

  await Promise.all([turn("a"), turn("b")]);
  const byRun = new Map(seen.map((entry) => [entry.runId, entry.prompt]));
  assert.deepEqual(byRun.get("run-a"), "prompt-a");
  assert.deepEqual(byRun.get("run-b"), "prompt-b");
  assert.equal(
    new Set(seen.map((entry) => entry.sessionKey)).size,
    1,
    "both turns must share the session key without exchanging prompts"
  );
});

// ---------------------------------------------------------------------------
// Dispatcher-owned scope
// ---------------------------------------------------------------------------

type FakeDispatcher = {
  markComplete: () => void;
  waitForIdle: () => Promise<void>;
};

function fakeDispatcher(onIdle?: () => void): FakeDispatcher {
  return {
    markComplete: () => {},
    waitForIdle: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      onIdle?.();
    }
  };
}

async function withReplyDispatcher(): Promise<Function> {
  const mod = await importChunk(patched(), DISPATCH_FILE);
  const fn = mod.o;
  assert.equal(
    typeof fn,
    "function",
    "withReplyDispatcher must remain exported from the dispatch chunk"
  );
  return fn as Function;
}

test("REQ-SBX-GENERAL-004 P4-T3 withReplyDispatcher owns a capsule scope across run, settle, and idle", async () => {
  const c = await carrier();
  const dispatch = await withReplyDispatcher();

  const observed: Array<string | null> = [];
  const readPrompt = (): string | null => {
    const value = c.read();
    return value === null ? null : (value.prompt as string);
  };

  let idlePrompt: string | null = "unset";
  const dispatcher = fakeDispatcher(() => {
    idlePrompt = readPrompt();
  });

  const result = await dispatch({
    dispatcher,
    run: async () => {
      observed.push(readPrompt());
      c.activate(activeTuple({ prompt: "dispatched" }));
      observed.push(readPrompt());
      return "ran";
    }
  });

  assert.equal(result, "ran");
  assert.deepEqual(
    observed,
    [null, "dispatched"],
    "the run body must start with an inactive capsule and see its own activation"
  );
  assert.equal(
    idlePrompt,
    "dispatched",
    "the capsule must still be readable while the dispatcher drains to idle"
  );
  assert.equal(
    readPrompt(),
    null,
    "the prompt must be cleared once the dispatcher settles"
  );
});

test("REQ-SBX-GENERAL-004 P4-T3 the dispatcher clears the capsule even when the run throws", async () => {
  const c = await carrier();
  const dispatch = await withReplyDispatcher();

  let idleSaw: string | null = "unset";
  const dispatcher = fakeDispatcher(() => {
    const value = c.read();
    idleSaw = value === null ? null : (value.prompt as string);
  });

  await assert.rejects(
    () =>
      dispatch({
        dispatcher,
        run: async () => {
          c.activate(activeTuple({ prompt: "doomed" }));
          throw new Error("run failed");
        }
      }) as Promise<unknown>
  );

  assert.equal(
    idleSaw,
    "doomed",
    "settlement must still observe the owning capsule after a failed run"
  );
  assert.equal(c.read(), null, "a failed run must still clear the prompt");
});

test("REQ-SBX-GENERAL-004 P4-T3 the dispatcher still settles and waits for idle", async () => {
  const dispatch = await withReplyDispatcher();
  const order: string[] = [];
  const dispatcher = {
    markComplete: () => order.push("markComplete"),
    waitForIdle: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      order.push("waitForIdle");
    }
  };
  await dispatch({
    dispatcher,
    run: async () => {
      order.push("run");
    },
    onSettled: async () => {
      order.push("onSettled");
    }
  });
  assert.deepEqual(
    order,
    ["run", "markComplete", "waitForIdle", "onSettled"],
    "upstream settlement ordering must be preserved"
  );
});

// ---------------------------------------------------------------------------
// Host-only fixed replacement marker
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T3 the host creates the fixed replacement marker for each exact pair", async () => {
  const c = await carrier();
  const pairs = [
    { replacement_code: "security_review_required", replacement_text: REVIEW_TEXT },
    {
      replacement_code: "sandbox_security_policy_blocked",
      replacement_text: BLOCKED_TEXT
    },
    {
      replacement_code: "sandbox_security_evaluation_unavailable",
      replacement_text: UNAVAILABLE_TEXT
    }
  ];
  for (const pair of pairs) {
    const capsule = c.createCapsule();
    c.runWithCapsule(capsule, () => {
      c.activate(activeTuple());
      const envelope = c.createFixedReplacement({ outcome: "replace", ...pair });
      assert.deepEqual(envelope, {
        text: pair.replacement_text,
        replacement_code: pair.replacement_code,
        provenance: FIXED_REPLACEMENT_MARKER
      });
      assert.equal(Object.isFrozen(envelope), true);
      assert.deepEqual(c.readFixedReplacement(), envelope);
    });
  }
});

test("REQ-SBX-GENERAL-004 P4-T3 a tampered or plugin-supplied pair cannot mint a marker", async () => {
  const c = await carrier();
  for (const bad of [
    { outcome: "replace", replacement_code: "security_review_required", replacement_text: "Custom text." },
    { outcome: "replace", replacement_code: "sandbox_security_policy_blocked", replacement_text: REVIEW_TEXT },
    { outcome: "replace", replacement_code: "made_up_code", replacement_text: REVIEW_TEXT },
    { outcome: "pass" },
    {
      outcome: "replace",
      replacement_code: "security_review_required",
      replacement_text: REVIEW_TEXT,
      provenance: FIXED_REPLACEMENT_MARKER
    },
    null
  ]) {
    const capsule = c.createCapsule();
    c.runWithCapsule(capsule, () => {
      c.activate(activeTuple());
      assert.throws(
        () => c.createFixedReplacement(bad),
        `the host must refuse to mint a marker for ${JSON.stringify(bad)}`
      );
      assert.equal(c.readFixedReplacement(), null);
    });
  }
});

// ---------------------------------------------------------------------------
// Structural contract of the two real acceptance sites
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T3 both acceptance sites consume the barrier and drop the legacy branch", () => {
  for (const file of [SELECTION_FILE, CLI_FILE]) {
    const source = patchedSource(file);
    assert.equal(
      source.includes('beforeRunDecision?.outcome === "block"'),
      false,
      `${file} must no longer branch on the legacy block outcome`
    );
    assert.equal(
      source.includes('=== "replace"'),
      true,
      `${file} must branch on the closed barrier outcome`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T3 both acceptance sites activate the capsule before invoking the barrier", () => {
  for (const file of [SELECTION_FILE, CLI_FILE]) {
    const source = patchedSource(file);
    const activateAt = source.indexOf("activateOpenClawSecurityTurnCapsule");
    const invokeAt = source.indexOf("runBeforeAgentRun(");
    assert.notEqual(activateAt, -1, `${file} must activate the turn capsule`);
    assert.notEqual(invokeAt, -1, `${file} must still invoke the closed runner`);
    assert.equal(
      activateAt < invokeAt,
      true,
      `${file} must activate the capsule before invoking the barrier`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T3 the fixed text bypasses the upstream block-message rewriter", () => {
  for (const file of [SELECTION_FILE, CLI_FILE]) {
    const source = patchedSource(file);
    assert.equal(
      source.includes("createOpenClawSecurityFixedReplacement"),
      true,
      `${file} must mint the host-only marker`
    );
    // resolveBlockMessage prefixes and suffixes its input, so the fixed pair
    // must never be routed through it.
    const securityRegion = source.slice(
      source.indexOf("activateOpenClawSecurityTurnCapsule"),
      source.indexOf("activateOpenClawSecurityTurnCapsule") + 4000
    );
    assert.equal(
      /resolveBlockMessage\(\s*openClawSecurity/.test(securityRegion),
      false,
      `${file} must not route the fixed replacement through resolveBlockMessage`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T3 the carrier uses run scoping and no forbidden recovery path", () => {
  const lifecycle = patchedSource(LIFECYCLE_FILE);
  assert.equal(
    lifecycle.includes("AsyncLocalStorage"),
    true,
    "the carrier must use AsyncLocalStorage"
  );
  assert.equal(
    lifecycle.includes("enterWith"),
    false,
    "enterWith is forbidden; every capsule must use run scoping"
  );

  const start = lifecycle.indexOf("OPENCLAW_SECURITY_TURN_CONTEXT");
  assert.notEqual(start, -1);
  const carrierRegion = lifecycle.slice(start);
  for (const forbidden of [
    "BodyForAgent",
    "transcript",
    "buildSessionContext",
    "getEntries"
  ]) {
    assert.equal(
      carrierRegion.includes(forbidden),
      false,
      `the carrier must not recover turn state through ${forbidden}`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T3 no acceptance site keeps a global prompt map", () => {
  for (const file of [SELECTION_FILE, CLI_FILE, DISPATCH_FILE, LIFECYCLE_FILE]) {
    const source = patchedSource(file);
    assert.equal(
      /new Map\(\)[^\n]*openClawSecurity/i.test(source),
      false,
      `${file} must not keep a global security prompt map`
    );
    assert.equal(
      source.includes("enterWith"),
      false,
      `${file} must not use enterWith`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T3 the patch touches only the reviewed files", () => {
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
    "dist/run-attempt-6K7vbtby.js",
    `dist/${LIFECYCLE_FILE}`,
    `dist/${DISPATCH_FILE}`,
    `dist/${SELECTION_FILE}`,
    `dist/${CLI_FILE}`
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
