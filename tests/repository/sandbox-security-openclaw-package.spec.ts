import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T;
}

function exists(path: string): boolean {
  return existsSync(new URL(path, ROOT));
}

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  openclaw?: Record<string, unknown>;
};

test("REQ-SBX-GENERAL-004 isolates OpenClaw package roots", () => {
  const parent = readJson<PackageJson>("integrations/openclaw/package.json");
  const securityPackagePath = "integrations/openclaw/general-security/package.json";

  assert.equal(
    exists(securityPackagePath),
    true,
    "the GENERAL-004 package root must exist before its metadata can be inspected"
  );

  const security = readJson<PackageJson>(securityPackagePath);
  const nestedWorkspace = read(
    "integrations/openclaw/general-security/pnpm-workspace.yaml"
  );
  const nestedLock = read(
    "integrations/openclaw/general-security/pnpm-lock.yaml"
  );
  const manifest = readJson<Record<string, any>>(
    "integrations/openclaw/general-security/openclaw.plugin.json"
  );
  const config = read(
    "integrations/openclaw/general-security/config/openclaw-security.json5"
  );
  const source = read("integrations/openclaw/general-security/src/index.ts");
  const build = read("integrations/openclaw/general-security/scripts/build.mjs");

  assert.equal(parent.dependencies?.openclaw, "2026.6.10");
  assert.equal(parent.dependencies?.typebox, "1.1.38");
  assert.equal(security.name, "@agent-security-platform/openclaw-general-security");
  assert.equal(security.version, "0.1.0");
  assert.deepEqual(security.dependencies, { openclaw: "2026.6.34" });
  assert.deepEqual(security.devDependencies, {
    esbuild: "0.25.12",
    typescript: "6.0.2"
  });
  assert.deepEqual(security.openclaw, {
    extensions: ["./dist/index.js"],
    compat: {
      pluginApi: ">=2026.6.34",
      minGatewayVersion: "2026.6.34"
    },
    build: {
      openclawVersion: "2026.6.34",
      pluginSdkVersion: "2026.6.34"
    }
  });
  assert.equal(nestedWorkspace, 'packages:\n  - "."\n');
  assert.match(
    nestedLock,
    /importers:\s+\.:\s+dependencies:\s+openclaw:\s+specifier: 2026\.6\.34\s+version: 2026\.6\.34/
  );
  assert.match(
    nestedLock,
    /openclaw@2026\.6\.34:\s+resolution: \{integrity: sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB\+8SVFdh0FPNPHRVgZepzNJDfHg==\}/
  );
  assert.equal(
    createHash("sha256").update(read("pnpm-lock.yaml")).digest("hex"),
    "c94b923620ce5e3f82616fa366fb530a2b74b44c5ebbbccf572653c2bea06c0d"
  );

  for (const path of [
    "integrations/openclaw/general-security/pnpm-lock.yaml",
    "integrations/openclaw/general-security/tsconfig.json",
    "integrations/openclaw/general-security/scripts/build.mjs",
    "integrations/openclaw/general-security/src/index.ts",
    "integrations/openclaw/general-security/openclaw.plugin.json",
    "integrations/openclaw/general-security/config/openclaw-security.json5"
  ]) {
    assert.equal(exists(path), true, `${path} must be owned by the nested package`);
  }
  assert.deepEqual(
    readdirSync(new URL("integrations/openclaw/general-security/", ROOT))
      .filter((entry) => entry !== "dist" && entry !== "node_modules")
      .sort(),
    [
      "config",
      "openclaw.plugin.json",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "scripts",
      "src",
      "tsconfig.json"
    ]
  );

  assert.equal(manifest.id, "agent-security-sandbox-general");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.main, "./dist/index.js");
  assert.deepEqual(manifest.activation, { onStartup: true });
  assert.deepEqual(manifest.configSchema, {
    type: "object",
    additionalProperties: false,
    required: [
      "policyProfileId",
      "productionMode",
      "auditEndpoint",
      "auditCapabilityToken"
    ],
    properties: {
      policyProfileId: { type: "string" },
      productionMode: { type: "string" },
      auditEndpoint: { type: "string" },
      auditCapabilityToken: { type: "string", writeOnly: true }
    }
  });

  assert.match(source, /export const OPENCLAW_GENERAL_SECURITY_PACKAGE_IDENTITY/);
  assert.match(source, /Object\.freeze/);
  assert.doesNotMatch(source, /before_(?:agent|model|tool|message)/);
  assert.doesNotMatch(source, /from\s+["']openclaw(?:\/|["'])/);
  assert.match(build, /entryPoints:\s*\[entry\]/);
  assert.match(build, /outfile:\s*out/);
  assert.match(build, /external:\s*\[["']openclaw["']/);

  for (const variable of [
    "SANDBOX_SECURITY_POLICY_PROFILE_ID",
    "SANDBOX_SECURITY_PRODUCTION_MODE",
    "SANDBOX_SECURITY_AUDIT_ENDPOINT",
    "SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN"
  ]) {
    assert.match(config, new RegExp(`\\$\\{${variable}\\}`));
  }
  assert.doesNotMatch(config, /sbxcap_v1\.[A-Za-z0-9._-]+/);
});
