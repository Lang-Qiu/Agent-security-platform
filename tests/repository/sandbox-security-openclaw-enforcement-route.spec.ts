import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("REQ-SBX-GENERAL-004 registers exact aggregate security scripts", () => {
  const packageJson = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};

  assert.equal(
    scripts["test:integration:openclaw:security"],
    "node --experimental-strip-types --experimental-test-isolation=none --test integrations/openclaw/general-security/tests/general-security-*.spec.ts tests/integration/openclaw-sandbox-security.runtime.spec.ts tests/integration/backend-sandbox-security-enforcement-audit.api.spec.ts"
  );
  assert.equal(
    scripts["typecheck:integration:openclaw:security"],
    "node ./frontend/node_modules/typescript/bin/tsc --noEmit -p integrations/openclaw/general-security/tsconfig.json"
  );
  assert.match(
    scripts["test:repo"] ?? "",
    /tests\/repository\/sandbox-security-openclaw-package\.spec\.ts/
  );
  assert.match(
    scripts["test:repo"] ?? "",
    /tests\/repository\/sandbox-security-openclaw-enforcement-route\.spec\.ts/
  );
});
