import type {
  SandboxPolicyAction,
  SandboxSupervisionEvidenceExport,
  Track1CampaignDetail
} from "../../../shared/index.ts";

export const TRACK1_SECURITY_REPORT_SCHEMA_VERSION =
  "track1-security-report.v1" as const;

export interface Track1CampaignManifestAgent {
  agent_id: string;
  scenario_id: string;
}

export interface Track1CampaignManifestCase {
  agent_id: string;
  scenario_id: string;
  case_id: string;
  case_ref: string;
  case_sha256: string;
  expected_action: SandboxPolicyAction;
}

export interface Track1CampaignManifest {
  schema_version: "track1-openclaw-campaign.v1";
  campaign_name: "Track 1 OpenClaw Security Campaign";
  max_attempts: 2;
  agents: Track1CampaignManifestAgent[];
  cases: Track1CampaignManifestCase[];
}

export interface Track1OpenClawBuildEvidence {
  version: "2026.6.10";
  package_integrity: string;
  model_ref: string;
  campaign_manifest_sha256: string;
}

export interface Track1ReportSource {
  campaign: Track1CampaignDetail;
  sessions: SandboxSupervisionEvidenceExport[];
  campaign_manifest: Track1CampaignManifest;
  openclaw: Track1OpenClawBuildEvidence;
}

export interface Track1ReportCampaign {
  campaign_id: string;
  status: "completed";
  started_at: string;
  completed_at: string;
  campaign_manifest_sha256: string;
}

export interface Track1ReportEnvironment {
  openclaw_version: "2026.6.10";
  openclaw_package_integrity: string;
  model_ref: string;
}

export interface Track1ReportMetrics {
  agent_count: 3;
  case_count: 9;
  final_pass_count: number;
  final_fail_count: number;
  retry_count: number;
  attempt_count: number;
  allow_count: number;
  deny_count: number;
  ask_count: number;
  alert_count: number;
  blocked_count: number;
  intercepted_tool_count: number;
  executed_simulated_tool_count: number;
  real_side_effect_count: 0;
}

export interface Track1ReportAttempt {
  attempt_id: string;
  attempt_index: 1 | 2;
  session_id: string;
  task_id: string;
  status: "passed" | "failed";
  actual_action: SandboxPolicyAction;
  event_count: number;
  decision_count: number;
  alert_count: number;
  blocked_record_count: number;
  intercepted_tool_count: number;
  executed_simulated_tool_count: number;
  evidence_refs: readonly string[];
}

export interface Track1ReportCase {
  agent_id: string;
  scenario_id: string;
  case_id: string;
  fixture_ref: string;
  fixture_sha256: string;
  expected_action: SandboxPolicyAction;
  actual_action: SandboxPolicyAction;
  passed: boolean;
  final_attempt_id: string;
  final_session_id: string;
  attempts: readonly Track1ReportAttempt[];
}

export interface Track1ReportScenario {
  scenario_id: string;
  agent_id: string;
  case_count: 3;
  passed_case_count: number;
  failed_case_count: number;
  expected_actions: Readonly<Record<SandboxPolicyAction, number>>;
  actual_actions: Readonly<Record<SandboxPolicyAction, number>>;
}

export interface Track1FixtureAppendixEntry {
  case_id: string;
  path: string;
  sha256: string;
}

export interface Track1ReportModel {
  schema_version: typeof TRACK1_SECURITY_REPORT_SCHEMA_VERSION;
  campaign: Track1ReportCampaign;
  environment: Track1ReportEnvironment;
  metrics: Track1ReportMetrics;
  cases: readonly Track1ReportCase[];
  scenarios: readonly Track1ReportScenario[];
  fixture_appendix: readonly Track1FixtureAppendixEntry[];
}
