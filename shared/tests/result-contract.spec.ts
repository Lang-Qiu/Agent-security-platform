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
  satisfiesSandboxSupervisionContract?: (value: unknown) => boolean;
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
      execution_context: {
        max_targets: 12,
        max_ports_per_target: 48,
        max_runtime_seconds: 300,
        target_http_rps_cap: 5,
        max_tcp_concurrency_per_target: 8,
        audit: {
          query: "port=\"11434\" && protocol=\"http\"",
          source: "fofa",
          requested_by: "sec-ops",
          requested_at: "2026-05-08T10:00:00.000Z",
          interruption_reason: "timeout",
          private_trace: "should-be-stripped"
        }
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
      execution_context: {
        max_targets: 12,
        max_ports_per_target: 48,
        max_runtime_seconds: 300,
        target_http_rps_cap: 5,
        max_tcp_concurrency_per_target: 8,
        audit: {
          query: "port=\"11434\" && protocol=\"http\"",
          source: "fofa",
          requested_by: "sec-ops",
          requested_at: "2026-05-08T10:00:00.000Z",
          interruption_reason: "timeout"
        }
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

test("result contract rejects a finished static analysis result that is missing standardized finding location or message", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before finished static-analysis finding semantics can be validated");

  if (!sharedModule) {
    return;
  }

  const canonicalResult = createCanonicalStaticAnalysisBaseResult("2026-04-02T01:05:00Z");
  const normalizedResult = sharedModule.normalizeBaseResult?.({
    ...canonicalResult,
    details: {
      ...CANONICAL_STATIC_ANALYSIS_DETAILS,
      rule_hits: [
        {
          ...CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[0],
          message: undefined
        },
        {
          ...CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[1],
          file_path: undefined
        }
      ]
    }
  });

  assert.equal(normalizedResult, null);
});

test("result contract rejects a finished static analysis result with an invalid line region", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before static-analysis line-region semantics can be validated");

  if (!sharedModule) {
    return;
  }

  const canonicalResult = createCanonicalStaticAnalysisBaseResult("2026-04-02T01:05:00Z");
  const normalizedResult = sharedModule.normalizeBaseResult?.({
    ...canonicalResult,
    details: {
      ...CANONICAL_STATIC_ANALYSIS_DETAILS,
      rule_hits: [
        {
          ...CANONICAL_STATIC_ANALYSIS_DETAILS.rule_hits?.[0],
          line_start: 9,
          line_end: 4
        }
      ]
    }
  });

  assert.equal(normalizedResult, null);
});

const validDetails = {
  session_id: "session_001",
  events: [
    {
      event_id: "event_tool_001",
      session_id: "session_001",
      sequence: 1,
      event_type: "tool_request",
      occurred_at: "2026-06-27T08:00:01Z",
      source: "agent",
      evidence_refs: ["evidence://tool/request/001"],
      payload: {
        call_id: "call_001",
        tool_name: "send_email",
        target_ref: "recipient://outside.example",
        arguments_ref: "fixture://cases/T1-SC-002-C01/tool-request"
      }
    },
    {
      event_id: "event_decision_001",
      session_id: "session_001",
      sequence: 2,
      event_type: "policy_decision",
      occurred_at: "2026-06-27T08:00:02Z",
      source: "policy",
      evidence_refs: ["evidence://decision/001"],
      payload: {
        decision_id: "decision_001",
        subject_event_id: "event_tool_001",
        policy_id: "policy_tool_target",
        action: "deny",
        reason_code: "target_not_approved",
        reason: "Target is outside the approved fixture set",
        evidence_refs: ["evidence://decision/001"],
        decided_at: "2026-06-27T08:00:02Z"
      }
    }
  ],
  policy_decisions: [
    {
      decision_id: "decision_001",
      subject_event_id: "event_tool_001",
      policy_id: "policy_tool_target",
      action: "deny",
      reason_code: "target_not_approved",
      reason: "Target is outside the approved fixture set",
      evidence_refs: ["evidence://decision/001"],
      decided_at: "2026-06-27T08:00:02Z"
    }
  ],
  alerts: [],
  blocked_records: [
    {
      blocked_record_id: "blocked_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_001",
      resource_ref: "recipient://outside.example",
      reason: "Policy denied the target",
      evidence_refs: ["evidence://blocked/001"],
      occurred_at: "2026-06-27T08:00:02Z"
    }
  ],
  blocked: true,
  event_count: 2
} as const;

const validSandboxResult = {
  task_id: "task_sandbox_001",
  task_type: "sandbox_run",
  engine_type: "sandbox",
  status: "blocked",
  risk_level: "critical",
  summary: "Sandbox blocked a remote script execution",
  details: validDetails,
  created_at: "2026-06-27T08:00:00Z",
  updated_at: "2026-06-27T08:00:01Z"
} as const;

test("result contract normalizes a sandbox result into the shared base shell", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before result shells can be normalized");

  if (!sharedModule) {
    return;
  }

  const resultInput = {
    ...validSandboxResult,
    details: {
      ...validDetails,
      engine_private_event_stream: ["must be stripped"]
    }
  };

  const normalizedResult = sharedModule.normalizeBaseResult?.(resultInput);

  assert.notEqual(normalizedResult, null, "valid blocked sandbox result should normalize");
  if (!normalizedResult) return;

  const normalizedRecord = normalizedResult as Record<string, unknown>;
  const normalizedDetails = normalizedRecord.details as Record<string, unknown>;

  assert.equal(normalizedDetails.event_count, 2);
  assert.equal(normalizedDetails.blocked, true);
  assert.ok(Array.isArray(normalizedDetails.events));
  assert.ok(Array.isArray(normalizedDetails.policy_decisions));
  assert.ok(Array.isArray(normalizedDetails.alerts));
  assert.ok(Array.isArray(normalizedDetails.blocked_records));
  assert.equal(
    Object.hasOwn(normalizedDetails, "engine_private_event_stream"),
    false,
    "engine_private_event_stream must not cross the shared boundary"
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 rejects terminal sandbox results with broken invariants", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null);
  if (!sharedModule) return;

  const invalidDetailOverrides = [
    { event_count: 3 },
    { blocked: false },
    { events: validDetails.events.map((event, index) => ({ ...event, sequence: index === 1 ? 1 : event.sequence })) },
    { events: validDetails.events.map((event, index) => ({ ...event, event_id: index === 1 ? "event_tool_001" : event.event_id })) },
    { events: validDetails.events.map((event, index) => ({ ...event, session_id: index === 0 ? "other_session" : event.session_id })) },
    { policy_decisions: [{ ...validDetails.policy_decisions[0], subject_event_id: "missing_event" }] },
    { policy_decisions: [{ ...validDetails.policy_decisions[0], action: "alert" }] },
    { blocked_records: [{ ...validDetails.blocked_records[0], decision_id: "missing_decision" }] },
    { blocked_records: [] }
  ];

  for (const override of invalidDetailOverrides) {
    const result = sharedModule.normalizeBaseResult?.({
      ...validSandboxResult,
      details: { ...validDetails, ...override }
    });
    assert.equal(result, null, `should reject invalid sandbox result with override: ${JSON.stringify(override)}`);
  }
});

test("REQ-T1-SANDBOX-CONTRACT-005 rejects terminal sandbox results missing required collections", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null);
  if (!sharedModule) return;

  assert.equal(
    sharedModule.normalizeBaseResult?.({
      ...validSandboxResult,
      status: "finished",
      details: { session_id: "session_001", events: [], policy_decisions: [], alerts: [] }
    }),
    null,
    "should reject finished result missing blocked_records"
  );

  assert.equal(
    sharedModule.normalizeBaseResult?.({
      ...validSandboxResult,
      status: "blocked",
      details: { session_id: "session_001", policy_decisions: [], alerts: [], blocked_records: [] }
    }),
    null,
    "should reject blocked result missing events"
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 accepts a pending sandbox result without full collections", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null);
  if (!sharedModule) return;

  assert.notEqual(
    sharedModule.normalizeBaseResult?.({
      task_id: "task_pending_001",
      task_type: "sandbox_run",
      engine_type: "sandbox",
      status: "pending",
      risk_level: "info",
      summary: "Sandbox task pending",
      details: { session_id: "session_pending", alerts: [], blocked: false },
      created_at: "2026-06-27T08:00:00Z",
      updated_at: "2026-06-27T08:00:00Z"
    }),
    null,
    "pending sandbox result should remain valid without full supervision collections"
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 rejects finished sandbox result with only four empty arrays", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null);
  if (!sharedModule) return;

  assert.equal(
    sharedModule.normalizeBaseResult?.({
      task_id: "task_sandbox_bare_001",
      task_type: "sandbox_run",
      engine_type: "sandbox",
      status: "finished",
      risk_level: "info",
      summary: "bare minimum",
      details: {
        events: [],
        policy_decisions: [],
        alerts: [],
        blocked_records: []
      },
      created_at: "2026-06-27T08:00:00Z",
      updated_at: "2026-06-27T08:00:00Z"
    }),
    null,
    "finished result with only empty arrays but no session_id/blocked/event_count must be rejected"
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 rejects terminal alert result without materialized alerts", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null);
  if (!sharedModule) return;

  const alertDecision = {
    ...validDetails.policy_decisions[0],
    decision_id: "decision_alert_001",
    action: "alert"
  };
  const alertEvents = validDetails.events.map((event) =>
    event.event_type === "policy_decision"
      ? {
          ...event,
          payload: alertDecision
        }
      : event
  );

  assert.equal(
    sharedModule.normalizeBaseResult?.({
      ...validSandboxResult,
      status: "finished",
      details: {
        ...validDetails,
        events: alertEvents,
        policy_decisions: [alertDecision],
        alerts: [],
        blocked_records: [],
        blocked: false
      }
    }),
    null,
    "alert action requires at least one alert record"
  );
});
