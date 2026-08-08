import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import YAML from "yaml";

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
