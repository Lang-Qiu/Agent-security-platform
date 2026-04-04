import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("static-analysis contract tests do not derive expected severity semantics from fixture aggregation helpers", () => {
  const sharedTaskContractTest = readFile("shared/tests/task-contract.spec.ts");
  const integrationContractTest = readFile("tests/integration/backend-task-center.api.spec.ts");

  assert.doesNotMatch(
    sharedTaskContractTest,
    /summarizeStaticAnalysisRuleHits/,
    "shared task contract tests should use an independent expected structure for severity aggregation semantics"
  );
  assert.doesNotMatch(
    integrationContractTest,
    /summarizeStaticAnalysisRuleHits/,
    "integration contract tests should validate result-to-summary semantics without reusing the fixture aggregation helper"
  );
});
