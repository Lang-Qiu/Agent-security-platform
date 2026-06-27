import type { BaseResult } from "../../../../shared/types/result.ts";
import type {
  SandboxAlert,
  SandboxBehaviorEvent,
  SandboxBlockedRecord,
  SandboxEventEnvelope,
  SandboxMemoryPayload,
  SandboxModelContentPayload,
  SandboxPolicyAction,
  SandboxPolicyDecision,
  SandboxToolRequestPayload,
  SandboxToolResultPayload
} from "../../../../shared/types/sandbox.ts";
import { normalizeBaseResult } from "../../../../shared/contracts/result.ts";
import { TRACK1_REPLAY_EVIDENCE_REQUIREMENTS, Track1ReplayError } from "./contract.ts";
import type {
  Track1CaseFixture,
  Track1ReplayEvidenceCheck,
  Track1ReplayMetadata,
  Track1ScenarioDefinition
} from "./contract.ts";
import {
  replayEvidenceRef,
  replayId,
  replayTimestamp,
  sha256
} from "./deterministic.ts";

// -- action mapping ------------------------------------------------------

const ACTION_MAPPING: Record<
  SandboxPolicyAction,
  {
    status: "finished" | "blocked";
    risk_level: "info" | "medium" | "high";
    blocked: boolean;
    alerts: number;
    blocked_records: number;
  }
> = {
  allow: { status: "finished", risk_level: "info", blocked: false, alerts: 0, blocked_records: 0 },
  ask: { status: "finished", risk_level: "medium", blocked: false, alerts: 0, blocked_records: 0 },
  alert: { status: "finished", risk_level: "high", blocked: false, alerts: 1, blocked_records: 0 },
  deny: { status: "blocked", risk_level: "high", blocked: true, alerts: 0, blocked_records: 1 }
};

// -- helpers -------------------------------------------------------------

let _seqCounter = 0;

function nextSeq(): number {
  _seqCounter += 1;
  return _seqCounter;
}

function resetSeq(): void {
  _seqCounter = 0;
}

function buildEventId(kind: string, caseId: string): string {
  return replayId(kind, caseId, nextSeq());
}

function buildTimestamp(): string {
  return replayTimestamp(_seqCounter);
}

// -- main compiler -------------------------------------------------------

export function compileTrack1ReplayCase(
  scenario: Track1ScenarioDefinition,
  fixture: Track1CaseFixture
): BaseResult<{ __brand: "SandboxRunResultDetails" }> {
  resetSeq();

  const { case_id } = fixture;
  const sessionId = replayId("session", case_id);
  const caseRef = `fixture://track1/cases/${case_id}`;
  const modelRef = "fixture-model://track1/deterministic";

  // Validate tool disposition safety
  if (
    fixture.input.proposed_tool_call !== null &&
    fixture.expected_outcome.tool_behavior.disposition !== "must_not_execute"
  ) {
    throw new Track1ReplayError(
      "unsafe_tool_execution_requested",
      `${case_id}: proposed tool call requires must_not_execute disposition`
    );
  }

  const events: SandboxBehaviorEvent[] = [];

  // -- 1. Memory write + read for each memory entry ----------------------

  const memoryEntryIds: string[] = [];

  for (const entry of fixture.input.memory_entries) {
    const contentDigest = sha256(entry.content);
    const contentRef = replayEvidenceRef("memory-content", case_id);

    // memory_write
    const writePayload: SandboxMemoryPayload = {
      memory_entry_id: entry.memory_id,
      content_ref: contentRef,
      content_sha256: contentDigest
    };

    const writeEvent: SandboxEventEnvelope<"memory_write", SandboxMemoryPayload> = {
      event_id: buildEventId("memory-write", case_id),
      session_id: sessionId,
      sequence: _seqCounter,
      event_type: "memory_write",
      occurred_at: buildTimestamp(),
      source: "memory",
      scenario_id: fixture.scenario_id,
      case_id: fixture.case_id,
      evidence_refs: [replayEvidenceRef("memory-write", case_id)],
      payload: writePayload
    };
    events.push(writeEvent);
    memoryEntryIds.push(writeEvent.event_id);

    // memory_read
    const readPayload: SandboxMemoryPayload = {
      memory_entry_id: entry.memory_id,
      content_ref: contentRef,
      content_sha256: contentDigest
    };

    const readEvent: SandboxEventEnvelope<"memory_read", SandboxMemoryPayload> = {
      event_id: buildEventId("memory-read", case_id),
      session_id: sessionId,
      sequence: _seqCounter,
      event_type: "memory_read",
      occurred_at: buildTimestamp(),
      source: "memory",
      scenario_id: fixture.scenario_id,
      case_id: fixture.case_id,
      evidence_refs: [replayEvidenceRef("memory-read", case_id)],
      payload: readPayload
    };
    events.push(readEvent);
  }

  // -- 2. Model input ----------------------------------------------------

  const modelInputDigest = sha256(
    JSON.stringify({
      user_prompt: fixture.input.user_prompt,
      retrieved_content: fixture.input.retrieved_content
    })
  );

  const modelInputPayload: SandboxModelContentPayload = {
    model_ref: modelRef,
    content_ref: replayEvidenceRef("model-input", case_id),
    content_sha256: modelInputDigest,
    summary: `[Deterministic replay input for ${case_id}]`
  };

  const modelInputEvent: SandboxEventEnvelope<"model_input", SandboxModelContentPayload> = {
    event_id: buildEventId("model-input", case_id),
    session_id: sessionId,
    sequence: _seqCounter,
    event_type: "model_input",
    occurred_at: buildTimestamp(),
    source: "model",
    scenario_id: fixture.scenario_id,
    case_id: fixture.case_id,
    evidence_refs: [replayEvidenceRef("model-input", case_id)],
    payload: modelInputPayload
  };
  events.push(modelInputEvent);

  // -- 3. Model output ---------------------------------------------------

  const modelOutputDigest = sha256(fixture.expected_outcome.model_behavior);

  const modelOutputPayload: SandboxModelContentPayload = {
    model_ref: modelRef,
    content_ref: replayEvidenceRef("model-output", case_id),
    content_sha256: modelOutputDigest,
    summary: `[Deterministic replay output for ${case_id}]`
  };

  const modelOutputEvent: SandboxEventEnvelope<"model_output", SandboxModelContentPayload> = {
    event_id: buildEventId("model-output", case_id),
    session_id: sessionId,
    sequence: _seqCounter,
    event_type: "model_output",
    occurred_at: buildTimestamp(),
    source: "model",
    scenario_id: fixture.scenario_id,
    case_id: fixture.case_id,
    evidence_refs: [replayEvidenceRef("model-output", case_id)],
    payload: modelOutputPayload
  };
  events.push(modelOutputEvent);

  // -- 4. Tool request (only when proposed call exists) ------------------

  let toolRequestEvent:
    | SandboxEventEnvelope<"tool_request", SandboxToolRequestPayload>
    | undefined;

  if (fixture.input.proposed_tool_call !== null) {
    const ptc = fixture.input.proposed_tool_call;
    const argsDigest = sha256(JSON.stringify(ptc.arguments));

    const toolRequestPayload: SandboxToolRequestPayload = {
      call_id: replayId("call", case_id),
      tool_name: ptc.tool_name,
      target_ref: replayEvidenceRef("tool-target", case_id),
      arguments_ref: replayEvidenceRef("tool-args", case_id)
    };

    toolRequestEvent = {
      event_id: buildEventId("tool-request", case_id),
      session_id: sessionId,
      sequence: _seqCounter,
      event_type: "tool_request",
      occurred_at: buildTimestamp(),
      source: "tool",
      scenario_id: fixture.scenario_id,
      case_id: fixture.case_id,
      evidence_refs: [replayEvidenceRef("tool-request", case_id)],
      payload: toolRequestPayload
    };
    events.push(toolRequestEvent);
  }

  // -- 5. Policy decision ------------------------------------------------

  const policyId = "policy://track1/fixture-oracle";
  const action = fixture.expected_outcome.policy_action;
  const reasonCode = `fixture_expected_${action}`;
  const reason = `Fixture expected policy action: ${action}`;

  const policyDecisionPayload: SandboxPolicyDecision = {
    decision_id: replayId("decision", case_id),
    subject_event_id: toolRequestEvent?.event_id ?? modelOutputEvent.event_id,
    policy_id: policyId,
    action,
    reason_code: reasonCode,
    reason,
    evidence_refs: [replayEvidenceRef("policy-decision", case_id)],
    decided_at: buildTimestamp()
  };

  const policyDecisionEvent: SandboxEventEnvelope<
    "policy_decision",
    SandboxPolicyDecision
  > = {
    event_id: buildEventId("policy-decision", case_id),
    session_id: sessionId,
    sequence: _seqCounter,
    event_type: "policy_decision",
    occurred_at: buildTimestamp(),
    source: "policy",
    scenario_id: fixture.scenario_id,
    case_id: fixture.case_id,
    evidence_refs: [replayEvidenceRef("policy-decision", case_id)],
    payload: policyDecisionPayload
  };
  events.push(policyDecisionEvent);

  // -- 6. Tool result (SC-002 only, when proposed call exists) -----------

  if (
    scenario.scenario_id === "T1-SC-002" &&
    fixture.input.proposed_tool_call !== null
  ) {
    const ptc = fixture.input.proposed_tool_call;

    const toolResultPayload: SandboxToolResultPayload = {
      call_id: replayId("call", case_id),
      tool_name: ptc.tool_name,
      status: "rejected",
      result_ref: replayEvidenceRef("tool-result", case_id),
      state_change: "none"
    };

    const toolResultEvent: SandboxEventEnvelope<
      "tool_result",
      SandboxToolResultPayload
    > = {
      event_id: buildEventId("tool-result", case_id),
      session_id: sessionId,
      sequence: _seqCounter,
      event_type: "tool_result",
      occurred_at: buildTimestamp(),
      source: "tool",
      scenario_id: fixture.scenario_id,
      case_id: fixture.case_id,
      evidence_refs: [replayEvidenceRef("tool-result", case_id)],
      payload: toolResultPayload
    };
    events.push(toolResultEvent);
  }

  // -- Materialize alerts and blocked records ----------------------------

  const mapping = ACTION_MAPPING[action];

  const alerts: SandboxAlert[] = [];
  if (mapping.alerts > 0) {
    const alert: SandboxAlert = {
      alert_id: replayId("alert", case_id),
      subject_event_id: policyDecisionEvent.event_id,
      decision_id: policyDecisionPayload.decision_id,
      risk_level: mapping.risk_level,
      category: "fixture_expected",
      title: `Expected alert for ${case_id}`,
      reason,
      evidence_refs: [replayEvidenceRef("alert", case_id)],
      occurred_at: replayTimestamp(_seqCounter + alerts.length)
    };
    alerts.push(alert);
  }

  const blockedRecords: SandboxBlockedRecord[] = [];
  if (mapping.blocked_records > 0) {
    const blockedRecord: SandboxBlockedRecord = {
      blocked_record_id: replayId("blocked-record", case_id),
      subject_event_id: toolRequestEvent?.event_id ?? modelOutputEvent.event_id,
      decision_id: policyDecisionPayload.decision_id,
      reason,
      evidence_refs: [replayEvidenceRef("blocked-record", case_id)],
      occurred_at: replayTimestamp(_seqCounter + blockedRecords.length)
    };
    if (toolRequestEvent) {
      blockedRecord.resource_ref = replayEvidenceRef("blocked-resource", case_id);
    }
    blockedRecords.push(blockedRecord);
  }

  // -- Evidence checks ---------------------------------------------------

  const firstMemoryEvent = events.find(
    (e) => e.event_type === "memory_write"
  );

  const evidenceSources: Record<string, unknown> = {
    prompt_sample_ref: modelInputEvent,
    filter_decision: policyDecisionEvent,
    policy_decision: policyDecisionEvent,
    tool_request_ref: toolRequestEvent ?? null,
    memory_entry_ref: firstMemoryEvent ?? null,
    sandbox_alert: alerts[0] ?? null,
    blocked_record: blockedRecords[0] ?? null,
    report_evidence_ref: {
      evidence_ref: replayEvidenceRef("report-summary", case_id)
    }
  };

  const evidenceChecks: Track1ReplayEvidenceCheck[] = [];

  // Use fixture's evidence_requirements order
  for (const requirement of fixture.expected_outcome.evidence_requirements) {
    const source = evidenceSources[requirement];
    if (source && source !== null) {
      // Handle the synthetic report_evidence_ref
      if (requirement === "report_evidence_ref") {
        evidenceChecks.push({
          requirement,
          observation: "present",
          evidence_ref: replayEvidenceRef("report-summary", case_id)
        });
      } else if (
        typeof source === "object" &&
        source !== null &&
        "evidence_refs" in source
      ) {
        const eventSource = source as { evidence_refs: string[] };
        evidenceChecks.push({
          requirement,
          observation: "present",
          evidence_ref:
            eventSource.evidence_refs[0] ??
            replayEvidenceRef("event", case_id)
        });
      } else if (
        typeof source === "object" &&
        source !== null &&
        "alert_id" in source
      ) {
        const alertSource = source as SandboxAlert;
        evidenceChecks.push({
          requirement,
          observation: "present",
          evidence_ref:
            alertSource.evidence_refs[0] ??
            replayEvidenceRef("alert", case_id)
        });
      } else if (
        typeof source === "object" &&
        source !== null &&
        "blocked_record_id" in source
      ) {
        const brSource = source as SandboxBlockedRecord;
        evidenceChecks.push({
          requirement,
          observation: "present",
          evidence_ref:
            brSource.evidence_refs[0] ??
            replayEvidenceRef("blocked-record", case_id)
        });
      }
    } else {
      evidenceChecks.push({
        requirement,
        observation: "absent",
        evidence_ref: replayEvidenceRef(
          `absence/${requirement}`,
          case_id
        )
      });
    }
  }

  // -- Metadata ----------------------------------------------------------

  const replayMetadata: Track1ReplayMetadata = {
    schema_version: "track1-replay.v1",
    scenario_id: fixture.scenario_id,
    case_id: fixture.case_id,
    test_category: fixture.test_category,
    expected_policy_action: fixture.expected_outcome.policy_action,
    evidence_checks: evidenceChecks
  };

  // -- Build result ------------------------------------------------------

  const taskId = replayId("task", case_id);

  const candidate = {
    task_id: taskId,
    task_type: "sandbox_run" as const,
    engine_type: "sandbox" as const,
    status: mapping.status,
    risk_level: mapping.risk_level,
    summary: fixture.title,
    details: {
      session_id: sessionId,
      events,
      policy_decisions: [policyDecisionPayload],
      alerts,
      blocked_records: blockedRecords,
      blocked: mapping.blocked,
      event_count: events.length
    },
    created_at: replayTimestamp(0),
    updated_at: replayTimestamp(_seqCounter + blockedRecords.length),
    metadata: {
      replay: replayMetadata
    }
  };

  // -- Normalize ---------------------------------------------------------

  const normalized = normalizeBaseResult(candidate);
  if (!normalized) {
    throw new Track1ReplayError(
      "replay_result_invalid",
      `${case_id}: compiled result failed shared normalization`
    );
  }

  return normalized as BaseResult<{ __brand: "SandboxRunResultDetails" }>;
}
