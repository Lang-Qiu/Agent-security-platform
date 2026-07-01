import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { InMemoryCampaignRepository } from "../src/modules/supervision/repositories/in-memory-campaign.repository.ts";
import {
  makeCampaignEvidenceRegistration,
  makeCampaignFinalizeEnvelope,
  makeCampaignSnapshot,
  makeCampaignStartEnvelope,
  FIXED_CAMPAIGN_ID
} from "./fixtures/track1-campaign.fixture.ts";

const controllerPath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/campaign-ingest.controller.ts"
);
const authPath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/campaign-ingest-auth.ts"
);

type ServiceModule = {
  CampaignIngestService: new (repository: unknown) => {
    startCampaign(input: unknown): unknown;
    ingestSnapshot(input: unknown): unknown;
    finalizeCampaign(input: unknown): unknown;
    registerEvidence(input: unknown): unknown;
    getStoredCampaign(campaignId: string): unknown;
  };
};

type ControllerModule = {
  CampaignIngestController: new (
    service: unknown,
    expectedToken: string
  ) => {
    startCampaign(authorization: string | undefined, input: unknown): unknown;
    ingestSnapshot(authorization: string | undefined, input: unknown): unknown;
    finalizeCampaign(authorization: string | undefined, input: unknown): unknown;
    registerEvidence(authorization: string | undefined, input: unknown): unknown;
  };
};

type AuthModule = {
  authorizeCampaignIngest: (
    authorization: string | undefined,
    expectedToken: string
  ) => void;
};

async function loadServiceModule(): Promise<ServiceModule> {
  const module = await import(
    pathToFileURL(
      resolve(import.meta.dirname, "../src/modules/supervision/campaign-ingest.service.ts")
    ).href
  );
  return module as unknown as ServiceModule;
}

async function loadControllerModule(): Promise<ControllerModule> {
  if (!existsSync(controllerPath)) {
    throw new Error(`Controller module not found at ${controllerPath}`);
  }
  if (!existsSync(authPath)) {
    throw new Error(`Auth module not found at ${authPath}`);
  }
  const module = await import(pathToFileURL(controllerPath).href);
  if (typeof module.CampaignIngestController !== "function") {
    throw new Error("CampaignIngestController export not found");
  }
  return module as unknown as ControllerModule;
}

async function loadAuthModule(): Promise<AuthModule> {
  if (!existsSync(authPath)) {
    throw new Error(`Auth module not found at ${authPath}`);
  }
  const module = await import(pathToFileURL(authPath).href);
  if (typeof module.authorizeCampaignIngest !== "function") {
    throw new Error("authorizeCampaignIngest export not found");
  }
  return module as unknown as AuthModule;
}

const VALID_TOKEN = "a".repeat(32);
const VALID_AUTH = `Bearer ${VALID_TOKEN}`;

async function makeControllerWithService(): Promise<{
  controller: ControllerModule["CampaignIngestController"]["prototype"];
  service: ServiceModule["CampaignIngestService"]["prototype"];
}> {
  const { CampaignIngestService } = await loadServiceModule();
  const { CampaignIngestController } = await loadControllerModule();
  const repository = new InMemoryCampaignRepository();
  const service = new CampaignIngestService(repository);
  const controller = new CampaignIngestController(service, VALID_TOKEN);
  return { controller, service };
}

// Recording service for delegation tests.
function makeRecordingService(): {
  service: Record<string, unknown>;
  calls: string[];
} {
  const calls: string[] = [];
  const service = {
    startCampaign(input: unknown): unknown {
      calls.push("start");
      return { status: "created", campaign_id: FIXED_CAMPAIGN_ID };
    },
    ingestSnapshot(input: unknown): unknown {
      calls.push("snapshot");
      return { attempt_index: 1, status: "passed" };
    },
    finalizeCampaign(input: unknown): unknown {
      calls.push("finalize");
      return { status: "completed" };
    },
    registerEvidence(input: unknown): unknown {
      calls.push("evidence");
      return { status: "completed" };
    },
    getStoredCampaign(id: string): unknown {
      return null;
    }
  };
  return { service, calls };
}

async function makeRecordingController(): Promise<{
  controller: ControllerModule["CampaignIngestController"]["prototype"];
  serviceCalls: string[];
}> {
  const { CampaignIngestController } = await loadControllerModule();
  const { service, calls } = makeRecordingService();
  const controller = new CampaignIngestController(service, VALID_TOKEN);
  return { controller, serviceCalls: calls };
}

// -- Module existence ---------------------------------------------------------

test("REQ-T1-DEMO-010 campaign ingest controller module exists", () => {
  assert.equal(existsSync(controllerPath), true);
});

test("REQ-T1-DEMO-010 campaign ingest auth module exists", () => {
  assert.equal(existsSync(authPath), true);
});

// -- Auth: bearer token required ----------------------------------------------

test("REQ-T1-DEMO-010 internal ingest requires a bearer token", async () => {
  const { controller } = await makeControllerWithService();
  assert.throws(
    () => controller.startCampaign(undefined, makeCampaignStartEnvelope()),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "DomainError" &&
      (error as { code: string }).code === "CAMPAIGN_INGEST_UNAUTHORIZED" &&
      (error as { statusCode: number }).statusCode === 401
  );
});

test("REQ-T1-DEMO-010 internal ingest rejects empty authorization", async () => {
  const { controller } = await makeControllerWithService();
  assert.throws(
    () => controller.startCampaign("", makeCampaignStartEnvelope()),
    (error: unknown) =>
      (error as { code: string }).code === "CAMPAIGN_INGEST_UNAUTHORIZED"
  );
});

test("REQ-T1-DEMO-010 internal ingest rejects non-bearer authorization", async () => {
  const { controller } = await makeControllerWithService();
  assert.throws(
    () => controller.startCampaign(VALID_TOKEN, makeCampaignStartEnvelope()),
    (error: unknown) =>
      (error as { code: string }).code === "CAMPAIGN_INGEST_UNAUTHORIZED"
  );
});

test("REQ-T1-DEMO-010 internal ingest rejects wrong token", async () => {
  const { controller } = await makeControllerWithService();
  assert.throws(
    () =>
      controller.startCampaign(
        `Bearer ${"b".repeat(32)}`,
        makeCampaignStartEnvelope()
      ),
    (error: unknown) =>
      (error as { code: string }).code === "CAMPAIGN_INGEST_UNAUTHORIZED"
  );
});

// -- Auth: token never leaked -------------------------------------------------

test("REQ-T1-DEMO-010 invalid token response never contains the token", async () => {
  const sentinel = "INGEST_TOKEN_SENTINEL_1234567890";
  const { CampaignIngestController } = await loadControllerModule();
  const { service } = makeRecordingService();
  const controller = new CampaignIngestController(service, VALID_TOKEN);
  let serialized = "";
  try {
    controller.startCampaign(`Bearer ${sentinel}`, makeCampaignStartEnvelope());
  } catch (error) {
    serialized = JSON.stringify(error);
  }
  assert.ok(
    !serialized.includes(sentinel),
    "Error response must not contain the supplied token"
  );
});

test("REQ-T1-DEMO-010 auth error never contains the expected token", async () => {
  const { controller } = await makeControllerWithService();
  let serialized = "";
  try {
    controller.startCampaign("Bearer wrong", makeCampaignStartEnvelope());
  } catch (error) {
    serialized = JSON.stringify(error);
  }
  assert.ok(
    !serialized.includes(VALID_TOKEN),
    "Error response must not contain the expected token"
  );
});

// -- Auth: timing-safe comparison ---------------------------------------------

test("REQ-T1-DEMO-010 authorizeCampaignIngest uses timing-safe comparison", async () => {
  const { authorizeCampaignIngest } = await loadAuthModule();
  // Valid token must not throw.
  assert.doesNotThrow(() => authorizeCampaignIngest(VALID_AUTH, VALID_TOKEN));
  // Wrong token must throw.
  assert.throws(
    () => authorizeCampaignIngest(`Bearer ${"b".repeat(32)}`, VALID_TOKEN),
    (error: unknown) =>
      (error as { code: string }).code === "CAMPAIGN_INGEST_UNAUTHORIZED"
  );
});

// -- Delegation ---------------------------------------------------------------

test("REQ-T1-DEMO-010 controller delegates normalized start and snapshot", async () => {
  const { controller, serviceCalls } = await makeRecordingController();
  controller.startCampaign(VALID_AUTH, makeCampaignStartEnvelope());
  controller.ingestSnapshot(VALID_AUTH, makeCampaignSnapshot(1, null));
  assert.deepEqual(serviceCalls, ["start", "snapshot"]);
});

test("REQ-T1-DEMO-010 controller delegates finalize and evidence", async () => {
  const { controller, serviceCalls } = await makeRecordingController();
  controller.finalizeCampaign(VALID_AUTH, makeCampaignFinalizeEnvelope());
  controller.registerEvidence(VALID_AUTH, makeCampaignEvidenceRegistration());
  assert.deepEqual(serviceCalls, ["finalize", "evidence"]);
});

// -- Controller never echoes input --------------------------------------------

test("REQ-T1-DEMO-010 controller return value never echoes raw input", async () => {
  const { controller } = await makeControllerWithService();
  const startInput = makeCampaignStartEnvelope();
  const started = controller.startCampaign(VALID_AUTH, startInput) as Record<
    string,
    unknown
  >;
  const serialized = JSON.stringify(started);
  // The returned summary must not contain the full start envelope fields.
  assert.ok(
    !serialized.includes("openclaw_version"),
    "Return value must not echo openclaw_version"
  );
  assert.ok(
    !serialized.includes("openclaw_package_integrity"),
    "Return value must not echo openclaw_package_integrity"
  );
  assert.ok(
    !serialized.includes("model_ref"),
    "Return value must not echo model_ref"
  );
});

// -- Token length validation at construction ----------------------------------

test("REQ-T1-DEMO-010 controller rejects short expected token at construction", async () => {
  const { CampaignIngestController } = await loadControllerModule();
  const { service } = makeRecordingService();
  assert.throws(
    () => new CampaignIngestController(service, "short"),
    (error: unknown) =>
      (error as { code: string }).code === "CAMPAIGN_INGEST_TOKEN_INVALID"
  );
});
