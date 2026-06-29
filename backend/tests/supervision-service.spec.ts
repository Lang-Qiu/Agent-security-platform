import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { InMemoryTaskRepository } from "../src/modules/task-center/repositories/in-memory-task.repository.ts";
import type { StoredTaskRecord } from "../src/modules/task-center/repositories/task.repository.ts";
import { makeStoredSandboxRecord } from "../../tests/fixtures/track1-supervision.fixture.ts";

const queryPath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/dto/supervision-query.ts"
);
const servicePath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/supervision.service.ts"
);

type QueryModule = {
  normalizeSupervisionQuery?: (searchParams: URLSearchParams) => unknown;
};
type ServiceModule = {
  SupervisionService?: new (repository: unknown) => {
    listSessions(query: unknown): {
      counts: Record<string, number>;
      matched_session_count: number;
      returned_session_count: number;
      truncated: boolean;
      sessions: Array<{ session_id: string; tool_names: unknown[] }>;
    };
    getSessionDetail(sessionId: string): {
      summary: { session_id: string };
      events: unknown[];
    };
    getSessionEvidence(sessionId: string): {
      schema_version: string;
      session: { events: unknown[] };
    };
  };
};

async function loadServiceModule(): Promise<QueryModule & ServiceModule> {
  const modules: QueryModule & ServiceModule = {};
  if (existsSync(queryPath)) {
    Object.assign(modules, await import(pathToFileURL(queryPath).href));
  }
  if (existsSync(servicePath)) {
    Object.assign(modules, await import(pathToFileURL(servicePath).href));
  }
  return modules;
}

function createRepositoryWithRecords(
  records: StoredTaskRecord[]
): InMemoryTaskRepository {
  const repository = new InMemoryTaskRepository();
  for (const record of records) {
    repository.save(record);
  }
  return repository;
}

// -- Module existence ---------------------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 query and service modules exist", () => {
  assert.equal(existsSync(queryPath), true);
  assert.equal(existsSync(servicePath), true);
});

// -- Query normalization ------------------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 validates closed list filters", async () => {
  const module = await loadServiceModule();
  const valid = new URLSearchParams(
    "q=session&status=blocked&risk_level=high&action=deny" +
      "&scenario_id=T1-SC-001&tool_name=send_email"
  );

  assert.deepEqual(module.normalizeSupervisionQuery!(valid), {
    q: "session",
    status: "blocked",
    risk_level: "high",
    action: "deny",
    scenario_id: "T1-SC-001",
    tool_name: "send_email"
  });
  assert.throws(
    () =>
      module.normalizeSupervisionQuery!(
        new URLSearchParams("status=blocked&status=running")
      ),
    { code: "INVALID_SUPERVISION_QUERY" }
  );
  assert.throws(
    () =>
      module.normalizeSupervisionQuery!(
        new URLSearchParams("unknown=value")
      ),
    { code: "INVALID_SUPERVISION_QUERY" }
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects empty overlong and control-character q", async () => {
  const module = await loadServiceModule();
  assert.throws(
    () => module.normalizeSupervisionQuery!(new URLSearchParams("q=")),
    { code: "INVALID_SUPERVISION_QUERY" }
  );
  assert.throws(
    () =>
      module.normalizeSupervisionQuery!(
        new URLSearchParams(`q=${"a".repeat(129)}`)
      ),
    { code: "INVALID_SUPERVISION_QUERY" }
  );
  assert.throws(
    () => module.normalizeSupervisionQuery!(new URLSearchParams("q=%00")),
    { code: "INVALID_SUPERVISION_QUERY" }
  );
});

test("REQ-T1-SUPERVISION-UI-009 rejects invalid enum and scenario filters", async () => {
  const module = await loadServiceModule();
  const invalidInputs = [
    "status=invalid",
    "risk_level=invalid",
    "action=invalid",
    "tool_name=invalid",
    "scenario_id=invalid",
    "scenario_id=T1-SC-01",
    "scenario_id=t1-sc-001",
    "scenario_id=T1-SC-0001"
  ];
  for (const input of invalidInputs) {
    assert.throws(
      () =>
        module.normalizeSupervisionQuery!(new URLSearchParams(input)),
      { code: "INVALID_SUPERVISION_QUERY" }
    );
  }
});

test("REQ-T1-SUPERVISION-UI-009 accepts every valid enum filter", async () => {
  const module = await loadServiceModule();
  const statuses = [
    "pending",
    "running",
    "finished",
    "failed",
    "blocked",
    "partial_success"
  ];
  const riskLevels = ["info", "low", "medium", "high", "critical"];
  const actions = ["allow", "deny", "ask", "alert"];
  const toolNames = ["send_email", "read_file", "write_file", "call_api"];

  for (const status of statuses) {
    assert.deepEqual(
      module.normalizeSupervisionQuery!(
        new URLSearchParams(`status=${status}`)
      ),
      { status }
    );
  }
  for (const risk_level of riskLevels) {
    assert.deepEqual(
      module.normalizeSupervisionQuery!(
        new URLSearchParams(`risk_level=${risk_level}`)
      ),
      { risk_level }
    );
  }
  for (const action of actions) {
    assert.deepEqual(
      module.normalizeSupervisionQuery!(
        new URLSearchParams(`action=${action}`)
      ),
      { action }
    );
  }
  for (const tool_name of toolNames) {
    assert.deepEqual(
      module.normalizeSupervisionQuery!(
        new URLSearchParams(`tool_name=${tool_name}`)
      ),
      { tool_name }
    );
  }
  assert.deepEqual(
    module.normalizeSupervisionQuery!(
      new URLSearchParams("scenario_id=T1-SC-001")
    ),
    { scenario_id: "T1-SC-001" }
  );
});

// -- Service: listSessions ----------------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 counts are global while rows are filtered", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      taskId: "task:block",
      sessionId: "session:block",
      action: "deny",
      status: "blocked"
    }),
    makeStoredSandboxRecord({
      taskId: "task:ask",
      sessionId: "session:ask",
      action: "ask",
      status: "finished"
    })
  ]);
  const service = new SupervisionService(repository);
  const overview = service.listSessions({ action: "ask" });

  assert.equal(overview.counts.observed_session_count, 2);
  assert.equal(overview.counts.blocked_session_count, 1);
  assert.deepEqual(
    overview.sessions.map((item) => item.session_id),
    ["session:ask"]
  );
});

test("REQ-T1-SUPERVISION-UI-009 applies the 100-row cap", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords(
    Array.from({ length: 101 }, (_, index) =>
      makeStoredSandboxRecord({
        taskId: `task:${index.toString().padStart(3, "0")}`,
        sessionId: `session:${index.toString().padStart(3, "0")}`,
        updatedAt: `2026-06-29T00:${Math.floor(index / 60)
          .toString()
          .padStart(2, "0")}:${(index % 60).toString().padStart(2, "0")}Z`
      })
    )
  );
  const overview = new SupervisionService(repository).listSessions({});

  assert.equal(overview.returned_session_count, 100);
  assert.equal(overview.matched_session_count, 101);
  assert.equal(overview.truncated, true);
});

test("REQ-T1-SUPERVISION-UI-009 filters scenario_id and tool_name exactly", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      taskId: "task:a",
      sessionId: "session:a",
      scenarioId: "T1-SC-001",
      toolName: "send_email"
    }),
    makeStoredSandboxRecord({
      taskId: "task:b",
      sessionId: "session:b",
      scenarioId: "T1-SC-002",
      toolName: "read_file"
    })
  ]);
  const service = new SupervisionService(repository);

  const byScenario = service.listSessions({ scenario_id: "T1-SC-001" });
  assert.deepEqual(
    byScenario.sessions.map((s) => s.session_id),
    ["session:a"]
  );

  const byTool = service.listSessions({ tool_name: "read_file" });
  assert.deepEqual(
    byTool.sessions.map((s) => s.session_id),
    ["session:b"]
  );
});

test("REQ-T1-SUPERVISION-UI-009 searches task_id and session_id case-insensitively", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      taskId: "task:MixedCase-001",
      sessionId: "session:MixedCase-001"
    })
  ]);
  const service = new SupervisionService(repository);

  assert.equal(service.listSessions({ q: "mixedcase" }).sessions.length, 1);
  assert.equal(service.listSessions({ q: "SESSION" }).sessions.length, 1);
  assert.equal(service.listSessions({ q: "nomatch" }).sessions.length, 0);
});

test("REQ-T1-SUPERVISION-UI-009 orders sessions by updated_at desc then session_id asc", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      taskId: "task:alpha",
      sessionId: "session:alpha",
      updatedAt: "2026-06-29T00:00:01Z"
    }),
    makeStoredSandboxRecord({
      taskId: "task:beta",
      sessionId: "session:beta",
      updatedAt: "2026-06-29T00:00:02Z"
    }),
    makeStoredSandboxRecord({
      taskId: "task:gamma",
      sessionId: "session:gamma",
      updatedAt: "2026-06-29T00:00:01Z"
    })
  ]);
  const overview = new SupervisionService(repository).listSessions({});

  assert.deepEqual(
    overview.sessions.map((s) => s.session_id),
    ["session:beta", "session:alpha", "session:gamma"]
  );
});

test("REQ-T1-SUPERVISION-UI-009 omits invalid projected records", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const valid = makeStoredSandboxRecord({ sessionId: "session:valid" });
  const invalid = makeStoredSandboxRecord({
    taskId: "task:invalid",
    sessionId: "session:invalid"
  });
  invalid.task.task_id = "task:mismatch";

  const repository = createRepositoryWithRecords([valid, invalid]);
  const overview = new SupervisionService(repository).listSessions({});

  assert.equal(overview.counts.observed_session_count, 1);
  assert.deepEqual(
    overview.sessions.map((s) => s.session_id),
    ["session:valid"]
  );
});

test("REQ-T1-SUPERVISION-UI-009 omits conflicting duplicate session IDs from overview and counts", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      taskId: "task:dup-a",
      sessionId: "session:dup"
    }),
    makeStoredSandboxRecord({
      taskId: "task:dup-b",
      sessionId: "session:dup"
    }),
    makeStoredSandboxRecord({
      taskId: "task:unique",
      sessionId: "session:unique"
    })
  ]);
  const overview = new SupervisionService(repository).listSessions({});

  assert.equal(overview.counts.observed_session_count, 1);
  assert.deepEqual(
    overview.sessions.map((s) => s.session_id),
    ["session:unique"]
  );
});

// -- Service: getSessionDetail ------------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 returns detail for known session", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({ sessionId: "session:001" })
  ]);
  const detail = new SupervisionService(repository).getSessionDetail(
    "session:001"
  );
  assert.equal(detail.summary.session_id, "session:001");
});

test("REQ-T1-SUPERVISION-UI-009 detail lookup throws 404 for unknown session", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({ sessionId: "session:001" })
  ]);
  assert.throws(
    () =>
      new SupervisionService(repository).getSessionDetail("session:unknown"),
    { code: "SUPERVISION_SESSION_NOT_FOUND", statusCode: 404 }
  );
});

test("REQ-T1-SUPERVISION-UI-009 detail lookup throws 409 for ambiguous session", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      taskId: "task:dup-a",
      sessionId: "session:dup"
    }),
    makeStoredSandboxRecord({
      taskId: "task:dup-b",
      sessionId: "session:dup"
    })
  ]);
  assert.throws(
    () =>
      new SupervisionService(repository).getSessionDetail("session:dup"),
    { code: "SUPERVISION_SESSION_AMBIGUOUS", statusCode: 409 }
  );
});

test("REQ-T1-SUPERVISION-UI-009 detail is a defensive normalized copy", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({ sessionId: "session:001" })
  ]);
  const service = new SupervisionService(repository);
  const first = service.getSessionDetail("session:001");
  const second = service.getSessionDetail("session:001");
  assert.notEqual(first, second);
  assert.notEqual(first.events, second.events);
  const originalLength = second.events.length;
  first.events.push(first.events[0]);
  assert.equal(second.events.length, originalLength);
});

// -- Service: getSessionEvidence ----------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 returns evidence for terminal session", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      sessionId: "session:001",
      action: "deny",
      status: "blocked"
    })
  ]);
  const evidence = new SupervisionService(repository).getSessionEvidence(
    "session:001"
  );
  assert.equal(evidence.schema_version, "track1-supervision-evidence.v1");
});

test("REQ-T1-SUPERVISION-UI-009 evidence lookup throws 404 for unknown session", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({ sessionId: "session:001" })
  ]);
  assert.throws(
    () =>
      new SupervisionService(repository).getSessionEvidence("session:unknown"),
    { code: "SUPERVISION_SESSION_NOT_FOUND", statusCode: 404 }
  );
});

test("REQ-T1-SUPERVISION-UI-009 evidence lookup throws 409 for ambiguous session", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      taskId: "task:dup-a",
      sessionId: "session:dup"
    }),
    makeStoredSandboxRecord({
      taskId: "task:dup-b",
      sessionId: "session:dup"
    })
  ]);
  assert.throws(
    () =>
      new SupervisionService(repository).getSessionEvidence("session:dup"),
    { code: "SUPERVISION_SESSION_AMBIGUOUS", statusCode: 409 }
  );
});

test("REQ-T1-SUPERVISION-UI-009 evidence lookup throws 409 for incomplete evidence", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      sessionId: "session:running",
      action: "allow",
      status: "running"
    })
  ]);
  assert.throws(
    () =>
      new SupervisionService(repository).getSessionEvidence(
        "session:running"
      ),
    { code: "SUPERVISION_EVIDENCE_NOT_AVAILABLE", statusCode: 409 }
  );
});

test("REQ-T1-SUPERVISION-UI-009 evidence is a defensive normalized copy", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({
      sessionId: "session:001",
      action: "deny",
      status: "blocked"
    })
  ]);
  const service = new SupervisionService(repository);
  const first = service.getSessionEvidence("session:001");
  const second = service.getSessionEvidence("session:001");
  assert.notEqual(first, second);
  assert.notEqual(first.session, second.session);
  assert.notEqual(first.session.events, second.session.events);
});

test("REQ-T1-SUPERVISION-UI-009 overview sessions are defensive copies", async () => {
  const module = await loadServiceModule();
  const SupervisionService = module.SupervisionService!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({ sessionId: "session:001" })
  ]);
  const service = new SupervisionService(repository);
  const first = service.listSessions({});
  const second = service.listSessions({});
  assert.notEqual(first.sessions, second.sessions);
  assert.notEqual(first.sessions[0], second.sessions[0]);
  assert.notEqual(
    first.sessions[0].tool_names,
    second.sessions[0].tool_names
  );
});
