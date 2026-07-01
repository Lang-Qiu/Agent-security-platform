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
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignFinalizeEnvelope,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignStartEnvelope
} from "../../../../shared/types/campaign-ingest.ts";
import type {
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
  StoredCampaignRecord
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
function validateAndProjectSnapshotResult(
  result: BaseResult<SandboxRunResultDetails>
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

  if (result.created_at > result.updated_at) {
    throw new DomainError(
      "Snapshot result created_at must not exceed updated_at",
      "CAMPAIGN_SNAPSHOT_INVALID",
      400
    );
  }

  // Project to closed shape: strip summary (set to empty), metadata,
  // result_id, started_at, finished_at, and details.target. Keep structural
  // fields needed for campaign projection.
  const projectedDetails: SandboxRunResultDetails = {
    session_id: sessionId
  };
  if (result.details.events !== undefined) {
    projectedDetails.events = result.details.events;
  }
  if (result.details.policy_decisions !== undefined) {
    projectedDetails.policy_decisions = result.details.policy_decisions;
  }
  if (result.details.alerts !== undefined) {
    projectedDetails.alerts = result.details.alerts;
  }
  if (result.details.blocked_records !== undefined) {
    projectedDetails.blocked_records = result.details.blocked_records;
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
    const projectedResult = validateAndProjectSnapshotResult(normalized.result);
    const sessionId = projectedResult.details.session_id!;

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

    const updatedSnapshots = [...record.snapshots, normalized];
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

    // 7. Save once.
    this.repository.save(replacement);

    // R7 (Phase 2 rework finding 3): mirror the session into the
    // TaskRepository so the public session inspector can query it. Only
    // write when a NEW attempt is created (not on idempotent replay or
    // in-place update) to avoid redundant writes. The StoredTaskRecord
    // must satisfy the supervision projector's consistency rules:
    // task_type=sandbox_run, engine_type=sandbox, task/result fields
    // match, and details.session_id is set.
    if (!existingAttempt && this.taskRepository) {
      const taskRecord = buildSupervisionTaskRecord(newAttempt);
      this.taskRepository.save(taskRecord);
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
