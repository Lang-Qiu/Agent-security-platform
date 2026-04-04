import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  CANONICAL_STATIC_ANALYSIS_DETAILS,
  CANONICAL_STATIC_ANALYSIS_CREATED_TASK,
  createCanonicalStaticAnalysisBaseResult
} from "../../tests/fixtures/static-analysis-contract.fixture.ts";

const sharedEntrypointPath = resolve(import.meta.dirname, "../index.ts");

type SharedModule = {
  normalizeBaseResult?: (value: unknown) => unknown;
};

async function loadSharedModule(): Promise<SharedModule | null> {
  if (!existsSync(sharedEntrypointPath)) {
    return null;
  }

  return import(pathToFileURL(sharedEntrypointPath).href);
}

test("result contract normalizes an asset scan result into the shared base shell", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before result shells can be normalized");

  if (!sharedModule) {
    return;
  }

  const normalizedResult = sharedModule.normalizeBaseResult?.({
    task_id: "task_asset_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "finished",
    risk_level: "medium",
    summary: "Asset scan finished with one exposed endpoint",
    details: {
      target: {
        target_type: "url",
        target_value: "https://demo-agent.example.com"
      },
      findings: [
        {
          title: "Management endpoint exposed",
          risk_level: "medium"
        }
      ],
      engine_private_trace: "should be stripped"
    },
    created_at: "2026-03-26T00:00:00Z",
    updated_at: "2026-03-26T00:01:00Z",
    extra: true
  });

  assert.deepEqual(normalizedResult, {
    task_id: "task_asset_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "finished",
    risk_level: "medium",
    summary: "Asset scan finished with one exposed endpoint",
    details: {
      target: {
        target_type: "url",
        target_value: "https://demo-agent.example.com"
      },
      findings: [
        {
          title: "Management endpoint exposed",
          risk_level: "medium"
        }
      ]
    },
    created_at: "2026-03-26T00:00:00Z",
    updated_at: "2026-03-26T00:01:00Z"
  });
});

test("result contract normalizes a static analysis result into the shared base shell", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before result shells can be normalized");

  if (!sharedModule) {
    return;
  }

  const canonicalResult = createCanonicalStaticAnalysisBaseResult("2026-04-02T01:05:00Z");
  const normalizedResult = sharedModule.normalizeBaseResult?.({
    ...canonicalResult,
    details: {
      ...CANONICAL_STATIC_ANALYSIS_DETAILS,
      rule_hits: (CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits ?? []).map((ruleHit, index) => ({
        ...ruleHit,
        evidence: {
          slot: index
        },
        trace: [
          {
            step: `trace_${index}`,
            file_path: ruleHit.file_path,
            line_start: ruleHit.line_start,
            line_end: ruleHit.line_end
          }
        ],
        metadata: {
          contract_fixture: true
        },
        engine_private_debug: {
          hidden: true
        }
      })),
      engine_private_ast: {
        hidden: true
      }
    },
    private_result_id: "should-be-stripped"
  });

  assert.deepEqual(normalizedResult, {
    ...canonicalResult,
    details: {
      ...CANONICAL_STATIC_ANALYSIS_DETAILS,
      rule_hits: [
        {
          ...CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[0],
          evidence: {
            slot: 0
          },
          trace: [
            {
              step: "trace_0",
              file_path: CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[0]?.file_path,
              line_start: CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[0]?.line_start,
              line_end: CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[0]?.line_end
            }
          ],
          metadata: {
            contract_fixture: true
          }
        },
        {
          ...CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[1],
          evidence: {
            slot: 1
          },
          trace: [
            {
              step: "trace_1",
              file_path: CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[1]?.file_path,
              line_start: CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[1]?.line_start,
              line_end: CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[1]?.line_end
            }
          ],
          metadata: {
            contract_fixture: true
          }
        }
      ]
    }
  });
});

test("result contract normalizes a sandbox result into the shared base shell", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before result shells can be normalized");

  if (!sharedModule) {
    return;
  }

  const normalizedResult = sharedModule.normalizeBaseResult?.({
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "blocked",
    risk_level: "critical",
    summary: "Sandbox blocked a remote script execution",
    details: {
      session_id: "session_001",
      alerts: [
        {
          alert_id: "alert_001",
          risk_level: "critical",
          action: "block"
        }
      ],
      blocked: true,
      engine_private_event_stream: ["hidden"]
    },
    created_at: "2026-03-26T00:00:00Z",
    updated_at: "2026-03-26T00:01:00Z"
  });

  assert.deepEqual(normalizedResult, {
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "blocked",
    risk_level: "critical",
    summary: "Sandbox blocked a remote script execution",
    details: {
      session_id: "session_001",
      alerts: [
        {
          alert_id: "alert_001",
          risk_level: "critical",
          action: "block"
        }
      ],
      blocked: true
    },
    created_at: "2026-03-26T00:00:00Z",
    updated_at: "2026-03-26T00:01:00Z"
  });
});
