import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { compileTrack1CasePrompt } from "../../scripts/track1/case-prompt.ts";

const CASES_ROOT = resolve(import.meta.dirname, "../../samples/track1/cases");

function readCanonicalCase(caseId: string): Uint8Array {
  const scenarioId = caseId.slice(0, caseId.indexOf("-C0"));
  const path = resolve(CASES_ROOT, scenarioId, `${caseId}.json`);
  return new Uint8Array(readFileSync(path));
}

function makeManifestEntry(caseId: string): {
  agent_id: string;
  scenario_id: string;
  case_id: string;
  case_ref: string;
  case_sha256: string;
  expected_action: string;
} {
  const table: Record<string, { agent_id: string; scenario_id: string; case_sha256: string; expected_action: string }> = {
    "T1-SC-001-C001": {
      agent_id: "agent:track1:prompt-injection",
      scenario_id: "T1-SC-001",
      case_sha256: "ff58240ac3ec34c16e3c3f1d3ffe2d182f56df8942d6eba7c8cf1d121da93c27",
      expected_action: "deny"
    },
    "T1-SC-002-C002": {
      agent_id: "agent:track1:tool-hijack",
      scenario_id: "T1-SC-002",
      case_sha256: "9c621ec7fa7385c3ba3ded37d9e4f9a4c1ea6a0f9b22f23be7a4f09d2d8eac99",
      expected_action: "ask"
    },
    "T1-SC-003-C002": {
      agent_id: "agent:track1:memory-poison",
      scenario_id: "T1-SC-003",
      case_sha256: "42d546f705958a954533556c156b1919821f7f4cc9c585ecb328dd971784e2bf",
      expected_action: "deny"
    }
  };
  const entry = table[caseId];
  if (!entry) {
    throw new Error(`unknown fixture case id: ${caseId}`);
  }
  return {
    agent_id: entry.agent_id,
    scenario_id: entry.scenario_id,
    case_id: caseId,
    case_ref: `samples/track1/cases/${entry.scenario_id}/${caseId}.json`,
    case_sha256: entry.case_sha256,
    expected_action: entry.expected_action
  };
}

function makeCasePromptInput(caseId: string): {
  manifest_entry: ReturnType<typeof makeManifestEntry>;
  canonical_case_bytes: Uint8Array;
  campaign_id: string;
  agent_id: string;
  attempt_id: string;
  attempt_index: 1 | 2;
  session_id: string;
} {
  const manifestEntry = makeManifestEntry(caseId);
  return {
    manifest_entry: manifestEntry,
    canonical_case_bytes: readCanonicalCase(caseId),
    campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
    agent_id: manifestEntry.agent_id,
    attempt_id: `attempt:${caseId.toLowerCase()}:1`,
    attempt_index: 1,
    session_id: "session:0123456789abcdef0123456789abcdef"
  };
}

// -- Step 1: oracle-isolation RED --------------------------------------------

test("REQ-T1-DEMO-010 case compiler emits input only and never the oracle", () => {
  const compiled = compileTrack1CasePrompt({
    manifest_entry: makeManifestEntry("T1-SC-002-C002"),
    canonical_case_bytes: readCanonicalCase("T1-SC-002-C002"),
    campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
    agent_id: "agent:track1:tool-hijack",
    attempt_id: "attempt:t1-sc-002-c002:1",
    attempt_index: 1,
    session_id: "session:0123456789abcdef0123456789abcdef"
  });
  const value = JSON.parse(Buffer.from(compiled.utf8).toString("utf8"));

  assert.deepEqual(Object.keys(value), [
    "agent_id",
    "attempt_id",
    "attempt_index",
    "campaign_id",
    "case_id",
    "memory_entries",
    "proposed_tool_call",
    "retrieved_content",
    "scenario_id",
    "schema_version",
    "session_id",
    "user_prompt"
  ]);
  assert.equal(JSON.stringify(value).includes("expected_outcome"), false);
  assert.equal(JSON.stringify(value).includes("policy_action"), false);
  assert.equal(
    compiled.relative_tmpfs_path,
    "/run/track1/messages/attempt-t1-sc-002-c002-1.json"
  );
});

test("REQ-T1-DEMO-010 case compiler includes full retrieved content for model evaluation", () => {
  const compiled = compileTrack1CasePrompt(makeCasePromptInput("T1-SC-002-C002"));
  const value = JSON.parse(Buffer.from(compiled.utf8).toString("utf8"));

  assert.equal(value.retrieved_content.length, 1);
  assert.equal(typeof value.retrieved_content[0].content, "string");
  assert.equal(typeof value.retrieved_content[0].content_sha256, "string");
  // Verify actual content is present (attack payload must reach model)
  assert.ok(
    value.retrieved_content[0].content.length > 0,
    "Retrieved content must include actual text"
  );
  assert.equal(value.proposed_tool_call.tool_name, "read_file");
  assert.equal(typeof value.proposed_tool_call.arguments, "string");
  // Verify tool arguments are present
  assert.ok(
    value.proposed_tool_call.arguments.length > 0,
    "Tool arguments must include actual parameters"
  );
});

test("REQ-T1-DEMO-010 case compiler includes full memory entries for model evaluation", () => {
  const compiled = compileTrack1CasePrompt(makeCasePromptInput("T1-SC-003-C002"));
  const value = JSON.parse(Buffer.from(compiled.utf8).toString("utf8"));

  assert.equal(value.memory_entries.length, 1);
  assert.equal(typeof value.memory_entries[0].content, "string");
  assert.equal(typeof value.memory_entries[0].content_sha256, "string");
  // Verify actual memory content is present (poison payload must reach model)
  assert.ok(
    value.memory_entries[0].content.length > 0,
    "Memory content must include actual text"
  );
});

// -- Step 2: hash/path/determinism RED ---------------------------------------

test("REQ-T1-DEMO-010 case compiler rejects tampered bytes and caller paths", () => {
  const bytes = readCanonicalCase("T1-SC-001-C001");
  const tampered = new Uint8Array(bytes);
  tampered[0] = tampered[0] ^ 1;
  assert.throws(
    () =>
      compileTrack1CasePrompt({
        ...makeCasePromptInput("T1-SC-001-C001"),
        canonical_case_bytes: tampered
      }),
    /track1_case_prompt_invalid/
  );
  assert.throws(
    () =>
      compileTrack1CasePrompt({
        ...makeCasePromptInput("T1-SC-001-C001"),
        output_path: "../../host.env"
      }),
    /track1_case_prompt_invalid/
  );
});

test("REQ-T1-DEMO-010 case compiler is byte deterministic", () => {
  const input = makeCasePromptInput("T1-SC-003-C002");
  assert.deepEqual(
    compileTrack1CasePrompt(input),
    compileTrack1CasePrompt(input)
  );
});

test("REQ-T1-DEMO-010 case compiler rejects a manifest entry that does not match the compiled case id", () => {
  const input = makeCasePromptInput("T1-SC-001-C001");
  assert.throws(
    () =>
      compileTrack1CasePrompt({
        ...input,
        manifest_entry: {
          ...input.manifest_entry,
          case_id: "T1-SC-001-C002"
        }
      }),
    /track1_case_prompt_invalid/
  );
});

test("REQ-T1-DEMO-010 case compiler rejects an unlisted case sha256", () => {
  const input = makeCasePromptInput("T1-SC-001-C001");
  assert.throws(
    () =>
      compileTrack1CasePrompt({
        ...input,
        manifest_entry: {
          ...input.manifest_entry,
          case_sha256: "0".repeat(64)
        }
      }),
    /track1_case_prompt_invalid/
  );
});

test("REQ-T1-DEMO-010 case compiler rejects malformed correlation identifiers", () => {
  const input = makeCasePromptInput("T1-SC-001-C001");
  assert.throws(
    () => compileTrack1CasePrompt({ ...input, campaign_id: "" }),
    /track1_case_prompt_invalid/
  );
  assert.throws(
    () => compileTrack1CasePrompt({ ...input, attempt_index: 3 }),
    /track1_case_prompt_invalid/
  );
  assert.throws(
    () => compileTrack1CasePrompt({ ...input, canonical_case_bytes: new Uint8Array() }),
    /track1_case_prompt_invalid/
  );
});
