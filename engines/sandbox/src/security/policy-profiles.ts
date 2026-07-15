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

const REASON_CODES = SANDBOX_SECURITY_RISK_CATEGORIES.map(
  (category) => `sandbox_security_${category}` as SandboxSecurityReasonCode
);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return value;
  }
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (descriptor && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }
  return value;
}

function stageActions(
  user_input: SandboxSecurityAction,
  model_output: SandboxSecurityAction,
  tool_request: SandboxSecurityAction
): SandboxSecurityActionByStage {
  return { user_input, model_output, tool_request };
}

function allStages(action: SandboxSecurityAction): SandboxSecurityActionByStage {
  return stageActions(action, action, action);
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

function makeSlots(input: {
  ruleQualify: number;
  ruleFloor: number;
  ruleShortCircuit: SandboxSecuritySeverity | null;
  localObligation: "profile_required" | "optional";
  localQualify: number;
  localFloor: number;
  judgeQualify: number;
  judgeFloor: number;
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
      qualification_threshold: input.ruleQualify,
      routing_floor: input.ruleFloor,
      routing_rule: "always",
      short_circuit_min_severity: input.ruleShortCircuit
    },
    {
      slot_id: "detector://sandbox/security/local/default/v1",
      detector_version: "1.0.0",
      detector_kind: "local_model",
      supported_stages: ALL_STAGES,
      base_obligation: input.localObligation,
      content_access: "raw_local",
      timeout_ms: 1000,
      qualification_threshold: input.localQualify,
      routing_floor: input.localFloor,
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
      qualification_threshold: input.judgeQualify,
      routing_floor: input.judgeFloor,
      routing_rule: "unresolved_escalation_signal",
      short_circuit_min_severity: null
    }
  ];
}

const BALANCED_MATRIX: SandboxSecurityActionMatrix = {
  accepted_critical: allStages("deny"),
  accepted_high: allStages("deny"),
  accepted_medium: stageActions("ask", "ask", "deny"),
  accepted_low: allStages("alert"),
  no_finding_all_resolved: allStages("allow"),
  unresolved_required: stageActions("ask", "ask", "deny")
};

const STRICT_MATRIX: SandboxSecurityActionMatrix = {
  accepted_critical: allStages("deny"),
  accepted_high: allStages("deny"),
  accepted_medium: allStages("deny"),
  accepted_low: stageActions("ask", "ask", "deny"),
  no_finding_all_resolved: allStages("allow"),
  unresolved_required: stageActions("ask", "ask", "deny")
};

function validateManifest(manifest: SandboxSecurityPolicyProfileManifest): void {
  if (manifest.normal_work_budget_ms !== 5000) {
    throw new Error("invalid normal_work_budget_ms");
  }
  const slotIds = new Set<string>();
  for (const slot of manifest.detector_slots) {
    if (slotIds.has(slot.slot_id)) {
      throw new Error(`duplicate slot id ${slot.slot_id}`);
    }
    slotIds.add(slot.slot_id);
    if (slot.routing_floor > slot.qualification_threshold) {
      throw new Error(`non-monotonic thresholds for ${slot.slot_id}`);
    }
    if (
      (slot.detector_kind === "rule" || slot.detector_kind === "local_model") &&
      slot.content_access !== "raw_local"
    ) {
      throw new Error(`access/kind mismatch for ${slot.slot_id}`);
    }
    if (
      slot.detector_kind === "external_judge" &&
      slot.content_access !== "sanitized_external"
    ) {
      throw new Error(`access/kind mismatch for ${slot.slot_id}`);
    }
    if (slot.supported_stages.length !== 3) {
      throw new Error(`unsupported stages for ${slot.slot_id}`);
    }
  }
  if (slotIds.size !== 3) {
    throw new Error("expected exactly three built-in slots");
  }
}

function actionRank(action: SandboxSecurityAction): number {
  switch (action) {
    case "allow":
      return 0;
    case "alert":
      return 1;
    case "ask":
      return 2;
    case "deny":
      return 3;
  }
}

function severityRank(value: SandboxSecuritySeverity | null): number {
  // Lower short-circuit floor is more restrictive (more severities can trip).
  switch (value) {
    case null:
      return 0;
    case "critical":
      return 1;
    case "high":
      return 2;
    case "medium":
      return 3;
    case "low":
      return 4;
  }
}

function assertStrictNotLessRestrictive(
  balanced: SandboxSecurityPolicyProfileManifest,
  strict: SandboxSecurityPolicyProfileManifest
): void {
  for (let index = 0; index < balanced.detector_slots.length; index += 1) {
    const b = balanced.detector_slots[index];
    const s = strict.detector_slots[index];
    if (s.slot_id !== b.slot_id) {
      throw new Error("slot order mismatch");
    }
    if (s.qualification_threshold > b.qualification_threshold) {
      throw new Error(`strict qualify higher than balanced for ${s.slot_id}`);
    }
    if (s.routing_floor > b.routing_floor) {
      throw new Error(`strict floor higher than balanced for ${s.slot_id}`);
    }
    if (severityRank(s.short_circuit_min_severity) < severityRank(b.short_circuit_min_severity)) {
      throw new Error(`strict short-circuit less restrictive for ${s.slot_id}`);
    }
    if (b.base_obligation === "profile_required" && s.base_obligation !== "profile_required") {
      throw new Error(`strict dropped required slot ${s.slot_id}`);
    }
  }

  const rows = [
    "accepted_critical",
    "accepted_high",
    "accepted_medium",
    "accepted_low",
    "no_finding_all_resolved",
    "unresolved_required"
  ] as const;
  for (const row of rows) {
    for (const stage of ALL_STAGES) {
      if (
        actionRank(strict.action_matrix[row][stage]) <
        actionRank(balanced.action_matrix[row][stage])
      ) {
        throw new Error(`strict action less restrictive at ${row}.${stage}`);
      }
    }
  }
}

const BALANCED: SandboxSecurityPolicyProfileManifest = {
  profile_id: "sandbox-security-balanced.v1",
  normal_work_budget_ms: 5000,
  trust_rules: TRUST_RULES,
  detector_slots: makeSlots({
    ruleQualify: 0.8,
    ruleFloor: 0.5,
    ruleShortCircuit: "high",
    localObligation: "optional",
    localQualify: 0.85,
    localFloor: 0.6,
    judgeQualify: 0.8,
    judgeFloor: 0.6
  }),
  action_matrix: BALANCED_MATRIX,
  reason_codes: REASON_CODES
};

const STRICT: SandboxSecurityPolicyProfileManifest = {
  profile_id: "sandbox-security-strict.v1",
  normal_work_budget_ms: 5000,
  trust_rules: TRUST_RULES,
  detector_slots: makeSlots({
    ruleQualify: 0.7,
    ruleFloor: 0.4,
    ruleShortCircuit: "medium",
    localObligation: "profile_required",
    localQualify: 0.75,
    localFloor: 0.5,
    judgeQualify: 0.7,
    judgeFloor: 0.5
  }),
  action_matrix: STRICT_MATRIX,
  reason_codes: REASON_CODES
};

validateManifest(BALANCED);
validateManifest(STRICT);
assertStrictNotLessRestrictive(BALANCED, STRICT);

const PROFILES = deepFreeze({
  "sandbox-security-balanced.v1": BALANCED,
  "sandbox-security-strict.v1": STRICT
}) as Readonly<
  Record<SandboxSecurityPolicyProfileId, SandboxSecurityPolicyProfileManifest>
>;

export class SandboxSecurityProfileError extends Error {
  readonly code = "sandbox_security_profile_invalid" as const;

  constructor(message = "sandbox_security_profile_invalid") {
    super(message);
    this.name = "SandboxSecurityProfileError";
  }
}

export function resolveSandboxSecurityProfile(
  profileId: string
): Readonly<SandboxSecurityPolicyProfileManifest> {
  if (typeof profileId !== "string") {
    throw new SandboxSecurityProfileError("unknown profile id");
  }
  const profile = (PROFILES as Record<string, SandboxSecurityPolicyProfileManifest | undefined>)[
    profileId
  ];
  if (!profile) {
    throw new SandboxSecurityProfileError("unknown profile id");
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
  throw new SandboxSecurityProfileError("unknown trust combination");
}
