import {
  normalizeTrack1CampaignEvidenceRegistration,
  normalizeTrack1CampaignFinalizeEnvelope,
  normalizeTrack1CampaignSnapshotEnvelope,
  normalizeTrack1CampaignStartEnvelope
} from "../../../../shared/contracts/campaign-ingest.ts";
import {
  isSessionId,
  isTaskId,
  normalizeTrack1CampaignSummary
} from "../../../../shared/contracts/campaign-supervision.ts";
import {
  isStrictIso8601,
  parseIso8601Instant
} from "../../../../shared/utils/guards.ts";
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignFinalizeEnvelope,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignStartEnvelope
} from "../../../../shared/types/campaign-ingest.ts";
import type {
  SandboxAlert,
  SandboxBlockedRecord,
  SandboxPolicyAction,
  SandboxPolicyDecision
} from "../../../../shared/types/sandbox.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import {
  TRACK1_CASE_IDS,
  getTrack1CaseExpectedAction,
  type Track1CampaignAttemptStatus,
  type Track1CampaignAttemptSummary,
  type Track1CampaignSummary,
  type Track1CaseId
} from "../../../../shared/types/campaign-supervision.ts";
import { DomainError } from "../../common/errors/domain-error.ts";
import type {
  CampaignRepository,
  StoredCampaignAttempt,
  StoredCampaignRecord,
  StoredCampaignSnapshotReceipt
} from "./repositories/campaign.repository.ts";
import type {
  StoredTaskRecord,
  TaskRepository
} from "../task-center/repositories/task.repository.ts";
import type { Task, RiskSummary, TaskStatus } from "../../../../shared/types/task.ts";

const ACTION_PRECEDENCE: Record<SandboxPolicyAction, number> = {
  allow: 0,
  alert: 1,
  ask: 2,
  deny: 3
};

function deriveHighestAction(
  decisions: SandboxPolicyDecision[] | undefined
): SandboxPolicyAction {
  if (!decisions || decisions.length === 0) return "allow";
  let highest: SandboxPolicyAction = "allow";
  for (const decision of decisions) {
    if (ACTION_PRECEDENCE[decision.action] > ACTION_PRECEDENCE[highest]) {
      highest = decision.action;
    }
  }
  return highest;
}

function isTerminalResultStatus(status: string): boolean {
  // R1 (Phase 2 rework finding 4): sandbox monitor produces status="failed"
  // and status="partial_success" as legitimate terminal states. Only
  // "pending" and "running" are non-terminal. Treating "failed" as non-
  // terminal prevented failed attempts from entering the retry flow and
  // made finalize impossible when the last snapshot was a failure.
  return (
    status === "finished" ||
    status === "failed" ||
    status === "blocked" ||
    status === "partial_success"
  );
}

function isSuccessfulTerminalStatus(status: string): boolean {
  // R10 (Phase 2 rework review P1 #1): only finished/blocked are "successful"
  // terminal states eligible for action comparison. failed/partial_success
  // represent provider/execution failures and must always produce a failed
  // attempt regardless of any matching policy action — otherwise a crashed
  // provider could forge a "passed" attempt and skip retry.
  return status === "finished" || status === "blocked";
}

function determineAttemptStatus(
  result: BaseResult<SandboxRunResultDetails>,
  expectedAction: SandboxPolicyAction
): Track1CampaignAttemptStatus {
  if (!isTerminalResultStatus(result.status)) return "running";
  // R10: failed/partial_success are terminal but never eligible for action
  // comparison — they must always be "failed".
  if (!isSuccessfulTerminalStatus(result.status)) return "failed";
  const actualAction = deriveHighestAction(result.details.policy_decisions);
  return actualAction === expectedAction ? "passed" : "failed";
}

function cloneStoredCampaignRecord(record: StoredCampaignRecord): StoredCampaignRecord {
  return structuredClone(record);
}

// R3 (Phase 2 rework finding 2): close the snapshot content boundary.
// Validate canonical task_id/session_id formats, time ordering, and project
// the result to a closed shape that strips content fields (summary, metadata,
// target) not needed for campaign projection. This prevents arbitrary content
// like metadata.raw_prompt="SECRET_SENTINEL" from being persisted.
// R22 (Phase 2 rework review 2 P1 #5): accept envelope context (scenario_id,
// case_id) and validate that any event carrying scenario_id or case_id
// agrees with the envelope. Without this, a client could set the envelope
// to T1-SC-001-C001 while injecting events with T1-SC-002-C001.
function validateAndProjectSnapshotResult(
  result: BaseResult<SandboxRunResultDetails>,
  envelopeContext: { scenario_id: string; case_id: string }
): BaseResult<SandboxRunResultDetails> {
  if (!isTaskId(result.task_id)) {
    throw new DomainError(
      "Snapshot result task_id must be canonical (task:<32-hex>)",
      "CAMPAIGN_SNAPSHOT_INVALID",
      400
    );
  }

  const sessionId = result.details.session_id;
  if (!sessionId || !isSessionId(sessionId)) {
    throw new DomainError(
      "Snapshot result session_id must be canonical (session:<32-hex>)",
      "CAMPAIGN_SNAPSHOT_INVALID",
      400
    );
  }

  // R12 (Phase 2 rework review P1 #3): validate both timestamps as strict
  // ISO-8601 with real calendar dates, then compare PARSED instants (not
  // lexicographic strings). The previous string comparison accepted
  // arbitrary strings like "aaa"/"bbb" and silently produced passed
  // attempts from malformed timestamps.
  if (!isStrictIso8601(result.created_at)) {
    throw new DomainError(
      "Snapshot result created_at must be a strict ISO-8601 timestamp",
      "CAMPAIGN_SNAPSHOT_INVALID",
      400
    );
  }
  if (!isStrictIso8601(result.updated_at)) {
    throw new DomainError(
      "Snapshot result updated_at must be a strict ISO-8601 timestamp",
      "CAMPAIGN_SNAPSHOT_INVALID",
      400
    );
  }
  const createdInstant = parseIso8601Instant(result.created_at);
  const updatedInstant = parseIso8601Instant(result.updated_at);
  if (createdInstant === null || updatedInstant === null) {
    throw new DomainError(
      "Snapshot result timestamps must be parseable ISO-8601 instants",
      "CAMPAIGN_SNAPSHOT_INVALID",
      400
    );
  }
  if (createdInstant > updatedInstant) {
    throw new DomainError(
      "Snapshot result created_at must not exceed updated_at",
      "CAMPAIGN_SNAPSHOT_INVALID",
      400
    );
  }

  // R22 (Phase 2 rework review 2 P1 #5): envelope-to-event correlation.
  // Any event that carries scenario_id or case_id must agree with the
  // envelope. Without this, a client could set the envelope to
  // T1-SC-001-C001 while injecting events with T1-SC-002-C001, and the
  // mismatch would be accepted as "passed".
  if (result.details.events) {
    for (const event of result.details.events) {
      if (
        event.scenario_id !== undefined &&
        event.scenario_id !== envelopeContext.scenario_id
      ) {
        throw new DomainError(
          `Event scenario_id "${event.scenario_id}" does not match envelope scenario_id "${envelopeContext.scenario_id}"`,
          "CAMPAIGN_SNAPSHOT_INVALID",
          400
        );
      }
      if (
        event.case_id !== undefined &&
        event.case_id !== envelopeContext.case_id
      ) {
        throw new DomainError(
          `Event case_id "${event.case_id}" does not match envelope case_id "${envelopeContext.case_id}"`,
          "CAMPAIGN_SNAPSHOT_INVALID",
          400
        );
      }
    }
  }

  // R21 (Phase 2 rework review 2 P1 #4): project nested narrative content.
  // Strip free-text fields (reason, reason_code, title, category) from
  // policy_decisions, alerts, and blocked_records by replacing them with
  // the fixed token "projected". This prevents a client from persisting
  // arbitrary text (e.g. prompt leaks, provider error messages) in these
  // fields while keeping the result re-normalizable (the shared normalizers
  // require these fields to be non-empty strings). The structural fields
  // (IDs, action, risk_level, timestamps, evidence_refs) are preserved for
  // supervision contract validation and campaign projection.
  const PROJECTED_NARRATIVE = "projected";
  function projectPolicyDecision(d: SandboxPolicyDecision): SandboxPolicyDecision {
    return {
      decision_id: d.decision_id,
      subject_event_id: d.subject_event_id,
      policy_id: d.policy_id,
      action: d.action,
      reason_code: PROJECTED_NARRATIVE,
      reason: PROJECTED_NARRATIVE,
      evidence_refs: d.evidence_refs,
      decided_at: d.decided_at
    };
  }

  function projectAlert(a: SandboxAlert): SandboxAlert {
    return {
      alert_id: a.alert_id,
      subject_event_id: a.subject_event_id,
      decision_id: a.decision_id,
      risk_level: a.risk_level,
      category: PROJECTED_NARRATIVE,
      title: PROJECTED_NARRATIVE,
      reason: PROJECTED_NARRATIVE,
      evidence_refs: a.evidence_refs,
      occurred_at: a.occurred_at
    };
  }

  function projectBlockedRecord(r: SandboxBlockedRecord): SandboxBlockedRecord {
    return {
      blocked_record_id: r.blocked_record_id,
      subject_event_id: r.subject_event_id,
      decision_id: r.decision_id,
      resource_ref: r.resource_ref,
      reason: PROJECTED_NARRATIVE,
      evidence_refs: r.evidence_refs,
      occurred_at: r.occurred_at
    };
  }

  // Project to closed shape: strip summary (set to empty), metadata,
  // result_id, started_at, finished_at, and details.target. Keep structural
  // fields needed for campaign projection.
  const projectedDetails: SandboxRunResultDetails = {
    session_id: sessionId
  };
  if (result.details.events !== undefined) {
    // R21: project policy_decision event payloads to match the projected
    // policy_decisions (supervision contract requires field-equality).
    projectedDetails.events = result.details.events.map((event) => {
      if (event.event_type === "policy_decision") {
        return {
          ...event,
          payload: projectPolicyDecision(event.payload as SandboxPolicyDecision)
        };
      }
      return event;
    });
  }
  if (result.details.policy_decisions !== undefined) {
    projectedDetails.policy_decisions = result.details.policy_decisions.map(projectPolicyDecision);
  }
  if (result.details.alerts !== undefined) {
    projectedDetails.alerts = result.details.alerts.map(projectAlert);
  }
  if (result.details.blocked_records !== undefined) {
    projectedDetails.blocked_records = result.details.blocked_records.map(projectBlockedRecord);
  }
  if (result.details.blocked !== undefined) {
    projectedDetails.blocked = result.details.blocked;
  }
  if (result.details.event_count !== undefined) {
    projectedDetails.event_count = result.details.event_count;
  }

  return {
    task_id: result.task_id,
    task_type: result.task_type,
    engine_type: result.engine_type,
    status: result.status,
    risk_level: result.risk_level,
    summary: "",
    details: projectedDetails,
    created_at: result.created_at,
    updated_at: result.updated_at
  };
}

// R7 (Phase 2 rework finding 3): build a StoredTaskRecord that the public
// supervision session inspector can query. The record must satisfy the
// consistency rules in supervision-projector.ts:
//   - task.task_type === "sandbox_run"
//   - task.engine_type === "sandbox"
//   - task.task_id === result.task_id (and task_type/engine_type match)
//   - task.status === result.status
//   - details.session_id is non-empty
//   - for terminal status (finished/blocked): all 4 arrays present
//   - for non-terminal: all 4 arrays present OR all 4 absent
// The projectedResult from validateAndProjectSnapshotResult already keeps
// events/policy_decisions/alerts/blocked_records if they were present in
// the input, so the all-4-present branch is satisfied.
function buildSupervisionTaskRecord(
  attempt: StoredCampaignAttempt
): StoredTaskRecord {
  const result = attempt.result;
  const taskId = result.task_id;
  const taskStatus = result.status as TaskStatus;
  const now = result.updated_at;

  const task: Task = {
    task_id: taskId,
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: taskStatus,
    title: `Track1 Campaign ${attempt.scenario_id}/${attempt.case_id}`,
    target: {
      target_type: "campaign_case",
      target_value: `${attempt.scenario_id}/${attempt.case_id}`
    },
    created_at: result.created_at,
    updated_at: now
  };

  const riskSummary: RiskSummary = {
    task_id: taskId,
    task_type: "sandbox_run",
    status: taskStatus,
    risk_level: result.risk_level,
    summary: "",
    total_findings: 0,
    info_count: 0,
    low_count: 0,
    medium_count: 0,
    high_count: 0,
    critical_count: 0,
    updated_at: now
  };

  return { task, result, riskSummary };
}

// R11 (Phase 2 rework review P1 #2): build a closed snapshot receipt that
// carries ONLY structural IDs, hashes, and timestamps. The raw normalized
// snapshot (including result.summary, result.metadata, result.details.target,
// events, policy_decisions, etc.) must NOT be persisted — otherwise
// injected content like metadata.raw_prompt="SECRET_SENTINEL" would leak
// into storage. The full projected result lives on StoredCampaignAttempt.
function buildSnapshotReceipt(
  normalized: Track1CampaignSnapshotEnvelope,
  projectedResult: BaseResult<SandboxRunResultDetails>
): StoredCampaignSnapshotReceipt {
  return {
    schema_version: normalized.schema_version,
    campaign_id: normalized.campaign_id,
    campaign_manifest_sha256: normalized.campaign_manifest_sha256,
    agent_id: normalized.agent_id,
    scenario_id: normalized.scenario_id,
    case_id: normalized.case_id,
    attempt_id: normalized.attempt_id,
    attempt_index: normalized.attempt_index,
    sequence: normalized.sequence,
    previous_snapshot_sha256: normalized.previous_snapshot_sha256,
    observed_at: normalized.observed_at,
    snapshot_sha256: normalized.snapshot_sha256,
    result_task_id: projectedResult.task_id as StoredCampaignSnapshotReceipt["result_task_id"],
    result_session_id: projectedResult.details.session_id as StoredCampaignSnapshotReceipt["result_session_id"],
    result_status: projectedResult.status
  };
}

// -- CampaignIngestService ----------------------------------------------------

export class CampaignIngestService {
  private readonly repository: CampaignRepository;
  private readonly taskRepository: TaskRepository | null;
  constructor(repository: CampaignRepository, taskRepository?: TaskRepository) {
    this.repository = repository;
    this.taskRepository = taskRepository ?? null;
  }

  // -- Start ------------------------------------------------------------------

  startCampaign(input: Track1CampaignStartEnvelope): Track1CampaignSummary {
    const normalized = normalizeTrack1CampaignStartEnvelope(input);
    if (!normalized) {
      throw new DomainError(
        "Invalid campaign start envelope",
        "CAMPAIGN_START_INVALID",
        400
      );
    }

    const campaignId = normalized.campaign_id;
    const existing = this.repository.findById(campaignId);
    if (existing) {
      throw new DomainError(
        `Campaign already exists: ${campaignId}`,
        "CAMPAIGN_ALREADY_EXISTS",
        409
      );
    }

    const record: StoredCampaignRecord = {
      campaign: {
        campaign_id: campaignId,
        start: normalized,
        status: "created",
        updated_at: normalized.started_at
      },
      snapshots: [],
      attempts: [],
      evidence: null
    };

    this.repository.create(record);
    return this.projectSummary(record);
  }

  // -- Snapshot ---------------------------------------------------------------

  ingestSnapshot(input: Track1CampaignSnapshotEnvelope): Track1CampaignAttemptSummary {
    const normalized = normalizeTrack1CampaignSnapshotEnvelope(input);
    if (!normalized) {
      throw new DomainError(
        "Invalid campaign snapshot envelope",
        "CAMPAIGN_SNAPSHOT_INVALID",
        400
      );
    }

    const record = this.repository.findById(normalized.campaign_id);
    if (!record) {
      throw new DomainError(
        `Campaign not found: ${normalized.campaign_id}`,
        "CAMPAIGN_NOT_FOUND",
        404
      );
    }

    if (normalized.campaign_manifest_sha256 !== record.campaign.start.campaign_manifest_sha256) {
      throw new DomainError(
        "Snapshot manifest hash does not match campaign start",
        "CAMPAIGN_MANIFEST_MISMATCH",
        409
      );
    }

    if (record.campaign.status === "completed" || record.campaign.status === "failed") {
      throw new DomainError(
        "Campaign is already finalized",
        "CAMPAIGN_ALREADY_FINALIZED",
        409
      );
    }

    const existingAttempt = record.attempts.find(
      (a) => a.attempt_id === normalized.attempt_id
    );

    const attemptSnapshots = record.snapshots.filter(
      (s) => s.attempt_id === normalized.attempt_id
    );

    // 1. Exact duplicate (same snapshot_sha256) → idempotent return.
    const exactDuplicate = attemptSnapshots.find(
      (s) => s.snapshot_sha256 === normalized.snapshot_sha256
    );
    if (exactDuplicate && existingAttempt) {
      return this.projectAttemptSummary(existingAttempt);
    }

    // 2. Same-sequence conflict (same sequence, different hash) → reject.
    const sameSequence = attemptSnapshots.find(
      (s) => s.sequence === normalized.sequence
    );
    if (sameSequence) {
      throw new DomainError(
        "Snapshot conflict: sequence already exists with different content",
        "CAMPAIGN_SNAPSHOT_CONFLICT",
        409
      );
    }

    // 3. Validate sequence continuity (chain integrity before mutation guard).
    const lastSnapshot = attemptSnapshots.length > 0
      ? attemptSnapshots.reduce((max, s) => (s.sequence > max.sequence ? s : max))
      : null;

    if (lastSnapshot) {
      if (normalized.sequence !== lastSnapshot.sequence + 1) {
        throw new DomainError(
          "Snapshot sequence gap detected",
          "CAMPAIGN_SEQUENCE_INVALID",
          409
        );
      }
      if (normalized.previous_snapshot_sha256 !== lastSnapshot.snapshot_sha256) {
        throw new DomainError(
          "Snapshot hash chain broken",
          "CAMPAIGN_HASH_CHAIN_BROKEN",
          409
        );
      }
    } else {
      if (normalized.sequence !== 1) {
        throw new DomainError(
          "First snapshot must have sequence 1",
          "CAMPAIGN_SEQUENCE_INVALID",
          409
        );
      }
      if (normalized.previous_snapshot_sha256 !== null) {
        throw new DomainError(
          "Genesis snapshot must have null previous hash",
          "CAMPAIGN_HASH_CHAIN_BROKEN",
          409
        );
      }
    }

    // 4. Terminal attempt cannot accept new snapshots.
    if (existingAttempt && (existingAttempt.status === "passed" || existingAttempt.status === "failed")) {
      throw new DomainError(
        "Cannot mutate a terminal attempt",
        "CAMPAIGN_ATTEMPT_TERMINAL",
        409
      );
    }

    // 5. Validate second-attempt precondition.
    if (!existingAttempt && normalized.attempt_index === 2) {
      const firstAttempt = record.attempts.find(
        (a) =>
          a.case_id === normalized.case_id &&
          a.attempt_index === 1
      );
      if (!firstAttempt || firstAttempt.status !== "failed") {
        throw new DomainError(
          "Second attempt requires a failed first attempt",
          "CAMPAIGN_SECOND_ATTEMPT_NOT_ALLOWED",
          409
        );
      }
    }

    // 6. Derive replacement record without mutating current state.
    const expectedAction = getTrack1CaseExpectedAction(
      normalized.case_id as Track1CaseId
    );
    const actualAction = deriveHighestAction(
      normalized.result.details.policy_decisions
    );
    const attemptStatus = determineAttemptStatus(normalized.result, expectedAction);

    // R3: validate canonical IDs, time ordering, and project to closed shape
    // before storing. This strips summary, metadata, target, and other
    // content fields that should not be persisted.
    // R22: pass envelope context so event scenario_id/case_id can be
    // validated against the outer envelope.
    const projectedResult = validateAndProjectSnapshotResult(normalized.result, {
      scenario_id: normalized.scenario_id,
      case_id: normalized.case_id
    });
    const sessionId = projectedResult.details.session_id!;

    // R13 (Phase 2 rework review P1 #4): enforce identity continuity — the
    // same attempt_id must keep the same task_id and session_id across all
    // accepted snapshots. Without this, a second snapshot could silently
    // swap the task/session identity, orphaning the previously mirrored
    // task record and breaking the supervision session lookup.
    if (existingAttempt) {
      if (projectedResult.task_id !== existingAttempt.task_id) {
        throw new DomainError(
          "Snapshot task_id does not match the existing attempt's task_id",
          "CAMPAIGN_SNAPSHOT_IDENTITY_DRIFT",
          409
        );
      }
      if (sessionId !== existingAttempt.session_id) {
        throw new DomainError(
          "Snapshot session_id does not match the existing attempt's session_id",
          "CAMPAIGN_SNAPSHOT_IDENTITY_DRIFT",
          409
        );
      }

      // R22+R26 (Phase 2 rework review 3 P1 #2): event-prefix monotonicity.
      // The new snapshot's events must BEGIN WITH deep-equal projected
      // copies of every previous event, in the SAME ORDER. Set membership
      // by event_id is insufficient — a client could keep the same event_id
      // but rewrite target_ref/payload, silently rewriting history. A
      // missing events collection when the previous snapshot had events
      // must also be rejected (the old check only ran when both were
      // present, so omitting new events bypassed it).
      const previousEvents = existingAttempt.result.details.events;
      const newEvents = projectedResult.details.events;
      if (previousEvents) {
        if (!newEvents) {
          throw new DomainError(
            "Snapshot omits events collection but the previous snapshot had events",
            "CAMPAIGN_SNAPSHOT_INVALID",
            400
          );
        }
        if (newEvents.length < previousEvents.length) {
          throw new DomainError(
            "Snapshot events collection is shorter than the previous snapshot's events",
            "CAMPAIGN_SNAPSHOT_INVALID",
            400
          );
        }
        for (let i = 0; i < previousEvents.length; i++) {
          const prev = previousEvents[i];
          const next = newEvents[i];
          if (prev.event_id !== next.event_id) {
            throw new DomainError(
              `Event at position ${i} changed from "${prev.event_id}" to "${next.event_id}"`,
              "CAMPAIGN_SNAPSHOT_INVALID",
              400
            );
          }
          // Deep-equal comparison on projected events. Both sides have
          // already been through validateAndProjectSnapshotResult, so
          // narrative fields are already normalized to "projected". Any
          // remaining difference (e.g. target_ref, arguments_ref) means
          // the client rewrote structural content.
          const prevJson = JSON.stringify(prev);
          const nextJson = JSON.stringify(next);
          if (prevJson !== nextJson) {
            throw new DomainError(
              `Event "${prev.event_id}" payload changed from previous snapshot`,
              "CAMPAIGN_SNAPSHOT_INVALID",
              400
            );
          }
        }
      }
    }

    // R13: reject a NEW attempt whose task_id matches an existing DIFFERENT
    // attempt's task_id. The TaskRepository is keyed by task_id, so a
    // duplicate would silently overwrite the earlier attempt's task record
    // while the campaign retains both attempts — an unrecoverable split.
    if (!existingAttempt) {
      const conflictingAttempt = record.attempts.find(
        (a) => a.task_id === projectedResult.task_id
      );
      if (conflictingAttempt) {
        throw new DomainError(
          `Snapshot task_id already used by attempt ${conflictingAttempt.attempt_id}`,
          "CAMPAIGN_TASK_ID_DUPLICATE",
          409
        );
      }
    }

    // R20 (Phase 2 rework review 2 P1 #3): global task_id uniqueness.
    // The TaskRepository is a global store keyed by task_id. A task_id
    // that already exists in the TaskRepository (from another campaign or
    // a leftover from a previous run) would be silently overwritten by
    // the save() call below. Reject it before that happens.
    if (!existingAttempt && this.taskRepository) {
      const globalTask = this.taskRepository.findById(projectedResult.task_id);
      if (globalTask) {
        throw new DomainError(
          `Snapshot task_id already exists in the global TaskRepository: ${projectedResult.task_id}`,
          "CAMPAIGN_TASK_ID_GLOBAL_CONFLICT",
          409
        );
      }
    }

    // R20: session_id uniqueness within the campaign. Each attempt must
    // have a distinct session_id; reusing a session_id across attempts
    // causes the supervision session lookup to return
    // SUPERVISION_SESSION_AMBIGUOUS.
    if (!existingAttempt) {
      const conflictingSession = record.attempts.find(
        (a) => a.session_id === sessionId
      );
      if (conflictingSession) {
        throw new DomainError(
          `Snapshot session_id already used by attempt ${conflictingSession.attempt_id}`,
          "CAMPAIGN_SESSION_ID_DUPLICATE",
          409
        );
      }
    }

    // R27 (Phase 2 rework review 3 P1 #3): GLOBAL session_id uniqueness.
    // The supervision API groups every TaskRepository record by session_id,
    // so per-campaign uniqueness is insufficient. A session_id already
    // owned by a task from ANOTHER campaign would cause
    // SUPERVISION_SESSION_AMBIGUOUS on the public detail endpoint.
    if (!existingAttempt && this.taskRepository) {
      const globalSessionTask = this.taskRepository.findBySessionId(sessionId);
      if (globalSessionTask && globalSessionTask.task.task_id !== projectedResult.task_id) {
        throw new DomainError(
          `Snapshot session_id already exists in the global TaskRepository: ${sessionId}`,
          "CAMPAIGN_SESSION_ID_GLOBAL_CONFLICT",
          409
        );
      }
    }

    const newAttempt: StoredCampaignAttempt = {
      campaign_id: normalized.campaign_id,
      agent_id: normalized.agent_id,
      scenario_id: normalized.scenario_id,
      case_id: normalized.case_id,
      attempt_id: normalized.attempt_id,
      attempt_index: normalized.attempt_index,
      session_id: sessionId as StoredCampaignAttempt["session_id"],
      task_id: projectedResult.task_id as StoredCampaignAttempt["task_id"],
      status: attemptStatus,
      snapshot_head: normalized.snapshot_sha256,
      result: projectedResult
    };

    const updatedAttempts = existingAttempt
      ? record.attempts.map((a) =>
          a.attempt_id === normalized.attempt_id ? newAttempt : a
        )
      : [...record.attempts, newAttempt];

    // R11: persist a closed snapshot receipt, not the raw normalized snapshot.
    const receipt = buildSnapshotReceipt(normalized, projectedResult);
    const updatedSnapshots = [...record.snapshots, receipt];
    const updatedStatus = record.campaign.status === "created" ? "running" : record.campaign.status;
    const updatedAt = normalized.observed_at > record.campaign.updated_at
      ? normalized.observed_at
      : record.campaign.updated_at;

    const replacement: StoredCampaignRecord = {
      campaign: {
        ...record.campaign,
        status: updatedStatus,
        updated_at: updatedAt
      },
      snapshots: updatedSnapshots,
      attempts: updatedAttempts,
      evidence: record.evidence
    };

    // R19 (Phase 2 rework review 2 P1 #2): atomic dual-repository write.
    // Save the task FIRST, then save the campaign. If the campaign save
    // fails, roll back the task so there is no orphaned task record
    // without a corresponding campaign attempt.
    // R25 (Phase 2 rework review 3 P1 #1): the rollback must distinguish
    // the two directions:
    //   - CREATE (no prior task) → delete the new task so it is not orphaned
    //   - UPDATE (prior task existed) → RESTORE the prior task record so
    //     the previously committed mirror is not destroyed. The previous
    //     code unconditionally called delete(), which lost the prior task
    //     state when a running→terminal update failed.
    // Capture the prior task BEFORE overwriting it so it can be restored.
    const priorTaskRecord = this.taskRepository
      ? (existingAttempt ? this.taskRepository.findById(newAttempt.task_id) : null)
      : null;

    if (this.taskRepository) {
      const taskRecord = buildSupervisionTaskRecord(newAttempt);
      this.taskRepository.save(taskRecord);
    }

    try {
      this.repository.save(replacement);
    } catch (saveError) {
      if (this.taskRepository) {
        if (priorTaskRecord) {
          // R25: update path — restore the prior task record that was
          // overwritten by the save() above.
          this.taskRepository.save(priorTaskRecord);
        } else {
          // R19: create path — delete the new orphaned task record.
          this.taskRepository.delete(newAttempt.task_id);
        }
      }
      throw saveError;
    }

    // 8. Return projected defensive copy.
    return this.projectAttemptSummary(newAttempt);
  }

  // -- Finalize ---------------------------------------------------------------

  finalizeCampaign(input: Track1CampaignFinalizeEnvelope): Track1CampaignSummary {
    const normalized = normalizeTrack1CampaignFinalizeEnvelope(input);
    if (!normalized) {
      throw new DomainError(
        "Invalid campaign finalize envelope",
        "CAMPAIGN_FINALIZE_INVALID",
        400
      );
    }

    const record = this.repository.findById(normalized.campaign_id);
    if (!record) {
      throw new DomainError(
        `Campaign not found: ${normalized.campaign_id}`,
        "CAMPAIGN_NOT_FOUND",
        404
      );
    }

    if (record.campaign.status === "completed" || record.campaign.status === "failed") {
      throw new DomainError(
        "Campaign is already finalized",
        "CAMPAIGN_ALREADY_FINALIZED",
        409
      );
    }

    // Count cases with terminal attempts.
    const caseAttempts = new Map<Track1CaseId, StoredCampaignAttempt[]>();
    for (const caseId of TRACK1_CASE_IDS) {
      caseAttempts.set(caseId as Track1CaseId, []);
    }
    for (const attempt of record.attempts) {
      const list = caseAttempts.get(attempt.case_id as Track1CaseId);
      if (list) list.push(attempt);
    }

    let terminalCaseCount = 0;
    for (const [, attempts] of caseAttempts) {
      if (attempts.length === 0) continue;
      const latest = attempts.reduce((max, a) =>
        a.attempt_index > max.attempt_index ? a : max
      );
      if (latest.status === "passed" || latest.status === "failed") {
        terminalCaseCount++;
      }
    }

    if (terminalCaseCount < TRACK1_CASE_IDS.length) {
      throw new DomainError(
        `Campaign incomplete: ${terminalCaseCount}/${TRACK1_CASE_IDS.length} cases terminal`,
        "CAMPAIGN_INCOMPLETE",
        409
      );
    }

    // For "completed" status, all cases must have their latest attempt "passed".
    if (normalized.requested_status === "completed") {
      for (const [, attempts] of caseAttempts) {
        const latest = attempts.reduce((max, a) =>
          a.attempt_index > max.attempt_index ? a : max
        );
        if (latest.status !== "passed") {
          throw new DomainError(
            "Derived action mismatch: a case has a failed final attempt",
            "CAMPAIGN_DERIVED_ACTION_MISMATCH",
            409
          );
        }
      }
    }

    const updatedAt = normalized.completed_at > record.campaign.updated_at
      ? normalized.completed_at
      : record.campaign.updated_at;

    const replacement: StoredCampaignRecord = {
      ...record,
      campaign: {
        ...record.campaign,
        status: normalized.requested_status,
        updated_at: updatedAt,
        completed_at: normalized.completed_at
      }
    };

    this.repository.save(replacement);
    return this.projectSummary(replacement);
  }

  // -- Evidence ---------------------------------------------------------------

  registerEvidence(input: Track1CampaignEvidenceRegistration): Track1CampaignSummary {
    const normalized = normalizeTrack1CampaignEvidenceRegistration(input);
    if (!normalized) {
      throw new DomainError(
        "Invalid evidence registration envelope",
        "CAMPAIGN_EVIDENCE_INVALID",
        400
      );
    }

    const record = this.repository.findById(normalized.campaign_id);
    if (!record) {
      throw new DomainError(
        `Campaign not found: ${normalized.campaign_id}`,
        "CAMPAIGN_NOT_FOUND",
        404
      );
    }

    if (record.campaign.status !== "completed") {
      throw new DomainError(
        "Evidence can only be registered after campaign completion",
        "CAMPAIGN_NOT_COMPLETED",
        409
      );
    }

    if (record.evidence !== null) {
      throw new DomainError(
        "Evidence already registered for this campaign",
        "CAMPAIGN_EVIDENCE_ALREADY_REGISTERED",
        409
      );
    }

    const updatedAt = normalized.registered_at > record.campaign.updated_at
      ? normalized.registered_at
      : record.campaign.updated_at;

    const replacement: StoredCampaignRecord = {
      ...record,
      campaign: {
        ...record.campaign,
        updated_at: updatedAt
      },
      evidence: normalized
    };

    this.repository.save(replacement);
    return this.projectSummary(replacement);
  }

  // -- Query ------------------------------------------------------------------

  getStoredCampaign(campaignId: string): StoredCampaignRecord | null {
    const record = this.repository.findById(campaignId);
    if (!record) return null;
    return cloneStoredCampaignRecord(record);
  }

  // -- Projection helpers -----------------------------------------------------

  private projectSummary(record: StoredCampaignRecord): Track1CampaignSummary {
    const caseStatuses = this.deriveCaseStatuses(record.attempts);
    const passedCaseCount = caseStatuses.filter((s) => s === "passed").length;
    const failedCaseCount = caseStatuses.filter((s) => s === "failed").length;
    const retryCount = record.attempts.filter((a) => a.attempt_index === 2).length;
    const alertCount = record.attempts.reduce(
      (sum, a) => sum + (a.result.details.alerts?.length ?? 0),
      0
    );
    const blockedCount = record.attempts.filter(
      (a) => (a.result.details.blocked_records?.length ?? 0) > 0
    ).length;
    const askCount = record.attempts.filter((a) => {
      const action = deriveHighestAction(a.result.details.policy_decisions);
      return action === "ask";
    }).length;

    const summary: Record<string, unknown> = {
      schema_version: "track1-campaign-read.v1",
      campaign_id: record.campaign.campaign_id,
      status: record.campaign.status,
      started_at: record.campaign.start.started_at,
      updated_at: record.campaign.updated_at,
      agent_count: 3,
      case_count: 9,
      passed_case_count: passedCaseCount,
      failed_case_count: failedCaseCount,
      retry_count: retryCount,
      alert_count: alertCount,
      blocked_count: blockedCount,
      ask_count: askCount,
      evidence_available: record.evidence !== null
    };

    if (record.campaign.status === "completed" && record.campaign.completed_at) {
      summary.completed_at = record.campaign.completed_at;
    }

    const normalized = normalizeTrack1CampaignSummary(summary);
    if (!normalized) {
      throw new DomainError(
        "Internal error: projected summary failed normalization",
        "CAMPAIGN_PROJECTION_INVALID",
        500
      );
    }
    return normalized;
  }

  private projectAttemptSummary(
    attempt: StoredCampaignAttempt
  ): Track1CampaignAttemptSummary {
    const actualAction = deriveHighestAction(
      attempt.result.details.policy_decisions
    );

    return {
      campaign_id: attempt.campaign_id,
      agent_id: attempt.agent_id,
      scenario_id: attempt.scenario_id,
      case_id: attempt.case_id,
      attempt_id: attempt.attempt_id,
      attempt_index: attempt.attempt_index,
      session_id: attempt.session_id,
      task_id: attempt.task_id,
      status: attempt.status,
      actual_action: actualAction,
      started_at: attempt.result.created_at,
      updated_at: attempt.result.updated_at
    };
  }

  private deriveCaseStatuses(
    attempts: readonly StoredCampaignAttempt[]
  ): Track1CampaignAttemptStatus[] {
    const statuses: Track1CampaignAttemptStatus[] = [];
    for (const caseId of TRACK1_CASE_IDS) {
      const caseAttempts = attempts.filter((a) => a.case_id === caseId);
      if (caseAttempts.length === 0) {
        // No attempts → case is pending, which is neither passed nor failed.
        // Use "running" as a neutral placeholder since deriveCaseStatuses is
        // only used for counting passed/failed in the summary projection.
        statuses.push("running" as Track1CampaignAttemptStatus);
      } else {
        const latest = caseAttempts.reduce((max, a) =>
          a.attempt_index > max.attempt_index ? a : max
        );
        statuses.push(latest.status);
      }
    }
    return statuses;
  }
}
