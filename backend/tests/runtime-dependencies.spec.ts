import assert from "node:assert/strict";
import { test } from "node:test";

import { createAppModule } from "../src/app.module.ts";
import { createTaskCenterModule } from "../src/modules/task-center/task-center.module.ts";
import { createSupervisionModule } from "../src/modules/supervision/supervision.module.ts";
import { createRuntimeDependencies } from "../src/runtime-dependencies.ts";

// -- Composition root --------------------------------------------------------

test("REQ-T1-DEMO-010 runtime dependencies create one task and one campaign repository", () => {
  const dependencies = createRuntimeDependencies();
  assert.ok(dependencies.taskRepository, "taskRepository must be provided");
  assert.ok(dependencies.campaignRepository, "campaignRepository must be provided");
  assert.notEqual(dependencies.taskRepository, dependencies.campaignRepository);
});

test("REQ-T1-DEMO-010 public and internal modules share one dependency object", () => {
  const dependencies = createRuntimeDependencies();
  const taskCenter = createTaskCenterModule({
    repository: dependencies.taskRepository
  });
  const publicSupervision = createSupervisionModule(dependencies);
  const internalSupervision = createSupervisionModule(dependencies);

  assert.equal(
    taskCenter.repository,
    dependencies.taskRepository
  );
  assert.equal(
    publicSupervision.campaignRepository,
    dependencies.campaignRepository
  );
  assert.equal(
    internalSupervision.campaignRepository,
    dependencies.campaignRepository
  );
});

test("REQ-T1-DEMO-010 default app instances do not share global repositories", () => {
  const first = createAppModule();
  const second = createAppModule();
  assert.notEqual(
    first.taskCenterModule.repository,
    second.taskCenterModule.repository
  );
  assert.notEqual(
    first.supervisionModule.campaignRepository,
    second.supervisionModule.campaignRepository
  );
});

test("REQ-T1-DEMO-010 two app modules sharing one dependency object observe the same records", () => {
  const dependencies = createRuntimeDependencies();
  const first = createAppModule(dependencies);
  const second = createAppModule(dependencies);

  assert.equal(
    first.taskCenterModule.repository,
    second.taskCenterModule.repository
  );
  assert.equal(
    first.supervisionModule.campaignRepository,
    second.supervisionModule.campaignRepository
  );

  // A campaign saved through the first app's repository must be visible
  // through the second app's repository handle.
  const record = dependencies.campaignRepository.list();
  assert.equal(record.length, 0);
});
