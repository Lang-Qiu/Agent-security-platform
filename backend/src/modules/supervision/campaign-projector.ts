import { DomainError } from "../../common/errors/domain-error.ts";
import type { StoredCampaignRecord, StoredCampaignAttempt } from "./repositories/campaign.repository.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS,
  getTrack1CaseExpectedAction,
  type Track1CampaignAgentDetail,
  type Track1CampaignAttemptSummary,
  type Track1CampaignCaseDetail,
  type Track1CampaignCaseStatus,
  type Track1CampaignDetail,
  type Track1CampaignEvidenceExport,
  type Track1CampaignStatus,
  type Track1CampaignSummary
} from "../../../../shared/types/campaign-supervision.ts";
import {
  isValidTrack1AgentScenarioCase,
  normalizeTrack1CampaignDetail,
  normalizeTrack1CampaignEvidenceExport,
  normalizeTrack1CampaignSummary
} from "../../../../shared/contracts/campaign-supervision.ts";
import type { SandboxPolicyAction } from "../../../../shared/types/sandbox.ts";
import type { SandboxRunResultDetails } from "../../../../shared/types/result.ts";

// P2-T6: Campaign projector.
// Recomputes all campaign counters from stored attempts/results and produces
// content-free detail views. Raw result content (events, policy_decisions,
// alerts, blocked_records, result) is never copied into the projected detail.
export interface ProjectedCampaign {
  summary: Track1CampaignSummary;
  detail: Track1CampaignDetail;
  evidence: Track1CampaignEvidenceExport | null;
}

const ACTION_PRECEDENCE: Record<SandboxPolicyAction, number> = {
  allow: 0,
  alert: 1,
  ask: 2,
  deny: 3
};

function projectionInvalid(message: string): DomainError {
  return new DomainError(message, "CAMPAIGN_PROJECTION_INVALID", 500);
}

function deriveReportSummary(
  decisions: readonly { action: SandboxPolicyAction }[] | undefined
): string {
  if (!decisions || decisions.length === 0) return "no decisions";

  const counts: Record<SandboxPolicyAction, number> = {
    allow: 0,
    alert: 0,
    ask: 0,
    deny: 0
  };

  for (const d of decisions) {
    counts[d.action]++;
  }

  // Build summary in severity order: deny, ask, alert, allow
  const parts: string[] = [];
  if (counts.deny > 0) parts.push(`${counts.deny} deny`);
  if (counts.ask > 0) parts.push(`${counts.ask} ask`);
  if (counts.alert > 0) parts.push(`${counts.alert} alert`);
  if (counts.allow > 0) parts.push(`${counts.allow} allow`);

  return parts.join(", ");
}

function deriveHighestAction(
  decisions: readonly { action: SandboxPolicyAction }[] | undefined
): SandboxPolicyAction | null {
  if (!decisions || decisions.length === 0) return null;
  let highest: SandboxPolicyAction = "allow";
  for (const d of decisions) {
    if (ACTION_PRECEDENCE[d.action] > ACTION_PRECEDENCE[highest]) {
      highest = d.action;
    }
  }
  return highest;
}

function deriveCaseStatus(
  attempts: readonly StoredCampaignAttempt[]
): Track1CampaignCaseStatus {
  if (attempts.length === 0) return "pending";
  const finalAttempt = attempts[attempts.length - 1];
  return finalAttempt.status;
}

function deriveAgentStatus(
  caseStatuses: readonly Track1CampaignCaseStatus[],
  campaignStatus: Track1CampaignStatus
): Track1CampaignStatus {
  const allPending = caseStatuses.every((s) => s === "pending");
  const allTerminal = caseStatuses.every(
    (s) => s === "passed" || s === "failed"
  );

  if (allPending) {
    return campaignStatus === "validating" ? "validating" : "created";
  }
  if (allTerminal) {
    return "completed";
  }
  return "running";
}

function maxTimestamp(timestamps: readonly string[]): string {
  return timestamps.reduce((max, ts) => (ts > max ? ts : max), timestamps[0]);
}

export function projectTrack1Campaign(
  stored: StoredCampaignRecord
): ProjectedCampaign {
  const campaignId = stored.campaign.campaign_id;
  const campaignStatus = stored.campaign.status;
  const startedAt = stored.campaign.start.started_at;
  const updatedAt = stored.campaign.updated_at;

  // Validate and group attempts by case_id.
  const attemptsByCase = new Map<string, StoredCampaignAttempt[]>();
  for (const attempt of stored.attempts) {
    if (attempt.campaign_id !== campaignId) {
      throw projectionInvalid(
        `Attempt ${attempt.attempt_id} has mismatched campaign_id`
      );
    }
    if (
      !isValidTrack1AgentScenarioCase(
        attempt.agent_id,
        attempt.scenario_id,
        attempt.case_id
      )
    ) {
      throw projectionInvalid(
        `Attempt ${attempt.attempt_id} has inconsistent agent/scenario/case mapping`
      );
    }

    const group = attemptsByCase.get(attempt.case_id) ?? [];
    group.push(attempt);
    attemptsByCase.set(attempt.case_id, group);
  }

  // Sort attempts within each case by attempt_index ascending.
  for (const group of attemptsByCase.values()) {
    group.sort((a, b) => a.attempt_index - b.attempt_index);
  }

  // Build 3 agents x 3 cases structure in fixed TRACK1 order.
  const agents: Track1CampaignAgentDetail[] = [];
  const allCaseDetails: Track1CampaignCaseDetail[] = [];

  for (let agentIdx = 0; agentIdx < TRACK1_CAMPAIGN_AGENT_IDS.length; agentIdx++) {
    const agentId = TRACK1_CAMPAIGN_AGENT_IDS[agentIdx];
    const scenarioId = TRACK1_SCENARIO_IDS[agentIdx];
    const caseIds = TRACK1_CASE_IDS.slice(agentIdx * 3, agentIdx * 3 + 3);

    const caseDetails: Track1CampaignCaseDetail[] = [];
    const caseStatuses: Track1CampaignCaseStatus[] = [];
    const caseUpdatedTimes: string[] = [];

    for (const caseId of caseIds) {
      const attempts = attemptsByCase.get(caseId) ?? [];
      const expectedAction = getTrack1CaseExpectedAction(caseId);
      const caseStatus = deriveCaseStatus(attempts);
      caseStatuses.push(caseStatus);

      const attemptSummaries: Track1CampaignAttemptSummary[] = [];
      const attemptUpdatedTimes: string[] = [];

      for (const attempt of attempts) {
        const details = attempt.result.details as SandboxRunResultDetails;
        const policyAction = deriveHighestAction(details.policy_decisions);
        const reportSummary = deriveReportSummary(details.policy_decisions);
        const attemptStartedAt = attempt.result.created_at;
        const attemptUpdatedAt = attempt.result.updated_at;
        attemptUpdatedTimes.push(attemptUpdatedAt);

        attemptSummaries.push({
          campaign_id: campaignId,
          agent_id: agentId,
          scenario_id: scenarioId,
          case_id: caseId,
          attempt_id: attempt.attempt_id,
          attempt_index: attempt.attempt_index,
          session_id: attempt.session_id,
          task_id: attempt.task_id,
          status: attempt.status,
          policy_action: policyAction,
          report_summary: reportSummary,
          started_at: attemptStartedAt,
          updated_at: attemptUpdatedAt
        });
      }

      const caseUpdatedAt =
        attempts.length > 0 ? maxTimestamp(attemptUpdatedTimes) : startedAt;
      caseUpdatedTimes.push(caseUpdatedAt);

      const caseDetail: Track1CampaignCaseDetail = {
        campaign_id: campaignId,
        agent_id: agentId,
        scenario_id: scenarioId,
        case_id: caseId,
        status: caseStatus,
        expected_action: expectedAction,
        attempt_count: attempts.length as 0 | 1 | 2,
        attempts: attemptSummaries,
        updated_at: caseUpdatedAt
      };
      caseDetails.push(caseDetail);
      allCaseDetails.push(caseDetail);
    }

    const agentStatus = deriveAgentStatus(caseStatuses, campaignStatus);
    const agentUpdatedAt = maxTimestamp(caseUpdatedTimes);

    agents.push({
      campaign_id: campaignId,
      agent_id: agentId,
      scenario_id: scenarioId,
      status: agentStatus,
      case_count: 3,
      cases: caseDetails,
      updated_at: agentUpdatedAt
    });
  }

  // Build and normalize detail.
  const detail: Track1CampaignDetail = {
    schema_version: TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
    campaign_id: campaignId,
    status: campaignStatus,
    started_at: startedAt,
    updated_at: updatedAt,
    agent_count: 3,
    case_count: 9,
    agents
  };

  const normalizedDetail = normalizeTrack1CampaignDetail(detail);
  if (!normalizedDetail) {
    throw projectionInvalid("Campaign detail failed normalization");
  }

  // Recompute summary counters from stored attempts and projected cases.
  let passedCaseCount = 0;
  let failedCaseCount = 0;
  let retryCount = 0;

  for (const caseDetail of allCaseDetails) {
    if (caseDetail.status === "passed") passedCaseCount++;
    if (caseDetail.status === "failed") failedCaseCount++;
    if (caseDetail.attempt_count === 2) retryCount++;
  }

  let blockedCount = 0;
  let alertCount = 0;
  let askCount = 0;

  for (const attempt of stored.attempts) {
    const details = attempt.result.details as SandboxRunResultDetails;
    const blockedRecords = details.blocked_records ?? [];
    if (blockedRecords.length > 0) blockedCount++;

    alertCount += (details.alerts ?? []).length;

    const decisions = details.policy_decisions ?? [];
    // R4 (Phase 2 rework finding 7): use the same highest-action reduction as
    // the ingest service's projectSummary. An attempt counts toward ask_count
    // when its HIGHEST policy action is "ask", not when EVERY decision is
    // "ask". This keeps the projector and finalize response consistent.
    if (deriveHighestAction(decisions) === "ask") {
      askCount++;
    }
  }

  const evidenceAvailable = stored.evidence !== null;

  const summary: Track1CampaignSummary = {
    schema_version: TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
    campaign_id: campaignId,
    status: campaignStatus,
    started_at: startedAt,
    updated_at: updatedAt,
    agent_count: 3,
    case_count: 9,
    passed_case_count: passedCaseCount,
    failed_case_count: failedCaseCount,
    retry_count: retryCount,
    alert_count: alertCount,
    blocked_count: blockedCount,
    ask_count: askCount,
    evidence_available: evidenceAvailable
  };

  if (campaignStatus === "completed" && stored.campaign.completed_at) {
    summary.completed_at = stored.campaign.completed_at;
  }

  const normalizedSummary = normalizeTrack1CampaignSummary(summary);
  if (!normalizedSummary) {
    throw projectionInvalid("Campaign summary failed normalization");
  }

  // Build evidence export when registration exists.
  let evidence: Track1CampaignEvidenceExport | null = null;
  if (stored.evidence) {
    const campaignHex = campaignId.substring("campaign:t1:".length);
    const sessionEvidenceRefs: string[] = [];

    // Build refs in deterministic traversal order:
    // agent 0 case 0 attempt 0, agent 0 case 1 attempt 0, ... agent 2 case 2.
    for (const agent of agents) {
      for (const c of agent.cases) {
        for (const a of c.attempts) {
          const sessionHex = a.session_id.substring("session:".length);
          sessionEvidenceRefs.push(
            `evidence://track1/campaign/${campaignHex}/session/${sessionHex}`
          );
        }
      }
    }

    const evidenceExport: Track1CampaignEvidenceExport = {
      schema_version: TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION,
      campaign: normalizedDetail,
      session_evidence_refs: sessionEvidenceRefs,
      artifact_manifest_ref: stored.evidence.artifact_manifest_ref
    };

    evidence = normalizeTrack1CampaignEvidenceExport(evidenceExport);
    if (!evidence) {
      throw projectionInvalid("Campaign evidence export failed normalization");
    }
  }

  return {
    summary: normalizedSummary,
    detail: normalizedDetail,
    evidence
  };
}
