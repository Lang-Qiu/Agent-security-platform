import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readRootPackageJson() {
  return JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };
}

test("root quality gate delegates to test:all and includes frontend coverage", () => {
  const packageJson = readRootPackageJson();
  const scripts = packageJson.scripts ?? {};

  assert.equal(
    scripts.test,
    "npm run test:all",
    "root test should delegate to the full-stack quality gate"
  );
  assert.match(
    scripts["test:all"] ?? "",
    /\bnpm run test:frontend\b/,
    "test:all should include frontend coverage"
  );
  assert.match(
    scripts["test:all"] ?? "",
    /\bnpm run test:backend\b/,
    "test:all should include backend coverage"
  );
  assert.match(
    scripts["test:all"] ?? "",
    /\bnpm run test:shared\b/,
    "test:all should include shared contract coverage"
  );
  assert.match(
    scripts["test:all"] ?? "",
    /\bnpm run test:engine:sandbox\b/,
    "test:all should include sandbox engine coverage"
  );
  assert.match(
    scripts["test:engine:sandbox"] ?? "",
    /\bengines\/sandbox\/tests\/simulated-tool-contract\.spec\.ts\b/,
    "sandbox engine gate should include simulated-tool contract coverage"
  );
  assert.match(
    scripts["test:engine:sandbox"] ?? "",
    /\bengines\/sandbox\/tests\/simulated-tool-executor\.spec\.ts\b/,
    "sandbox engine gate should include simulated-tool execution coverage"
  );

  for (const replayTest of [
    "engines/sandbox/tests/attack-replay-loader.spec.ts",
    "engines/sandbox/tests/attack-replay-compiler.spec.ts",
    "engines/sandbox/tests/attack-replay-entrypoints.spec.ts"
  ]) {
    assert.ok(
      scripts["test:engine:sandbox"]?.includes(replayTest),
      `sandbox gate should include ${replayTest}`
    );
  }

  assert.ok(
    scripts["test:repo"]?.includes("tests/repository/track1-attack-replay.spec.ts"),
    "repository gate should include Track 1 attack replay coverage"
  );

  assert.match(
    scripts["test:repo"] ?? "",
    /\btests\/repository\/fofa-portscan-workflow\.spec\.ts\b/,
    "test:repo should include naabu+nmap workflow repository coverage"
  );

  assert.match(
    scripts["test:shared"] ?? "",
    /\bshared\/tests\/sandbox-contract\.spec\.ts\b/,
    "test:shared should include sandbox supervision contract coverage"
  );

  const sharedPackageJson = JSON.parse(
    readFileSync(new URL("../../shared/package.json", import.meta.url), "utf8")
  ) as { scripts?: Record<string, string> };

  assert.match(
    sharedPackageJson.scripts?.test ?? "",
    /\btests\/sandbox-contract\.spec\.ts\b/,
    "the shared package test should include sandbox supervision contract coverage"
  );
});
