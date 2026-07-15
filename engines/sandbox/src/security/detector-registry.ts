import type {
  RawLocalDetector,
  SanitizedExternalDetector
} from "./detector-contract.ts";
import {
  SandboxSecurityProfileError,
  type SandboxSecurityDetectorSlotId,
  type SandboxSecurityPolicyProfileManifest
} from "./policy-profiles.ts";

export interface SandboxSecurityDetectorRegistryInput {
  readonly rule: RawLocalDetector;
  readonly local?: RawLocalDetector;
  readonly judge?: SanitizedExternalDetector;
}

export interface SandboxSecurityDetectorRegistry {
  readonly rule: RawLocalDetector;
  readonly local?: RawLocalDetector;
  readonly judge?: SanitizedExternalDetector;
}

export interface SandboxSecurityResolvedDetectorRegistry {
  readonly rule: RawLocalDetector;
  readonly local?: RawLocalDetector;
  readonly judge?: SanitizedExternalDetector;
  readonly required_slot_ids: readonly SandboxSecurityDetectorSlotId[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertDetectorLike(value: unknown, label: string): void {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as { detect?: unknown }).detect !== "function"
  ) {
    throw new Error(`sandbox_security_detector_registry_invalid:${label}`);
  }
  // reject detector identity injection fields
  for (const key of Object.keys(value as object)) {
    if (
      key === "detector_id" ||
      key === "slot_id" ||
      key === "detector_version" ||
      key === "identity"
    ) {
      throw new Error("sandbox_security_detector_registry_invalid:identity");
    }
  }
}

export function createSandboxSecurityDetectorRegistry(
  input: Readonly<SandboxSecurityDetectorRegistryInput>
): SandboxSecurityDetectorRegistry {
  if (!isPlainRecord(input)) {
    throw new Error("sandbox_security_detector_registry_invalid:input");
  }
  const allowed = new Set(["rule", "local", "judge"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error("sandbox_security_detector_registry_invalid:unknown_key");
    }
  }
  if (!Object.hasOwn(input, "rule")) {
    throw new Error("sandbox_security_detector_registry_invalid:rule_required");
  }
  assertDetectorLike(input.rule, "rule");
  if (Object.hasOwn(input, "local")) {
    assertDetectorLike(input.local, "local");
  }
  if (Object.hasOwn(input, "judge")) {
    assertDetectorLike(input.judge, "judge");
  }

  const registry: SandboxSecurityDetectorRegistry = {
    rule: input.rule,
    ...(Object.hasOwn(input, "local") ? { local: input.local } : {}),
    ...(Object.hasOwn(input, "judge") ? { judge: input.judge } : {})
  };
  return Object.freeze(registry);
}

export function resolveSandboxSecurityDetectorsForProfile(
  registry: Readonly<SandboxSecurityDetectorRegistry>,
  profile: Readonly<SandboxSecurityPolicyProfileManifest>
): Readonly<SandboxSecurityResolvedDetectorRegistry> {
  if (!registry || typeof registry !== "object" || !registry.rule) {
    throw new Error("sandbox_security_detector_resolution_invalid:registry");
  }
  if (!profile || !Array.isArray(profile.detector_slots)) {
    throw new Error("sandbox_security_detector_resolution_invalid:profile");
  }

  const required_slot_ids: SandboxSecurityDetectorSlotId[] = [];
  let hasLocalSlot = false;
  let hasJudgeSlot = false;

  for (const slot of profile.detector_slots) {
    if (slot.base_obligation === "profile_required") {
      required_slot_ids.push(slot.slot_id);
    }
    if (slot.detector_kind === "rule") {
      if (slot.content_access !== "raw_local") {
        throw new Error("sandbox_security_detector_resolution_invalid:rule_access");
      }
      if (!slot.supported_stages.includes("user_input")) {
        throw new Error("sandbox_security_detector_resolution_invalid:rule_stage");
      }
      if (!registry.rule) {
        throw new Error("sandbox_security_detector_resolution_invalid:rule_missing");
      }
    }
    if (slot.detector_kind === "local_model") {
      hasLocalSlot = true;
      if (slot.content_access !== "raw_local") {
        throw new Error("sandbox_security_detector_resolution_invalid:local_access");
      }
      if (slot.base_obligation === "profile_required" && !registry.local) {
        // Spec: profile-required detector registration missing fails profile
        // resolution with sandbox_security_profile_invalid before decision ID.
        throw new SandboxSecurityProfileError(
          "sandbox_security_profile_invalid:local_required"
        );
      }
    }
    if (slot.detector_kind === "external_judge") {
      hasJudgeSlot = true;
      if (slot.content_access !== "sanitized_external") {
        throw new Error("sandbox_security_detector_resolution_invalid:judge_access");
      }
      // absent Judge before routing is OK
    }
  }

  // fixed slot IDs expected for rule/local/judge defaults
  const slotIds = new Set(profile.detector_slots.map((slot) => slot.slot_id));
  if (!slotIds.has("detector://sandbox/security/rule/default/v1")) {
    throw new Error("sandbox_security_detector_resolution_invalid:rule_slot");
  }
  if (hasLocalSlot && !slotIds.has("detector://sandbox/security/local/default/v1")) {
    throw new Error("sandbox_security_detector_resolution_invalid:local_slot");
  }
  if (hasJudgeSlot && !slotIds.has("detector://sandbox/security/judge/default/v1")) {
    throw new Error("sandbox_security_detector_resolution_invalid:judge_slot");
  }

  return Object.freeze({
    rule: registry.rule,
    ...(registry.local ? { local: registry.local } : {}),
    ...(registry.judge ? { judge: registry.judge } : {}),
    required_slot_ids: Object.freeze([...required_slot_ids])
  });
}
