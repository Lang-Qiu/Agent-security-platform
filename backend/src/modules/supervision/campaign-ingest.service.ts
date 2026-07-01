import {
  normalizeTrack1CampaignEvidenceRegistration,
  normalizeTrack1CampaignFinalizeEnvelope,
  normalizeTrack1CampaignSnapshotEnvelope,
  normalizeTrack1CampaignStartEnvelope
} from "../../../../shared/contracts/campaign-ingest.ts";
import { normalizeTrack1CampaignSummary } from "../../../../shared/contracts/campaign-supervision.ts";
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
  return status === "finished" || status === "blocked";
}

function determineAttemptStatus(
  result: BaseResult<SandboxRunResultDetails>,
  expectedAction: SandboxPolicyAction
): Track1CampaignAttemptStatus {
  if (!isTerminalResultStatus(result.status)) return "running";
  const actualAction = deriveHighestAction(result.details.policy_decisions);
  return actualAction === expectedAction ? "passed" : "failed";
}

function cloneStoredCampaignRecord(record: StoredCampaignRecord): StoredCampaignRecord {
  return structuredClone(record);
}

// -- CampaignIngestService ----------------------------------------------------

export class CampaignIngestService {
  private readonly repository: CampaignRepository;
  constructor(repository: CampaignRepository) {
    this.repository = repository;
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

    const sessionId = normalized.result.details.session_id;
    if (!sessionId) {
      throw new DomainError(
        "Snapshot result must contain a session_id",
        "CAMPAIGN_SNAPSHOT_INVALID",
        400
      );
    }

    const newAttempt: StoredCampaignAttempt = {
      campaign_id: normalized.campaign_id,
      agent_id: normalized.agent_id,
      scenario_id: normalized.scenario_id,
      case_id: normalized.case_id,
      attempt_id: normalized.attempt_id,
      attempt_index: normalized.attempt_index,
      session_id: sessionId as StoredCampaignAttempt["session_id"],
      task_id: normalized.result.task_id as StoredCampaignAttempt["task_id"],
      status: attemptStatus,
      snapshot_head: normalized.snapshot_sha256,
      result: normalized.result
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
