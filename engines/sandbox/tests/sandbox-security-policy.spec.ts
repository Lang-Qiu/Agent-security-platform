import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  SANDBOX_SECURITY_RISK_CATEGORIES
} from "../../../shared/types/sandbox-security.ts";

type PolicyModule = {
  resolveSandboxSecurityProfile: (profileId: string) => Readonly<Record<string, unknown>>;
  deriveSandboxSecurityTrustClass: (input: {
    profile: Readonly<Record<string, unknown>>;
    evaluation_mode: "simulation" | "enforcement";
    authority_kind: string;
    source_type: string;
  }) => string;
};

const modulePath = fileURLToPath(
  new URL("../src/security/policy-profiles.ts", import.meta.url)
);

async function loadPolicyModule(): Promise<PolicyModule> {
  if (!existsSync(modulePath)) {
    return {
      resolveSandboxSecurityProfile: () => ({}),
      deriveSandboxSecurityTrustClass: () => {
        throw new Error("unavailable");
      }
    };
  }
  return (await import("../src/security/policy-profiles.ts")) as unknown as PolicyModule;
}

const { resolveSandboxSecurityProfile, deriveSandboxSecurityTrustClass } =
  await loadPolicyModule();

const REASON_CODES = SANDBOX_SECURITY_RISK_CATEGORIES.map(
  (category) => `sandbox_security_${category}`
);

const SLOT_RULE = "detector://sandbox/security/rule/default/v1";
const SLOT_LOCAL = "detector://sandbox/security/local/default/v1";
const SLOT_JUDGE = "detector://sandbox/security/judge/default/v1";

function asSlots(profile: Readonly<Record<string, unknown>>) {
  return profile.detector_slots as Array<Record<string, unknown>>;
}

function slotById(profile: Readonly<Record<string, unknown>>, slotId: string) {
  const slot = asSlots(profile).find((item) => item.slot_id === slotId);
  assert.ok(slot, `missing slot ${slotId}`);
  return slot;
}

function actionRank(action: unknown): number {
  switch (action) {
    case "allow":
      return 0;
    case "alert":
      return 1;
    case "ask":
      return 2;
    case "deny":
      return 3;
    default:
      return -1;
  }
}

function severityRank(value: unknown): number {
  // Lower short-circuit floor is more restrictive.
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
    default:
      return -1;
  }
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
  assert.equal(slotById(profile, SLOT_RULE).qualification_threshold, 0.8);
  assert.equal(slotById(profile, SLOT_LOCAL).qualification_threshold, 0.85);
  assert.equal(slotById(profile, SLOT_JUDGE).qualification_threshold, 0.8);
  assert.equal(slotById(profile, SLOT_RULE).routing_floor, 0.5);
  assert.equal(slotById(profile, SLOT_LOCAL).routing_floor, 0.6);
  assert.equal(slotById(profile, SLOT_JUDGE).routing_floor, 0.6);
});

test("REQ-SBX-GENERAL-001 strict thresholds are 0.70 0.75 0.70", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  assert.equal(slotById(profile, SLOT_RULE).qualification_threshold, 0.7);
  assert.equal(slotById(profile, SLOT_LOCAL).qualification_threshold, 0.75);
  assert.equal(slotById(profile, SLOT_JUDGE).qualification_threshold, 0.7);
  assert.equal(slotById(profile, SLOT_RULE).routing_floor, 0.4);
  assert.equal(slotById(profile, SLOT_LOCAL).routing_floor, 0.5);
  assert.equal(slotById(profile, SLOT_JUDGE).routing_floor, 0.5);
});

test("REQ-SBX-GENERAL-001 slot timeouts are 100 1000 4000 and normal_work_budget_ms 5000", () => {
  for (const profileId of [
    "sandbox-security-balanced.v1",
    "sandbox-security-strict.v1"
  ]) {
    const profile = resolveSandboxSecurityProfile(profileId);
    assert.equal(profile.normal_work_budget_ms, 5000);
    assert.equal(slotById(profile, SLOT_RULE).timeout_ms, 100);
    assert.equal(slotById(profile, SLOT_LOCAL).timeout_ms, 1000);
    assert.equal(slotById(profile, SLOT_JUDGE).timeout_ms, 4000);
  }
});

test("REQ-SBX-GENERAL-001 profiles are recursively frozen", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.detector_slots));
  assert.ok(Object.isFrozen(asSlots(profile)[0]));
  assert.ok(Object.isFrozen(profile.trust_rules));
  assert.ok(Object.isFrozen(profile.action_matrix));
  assert.ok(Object.isFrozen(profile.reason_codes));
});

test("REQ-SBX-GENERAL-001 rejects unknown profile IDs", () => {
  assert.throws(() => resolveSandboxSecurityProfile("sandbox-security-unknown.v1"));
  assert.throws(() => resolveSandboxSecurityProfile(""));
});

test("REQ-SBX-GENERAL-001 rejects caller-supplied profile objects", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.doesNotMatch(source, /function resolveSandboxSecurityProfile\([^)]*profile\s*:/);
  assert.match(source, /export function resolveSandboxSecurityProfile\(\s*profileId: string/);
  assert.throws(() => resolveSandboxSecurityProfile({ profile_id: "x" } as never));
  assert.throws(() => resolveSandboxSecurityProfile({} as never));
});

test("REQ-SBX-GENERAL-001 rejects duplicate slot IDs at module init", () => {
  // Module loaded successfully only if init validation passed without duplicates.
  const balanced = asSlots(resolveSandboxSecurityProfile("sandbox-security-balanced.v1"));
  const ids = balanced.map((slot) => slot.slot_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("REQ-SBX-GENERAL-001 strict is never less restrictive than balanced", () => {
  const balanced = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const strict = resolveSandboxSecurityProfile("sandbox-security-strict.v1");

  for (const slotId of [SLOT_RULE, SLOT_LOCAL, SLOT_JUDGE]) {
    const b = slotById(balanced, slotId);
    const s = slotById(strict, slotId);
    assert.ok(
      (s.qualification_threshold as number) <= (b.qualification_threshold as number)
    );
    assert.ok((s.routing_floor as number) <= (b.routing_floor as number));
    assert.ok(
      severityRank(s.short_circuit_min_severity) >=
        severityRank(b.short_circuit_min_severity)
    );
  }

  assert.equal(slotById(balanced, SLOT_LOCAL).base_obligation, "optional");
  assert.equal(slotById(strict, SLOT_LOCAL).base_obligation, "profile_required");

  const stages = ["user_input", "model_output", "tool_request"] as const;
  const rows = [
    "accepted_critical",
    "accepted_high",
    "accepted_medium",
    "accepted_low",
    "no_finding_all_resolved",
    "unresolved_required"
  ] as const;
  for (const row of rows) {
    for (const stage of stages) {
      const bAction = (balanced.action_matrix as any)[row][stage];
      const sAction = (strict.action_matrix as any)[row][stage];
      assert.ok(actionRank(sAction) >= actionRank(bAction), `${row}.${stage}`);
    }
  }
});

test("REQ-SBX-GENERAL-001 reason_codes catalog matches SandboxSecurityReasonCode", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.deepEqual([...(profile.reason_codes as string[])].sort(), [...REASON_CODES].sort());
});

test("REQ-SBX-GENERAL-001 slot IDs bind fixed detector://sandbox/security paths", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const ids = asSlots(profile).map((slot) => slot.slot_id);
  assert.deepEqual(ids, [SLOT_RULE, SLOT_LOCAL, SLOT_JUDGE]);
  assert.equal(slotById(profile, SLOT_RULE).detector_kind, "rule");
  assert.equal(slotById(profile, SLOT_LOCAL).detector_kind, "local_model");
  assert.equal(slotById(profile, SLOT_JUDGE).detector_kind, "external_judge");
  assert.equal(slotById(profile, SLOT_RULE).detector_version, "1.0.0");
  assert.equal(slotById(profile, SLOT_LOCAL).detector_version, "1.0.0");
  assert.equal(slotById(profile, SLOT_JUDGE).detector_version, "1.0.0");
});

test("REQ-SBX-GENERAL-001 balanced local and Judge are optional obligations", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.equal(slotById(profile, SLOT_RULE).base_obligation, "profile_required");
  assert.equal(slotById(profile, SLOT_LOCAL).base_obligation, "optional");
  assert.equal(slotById(profile, SLOT_JUDGE).base_obligation, "optional");
});

test("REQ-SBX-GENERAL-001 strict local is profile_required", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  assert.equal(slotById(profile, SLOT_RULE).base_obligation, "profile_required");
  assert.equal(slotById(profile, SLOT_LOCAL).base_obligation, "profile_required");
  assert.equal(slotById(profile, SLOT_JUDGE).base_obligation, "optional");
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityProfile is the only profile entry", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.match(source, /export function resolveSandboxSecurityProfile/);
  assert.doesNotMatch(source, /export function getSandboxSecurityProfile/);
  assert.doesNotMatch(source, /export function loadSandboxSecurityProfile/);
});

test("REQ-SBX-GENERAL-001 TrustRule and ActionMatrix exact shapes exist on profile", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const trustRule = (profile.trust_rules as Array<Record<string, unknown>>)[0];
  assert.deepEqual(
    Object.keys(trustRule).sort(),
    ["authority_kind", "evaluation_mode", "source_types", "trust_class"].sort()
  );
  const matrix = profile.action_matrix as Record<string, Record<string, string>>;
  assert.deepEqual(
    Object.keys(matrix).sort(),
    [
      "accepted_critical",
      "accepted_high",
      "accepted_low",
      "accepted_medium",
      "no_finding_all_resolved",
      "unresolved_required"
    ].sort()
  );
  assert.deepEqual(
    Object.keys(matrix.accepted_critical).sort(),
    ["model_output", "tool_request", "user_input"].sort()
  );
});

test("REQ-SBX-GENERAL-001 balanced action_matrix matches Spec reduction table", () => {
  const matrix = resolveSandboxSecurityProfile("sandbox-security-balanced.v1")
    .action_matrix as any;
  assert.deepEqual(matrix.accepted_critical, {
    user_input: "deny",
    model_output: "deny",
    tool_request: "deny"
  });
  assert.deepEqual(matrix.accepted_high, {
    user_input: "deny",
    model_output: "deny",
    tool_request: "deny"
  });
  assert.deepEqual(matrix.accepted_medium, {
    user_input: "ask",
    model_output: "ask",
    tool_request: "deny"
  });
  assert.deepEqual(matrix.accepted_low, {
    user_input: "alert",
    model_output: "alert",
    tool_request: "alert"
  });
  assert.deepEqual(matrix.no_finding_all_resolved, {
    user_input: "allow",
    model_output: "allow",
    tool_request: "allow"
  });
  assert.deepEqual(matrix.unresolved_required, {
    user_input: "ask",
    model_output: "ask",
    tool_request: "deny"
  });
});

test("REQ-SBX-GENERAL-001 strict action_matrix matches Spec reduction table", () => {
  const matrix = resolveSandboxSecurityProfile("sandbox-security-strict.v1")
    .action_matrix as any;
  assert.deepEqual(matrix.accepted_critical, {
    user_input: "deny",
    model_output: "deny",
    tool_request: "deny"
  });
  assert.deepEqual(matrix.accepted_high, {
    user_input: "deny",
    model_output: "deny",
    tool_request: "deny"
  });
  assert.deepEqual(matrix.accepted_medium, {
    user_input: "deny",
    model_output: "deny",
    tool_request: "deny"
  });
  assert.deepEqual(matrix.accepted_low, {
    user_input: "ask",
    model_output: "ask",
    tool_request: "deny"
  });
  assert.deepEqual(matrix.no_finding_all_resolved, {
    user_input: "allow",
    model_output: "allow",
    tool_request: "allow"
  });
  assert.deepEqual(matrix.unresolved_required, {
    user_input: "ask",
    model_output: "ask",
    tool_request: "deny"
  });
});

test("REQ-SBX-GENERAL-001 trust_rules encode Spec fixed trust table only", () => {
  const rules = resolveSandboxSecurityProfile("sandbox-security-balanced.v1")
    .trust_rules as Array<Record<string, unknown>>;
  assert.equal(rules.length, 8);
  const serialized = rules.map((rule) =>
    JSON.stringify({
      evaluation_mode: rule.evaluation_mode,
      authority_kind: rule.authority_kind,
      source_types: rule.source_types,
      trust_class: rule.trust_class
    })
  );
  for (const expected of [
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
  ]) {
    assert.ok(serialized.includes(JSON.stringify(expected)));
  }
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
  assert.equal(
    deriveSandboxSecurityTrustClass({
      profile,
      evaluation_mode: "enforcement",
      authority_kind: "platform_control",
      source_type: "system_instruction"
    }),
    "control"
  );
  assert.equal(
    deriveSandboxSecurityTrustClass({
      profile,
      evaluation_mode: "enforcement",
      authority_kind: "integration_observation",
      source_type: "model_output"
    }),
    "generated_untrusted"
  );
});

test("REQ-SBX-GENERAL-001 deriveTrustClass rejects unknown combinations", () => {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  assert.throws(() =>
    deriveSandboxSecurityTrustClass({
      profile,
      evaluation_mode: "simulation",
      authority_kind: "platform_control",
      source_type: "user_input"
    })
  );
  assert.throws(() =>
    deriveSandboxSecurityTrustClass({
      profile,
      evaluation_mode: "enforcement",
      authority_kind: "simulation_observation",
      source_type: "user_input"
    })
  );
});

test("REQ-SBX-GENERAL-001 derived NormalizedContent extends authority-bound content", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.match(source, /export interface SandboxSecurityNormalizedContent/);
  assert.match(source, /extends SandboxSecurityAuthorityBoundContent/);
  assert.match(source, /readonly trust_class: SandboxSecurityTrustClass/);
});

test("REQ-SBX-GENERAL-001 no Phase 2 module derives trust_class", () => {
  const securityDir = fileURLToPath(new URL("../src/security", import.meta.url));
  const phase2Files = [
    "canonical-json.ts",
    "source-authority.ts",
    "input-boundary.ts",
    "locator.ts",
    "canonical-fingerprint.ts"
  ];
  for (const fileName of phase2Files) {
    const source = readFileSync(join(securityDir, fileName), "utf8");
    assert.doesNotMatch(source, /trust_class\s*:/);
    assert.doesNotMatch(source, /deriveSandboxSecurityTrustClass/);
    assert.doesNotMatch(source, /SandboxSecurityTrustClass/);
  }
  // directory scan safety: policy-profiles is the only current producer
  for (const entry of readdirSync(securityDir)) {
    if (!entry.endsWith(".ts") || entry === "policy-profiles.ts") continue;
    const source = readFileSync(join(securityDir, entry), "utf8");
    assert.doesNotMatch(source, /deriveSandboxSecurityTrustClass/);
  }
});



test("REQ-SBX-GENERAL-001 production security tree has no network fs process model console", () => {
  const dir = new URL("../src/security/", import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
  for (const name of files) {
    const source = readFileSync(new URL(name, dir), "utf8");
    assert.doesNotMatch(source, /\bfrom ["']node:(net|http|https|fs|child_process)["']/);
    assert.doesNotMatch(source, /\bprocess\.env\b/);
    assert.doesNotMatch(source, /\bconsole\.(log|error|info|warn)\b/);
    assert.doesNotMatch(source, /\bopenai\b|\banthropic\b|\bfetch\(/i);
  }
});

test("REQ-SBX-GENERAL-001 production security tree has no detector-pipeline module", () => {
  assert.equal(
    existsSync(new URL("../src/security/detector-pipeline.ts", import.meta.url)),
    false
  );
});

test("REQ-SBX-GENERAL-001 detector-registry is sole owner of registry construction APIs", () => {
  const dir = new URL("../src/security/", import.meta.url);
  const owners = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
    const source = readFileSync(new URL(name, dir), "utf8");
    if (source.includes("export function createSandboxSecurityDetectorRegistry")) {
      owners.push(name);
    }
  }
  assert.deepEqual(owners, ["detector-registry.ts"]);
});

test("REQ-SBX-GENERAL-001 phase 3 production files have unique ownership", () => {
  const expected = [
    "detector-contract.ts",
    "detector-output-boundary.ts",
    "detector-registry.ts",
    "policy-profiles.ts",
    "sanitized-boundary.ts",
    "subject-scope.ts"
  ];
  const dir = new URL("../src/security/", import.meta.url);
  const names = readdirSync(dir).filter((n) => n.endsWith(".ts")).sort();
  for (const file of expected) {
    assert.ok(names.includes(file), file);
  }
});

