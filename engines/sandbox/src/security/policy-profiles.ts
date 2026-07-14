import type { SandboxSecurityAuthorityBoundContent } from "./input-boundary.ts";
import type {
  SandboxSecurityAction,
  SandboxSecurityClaimedSourceType,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityReasonCode,
  SandboxSecuritySeverity,
  SandboxSecurityStage
} from "../../../../shared/types/sandbox-security.ts";
import {
  SANDBOX_SECURITY_RISK_CATEGORIES
} from "../../../../shared/types/sandbox-security.ts";

export type SandboxSecurityTrustClass =
  | "control"
  | "user_supplied"
  | "external_untrusted"
  | "generated_untrusted";

export interface SandboxSecurityNormalizedContent
  extends SandboxSecurityAuthorityBoundContent {
  readonly trust_class: SandboxSecurityTrustClass;
}

export interface SandboxSecurityTrustRule {
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly authority_kind:
    | "platform_control"
    | "integration_observation"
    | "simulation_observation";
  readonly source_types: readonly SandboxSecurityClaimedSourceType[];
  readonly trust_class: SandboxSecurityTrustClass;
}

export interface SandboxSecurityActionByStage {
  readonly user_input: SandboxSecurityAction;
  readonly model_output: SandboxSecurityAction;
  readonly tool_request: SandboxSecurityAction;
}

export interface SandboxSecurityActionMatrix {
  readonly accepted_critical: Readonly<SandboxSecurityActionByStage>;
  readonly accepted_high: Readonly<SandboxSecurityActionByStage>;
  readonly accepted_medium: Readonly<SandboxSecurityActionByStage>;
  readonly accepted_low: Readonly<SandboxSecurityActionByStage>;
  readonly no_finding_all_resolved: Readonly<SandboxSecurityActionByStage>;
  readonly unresolved_required: Readonly<SandboxSecurityActionByStage>;
}

export type SandboxSecurityRoutingRule =
  | "always"
  | "configured_after_no_short_circuit"
  | "unresolved_escalation_signal";

export type SandboxSecurityDetectorSlotId =
  | "detector://sandbox/security/rule/default/v1"
  | "detector://sandbox/security/local/default/v1"
  | "detector://sandbox/security/judge/default/v1";

export interface SandboxSecurityDetectorSlotManifest {
  slot_id: SandboxSecurityDetectorSlotId;
  detector_version: string;
  detector_kind: "rule" | "local_model" | "external_judge";
  supported_stages: readonly SandboxSecurityStage[];
  base_obligation: "profile_required" | "optional";
  content_access: "raw_local" | "sanitized_external";
  timeout_ms: number;
  qualification_threshold: number;
  routing_floor: number;
  routing_rule: SandboxSecurityRoutingRule;
  short_circuit_min_severity: SandboxSecuritySeverity | null;
}

export interface SandboxSecurityPolicyProfileManifest {
  profile_id: SandboxSecurityPolicyProfileId;
  normal_work_budget_ms: 5000;
  trust_rules: readonly SandboxSecurityTrustRule[];
  detector_slots: readonly SandboxSecurityDetectorSlotManifest[];
  action_matrix: Readonly<SandboxSecurityActionMatrix>;
  reason_codes: readonly SandboxSecurityReasonCode[];
}

const ALL_STAGES = ["user_input", "model_output", "tool_request"] as const;

const REASON_CODES: readonly SandboxSecurityReasonCode[] =
  SANDBOX_SECURITY_RISK_CATEGORIES.map(
    (category) => `sandbox_security_${category}` as SandboxSecurityReasonCode
  );

function stageMap(
  user_input: SandboxSecurityAction,
  model_output: SandboxSecurityAction,
  tool_request: SandboxSecurityAction
): SandboxSecurityActionByStage {
  return { user_input, model_output, tool_request };
}

function allStages(action: SandboxSecurityAction): SandboxSecurityActionByStage {
  return stageMap(action, action, action);
}

const TRUST_RULES: readonly SandboxSecurityTrustRule[] = [
  {
    evaluation_mode: "enforcement",
    authority_kind: "platform_control",
    source_types: ["system_instruction", "developer_instruction"],
    trust_class: "control"
  },
  {
    evaluation_mode: "enforcement",
    authority_kind: "integration_observation",
    source_types: ["user_input"],
    trust_class: "user_supplied"
  },
  {
    evaluation_mode: "enforcement",
    authority_kind: "integration_observation",
    source_types: ["retrieved_content", "memory_content"],
    trust_class: "external_untrusted"
  },
  {
    evaluation_mode: "enforcement",
    authority_kind: "integration_observation",
    source_types: ["model_output"],
    trust_class: "generated_untrusted"
  },
  {
    evaluation_mode: "simulation",
    authority_kind: "simulation_observation",
    source_types: ["system_instruction", "developer_instruction"],
    trust_class: "control"
  },
  {
    evaluation_mode: "simulation",
    authority_kind: "simulation_observation",
    source_types: ["user_input"],
    trust_class: "user_supplied"
  },
  {
    evaluation_mode: "simulation",
    authority_kind: "simulation_observation",
    source_types: ["retrieved_content", "memory_content"],
    trust_class: "external_untrusted"
  },
  {
    evaluation_mode: "simulation",
    authority_kind: "simulation_observation",
    source_types: ["model_output"],
    trust_class: "generated_untrusted"
  }
];

function makeSlots(options: {
  localObligation: "profile_required" | "optional";
  ruleQualify: number;
  localQualify: number;
  judgeQualify: number;
  ruleFloor: number;
  localFloor: number;
  judgeFloor: number;
  ruleShortCircuit: SandboxSecuritySeverity | null;
}): readonly SandboxSecurityDetectorSlotManifest[] {
  return [
    {
      slot_id: "detector://sandbox/security/rule/default/v1",
      detector_version: "1.0.0",
      detector_kind: "rule",
      supported_stages: ALL_STAGES,
      base_obligation: "profile_required",
      content_access: "raw_local",
      timeout_ms: 100,
      qualification_threshold: options.ruleQualify,
      routing_floor: options.ruleFloor,
      routing_rule: "always",
      short_circuit_min_severity: options.ruleShortCircuit
    },
    {
      slot_id: "detector://sandbox/security/local/default/v1",
      detector_version: "1.0.0",
      detector_kind: "local_model",
      supported_stages: ALL_STAGES,
      base_obligation: options.localObligation,
      content_access: "raw_local",
      timeout_ms: 1000,
      qualification_threshold: options.localQualify,
      routing_floor: options.localFloor,
      routing_rule: "configured_after_no_short_circuit",
      short_circuit_min_severity: null
    },
    {
      slot_id: "detector://sandbox/security/judge/default/v1",
      detector_version: "1.0.0",
      detector_kind: "external_judge",
      supported_stages: ALL_STAGES,
      base_obligation: "optional",
      content_access: "sanitized_external",
      timeout_ms: 4000,
      qualification_threshold: options.judgeQualify,
      routing_floor: options.judgeFloor,
      routing_rule: "unresolved_escalation_signal",
      short_circuit_min_severity: null
    }
  ];
}

const BALANCED_MATRIX: SandboxSecurityActionMatrix = {
  accepted_critical: allStages("deny"),
  accepted_high: allStages("deny"),
  accepted_medium: stageMap("ask", "ask", "deny"),
  accepted_low: allStages("alert"),
  no_finding_all_resolved: allStages("allow"),
  unresolved_required: stageMap("ask", "ask", "deny")
};

const STRICT_MATRIX: SandboxSecurityActionMatrix = {
  accepted_critical: allStages("deny"),
  accepted_high: allStages("deny"),
  accepted_medium: allStages("deny"),
  accepted_low: stageMap("ask", "ask", "deny"),
  no_finding_all_resolved: allStages("allow"),
  unresolved_required: stageMap("ask", "ask", "deny")
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return value;
  }
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return value;
}

function assertNoDuplicateSlots(
  slots: readonly SandboxSecurityDetectorSlotManifest[]
): void {
  const ids = new Set<string>();
  for (const slot of slots) {
    if (ids.has(slot.slot_id)) {
      throw new Error(`duplicate slot id ${slot.slot_id}`);
    }
    ids.add(slot.slot_id);
  }
}

function assertMonotonic(
  balanced: SandboxSecurityPolicyProfileManifest,
  strict: SandboxSecurityPolicyProfileManifest
): void {
  for (let index = 0; index < balanced.detector_slots.length; index += 1) {
    const b = balanced.detector_slots[index];
    const s = strict.detector_slots[index];
    if (s.qualification_threshold > b.qualification_threshold) {
      throw new Error("strict qualification less restrictive than balanced");
    }
    if (s.routing_floor > b.routing_floor) {
      throw new Error("strict routing floor less restrictive than balanced");
    }
  }
}

const BALANCED: SandboxSecurityPolicyProfileManifest = {
  profile_id: "sandbox-security-balanced.v1",
  normal_work_budget_ms: 5000,
  trust_rules: TRUST_RULES,
  detector_slots: makeSlots({
    localObligation: "optional",
    ruleQualify: 0.8,
    localQualify: 0.85,
    judgeQualify: 0.8,
    ruleFloor: 0.5,
    localFloor: 0.6,
    judgeFloor: 0.6,
    ruleShortCircuit: "high"
  }),
  action_matrix: BALANCED_MATRIX,
  reason_codes: REASON_CODES
};

const STRICT: SandboxSecurityPolicyProfileManifest = {
  profile_id: "sandbox-security-strict.v1",
  normal_work_budget_ms: 5000,
  trust_rules: TRUST_RULES,
  detector_slots: makeSlots({
    localObligation: "profile_required",
    ruleQualify: 0.7,
    localQualify: 0.75,
    judgeQualify: 0.7,
    ruleFloor: 0.4,
    localFloor: 0.5,
    judgeFloor: 0.5,
    ruleShortCircuit: "medium"
  }),
  action_matrix: STRICT_MATRIX,
  reason_codes: REASON_CODES
};

assertNoDuplicateSlots(BALANCED.detector_slots);
assertNoDuplicateSlots(STRICT.detector_slots);
assertMonotonic(BALANCED, STRICT);

const PROFILES = {
  "sandbox-security-balanced.v1": deepFreeze(BALANCED),
  "sandbox-security-strict.v1": deepFreeze(STRICT)
} as const;

export function resolveSandboxSecurityProfile(
  profileId: string
): Readonly<SandboxSecurityPolicyProfileManifest> {
  if (typeof profileId !== "string") {
    throw new Error("caller-supplied profile objects are rejected");
  }
  const profile = PROFILES[profileId as keyof typeof PROFILES];
  if (!profile) {
    throw new Error(`unknown profile id: ${profileId}`);
  }
  return profile;
}

export function deriveSandboxSecurityTrustClass(input: {
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly authority_kind:
    | "platform_control"
    | "integration_observation"
    | "simulation_observation";
  readonly source_type: SandboxSecurityClaimedSourceType;
}): SandboxSecurityTrustClass {
  for (const rule of input.profile.trust_rules) {
    if (
      rule.evaluation_mode === input.evaluation_mode &&
      rule.authority_kind === input.authority_kind &&
      rule.source_types.includes(input.source_type)
    ) {
      return rule.trust_class;
    }
  }
  throw new Error("unknown trust derivation combination");
}
