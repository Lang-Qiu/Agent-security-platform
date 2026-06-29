import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type { SandboxRunResultDetails } from "../../shared/types/result.ts";
import type { SandboxBehaviorEvent } from "../../shared/types/sandbox.ts";
import type { StoredTaskRecord } from "../src/modules/task-center/repositories/task.repository.ts";
import {
  RAW_NARRATIVE_SENTINEL,
  makeStoredSandboxRecord
} from "../../tests/fixtures/track1-supervision.fixture.ts";

const projectorPath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/supervision-projector.ts"
);

type ProjectorModule = {
  projectSupervisionRecord?: (record: StoredTaskRecord) => unknown;
  ProjectedSupervisionRecord?: unknown;
};

async function loadProjector(): Promise<ProjectorModule | null> {
  if (!existsSync(projectorPath)) return null;
  return import(pathToFileURL(projectorPath).href);
}

function getSandboxDetails(record: StoredTaskRecord): SandboxRunResultDetails {
  return record.result.details as SandboxRunResultDetails;
}

test("REQ-T1-SUPERVISION-UI-009 projector module exists", () => {
  assert.equal(existsSync(projectorPath), true);
});

test("REQ-T1-SUPERVISION-UI-009 projects a normalized content-free session", async () => {
  const module = await loadProjector();
  const projected = module?.projectSupervisionRecord?.(
    makeStoredSandboxRecord({
      producerNarrative: RAW_NARRATIVE_SENTINEL
    })
  ) as {
    summary: { highest_action: string };
    detail: {
      policy_decisions: Record<string, unknown>[];
      alerts: Record<string, unknown>[];
      blocked_records: Record<string, unknown>[];
      events: Record<string, unknown>[];
    };
    evidence: unknown;
  } | null;

  assert.notEqual(projected, null);
  assert.equal(
    JSON.stringify(projected).includes(RAW_NARRATIVE_SENTINEL),
    false
  );
  assert.equal(projected!.summary.highest_action, "deny");
  assert.equal("reason" in projected!.detail.policy_decisions[0], false);
  assert.equal("title" in projected!.detail.alerts[0], false);
  assert.equal("reason" in projected!.detail.alerts[0], false);
  assert.equal("reason" in projected!.detail.blocked_records[0], false);
  assert.equal("resource_ref" in projected!.detail.blocked_records[0], false);
  assert.equal("summary" in projected!.detail.events[0], false);
});

test("REQ-T1-SUPERVISION-UI-009 projector rejects inconsistent records", async () => {
  const module = await loadProjector();
  const record = makeStoredSandboxRecord();

  assert.equal(
    module?.projectSupervisionRecord?.({
      ...record,
      task: { ...record.task, status: "running" }
    }),
    null
  );
  assert.equal(
    module?.projectSupervisionRecord?.({
      ...record,
      result: {
        ...record.result,
        details: {
          ...getSandboxDetails(record),
          session_id: ""
        }
      }
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 projector rejects non-sandbox records", async () => {
  const module = await loadProjector();
  const record = makeStoredSandboxRecord();
  const nonSandbox = {
    ...record,
    task: {
      ...record.task,
      task_type: "asset_scan" as const,
      engine_type: "asset_scan" as const
    },
    result: {
      ...record.result,
      task_type: "asset_scan" as const,
      engine_type: "asset_scan" as const
    }
  };

  assert.equal(module?.projectSupervisionRecord?.(nonSandbox), null);
});

test("REQ-T1-SUPERVISION-UI-009 projector rejects task and result ID, engine, or status mismatch", async () => {
  const module = await loadProjector();
  const record = makeStoredSandboxRecord();

  assert.equal(
    module?.projectSupervisionRecord?.({
      ...record,
      task: { ...record.task, task_id: "task:different" }
    }),
    null
  );
  assert.equal(
    module?.projectSupervisionRecord?.({
      ...record,
      result: { ...record.result, status: "finished" }
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 projector rejects invalid source timestamps", async () => {
  const module = await loadProjector();
  const record = makeStoredSandboxRecord();
  const details = getSandboxDetails(record);
  const badEvents = details.events!.map((event, index) =>
    index === 0
      ? { ...event, occurred_at: "2026-02-30T00:00:00Z" }
      : event
  );

  assert.equal(
    module?.projectSupervisionRecord?.({
      ...record,
      result: {
        ...record.result,
        details: { ...details, events: badEvents }
      }
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 projector rejects scenario or case disagreement", async () => {
  const module = await loadProjector();
  const record = makeStoredSandboxRecord();
  const details = getSandboxDetails(record);
  const conflictingEvents = details.events!.map((event, index) =>
    index === 0
      ? { ...event, scenario_id: "T1-SC-999" }
      : event
  );

  assert.equal(
    module?.projectSupervisionRecord?.({
      ...record,
      result: {
        ...record.result,
        details: { ...details, events: conflictingEvents }
      }
    }),
    null
  );
});

test("REQ-T1-SUPERVISION-UI-009 highest action is deny > ask > alert > allow", async () => {
  const module = await loadProjector();

  const denyProjected = module?.projectSupervisionRecord?.(
    makeStoredSandboxRecord({ action: "deny" })
  ) as { summary: { highest_action: string } } | null;
  assert.notEqual(denyProjected, null);
  assert.equal(denyProjected!.summary.highest_action, "deny");

  const askProjected = module?.projectSupervisionRecord?.(
    makeStoredSandboxRecord({ action: "ask" })
  ) as { summary: { highest_action: string } } | null;
  assert.notEqual(askProjected, null);
  assert.equal(askProjected!.summary.highest_action, "ask");

  const alertProjected = module?.projectSupervisionRecord?.(
    makeStoredSandboxRecord({ action: "alert" })
  ) as { summary: { highest_action: string } } | null;
  assert.notEqual(alertProjected, null);
  assert.equal(alertProjected!.summary.highest_action, "alert");

  const allowProjected = module?.projectSupervisionRecord?.(
    makeStoredSandboxRecord({ action: "allow" })
  ) as { summary: { highest_action: string } } | null;
  assert.notEqual(allowProjected, null);
  assert.equal(allowProjected!.summary.highest_action, "allow");
});

test("REQ-T1-SUPERVISION-UI-009 no-decision running session defaults to allow", async () => {
  const module = await loadProjector();
  const projected = module?.projectSupervisionRecord?.(
    makeStoredSandboxRecord({ action: "allow", status: "running" })
  ) as { summary: { highest_action: string; evidence_available: boolean }; evidence: unknown } | null;

  assert.notEqual(projected, null);
  assert.equal(projected!.summary.highest_action, "allow");
  assert.equal(projected!.summary.evidence_available, false);
  assert.equal(projected!.evidence, null);
});

test("REQ-T1-SUPERVISION-UI-009 tool names are approved, unique, and sorted", async () => {
  const module = await loadProjector();
  const record = makeStoredSandboxRecord({ toolName: "call_api" });
  const projected = module?.projectSupervisionRecord?.(record) as {
    summary: { tool_names: string[] };
  } | null;

  assert.notEqual(projected, null);
  assert.deepEqual(projected!.summary.tool_names, ["call_api"]);
});

test("REQ-T1-SUPERVISION-UI-009 outcomes are deterministically sorted", async () => {
  const module = await loadProjector();
  const record = makeStoredSandboxRecord({ action: "deny" });
  const details = getSandboxDetails(record);

  const reversedDecisions = [...details.policy_decisions!].reverse();
  const reversedAlerts = [...details.alerts!].reverse();
  const reversedBlocked = [...details.blocked_records!].reverse();

  const projected = module?.projectSupervisionRecord?.({
    ...record,
    result: {
      ...record.result,
      details: {
        ...details,
        policy_decisions: reversedDecisions,
        alerts: reversedAlerts,
        blocked_records: reversedBlocked
      }
    }
  }) as {
    detail: {
      policy_decisions: { decision_id: string }[];
      alerts: { alert_id: string }[];
      blocked_records: { blocked_record_id: string }[];
    };
  } | null;

  assert.notEqual(projected, null);
  assert.equal(
    projected!.detail.policy_decisions[0].decision_id,
    "decision:alert"
  );
  assert.equal(
    projected!.detail.policy_decisions[1].decision_id,
    "decision:deny"
  );
  assert.equal(projected!.detail.alerts[0].alert_id, "alert:001");
  assert.equal(
    projected!.detail.blocked_records[0].blocked_record_id,
    "blocked:001"
  );
});

test("REQ-T1-SUPERVISION-UI-009 counts and last_event_at are derived from source data", async () => {
  const module = await loadProjector();
  const record = makeStoredSandboxRecord({ action: "deny" });
  const projected = module?.projectSupervisionRecord?.(record) as {
    summary: {
      event_count: number;
      decision_count: number;
      alert_count: number;
      blocked_record_count: number;
      last_event_at: string;
    };
    detail: {
      events: { occurred_at: string }[];
    };
  } | null;

  assert.notEqual(projected, null);
  const details = getSandboxDetails(record);
  assert.equal(
    projected!.summary.event_count,
    details.events!.length
  );
  assert.equal(
    projected!.summary.decision_count,
    details.policy_decisions!.length
  );
  assert.equal(projected!.summary.alert_count, details.alerts!.length);
  assert.equal(
    projected!.summary.blocked_record_count,
    details.blocked_records!.length
  );
  const lastEventAt = details.events!.reduce((max, event) =>
    event.occurred_at > max ? event.occurred_at : max
  , details.events![0].occurred_at);
  assert.equal(projected!.summary.last_event_at, lastEventAt);
});

test("REQ-T1-SUPERVISION-UI-009 evidence_available is false for incomplete running data", async () => {
  const module = await loadProjector();
  const projected = module?.projectSupervisionRecord?.(
    makeStoredSandboxRecord({ action: "allow", status: "running" })
  ) as {
    summary: { evidence_available: boolean };
    evidence: unknown;
  } | null;

  assert.notEqual(projected, null);
  assert.equal(projected!.summary.evidence_available, false);
  assert.equal(projected!.evidence, null);
});

test("REQ-T1-SUPERVISION-UI-009 terminal complete data produces normalized evidence", async () => {
  const module = await loadProjector();
  const projected = module?.projectSupervisionRecord?.(
    makeStoredSandboxRecord({
      action: "deny",
      producerNarrative: RAW_NARRATIVE_SENTINEL
    })
  ) as {
    summary: { evidence_available: boolean };
    evidence: {
      schema_version: string;
      source_schema_version: string;
      session: unknown;
    } | null;
  } | null;

  assert.notEqual(projected, null);
  assert.equal(projected!.summary.evidence_available, true);
  assert.notEqual(projected!.evidence, null);
  assert.equal(projected!.evidence!.schema_version, "track1-supervision-evidence.v1");
  assert.equal(projected!.evidence!.source_schema_version, "track1-supervision-ui.v1");
  assert.equal(
    JSON.stringify(projected!.evidence).includes(RAW_NARRATIVE_SENTINEL),
    false
  );
});
