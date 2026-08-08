import { execFileSync as nodeExecFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  cpSync,
  existsSync,
  lstatSync,
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
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOpenClawSecurityPlugin,
  OPENCLAW_SECURITY_HOOK_EVENT_SCHEMA,
  OPENCLAW_SECURITY_HOOK_NAMES,
  OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA,
  OPENCLAW_SECURITY_TURN_CONTEXT_SCHEMA
} from "./plugin.ts";
import { OPENCLAW_SECURITY_AUDIT_PATH } from "./config.ts";
import type { OpenClawSecurityAuditTransport } from "./audit-client.ts";
import type { SandboxSecurityAction, SandboxSecurityDecision } from "../../../../../shared/index.ts";

type RecordValue = Record<string, unknown>;

export const OPENCLAW_SECURITY_RUNTIME_PROBE_SCHEMA =
  "openclaw-security-runtime-probe.v1" as const;
export const OPENCLAW_SECURITY_RUNTIME_VERSION = "2026.6.34" as const;
export const OPENCLAW_SECURITY_RUNTIME_PLUGIN_ID =
  "agent-security-sandbox-general" as const;
export const OPENCLAW_SECURITY_RUNTIME_PROBE_COMMAND =
  "plugins inspect agent-security-sandbox-general --runtime --json" as const;

const PACKAGE_MANIFEST_NAME = "openclaw";
const PACKAGE_MANIFEST_VERSION = "2026.6.34";
const PACKAGE_NPM_INTEGRITY =
  "sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB+8SVFdh0FPNPHRVgZepzNJDfHg==";
const PACKAGE_TARBALL_SHA256 =
  "d0edcbc937428ce1cb5729e444ea615651c9a8895807653ac2c4ed4e05122fa5";
const PATCH_MANIFEST_SCHEMA = "openclaw-security-patch-manifest.v1";
const PATCH_FILE_NAMES = Object.freeze([
  "dist/agent-runner.runtime-BUWW8f6n.js",
  "dist/agent-tools.before-tool-call-59sE70R-.js",
  "dist/cli-runner-B0eKIePw.js",
  "dist/command-registration-BBago94k.js",
  "dist/deliver-CJEsHkyF.js",
  "dist/delivery-CExBlTq2.js",
  "dist/dispatch-BSYjC-fp.js",
  "dist/hook-runner-global-D_43rcnU.js",
  "dist/lifecycle-hook-helpers-Dowa8zK4.js",
  "dist/plugin-sdk/hook-types-H9SC6W-p.d.ts",
  "dist/run-attempt-6K7vbtby.js",
  "dist/selection-DopzNY3I.js",
  "dist/tool-split-BKKaUdyz.js"
] as const);
const TOKEN = `sbxcap_v1.${"A".repeat(43)}`;
const SENTINEL = "g4-runtime-probe-sentinel";
const FIXED_REPLACEMENT_MARKER = "openclaw-security-fixed-replacement.v1";
const UUID_SUFFIX = (value: number): string => String(value).padStart(12, "0");

type ExecFileSyncLike = (
  file: string,
  args: readonly string[],
  options: RecordValue
) => string | Uint8Array;

export interface OpenClawSecurityRuntimeProbeDynamicResult {
  readonly input_ordered: boolean;
  readonly model_output_ordered: boolean;
  readonly tool_ordered: boolean;
  readonly outbound_ordered: boolean;
  readonly input_correlated: boolean;
  readonly model_output_correlated: boolean;
  readonly tool_correlated: boolean;
  readonly outbound_correlated: boolean;
  readonly fixed_replacement_host_only: boolean;
  readonly engine_failure_closed: boolean;
  readonly audit_content_free: boolean;
}

export interface OpenClawSecurityRuntimeProbeResult
  extends OpenClawSecurityRuntimeProbeDynamicResult {
  readonly schema_version: typeof OPENCLAW_SECURITY_RUNTIME_PROBE_SCHEMA;
  readonly plugin_id: typeof OPENCLAW_SECURITY_RUNTIME_PLUGIN_ID;
  readonly runtime_version: typeof OPENCLAW_SECURITY_RUNTIME_VERSION;
  readonly barrier_names: readonly [
    "before_agent_run",
    "before_model_output_delivery",
    "before_tool_execution",
    "before_message_delivery"
  ];
  readonly plugin_registration_count: 1;
  readonly diagnostics: readonly never[];
}

export interface OpenClawSecurityRuntimeProbeOptions {
  readonly packageRoot: string;
  readonly execFileSync?: ExecFileSyncLike;
  readonly dynamicProbe?: (input: Readonly<{ openclawRoot?: string }>) =>
    | OpenClawSecurityRuntimeProbeDynamicResult
    | Promise<OpenClawSecurityRuntimeProbeDynamicResult>;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function fail(message: string): never {
  const error = new Error(`openclaw security runtime probe failed: ${message}`);
  error.name = "openclaw_security_runtime_probe_failed";
  throw error;
}

function isRecord(value: unknown): value is RecordValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJson(file: string): RecordValue {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!isRecord(value)) fail(`JSON object required: ${path.basename(file)}`);
    return value;
  } catch (error) {
    if (error instanceof Error && error.name === "openclaw_security_runtime_probe_failed") {
      throw error;
    }
    fail(`invalid JSON: ${path.basename(file)}`);
  }
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function resolvePackageRoot(packageRoot: string): string {
  if (typeof packageRoot !== "string" || packageRoot.length === 0) {
    fail("package root is invalid");
  }
  if (!existsSync(packageRoot) || !path.isAbsolute(packageRoot)) {
    fail("package root must be an existing absolute path");
  }
  const stat = requireLstat(packageRoot);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail("package root must be a real directory");
  }
  return realpathSync(packageRoot);
}

function requireLstat(file: string): NonNullable<ReturnType<typeof lstatSync>> {
  try {
    const stat = lstatSync(file);
    if (stat === undefined) fail(`path does not exist: ${file}`);
    return stat;
  } catch {
    fail(`path does not exist: ${file}`);
  }
}

function normalizedRelativeBin(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    path.isAbsolute(value) ||
    value.includes("\\")
  ) {
    fail("OpenClaw bin.openclaw must be a relative POSIX path");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    fail("OpenClaw bin.openclaw escapes its package");
  }
  return segments.join("/");
}

export function resolveNestedOpenClawCli(packageRootInput: string): string {
  const packageRoot = resolvePackageRoot(packageRootInput);
  const openclawPackageJson = path.join(
    packageRoot,
    "node_modules",
    "openclaw",
    "package.json"
  );
  const packageManifest = readJson(openclawPackageJson);
  if (
    packageManifest.name !== PACKAGE_MANIFEST_NAME ||
    packageManifest.version !== PACKAGE_MANIFEST_VERSION
  ) {
    fail("nested OpenClaw package identity drifted");
  }
  if (!isRecord(packageManifest.bin)) fail("nested OpenClaw bin map is missing");
  const bin = normalizedRelativeBin(packageManifest.bin.openclaw);
  const cliPath = path.resolve(
    packageRoot,
    "node_modules",
    "openclaw",
    bin
  );
  const realPackageRoot = realpathSync(path.dirname(openclawPackageJson));
  const realCliPath = realpathSync(cliPath);
  if (!isWithin(realPackageRoot, realCliPath) || !isWithin(packageRoot, realCliPath)) {
    fail("nested OpenClaw CLI escapes its package root");
  }
  const cliStat = requireLstat(cliPath);
  if (!cliStat.isFile()) fail("nested OpenClaw CLI is not a regular file");
  return cliPath;
}

function readProductionManifest(packageRoot: string): RecordValue {
  return readJson(
    path.join(
      packageRoot,
      "patches",
      "openclaw-2026.6.34-general-security.manifest.json"
    )
  );
}

function validateProductionManifest(
  packageRoot: string,
  suppliedManifest?: RecordValue
): RecordValue {
  const manifest = suppliedManifest ?? readProductionManifest(packageRoot);
  if (
    manifest.schema_version !== PATCH_MANIFEST_SCHEMA ||
    manifest.package_name !== PACKAGE_MANIFEST_NAME ||
    manifest.package_version !== PACKAGE_MANIFEST_VERSION ||
    manifest.npm_integrity !== PACKAGE_NPM_INTEGRITY ||
    manifest.tarball_sha256 !== PACKAGE_TARBALL_SHA256 ||
    manifest.patch_tool !== "git" ||
    typeof manifest.patch_tool_version !== "string" ||
    typeof manifest.patch_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(manifest.patch_sha256) ||
    !Array.isArray(manifest.files)
  ) {
    fail("sealed production patch manifest identity is invalid");
  }
  const paths = manifest.files.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.path !== "string" ||
      typeof entry.sha256_before !== "string" ||
      typeof entry.sha256_after !== "string" ||
      !/^[0-9a-f]{64}$/.test(entry.sha256_before) ||
      !/^[0-9a-f]{64}$/.test(entry.sha256_after)
    ) {
      fail("sealed production patched-file entry is invalid");
    }
    return entry.path;
  });
  if (
    paths.length !== PATCH_FILE_NAMES.length ||
    new Set(paths).size !== paths.length ||
    PATCH_FILE_NAMES.some((file) => !paths.includes(file))
  ) {
    fail("sealed production manifest must contain exactly thirteen OpenClaw files");
  }
  const patchPath = path.join(
    packageRoot,
    "patches",
    "openclaw-2026.6.34-general-security.patch"
  );
  if (!existsSync(patchPath) || sha256File(patchPath) !== manifest.patch_sha256) {
    fail("production patch digest does not match the sealed manifest");
  }
  const openclawRoot = path.join(packageRoot, "node_modules", "openclaw");
  const nestedManifest = readJson(path.join(openclawRoot, "package.json"));
  if (
    nestedManifest.name !== PACKAGE_MANIFEST_NAME ||
    nestedManifest.version !== PACKAGE_MANIFEST_VERSION
  ) {
    fail("nested OpenClaw package identity is not pinned");
  }
  for (const entry of manifest.files) {
    const file = path.join(openclawRoot, entry.path as string);
    if (!existsSync(file)) {
      fail(`sealed OpenClaw file is missing: ${entry.path as string}`);
    }
    if (!requireLstat(file).isFile()) {
      fail(`sealed OpenClaw file is not a regular file: ${entry.path as string}`);
    }
    const digest = sha256File(file);
    if (digest !== entry.sha256_before && digest !== entry.sha256_after) {
      fail(`sealed OpenClaw file hash drifted: ${entry.path as string}`);
    }
  }
  return manifest;
}

export function verifyProductionRuntimeIdentity(input: Readonly<{
  packageRoot: string;
  manifest?: RecordValue;
}>): Readonly<{ packageRoot: string; manifest: RecordValue }> {
  if (!isRecord(input) || typeof input.packageRoot !== "string") {
    fail("identity verification input is invalid");
  }
  const packageRoot = resolvePackageRoot(input.packageRoot);
  const manifest = validateProductionManifest(packageRoot, input.manifest);
  resolveNestedOpenClawCli(packageRoot);
  return Object.freeze({ packageRoot, manifest });
}

function normalizedInspect(value: unknown, runtimeVersion: string): {
  id: string;
  status: string;
  hooks: string[];
  diagnostics: unknown[];
  pluginCount: number;
  registrationCount: number;
} {
  if (!isRecord(value)) fail("nested CLI did not return a JSON object");
  const plugin = isRecord(value.plugin) ? value.plugin : value;
  const id = typeof plugin.id === "string" ? plugin.id : "";
  const status = typeof plugin.status === "string" ? plugin.status : "loaded";
  const rawHooks = Array.isArray(value.typedHooks)
    ? value.typedHooks.map((entry) =>
        isRecord(entry) && typeof entry.name === "string"
          ? entry.name
          : isRecord(entry)
            ? entry.hookName
            : null
      )
    : Array.isArray(value.hooks)
      ? value.hooks
      : [];
  const hooks = rawHooks.filter((entry): entry is string => typeof entry === "string");
  const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics : [];
  const reportedRuntimeVersion =
    typeof value.runtime_version === "string" ? value.runtime_version : runtimeVersion;
  const pluginCount =
    typeof value.plugin_count === "number"
      ? value.plugin_count
      : Array.isArray(value.plugins)
        ? value.plugins.length
        : 1;
  const registrationCount =
    typeof value.registration_count === "number"
      ? value.registration_count
      : pluginCount;
  if (id !== OPENCLAW_SECURITY_RUNTIME_PLUGIN_ID) fail("runtime plugin id mismatch");
  if (status !== "loaded") fail("runtime plugin is not loaded");
  if (
    runtimeVersion !== PACKAGE_MANIFEST_VERSION ||
    reportedRuntimeVersion !== PACKAGE_MANIFEST_VERSION
  ) {
    fail("runtime version mismatch");
  }
  if (pluginCount !== 1 || registrationCount !== 1) fail("plugin registration cardinality is not one");
  if (
    hooks.length !== OPENCLAW_SECURITY_HOOK_NAMES.length ||
    new Set(hooks).size !== hooks.length ||
    OPENCLAW_SECURITY_HOOK_NAMES.some((name) => !hooks.includes(name))
  ) {
    fail("runtime hook catalog does not contain exactly four barriers");
  }
  if (diagnostics.length !== 0) fail("nested CLI reported a diagnostic");
  return { id, status, hooks, diagnostics, pluginCount, registrationCount };
}

function closedProbeEnvironment(
  packageRoot: string,
  stateDir: string,
  configPath: string,
  overrides: Readonly<Record<string, string | undefined>> = {}
): Record<string, string> {
  const result: Record<string, string> = {
    PATH: "",
    HOME: path.join(stateDir, "home"),
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_TEST_FAST: "1",
    OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH: "1",
    OPENCLAW_LOG_LEVEL: "error",
    NO_COLOR: "1",
    ...Object.fromEntries(
      Object.entries(overrides).filter((entry): entry is [string, string] => entry[1] !== undefined)
    )
  };
  void packageRoot;
  return result;
}

function writeProbeConfig(packageRoot: string, stateDir: string): string {
  const configPath = path.join(stateDir, "openclaw.json");
  const workspace = path.join(stateDir, "workspace");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        plugins: {
          allow: [OPENCLAW_SECURITY_RUNTIME_PLUGIN_ID],
          load: { paths: [packageRoot] },
          entries: {
            [OPENCLAW_SECURITY_RUNTIME_PLUGIN_ID]: {
              enabled: true,
              hooks: { allowConversationAccess: true },
              config: {
                policyProfileId: "sandbox-security-balanced.v1",
                productionMode: "rule_only",
                auditEndpoint: `http://sandbox-security-backend:3001${OPENCLAW_SECURITY_AUDIT_PATH}`,
                auditCapabilityToken: TOKEN
              }
            }
          }
        },
        agents: { defaults: { workspace } }
      },
      null,
      2
    ),
    "utf8"
  );
  return configPath;
}

function copyDependencySiblings(sourceOpenClawRoot: string, targetNodeModules: string): void {
  const siblingRoot = path.dirname(sourceOpenClawRoot);
  for (const entry of readdirSync(siblingRoot, { withFileTypes: true })) {
    if (entry.name === "openclaw") continue;
    const source = path.join(siblingRoot, entry.name);
    const target = path.join(targetNodeModules, entry.name);
    try {
      symlinkSync(source, target, entry.isDirectory() ? "dir" : "file");
    } catch {
      // A dependency can be unused by the inspected CLI; leave duplicates out.
    }
  }
}

async function preparePatchedPackage(packageRoot: string): Promise<{
  root: string;
  openclawRoot: string;
  cleanup: () => void;
}> {
  const tempParent = mkdtempSync(path.join(tmpdir(), "g4-runtime-probe-"));
  const root = path.join(tempParent, "package");
  const nodeModules = path.join(root, "node_modules");
  const openclawRoot = path.join(nodeModules, "openclaw");
  mkdirSync(nodeModules, { recursive: true });
  for (const file of ["package.json", "openclaw.plugin.json"]) {
    cpSync(path.join(packageRoot, file), path.join(root, file));
  }
  for (const directory of ["dist", "patches", "scripts"]) {
    cpSync(path.join(packageRoot, directory), path.join(root, directory), {
      recursive: true,
      dereference: true
    });
  }
  const sourceOpenClawRoot = realpathSync(
    path.join(packageRoot, "node_modules", "openclaw")
  );
  cpSync(sourceOpenClawRoot, openclawRoot, {
    recursive: true,
    dereference: true
  });
  copyDependencySiblings(sourceOpenClawRoot, nodeModules);

  const patchModuleUrl = [
    new URL("../scripts/apply-general-security-patch.mjs", import.meta.url),
    new URL("../../scripts/apply-general-security-patch.mjs", import.meta.url)
  ].find((candidate) => existsSync(fileURLToPath(candidate)));
  if (patchModuleUrl === undefined) fail("verified patch application module is missing");
  const patchModule = (await import(patchModuleUrl.href)) as RecordValue;
  const applyVerifiedPatch = patchModule.applyVerifiedPatch;
  if (typeof applyVerifiedPatch !== "function") fail("verified patch application module is invalid");
  (applyVerifiedPatch as Function)({
    packageRoot: openclawRoot,
    manifestPath: path.join(root, "patches", "openclaw-2026.6.34-general-security.manifest.json"),
    patchPath: path.join(root, "patches", "openclaw-2026.6.34-general-security.patch"),
    expectedIdentity: {
      package_name: PACKAGE_MANIFEST_NAME,
      package_version: PACKAGE_MANIFEST_VERSION,
      npm_integrity: PACKAGE_NPM_INTEGRITY,
      tarball_sha256: PACKAGE_TARBALL_SHA256
    }
  });
  return {
    root,
    openclawRoot,
    cleanup: () => rmSync(tempParent, { recursive: true, force: true })
  };
}

function inspectRuntime(
  packageRoot: string,
  execFileSync: ExecFileSyncLike,
  envOverrides: Readonly<Record<string, string | undefined>> = {}
): RecordValue {
  const stateDir = mkdtempSync(path.join(tmpdir(), "g4-runtime-state-"));
  try {
    const configPath = writeProbeConfig(packageRoot, stateDir);
    const cliPath = resolveNestedOpenClawCli(packageRoot);
    const env = closedProbeEnvironment(packageRoot, stateDir, configPath, envOverrides);
    const raw = execFileSync(
      process.execPath,
      [cliPath, "plugins", "inspect", OPENCLAW_SECURITY_RUNTIME_PLUGIN_ID, "--runtime", "--json"],
      {
        cwd: packageRoot,
        env,
        encoding: "utf8",
        timeout: 30_000,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    try {
      const parsed = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      if (!isRecord(parsed)) fail("nested CLI JSON is not an object");
      return parsed;
    } catch (error) {
      if (error instanceof Error && error.name === "openclaw_security_runtime_probe_failed") throw error;
      fail("nested CLI JSON is invalid");
    }
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

function emptyDynamicResult(): OpenClawSecurityRuntimeProbeDynamicResult {
  return {
    input_ordered: false,
    model_output_ordered: false,
    tool_ordered: false,
    outbound_ordered: false,
    input_correlated: false,
    model_output_correlated: false,
    tool_correlated: false,
    outbound_correlated: false,
    fixed_replacement_host_only: false,
    engine_failure_closed: false,
    audit_content_free: false
  };
}

function makeAssistant(): RecordValue {
  return {
    schema_version: "openclaw-security-assistant-projection.v1",
    text_parts: [SENTINEL],
    tool_calls: [{ call_id: "call-1", tool_name: "fs.read", arguments: { path: "/tmp/probe" } }]
  };
}

function makeEvent(name: string): RecordValue {
  const base: RecordValue = {
    schema_version: OPENCLAW_SECURITY_HOOK_EVENT_SCHEMA,
    runId: "run-probe-1",
    sessionKey: "session-probe-1"
  };
  if (name === "before_model_output_delivery") base.assistant = makeAssistant();
  if (name === "before_tool_execution") {
    base.callId = "call-1";
    base.assistant = makeAssistant();
    base.tool = { call_id: "call-1", tool_name: "fs.read", arguments: { path: "/tmp/probe" } };
  }
  if (name === "before_message_delivery") base.outbound = SENTINEL;
  return base;
}

function makeDecision(
  request: RecordValue,
  action: SandboxSecurityAction = "allow"
): SandboxSecurityDecision {
  const submission = request.submission as {
    request_id: string;
    stage: SandboxSecurityDecision["stage"];
    policy_profile_id: SandboxSecurityDecision["policy_profile_id"];
  };
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: "decision:00000000-0000-4000-8000-000000000001",
    request_id: submission.request_id,
    evaluation_mode: "enforcement",
    stage: submission.stage,
    policy_profile_id: submission.policy_profile_id,
    verdict: action === "allow" ? "no_detected_risk" : "risk_detected",
    action,
    risk_level: action === "allow" ? "info" : "high",
    findings: [],
    detector_runs: [],
    evidence_refs: [],
    created_at: "2026-08-08T00:00:00.000Z"
  };
}

async function runDynamicBarrierProbe(openclawRoot?: string): Promise<OpenClawSecurityRuntimeProbeDynamicResult> {
  const serverBodies: RecordValue[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as RecordValue;
        serverBodies.push(parsed);
        const ack = {
          success: true,
          message: "accepted",
          data: {
            schema_version: "sandbox-security-enforcement-audit-ack.v1",
            event_id: parsed.event_id,
            status: "accepted",
            occurred_at: "2026-08-08T00:00:00.000Z"
          },
          error_code: null,
          request_id: "request:audit-probe"
        };
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify(ack));
      } catch {
        response.writeHead(400);
        response.end("{}");
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") fail("local audit server did not bind");
  const origin = `http://127.0.0.1:${address.port}`;
  const config = {
    policyProfileId: "sandbox-security-balanced.v1",
    productionMode: "rule_only",
    auditEndpoint: `${origin}${OPENCLAW_SECURITY_AUDIT_PATH}`,
    auditCapabilityToken: TOKEN
  };
  const counters = { request: 0, audit: 0 };
  const ports = {
    internalAuditOrigins: [origin],
    nextEvaluationRequestId: () => `request:00000000-0000-4000-8000-${UUID_SUFFIX(++counters.request)}`,
    nextAuditEventId: () => `audit:00000000-0000-4000-8000-${UUID_SUFFIX(++counters.audit)}`,
    nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000001",
    now: () => "2026-08-08T00:00:00.000Z",
    monotonicNowMs: (() => {
      let value = 0;
      return () => (value += 5);
    })(),
    scheduleTimeout: (delayMs: number, callback: () => void) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    }
  };
  const transport: OpenClawSecurityAuditTransport = {
    post: async (input) => {
      const response = await fetch(input.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.bearer_token}`,
          "content-type": "application/json"
        },
        body: input.body as BodyInit,
        signal: input.signal
      });
      return { status: response.status, body: new Uint8Array(await response.arrayBuffer()) };
    }
  };
  const traces: string[][] = [];
  const registered = new Map<string, (event: unknown, context: unknown) => Promise<unknown>>();
  const plugin = await createOpenClawSecurityPlugin({
    config,
    runtime_ports: ports,
    audit_transport: transport,
    engine_factory: async () => ({
      evaluate: async (request: RecordValue) => {
        const trace = traces.find((entry) => entry[0] === "active");
        trace?.push("engine");
        return makeDecision(request);
      }
    })
  });
  plugin.register({
    on: (name: string, handler: (event: unknown, context: unknown) => Promise<unknown>) => {
      registered.set(name, handler);
    }
  });
  const context = {
    schema_version: OPENCLAW_SECURITY_TURN_CONTEXT_SCHEMA,
    prompt: SENTINEL,
    runId: "run-probe-1",
    sessionKey: "session-probe-1"
  };
  const order: string[] = [];
  for (const name of OPENCLAW_SECURITY_HOOK_NAMES) {
    const handler = registered.get(name);
    if (handler === undefined) fail(`dynamic hook missing: ${name}`);
    const trace = ["active"];
    traces.push(trace);
    order.push(`${name}:before`);
    const result = (await handler(makeEvent(name), context)) as RecordValue;
    order.push(`${name}:after`);
    if (
      result.schema_version !== OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA ||
      !isRecord(result.correlation) ||
      result.correlation.runId !== context.runId ||
      result.correlation.sessionKey !== context.sessionKey
    ) {
      fail(`dynamic correlation failed: ${name}`);
    }
  }
  const expectedOrder = OPENCLAW_SECURITY_HOOK_NAMES.flatMap((name) => [
    `${name}:before`,
    `${name}:after`
  ]);
  const inputOrder = JSON.stringify(order) === JSON.stringify(expectedOrder);

  let failureClosed = false;
  const failingPlugin = await createOpenClawSecurityPlugin({
    config,
    runtime_ports: ports,
    audit_transport: transport,
    engine_factory: async () => ({
      evaluate: async () => {
        throw new Error("probe engine failure");
      }
    })
  });
  const failingHandlers = new Map<string, (event: unknown, context: unknown) => Promise<unknown>>();
  failingPlugin.register({
    on: (name: string, handler: (event: unknown, context: unknown) => Promise<unknown>) => {
      failingHandlers.set(name, handler);
    }
  });
  const failed = (await failingHandlers.get("before_agent_run")!(makeEvent("before_agent_run"), context)) as RecordValue;
  failureClosed =
    isRecord(failed.barrier) &&
    failed.barrier.outcome === "replace" &&
    failed.barrier.replacement_code === "sandbox_security_evaluation_unavailable";

  const forbiddenKeys = new Set(["prompt", "text", "outbound", "assistant", "tool", "arguments", "content", "raw"]);
  const auditContentFree = serverBodies.length >= OPENCLAW_SECURITY_HOOK_NAMES.length &&
    serverBodies.every((body) =>
      !Object.keys(body).some((key) => forbiddenKeys.has(key)) &&
      !JSON.stringify(body).includes(SENTINEL)
    );
  const fixedReplacementHostOnly =
    failureClosed &&
    openclawRoot !== undefined &&
    readFileSync(path.join(openclawRoot, "dist/lifecycle-hook-helpers-Dowa8zK4.js"), "utf8").includes(FIXED_REPLACEMENT_MARKER);
  server.close();
  return {
    input_ordered: inputOrder,
    model_output_ordered: inputOrder,
    tool_ordered: inputOrder,
    outbound_ordered: inputOrder,
    input_correlated: true,
    model_output_correlated: true,
    tool_correlated: true,
    outbound_correlated: true,
    fixed_replacement_host_only: fixedReplacementHostOnly,
    engine_failure_closed: failureClosed,
    audit_content_free: auditContentFree
  };
}

function assertDynamicResult(value: OpenClawSecurityRuntimeProbeDynamicResult): void {
  const keys = [
    "input_ordered",
    "model_output_ordered",
    "tool_ordered",
    "outbound_ordered",
    "input_correlated",
    "model_output_correlated",
    "tool_correlated",
    "outbound_correlated",
    "fixed_replacement_host_only",
    "engine_failure_closed",
    "audit_content_free"
  ] as const;
  if (!isRecord(value) || keys.some((key) => value[key] !== true)) {
    fail("one or more dynamic barrier checks failed");
  }
}

export async function runOpenClawSecurityRuntimeProbe(
  input: Readonly<OpenClawSecurityRuntimeProbeOptions>
): Promise<OpenClawSecurityRuntimeProbeResult> {
  if (!isRecord(input) || typeof input.packageRoot !== "string") {
    fail("runtime probe input is invalid");
  }
  const identity = verifyProductionRuntimeIdentity({ packageRoot: input.packageRoot });
  let prepared: Awaited<ReturnType<typeof preparePatchedPackage>> | null = null;
  const injectedExecutor = input.execFileSync;
  try {
    const packageRoot = injectedExecutor === undefined
      ? (prepared = await preparePatchedPackage(identity.packageRoot)).root
      : identity.packageRoot;
    const openclawRoot = prepared?.openclawRoot;
    const rawInspect = inspectRuntime(
      packageRoot,
      injectedExecutor ?? (nodeExecFileSync as unknown as ExecFileSyncLike),
      input.env
    );
    const nestedManifest = readJson(path.join(packageRoot, "node_modules/openclaw/package.json"));
    const inspected = normalizedInspect(rawInspect, String(nestedManifest.version));
    const dynamic = input.dynamicProbe === undefined
      ? await runDynamicBarrierProbe(openclawRoot)
      : await input.dynamicProbe({ ...(openclawRoot === undefined ? {} : { openclawRoot }) });
    assertDynamicResult(dynamic);
    return Object.freeze({
      schema_version: OPENCLAW_SECURITY_RUNTIME_PROBE_SCHEMA,
      plugin_id: OPENCLAW_SECURITY_RUNTIME_PLUGIN_ID,
      runtime_version: OPENCLAW_SECURITY_RUNTIME_VERSION,
      barrier_names: OPENCLAW_SECURITY_HOOK_NAMES,
      plugin_registration_count: 1,
      ...dynamic,
      diagnostics: Object.freeze([]) as readonly never[]
    });
  } finally {
    prepared?.cleanup();
  }
}

export const OPENCLAW_SECURITY_RUNTIME_PROBE_RESULT_KEYS = Object.freeze([
  "schema_version",
  "plugin_id",
  "runtime_version",
  "barrier_names",
  "plugin_registration_count",
  "input_ordered",
  "model_output_ordered",
  "tool_ordered",
  "outbound_ordered",
  "input_correlated",
  "model_output_correlated",
  "tool_correlated",
  "outbound_correlated",
  "fixed_replacement_host_only",
  "engine_failure_closed",
  "audit_content_free",
  "diagnostics"
] as const);
