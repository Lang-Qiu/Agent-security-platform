import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createInternalAppServer,
  createProductionServers,
  startProductionServers,
  startServer
} from "../../backend/src/main.ts";
import { InternalAppModule } from "../../backend/src/internal-app.module.ts";
import { createRuntimeDependencies } from "../../backend/src/runtime-dependencies.ts";
import {
  createSandboxSecurityEnforcementAuditController,
  type SandboxSecurityEnforcementAuditAuthenticator,
  type SandboxSecurityEnforcementAuditAuthorizedCapability,
  type SandboxSecurityEnforcementAuditService,
  type SandboxSecurityModule,
  type SandboxSecurityRuntimePort,
  type SandboxSecurityTokenBucket
} from "../../backend/src/modules/sandbox-security/sandbox-security.module.ts";
import {
  createSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "../../backend/src/modules/sandbox-security/sandbox-security.errors.ts";

const PRIVATE_TOKEN = `sbxcap_v1.${"A".repeat(43)}`;
const ADMIN_TOKEN = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "ascii"
).toString("base64url");
const REQUEST = {
  schema_version: "sandbox-security-enforcement-audit-request.v1",
  event_id: "audit:00000000-0000-4000-8000-000000000030",
  request_id: "request:00000000-0000-4000-8000-000000000030",
  enforcement_point: "before_agent_run",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  composition_binding: "sandbox-security-production-composition.v1:rule_only",
  elapsed_ms: 3,
  event_type: "enforcement_completed",
  verdict: "no_detected_risk",
  action: "allow",
  risk_level: "info",
  category_counts: {
    prompt_injection: 0,
    jailbreak: 0,
    instruction_override: 0,
    privilege_escalation: 0,
    sensitive_data_exposure: 0,
    tool_hijacking: 0,
    unsafe_side_effect: 0,
    memory_poisoning: 0,
    trust_boundary_violation: 0
  },
  detector_run_status_counts: {
    matched: 0,
    no_match: 1,
    failed: 0,
    timeout: 0,
    invalid_result: 0,
    skipped: 0
  },
  host_outcome: "continued"
} as const;

const PRIVATE_CAPABILITY: SandboxSecurityEnforcementAuditAuthorizedCapability = {
  capability_id: "capability:00000000-0000-4000-8000-000000000030",
  subject_id: "integration:openclaw",
  authorization_scope_id: `authscope:hmac-sha256:${"c".repeat(64)}`,
  scopes: ["sandbox_security:enforcement:audit:write"],
  allowed_stages: ["user_input", "model_output", "tool_request"],
  allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
  composition_binding: REQUEST.composition_binding,
  issued_at: "2026-08-07T00:00:00.000Z",
  expires_at: "2026-08-07T01:00:00.000Z"
};

function createActualModule(input: Readonly<{
  calls: string[];
  authentication?: "authorized" | "unknown";
  scope?: "authorized" | "wrong";
  bucketAllowed?: boolean;
  serviceError?: SandboxSecurityServiceError;
}>): SandboxSecurityModule {
  const runtime: SandboxSecurityRuntimePort = {
    now: () => "2026-08-07T00:00:00.000Z",
    monotonicNowMs: () => 100,
    randomBytes: (length) => new Uint8Array(length),
    nextCapabilityId: () => PRIVATE_CAPABILITY.capability_id,
    nextAuditEventId: () => REQUEST.event_id,
    nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000030",
    scheduleTimeout: () => () => {},
    scheduleInterval: () => ({ unref() {}, cancel() {} })
  };
  const authenticator: SandboxSecurityEnforcementAuditAuthenticator = {
    authenticateEnforcementAuditToken(token) {
      input.calls.push(`authenticate:${token}`);
      if (input.authentication === "unknown") return { kind: "unknown" };
      if (input.scope === "wrong") {
        return {
          kind: "authorized",
          capability: {
            ...PRIVATE_CAPABILITY,
            scopes: ["sandbox_security:evaluate"]
          } as never
        };
      }
      return { kind: "authorized", capability: PRIVATE_CAPABILITY };
    },
    requireEnforcementAuditGrant(capability, context) {
      input.calls.push("grant");
      if (
        capability.capability_id !== PRIVATE_CAPABILITY.capability_id ||
        capability.subject_id !== PRIVATE_CAPABILITY.subject_id ||
        capability.authorization_scope_id !== PRIVATE_CAPABILITY.authorization_scope_id ||
        capability.composition_binding !== PRIVATE_CAPABILITY.composition_binding ||
        context.stage !== REQUEST.stage ||
        context.policy_profile_id !== REQUEST.policy_profile_id ||
        context.composition_binding !== REQUEST.composition_binding
      ) {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_FORBIDDEN",
          audit_rejection_code: "stage_forbidden"
        });
      }
      return PRIVATE_CAPABILITY;
    }
  };
  const service: SandboxSecurityEnforcementAuditService = {
    async appendEnforcementEvent(request, identity) {
      input.calls.push(`append:${request.event_id}:${identity.capability_id}`);
      if (input.serviceError !== undefined) throw input.serviceError;
      return {
        schema_version: "sandbox-security-enforcement-audit-ack.v1",
        event_id: request.event_id,
        status: "accepted",
        occurred_at: runtime.now()
      };
    }
  };
  const bucket: SandboxSecurityTokenBucket = {
    consume() {
      input.calls.push("bucket");
      return input.bucketAllowed === false
        ? { allowed: false, retry_after_seconds: 7 }
        : { allowed: true };
    }
  };
  const enforcementAuditController = createSandboxSecurityEnforcementAuditController({
    authenticator,
    service,
    enforcement_bucket: bucket,
    runtime,
    composition_binding: REQUEST.composition_binding
  });
  return {
    publicController: {
      async evaluate() { return { statusCode: 200, body: {} }; },
      async listAuditEvents() { return { statusCode: 200, body: {} }; }
    },
    adminController: {
      async issue() { return { statusCode: 201, body: {} }; },
      async revoke() { return { statusCode: 200, body: {} }; },
      async purge() { return { statusCode: 200, body: {} }; }
    },
    enforcementAuditController,
    async close() {}
  };
}

async function rawHttpRequest(input: Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: Buffer;
  end?: boolean;
}>): Promise<Readonly<{
  status: number;
  connection: string | undefined;
  body: string;
}>> {
  const target = new URL(input.url);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      method: "POST",
      path: `${target.pathname}${target.search}`,
      headers: input.headers
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          connection: typeof response.headers.connection === "string"
            ? response.headers.connection
            : undefined,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.on("error", reject);
    if (input.body !== undefined) request.write(input.body);
    if (input.end !== false) request.end();
  });
}

async function withProductionServers<T>(
  callback: (input: Readonly<{ publicUrl: string; internalUrl: string; calls: string[] }>) => Promise<T>,
  options: Readonly<{
    authentication?: "authorized" | "unknown";
    scope?: "authorized" | "wrong";
    bucketAllowed?: boolean;
    serviceError?: SandboxSecurityServiceError;
  }> = {}
): Promise<T> {
  const calls: string[] = [];
  const production = createProductionServers({
    deps: createRuntimeDependencies(),
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: createActualModule({ calls, ...options })
  });
  const publicHandle = await startServer(production.publicServer);
  const internalHandle = await startServer(production.internalServer);
  try {
    return await callback({
      publicUrl: publicHandle.baseUrl,
      internalUrl: internalHandle.baseUrl,
      calls
    });
  } finally {
    await production.close();
  }
}

test("REQ-SBX-GENERAL-004 accepts enforcement audit only on the internal listener", async () => {
  await withProductionServers(async ({ publicUrl, internalUrl, calls }) => {
    const body = JSON.stringify(REQUEST);
    const internalResponse = await fetch(
      `${internalUrl}/internal/sandbox/security/enforcement-events`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${PRIVATE_TOKEN}`,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body))
        },
        body
      }
    );
    assert.equal(internalResponse.status, 201);
    assert.equal(calls.some((call) => call.startsWith("append:")), true);

    const publicResponse = await fetch(
      `${publicUrl}/internal/sandbox/security/enforcement-events`,
      { method: "POST", headers: { authorization: `Bearer ${PRIVATE_TOKEN}` }, body }
    );
    assert.equal(publicResponse.status, 404);
    assert.equal(await publicResponse.text().then((value) => value.includes(body)), false);
  });
});

test("REQ-SBX-GENERAL-004 keeps the internal route unavailable without sandbox security composition", async () => {
  const dependencies = createRuntimeDependencies();
  const internalApp = new InternalAppModule({
    campaignRepository: dependencies.campaignRepository,
    taskRepository: dependencies.taskRepository,
    ingestToken: "a".repeat(64)
  });
  const handle = await startServer(createInternalAppServer(internalApp));
  try {
    const response = await fetch(
      `${handle.baseUrl}/internal/sandbox/security/enforcement-events`,
      { method: "POST", body: "raw-private-input" }
    );
    assert.equal(response.status, 404);
    const text = await response.text();
    assert.equal(text.includes("raw-private-input"), false);
  } finally {
    await handle.close();
  }
});

test("REQ-SBX-GENERAL-004 serializes real HTTP admission errors without raw input", async () => {
  const rawInput = "raw-private-input";
  const body = JSON.stringify(REQUEST);
  const post = async (internalUrl: string, token: string, payload: string = body) =>
    fetch(`${internalUrl}/internal/sandbox/security/enforcement-events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: payload
    });

  await withProductionServers(async ({ internalUrl }) => {
    const response = await post(internalUrl, PRIVATE_TOKEN, rawInput);
    assert.equal(response.status, 401);
    assert.equal((await response.text()).includes(rawInput), false);
  }, { authentication: "unknown" });

  await withProductionServers(async ({ internalUrl }) => {
    const response = await post(internalUrl, PRIVATE_TOKEN);
    assert.equal(response.status, 403);
    assert.equal((await response.text()).includes(rawInput), false);
  }, { scope: "wrong" });

  await withProductionServers(async ({ internalUrl }) => {
    const response = await post(internalUrl, PRIVATE_TOKEN, rawInput);
    assert.equal(response.status, 400);
    assert.equal((await response.text()).includes(rawInput), false);
  });

  await withProductionServers(async ({ internalUrl }) => {
    const response = await post(internalUrl, PRIVATE_TOKEN, rawInput);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "7");
    assert.equal((await response.text()).includes(rawInput), false);
  }, { bucketAllowed: false });

  await withProductionServers(async ({ internalUrl }) => {
    const response = await post(internalUrl, PRIVATE_TOKEN);
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes(rawInput), false);
  }, {
    serviceError: createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
      audit_rejection_code: "storage_unavailable"
    })
  });
});

test("REQ-SBX-GENERAL-004 closes real HTTP connections after timeout and overflow", async () => {
  await withProductionServers(async ({ internalUrl }) => {
    const timeout = await rawHttpRequest({
      url: `${internalUrl}/internal/sandbox/security/enforcement-events`,
      headers: {
        authorization: `Bearer ${PRIVATE_TOKEN}`,
        "content-type": "application/json",
        "transfer-encoding": "chunked"
      },
      body: Buffer.from("{", "ascii"),
      end: false
    });
    assert.equal(timeout.status, 408);
    assert.equal(timeout.connection, "close");
    assert.equal(timeout.body.includes("raw-private-input"), false);
  });

  await withProductionServers(async ({ internalUrl }) => {
    const overflow = await rawHttpRequest({
      url: `${internalUrl}/internal/sandbox/security/enforcement-events`,
      headers: {
        authorization: `Bearer ${PRIVATE_TOKEN}`,
        "content-type": "application/json",
        "content-length": "65537"
      },
      body: Buffer.from("raw-private-input", "ascii")
    });
    assert.equal(overflow.status, 413);
    assert.equal(overflow.connection, "close");
    assert.equal(overflow.body.includes("raw-private-input"), false);
  });
});

test("REQ-SBX-GENERAL-004 persists production acknowledgements on the shared internal module", async () => {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-enforcement-http-"));
  const environment = {
    SANDBOX_SECURITY_STORAGE_PATH: join(parent, "sandbox-security.sqlite"),
    SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY: Buffer.from(
      "0123456789abcdef0123456789abcdef",
      "ascii"
    ).toString("base64url"),
    SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN,
    SANDBOX_SECURITY_PRODUCTION_MODE: "rule_only"
  } as const;
  let servers: Awaited<ReturnType<typeof startProductionServers>> | null = null;
  try {
    servers = await startProductionServers({
      publicPort: 0,
      internalPort: 0,
      publicBindHost: "127.0.0.1",
      internalBindHost: "127.0.0.1",
      ingestToken: "a".repeat(64),
      environment
    });
    const publicPort = (servers.publicServer.address() as { port: number }).port;
    const internalPort = (servers.internalServer.address() as { port: number }).port;
    const issueBody = JSON.stringify({
      schema_version: "sandbox-security-enforcement-audit-capability-issue-request.v1",
      subject_id: "integration:openclaw",
      policy_profile_id: "sandbox-security-balanced.v1",
      ttl_seconds: 3600
    });
    const issueResponse = await fetch(`http://127.0.0.1:${internalPort}/internal/sandbox/security/capabilities`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json"
      },
      body: issueBody
    });
    assert.equal(issueResponse.status, 201);
    const issued = await issueResponse.json() as {
      data: { bearer_token: string; capability_id: string };
    };
    assert.match(issued.data.bearer_token, /^sbxcap_v1\.[A-Za-z0-9_-]{43}$/);

    const eventBody = JSON.stringify(REQUEST);
    const eventUrl = `http://127.0.0.1:${internalPort}/internal/sandbox/security/enforcement-events`;
    const headers = {
      authorization: `Bearer ${issued.data.bearer_token}`,
      "content-type": "application/json"
    };
    const accepted = await fetch(eventUrl, {
      method: "POST",
      headers,
      body: eventBody
    });
    assert.equal(accepted.status, 201);
    const acceptedJson = await accepted.json() as {
      data: { status: string; event_id: string; occurred_at: string };
    };
    assert.deepEqual(acceptedJson.data, {
      schema_version: "sandbox-security-enforcement-audit-ack.v1",
      event_id: REQUEST.event_id,
      status: "accepted",
      occurred_at: acceptedJson.data.occurred_at
    });

    const replay = await fetch(eventUrl, {
      method: "POST",
      headers,
      body: eventBody
    });
    assert.equal(replay.status, 200);
    const replayJson = await replay.json() as { data: { status: string; occurred_at: string } };
    assert.equal(replayJson.data.status, "replayed");
    assert.equal(replayJson.data.occurred_at, acceptedJson.data.occurred_at);

    const publicResponse = await fetch(
      `http://127.0.0.1:${publicPort}/internal/sandbox/security/enforcement-events`,
      { method: "POST", body: "raw-private-input" }
    );
    assert.equal(publicResponse.status, 404);
    assert.equal((await publicResponse.text()).includes("raw-private-input"), false);
  } finally {
    await servers?.close().catch(() => undefined);
    rmSync(parent, { recursive: true, force: true });
  }
});
