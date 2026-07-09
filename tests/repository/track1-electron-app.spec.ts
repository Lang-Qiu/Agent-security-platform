// Repository gate for the Electron desktop packaging of the review demo
// (REQ-T1-DEMO-011 electron app).
//
// Asserts that:
// - The electron/ workspace package exists with the expected pure modules
// - electron/ is registered in pnpm-workspace.yaml
// - The package.json wires main.mjs, an electron-builder config, and a
//   pinned electron/electron-builder devDependency version
// - The main process spawns the backend rather than reimplementing it, and
//   never hardcodes a weak/short ingest token
// - The electron unit test suite exists and is registered in test:repo

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const packagePath = resolve(repoRoot, "package.json");
const electronPackagePath = resolve(repoRoot, "electron/package.json");
const workspacePath = resolve(repoRoot, "pnpm-workspace.yaml");

const electronSourceFiles = [
  "electron/src/main.mjs",
  "electron/src/wait-for-health.mjs",
  "electron/src/static-proxy-server.mjs",
  "electron/src/seed-demo-campaign.ts"
].map((path) => resolve(repoRoot, path));

const electronTestFiles = [
  "electron/tests/wait-for-health.spec.ts",
  "electron/tests/static-proxy-server.spec.ts",
  "electron/tests/seed-demo-campaign.spec.ts"
].map((path) => resolve(repoRoot, path));

function readOrThrow(path: string): string {
  return readFileSync(path, "utf8");
}

test("REQ-T1-DEMO-011 electron source and test files exist and are non-empty", () => {
  for (const file of [...electronSourceFiles, ...electronTestFiles]) {
    const source = readOrThrow(file);
    assert.ok(source.length > 0, `${file} must not be empty`);
  }
});

test("REQ-T1-DEMO-011 electron/ is registered as a pnpm workspace package", () => {
  const workspace = readOrThrow(workspacePath);
  assert.match(workspace, /^\s*-\s*electron\s*$/m, "pnpm-workspace.yaml must list the electron package");
});

test("REQ-T1-DEMO-011 electron package.json wires main.mjs and a builder config", () => {
  const pkg = JSON.parse(readOrThrow(electronPackagePath)) as {
    main: string;
    devDependencies: Record<string, string>;
    build?: { appId?: string; win?: unknown };
  };
  assert.equal(pkg.main, "src/main.mjs");
  assert.ok(pkg.build?.appId, "electron/package.json must declare an electron-builder appId");
  assert.ok(pkg.build?.win, "electron/package.json must declare a Windows build target");
});

test("REQ-T1-DEMO-011 electron and electron-builder devDependencies are pinned exact versions", () => {
  const pkg = JSON.parse(readOrThrow(electronPackagePath)) as {
    devDependencies: Record<string, string>;
  };
  for (const name of ["electron", "electron-builder"]) {
    const version = pkg.devDependencies[name];
    assert.ok(version, `electron/package.json must declare a devDependency on ${name}`);
    assert.doesNotMatch(
      version,
      /^[\^~]/,
      `${name} version "${version}" must be pinned exactly, not a caret/tilde range`
    );
  }
});

test("REQ-T1-DEMO-011 electron main process spawns the existing backend rather than reimplementing it", () => {
  const main = readOrThrow(resolve(repoRoot, "electron/src/main.mjs"));
  assert.match(
    main,
    /backend[\\/]src[\\/]main\.ts/,
    "main.mjs must spawn backend/src/main.ts as a child process"
  );
  assert.match(main, /spawn\(/, "main.mjs must use child_process.spawn to launch the backend");
});

test("REQ-T1-DEMO-011 electron main process never hardcodes a short/weak ingest token", () => {
  const main = readOrThrow(resolve(repoRoot, "electron/src/main.mjs"));
  assert.doesNotMatch(
    main,
    /TRACK1_INGEST_TOKEN\s*[:=]\s*["'][^"']{0,31}["']/,
    "main.mjs must not hardcode a TRACK1_INGEST_TOKEN literal under 32 characters"
  );
  assert.match(
    main,
    /randomBytes/,
    "main.mjs must derive the ingest token from a random source, not a fixed literal"
  );
});

test("REQ-T1-DEMO-011 seed script reuses shared campaign-ingest contracts instead of duplicating validation", () => {
  const seedScript = readOrThrow(resolve(repoRoot, "electron/src/seed-demo-campaign.ts"));
  assert.match(seedScript, /shared\/contracts\/campaign-ingest\.ts/);
  assert.match(seedScript, /calculateTrack1SnapshotSha256/);
  assert.match(seedScript, /getTrack1CaseExpectedAction/);
});

test("REQ-T1-DEMO-011 electron test suite is registered in test:repo script", () => {
  const pkg = JSON.parse(readOrThrow(packagePath)) as {
    scripts: Record<string, string>;
  };
  assert.match(
    pkg.scripts["test:repo"],
    /track1-electron-app\.spec\.ts/,
    "test:repo script must include track1-electron-app.spec.ts"
  );
});
