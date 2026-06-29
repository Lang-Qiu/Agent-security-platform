import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  makeSupervisionCounts,
  makeSupervisionOverview,
  makeSupervisionSummary
} from "../../tests/fixtures/track1-supervision.fixture.ts";

const contractPath = resolve(
  import.meta.dirname,
  "../contracts/supervision.ts"
);

type ContractModule = {
  normalizeSandboxSupervisionSessionSummary?: (value: unknown) => unknown;
  normalizeSandboxSupervisionCounts?: (value: unknown) => unknown;
  normalizeSandboxSupervisionOverview?: (value: unknown) => unknown;
};

async function loadContract(): Promise<ContractModule | null> {
  if (!existsSync(contractPath)) return null;
  return import(pathToFileURL(contractPath).href);
}

test("REQ-T1-SUPERVISION-UI-009 overview contract module exists", () => {
  assert.equal(existsSync(contractPath), true);
});

test("REQ-T1-SUPERVISION-UI-009 normalizes closed session summaries", async () => {
  const module = await loadContract();
  const input = makeSupervisionSummary();
  const normalized = module?.normalizeSandboxSupervisionSessionSummary?.(input);

  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
});

test("REQ-T1-SUPERVISION-UI-009 rejects unsafe summary fields", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      raw_content: "must-not-pass"
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      tool_names: ["shell_exec"]
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      event_count: -1
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 normalizes closed counts", async () => {
  const module = await loadContract();
  const input = makeSupervisionCounts();
  const normalized = module?.normalizeSandboxSupervisionCounts?.(input);

  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
});

test("REQ-T1-SUPERVISION-UI-009 rejects counts with extra or missing keys", async () => {
  const module = await loadContract();
  const valid = makeSupervisionCounts();

  assert.equal(
    module?.normalizeSandboxSupervisionCounts?.({
      ...valid,
      extra_count: 1
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionCounts?.({
      observed_session_count: 1,
      running_session_count: 0,
      awaiting_confirmation_count: 0,
      alert_record_count: 0
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionCounts?.({
      ...valid,
      observed_session_count: -1
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 normalizes overview counts and rows", async () => {
  const module = await loadContract();
  const input = makeSupervisionOverview();
  const normalized = module?.normalizeSandboxSupervisionOverview?.(input) as any;

  assert.deepEqual(normalized, input);
  assert.equal(normalized.sessions.length, input.returned_session_count);
});

test("REQ-T1-SUPERVISION-UI-009 rejects inconsistent overview metadata", async () => {
  const module = await loadContract();
  const valid = makeSupervisionOverview();

  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.({
      ...valid,
      returned_session_count: 99
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.({
      ...valid,
      limit: 101
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.({
      ...valid,
      truncated: true,
      matched_session_count: valid.returned_session_count
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects unsorted or duplicate tool_names", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  // duplicate tool names
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      tool_names: ["send_email", "send_email"]
    }),
    null
  );

  // unsorted tool names (send_email before call_api is wrong; call_api < send_email)
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      tool_names: ["send_email", "call_api"]
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects invalid task status risk or action", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      task_status: "unknown"
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      risk_level: "unknown"
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      highest_action: "block"
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects non-boolean blocked or evidence_available", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      blocked: "true"
    }),
    null
  );
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      evidence_available: 1
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects impossible timestamps and oversized timezone offsets", async () => {
  const module = await loadContract();
  const valid = makeSupervisionSummary();

  // impossible calendar date (February 30)
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      updated_at: "2026-02-30T00:00:00Z"
    }),
    null
  );

  // timezone offset greater than +14:00
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      updated_at: "2026-06-29T00:00:00+14:30"
    }),
    null
  );

  // timezone offset greater than -14:00
  assert.equal(
    module?.normalizeSandboxSupervisionSessionSummary?.({
      ...valid,
      updated_at: "2026-06-29T00:00:00-14:30"
    }),
    null
  );

  // +14:00 is legal and must pass
  const valid14Offset = makeSupervisionSummary({
    updated_at: "2026-06-29T00:00:00+14:00",
    last_event_at: "2026-06-29T00:00:00+14:00"
  });
  assert.notEqual(
    module?.normalizeSandboxSupervisionSessionSummary?.(valid14Offset),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects overview rows not sorted by updated_at DESC session_id ASC", async () => {
  const module = await loadContract();
  const earlier = makeSupervisionSummary({
    session_id: "session:earlier",
    updated_at: "2026-06-29T00:00:01Z",
    last_event_at: "2026-06-29T00:00:01Z"
  });
  const later = makeSupervisionSummary({
    session_id: "session:later",
    updated_at: "2026-06-29T00:00:09Z",
    last_event_at: "2026-06-29T00:00:09Z"
  });

  // earlier (older) first is wrong; descending updated_at requires later first
  const unsorted = makeSupervisionOverview({
    sessions: [earlier, later],
    returned_session_count: 2,
    matched_session_count: 2,
    counts: makeSupervisionCounts({
      observed_session_count: 2,
      blocked_session_count: 2
    })
  });

  assert.equal(module?.normalizeSandboxSupervisionOverview?.(unsorted), null);

  // tie on updated_at must fall back to ascending session_id
  const tieA = makeSupervisionSummary({
    session_id: "session:zzz",
    updated_at: "2026-06-29T00:00:05Z",
    last_event_at: "2026-06-29T00:00:05Z"
  });
  const tieB = makeSupervisionSummary({
    session_id: "session:aaa",
    updated_at: "2026-06-29T00:00:05Z",
    last_event_at: "2026-06-29T00:00:05Z"
  });

  const wrongTieOrder = makeSupervisionOverview({
    sessions: [tieA, tieB],
    returned_session_count: 2,
    matched_session_count: 2,
    counts: makeSupervisionCounts({
      observed_session_count: 2,
      blocked_session_count: 2
    })
  });

  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.(wrongTieOrder),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects returned_session_count exceeding 100", async () => {
  const module = await loadContract();
  const valid = makeSupervisionOverview();

  assert.equal(
    module?.normalizeSandboxSupervisionOverview?.({
      ...valid,
      returned_session_count: 101,
      matched_session_count: 101,
      truncated: true
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 normalized arrays are defensive copies", async () => {
  const module = await loadContract() as any;

  // Summary: mutating input tool_names must not affect normalized copy
  const summaryInput = makeSupervisionSummary();
  const summaryNormalized = module.normalizeSandboxSupervisionSessionSummary(summaryInput);
  summaryInput.tool_names.push("read_file");
  assert.deepEqual(summaryNormalized.tool_names, ["send_email"]);

  // Overview: mutating input sessions/counts must not affect normalized copy
  const overviewInput = makeSupervisionOverview();
  const overviewNormalized = module.normalizeSandboxSupervisionOverview(overviewInput);
  overviewInput.sessions.push(
    makeSupervisionSummary({ session_id: "session:other" })
  );
  overviewInput.counts.observed_session_count = 99;
  overviewInput.sessions[0].tool_names.push("read_file");
  assert.equal(overviewNormalized.sessions.length, 1);
  assert.equal(overviewNormalized.counts.observed_session_count, 1);
  assert.deepEqual(overviewNormalized.sessions[0].tool_names, ["send_email"]);
});
