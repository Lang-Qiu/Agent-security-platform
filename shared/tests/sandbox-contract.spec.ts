import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const sharedEntrypointPath = resolve(import.meta.dirname, "../index.ts");

type SharedModule = {
  SANDBOX_EVENT_TYPES?: readonly string[];
  SANDBOX_EVENT_SOURCES?: readonly string[];
  SANDBOX_POLICY_ACTIONS?: readonly string[];
  normalizeSandboxBehaviorEvent?: (value: unknown) => unknown;
  normalizeSandboxPolicyDecision?: (value: unknown) => unknown;
  normalizeSandboxAlert?: (value: unknown) => unknown;
  normalizeSandboxBlockedRecord?: (value: unknown) => unknown;
  satisfiesSandboxSupervisionContract?: (value: unknown) => boolean;
};

async function loadSharedModule(): Promise<SharedModule> {
  return import(pathToFileURL(sharedEntrypointPath).href);
}

const decision = {
  decision_id: "decision_001",
  subject_event_id: "event_tool_001",
  policy_id: "policy_tool_target",
  action: "deny",
  reason_code: "target_not_approved",
  reason: "The requested target is outside the approved fixture set",
  evidence_refs: ["evidence://decision/001"],
  decided_at: "2026-06-27T08:00:07Z"
};

const events = [
  {
    event_id: "event_model_input_001",
    session_id: "session_001",
    sequence: 1,
    event_type: "model_input",
    occurred_at: "2026-06-27T08:00:01Z",
    source: "agent",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C01",
    evidence_refs: ["evidence://model/input/001"],
    payload: {
      model_ref: "model://base/demo",
      content_ref: "fixture://cases/T1-SC-001-C01/input",
      content_sha256: "a".repeat(64),
      summary: "Controlled adversarial input",
      content: "must be stripped"
    }
  },
  {
    event_id: "event_model_output_001",
    session_id: "session_001",
    sequence: 2,
    event_type: "model_output",
    occurred_at: "2026-06-27T08:00:02Z",
    source: "model",
    evidence_refs: ["evidence://model/output/001"],
    payload: {
      model_ref: "model://base/demo",
      content_ref: "fixture://cases/T1-SC-001-C01/output",
      content_sha256: "b".repeat(64)
    }
  },
  {
    event_id: "event_tool_001",
    session_id: "session_001",
    sequence: 3,
    event_type: "tool_request",
    occurred_at: "2026-06-27T08:00:03Z",
    source: "agent",
    evidence_refs: ["evidence://tool/request/001"],
    payload: {
      call_id: "call_001",
      tool_name: "send_email",
      target_ref: "recipient://reviewer@local.invalid",
      arguments_ref: "fixture://cases/T1-SC-002-C01/tool-request"
    }
  },
  {
    event_id: "event_tool_result_001",
    session_id: "session_001",
    sequence: 4,
    event_type: "tool_result",
    occurred_at: "2026-06-27T08:00:04Z",
    source: "tool",
    evidence_refs: ["evidence://tool/result/001"],
    payload: {
      call_id: "call_001",
      tool_name: "send_email",
      status: "rejected",
      result_ref: "evidence://tool/result/001",
      state_change: "none"
    }
  },
  {
    event_id: "event_memory_write_001",
    session_id: "session_001",
    sequence: 5,
    event_type: "memory_write",
    occurred_at: "2026-06-27T08:00:05Z",
    source: "memory",
    evidence_refs: ["evidence://memory/write/001"],
    payload: {
      memory_entry_id: "memory_001",
      content_ref: "fixture://memory/001",
      content_sha256: "c".repeat(64),
      summary: "Controlled memory write"
    }
  },
  {
    event_id: "event_memory_read_001",
    session_id: "session_001",
    sequence: 6,
    event_type: "memory_read",
    occurred_at: "2026-06-27T08:00:06Z",
    source: "memory",
    evidence_refs: ["evidence://memory/read/001"],
    payload: {
      memory_entry_id: "memory_001",
      content_ref: "fixture://memory/001",
      content_sha256: "c".repeat(64)
    }
  },
  {
    event_id: "event_decision_001",
    session_id: "session_001",
    sequence: 7,
    event_type: "policy_decision",
    occurred_at: "2026-06-27T08:00:07Z",
    source: "policy",
    evidence_refs: ["evidence://decision/001"],
    payload: decision
  }
] as const;

test("REQ-T1-SANDBOX-CONTRACT-005 exports the closed event and action enums", async () => {
  const shared = await loadSharedModule();

  assert.deepEqual(shared.SANDBOX_EVENT_TYPES, [
    "model_input",
    "model_output",
    "tool_request",
    "tool_result",
    "policy_decision",
    "memory_write",
    "memory_read"
  ]);
  assert.deepEqual(shared.SANDBOX_EVENT_SOURCES, [
    "model",
    "agent",
    "tool",
    "policy",
    "memory",
    "monitor"
  ]);
  assert.deepEqual(shared.SANDBOX_POLICY_ACTIONS, ["allow", "deny", "ask", "alert"]);
});

test("REQ-T1-SANDBOX-CONTRACT-005 normalizes all seven typed event variants", async () => {
  const shared = await loadSharedModule();

  const normalized = events.map((event) => shared.normalizeSandboxBehaviorEvent?.(event));

  assert.equal(normalized.length, 7);
  assert.ok(normalized.every((event) => event !== null && event !== undefined));
  assert.equal(
    Object.hasOwn((normalized[0] as { payload: object }).payload, "content"),
    false,
    "raw model content must not cross the shared boundary"
  );
  assert.deepEqual(shared.normalizeSandboxPolicyDecision?.(decision), decision);
});

test("REQ-T1-SANDBOX-CONTRACT-005 accepts only the four approved policy actions", async () => {
  const shared = await loadSharedModule();

  for (const action of ["allow", "deny", "ask", "alert"]) {
    assert.equal(
      (shared.normalizeSandboxPolicyDecision?.({ ...decision, action }) as { action?: string })?.action,
      action
    );
  }

  assert.equal(shared.normalizeSandboxPolicyDecision?.({ ...decision, action: "block" }), null);
});

test("REQ-T1-SANDBOX-CONTRACT-005 normalizes typed alert and blocking records", async () => {
  const shared = await loadSharedModule();

  assert.deepEqual(
    shared.normalizeSandboxAlert?.({
      alert_id: "alert_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_alert_001",
      risk_level: "high",
      category: "tool_target",
      title: "Tool target requires attention",
      reason: "Target differs from the approved case fixture",
      evidence_refs: ["evidence://alert/001"],
      occurred_at: "2026-06-27T08:00:08Z",
      raw_prompt: "must be stripped"
    }),
    {
      alert_id: "alert_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_alert_001",
      risk_level: "high",
      category: "tool_target",
      title: "Tool target requires attention",
      reason: "Target differs from the approved case fixture",
      evidence_refs: ["evidence://alert/001"],
      occurred_at: "2026-06-27T08:00:08Z"
    }
  );

  assert.deepEqual(
    shared.normalizeSandboxBlockedRecord?.({
      blocked_record_id: "blocked_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_001",
      resource_ref: "recipient://reviewer@local.invalid",
      reason: "Policy denied the target",
      evidence_refs: ["evidence://blocked/001"],
      occurred_at: "2026-06-27T08:00:08Z"
    }),
    {
      blocked_record_id: "blocked_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_001",
      resource_ref: "recipient://reviewer@local.invalid",
      reason: "Policy denied the target",
      evidence_refs: ["evidence://blocked/001"],
      occurred_at: "2026-06-27T08:00:08Z"
    }
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 rejects malformed event and outcome records", async () => {
  const shared = await loadSharedModule();
  const invalidEvents = [
    { ...events[0], sequence: 0 },
    { ...events[0], sequence: 1.5 },
    { ...events[0], occurred_at: "not-a-timestamp" },
    { ...events[0], event_type: "command_execution" },
    { ...events[0], source: "unknown" },
    { ...events[0], payload: { ...events[0].payload, content_sha256: "not-sha256" } }
  ];

  for (const event of invalidEvents) {
    assert.equal(shared.normalizeSandboxBehaviorEvent?.(event), null);
  }

  assert.equal(
    shared.normalizeSandboxAlert?.({
      alert_id: "legacy_alert",
      event_type: "command_execution",
      action: "block",
      resource: "powershell",
      timestamp: "2026-06-27T08:00:08Z",
      reason: "legacy",
      risk_level: "critical"
    }),
    null
  );
  assert.equal(
    shared.normalizeSandboxBlockedRecord?.({
      blocked_record_id: "blocked_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_001",
      reason: "Policy denied the target",
      evidence_refs: [],
      occurred_at: "invalid"
    }),
    null
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 validates sandbox supervision collection invariants", async () => {
  const shared = await loadSharedModule();

  const validContract = {
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
  };

  assert.equal(
    shared.satisfiesSandboxSupervisionContract?.(validContract),
    true,
    "valid contract should satisfy supervision invariants"
  );

  assert.equal(
    shared.satisfiesSandboxSupervisionContract?.({
      ...validContract,
      event_count: 99
    }),
    false,
    "mismatched event_count should fail"
  );

  assert.equal(
    shared.satisfiesSandboxSupervisionContract?.({
      ...validContract,
      blocked: false
    }),
    false,
    "blocked mismatch should fail"
  );

  assert.equal(
    shared.satisfiesSandboxSupervisionContract?.({
      ...validContract,
      events: []
    }),
    false,
    "empty events with non-zero event_count should fail"
  );

  assert.equal(
    shared.satisfiesSandboxSupervisionContract?.({
      session_id: "session_001",
      events: [],
      policy_decisions: [],
      alerts: [],
      blocked_records: [],
      blocked: false,
      event_count: 0
    }),
    true,
    "empty supervision should satisfy invariants"
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 requires session_id, blocked, and event_count for terminal supervision", async () => {
  const shared = await loadSharedModule();

  const base = {
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
          reason: "Target is outside",
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
        reason: "Target is outside",
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
        reason: "Policy denied",
        evidence_refs: ["evidence://blocked/001"],
        occurred_at: "2026-06-27T08:00:02Z"
      }
    ],
    blocked: true,
    event_count: 2
  };

  // missing session_id
  const { session_id: _sid, ...noSession } = base;
  assert.equal(shared.satisfiesSandboxSupervisionContract?.(noSession), false, "should reject missing session_id");

  // missing blocked
  const { blocked: _blk, ...noBlocked } = base;
  assert.equal(shared.satisfiesSandboxSupervisionContract?.(noBlocked), false, "should reject missing blocked");

  // missing event_count
  const { event_count: _ec, ...noEventCount } = base;
  assert.equal(shared.satisfiesSandboxSupervisionContract?.(noEventCount), false, "should reject missing event_count");

  // status=blocked scenario: blocked=true but empty blocked_records
  assert.equal(
    shared.satisfiesSandboxSupervisionContract?.({
      ...base,
      blocked: true,
      blocked_records: []
    }),
    false,
    "should reject blocked=true with empty blocked_records"
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 enforces one-to-one policy event-to-decision mapping", async () => {
  const shared = await loadSharedModule();

  const toolEvent = {
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
  } as const;

  const decisionD1 = {
    decision_id: "decision_001",
    subject_event_id: "event_tool_001",
    policy_id: "policy_tool_target",
    action: "deny",
    reason_code: "target_not_approved",
    reason: "Target is outside",
    evidence_refs: ["evidence://decision/001"],
    decided_at: "2026-06-27T08:00:02Z"
  } as const;

  const decisionD2 = {
    ...decisionD1,
    decision_id: "decision_002"
  } as const;

  const policyEvent = (payload: typeof decisionD1) => ({
    event_id: `event_decision_${payload.decision_id}`,
    session_id: "session_001",
    sequence: 2,
    event_type: "policy_decision",
    occurred_at: "2026-06-27T08:00:02Z",
    source: "policy",
    evidence_refs: ["evidence://decision/001"],
    payload
  });

  // duplicate policy event decision ID — two events both carry d1, but materialized has d1, d2
  // use "ask" action for d2 so the only deficiency is the decision-ID mismatch
  const decisionD2Ask = { ...decisionD2, action: "ask" as const, decision_id: "decision_002" };
  assert.equal(
    shared.satisfiesSandboxSupervisionContract?.({
      session_id: "session_001",
      events: [
        toolEvent,
        { ...policyEvent(decisionD1), event_id: "event_decision_001", sequence: 2 },
        { ...policyEvent(decisionD1), event_id: "event_decision_002", sequence: 3 }
      ],
      policy_decisions: [decisionD1, decisionD2Ask],
      alerts: [],
      blocked_records: [
        {
          blocked_record_id: "blocked_001",
          subject_event_id: "event_tool_001",
          decision_id: "decision_001",
          reason: "Policy denied",
          evidence_refs: ["evidence://blocked/001"],
          occurred_at: "2026-06-27T08:00:02Z"
        }
      ],
      blocked: true,
      event_count: 3
    }),
    false,
    "should reject duplicate policy event decision IDs"
  );

  // orphan decision in materialized view — d2 has no matching event
  assert.equal(
    shared.satisfiesSandboxSupervisionContract?.({
      session_id: "session_001",
      events: [toolEvent, policyEvent(decisionD1)],
      policy_decisions: [decisionD1, decisionD2],
      alerts: [],
      blocked_records: [
        {
          blocked_record_id: "blocked_001",
          subject_event_id: "event_tool_001",
          decision_id: "decision_001",
          reason: "Policy denied",
          evidence_refs: ["evidence://blocked/001"],
          occurred_at: "2026-06-27T08:00:02Z"
        }
      ],
      blocked: true,
      event_count: 2
    }),
    false,
    "should reject orphan policy_decision with no matching event"
  );
});

test("REQ-T1-SANDBOX-CONTRACT-005 rejects impossible calendar dates", async () => {
  const shared = await loadSharedModule();

  const baseEvent = events[0];

  assert.equal(
    shared.normalizeSandboxBehaviorEvent?.({
      ...baseEvent,
      occurred_at: "2026-02-30T08:00:00Z"
    }),
    null,
    "Feb 30 should be rejected"
  );

  assert.equal(
    shared.normalizeSandboxBehaviorEvent?.({
      ...baseEvent,
      occurred_at: "2025-02-29T08:00:00Z"
    }),
    null,
    "Feb 29 in non-leap year should be rejected"
  );

  // valid dates should still pass
  assert.notEqual(
    shared.normalizeSandboxBehaviorEvent?.({
      ...baseEvent,
      occurred_at: "2024-02-29T08:00:00Z"
    }),
    null,
    "Feb 29 in leap year should be accepted"
  );

  assert.notEqual(
    shared.normalizeSandboxBehaviorEvent?.({
      ...baseEvent,
      occurred_at: "2026-06-27T08:00:00+08:00"
    }),
    null,
    "valid date with timezone offset should be accepted"
  );
});
