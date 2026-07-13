import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type { SandboxSecurityReasonCode } from "../types/sandbox-security.ts";

type SandboxSecurityRuntimeModule = {
  SANDBOX_SECURITY_STAGES: readonly string[];
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES: readonly string[];
  SANDBOX_SECURITY_RISK_CATEGORIES: readonly string[];
  SANDBOX_SECURITY_POLICY_PROFILE_IDS: readonly string[];
  SANDBOX_SECURITY_SEVERITIES: readonly string[];
  SANDBOX_SECURITY_VERDICTS: readonly string[];
  SANDBOX_SECURITY_ACTIONS: readonly string[];
  SANDBOX_SECURITY_MAX_TEXT_BYTES: number;
  SANDBOX_SECURITY_MAX_REQUEST_BYTES: number;
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS: number;
  SANDBOX_SECURITY_MAX_JSON_DEPTH: number;
  SANDBOX_SECURITY_MAX_JSON_NODES: number;
};

const sandboxSecurityTypesPath = resolve(
  import.meta.dirname,
  "../types/sandbox-security.ts"
);
const sandboxSecurityTypesUrl = pathToFileURL(sandboxSecurityTypesPath).href;

const inertSandboxSecurityRuntime: SandboxSecurityRuntimeModule = {
  SANDBOX_SECURITY_STAGES: [],
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES: [],
  SANDBOX_SECURITY_RISK_CATEGORIES: [],
  SANDBOX_SECURITY_POLICY_PROFILE_IDS: [],
  SANDBOX_SECURITY_SEVERITIES: [],
  SANDBOX_SECURITY_VERDICTS: [],
  SANDBOX_SECURITY_ACTIONS: [],
  SANDBOX_SECURITY_MAX_TEXT_BYTES: 0,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES: 0,
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS: 0,
  SANDBOX_SECURITY_MAX_JSON_DEPTH: 0,
  SANDBOX_SECURITY_MAX_JSON_NODES: 0
};

async function loadSandboxSecurityRuntime(): Promise<SandboxSecurityRuntimeModule> {
  try {
    return (await import(sandboxSecurityTypesUrl)) as SandboxSecurityRuntimeModule;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      "url" in error &&
      error.url === sandboxSecurityTypesUrl
    ) {
      return inertSandboxSecurityRuntime;
    }

    throw error;
  }
}

const sandboxSecurity = await loadSandboxSecurityRuntime();

test("REQ-SBX-GENERAL-001 exports closed public security constants", () => {
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_STAGES, [
    "user_input",
    "model_output",
    "tool_request"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES, [
    "system_instruction",
    "developer_instruction",
    "user_input",
    "retrieved_content",
    "memory_content",
    "model_output"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_RISK_CATEGORIES, [
    "prompt_injection",
    "jailbreak",
    "instruction_override",
    "privilege_escalation",
    "sensitive_data_exposure",
    "tool_hijacking",
    "unsafe_side_effect",
    "memory_poisoning",
    "trust_boundary_violation"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_POLICY_PROFILE_IDS, [
    "sandbox-security-balanced.v1",
    "sandbox-security-strict.v1"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_SEVERITIES, [
    "low",
    "medium",
    "high",
    "critical"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_VERDICTS, [
    "no_detected_risk",
    "risk_detected",
    "indeterminate"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_ACTIONS, [
    "allow",
    "alert",
    "ask",
    "deny"
  ]);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_TEXT_BYTES, 128 * 1024);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_REQUEST_BYTES, 512 * 1024);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_CONTENT_ITEMS, 64);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_JSON_DEPTH, 12);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_JSON_NODES, 4096);
});

test("REQ-SBX-GENERAL-001 exports SandboxSecurityReasonCode closed catalog", () => {
  const expected = [
    "sandbox_security_prompt_injection",
    "sandbox_security_jailbreak",
    "sandbox_security_instruction_override",
    "sandbox_security_privilege_escalation",
    "sandbox_security_sensitive_data_exposure",
    "sandbox_security_tool_hijacking",
    "sandbox_security_unsafe_side_effect",
    "sandbox_security_memory_poisoning",
    "sandbox_security_trust_boundary_violation"
  ] as const satisfies readonly SandboxSecurityReasonCode[];

  type ExpectedReasonCode = (typeof expected)[number];
  type ReasonCodeCatalogIsExact =
    SandboxSecurityReasonCode extends ExpectedReasonCode
      ? ExpectedReasonCode extends SandboxSecurityReasonCode
        ? true
        : false
      : false;
  const reasonCodeCatalogIsExact: ReasonCodeCatalogIsExact = true;

  assert.equal(reasonCodeCatalogIsExact, true);
  assert.equal(expected.length, 9);
});
