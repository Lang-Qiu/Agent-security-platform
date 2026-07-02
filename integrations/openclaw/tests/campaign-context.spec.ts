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
