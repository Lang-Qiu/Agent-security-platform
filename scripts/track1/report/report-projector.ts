import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
  TRACK1_OPENCLAW_VERSION
} from "../../../shared/types/campaign-ingest.ts";
import {
  normalizeSandboxSupervisionEvidenceExport,
  normalizeTrack1CampaignDetail,
  type SandboxPolicyAction,
  type SandboxSupervisionEvidenceExport
} from "../../../shared/index.ts";
import {
  TRACK1_SECURITY_REPORT_SCHEMA_VERSION,
  type Track1CampaignManifest,
  type Track1ReportAttempt,
  type Track1ReportCase,
  type Track1ReportModel,
  type Track1ReportScenario
} from "./report-model.ts";

const SOURCE_KEYS = new Set([
  "campaign",
  "sessions",
  "campaign_manifest",
  "openclaw",
  "metrics",
  "final_action",
  "passed"
]);
const REQUIRED_SOURCE_KEYS = [
  "campaign",
  "sessions",
  "campaign_manifest",
  "openclaw"
] as const;
const OPENCLAW_KEYS = [
  "version",
  "package_integrity",
  "model_ref",
  "campaign_manifest_sha256"
] as const;
const ACTIONS: readonly SandboxPolicyAction[] = [
  "allow",
  "deny",
  "ask",
  "alert"
];
const ACTION_PRIORITY: Readonly<Record<SandboxPolicyAction, number>> = {
  allow: 0,
  alert: 1,
  ask: 2,
  deny: 3
};
const RUNTIME_CONTENT_KEY =
  /^(?:raw_|prompt$|model_output$|credential$|api_?key$|access_?token$|provider_response$|content$|arguments$|result$)/i;
const RUNTIME_SENTINEL_VALUE =
  /runtime_(?:prompt|output|credential|provider)_secret_|(?:bearer|basic)\s+[a-z0-9._~+/=-]+|sk-[a-z0-9_-]{8,}/i;

function fail(): never {
  throw new Error("track1_report_source_invalid");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function rejectRuntimeContent(value: unknown): void {
  if (typeof value === "string") {
    if (RUNTIME_SENTINEL_VALUE.test(value)) fail();
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) rejectRuntimeContent(item);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (RUNTIME_CONTENT_KEY.test(key)) fail();
    rejectRuntimeContent(nested);
  }
}

function validateCallerClaims(input: Record<string, unknown>): void {
  for (const key of Object.keys(input)) {
    if (!SOURCE_KEYS.has(key)) fail();
  }
  for (const key of REQUIRED_SOURCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) fail();
  }
  if (Object.prototype.hasOwnProperty.call(input, "metrics")) {
    if (!isPlainObject(input.metrics)) fail();
    if (
      Object.values(input.metrics).some(
        (value) => typeof value !== "number" || !Number.isFinite(value)
      )
    ) {
      fail();
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "final_action") &&
    !ACTIONS.includes(input.final_action as SandboxPolicyAction)
  ) {
    fail();
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "passed") &&
    typeof input.passed !== "boolean"
  ) {
    fail();
  }
}

function loadPinnedManifest(): Track1CampaignManifest {
  const path = new URL(
    "../../../samples/track1/openclaw/campaign.v1.json",
    import.meta.url
  );
  return JSON.parse(readFileSync(path, "utf8")) as Track1CampaignManifest;
}

function normalizeManifest(value: unknown): Track1CampaignManifest {
  if (!isPlainObject(value)) fail();
  const pinned = loadPinnedManifest();
  if (!isDeepStrictEqual(value, pinned)) fail();
  return structuredClone(pinned);
}

function normalizeOpenClaw(value: unknown) {
  if (!isPlainObject(value) || !hasExactKeys(value, OPENCLAW_KEYS)) fail();
  if (value.version !== TRACK1_OPENCLAW_VERSION) fail();
  if (value.package_integrity !== TRACK1_OPENCLAW_PACKAGE_INTEGRITY) fail();
  if (value.model_ref !== TRACK1_MODEL_REF_CANONICAL) fail();
  if (value.campaign_manifest_sha256 !== TRACK1_CAMPAIGN_MANIFEST_SHA256) fail();
  return {
    version: TRACK1_OPENCLAW_VERSION,
    package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
    model_ref: TRACK1_MODEL_REF_CANONICAL,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256
  };
}

function deriveAction(
  evidence: SandboxSupervisionEvidenceExport
): SandboxPolicyAction {
  const decisions = evidence.session.policy_decisions;
  if (decisions.length === 0) fail();
  const policyEvents = evidence.session.events.filter(
    (event) => event.event_type === "policy_decision"
  );
  if (policyEvents.length !== decisions.length) fail();
  for (const decision of decisions) {
    const matching = policyEvents.find(
      (event) =>
        event.event_type === "policy_decision" &&
        event.payload.decision_id === decision.decision_id
    );
    if (!matching || !isDeepStrictEqual(matching.payload, decision)) fail();
  }
  const action = decisions.reduce((highest, decision) =>
    ACTION_PRIORITY[decision.action] > ACTION_PRIORITY[highest]
      ? decision.action
      : highest
  , decisions[0].action);
  if (evidence.session.summary.highest_action !== action) fail();
  if (
    action === "deny" &&
    (evidence.session.blocked_records.length === 0 ||
      evidence.session.summary.blocked !== true)
  ) {
    fail();
  }
  if (action !== "deny" && evidence.session.summary.blocked) fail();
  if (action === "alert" && evidence.session.alerts.length === 0) fail();
  return action;
}

function projectAttempt(
  attempt: {
    attempt_id: string;
    attempt_index: 1 | 2;
    session_id: string;
    task_id: string;
    status: "running" | "passed" | "failed";
    actual_action: SandboxPolicyAction | null;
    scenario_id: string;
    case_id: string;
  },
  evidence: SandboxSupervisionEvidenceExport
): Track1ReportAttempt {
  const { summary, events, policy_decisions, alerts, blocked_records } =
    evidence.session;
  if (
    summary.session_id !== attempt.session_id ||
    summary.task_id !== attempt.task_id ||
    summary.scenario_id !== attempt.scenario_id ||
    summary.case_id !== attempt.case_id
  ) {
    fail();
  }
  if (attempt.status === "running") fail();
  if (
    (attempt.status === "failed" && summary.task_status !== "failed") ||
    (attempt.status === "passed" && summary.task_status !== "finished")
  ) {
    fail();
  }
  const actualAction = deriveAction(evidence);
  if (attempt.actual_action !== actualAction) fail();

  const toolRequests = events.filter(
    (event) => event.event_type === "tool_request"
  );
  const toolResults = events.filter(
    (event) => event.event_type === "tool_result"
  );
  for (const event of toolResults) {
    if (
      event.event_type === "tool_result" &&
      event.payload.state_change !== "none" &&
      event.payload.state_change !== "simulated"
    ) {
      fail();
    }
  }
  const executedSimulated = toolResults.filter(
    (event) =>
      event.event_type === "tool_result" &&
      event.payload.status === "success" &&
      event.payload.state_change === "simulated"
  ).length;
  const evidenceRefs = new Set<string>();
  for (const event of events) {
    for (const ref of event.evidence_refs) evidenceRefs.add(ref);
  }
  for (const decision of policy_decisions) {
    for (const ref of decision.evidence_refs) evidenceRefs.add(ref);
  }
  for (const alert of alerts) {
    for (const ref of alert.evidence_refs) evidenceRefs.add(ref);
  }
  for (const record of blocked_records) {
    for (const ref of record.evidence_refs) evidenceRefs.add(ref);
  }

  return {
    attempt_id: attempt.attempt_id,
    attempt_index: attempt.attempt_index,
    session_id: attempt.session_id,
    task_id: attempt.task_id,
    status: attempt.status,
    actual_action: actualAction,
    event_count: events.length,
    decision_count: policy_decisions.length,
    alert_count: alerts.length,
    blocked_record_count: blocked_records.length,
    intercepted_tool_count: toolRequests.length,
    executed_simulated_tool_count: executedSimulated,
    evidence_refs: [...evidenceRefs].sort()
  };
}

function emptyActionCounts(): Record<SandboxPolicyAction, number> {
  return { allow: 0, deny: 0, ask: 0, alert: 0 };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

export function projectTrack1ReportModel(source: unknown): Track1ReportModel {
  if (!isPlainObject(source)) fail();
  rejectRuntimeContent(source);
  validateCallerClaims(source);

  const campaign = normalizeTrack1CampaignDetail(source.campaign);
  if (!campaign || campaign.status !== "completed") fail();
  const manifest = normalizeManifest(source.campaign_manifest);
  const openclaw = normalizeOpenClaw(source.openclaw);

  if (!Array.isArray(source.sessions)) fail();
  const evidenceBySession = new Map<string, SandboxSupervisionEvidenceExport>();
  for (const item of source.sessions) {
    const evidence = normalizeSandboxSupervisionEvidenceExport(item);
    if (!evidence) fail();
    const sessionId = evidence.session.summary.session_id;
    if (evidenceBySession.has(sessionId)) fail();
    evidenceBySession.set(sessionId, evidence);
  }

  const manifestByCase = new Map(
    manifest.cases.map((campaignCase) => [campaignCase.case_id, campaignCase])
  );
  const cases: Track1ReportCase[] = [];
  const consumedSessions = new Set<string>();
  for (const agent of campaign.agents) {
    for (const campaignCase of agent.cases) {
      const manifestCase = manifestByCase.get(campaignCase.case_id);
      if (
        !manifestCase ||
        manifestCase.agent_id !== agent.agent_id ||
        manifestCase.scenario_id !== agent.scenario_id ||
        campaignCase.expected_action !== manifestCase.expected_action
      ) {
        fail();
      }
      const attempts = campaignCase.attempts.map((attempt) => {
        const evidence = evidenceBySession.get(attempt.session_id);
        if (!evidence || consumedSessions.has(attempt.session_id)) fail();
        consumedSessions.add(attempt.session_id);
        return projectAttempt(attempt, evidence);
      });
      const finalAttempt = attempts.at(-1);
      if (!finalAttempt) fail();
      const passed = finalAttempt.actual_action === manifestCase.expected_action;
      if (
        campaignCase.status !== (passed ? "passed" : "failed") ||
        !passed
      ) {
        fail();
      }
      cases.push({
        agent_id: agent.agent_id,
        scenario_id: agent.scenario_id,
        case_id: campaignCase.case_id,
        fixture_ref: manifestCase.case_ref,
        fixture_sha256: manifestCase.case_sha256,
        expected_action: manifestCase.expected_action,
        actual_action: finalAttempt.actual_action,
        passed,
        final_attempt_id: finalAttempt.attempt_id,
        final_session_id: finalAttempt.session_id,
        attempts
      });
    }
  }
  if (
    cases.length !== 9 ||
    manifestByCase.size !== 9 ||
    consumedSessions.size !== evidenceBySession.size
  ) {
    fail();
  }

  const scenarios: Track1ReportScenario[] = campaign.agents.map((agent) => {
    const scenarioCases = cases.filter(
      (campaignCase) => campaignCase.scenario_id === agent.scenario_id
    );
    const expectedActions = emptyActionCounts();
    const actualActions = emptyActionCounts();
    for (const campaignCase of scenarioCases) {
      expectedActions[campaignCase.expected_action] += 1;
      actualActions[campaignCase.actual_action] += 1;
    }
    return {
      scenario_id: agent.scenario_id,
      agent_id: agent.agent_id,
      case_count: 3,
      passed_case_count: scenarioCases.filter((item) => item.passed).length,
      failed_case_count: scenarioCases.filter((item) => !item.passed).length,
      expected_actions: expectedActions,
      actual_actions: actualActions
    };
  });

  const allAttempts = cases.flatMap((campaignCase) => campaignCase.attempts);
  const finalActions = emptyActionCounts();
  for (const campaignCase of cases) {
    finalActions[campaignCase.actual_action] += 1;
  }
  const model: Track1ReportModel = {
    schema_version: TRACK1_SECURITY_REPORT_SCHEMA_VERSION,
    campaign: {
      campaign_id: campaign.campaign_id,
      status: "completed",
      started_at: campaign.started_at,
      completed_at: campaign.updated_at,
      campaign_manifest_sha256: openclaw.campaign_manifest_sha256
    },
    environment: {
      openclaw_version: openclaw.version,
      openclaw_package_integrity: openclaw.package_integrity,
      model_ref: openclaw.model_ref
    },
    metrics: {
      agent_count: 3,
      case_count: 9,
      final_pass_count: cases.filter((item) => item.passed).length,
      final_fail_count: cases.filter((item) => !item.passed).length,
      retry_count: allAttempts.length - cases.length,
      attempt_count: allAttempts.length,
      allow_count: finalActions.allow,
      deny_count: finalActions.deny,
      ask_count: finalActions.ask,
      alert_count: finalActions.alert,
      blocked_count: allAttempts.filter(
        (attempt) => attempt.blocked_record_count > 0
      ).length,
      intercepted_tool_count: allAttempts.reduce(
        (sum, attempt) => sum + attempt.intercepted_tool_count,
        0
      ),
      executed_simulated_tool_count: allAttempts.reduce(
        (sum, attempt) => sum + attempt.executed_simulated_tool_count,
        0
      ),
      real_side_effect_count: 0
    },
    cases,
    scenarios,
    fixture_appendix: manifest.cases.map((campaignCase) => ({
      case_id: campaignCase.case_id,
      path: campaignCase.case_ref,
      sha256: campaignCase.case_sha256
    }))
  };
  return deepFreeze(structuredClone(model));
}
