import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import {
  assertTrack1Snapshot,
  scanManagedArtifacts,
  snapshotTrack1OwnedSurfaces
} from "./helpers/sandbox-security-openclaw-privacy.ts";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const readOptional = (path: string) => {
  try {
    return read(path);
  } catch (error: unknown) {
    if (!existsSync(new URL(`../../${path}`, import.meta.url))) return "";
    throw error;
  }
};

const readJson = (path: string) =>
  JSON.parse(read(path)) as Record<string, unknown>;

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TRACK1_PHASE_ENTRY_SNAPSHOT = Object.freeze({
  baseline_commit: "71c1ef5c6523243de422c13bfb2f845f719995d8",
  file_count: 38,
  aggregate_sha256: "21dad1290ffbd42b4c5a95c0d96893c7e15d4ec66128d5f5e55ba5fb7d19bad9"
});

test("REQ-SBX-GENERAL-004 P5-T3 scanner rejects every transformed sentinel mutation", () => {
  const sentinel = `G4-P5T3-\uFF33entinel-"raw"\\-8d4c`;
  const mutations = [
    ["literal", sentinel],
    ["case-folded", sentinel.normalize("NFKC").toLocaleLowerCase()],
    ["nfkc", sentinel.normalize("NFKC")],
    ["json-escaped", JSON.stringify(sentinel).slice(1, -1)],
    ["percent-encoded", encodeURIComponent(sentinel)],
    ["base64", Buffer.from(sentinel, "utf8").toString("base64")],
    ["hex", Buffer.from(sentinel, "utf8").toString("hex")],
    [
      "sha256",
      createHash("sha256").update(sentinel, "utf8").digest("hex")
    ]
  ] as const;
  const findings = scanManagedArtifacts(
    mutations.map(([encoding, value]) => ({
      id: `mutation-${encoding}`,
      bytes: Buffer.from(value, "utf8")
    })),
    sentinel
  );
  assert.deepEqual(
    findings.map((finding) => [finding.artifact_id, finding.encoding]),
    mutations.map(([encoding]) => [`mutation-${encoding}`, encoding])
  );
});

test("REQ-SBX-GENERAL-004 P5-T3 Track 1 snapshot detects a copied byte mutation", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "g4-p5t3-track1-"));
  try {
    for (const surface of [
      "integrations/openclaw",
      "deploy/track1",
      "docs/track1/evidence"
    ]) {
      cpSync(join(REPO_ROOT, surface), join(tempRoot, surface), {
        recursive: true,
        dereference: false,
        filter: (source) => {
          const segments = relative(REPO_ROOT, source).split(sep);
          return !segments.some((segment) =>
            ["dist", "node_modules"].includes(segment)
          );
        }
      });
    }
    const baseline = snapshotTrack1OwnedSurfaces(REPO_ROOT);
    const target = join(tempRoot, "integrations/openclaw/package.json");
    writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from("\n", "ascii")]));
    const mutated = snapshotTrack1OwnedSurfaces(tempRoot);
    assert.notDeepEqual(mutated, baseline);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-004 P5-T3 Track 1 owned surfaces match the clean Phase entry snapshot", () => {
  assertTrack1Snapshot(REPO_ROOT, TRACK1_PHASE_ENTRY_SNAPSHOT);
});

test("REQ-SBX-GENERAL-004 keeps one reviewed spec and five ordered plans", () => {
  const spec = read(
    "docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md"
  );
  const master = read(
    "docs/superpowers/plans/2026-08-06-sandbox-security-openclaw-enforcement-004-master.md"
  );
  const sprint = read("docs/sprint-current.md");
  const phasePlans = [
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-1-contracts-package.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-2-backend-sqlite.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-3-plugin-enforcement.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-4-openclaw-patch.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-5-deployment-closure.md"
  ] as const;
  const rootPackage = readJson("package.json") as {
    scripts?: Record<string, string>;
  };

  assert.match(spec, /Final verdict: `PASS`/);
  assert.match(spec, /Status: `SPEC_APPROVED`/);
  assert.match(spec, /openclaw@2026\.6\.34/);
  assert.match(master, /Status: `PLAN_APPROVED`/);
  assert.match(
    sprint,
    /## Status\s+(IMPLEMENTATION_IN_PROGRESS|IMPLEMENTED_PENDING_GLOBAL_P6_GATE)/
  );
  assert.match(sprint, /GENERAL-002 is `VERIFIED`/);

  const discoveredPhasePlans = readdirSync(
    new URL("../../docs/superpowers/plans/", import.meta.url)
  )
    .filter((name) =>
      /^2026-08-06-sandbox-security-openclaw-enforcement-004-phase-.*\.md$/.test(
        name
      )
    )
    .sort();
  assert.deepEqual(discoveredPhasePlans, [...phasePlans].sort());

  let previousIndex = -1;
  for (const [index, filename] of phasePlans.entries()) {
    read(`docs/superpowers/plans/${filename}`);
    const currentIndex = master.indexOf(`| ${index + 1} | \`${filename}\``);
    assert.ok(
      currentIndex > previousIndex,
      `plan ${index + 1} is missing or out of order`
    );
    previousIndex = currentIndex;
  }

  assert.match(
    rootPackage.scripts?.["test:repo"] ?? "",
    /sandbox-security-openclaw-enforcement\.spec\.ts/
  );
});

test("REQ-SBX-GENERAL-004 leaves the Track 1 package pin unchanged", () => {
  const track1 = readJson("integrations/openclaw/package.json") as {
    dependencies?: Record<string, string>;
  };
  assert.equal(track1.dependencies?.openclaw, "2026.6.10");
});

test("REQ-SBX-GENERAL-004 P5-T1 image contains only the protected OpenClaw runtime", () => {
  const dockerfile = readOptional("deploy/sandbox-security/Dockerfile.openclaw");
  const nodeBase =
    "node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90";

  assert.match(dockerfile, new RegExp(`^FROM ${nodeBase} AS builder$`, "m"));
  assert.match(dockerfile, new RegExp(`^FROM ${nodeBase} AS runtime$`, "m"));
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /pnpm prune --prod/);
  assert.match(dockerfile, /apply-general-security-patch\.mjs/);
  assert.match(dockerfile, /runOpenClawSecurityRuntimeProbe/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /OPENCLAW_CONFIG_PATH=\/opt\/openclaw-general-security\/config\/openclaw-security\.json5/);
  assert.match(dockerfile, /COPY integrations\/openclaw\/general-security\/package\.json/);
  assert.match(dockerfile, /COPY integrations\/openclaw\/general-security\/pnpm-lock\.yaml/);
  assert.match(dockerfile, /COPY shared /);
  assert.match(dockerfile, /COPY engines\/sandbox\/src /);
  assert.match(dockerfile, /COPY --from=builder .*\/node_modules \/opt\/openclaw-general-security\/node_modules/);
  assert.match(
    dockerfile,
    /chmod[\s\S]*openclaw-2026\.6\.34-general-security\.patch/
  );
  assert.match(
    dockerfile,
    /chmod[\s\S]*openclaw-2026\.6\.34-general-security\.manifest\.json/
  );
  assert.equal(/ARG .*KEY|ARG .*TOKEN|2026\.6\.10/i.test(dockerfile), false);
  assert.equal(dockerfile.includes("integrations/openclaw/config"), false);
  assert.equal(dockerfile.includes("COPY integrations/openclaw/general-security /"), false);
  assert.equal(dockerfile.includes("COPY integrations/openclaw/general-security/src"), true);
  assert.equal(dockerfile.includes("COPY integrations/openclaw/general-security/tests"), false);
  assert.equal(dockerfile.includes("npm install --global openclaw"), false);

  const runtimeStage = dockerfile.slice(dockerfile.indexOf(" AS runtime"));
  assert.equal(runtimeStage.includes("/build/integrations/openclaw/general-security/src"), false);
  assert.equal(runtimeStage.includes("/build/integrations/openclaw/general-security/tests"), false);
  assert.equal(runtimeStage.includes("typescript"), false);
  assert.equal(runtimeStage.includes("esbuild"), false);
});

test("REQ-SBX-GENERAL-004 P5-T1 config closes plugin identity, startup inputs, and managed storage", () => {
  const raw = readOptional(
    "integrations/openclaw/general-security/config/openclaw-security.json5"
  );
  assert.notEqual(raw, "", "protected runtime config must exist");
  const config = YAML.parse(raw) as Record<string, any>;
  const plugin = config.plugins?.entries?.["agent-security-sandbox-general"];

  assert.deepEqual(config.plugins?.allow, ["agent-security-sandbox-general"]);
  assert.deepEqual(config.plugins?.load?.paths, ["/opt/openclaw-general-security"]);
  assert.deepEqual(Object.keys(config.plugins?.entries ?? {}), [
    "agent-security-sandbox-general"
  ]);
  assert.equal(plugin?.enabled, true);
  assert.equal(plugin?.hooks?.allowConversationAccess, true);
  assert.deepEqual(plugin?.config, {
    policyProfileId: "${SANDBOX_SECURITY_POLICY_PROFILE_ID}",
    productionMode: "${SANDBOX_SECURITY_PRODUCTION_MODE}",
    auditEndpoint: "${SANDBOX_SECURITY_AUDIT_ENDPOINT}",
    auditCapabilityToken: "${SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN}"
  });
  assert.equal(config.agents?.defaults?.workspace, "/workspace");
  assert.equal(config.session?.store, "/run/openclaw-security/sessions.json");
  assert.deepEqual(config.logging, {
    level: "error",
    consoleLevel: "error",
    redactSensitive: "tools"
  });
  assert.equal(config.diagnostics?.enabled, false);
  assert.equal(config.diagnostics?.memoryPressureSnapshot, false);
  assert.equal(config.diagnostics?.otel?.enabled, false);
  assert.equal(config.diagnostics?.otel?.captureContent, false);
  assert.equal(config.diagnostics?.cacheTrace?.enabled, false);
  assert.equal(config.diagnostics?.cacheTrace?.includeMessages, false);
  assert.equal(config.diagnostics?.cacheTrace?.includePrompt, false);
  assert.equal(config.diagnostics?.cacheTrace?.includeSystem, false);
  assert.equal(config.transcripts?.enabled, false);
  assert.equal(config.gateway?.mode, "local");
  assert.equal(config.gateway?.bind, "loopback");
  assert.equal(config.tools?.profile, "minimal");
  assert.deepEqual(config.skills?.allowBundled, []);

  assert.deepEqual(
    [...raw.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((match) => match[1]).sort(),
    [
      "SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN",
      "SANDBOX_SECURITY_AUDIT_ENDPOINT",
      "SANDBOX_SECURITY_POLICY_PROFILE_ID",
      "SANDBOX_SECURITY_PRODUCTION_MODE"
    ].sort()
  );
  assert.equal(/sbxcap_v1\.[A-Za-z0-9_-]{43}/.test(raw), false);
  assert.equal(raw.includes("--raw-stream"), false);
  assert.equal(raw.includes("2026.6.10"), false);
});

type ComposeService = {
  build?: { context?: string; dockerfile?: string };
  profiles?: string[];
  ports?: unknown;
  volumes?: unknown;
  tmpfs?: string[];
  read_only?: boolean;
  user?: string;
  init?: boolean;
  cap_drop?: string[];
  security_opt?: string[];
  cpus?: string | number;
  mem_limit?: string;
  pids_limit?: number;
  networks?: string[];
  environment?: Record<string, string>;
  healthcheck?: { test?: string[]; interval?: string; timeout?: string; retries?: number };
  restart?: string;
  stop_signal?: string;
};

test("REQ-SBX-GENERAL-004 P5-T2 Compose keeps one isolated non-durable runtime", () => {
  const raw = readOptional(
    "deploy/sandbox-security/compose.openclaw-security.yml"
  );
  assert.notEqual(raw, "", "protected runtime Compose file must exist");
  const compose = YAML.parse(raw) as {
    services?: Record<string, ComposeService>;
    networks?: Record<string, { name?: string; external?: boolean; internal?: boolean }>;
  };
  const serviceNames = Object.keys(compose.services ?? {});
  assert.deepEqual(serviceNames, ["openclaw-security"]);
  const service = compose.services?.["openclaw-security"];
  assert.ok(service);
  assert.deepEqual(service.profiles, ["sandbox-security"]);
  assert.deepEqual(service.build, {
    context: "../..",
    dockerfile: "deploy/sandbox-security/Dockerfile.openclaw"
  });
  assert.equal("ports" in service, false);
  assert.equal("volumes" in service, false);
  // Each tmpfs entry mounts as `<path>:mode=1777`. The mode is required, not
  // cosmetic: a read-only-root container running as the unprivileged `node`
  // user cannot create its scratch subdirectories under a tmpfs that comes up
  // root:root 0755, so the runtime fails to start without a world-writable
  // (sticky) mode. Normalize the mode suffix for the path assertion, then
  // separately require every ephemeral mount to carry mode=1777.
  const tmpfsEntries = service.tmpfs?.slice() ?? [];
  assert.deepEqual(
    tmpfsEntries.map((entry) => entry.split(":")[0]).sort(),
    ["/run/openclaw-security", "/tmp/openclaw", "/workspace"]
  );
  assert.equal(
    tmpfsEntries.every((entry) => /:mode=1777$/.test(entry)),
    true,
    "each tmpfs mount must be world-writable (mode=1777) for the non-root runtime"
  );
  assert.equal(service.read_only, true);
  assert.equal(service.user, "node");
  assert.equal(service.init, true);
  assert.deepEqual(service.cap_drop, ["ALL"]);
  assert.deepEqual(service.security_opt, ["no-new-privileges:true"]);
  assert.equal(service.cpus, "2");
  assert.equal(service.mem_limit, "1g");
  assert.equal(service.pids_limit, 256);
  assert.deepEqual(service.networks, ["sandbox-security-internal-audit"]);
  assert.deepEqual(Object.keys(compose.networks ?? {}), [
    "sandbox-security-internal-audit"
  ]);
  assert.deepEqual(compose.networks?.["sandbox-security-internal-audit"], {
    name: "sandbox-security-internal-audit",
    external: true
  });

  assert.deepEqual(service.environment, {
    OPENCLAW_CONFIG_PATH:
      "/opt/openclaw-general-security/config/openclaw-security.json5",
    OPENCLAW_STATE_DIR: "/run/openclaw-security",
    SANDBOX_SECURITY_POLICY_PROFILE_ID:
      "${SANDBOX_SECURITY_POLICY_PROFILE_ID}",
    SANDBOX_SECURITY_PRODUCTION_MODE: "${SANDBOX_SECURITY_PRODUCTION_MODE}",
    SANDBOX_SECURITY_AUDIT_ENDPOINT:
      "http://sandbox-security-backend:3001/internal/sandbox/security/enforcement-events",
    SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN:
      "${SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN}"
  });
  assert.equal(raw.includes("${SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN:-"), false);
  assert.equal(/sbxcap_v1\.[A-Za-z0-9_-]{43}/.test(raw), false);
  assert.equal(/track1|integrations\/openclaw\/config|2026\.6\.10/i.test(raw), false);

  assert.deepEqual(service.healthcheck?.test?.slice(0, 3), [
    "CMD",
    "node",
    "--input-type=module"
  ]);
  assert.match(service.healthcheck?.test?.join(" ") ?? "", /runOpenClawSecurityRuntimeProbe/);
  assert.equal(service.healthcheck?.interval, "30s");
  assert.equal(service.healthcheck?.timeout, "15s");
  assert.equal(service.healthcheck?.retries, 3);
  assert.equal(service.restart, "no");
  assert.equal(service.stop_signal, "SIGTERM");
});

test("REQ-SBX-GENERAL-004 P5-T2 runbook documents dedicated capability and ephemeral startup", () => {
  const runbook = readOptional("deploy/sandbox-security/README.md");
  assert.notEqual(runbook, "", "protected runtime runbook must exist");
  assert.match(runbook, /docker compose[\s\S]+sandbox-security[\s\S]+config/);
  assert.match(runbook, /docker compose[\s\S]+build openclaw-security/);
  assert.match(runbook, /sandbox-security-backend/);
  assert.match(runbook, /docker network create[\s\S]+--internal[\s\S]+sandbox-security-internal-audit/);
  assert.match(runbook, /sandbox_security:enforcement:audit:write/);
  assert.match(runbook, /sbxcap_v1/);
  assert.match(runbook, /3600|one hour|1 hour/i);
  assert.match(runbook, /tmpfs/);
  assert.match(runbook, /no (named or anonymous )?volume|no durable/i);
  assert.match(runbook, /audit[ -]degraded/i);
  assert.match(runbook, /SIGTERM|docker compose[\s\S]+stop/);
  assert.match(runbook, /plugins inspect agent-security-sandbox-general/);
  assert.match(runbook, /egress[\s\S]+out of scope|out of scope[\s\S]+egress/i);
  assert.equal(/sbxcap_v1\.[A-Za-z0-9_-]{43}/.test(runbook), false);
  assert.equal(/bootstrap.*token|admin.*token.*config/i.test(runbook), false);
});

test("REQ-SBX-GENERAL-004 P5-T3 keeps package, listener, and permanent gate ownership isolated", () => {
  const dockerfile = readOptional("deploy/sandbox-security/Dockerfile.openclaw");
  const compose = readOptional("deploy/sandbox-security/compose.openclaw-security.yml");
  const publicRouter = read("backend/src/common/http/router.ts");
  const rootPackage = readJson("package.json") as {
    scripts?: Record<string, string>;
  };
  const scripts = rootPackage.scripts ?? {};

  assert.doesNotMatch(dockerfile, /deploy\/track1|docs\/track1|agent-security-track1/);
  assert.doesNotMatch(compose, /deploy\/track1|docs\/track1|agent-security-track1/);
  assert.doesNotMatch(publicRouter, /enforcement-events/);
  assert.doesNotMatch(compose, /retry|queue/i);
  assert.doesNotMatch(dockerfile, /persistent|volume|retry|queue/i);
  assert.match(scripts["test:repo"] ?? "", /sandbox-security-openclaw-enforcement\.spec\.ts/);
  assert.match(
    scripts["test:integration:openclaw:security"] ?? "",
    /openclaw-sandbox-security\.runtime\.spec\.ts/
  );
  assert.match(
    scripts["test:integration:openclaw:security"] ?? "",
    /backend-sandbox-security-enforcement-audit\.api\.spec\.ts/
  );
  assert.match(
    scripts["test:backend"] ?? "",
    /backend-sandbox-security-enforcement-audit\.api\.spec\.ts/
  );
  assert.match(
    scripts["test:shared"] ?? "",
    /sandbox-security-enforcement-audit-contract\.spec\.ts/
  );
});

test("REQ-SBX-GENERAL-004 P5-T3 runtime startup resolves the nested CLI and uses injected healthcheck config", () => {
  const dockerfile = readOptional("deploy/sandbox-security/Dockerfile.openclaw");
  const compose = readOptional("deploy/sandbox-security/compose.openclaw-security.yml");
  const runtimeCommand = dockerfile.slice(dockerfile.lastIndexOf("CMD ["));
  const healthcheck = compose.slice(compose.indexOf("healthcheck:"));

  assert.match(
    dockerfile,
    /ENV PATH=\/opt\/openclaw-general-security\/node_modules\/\.bin:\$PATH/
  );
  assert.match(runtimeCommand, /runOpenClawSecurityRuntimeProbe/);
  assert.match(runtimeCommand, /configPath: process\.env\.OPENCLAW_CONFIG_PATH/);
  assert.match(
    runtimeCommand,
    /SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN: process\.env\.SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN/
  );
  assert.match(healthcheck, /configPath: process\.env\.OPENCLAW_CONFIG_PATH/);
  assert.match(
    healthcheck,
    /SANDBOX_SECURITY_POLICY_PROFILE_ID: process\.env\.SANDBOX_SECURITY_POLICY_PROFILE_ID/
  );
  assert.match(
    healthcheck,
    /SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN: process\.env\.SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN/
  );
});

test("REQ-SBX-GENERAL-004 P5-T3 runbook reads the capability without placing it in shell history", () => {
  const runbook = readOptional("deploy/sandbox-security/README.md");

  assert.match(
    runbook,
    /read\s+-r\s+-s[\s\S]+SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN/
  );
  assert.doesNotMatch(
    runbook,
    /export\s+SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN\s*=/
  );
});
