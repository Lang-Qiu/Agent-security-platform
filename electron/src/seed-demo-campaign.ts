// Seeds a fixed demo Track1 campaign (9 cases, all passed, evidence
// registered) into the internal ingest API on first launch, so the
// /review-demo tour always has real campaign data to display without
// requiring OpenClaw or a manual seeding step.
//
// Reuses the same shared contracts/normalizers the real campaign runner and
// backend enforce, so the demo data is subject to the identical validation
// as a genuine OpenClaw-produced campaign.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { calculateTrack1SnapshotSha256 } from "../../shared/contracts/campaign-ingest.ts";
import { normalizeBaseResult } from "../../shared/contracts/result.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
  TRACK1_OPENCLAW_VERSION
} from "../../shared/types/campaign-ingest.ts";
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignFinalizeEnvelope,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignSnapshotWithoutHash,
  Track1CampaignStartEnvelope
} from "../../shared/types/campaign-ingest.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS,
  getTrack1CaseExpectedAction
} from "../../shared/types/campaign-supervision.ts";
import type {
  Track1CaseId,
  SandboxPolicyAction
} from "../../shared/types/campaign-supervision.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../shared/types/result.ts";

export const DEMO_CAMPAIGN_HEX = "00000000000000000000000000000abc";
export const DEMO_CAMPAIGN_ID = `campaign:t1:${DEMO_CAMPAIGN_HEX}` as const;

export function buildDemoStartEnvelope(): Track1CampaignStartEnvelope {
  return {
    schema_version: "track1-campaign-start.v1",
    campaign_id: DEMO_CAMPAIGN_ID,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    openclaw_version: TRACK1_OPENCLAW_VERSION,
    openclaw_package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
    model_ref: TRACK1_MODEL_REF_CANONICAL,
    started_at: "2026-07-04T00:00:00.000Z"
  };
}

function buildDemoResult(
  caseIndex: number,
  action: SandboxPolicyAction
): BaseResult<SandboxRunResultDetails> {
  const caseSuffix = caseIndex.toString(16).padStart(2, "0");
  const hexBase = DEMO_CAMPAIGN_HEX.slice(0, -2) + caseSuffix;
  const sessionId = `session:${hexBase}`;
  const taskId = `task:${hexBase}`;
  const minutePad = (caseIndex + 1).toString().padStart(2, "0");
  const occurredAt = `2026-07-04T00:${minutePad}:01.000Z`;
  const decidedAt = `2026-07-04T00:${minutePad}:02.000Z`;

  const decision = {
    decision_id: `decision_${caseIndex + 1}`,
    subject_event_id: `event_tool_request_${caseIndex + 1}`,
    policy_id: `policy_case_${caseIndex + 1}`,
    action,
    reason_code: `${action}_expected`,
    reason: `Demo policy decision with action ${action}`,
    evidence_refs: [`evidence://decision/${caseIndex + 1}`],
    decided_at: decidedAt
  };

  const alerts =
    action === "alert"
      ? [
          {
            alert_id: `alert_${caseIndex + 1}`,
            subject_event_id: `event_tool_request_${caseIndex + 1}`,
            decision_id: decision.decision_id,
            risk_level: "medium" as const,
            category: "policy.alert",
            title: `Alert for ${action} decision`,
            reason: `Demo alert for case ${caseIndex + 1}`,
            evidence_refs: [`evidence://alert/${caseIndex + 1}`],
            occurred_at: decidedAt
          }
        ]
      : [];

  const blocked_records =
    action === "deny"
      ? [
          {
            blocked_record_id: `blocked_${caseIndex + 1}`,
            subject_event_id: `event_tool_request_${caseIndex + 1}`,
            decision_id: decision.decision_id,
            reason: `Demo block for case ${caseIndex + 1}`,
            evidence_refs: [`evidence://blocked/${caseIndex + 1}`],
            occurred_at: decidedAt
          }
        ]
      : [];

  const details = {
    session_id: sessionId,
    events: [
      {
        event_id: `event_tool_request_${caseIndex + 1}`,
        session_id: sessionId,
        sequence: 1,
        event_type: "tool_request",
        occurred_at: occurredAt,
        source: "agent",
        evidence_refs: [`evidence://tool/request/${caseIndex + 1}`],
        payload: {
          call_id: `call_${caseIndex + 1}`,
          tool_name: "send_email",
          target_ref: "recipient://reviewer@local.invalid",
          arguments_ref: `fixture://cases/${TRACK1_SCENARIO_IDS[Math.floor(caseIndex / 3)]}/tool-request`
        }
      },
      {
        event_id: `event_policy_decision_${caseIndex + 1}`,
        session_id: sessionId,
        sequence: 2,
        event_type: "policy_decision",
        occurred_at: decidedAt,
        source: "policy",
        evidence_refs: [`evidence://decision/${caseIndex + 1}`],
        payload: decision
      }
    ],
    policy_decisions: [decision],
    alerts,
    blocked_records,
    blocked: blocked_records.length > 0,
    event_count: 2
  };

  const normalized = normalizeBaseResult({
    task_id: taskId,
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "finished",
    risk_level: "info",
    summary: `Sandbox finished with action ${action}`,
    details,
    created_at: `2026-07-04T00:${minutePad}:00.000Z`,
    updated_at: `2026-07-04T00:${minutePad}:03.000Z`
  });

  if (!normalized) {
    throw new Error(`demo result for case index ${caseIndex} failed to normalize`);
  }

  return normalized as BaseResult<SandboxRunResultDetails>;
}

export function buildDemoSnapshotEnvelopes(): Track1CampaignSnapshotEnvelope[] {
  const envelopes: Track1CampaignSnapshotEnvelope[] = [];

  for (let caseIndex = 0; caseIndex < TRACK1_CASE_IDS.length; caseIndex++) {
    const caseId = TRACK1_CASE_IDS[caseIndex] as Track1CaseId;
    const groupIndex = Math.floor(caseIndex / 3);
    const expectedAction = getTrack1CaseExpectedAction(caseId);
    const result = buildDemoResult(caseIndex, expectedAction);

    const withoutHash: Track1CampaignSnapshotWithoutHash = {
      schema_version: "track1-campaign-snapshot.v1",
      campaign_id: DEMO_CAMPAIGN_ID,
      campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
      agent_id: TRACK1_CAMPAIGN_AGENT_IDS[groupIndex],
      scenario_id: TRACK1_SCENARIO_IDS[groupIndex],
      case_id: caseId,
      attempt_id: `attempt:${caseId.toLowerCase()}:1`,
      attempt_index: 1,
      // Each case is a distinct attempt with its own hash chain, so this is
      // always the genesis (sequence 1) snapshot for that attempt_id.
      sequence: 1,
      previous_snapshot_sha256: null,
      observed_at: `2026-07-04T00:${(caseIndex + 1).toString().padStart(2, "0")}:00.000Z`,
      result
    };

    envelopes.push({
      ...withoutHash,
      snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
    });
  }

  return envelopes;
}

export function buildDemoFinalizeEnvelope(): Track1CampaignFinalizeEnvelope {
  return {
    schema_version: "track1-campaign-finalize.v1",
    campaign_id: DEMO_CAMPAIGN_ID,
    requested_status: "completed",
    completed_at: "2026-07-04T00:10:00.000Z"
  };
}

export function buildDemoEvidenceRegistration(): Track1CampaignEvidenceRegistration {
  const manifestRef = `artifact://track1/campaign/${DEMO_CAMPAIGN_HEX}/manifest`;
  const manifestSha256 = createHash("sha256").update(manifestRef).digest("hex");
  return {
    schema_version: "track1-campaign-evidence-registration.v1",
    campaign_id: DEMO_CAMPAIGN_ID,
    artifact_manifest_sha256: manifestSha256,
    artifact_manifest_ref: manifestRef,
    registered_at: "2026-07-04T00:10:01.000Z"
  };
}

async function postJson(url: string, token: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${url} failed with ${response.status}: ${text}`);
  }
}

// Seeds the demo campaign end-to-end. Idempotent: if the campaign already
// exists (e.g. app relaunched), the "already exists" 409 is swallowed so
// repeated launches don't crash the app.
export async function seedDemoCampaign(internalOrigin: string, ingestToken: string): Promise<void> {
  const base = `${internalOrigin}/internal/track1/campaigns`;

  try {
    await postJson(base, ingestToken, buildDemoStartEnvelope());
  } catch (error) {
    if (String(error).includes("409")) return;
    throw error;
  }

  // The internal router requires the path segment to be the full,
  // URL-encoded campaign_id (it validates pathCampaignId === body.campaign_id
  // after decoding) — the bare hex suffix alone does not match.
  const encodedCampaignId = encodeURIComponent(DEMO_CAMPAIGN_ID);

  for (const snapshot of buildDemoSnapshotEnvelopes()) {
    await postJson(`${base}/${encodedCampaignId}/snapshots`, ingestToken, snapshot);
  }

  await postJson(`${base}/${encodedCampaignId}/finalize`, ingestToken, buildDemoFinalizeEnvelope());
  await postJson(`${base}/${encodedCampaignId}/evidence`, ingestToken, buildDemoEvidenceRegistration());
}

// CLI entrypoint so the Electron main process can run this as a plain child
// process (`node --experimental-strip-types seed-demo-campaign.ts <origin> <token>`)
// without needing type-stripping support in the Electron main process itself.
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const [, , internalOrigin, ingestToken] = process.argv;
  if (!internalOrigin || !ingestToken) {
    console.error("Usage: seed-demo-campaign.ts <internalOrigin> <ingestToken>");
    process.exit(1);
  }
  seedDemoCampaign(internalOrigin, ingestToken)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Failed to seed demo campaign:", error);
      process.exit(1);
    });
}
