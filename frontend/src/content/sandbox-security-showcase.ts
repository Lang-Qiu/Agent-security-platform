// Showcase fixture for the sandbox security evaluation demonstration route.
//
// This data is authored, not engine-produced. It exists so the showcase route
// can present a full decision anatomy without a capability token or a running
// backend. It is deliberately NOT wired into the workbench route: the
// GENERAL-005 design forbids a mock fallback there ("a security verdict must
// never be simulated by fixture data"), so the showcase carries its own copy
// and labels its provenance on screen.
//
// Every identifier below follows the shared contract's shape (finding:sha256:,
// detector://, source://sandbox/security/<ns>/<ordinal>) so the rendered page
// reads exactly like a real decision.

import type {
  SandboxDetectorRun,
  SandboxSecurityDecision,
  SandboxSecurityFinding
} from "../../../shared/types/sandbox-security";

/** Shown on screen so a viewer is never misled about where the data came from. */
export const showcaseProvenanceNotice = {
  label: "演示数据",
  summary:
    "本页决策为预置演示数据，用于展示评估结果的呈现与时序，不来自任何一次真实评估。真实评估请使用评估工作台。"
} as const;

const FINDING_INJECTION: SandboxSecurityFinding = {
  finding_id:
    "finding:sha256:3f7a1c94e2b85d06af4913c7be2058d1fa6c47e390b2d5814cae6f07b93d21a5",
  detector_id: "detector://sandbox/security/rule/instruction-override",
  detector_version: "1.4.0",
  category: "prompt_injection",
  severity: "critical",
  confidence: 0.96,
  reason_code: "sandbox_security_prompt_injection",
  subject_refs: [
    {
      kind: "content_source",
      source_token: "source://sandbox/security/showcase/0001",
      locator: { kind: "text_byte_range", start_byte: 412, end_byte: 519 }
    }
  ],
  evidence_refs: ["evidence://sandbox/security/showcase/0001"]
};

const FINDING_TOOL_HIJACK: SandboxSecurityFinding = {
  finding_id:
    "finding:sha256:8b2d05e7194fc3a6d0821be45739cf10a2e6845bd3970c1fe58b26a407d91c3e",
  detector_id: "detector://sandbox/security/local-model/tool-intent",
  detector_version: "2.1.3",
  category: "tool_hijacking",
  severity: "high",
  confidence: 0.88,
  reason_code: "sandbox_security_tool_hijacking",
  subject_refs: [
    {
      kind: "tool_request",
      call_token: "call://sandbox/security/showcase/0001",
      component: "arguments",
      locator: { kind: "json_pointer", pointer: "/target/path" }
    }
  ],
  evidence_refs: ["evidence://sandbox/security/showcase/0002"]
};

const FINDING_EXFIL: SandboxSecurityFinding = {
  finding_id:
    "finding:sha256:c41e78a6035bd92f7e18406ca35d7b209fe8641d05b7c3ea92f6d048b17e5c92",
  detector_id: "detector://sandbox/security/rule/secret-shape",
  detector_version: "1.4.0",
  category: "sensitive_data_exposure",
  severity: "medium",
  confidence: 0.71,
  reason_code: "sandbox_security_sensitive_data_exposure",
  subject_refs: [
    {
      kind: "content_source",
      source_token: "source://sandbox/security/showcase/0002",
      locator: { kind: "json_pointer", pointer: "/headers/authorization" }
    }
  ],
  evidence_refs: ["evidence://sandbox/security/showcase/0003"]
};

const FINDING_TRUST_BOUNDARY: SandboxSecurityFinding = {
  finding_id:
    "finding:sha256:5d90ba3e6c1782f40be9153da7620c8e41fb7d925a0e63cb8471f2e05a9d6b3c",
  detector_id: "detector://sandbox/security/rule/provenance-mismatch",
  detector_version: "1.4.0",
  category: "trust_boundary_violation",
  severity: "low",
  confidence: 0.62,
  reason_code: "sandbox_security_trust_boundary_violation",
  subject_refs: [
    {
      kind: "content_source",
      source_token: "source://sandbox/security/showcase/0003",
      locator: { kind: "whole_source" }
    }
  ],
  evidence_refs: []
};

/**
 * Detector runs in engine execution order. `elapsed_ms` drives the act-two
 * reveal: the chain replays the real per-detector cost rather than inventing a
 * uniform tick, so a slow external judge visibly takes longer to land.
 */
const DETECTOR_RUNS: SandboxDetectorRun[] = [
  {
    detector_id: "detector://sandbox/security/rule/instruction-override",
    detector_version: "1.4.0",
    detector_kind: "rule",
    obligation: "profile_required",
    elapsed_ms: 12,
    status: "matched",
    finding_ids: [FINDING_INJECTION.finding_id]
  },
  {
    detector_id: "detector://sandbox/security/rule/secret-shape",
    detector_version: "1.4.0",
    detector_kind: "rule",
    obligation: "profile_required",
    elapsed_ms: 18,
    status: "matched",
    finding_ids: [FINDING_EXFIL.finding_id]
  },
  {
    detector_id: "detector://sandbox/security/rule/provenance-mismatch",
    detector_version: "1.4.0",
    detector_kind: "rule",
    obligation: "profile_required",
    elapsed_ms: 9,
    status: "matched",
    finding_ids: [FINDING_TRUST_BOUNDARY.finding_id]
  },
  {
    detector_id: "detector://sandbox/security/rule/encoding-obfuscation",
    detector_version: "1.4.0",
    detector_kind: "rule",
    obligation: "profile_required",
    elapsed_ms: 7,
    status: "no_match",
    finding_ids: []
  },
  {
    detector_id: "detector://sandbox/security/local-model/tool-intent",
    detector_version: "2.1.3",
    detector_kind: "local_model",
    obligation: "profile_required",
    elapsed_ms: 486,
    status: "matched",
    finding_ids: [FINDING_TOOL_HIJACK.finding_id]
  },
  {
    detector_id: "detector://sandbox/security/local-model/jailbreak-intent",
    detector_version: "2.1.3",
    detector_kind: "local_model",
    obligation: "profile_required",
    elapsed_ms: 512,
    status: "no_match",
    finding_ids: []
  },
  {
    detector_id: "detector://sandbox/security/external-judge/adjudicator",
    detector_version: "0.9.1",
    detector_kind: "external_judge",
    obligation: "runtime_required",
    elapsed_ms: 1840,
    status: "timeout",
    error_code: "detector_timeout"
  },
  {
    detector_id: "detector://sandbox/security/local-model/memory-poisoning",
    detector_version: "2.1.3",
    detector_kind: "local_model",
    obligation: "optional_not_selected",
    elapsed_ms: 0,
    status: "skipped",
    skip_reason: "optional_not_selected"
  }
];

/**
 * The showcase decision. `risk_level: "critical"` is what drives the act-three
 * spring parameters, so the verdict arrives sharp and slightly overshot; a
 * lower risk level in this same fixture would land softly instead.
 */
export const showcaseDecision: SandboxSecurityDecision = {
  schema_version: "sandbox-security-decision.v1",
  decision_id:
    "decision:sha256:9e04b7cf25a318d6740fe2b85c1937da0e64c8b7f2915d3ea6c08417bd52937f",
  request_id: "req-showcase-0001",
  evaluation_mode: "simulation",
  stage: "tool_request",
  policy_profile_id: "sandbox-security-strict.v1",
  verdict: "risk_detected",
  action: "deny",
  risk_level: "critical",
  findings: [
    FINDING_INJECTION,
    FINDING_TOOL_HIJACK,
    FINDING_EXFIL,
    FINDING_TRUST_BOUNDARY
  ],
  detector_runs: DETECTOR_RUNS,
  evidence_refs: [
    "evidence://sandbox/security/showcase/0001",
    "evidence://sandbox/security/showcase/0002",
    "evidence://sandbox/security/showcase/0003"
  ],
  created_at: "2026-08-09T04:17:52.318Z"
};

/** The submitted payload that produced the decision above, for act one. */
export const showcasePayloadSummary = [
  {
    source_id: "src-0",
    claimed_source_type: "user_input",
    media_type: "text/plain",
    bytes: 1284
  },
  {
    source_id: "src-1",
    claimed_source_type: "tool_result",
    media_type: "application/json",
    bytes: 3910
  },
  {
    source_id: "src-2",
    claimed_source_type: "retrieved_document",
    media_type: "text/plain",
    bytes: 8672
  }
] as const;

export const showcaseActCopy = {
  arming: {
    eyebrow: "第一幕",
    title: "备妥",
    body: "能力令牌校验通过，请求负载封装为待检包。"
  },
  detecting: {
    eyebrow: "第二幕",
    title: "检测",
    body: "检测器链按策略配置依次执行，下方时序为各检测器的真实耗时。"
  },
  verdict: {
    eyebrow: "第三幕",
    title: "判定",
    body: "策略归约完成，风险等级决定了判定落定的力度。"
  }
} as const;
