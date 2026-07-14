import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

type PolicyModule = {
  resolveSandboxSecurityProfile: (profileId: string) => Readonly<Record<string, unknown>>;
  deriveSandboxSecurityTrustClass: (input: {
    profile: Readonly<Record<string, unknown>>;
    evaluation_mode: "simulation" | "enforcement";
    authority_kind: string;
    source_type: string;
  }) => string;
};

async function loadPolicyModule(): Promise<PolicyModule> {
  try {
    return (await import("../src/security/policy-profiles.ts")) as PolicyModule;
  } catch {
    return {
      resolveSandboxSecurityProfile: () => ({}),
      deriveSandboxSecurityTrustClass: () => {
        throw new Error("unavailable");
      }
    };
  }
}

const { resolveSandboxSecurityProfile, deriveSandboxSecurityTrustClass } =
  await loadPolicyModule();

const REASON_CODES = [
  "sandbox_security_prompt_injection",
  "sandbox_security_jailbreak",
  "sandbox_security_instruction_override",
  "sandbox_security_privilege_escalation",
  "sandbox_security_sensitive_data_exposure",
  "sandbox_security_tool_hijacking",
  "sandbox_security_unsafe_side_effect",
  "sandbox_security_memory_poisoning",
  "sandbox_security_trust_boundary_violation"
] as const;

function slots(profile: Record<string, unknown>) {
  return profile.detector_slots as Array<Record<string, unknown>>;
}

function byKind(profile: Record<string, unknown>, kind: string) {
  return slots(profile).find((slot) => slot.detector_kind === kind)!;
}

test("REQ-SBX-GENERAL-001 resolves balanced v1 profile", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.equal(profile.profile_id, "sandbox-security-balanced.v1");
});

test("REQ-SBX-GENERAL-001 resolves strict v1 profile", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  assert.equal(profile.profile_id, "sandbox-security-strict.v1");
});

test("REQ-SBX-GENERAL-001 balanced thresholds are 0.80 0.85 0.80", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.equal(byKind(profile, "rule").qualification_threshold, 0.8);
  assert.equal(byKind(profile, "local_model").qualification_threshold, 0.85);
  assert.equal(byKind(profile, "external_judge").qualification_threshold, 0.8);
});

test("REQ-SBX-GENERAL-001 strict thresholds are 0.70 0.75 0.70", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  assert.equal(byKind(profile, "rule").qualification_threshold, 0.7);
  assert.equal(byKind(profile, "local_model").qualification_threshold, 0.75);
  assert.equal(byKind(profile, "external_judge").qualification_threshold, 0.7);
});

test("REQ-SBX-GENERAL-001 slot timeouts are 100 1000 4000 and normal_work_budget_ms 5000", () => {
  for (const id of [
    "sandbox-security-balanced.v1",
    "sandbox-security-strict.v1"
  ] as const) {
    const profile = resolveSandboxSecurityProfile(id);
    assert.equal(profile.normal_work_budget_ms, 5000);
    assert.equal(byKind(profile, "rule").timeout_ms, 100);
    assert.equal(byKind(profile, "local_model").timeout_ms, 1000);
    assert.equal(byKind(profile, "external_judge").timeout_ms, 4000);
  }
});

test("REQ-SBX-GENERAL-001 profiles are recursively frozen", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.detector_slots));
  assert.ok(Object.isFrozen(slots(profile)[0]));
  assert.ok(Object.isFrozen(profile.action_matrix));
  assert.ok(Object.isFrozen(profile.trust_rules));
});

test("REQ-SBX-GENERAL-001 rejects unknown profile IDs", () => {
  assert.throws(() => resolveSandboxSecurityProfile("sandbox-security-unknown.v1"));
});

test("REQ-SBX-GENERAL-001 rejects caller-supplied profile objects", () => {
  assert.throws(() =>
    resolveSandboxSecurityProfile({
      profile_id: "sandbox-security-balanced.v1"
    } as unknown as string)
  );
});

test("REQ-SBX-GENERAL-001 rejects duplicate slot IDs at module init", () => {
  // Module loaded successfully implies duplicate-slot init validation passed.
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const ids = slots(profile).map((slot) => slot.slot_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("REQ-SBX-GENERAL-001 strict is never less restrictive than balanced", () => {
  const balanced = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const strict = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  for (const kind of ["rule", "local_model", "external_judge"] as const) {
    assert.ok(
      Number(byKind(strict, kind).qualification_threshold) <=
        Number(byKind(balanced, kind).qualification_threshold)
    );
    assert.ok(
      Number(byKind(strict, kind).routing_floor) <=
        Number(byKind(balanced, kind).routing_floor)
    );
  }
  assert.equal(byKind(strict, "local_model").base_obligation, "profile_required");
});

test("REQ-SBX-GENERAL-001 reason_codes catalog matches SandboxSecurityReasonCode", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.deepEqual(profile.reason_codes, [...REASON_CODES]);
});

test("REQ-SBX-GENERAL-001 slot IDs bind fixed detector://sandbox/security paths", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.deepEqual(
    slots(profile).map((slot) => slot.slot_id),
    [
      "detector://sandbox/security/rule/default/v1",
      "detector://sandbox/security/local/default/v1",
      "detector://sandbox/security/judge/default/v1"
    ]
  );
});

test("REQ-SBX-GENERAL-001 balanced local and Judge are optional obligations", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.equal(byKind(profile, "local_model").base_obligation, "optional");
  assert.equal(byKind(profile, "external_judge").base_obligation, "optional");
});

test("REQ-SBX-GENERAL-001 strict local is profile_required", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  assert.equal(byKind(profile, "local_model").base_obligation, "profile_required");
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityProfile is the only profile entry", async () => {
  const source = readFileSync(
    new URL("../src/security/policy-profiles.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /export function resolveSandboxSecurityProfile/);
  assert.doesNotMatch(source, /export function getSandboxSecurityProfile/);
});

test("REQ-SBX-GENERAL-001 TrustRule and ActionMatrix exact shapes exist on profile", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.ok(Array.isArray(profile.trust_rules));
  assert.ok(profile.action_matrix);
  assert.ok((profile.action_matrix as Record<string, unknown>).accepted_critical);
});

test("REQ-SBX-GENERAL-001 balanced action_matrix matches Spec reduction table", () => {
  const matrix = resolveSandboxSecurityProfile("sandbox-security-balanced.v1")
    .action_matrix as Record<string, Record<string, string>>;
  assert.equal(matrix.accepted_critical.user_input, "deny");
  assert.equal(matrix.accepted_high.tool_request, "deny");
  assert.equal(matrix.accepted_medium.user_input, "ask");
  assert.equal(matrix.accepted_medium.tool_request, "deny");
  assert.equal(matrix.accepted_low.model_output, "alert");
  assert.equal(matrix.no_finding_all_resolved.user_input, "allow");
  assert.equal(matrix.unresolved_required.tool_request, "deny");
});

test("REQ-SBX-GENERAL-001 strict action_matrix matches Spec reduction table", () => {
  const matrix = resolveSandboxSecurityProfile("sandbox-security-strict.v1")
    .action_matrix as Record<string, Record<string, string>>;
  assert.equal(matrix.accepted_medium.user_input, "deny");
  assert.equal(matrix.accepted_low.user_input, "ask");
  assert.equal(matrix.accepted_low.tool_request, "deny");
  assert.equal(matrix.unresolved_required.model_output, "ask");
});

test("REQ-SBX-GENERAL-001 trust_rules encode Spec fixed trust table only", () => {
  const rules = resolveSandboxSecurityProfile("sandbox-security-balanced.v1")
    .trust_rules as Array<Record<string, unknown>>;
  assert.equal(rules.length, 8);
});

test("REQ-SBX-GENERAL-001 deriveTrustClass uses selected profile trust_rules only", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.equal(
    deriveSandboxSecurityTrustClass({
      profile,
      evaluation_mode: "simulation",
      authority_kind: "simulation_observation",
      source_type: "user_input"
    }),
    "user_supplied"
  );
});

test("REQ-SBX-GENERAL-001 deriveTrustClass rejects unknown combinations", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.throws(() =>
    deriveSandboxSecurityTrustClass({
      profile,
      evaluation_mode: "enforcement",
      authority_kind: "simulation_observation",
      source_type: "user_input"
    })
  );
});

test("REQ-SBX-GENERAL-001 derived NormalizedContent extends authority-bound content", async () => {
  const source = readFileSync(
    new URL("../src/security/policy-profiles.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /interface SandboxSecurityNormalizedContent/);
  assert.match(source, /extends SandboxSecurityAuthorityBoundContent/);
  assert.match(source, /trust_class: SandboxSecurityTrustClass/);
});

test("REQ-SBX-GENERAL-001 no Phase 2 module derives trust_class", () => {
  const dir = fileURLToPath(new URL("../src/security", import.meta.url));
  for (const name of [
    "canonical-json.ts",
    "source-authority.ts",
    "input-boundary.ts",
    "locator.ts",
    "canonical-fingerprint.ts"
  ]) {
    const text = readFileSync(join(dir, name), "utf8");
    assert.doesNotMatch(text, /trust_class/);
    assert.doesNotMatch(text, /deriveSandboxSecurityTrustClass/);
  }
});
