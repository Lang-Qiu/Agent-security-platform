import assert from "node:assert/strict";
import { test } from "node:test";

import { createAppModule } from "../src/app.module.ts";
import { createTaskCenterModule } from "../src/modules/task-center/task-center.module.ts";
import { createSupervisionModule } from "../src/modules/supervision/supervision.module.ts";
import { createRuntimeDependencies } from "../src/runtime-dependencies.ts";
import {
  createSandboxSecurityNodeRuntimePort,
  loadSandboxSecurityConfiguration
} from "../src/modules/sandbox-security/sandbox-security.config.ts";

const VALID_DEPLOYMENT_HMAC_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "ascii"
).toString("base64url");
const VALID_ADMIN_TOKEN = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "ascii"
).toString("base64url");
const VALID_ENVIRONMENT = Object.freeze({
  SANDBOX_SECURITY_STORAGE_PATH: "/tmp/sandbox-security.sqlite",
  SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY: VALID_DEPLOYMENT_HMAC_KEY,
  SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN: VALID_ADMIN_TOKEN,
  SANDBOX_SECURITY_PRODUCTION_MODE: "rule_only"
});

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

test("REQ-SBX-GENERAL-003 configuration requires all four production values", () => {
  assert.throws(
    () => loadSandboxSecurityConfiguration({}),
    /SANDBOX_SECURITY_CONFIGURATION_INVALID/
  );
});

test("REQ-SBX-GENERAL-003 configuration accepts only canonical 32-byte credentials", () => {
  const configuration = loadSandboxSecurityConfiguration(VALID_ENVIRONMENT);
  assert.equal(configuration.storage_path, VALID_ENVIRONMENT.SANDBOX_SECURITY_STORAGE_PATH);
  assert.equal(configuration.admin_bootstrap_token, VALID_ADMIN_TOKEN);
  assert.deepEqual(
    [...configuration.deployment_hmac_key],
    [...Buffer.from("0123456789abcdef0123456789abcdef", "ascii")]
  );
  assert.equal(Object.isFrozen(configuration), true);
  configuration.deployment_hmac_key[0] = 0xff;
  const secondLoad = loadSandboxSecurityConfiguration(VALID_ENVIRONMENT);
  assert.equal(secondLoad.deployment_hmac_key[0], 0x30);

  for (const [name, value] of [
    ["SANDBOX_SECURITY_STORAGE_PATH", "relative/sandbox.sqlite"],
    ["SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY", `${VALID_DEPLOYMENT_HMAC_KEY}=`],
    ["SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY", Buffer.from("short", "ascii").toString("base64url")],
    ["SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN", "too-short"],
    ["SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN", `${VALID_ADMIN_TOKEN}=`],
    ["SANDBOX_SECURITY_PRODUCTION_MODE", "unsupported"]
  ] as const) {
    assert.throws(
      () => loadSandboxSecurityConfiguration({ ...VALID_ENVIRONMENT, [name]: value }),
      /SANDBOX_SECURITY_CONFIGURATION_INVALID/
    );
  }
});

test("REQ-SBX-GENERAL-003 node runtime provides UTC monotonic and defensive random semantics", () => {
  const runtime = createSandboxSecurityNodeRuntimePort();
  assert.match(runtime.now(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(Number.isFinite(runtime.monotonicNowMs()), true);
  const bytes = runtime.randomBytes(32);
  assert.equal(bytes.byteLength, 32);
  const copy = new Uint8Array(bytes);
  bytes.fill(0);
  assert.notDeepEqual([...runtime.randomBytes(32)], [...bytes]);
  assert.notEqual(runtime.nextCapabilityId(), runtime.nextCapabilityId());
  assert.match(runtime.nextCapabilityId(), /^capability:[0-9a-f-]{36}$/);
  assert.match(runtime.nextAuditEventId(), /^audit:[0-9a-f-]{36}$/);
  assert.match(runtime.nextDecisionId(), /^decision:[0-9a-f-]{36}$/);
  assert.deepEqual([...copy].length, 32);
});

test("REQ-SBX-GENERAL-003 node runtime timeout and interval cancel exactly once", async () => {
  const runtime = createSandboxSecurityNodeRuntimePort();
  let timeoutCalls = 0;
  const cancelTimeout = runtime.scheduleTimeout(1, () => {
    timeoutCalls += 1;
  });
  cancelTimeout();
  cancelTimeout();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(timeoutCalls, 0);

  let intervalCalls = 0;
  const interval = runtime.scheduleInterval(1, () => {
    intervalCalls += 1;
  });
  assert.equal(typeof interval.unref, "function");
  interval.unref();
  interval.cancel();
  interval.cancel();
  const before = intervalCalls;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(intervalCalls, before);
});
