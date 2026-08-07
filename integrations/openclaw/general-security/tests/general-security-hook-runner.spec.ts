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
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type RecordValue = Record<string, unknown>;

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..", "..");
const PATCH_PATH = join(
  PACKAGE_ROOT,
  "patches",
  "openclaw-2026.6.34-general-security.patch"
);
const OPENCLAW_VERSION = "2026.6.34";
const SECURITY_PLUGIN_ID = "agent-security-sandbox-general";

const NEW_HOOK_NAMES = [
  "before_model_output_delivery",
  "before_tool_execution",
  "before_message_delivery"
] as const;

const ALL_BARRIER_HOOKS = [
  "before_agent_run",
  ...NEW_HOOK_NAMES
] as const;

type BarrierHook = (typeof ALL_BARRIER_HOOKS)[number];

/** Pre-patch SHA-256 of the file the plan requires to stay byte-identical. */
const REGISTRY_UNPATCHED_SHA256 =
  "ab0e718e38cd9098258c3817cad74805cbfa60cfdf34ece83256276d10994237";

const UNAVAILABLE_BARRIER = Object.freeze({
  outcome: "replace",
  replacement_code: "sandbox_security_evaluation_unavailable",
  replacement_text:
    "Security evaluation unavailable. This action was not completed."
});

const SECURITY_DEADLINE_MS = 10000;

/**
 * Export aliases inside the pinned 2026.6.34 chunk. The sealed manifest pins the
 * exact file hash, so these aliases cannot drift without failing P4-T7.
 */
const RUNNER_ALIASES = Object.freeze({
  resetGlobalHookRunner: "a",
  initializeGlobalHookRunner: "i",
  getGlobalHookRunner: "t"
});

function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function installedOpenClawRoot(): string {
  const link = join(PACKAGE_ROOT, "node_modules", "openclaw");
  assert.equal(
    existsSync(link),
    true,
    "nested openclaw must be installed (pnpm --dir integrations/openclaw/general-security install --frozen-lockfile)"
  );
  const real = realpathSync(link);
  const manifest = JSON.parse(
    readFileSync(join(real, "package.json"), "utf8")
  ) as RecordValue;
  assert.equal(manifest.name, "openclaw");
  assert.equal(
    manifest.version,
    OPENCLAW_VERSION,
    "the probe must resolve only the pinned nested OpenClaw"
  );
  return real;
}

type Fixture = {
  root: string;
  openclawDir: string;
  cleanup: () => void;
};

const fixtures: Fixture[] = [];

/**
 * Build a disposable copy of the real package. Sibling runtime dependencies are
 * symlinked from the pnpm store so the chunk's bare imports (chalk, etc.)
 * resolve without copying the whole dependency tree.
 */
function buildFixture(options: { patched: boolean }): Fixture {
  const source = installedOpenClawRoot();
  const siblingsDir = dirname(source);
  const root = mkdtempSync(join(tmpdir(), "g4-hook-runner-"));
  const nodeModules = join(root, "node_modules");
  const openclawDir = join(nodeModules, "openclaw");
  mkdirSync(nodeModules, { recursive: true });
  cpSync(source, openclawDir, { recursive: true, dereference: true });

  for (const entry of readdirSync(siblingsDir)) {
    if (entry === "openclaw") continue;
    const target = join(siblingsDir, entry);
    const linkPath = join(nodeModules, entry);
    if (existsSync(linkPath)) continue;
    try {
      symlinkSync(target, linkPath);
    } catch {
      // A non-critical sibling is acceptable; the import will surface it.
    }
  }

  const fixture: Fixture = {
    root,
    openclawDir,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
  fixtures.push(fixture);

  if (options.patched) {
    assert.equal(
      existsSync(PATCH_PATH),
      true,
      "the production general-security patch must exist"
    );
    execFileSync("git", ["apply", "--whitespace=nowarn", PATCH_PATH], {
      cwd: openclawDir,
      stdio: "pipe"
    });
  }

  return fixture;
}

let patchedFixture: Fixture | null = null;
let unpatchedFixture: Fixture | null = null;

function patched(): Fixture {
  patchedFixture ??= buildFixture({ patched: true });
  return patchedFixture;
}

function unpatched(): Fixture {
  unpatchedFixture ??= buildFixture({ patched: false });
  return unpatchedFixture;
}

process.on("exit", () => {
  for (const fixture of fixtures) fixture.cleanup();
});

async function importChunk(
  fixture: Fixture,
  relative: string
): Promise<RecordValue> {
  const url = pathToFileURL(join(fixture.openclawDir, "dist", relative)).href;
  return (await import(url)) as RecordValue;
}

function alias(module: RecordValue, name: keyof typeof RUNNER_ALIASES): Function {
  const key = RUNNER_ALIASES[name];
  const value = module[key];
  assert.equal(typeof value, "function", `${name} (alias ${key}) must be a function`);
  return value as Function;
}

type TypedHook = {
  hookName: string;
  pluginId: string;
  handler: (event: unknown, ctx: unknown) => unknown;
  priority?: number;
  timeoutMs?: number;
};

function makeRegistry(typedHooks: TypedHook[], pluginIds: string[]): RecordValue {
  return {
    hooks: [],
    typedHooks,
    plugins: pluginIds.map((id) => ({ id, status: "loaded" })),
    trustedToolPolicies: []
  };
}

async function makeRunner(
  fixture: Fixture,
  typedHooks: TypedHook[],
  pluginIds: string[] = [SECURITY_PLUGIN_ID]
): Promise<RecordValue> {
  const module = await importChunk(fixture, "hook-runner-global-D_43rcnU.js");
  alias(module, "resetGlobalHookRunner")();
  alias(module, "initializeGlobalHookRunner")(makeRegistry(typedHooks, pluginIds));
  const runner = alias(module, "getGlobalHookRunner")() as RecordValue;
  assert.notEqual(runner, null, "global hook runner must exist after init");
  return runner;
}

function envelope(point: BarrierHook, overrides: RecordValue = {}): RecordValue {
  const correlation: RecordValue = {
    runId: "run-1",
    sessionKey: "session-1",
    callId: point === "before_tool_execution" ? "call-1" : null
  };
  return {
    schema_version: "openclaw-security-hook-result.v1",
    correlation,
    health: { enforcement: "healthy", audit: "healthy" },
    barrier: { outcome: "pass" },
    ...overrides
  };
}

function hostEvent(point: BarrierHook, overrides: RecordValue = {}): RecordValue {
  const base: RecordValue = { runId: "run-1" };
  if (point === "before_tool_execution") base.callId = "call-1";
  return { ...base, ...overrides };
}

function hostCtx(overrides: RecordValue = {}): RecordValue {
  return { runId: "run-1", sessionKey: "session-1", ...overrides };
}

const RUNNER_METHOD: Readonly<Record<BarrierHook, string>> = Object.freeze({
  before_agent_run: "runBeforeAgentRun",
  before_model_output_delivery: "runBeforeModelOutputDelivery",
  before_tool_execution: "runBeforeToolExecution",
  before_message_delivery: "runBeforeMessageDelivery"
});

async function callBarrier(
  point: BarrierHook,
  handler: (event: unknown, ctx: unknown) => unknown,
  options: {
    pluginId?: string;
    extraHooks?: TypedHook[];
    pluginIds?: string[];
    event?: RecordValue;
    ctx?: RecordValue;
  } = {}
): Promise<unknown> {
  const hooks: TypedHook[] = [
    {
      hookName: point,
      pluginId: options.pluginId ?? SECURITY_PLUGIN_ID,
      handler,
      priority: 1000
    },
    ...(options.extraHooks ?? [])
  ];
  const runner = await makeRunner(
    patched(),
    hooks,
    options.pluginIds ?? [options.pluginId ?? SECURITY_PLUGIN_ID]
  );
  const method = runner[RUNNER_METHOD[point]];
  assert.equal(
    typeof method,
    "function",
    `${RUNNER_METHOD[point]} must be exposed by the patched runner`
  );
  return (method as Function)(
    options.event ?? hostEvent(point),
    options.ctx ?? hostCtx()
  );
}

// ---------------------------------------------------------------------------
// Unpatched baseline
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T2 unpatched runtime rejects the three new hook names", async () => {
  const registration = await importChunk(
    unpatched(),
    "command-registration-BBago94k.js"
  );
  const isPluginHookName = registration.h as (value: unknown) => boolean;
  assert.equal(typeof isPluginHookName, "function");
  assert.equal(isPluginHookName("before_agent_run"), true);
  for (const name of NEW_HOOK_NAMES) {
    assert.equal(
      isPluginHookName(name),
      false,
      `unpatched runtime must not admit ${name}`
    );
  }

  const runner = await makeRunner(unpatched(), []);
  for (const name of NEW_HOOK_NAMES) {
    assert.equal(
      typeof runner[RUNNER_METHOD[name]],
      "undefined",
      `unpatched runner must not expose ${RUNNER_METHOD[name]}`
    );
  }
});

// ---------------------------------------------------------------------------
// Catalogs and declaration
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T2 patched runtime catalogs admit exactly the four barrier hooks", async () => {
  const registration = await importChunk(
    patched(),
    "command-registration-BBago94k.js"
  );
  const isPluginHookName = registration.h as (value: unknown) => boolean;
  const pluginHookNames = registration.d as readonly string[];
  const conversationHookNames = registration.c as readonly string[];

  for (const name of ALL_BARRIER_HOOKS) {
    assert.equal(isPluginHookName(name), true, `${name} must be admitted`);
    assert.equal(
      pluginHookNames.includes(name),
      true,
      `PLUGIN_HOOK_NAMES must contain ${name}`
    );
    assert.equal(
      conversationHookNames.includes(name),
      true,
      `CONVERSATION_HOOK_NAMES must contain ${name}`
    );
  }

  assert.equal(
    new Set(pluginHookNames).size,
    pluginHookNames.length,
    "PLUGIN_HOOK_NAMES must stay unique"
  );
  assert.equal(
    new Set(conversationHookNames).size,
    conversationHookNames.length,
    "CONVERSATION_HOOK_NAMES must stay unique"
  );
  assert.equal(isPluginHookName("before_security_unknown"), false);
});

test("REQ-SBX-GENERAL-004 P4-T2 patched declaration exposes the names and private envelope types", () => {
  const declaration = readFileSync(
    join(patched().openclawDir, "dist", "plugin-sdk", "hook-types-H9SC6W-p.d.ts"),
    "utf8"
  );
  for (const name of NEW_HOOK_NAMES) {
    assert.equal(
      declaration.includes(`"${name}"`),
      true,
      `declaration must contain ${name}`
    );
  }
  for (const marker of [
    "OpenClawSecurityHookEnvelope",
    "OpenClawSecurityBarrierResult",
    "openclaw-security-hook-result.v1"
  ]) {
    assert.equal(
      declaration.includes(marker),
      true,
      `declaration must define ${marker}`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 the runtime catalog, not the declaration, drives admission", async () => {
  const fixture = buildFixture({ patched: true });
  try {
    const chunkPath = join(
      fixture.openclawDir,
      "dist",
      "command-registration-BBago94k.js"
    );
    const source = readFileSync(chunkPath, "utf8");
    const mutated = source.replace('\t"before_tool_execution",\n', "");
    assert.notEqual(
      mutated,
      source,
      "the patch must add before_tool_execution as its own runtime entry"
    );
    writeFileSync(chunkPath, mutated);

    const declaration = readFileSync(
      join(
        fixture.openclawDir,
        "dist",
        "plugin-sdk",
        "hook-types-H9SC6W-p.d.ts"
      ),
      "utf8"
    );
    assert.equal(
      declaration.includes('"before_tool_execution"'),
      true,
      "the declaration must still contain the name"
    );

    const registration = await importChunk(
      fixture,
      "command-registration-BBago94k.js"
    );
    const isPluginHookName = registration.h as (value: unknown) => boolean;
    assert.equal(
      isPluginHookName("before_tool_execution"),
      false,
      "removing the runtime entry must break admission even with the declaration intact"
    );
  } finally {
    fixture.cleanup();
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 leaves the registry consumer byte-identical", () => {
  const unpatchedSha = sha256OfFile(
    join(unpatched().openclawDir, "dist", "registry-BiuJAn1Z.js")
  );
  const patchedSha = sha256OfFile(
    join(patched().openclawDir, "dist", "registry-BiuJAn1Z.js")
  );
  assert.equal(unpatchedSha, REGISTRY_UNPATCHED_SHA256);
  assert.equal(
    patchedSha,
    REGISTRY_UNPATCHED_SHA256,
    "registry-BiuJAn1Z.js must consume the patched predicate without its own hunk"
  );
});

test("REQ-SBX-GENERAL-004 P4-T2 native registry retains each new hook once with no diagnostic", async () => {
  const registryModule = await importChunk(patched(), "registry-BiuJAn1Z.js");
  const createPluginRegistry = registryModule.t as Function;
  assert.equal(typeof createPluginRegistry, "function");

  const created = createPluginRegistry({}) as RecordValue;
  const registry = created.registry as {
    typedHooks: TypedHook[];
    diagnostics: Array<{ message?: unknown }>;
  };
  const registerTypedHook = created.registerTypedHook as Function;
  const record = {
    id: SECURITY_PLUGIN_ID,
    name: "Agent Security Sandbox General",
    source: "test",
    origin: "external",
    hookCount: 0,
    rootDir: patched().openclawDir
  };

  // The three new names join CONVERSATION_HOOK_NAMES, so the host's existing
  // conversation-access gate now covers them: a non-bundled plugin must opt in
  // explicitly. The plugin manifest declares exactly this capability.
  const conversationPolicy = { allowConversationAccess: true };

  for (const name of NEW_HOOK_NAMES) {
    registerTypedHook(
      record,
      name,
      async () => undefined,
      { priority: 1000 },
      conversationPolicy
    );
  }

  for (const name of NEW_HOOK_NAMES) {
    const retained = registry.typedHooks.filter((hook) => hook.hookName === name);
    assert.equal(retained.length, 1, `${name} must be retained exactly once`);
    assert.equal(retained[0].pluginId, SECURITY_PLUGIN_ID);
  }

  const ignored = registry.diagnostics.filter(
    (diagnostic) =>
      typeof diagnostic.message === "string" &&
      diagnostic.message.includes("unknown typed hook")
  );
  assert.deepEqual(
    ignored,
    [],
    `no unknown-hook diagnostic is allowed, saw ${JSON.stringify(ignored)}`
  );

  registerTypedHook(record, "definitely_not_a_hook", async () => undefined, {}, undefined);
  assert.equal(
    registry.diagnostics.some(
      (diagnostic) =>
        typeof diagnostic.message === "string" &&
        diagnostic.message.includes("unknown typed hook")
    ),
    true,
    "a genuinely unknown hook must still be diagnosed"
  );
});

test("REQ-SBX-GENERAL-004 P4-T2 the new barrier hooks inherit the conversation-access gate", async () => {
  const registryModule = await importChunk(patched(), "registry-BiuJAn1Z.js");
  const created = (registryModule.t as Function)({}) as RecordValue;
  const registry = created.registry as {
    typedHooks: TypedHook[];
    diagnostics: Array<{ message?: unknown }>;
  };
  const registerTypedHook = created.registerTypedHook as Function;
  const record = {
    id: SECURITY_PLUGIN_ID,
    name: "Agent Security Sandbox General",
    source: "test",
    origin: "external",
    hookCount: 0,
    rootDir: patched().openclawDir
  };

  // Without the explicit opt-in the host must refuse each new barrier hook.
  // This locks the gate: the names are real conversation hooks, not a bypass.
  for (const name of NEW_HOOK_NAMES) {
    registerTypedHook(record, name, async () => undefined, { priority: 1000 }, {
      allowConversationAccess: false
    });
  }

  assert.deepEqual(
    registry.typedHooks.filter((hook) =>
      NEW_HOOK_NAMES.includes(hook.hookName as (typeof NEW_HOOK_NAMES)[number])
    ),
    [],
    "the new barrier hooks must be refused without explicit conversation access"
  );
  for (const name of NEW_HOOK_NAMES) {
    assert.equal(
      registry.diagnostics.some(
        (diagnostic) =>
          typeof diagnostic.message === "string" &&
          diagnostic.message.includes(name) &&
          diagnostic.message.includes("allowConversationAccess")
      ),
      true,
      `${name} must be gated by allowConversationAccess`
    );
  }
});

// ---------------------------------------------------------------------------
// Closed runner contract
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T2 every barrier returns only the nested barrier on pass", async () => {
  for (const point of ALL_BARRIER_HOOKS) {
    const result = await callBarrier(point, async () => envelope(point));
    assert.deepEqual(result, { outcome: "pass" }, `${point} must return the barrier`);
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 every barrier forwards each replacement pair unchanged", async () => {
  const replacements = [
    {
      outcome: "replace",
      replacement_code: "security_review_required",
      replacement_text: "Security review required. This action was not completed."
    },
    {
      outcome: "replace",
      replacement_code: "sandbox_security_policy_blocked",
      replacement_text: "Blocked by sandbox security policy."
    },
    { ...UNAVAILABLE_BARRIER }
  ];

  for (const point of ALL_BARRIER_HOOKS) {
    for (const barrier of replacements) {
      const result = await callBarrier(point, async () =>
        envelope(point, { barrier })
      );
      assert.deepEqual(result, barrier);
    }
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 the runner result exposes no correlation, health, or provenance", async () => {
  for (const point of ALL_BARRIER_HOOKS) {
    const result = (await callBarrier(point, async () =>
      envelope(point, {
        barrier: {
          outcome: "replace",
          replacement_code: "sandbox_security_policy_blocked",
          replacement_text: "Blocked by sandbox security policy."
        }
      })
    )) as RecordValue;
    assert.deepEqual(Object.keys(result).sort(), [
      "outcome",
      "replacement_code",
      "replacement_text"
    ]);
    for (const forbidden of [
      "correlation",
      "health",
      "replacement_provenance",
      "schema_version"
    ]) {
      assert.equal(forbidden in result, false, `${forbidden} must not leak`);
    }
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 audit degradation alone does not alter the barrier", async () => {
  for (const point of ALL_BARRIER_HOOKS) {
    const result = await callBarrier(point, async () =>
      envelope(point, {
        health: { enforcement: "healthy", audit: "degraded" },
        barrier: { outcome: "pass" }
      })
    );
    assert.deepEqual(result, { outcome: "pass" }, `${point} must tolerate degraded audit`);
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 failed enforcement health fails closed instead of passing", async () => {
  for (const point of ALL_BARRIER_HOOKS) {
    const result = await callBarrier(point, async () =>
      envelope(point, {
        health: { enforcement: "failed", audit: "healthy" },
        barrier: { outcome: "pass" }
      })
    );
    assert.deepEqual(result, UNAVAILABLE_BARRIER, `${point} must fail closed`);
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 rejects malformed envelopes and never returns pass", async () => {
  const malformed: Array<{ label: string; value: unknown }> = [
    { label: "undefined", value: undefined },
    { label: "null", value: null },
    { label: "bare barrier", value: { outcome: "pass" } },
    {
      label: "wrong schema version",
      value: { ...envelope("before_agent_run"), schema_version: "openclaw-security-hook-result.v2" }
    },
    {
      label: "extra top-level key",
      value: { ...envelope("before_agent_run"), extra: true }
    },
    {
      label: "missing health",
      value: (() => {
        const value = envelope("before_agent_run");
        delete value.health;
        return value;
      })()
    },
    {
      label: "extra correlation key",
      value: envelope("before_agent_run", {
        correlation: {
          runId: "run-1",
          sessionKey: "session-1",
          callId: null,
          extra: 1
        }
      })
    },
    {
      label: "unknown replacement code",
      value: envelope("before_agent_run", {
        barrier: {
          outcome: "replace",
          replacement_code: "something_else",
          replacement_text: "Blocked by sandbox security policy."
        }
      })
    },
    {
      label: "mismatched fixed text",
      value: envelope("before_agent_run", {
        barrier: {
          outcome: "replace",
          replacement_code: "sandbox_security_policy_blocked",
          replacement_text: "Blocked by something else."
        }
      })
    },
    {
      label: "replacement carrying provenance",
      value: envelope("before_agent_run", {
        barrier: {
          outcome: "replace",
          replacement_code: "sandbox_security_policy_blocked",
          replacement_text: "Blocked by sandbox security policy.",
          replacement_provenance: "openclaw-security-fixed-replacement.v1"
        }
      })
    },
    {
      label: "unknown outcome",
      value: envelope("before_agent_run", { barrier: { outcome: "allow" } })
    },
    {
      label: "non-null callId on a non-tool point",
      value: envelope("before_agent_run", {
        correlation: { runId: "run-1", sessionKey: "session-1", callId: "call-1" }
      })
    }
  ];

  for (const testCase of malformed) {
    const result = await callBarrier("before_agent_run", async () => testCase.value);
    assert.deepEqual(
      result,
      UNAVAILABLE_BARRIER,
      `${testCase.label} must fail closed`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 rejects correlation drift on every axis", async () => {
  const drifts: Array<{ label: string; correlation: RecordValue }> = [
    {
      label: "runId drift",
      correlation: { runId: "run-other", sessionKey: "session-1", callId: null }
    },
    {
      label: "sessionKey drift",
      correlation: { runId: "run-1", sessionKey: "session-other", callId: null }
    }
  ];

  for (const drift of drifts) {
    const result = await callBarrier("before_agent_run", async () =>
      envelope("before_agent_run", { correlation: drift.correlation })
    );
    assert.deepEqual(result, UNAVAILABLE_BARRIER, `${drift.label} must fail closed`);
  }

  const callIdDrift = await callBarrier("before_tool_execution", async () =>
    envelope("before_tool_execution", {
      correlation: { runId: "run-1", sessionKey: "session-1", callId: "call-other" }
    })
  );
  assert.deepEqual(callIdDrift, UNAVAILABLE_BARRIER, "callId drift must fail closed");

  const missingCallId = await callBarrier("before_tool_execution", async () =>
    envelope("before_tool_execution", {
      correlation: { runId: "run-1", sessionKey: "session-1", callId: null }
    })
  );
  assert.deepEqual(
    missingCallId,
    UNAVAILABLE_BARRIER,
    "a tool point requires its exact call ID"
  );
});

test("REQ-SBX-GENERAL-004 P4-T2 rejects missing host identity", async () => {
  const noRun = await callBarrier(
    "before_agent_run",
    async () => envelope("before_agent_run"),
    { event: {}, ctx: { sessionKey: "session-1" } }
  );
  assert.deepEqual(noRun, UNAVAILABLE_BARRIER, "missing runId must fail closed");

  const noSession = await callBarrier(
    "before_agent_run",
    async () => envelope("before_agent_run"),
    { event: { runId: "run-1" }, ctx: { runId: "run-1" } }
  );
  assert.deepEqual(
    noSession,
    UNAVAILABLE_BARRIER,
    "missing sessionKey must fail closed"
  );
});

test("REQ-SBX-GENERAL-004 P4-T2 requires exactly one security registration", async () => {
  for (const point of ALL_BARRIER_HOOKS) {
    const runner = await makeRunner(patched(), []);
    const method = runner[RUNNER_METHOD[point]] as Function;
    assert.equal(typeof method, "function");
    assert.deepEqual(
      await method(hostEvent(point), hostCtx()),
      UNAVAILABLE_BARRIER,
      `${point} must fail closed with no registration`
    );

    const duplicate = await callBarrier(point, async () => envelope(point), {
      extraHooks: [
        {
          hookName: point,
          pluginId: SECURITY_PLUGIN_ID,
          handler: async () => envelope(point),
          priority: 900
        }
      ]
    });
    assert.deepEqual(
      duplicate,
      UNAVAILABLE_BARRIER,
      `${point} must fail closed on duplicate registration`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 ignores a foreign plugin and fails closed", async () => {
  const result = await callBarrier(
    "before_agent_run",
    async () => envelope("before_agent_run"),
    { pluginId: "some-other-plugin" }
  );
  assert.deepEqual(
    result,
    UNAVAILABLE_BARRIER,
    "a foreign plugin cannot satisfy the security barrier"
  );
});

test("REQ-SBX-GENERAL-004 P4-T2 a foreign plugin cannot bypass or outrank the security barrier", async () => {
  let foreignCalls = 0;
  const result = await callBarrier(
    "before_agent_run",
    async () =>
      envelope("before_agent_run", {
        barrier: {
          outcome: "replace",
          replacement_code: "sandbox_security_policy_blocked",
          replacement_text: "Blocked by sandbox security policy."
        }
      }),
    {
      extraHooks: [
        {
          hookName: "before_agent_run",
          pluginId: "loud-plugin",
          handler: async () => {
            foreignCalls += 1;
            return { outcome: "pass" };
          },
          priority: 5000
        }
      ],
      pluginIds: [SECURITY_PLUGIN_ID, "loud-plugin"]
    }
  );
  assert.deepEqual(result, {
    outcome: "replace",
    replacement_code: "sandbox_security_policy_blocked",
    replacement_text: "Blocked by sandbox security policy."
  });
  assert.equal(foreignCalls, 0, "the closed runner must not invoke foreign handlers");
});

test("REQ-SBX-GENERAL-004 P4-T2 a throwing handler fails closed without escaping", async () => {
  for (const point of ALL_BARRIER_HOOKS) {
    const result = await callBarrier(point, async () => {
      throw new Error("handler exploded");
    });
    assert.deepEqual(result, UNAVAILABLE_BARRIER, `${point} must swallow throws`);
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 pins the fixed barrier deadline at 10000 ms in code", () => {
  const source = readFileSync(
    join(patched().openclawDir, "dist", "hook-runner-global-D_43rcnU.js"),
    "utf8"
  );
  assert.equal(
    source.includes(String(SECURITY_DEADLINE_MS)),
    true,
    "the patched runner must pin the 10000 ms barrier deadline"
  );
});

test("REQ-SBX-GENERAL-004 P4-T2 awaits the barrier rather than resolving early", async () => {
  let released: (() => void) | null = null;
  const gate = new Promise<void>((resolveGate) => {
    released = resolveGate;
  });

  const pending = callBarrier("before_tool_execution", async () => {
    await gate;
    return envelope("before_tool_execution");
  });

  const sentinel = Symbol("pending");
  const raced = await Promise.race([
    pending,
    new Promise((resolveRace) => setTimeout(() => resolveRace(sentinel), 150))
  ]);
  assert.equal(raced, sentinel, "the runner must still be awaiting the handler");

  (released as unknown as () => void)();
  assert.deepEqual(await pending, { outcome: "pass" });
});

test("REQ-SBX-GENERAL-004 P4-T2 fails closed when the handler exceeds the fixed deadline", async () => {
  const result = await callBarrier(
    "before_message_delivery",
    () => new Promise(() => {})
  );
  assert.deepEqual(
    result,
    UNAVAILABLE_BARRIER,
    "a hung handler must fail closed at the fixed deadline"
  );
});

// ---------------------------------------------------------------------------
// Ephemeral manifest over the current partial patch
// ---------------------------------------------------------------------------

test("REQ-SBX-GENERAL-004 P4-T2 the current patch verifies under an ephemeral manifest", async () => {
  const { applyVerifiedPatch } = (await import(
    new URL("../scripts/apply-general-security-patch.mjs", import.meta.url).href
  )) as { applyVerifiedPatch: (input: RecordValue) => { status: string } };

  const pristine = installedOpenClawRoot();
  const patchText = readFileSync(PATCH_PATH, "utf8");
  const targets = [
    ...new Set(
      patchText
        .split("\n")
        .filter((line) => line.startsWith("--- a/"))
        .map((line) => line.slice("--- a/".length).trim())
    )
  ].sort();
  assert.notEqual(targets.length, 0, "the patch must declare targets");

  const files = targets.map((path) => ({
    path,
    sha256_before: sha256OfFile(join(pristine, path)),
    sha256_after: sha256OfFile(join(patched().openclawDir, path))
  }));
  for (const entry of files) {
    assert.notEqual(
      entry.sha256_before,
      entry.sha256_after,
      `${entry.path} must actually change`
    );
  }

  const target = buildFixture({ patched: false });
  try {
    const manifestPath = join(target.root, "ephemeral-manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schema_version: "openclaw-security-patch-manifest.v1",
        package_name: "openclaw",
        package_version: OPENCLAW_VERSION,
        npm_integrity:
          "sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB+8SVFdh0FPNPHRVgZepzNJDfHg==",
        tarball_sha256:
          "d0edcbc937428ce1cb5729e444ea615651c9a8895807653ac2c4ed4e05122fa5",
        patch_tool: "git",
        patch_tool_version: "2.43.0",
        patch_sha256: createHash("sha256")
          .update(readFileSync(PATCH_PATH))
          .digest("hex"),
        files
      })
    );

    assert.equal(
      applyVerifiedPatch({
        packageRoot: target.openclawDir,
        manifestPath,
        patchPath: PATCH_PATH
      }).status,
      "applied"
    );
    assert.equal(
      applyVerifiedPatch({
        packageRoot: target.openclawDir,
        manifestPath,
        patchPath: PATCH_PATH
      }).status,
      "already_applied"
    );
  } finally {
    target.cleanup();
  }
});

test("REQ-SBX-GENERAL-004 P4-T2 the patch touches only reviewed files and no Track 1 path", () => {
  const patchText = readFileSync(PATCH_PATH, "utf8");
  const allowed = new Set([
    "dist/plugin-sdk/hook-types-H9SC6W-p.d.ts",
    "dist/command-registration-BBago94k.js",
    "dist/hook-runner-global-D_43rcnU.js",
    "dist/lifecycle-hook-helpers-Dowa8zK4.js",
    "dist/selection-DopzNY3I.js",
    "dist/cli-runner-B0eKIePw.js",
    "dist/run-attempt-6K7vbtby.js",
    "dist/agent-tools.before-tool-call-59sE70R-.js",
    "dist/tool-split-BKKaUdyz.js",
    "dist/dispatch-BSYjC-fp.js",
    "dist/agent-runner.runtime-BUWW8f6n.js",
    "dist/deliver-CJEsHkyF.js",
    "dist/delivery-CExBlTq2.js"
  ]);

  const targets = patchText
    .split("\n")
    .filter((line) => line.startsWith("--- a/") || line.startsWith("+++ b/"))
    .map((line) => line.slice(6).trim());
  assert.notEqual(targets.length, 0);
  for (const target of targets) {
    assert.equal(
      allowed.has(target),
      true,
      `${target} is outside the thirteen-file manifest`
    );
    assert.equal(target.includes(".."), false, "no path traversal is allowed");
  }
  assert.equal(
    patchText.includes("integrations/openclaw/openclaw"),
    false,
    "the patch must never target the Track 1 package"
  );
  assert.equal(
    targets.includes("dist/registry-BiuJAn1Z.js"),
    false,
    "registry-BiuJAn1Z.js must stay unpatched"
  );
});
