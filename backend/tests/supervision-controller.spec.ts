import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { InMemoryTaskRepository } from "../src/modules/task-center/repositories/in-memory-task.repository.ts";
import type { StoredTaskRecord } from "../src/modules/task-center/repositories/task.repository.ts";
import { makeStoredSandboxRecord } from "../../tests/fixtures/track1-supervision.fixture.ts";

const controllerPath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/supervision.controller.ts"
);
const modulePath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/supervision.module.ts"
);

type ModuleFactory = {
  createSupervisionModule?: (input: {
    repository: unknown;
  }) => {
    controller: {
      listSessions: (
        searchParams: URLSearchParams,
        requestId: string
      ) => {
        success: boolean;
        request_id: string;
        data: unknown;
      };
      getSessionDetail: (
        sessionId: string,
        requestId: string
      ) => {
        success: boolean;
        request_id: string;
        data: { summary: { session_id: string } };
      };
      getSessionEvidence: (
        sessionId: string,
        requestId: string
      ) => {
        success: boolean;
        request_id: string;
        data: { schema_version: string };
      };
    };
    service: {
      listSessions: (query: unknown) => {
        sessions: Array<{ session_id: string }>;
      };
    };
  };
};

async function loadControllerModule(): Promise<ModuleFactory> {
  const modules: ModuleFactory = {};
  if (existsSync(controllerPath)) {
    Object.assign(modules, await import(pathToFileURL(controllerPath).href));
  }
  if (existsSync(modulePath)) {
    Object.assign(modules, await import(pathToFileURL(modulePath).href));
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

test("REQ-T1-SUPERVISION-UI-009 controller and module files exist", () => {
  assert.equal(existsSync(controllerPath), true);
  assert.equal(existsSync(modulePath), true);
});

// -- Controller behavior ------------------------------------------------------

test("REQ-T1-SUPERVISION-UI-009 controller returns standard response shells", async () => {
  const moduleExports = await loadControllerModule();
  const createSupervisionModule = moduleExports.createSupervisionModule!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({ sessionId: "session:001" })
  ]);
  const module = createSupervisionModule({ repository });

  const list = module.controller.listSessions(
    new URLSearchParams(),
    "req:list"
  );
  const detail = module.controller.getSessionDetail(
    "session:001",
    "req:detail"
  );
  const evidence = module.controller.getSessionEvidence(
    "session:001",
    "req:evidence"
  );

  assert.equal(list.success, true);
  assert.equal(list.request_id, "req:list");
  assert.equal(detail.data.summary.session_id, "session:001");
  assert.equal(
    evidence.data.schema_version,
    "track1-supervision-evidence.v1"
  );
});

test("REQ-T1-SUPERVISION-UI-009 module reuses the injected repository", async () => {
  const moduleExports = await loadControllerModule();
  const createSupervisionModule = moduleExports.createSupervisionModule!;
  const repository = new InMemoryTaskRepository();
  const module = createSupervisionModule({ repository });

  repository.save(makeStoredSandboxRecord({ sessionId: "session:late" }));

  assert.equal(
    module.service.listSessions({}).sessions[0].session_id,
    "session:late"
  );
});

test("REQ-T1-SUPERVISION-UI-009 controller lets DomainError propagate", async () => {
  const moduleExports = await loadControllerModule();
  const createSupervisionModule = moduleExports.createSupervisionModule!;
  const repository = createRepositoryWithRecords([
    makeStoredSandboxRecord({ sessionId: "session:001" })
  ]);
  const module = createSupervisionModule({ repository });

  assert.throws(
    () =>
      module.controller.getSessionDetail("session:unknown", "req:err"),
    { code: "SUPERVISION_SESSION_NOT_FOUND" }
  );
  assert.throws(
    () =>
      module.controller.listSessions(
        new URLSearchParams("unknown=value"),
        "req:err"
      ),
    { code: "INVALID_SUPERVISION_QUERY" }
  );
});
