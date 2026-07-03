import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrack1PluginContext,
  normalizeTrack1ModelInputEnvelope
} from "../src/campaign-context.ts";
import {
  makeCampaignHookContext,
  makeTrack1ModelInputEnvelope
} from "./fixtures/openclaw-plugin.fixture.ts";

// -- context normalization -------------------------------------------------

test("REQ-T1-DEMO-010 campaign context normalizes valid hook context", () => {
  const normalized = normalizeTrack1PluginContext(makeCampaignHookContext());
  assert.equal(normalized.agent_id, "agent:track1:prompt-injection");
  assert.equal(normalized.campaign_id, "campaign:t1:0123456789abcdef0123456789abcdef");
  assert.equal(normalized.attempt_index, 1);
});

test("REQ-T1-DEMO-010 campaign context rejects hook correlation drift", () => {
  for (const field of [
    "campaign_id",
    "attempt_id",
    "agent_id",
    "session_id"
  ] as const) {
    assert.throws(
      () =>
        normalizeTrack1PluginContext({
          ...makeCampaignHookContext(),
          [field]: "foreign"
        }),
      /track1_plugin_context_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 campaign context rejects malformed input", () => {
  assert.throws(
    () => normalizeTrack1PluginContext(null),
    /track1_plugin_context_invalid/
  );
  assert.throws(
    () => normalizeTrack1PluginContext({ malformed: true }),
    /track1_plugin_context_invalid/
  );
  assert.throws(
    () => normalizeTrack1PluginContext({
      ...makeCampaignHookContext(),
      attempt_index: 3
    }),
    /track1_plugin_context_invalid/
  );
});

test("REQ-T1-DEMO-010 context and envelope reject non-canonical identity mappings", () => {
  const mutations = [
    { campaign_id: "campaign:t1:not-hex" },
    { agent_id: "agent:track1:unknown" },
    { session_id: "session:short" },
    { scenario_id: "T1-SC-002" },
    { case_id: "T1-SC-001-C999" },
    { attempt_id: "attempt:t1-sc-001-c001:2" }
  ];

  for (const mutation of mutations) {
    assert.throws(
      () =>
        normalizeTrack1PluginContext({
          ...makeCampaignHookContext(),
          ...mutation
        }),
      /track1_plugin_context_invalid/
    );
    assert.throws(
      () =>
        normalizeTrack1ModelInputEnvelope({
          ...makeTrack1ModelInputEnvelope(),
          ...mutation
        }),
      /track1_model_input_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 campaign context is immutable after normalization", () => {
  const normalized = normalizeTrack1PluginContext(makeCampaignHookContext());
  assert.throws(
    () => {
      (normalized as { campaign_id: string }).campaign_id = "mutated";
    },
    TypeError
  );
});

// -- model input envelope --------------------------------------------------

test("REQ-T1-DEMO-010 model input envelope accepts valid input", () => {
  const valid = makeTrack1ModelInputEnvelope();
  const normalized = normalizeTrack1ModelInputEnvelope(valid);
  assert.ok(normalized);
  assert.equal(normalized.schema_version, "track1-openclaw-input.v1");
});

test("REQ-T1-DEMO-010 model input envelope excludes the campaign oracle", () => {
  const valid = makeTrack1ModelInputEnvelope();
  for (const field of [
    "expected_outcome",
    "expected_action",
    "policy_action",
    "report_metadata",
    "attempt_outcome"
  ]) {
    assert.throws(
      () =>
        normalizeTrack1ModelInputEnvelope({
          ...valid,
          [field]: "ORACLE_SENTINEL"
        }),
      /track1_model_input_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 model input envelope rejects extra keys", () => {
  const valid = makeTrack1ModelInputEnvelope();
  assert.throws(
    () =>
      normalizeTrack1ModelInputEnvelope({
        ...valid,
        extra_field: "SENTINEL"
      }),
    /track1_model_input_invalid/
  );
});

test("REQ-T1-DEMO-010 model input envelope rejects missing required keys", () => {
  const valid = makeTrack1ModelInputEnvelope();
  const { user_prompt: _omit, ...withoutPrompt } = valid;
  assert.throws(
    () => normalizeTrack1ModelInputEnvelope(withoutPrompt),
    /track1_model_input_invalid/
  );
});

test("REQ-T1-DEMO-010 model input envelope closes nested memory fields", () => {
  const valid = makeTrack1ModelInputEnvelope();
  const invalidEntries = [
    {
      memory_entry_id: "memory:track1:001",
      content_ref: "memory://track1/entry/001",
      content_sha256: "a".repeat(64),
      raw_content: "MEMORY_SENTINEL"
    },
    {
      memory_entry_id: "MEMORY_SENTINEL",
      content_ref: "memory://track1/entry/001",
      content_sha256: "a".repeat(64)
    },
    {
      memory_entry_id: "memory:track1:001",
      content_ref: "MEMORY_SENTINEL",
      content_sha256: "a".repeat(64)
    },
    {
      memory_entry_id: "memory:track1:001",
      content_ref: "memory://track1/entry/001",
      content_sha256: "not-a-sha256"
    }
  ];

  for (const memoryEntry of invalidEntries) {
    assert.throws(
      () =>
        normalizeTrack1ModelInputEnvelope({
          ...valid,
          memory_entries: [memoryEntry]
        }),
      /track1_model_input_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 model input envelope accepts planned synthetic memory IDs", () => {
  const normalized = normalizeTrack1ModelInputEnvelope({
    ...makeTrack1ModelInputEnvelope(),
    memory_entries: [
      {
        memory_entry_id: "memory:synthetic:001",
        content: "Synthetic attack payload for retrieval injection",
        content_sha256: "c7a621b717940ca5ddaee8740868cfc8a3abad1bb174d77ac83d9b846af7dc94"
      }
    ]
  });

  assert.equal(
    normalized.memory_entries[0]?.memory_entry_id,
    "memory:synthetic:001"
  );
});

test("REQ-T1-DEMO-010 model input envelope closes nested tool proposal fields", () => {
  const valid = makeTrack1ModelInputEnvelope();
  const invalidProposals = [
    {
      tool_name: "write_file",
      arguments: '{"path": "/etc/passwd", "content": "attack"}',
      raw_arguments: "TOOL_SENTINEL"
    },
    {
      tool_name: "write_file",
      arguments: "TOOL_SENTINEL",
      extra_field: "should_reject"
    }
  ];

  for (const proposedToolCall of invalidProposals) {
    assert.throws(
      () =>
        normalizeTrack1ModelInputEnvelope({
          ...valid,
          proposed_tool_call: proposedToolCall
        }),
      /track1_model_input_invalid/
    );
  }
});
