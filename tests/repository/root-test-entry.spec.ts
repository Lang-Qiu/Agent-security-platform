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
});
