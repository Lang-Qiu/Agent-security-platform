import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  RAW_NARRATIVE_SENTINEL,
  makeAlertView,
  makeBlockedRecordView,
  makeDecisionView,
  makeEventView,
  makeSupervisionCounts,
  makeSupervisionDetail,
  makeSupervisionEvidence,
  makeSupervisionOverview,
  makeSupervisionSummary
} from "../../tests/fixtures/track1-supervision.fixture.ts";

const contractPath = resolve(
  import.meta.dirname,
  "../contracts/supervision.ts"
);

type ContractModule = {
  normalizeSandboxSupervisionSessionSummary?: (value: unknown) => unknown;
  normalizeSandboxSupervisionCounts?: (value: unknown) => unknown;
  normalizeSandboxSupervisionOverview?: (value: unknown) => unknown;
  normalizeSandboxSupervisionEventView?: (value: unknown) => unknown;
  normalizeSandboxSupervisionDecisionView?: (value: unknown) => unknown;
  normalizeSandboxSupervisionAlertView?: (value: unknown) => unknown;
  normalizeSandboxSupervisionBlockedRecordView?: (value: unknown) => unknown;
  normalizeSandboxSupervisionSessionDetail?: (value: unknown) => unknown;
  normalizeSandboxSupervisionEvidenceExport?: (value: unknown) => unknown;
};

async function loadContract(): Promise<ContractModule | null> {
  if (!existsSync(contractPath)) return null;
  return import(pathToFileURL(contractPath).href);
}

test("REQ-T1-SUPERVISION-UI-009 overview contract module exists", () => {
  assert.equal(existsSync(contractPath), true);
});

test("REQ-T1-SUPERVISION-UI-009 normalizes closed session summaries", async () => {
  const module = await loadContract();
  const input = makeSupervisionSummary();
  const normalized = module?.normalizeSandboxSupervisionSessionSummary?.(input);

  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
});

test("REQ-T1-SUPERVISION-UI-009 rejects unsafe summary fields", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      raw_content: "must-not-pass"
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      tool_names: ["shell_exec"]
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      event_count: -1
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 normalizes closed counts", async () => {
  const module = await loadContract();
  const input = makeSupervisionCounts();
  const normalized = module?.normalizeSandboxSupervisionCounts?.(input);

  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
});

test("REQ-T1-SUPERVISION-UI-009 rejects counts with extra or missing keys", async () => {
  const module = await loadContract();
  const valid = makeSupervisionCounts();

  assert.equal(
    module?.normalizeSandboxSupervisionCounts?.({
      ...valid,
      extra_count: 1
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionCounts?.({
      observed_session_count: 1,
      running_session_count: 0,
      awaiting_confirmation_count: 0,
      alert_record_count: 0
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionCounts?.({
      ...valid,
      observed_session_count: -1
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 normalizes overview counts and rows", async () => {
  const module = await loadContract();
  const input = makeSupervisionOverview();
  const normalized = module?.normalizeSandboxSupervisionOverview?.(input) as any;

  assert.deepEqual(normalized, input);
  assert.equal(normalized.sessions.length, input.returned_session_count);
});

test("REQ-T1-SUPERVISION-UI-009 rejects inconsistent overview metadata", async () => {
  const module = await loadContract();
  const valid = makeSupervisionOverview();

  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.({
      ...valid,
      returned_session_count: 99
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.({
      ...valid,
      limit: 101
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.({
      ...valid,
      truncated: true,
      matched_session_count: valid.returned_session_count
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects unsorted or duplicate tool_names", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  // duplicate tool names
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      tool_names: ["send_email", "send_email"]
    }),
    null
  );

  // unsorted tool names (send_email before call_api is wrong; call_api < send_email)
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      tool_names: ["send_email", "call_api"]
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects invalid task status risk or action", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      task_status: "unknown"
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      risk_level: "unknown"
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      highest_action: "block"
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects non-boolean blocked or evidence_available", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      blocked: "true"
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      evidence_available: 1
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects impossible timestamps and oversized timezone offsets", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  // impossible calendar date (February 30)
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      updated_at: "2026-02-30T00:00:00Z"
    }),
    null
  );

  // timezone offset greater than +14:00
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      updated_at: "2026-06-29T00:00:00+14:30"
    }),
    null
  );

  // timezone offset greater than -14:00
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      updated_at: "2026-06-29T00:00:00-14:30"
    }),
    null
  );

  // +14:00 is legal and must pass
  const valid14Offset = makeSupervisionSummary({
    updated_at: "2026-06-29T00:00:00+14:00",
    last_event_at: "2026-06-29T00:00:00+14:00"
  });
  assert.notEqual(
    module?.normalizeSandboxSupervisionSessionSummary?.(valid14Offset),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects overview rows not sorted by updated_at DESC session_id ASC", async () => {
  const module = await loadContract();
  const earlier = makeSupervisionSummary({
    session_id: "session:earlier",
    updated_at: "2026-06-29T00:00:01Z",
    last_event_at: "2026-06-29T00:00:01Z"
  });
  const later = makeSupervisionSummary({
    session_id: "session:later",
    updated_at: "2026-06-29T00:00:09Z",
    last_event_at: "2026-06-29T00:00:09Z"
  });

  // earlier (older) first is wrong; descending updated_at requires later first
  const unsorted = makeSupervisionOverview({
    sessions: [earlier, later],
    returned_session_count: 2,
    matched_session_count: 2,
    counts: makeSupervisionCounts({
      observed_session_count: 2,
      blocked_session_count: 2
    })
  });

  assert.equal(module?.normalizeSandboxSupervisionOverview?.(unsorted), null);

  // tie on updated_at must fall back to ascending session_id
  const tieA = makeSupervisionSummary({
    session_id: "session:zzz",
    updated_at: "2026-06-29T00:00:05Z",
    last_event_at: "2026-06-29T00:00:05Z"
  });
  const tieB = makeSupervisionSummary({
    session_id: "session:aaa",
    updated_at: "2026-06-29T00:00:05Z",
    last_event_at: "2026-06-29T00:00:05Z"
  });

  const wrongTieOrder = makeSupervisionOverview({
    sessions: [tieA, tieB],
    returned_session_count: 2,
    matched_session_count: 2,
    counts: makeSupervisionCounts({
      observed_session_count: 2,
      blocked_session_count: 2
    })
  });

  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.(wrongTieOrder),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects returned_session_count exceeding 100", async () => {
  const module = await loadContract();
  const valid = makeSupervisionOverview();

  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.({
      ...valid,
      returned_session_count: 101,
      matched_session_count: 101,
      truncated: true
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 normalized arrays are defensive copies", async () => {
  const module = await loadContract() as any;

  // Summary: mutating input tool_names must not affect normalized copy
  const summaryInput = makeSupervisionSummary();
  const summaryNormalized = module.normalizeSandboxSupervisionSessionSummary(summaryInput);
  summaryInput.tool_names.push("read_file");
  assert.deepEqual(summaryNormalized.tool_names, ["send_email"]);

  // Overview: mutating input sessions/counts must not affect normalized copy
  const overviewInput = makeSupervisionOverview();
  const overviewNormalized = module.normalizeSandboxSupervisionOverview(overviewInput);
  overviewInput.sessions.push(
    makeSupervisionSummary({ session_id: "session:other" })
  );
  overviewInput.counts.observed_session_count = 99;
  overviewInput.sessions[0].tool_names.push("read_file");
  assert.equal(overviewNormalized.sessions.length, 1);
  assert.equal(overviewNormalized.counts.observed_session_count, 1);
  assert.deepEqual(overviewNormalized.sessions[0].tool_names, ["send_email"]);
});

// ---------------------------------------------------------------------------
// Task 2: Content-free detail and evidence contracts
// ---------------------------------------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 normalizes all seven safe event views", async () => {
  const module = await loadContract() as any;
  const detail = makeSupervisionDetail();

  const types = detail.events.map((event: any) => event.event_type);
  assert.deepEqual(types, [
    "model_input",
    "model_output",
    "tool_request",
    "tool_result",
    "policy_decision",
    "memory_write",
    "memory_read"
  ]);

  const normalized = module.normalizeSandboxSupervisionSessionDetail(detail);
  assert.deepEqual(normalized, detail);
  assert.notEqual(normalized.events, detail.events);
});

test("REQ-T1-SUPERVISION-UI-009 rejects producer narrative in public views", async () => {
  const module = await loadContract() as any;
  const detail = makeSupervisionDetail();
  const decision = detail.policy_decisions[0];

  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      policy_decisions: [
        {
          ...decision,
          reason: RAW_NARRATIVE_SENTINEL
        }
      ]
    }),
    null
  );

  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      alerts: detail.alerts.map((alert: any) => ({
        ...alert,
        title: RAW_NARRATIVE_SENTINEL,
        reason: RAW_NARRATIVE_SENTINEL
      }))
    }),
    null
  );

  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      blocked_records: detail.blocked_records.map((record: any) => ({
        ...record,
        reason: RAW_NARRATIVE_SENTINEL,
        resource_ref: "recipient://leak.local.invalid"
      }))
    }),
    null
  );

  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      events: detail.events.map((event: any, index: number) =>
        index === 0
          ? {
              ...event,
              payload: { ...event.payload, summary: RAW_NARRATIVE_SENTINEL }
            }
          : event
      )
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 enforces detail correlation and counts", async () => {
  const module = await loadContract() as any;
  const detail = makeSupervisionDetail();

  // event.session_id must agree with summary.session_id
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      events: detail.events.map((event: any, index: number) =>
        index === 0 ? { ...event, session_id: "session:other" } : event
      )
    }),
    null
  );

  // alert.decision_id must reference an existing decision
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      alerts: detail.alerts.map((alert: any) => ({
        ...alert,
        decision_id: "decision:missing"
      }))
    }),
    null
  );

  // alert.subject_event_id must reference an existing event
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      alerts: detail.alerts.map((alert: any) => ({
        ...alert,
        subject_event_id: "event:missing"
      }))
    }),
    null
  );

  // blocked_record.decision_id must reference an existing decision
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      blocked_records: detail.blocked_records.map((record: any) => ({
        ...record,
        decision_id: "decision:missing"
      }))
    }),
    null
  );

  // summary.event_count must match events.length
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      summary: { ...detail.summary, event_count: 99 }
    }),
    null
  );

  // summary.alert_count must match alerts.length
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      summary: { ...detail.summary, alert_count: 99 }
    }),
    null
  );

  // summary.decision_count must match policy_decisions.length
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      summary: { ...detail.summary, decision_count: 99 }
    }),
    null
  );

  // summary.blocked_record_count must match blocked_records.length
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      summary: { ...detail.summary, blocked_record_count: 99 }
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 evidence export is closed and defensive", async () => {
  const module = await loadContract() as any;
  const input = makeSupervisionEvidence();
  const normalized = module.normalizeSandboxSupervisionEvidenceExport(input);

  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
  assert.equal(JSON.stringify(normalized).includes("request_id"), false);
  assert.equal(JSON.stringify(normalized).includes("metadata"), false);
  assert.equal(
    JSON.stringify(normalized).includes(RAW_NARRATIVE_SENTINEL),
    false
  );
  assert.equal("reason" in normalized.session.policy_decisions[0], false);
  assert.equal("title" in normalized.session.alerts[0], false);
  assert.equal("resource_ref" in normalized.session.blocked_records[0], false);
});

test("REQ-T1-SUPERVISION-UI-009 rejects invalid SHA-256 and unsafe refs in payloads", async () => {
  const module = await loadContract() as any;

  // invalid SHA-256 on model_input
  const badHashInput = makeEventView("model_input");
  (badHashInput.payload as any).content_sha256 = "not-sha256";
  assert.equal(module.normalizeSandboxSupervisionEventView(badHashInput), null);

  // overlong ref on tool_request target_ref
  const longRefInput = makeEventView("tool_request");
  (longRefInput.payload as any).target_ref = "x".repeat(513);
  assert.equal(module.normalizeSandboxSupervisionEventView(longRefInput), null);

  // unsafe whitespace in memory content_ref
  const wsRefInput = makeEventView("memory_write");
  (wsRefInput.payload as any).content_ref = "fixture://memory/001 with space";
  assert.equal(module.normalizeSandboxSupervisionEventView(wsRefInput), null);
});

test("REQ-T1-SUPERVISION-UI-009 rejects unsafe reason-code and category tokens", async () => {
  const module = await loadContract() as any;

  // reason_code with uppercase and spaces
  assert.equal(
    module.normalizeSandboxSupervisionDecisionView(
      makeDecisionView({ reason_code: "Bad Reason Code" })
    ),
    null
  );

  // overlong reason_code (> 96 chars)
  assert.equal(
    module.normalizeSandboxSupervisionDecisionView(
      makeDecisionView({ reason_code: "a".repeat(97) })
    ),
    null
  );

  // category with invalid characters
  assert.equal(
    module.normalizeSandboxSupervisionAlertView(
      makeAlertView({ category: "Bad Category!" })
    ),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects invalid tool state-change or status values", async () => {
  const module = await loadContract() as any;

  // invalid tool_name on tool_request
  const badToolInput = makeEventView("tool_request");
  (badToolInput.payload as any).tool_name = "shell_exec";
  assert.equal(module.normalizeSandboxSupervisionEventView(badToolInput), null);

  // invalid state_change on tool_result
  const badStateInput = makeEventView("tool_result");
  (badStateInput.payload as any).state_change = "filesystem_write";
  assert.equal(module.normalizeSandboxSupervisionEventView(badStateInput), null);

  // invalid status on tool_result
  const badStatusInput = makeEventView("tool_result");
  (badStatusInput.payload as any).status = "pending";
  assert.equal(module.normalizeSandboxSupervisionEventView(badStatusInput), null);
});

test("REQ-T1-DEMO-010 accepts the simulated tool state-change at the shared boundary", async () => {
  const module = await loadContract() as any;
  const input = makeEventView("tool_result");
  (input.payload as any).state_change = "simulated";

  const normalized = module.normalizeSandboxSupervisionEventView(input);

  assert.equal(normalized?.payload.state_change, "simulated");
});

test("REQ-T1-SUPERVISION-UI-009 rejects arbitrary payload keys on view records", async () => {
  const module = await loadContract() as any;

  // extra key on decision view
  assert.equal(
    module.normalizeSandboxSupervisionDecisionView({
      ...makeDecisionView(),
      debug: "must-not-pass"
    }),
    null
  );

  // extra key on alert view
  assert.equal(
    module.normalizeSandboxSupervisionAlertView({
      ...makeAlertView(),
      debug: "must-not-pass"
    }),
    null
  );

  // extra key on blocked-record view
  assert.equal(
    module.normalizeSandboxSupervisionBlockedRecordView({
      ...makeBlockedRecordView(),
      debug: "must-not-pass"
    }),
    null
  );

  // extra key on event envelope
  const extraKeyInput = makeEventView("model_input");
  assert.equal(
    module.normalizeSandboxSupervisionEventView({ ...extraKeyInput, debug: "x" }),
    null
  );

  // extra key on payload
  const extraPayloadKeyInput = makeEventView("tool_request");
  (extraPayloadKeyInput.payload as any).debug = "must-not-pass";
  assert.equal(
    module.normalizeSandboxSupervisionEventView(extraPayloadKeyInput),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects event order sequence mismatch", async () => {
  const module = await loadContract() as any;
  const detail = makeSupervisionDetail();

  // sequence not ascending: swap first two event positions but keep original
  // sequence numbers, producing [seq=2, seq=1, seq=3, ...]
  const swapped = [...detail.events];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      events: swapped
    }),
    null
  );

  // duplicate sequence
  const dupSeq = detail.events.map((event: any, index: number) =>
    index === 1 ? { ...event, sequence: 1 } : event
  );
  assert.equal(
    module.normalizeSandboxSupervisionSessionDetail({
      ...detail,
      events: dupSeq
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects evidence_available false paired with valid evidence", async () => {
  const module = await loadContract() as any;
  const evidence = makeSupervisionEvidence({
    session: makeSupervisionDetail({
      summary: makeSupervisionSummary({ evidence_available: false })
    })
  });

  assert.equal(
    module.normalizeSandboxSupervisionEvidenceExport(evidence),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects evidence schema mismatch", async () => {
  const module = await loadContract() as any;

  // wrong schema_version
  assert.equal(
    module.normalizeSandboxSupervisionEvidenceExport(
      makeSupervisionEvidence({
        schema_version: "track1-supervision-evidence.v0"
      })
    ),
    null
  );

  // wrong source_schema_version
  assert.equal(
    module.normalizeSandboxSupervisionEvidenceExport(
      makeSupervisionEvidence({
        source_schema_version: "track1-supervision-ui.v0"
      })
    ),
    null
  );

  // wrong session.schema_version
  assert.equal(
    module.normalizeSandboxSupervisionEvidenceExport(
      makeSupervisionEvidence({
        session: makeSupervisionDetail({
          schema_version: "track1-supervision-ui.v0"
        })
      })
    ),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 detail and evidence return defensive copies", async () => {
  const module = await loadContract() as any;

  const detailInput = makeSupervisionDetail();
  const detailNormalized = module.normalizeSandboxSupervisionSessionDetail(detailInput);
  detailInput.events.push(makeEventView("memory_read"));
  detailInput.policy_decisions.push(makeDecisionView());
  detailInput.alerts.push(makeAlertView());
  detailInput.blocked_records.push(makeBlockedRecordView());
  detailInput.events[0].evidence_refs.push("evidence://extra");
  assert.equal(detailNormalized.events.length, 7);
  assert.equal(detailNormalized.policy_decisions.length, 1);
  assert.equal(detailNormalized.alerts.length, 1);
  assert.equal(detailNormalized.blocked_records.length, 1);
  assert.deepEqual(detailNormalized.events[0].evidence_refs, [
    "evidence://model/input/001"
  ]);

  const evidenceInput = makeSupervisionEvidence();
  const evidenceNormalized =
    module.normalizeSandboxSupervisionEvidenceExport(evidenceInput);
  evidenceInput.session.events.push(makeEventView("memory_read"));
  assert.equal(evidenceNormalized.session.events.length, 7);
});
