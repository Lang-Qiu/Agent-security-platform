import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { AppModule, createAppModule } from "../../backend/src/app.module.ts";
import {
  createInternalAppServer,
  createAppServer,
  createProductionServers,
  startProductionServers,
  startServer
} from "../../backend/src/main.ts";
import { createRuntimeDependencies } from "../../backend/src/runtime-dependencies.ts";
import {
  createSandboxSecurityModule,
  type SandboxSecurityModule
} from "../../backend/src/modules/sandbox-security/sandbox-security.module.ts";
import { createSandboxSecurityServiceError } from "../../backend/src/modules/sandbox-security/sandbox-security.errors.ts";
import type { SandboxSecurityRuntimePort } from "../../backend/src/modules/sandbox-security/ports/runtime.ts";
import type { SqliteSandboxSecurityDatabase } from "../../backend/src/modules/sandbox-security/ports/sqlite-database.ts";
import type {
  SandboxSecurityAuthorizedCapability,
  SandboxSecurityCapabilityAuthenticationResult,
  SandboxSecurityCapabilityLimiterRegistry,
  SandboxSecurityCapabilityService,
  SandboxSecurityEvaluationService,
  SandboxSecurityIdempotencyMaintenance,
  SandboxSecurityTokenBucket,
  SandboxSecurityAuditService,
  SandboxSecurityAuditProjector
} from "../../backend/src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityAuditRepository } from "../../backend/src/modules/sandbox-security/ports/audit.repository.ts";
import type { SandboxSecurityRequest, SandboxSecurityDecision } from "../../backend/src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityEnforcementAuditRequest } from "../../shared/types/sandbox-security-enforcement-audit.ts";

const PUBLIC_TOKEN = `sbxcap_v1.${"a".repeat(43)}`;
const PRIVATE_TOKEN = `sbxcap_v1.${"b".repeat(43)}`;
const ADMIN_TOKEN = "admin-test-token";
const PRODUCTION_ADMIN_TOKEN = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "ascii"
).toString("base64url");
const CAPABILITY_ID = "capability:123e4567-e89b-42d3-a456-426614174000";
const COMPOSITION_BINDING = "sandbox-security-production-composition.v1:rule_only";
const MAX_PUBLIC_BODY_BYTES = 786432;

const VALID_EVALUATION = {
  schema_version: "sandbox-security-request.v1",
  request_id: "request-http-1",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  content_items: [
    {
      source_id: "source-1",
      claimed_source_type: "user_input",
      media_type: "text/plain",
      value: "hello",
      provenance_ref: "source://client/input"
    }
  ]
} as const;

type RawHttpResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  body: string;
  json: any;
  complete: boolean;
}>;

interface TestFixture {
  publicServer: Server;
  internalServer: Server;
  publicPort: number;
  internalPort: number;
  module: SandboxSecurityModule;
  calls: string[];
  responseEvents: string[];
  close(): Promise<void>;
}

function createRuntime(): SandboxSecurityRuntimePort {
  let sequence = 0;
  return {
    now: () => "2026-08-06T00:00:00.000Z",
    monotonicNowMs: () => 1000,
    randomBytes: (length) => new Uint8Array(length),
    nextCapabilityId: () => CAPABILITY_ID,
    nextAuditEventId: () => `audit-${++sequence}`,
    nextDecisionId: () => `decision-${++sequence}`,
    scheduleTimeout: (_delay, callback) => {
      const timer = setTimeout(callback, 0);
      return () => clearTimeout(timer);
    },
    scheduleInterval: () => ({
      unref() {},
      cancel() {}
    })
  };
}

function createAllowedBucket(): SandboxSecurityTokenBucket {
  return { consume: () => ({ allowed: true }) };
}

function createAllowedCapabilityLimiter(): SandboxSecurityCapabilityLimiterRegistry {
  return {
    consume: () => ({ allowed: true }),
    remove: () => undefined,
    size: () => 0
  };
}

function createCapability(): SandboxSecurityAuthorizedCapability {
  return {
    capability_id: CAPABILITY_ID,
    subject_id: "subject-http-test",
    authorization_scope_id: "scope-http-test",
    scopes: ["sandbox_security:evaluate", "sandbox_security:audit:read"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: [
      "sandbox-security-balanced.v1",
      "sandbox-security-strict.v1"
    ],
    issued_at: "2026-08-06T00:00:00.000Z",
    expires_at: "2026-08-06T01:00:00.000Z"
  };
}

function createDecision(): SandboxSecurityDecision {
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: "decision-http-1",
    request_id: "request-http-1",
    evaluation_mode: "simulation",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    findings: [],
    detector_runs: [],
    evidence_refs: [],
    created_at: "2026-08-06T00:00:00.000Z"
  };
}

function createDependencies(calls: string[], options: Readonly<{
  auditScope?: boolean;
  slowEvaluation?: boolean;
}> = {}) {
  const capability = createCapability();
  const runtime = createRuntime();
  const enforcementCapability = {
    capability_id: "capability:123e4567-e89b-42d3-a456-426614174001",
    subject_id: "openclaw:general-security",
    authorization_scope_id: "authscope:hmac-sha256:" + "c".repeat(64),
    scopes: ["sandbox_security:enforcement:audit:write"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
    composition_binding: COMPOSITION_BINDING,
    issued_at: "2026-08-06T00:00:00.000Z",
    expires_at: "2026-08-06T01:00:00.000Z"
  } as const;
  const authenticator = {
    authenticateToken(token: string): SandboxSecurityCapabilityAuthenticationResult {
      calls.push(`authenticate:${token}`);
      if (token !== PUBLIC_TOKEN) return { kind: "unknown" };
      return { kind: "authorized", capability };
    },
    requireScope(_capability: SandboxSecurityAuthorizedCapability, scope: string): void {
      calls.push(`scope:${scope}`);
      if (scope === "sandbox_security:audit:read" && options.auditScope === false) {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_FORBIDDEN",
          audit_rejection_code: "scope_forbidden"
        });
      }
    },
    requireEvaluationGrant: (
      _capability: SandboxSecurityAuthorizedCapability,
      _submission: SandboxSecurityRequest
    ) => {
      calls.push("evaluation_grant");
    },
    authenticateAdministrator(token: string): void {
      calls.push(`authenticate_admin:${token}`);
      if (token !== ADMIN_TOKEN) {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED"
        });
      }
    },
    authenticateEnforcementAuditToken(token: string) {
      calls.push(`authenticate_enforcement:${token}`);
      if (token !== PRIVATE_TOKEN) return { kind: "unknown" as const };
      return { kind: "authorized" as const, capability: enforcementCapability };
    },
    requireEnforcementAuditGrant() {
      calls.push("enforcement_grant");
      return enforcementCapability;
    }
  };

  const evaluationService: SandboxSecurityEvaluationService = {
    async evaluate(input) {
      calls.push(`evaluate:${input.idempotency_key}`);
      const onStage = (input as unknown as {
        on_stage?: (event: Record<string, unknown>) => void;
      }).on_stage;
      onStage?.({
        schema_version: "sandbox-security-evaluation-stream.v1",
        event_type: "stage",
        request_id: "request-http-1",
        sequence: 1,
        stage: "source",
        status: "completed",
        delivery: "live",
        result: { source_count: 1, tool_request_present: false, elapsed_ms: 0 }
      });
      for (const [sequence, stage, detectorKind, skipReason] of [
        [2, "rule", "rule", null],
        [3, "model", "local_model", "optional_not_configured"],
        [4, "judge", "external_judge", "routing_not_selected"]
      ] as const) {
        onStage?.({
          schema_version: "sandbox-security-evaluation-stream.v1",
          event_type: "stage",
          request_id: "request-http-1",
          sequence,
          stage,
          status: skipReason === null ? "no_match" : "skipped",
          delivery: "live",
          result: {
            detector_id: `${stage}-detector`,
            detector_version: "1.0.0",
            detector_kind: detectorKind,
            obligation: skipReason === null ? "profile_required" : "optional_not_selected",
            elapsed_ms: 0,
            ...(skipReason === null ? {} : { skip_reason: skipReason })
          }
        });
      }
      if (options.slowEvaluation === true) {
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      return createDecision();
    }
  };

  const auditService: SandboxSecurityAuditService = {
    list(input) {
      calls.push(`audit-list:${input.limit}`);
      return {
        schema_version: "sandbox-security-audit-page.v1",
        events: [],
        next_cursor: null
      };
    },
    purgeExpired() {
      calls.push("audit-purge");
      return {
        schema_version: "sandbox-security-audit-purge-result.v1",
        retention_days: 90,
        deleted_count: 0,
        has_more: false
      };
    }
  };

  const capabilityService: SandboxSecurityCapabilityService = {
    issue(input) {
      calls.push(`capability-issue:${input.ttl_seconds}`);
      return {
        schema_version: "sandbox-security-capability-issue-result.v1",
        capability_id: CAPABILITY_ID,
        subject_id: input.subject_id,
        scopes: input.scopes,
        allowed_stages: input.allowed_stages,
        allowed_policy_profile_ids: input.allowed_policy_profile_ids,
        bearer_token: PUBLIC_TOKEN,
        issued_at: "2026-08-06T00:00:00.000Z",
        expires_at: "2026-08-06T01:00:00.000Z",
        revoked_at: null
      };
    },
    revoke(capabilityId) {
      calls.push(`capability-revoke:${capabilityId}`);
      return {
        schema_version: "sandbox-security-capability-record.v1",
        capability_id: capabilityId,
        subject_id: "subject-http-test",
        scopes: ["sandbox_security:evaluate"],
        allowed_stages: ["user_input"],
        allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
        issued_at: "2026-08-06T00:00:00.000Z",
        expires_at: "2026-08-06T01:00:00.000Z",
        revoked_at: "2026-08-06T00:00:01.000Z"
      };
    }
  };

  const maintenance: SandboxSecurityIdempotencyMaintenance = {
    state: () => "healthy",
    assertEvaluationAvailable: () => calls.push("maintenance"),
    claim: () => ({ kind: "claimed" }),
    runHourlyCleanup: () => undefined,
    runPurgePreCleanup: () => undefined,
    close: () => calls.push("maintenance-close")
  };

  const projector: SandboxSecurityAuditProjector = {
    evaluationCompleted: () => ({} as never),
    evaluationReplayed: () => ({} as never),
    evaluationInterrupted: () => ({} as never),
    requestRejected: () => ({} as never),
    capabilityIssued: () => ({} as never),
    capabilityRevoked: () => ({} as never),
    auditRead: () => ({} as never),
    auditPurged: () => ({} as never)
  };
  const auditRepository: SandboxSecurityAuditRepository = {
    append: () => undefined,
    list: () => ({ events: [], next_cursor: null }),
    purgeExpired: () => ({ deleted_count: 0, has_more: false })
  } as unknown as SandboxSecurityAuditRepository;
  const database: SqliteSandboxSecurityDatabase = {
    state: "open",
    transaction: (operation) => operation({} as never),
    read: (operation) => operation({} as never),
    checkpointAndClose: () => calls.push("database-close")
  };
  const enforcementAuditService = {
    async appendEnforcementEvent(request: SandboxSecurityEnforcementAuditRequest, identity: typeof enforcementCapability) {
      calls.push(`enforcement-append:${request.request_id}:${identity.capability_id}`);
      return {
        schema_version: "sandbox-security-enforcement-audit-ack.v1" as const,
        event_id: request.event_id,
        status: "accepted" as const,
        occurred_at: runtime.now()
      };
    }
  };

  return {
    database,
    composition_binding: COMPOSITION_BINDING,
    maintenance,
    authenticator,
    evaluation_service: evaluationService,
    capability_service: capabilityService,
    audit_service: auditService,
    audit_repository: auditRepository,
    audit_projector: projector,
    global_bucket: createAllowedBucket(),
    administrator_bucket: createAllowedBucket(),
    enforcement_audit_authenticator: authenticator,
    enforcement_audit_service: enforcementAuditService,
    enforcement_audit_bucket: createAllowedBucket(),
    capability_limiters: createAllowedCapabilityLimiter(),
    runtime
  };
}

async function startInjectedSandboxSecurityServers(
  options: Readonly<{ auditScope?: boolean; slowEvaluation?: boolean }> = {}
): Promise<TestFixture> {
  const calls: string[] = [];
  const module = createSandboxSecurityModule(createDependencies(calls, options));
  const runtime = createRuntimeDependencies();
  const app = createAppModule(runtime, module);
  const internalApp = new (await import("../../backend/src/internal-app.module.ts")).InternalAppModule({
    campaignRepository: runtime.campaignRepository,
    taskRepository: runtime.taskRepository,
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: module
  });
  const publicServer = createAppServer(app);
  const internalServer = createInternalAppServer(internalApp);
  const responseEvents: string[] = [];
  publicServer.on("request", (request, response) => {
    response.once("finish", () => responseEvents.push("finish"));
    request.socket.once("close", () => responseEvents.push("socket-close"));
  });
  const publicHandle = await startServer(publicServer);
  const internalHandle = await startServer(internalServer);
  const publicPort = Number(new URL(publicHandle.baseUrl).port);
  const internalPort = Number(new URL(internalHandle.baseUrl).port);
  return {
    publicServer,
    internalServer,
    publicPort,
    internalPort,
    module,
    calls,
    responseEvents,
    async close() {
      await Promise.all([publicHandle.close(), internalHandle.close()]);
      await module.close();
    }
  };
}

function parseResponse(buffer: Buffer): RawHttpResponse | null {
  const separator = buffer.indexOf("\r\n\r\n");
  if (separator < 0) return null;
  const headerText = buffer.subarray(0, separator).toString("latin1");
  const lines = headerText.split("\r\n");
  const statusCode = Number(lines.shift()?.split(" ")[1]);
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon > 0) headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  const body = buffer.subarray(separator + 4);
  const contentLength = headers["content-length"] === undefined
    ? null
    : Number(headers["content-length"]);
  if (contentLength !== null && body.length < contentLength) return null;
  return {
    statusCode,
    headers,
    body: body.subarray(0, contentLength ?? body.length).toString("utf8"),
    json: (() => {
      try {
        return JSON.parse(body.subarray(0, contentLength ?? body.length).toString("utf8"));
      } catch {
        return undefined;
      }
    })(),
    complete: contentLength === null || body.length >= contentLength
  };
}

function sendRawHttpRequest(port: number, rawRequest: string | Buffer): Promise<RawHttpResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    const chunks: Buffer[] = [];
    let settled = false;
    const settle = () => {
      if (settled) return;
      const response = parseResponse(Buffer.concat(chunks));
      if (response === null) return;
      settled = true;
      socket.destroy();
      resolve(response);
    };
    socket.on("connect", () => socket.write(rawRequest));
    socket.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
      settle();
    });
    socket.on("end", settle);
    socket.on("close", settle);
    socket.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function evaluationBodyRequest(
  port: number,
  body: string,
  headers: readonly string[] = []
): Promise<RawHttpResponse> {
  const requestHeaders = [
    "POST /api/sandbox/security/evaluations HTTP/1.1",
    "Host: 127.0.0.1",
    `Authorization: Bearer ${PUBLIC_TOKEN}`,
    "Content-Type: application/json",
    "Idempotency-Key: idempotency-http-1",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "Connection: close",
    ...headers,
    "",
    ""
  ].join("\r\n");
  return sendRawHttpRequest(port, requestHeaders + body);
}

function productionEvaluationBodyRequest(
  port: number,
  token: string,
  idempotencyKey: string
): Promise<RawHttpResponse> {
  const body = JSON.stringify(VALID_EVALUATION);
  return productionEvaluationRawBodyRequest(port, token, idempotencyKey, body);
}

function productionEvaluationRawBodyRequest(
  port: number,
  token: string,
  idempotencyKey: string,
  body: string
): Promise<RawHttpResponse> {
  return sendRawHttpRequest(
    port,
    [
      "POST /api/sandbox/security/evaluations HTTP/1.1",
      "Host: 127.0.0.1",
      `Authorization: Bearer ${token}`,
      "Content-Type: application/json",
      `Idempotency-Key: ${idempotencyKey}`,
      `Content-Length: ${Buffer.byteLength(body)}`,
      "Connection: close",
      "",
      body
    ].join("\r\n")
  );
}

async function issueProductionCapability(
  port: number,
  allowedStages: readonly string[] = ["user_input"]
): Promise<Readonly<{ capabilityId: string; bearerToken: string }>> {
  const body = JSON.stringify({
    schema_version: "sandbox-security-capability-issue-request.v1",
    subject_id: "subject-restart",
    scopes: ["sandbox_security:evaluate", "sandbox_security:audit:read"],
    allowed_stages: [...allowedStages],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
    ttl_seconds: 900
  });
  const response = await sendRawHttpRequest(
    port,
    [
      "POST /internal/sandbox/security/capabilities HTTP/1.1",
      "Host: 127.0.0.1",
      `Authorization: Bearer ${PRODUCTION_ADMIN_TOKEN}`,
      "Content-Type: application/json",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "Connection: close",
      "",
      body
    ].join("\r\n")
  );
  assert.equal(response.statusCode, 201);
  assert.equal(typeof response.json?.data?.capability_id, "string");
  assert.equal(typeof response.json?.data?.bearer_token, "string");
  return {
    capabilityId: response.json.data.capability_id,
    bearerToken: response.json.data.bearer_token
  };
}

function sentinelSubmission(sentinel: string): Readonly<Record<string, unknown>> {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "privacy-sentinel-request-001",
    stage: "tool_request",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: `model-${sentinel}`,
        claimed_source_type: "model_output",
        media_type: "application/json",
        value: { message: sentinel },
        provenance_ref: `source://client/${sentinel}/output`
      },
      {
        source_id: `user-${sentinel}`,
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: sentinel,
        provenance_ref: `source://client/${sentinel}/input`
      }
    ],
    tool_request: {
      call_id: `call-${sentinel}`,
      tool_name: "read_file",
      target: `target-${sentinel}`,
      arguments: { payload: sentinel }
    }
  };
}

function assertSentinelAbsent(bytes: Uint8Array, sentinel: string): void {
  const source = Buffer.from(bytes);
  const literal = Buffer.from(sentinel, "utf8");
  const base64 = Buffer.from(sentinel, "utf8").toString("base64");
  const base64url = Buffer.from(sentinel, "utf8").toString("base64url");
  const hex = Buffer.from(sentinel, "utf8").toString("hex");
  for (const [label, encoded] of [
    ["literal", literal],
    ["base64", Buffer.from(base64)],
    ["base64url", Buffer.from(base64url)],
    ["hex", Buffer.from(hex)]
  ] as const) {
    assert.equal(source.includes(encoded), false, `raw sentinel ${label} leaked to a managed surface`);
  }
  const text = source.toString("utf8");
  const foldedSentinel = sentinel.normalize("NFKC").toLocaleLowerCase();
  assert.equal(
    text.normalize("NFKC").toLocaleLowerCase().includes(foldedSentinel),
    false,
    "case-folded/NFKC raw sentinel leaked to a managed surface"
  );
}

function readSandboxSecurityArtifactBytes(parent: string): Buffer[] {
  const bytes: Buffer[] = [];
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    const path = join(parent, entry.name);
    if (entry.isDirectory()) {
      bytes.push(...readSandboxSecurityArtifactBytes(path));
    } else if (entry.isFile()) {
      bytes.push(readFileSync(path));
    }
  }
  return bytes;
}

test("REQ-SBX-GENERAL-003 all five sandbox security routes succeed through injected services", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const evaluation = await evaluationBodyRequest(
      fixture.publicPort,
      JSON.stringify(VALID_EVALUATION)
    );
    const audit = await sendRawHttpRequest(
      fixture.publicPort,
      [
        "GET /api/sandbox/security/audit-events HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${PUBLIC_TOKEN}`,
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );
    const issueBody = JSON.stringify({
      schema_version: "sandbox-security-capability-issue-request.v1",
      subject_id: "subject-http-test",
      scopes: ["sandbox_security:evaluate"],
      allowed_stages: ["user_input"],
      allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
      ttl_seconds: 900
    });
    const issue = await sendRawHttpRequest(
      fixture.internalPort,
      [
        "POST /internal/sandbox/security/capabilities HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${ADMIN_TOKEN}`,
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(issueBody)}`,
        "Connection: close",
        "",
        issueBody
      ].join("\r\n")
    );
    const revoke = await sendRawHttpRequest(
      fixture.internalPort,
      [
        `POST /internal/sandbox/security/capabilities/${encodeURIComponent(CAPABILITY_ID)}/revoke HTTP/1.1`,
        "Host: 127.0.0.1",
        `Authorization: Bearer ${ADMIN_TOKEN}`,
        "Content-Length: 0",
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );
    const purge = await sendRawHttpRequest(
      fixture.internalPort,
      [
        "POST /internal/sandbox/security/audit-events/purge HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${ADMIN_TOKEN}`,
        "Content-Length: 0",
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );

    assert.equal(evaluation.statusCode, 200);
    assert.equal(audit.statusCode, 200);
    assert.equal(issue.statusCode, 201);
    assert.equal(revoke.statusCode, 200);
    assert.equal(purge.statusCode, 200);
    assert.deepEqual(
      fixture.calls.filter((call) => call.startsWith("capability-") || call.startsWith("audit-") || call === "evaluate:idempotency-http-1"),
      [
        "evaluate:idempotency-http-1",
        "audit-list:50",
        "capability-issue:900",
        `capability-revoke:${CAPABILITY_ID}`,
        "audit-purge"
      ]
    );
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-006 streams five ordered SSE events and preserves the final decision", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const response = await fetch(
      `http://127.0.0.1:${fixture.publicPort}/api/sandbox/security/evaluations`,
      {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${PUBLIC_TOKEN}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "idempotency-http-stream-1"
        },
        body: JSON.stringify(VALID_EVALUATION)
      }
    );
    const body = await response.text();
    const frames = body
      .trim()
      .split("\n\n")
      .map((frame) => {
        const lines = frame.split("\n");
        return {
          event: lines.find((line) => line.startsWith("event: "))?.slice(7),
          data: JSON.parse(
            lines.find((line) => line.startsWith("data: "))?.slice(6) ?? "null"
          )
        };
      });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
    assert.deepEqual(frames.map((frame) => frame.event), [
      "stage",
      "stage",
      "stage",
      "stage",
      "decision"
    ]);
    assert.deepEqual(frames.map((frame) => frame.data.sequence), [1, 2, 3, 4, 5]);
    assert.deepEqual(frames.map((frame) => frame.data.stage), [
      "source",
      "rule",
      "model",
      "judge",
      "decision"
    ]);
    assert.equal(frames[4]?.data.decision.decision_id, "decision-http-1");
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 public and internal listeners keep route ownership and health contracts", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const publicInternalPath = await sendRawHttpRequest(
      fixture.publicPort,
      [
        "POST /internal/sandbox/security/capabilities HTTP/1.1",
        "Host: 127.0.0.1",
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );
    const internalPublicPath = await sendRawHttpRequest(
      fixture.internalPort,
      [
        "GET /api/sandbox/security/audit-events HTTP/1.1",
        "Host: 127.0.0.1",
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );
    const publicHealth = await sendRawHttpRequest(
      fixture.publicPort,
      "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    );
    const internalHealth = await sendRawHttpRequest(
      fixture.internalPort,
      "GET /internal/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    );
    assert.equal(publicInternalPath.statusCode, 404);
    assert.equal(internalPublicPath.statusCode, 404);
    assert.equal(publicHealth.statusCode, 200);
    assert.equal(publicHealth.json?.data?.status, "ok");
    assert.equal(internalHealth.statusCode, 200);
    assert.equal(internalHealth.json?.data?.status, "ok");
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 authenticates before reading malformed evaluation body", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const body = "not-json";
    const response = await sendRawHttpRequest(
      fixture.publicPort,
      [
        "POST /api/sandbox/security/evaluations HTTP/1.1",
        "Host: 127.0.0.1",
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(body)}`,
        "Connection: close",
        "",
        body
      ].join("\r\n")
    );
    assert.equal(response.statusCode, 401);
    assert.equal(response.json?.error_code, "SANDBOX_SECURITY_UNAUTHORIZED");
    assert.equal(fixture.calls.some((call) => call === "maintenance"), false);
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 checks audit scope before malformed query parsing", async () => {
  const fixture = await startInjectedSandboxSecurityServers({ auditScope: false });
  try {
    const response = await sendRawHttpRequest(
      fixture.publicPort,
      [
        "GET /api/sandbox/security/audit-events?limit=0&limit=101 HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${PUBLIC_TOKEN}`,
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );
    assert.equal(response.statusCode, 403);
    assert.equal(response.json?.error_code, "SANDBOX_SECURITY_FORBIDDEN");
    assert.equal(fixture.calls.includes("audit-list:50"), false);
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 accepts exactly 786432 UTF-8 bytes", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const fixedArguments = Array.from({ length: 7 }, () => "x".repeat(95000));
    const bodyWithEmptyTail = JSON.stringify({
      ...VALID_EVALUATION,
      request_id: "request-max-body",
      stage: "tool_request",
      content_items: [
        {
          ...VALID_EVALUATION.content_items[0],
          claimed_source_type: "user_input",
        },
        {
          source_id: "source-2",
          claimed_source_type: "model_output",
          media_type: "text/plain",
          value: "model",
          provenance_ref: "source://client/model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "lookup",
        arguments: [...fixedArguments, ""]
      }
    });
    const tailLength = MAX_PUBLIC_BODY_BYTES - Buffer.byteLength(bodyWithEmptyTail);
    assert.ok(tailLength > 0 && tailLength <= 128000);
    const body = JSON.stringify({
      ...JSON.parse(bodyWithEmptyTail),
      tool_request: {
        ...JSON.parse(bodyWithEmptyTail).tool_request,
        arguments: [...fixedArguments, "x".repeat(tailLength)]
      }
    });
    assert.equal(Buffer.byteLength(body), MAX_PUBLIC_BODY_BYTES);
    const response = await evaluationBodyRequest(fixture.publicPort, body);
    assert.equal(response.statusCode, 200);
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 rejects duplicate raw Authorization headers", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const body = JSON.stringify(VALID_EVALUATION);
    const response = await evaluationBodyRequest(
      fixture.publicPort,
      body,
      [`Authorization: Bearer ${PUBLIC_TOKEN}`]
    );
    assert.equal(response.statusCode, 401);
    assert.equal(response.json?.error_code, "SANDBOX_SECURITY_UNAUTHORIZED");
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 bodyless declared byte is rejected on the real HTTP path", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const response = await sendRawHttpRequest(
      fixture.publicPort,
      [
        "GET /api/sandbox/security/audit-events HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${PUBLIC_TOKEN}`,
        "Content-Length: 1",
        "Connection: close",
        "",
        "x"
      ].join("\r\n")
    );
    assert.equal(response.statusCode, 400);
    assert.equal(response.json?.error_code, "SANDBOX_SECURITY_INVALID_REQUEST");
    assert.equal(fixture.calls.some((call) => call.startsWith("audit-list")), false);
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 oversized client receives complete JSON 413 before socket close", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const response = await sendRawHttpRequest(
      fixture.publicPort,
      [
        "POST /api/sandbox/security/evaluations HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${PUBLIC_TOKEN}`,
        "Content-Type: application/json",
        `Content-Length: ${MAX_PUBLIC_BODY_BYTES + 1}`,
        "Idempotency-Key: idempotency-http-oversized",
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );
    assert.equal(response.statusCode, 413);
    assert.equal(response.headers.connection, "close");
    assert.equal(response.json?.error_code, "SANDBOX_SECURITY_BODY_TOO_LARGE");
    assert.equal(response.complete, true);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    const finishIndex = fixture.responseEvents.indexOf("finish");
    const socketCloseIndex = fixture.responseEvents.indexOf("socket-close");
    assert.ok(finishIndex >= 0 && socketCloseIndex >= 0);
    assert.ok(finishIndex < socketCloseIndex);
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 slow client receives complete JSON 408 before socket close", { timeout: 8000 }, async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    const response = await new Promise<RawHttpResponse>((resolve, reject) => {
      const socket = connect(fixture.publicPort, "127.0.0.1");
      const chunks: Buffer[] = [];
      let settled = false;
      const settle = () => {
        if (settled) return;
        const parsed = parseResponse(Buffer.concat(chunks));
        if (parsed === null) return;
        settled = true;
        socket.destroy();
        resolve(parsed);
      };
      socket.on("connect", () => {
        socket.write([
          "POST /api/sandbox/security/evaluations HTTP/1.1",
          "Host: 127.0.0.1",
          `Authorization: Bearer ${PUBLIC_TOKEN}`,
          "Content-Type: application/json",
          "Content-Length: 2",
          "Idempotency-Key: idempotency-http-slow",
          "Connection: close",
          "",
          ""
        ].join("\r\n"));
      });
      socket.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
        settle();
      });
      socket.on("end", settle);
      socket.on("close", settle);
      socket.on("error", (error) => {
        if (!settled) reject(error);
      });
    });
    assert.equal(response.statusCode, 408);
    assert.equal(response.headers.connection, "close");
    assert.equal(response.json?.error_code, "SANDBOX_SECURITY_REQUEST_TIMEOUT");
    assert.equal(response.complete, true);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    const finishIndex = fixture.responseEvents.indexOf("finish");
    const socketCloseIndex = fixture.responseEvents.indexOf("socket-close");
    assert.ok(finishIndex >= 0 && socketCloseIndex >= 0);
    assert.ok(finishIndex < socketCloseIndex);
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 caller abort does not attempt a response write", async () => {
  const fixture = await startInjectedSandboxSecurityServers();
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = connect(fixture.publicPort, "127.0.0.1");
      let dataSeen = false;
      socket.on("connect", () => {
        socket.write([
          "POST /api/sandbox/security/evaluations HTTP/1.1",
          "Host: 127.0.0.1",
          `Authorization: Bearer ${PUBLIC_TOKEN}`,
          "Content-Type: application/json",
          "Content-Length: 100",
          "Idempotency-Key: idempotency-http-abort",
          "Connection: close",
          "",
          ""
        ].join("\r\n"));
        setTimeout(() => socket.destroy(), 30);
      });
      socket.on("data", () => {
        dataSeen = true;
      });
      socket.on("close", () => {
        try {
          assert.equal(dataSeen, false);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      socket.on("error", () => undefined);
    });
    assert.equal(fixture.calls.some((call) => call.startsWith("evaluate:")), false);
  } finally {
    await fixture.close();
  }
});

test("REQ-SBX-GENERAL-003 module close cancels maintenance before closing database", async () => {
  const calls: string[] = [];
  const dependencies = createDependencies(calls);
  const module = createSandboxSecurityModule(dependencies);
  await module.close();
  assert.deepEqual(calls.slice(-2), ["maintenance-close", "database-close"]);
  const afterFirstClose = [...calls];
  await module.close();
  assert.deepEqual(calls, afterFirstClose);
});

test("REQ-SBX-GENERAL-003 production composition injects one module into both listeners", async () => {
  const calls: string[] = [];
  const module = createSandboxSecurityModule(createDependencies(calls));
  const production = createProductionServers({
    deps: createRuntimeDependencies(),
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: module
  });
  const publicHandle = await startServer(production.publicServer);
  const internalHandle = await startServer(production.internalServer);
  try {
    const publicResponse = await evaluationBodyRequest(
      Number(new URL(publicHandle.baseUrl).port),
      JSON.stringify(VALID_EVALUATION)
    );
    const issueBody = JSON.stringify({
      schema_version: "sandbox-security-capability-issue-request.v1",
      subject_id: "subject-http-test",
      scopes: ["sandbox_security:evaluate"],
      allowed_stages: ["user_input"],
      allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
      ttl_seconds: 900
    });
    const internalResponse = await sendRawHttpRequest(
      Number(new URL(internalHandle.baseUrl).port),
      [
        "POST /internal/sandbox/security/capabilities HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${ADMIN_TOKEN}`,
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(issueBody)}`,
        "Connection: close",
        "",
        issueBody
      ].join("\r\n")
    );
    assert.equal(publicResponse.statusCode, 200);
    assert.equal(internalResponse.statusCode, 201);
  } finally {
    await production.close();
  }
  assert.deepEqual(calls.slice(-2), ["maintenance-close", "database-close"]);
});

test("REQ-SBX-GENERAL-003 startup failure closes an injected module after public cleanup", async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const blockerAddress = blocker.address();
  assert.ok(blockerAddress && typeof blockerAddress === "object");

  const calls: string[] = [];
  const module = createSandboxSecurityModule(createDependencies(calls));
  try {
    await assert.rejects(() =>
      import("../../backend/src/main.ts").then(({ startProductionServers }) =>
        startProductionServers({
          publicPort: 0,
          internalPort: blockerAddress.port,
          publicBindHost: "127.0.0.1",
          internalBindHost: "127.0.0.1",
          deps: createRuntimeDependencies(),
          ingestToken: "a".repeat(64),
          sandboxSecurityModule: module
        })
      )
    );
    assert.deepEqual(calls.slice(-2), ["maintenance-close", "database-close"]);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await module.close();
  }
});

test("REQ-SBX-GENERAL-003 public bind failure closes an injected module", async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const blockerAddress = blocker.address();
  assert.ok(blockerAddress && typeof blockerAddress === "object");

  const calls: string[] = [];
  const module = createSandboxSecurityModule(createDependencies(calls));
  try {
    await assert.rejects(() =>
      import("../../backend/src/main.ts").then(({ startProductionServers }) =>
        startProductionServers({
          publicPort: blockerAddress.port,
          internalPort: 0,
          publicBindHost: "127.0.0.1",
          internalBindHost: "127.0.0.1",
          deps: createRuntimeDependencies(),
          ingestToken: "a".repeat(64),
          sandboxSecurityModule: module
        })
      )
    );
    assert.deepEqual(calls.slice(-2), ["maintenance-close", "database-close"]);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await module.close();
  }
});

test("REQ-SBX-GENERAL-003 production rule_only capability and idempotency survive restart and revoke", async () => {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-p6-t2-"));
  const databasePath = join(parent, "sandbox-security.sqlite");
  const environment = {
    SANDBOX_SECURITY_STORAGE_PATH: databasePath,
    SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY: Buffer.from(
      "0123456789abcdef0123456789abcdef",
      "ascii"
    ).toString("base64url"),
    SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN: PRODUCTION_ADMIN_TOKEN,
    SANDBOX_SECURITY_PRODUCTION_MODE: "rule_only"
  } as const;
  let first: Awaited<ReturnType<typeof startProductionServers>> | null = null;
  let second: Awaited<ReturnType<typeof startProductionServers>> | null = null;
  let third: Awaited<ReturnType<typeof startProductionServers>> | null = null;
  try {
    first = await startProductionServers({
      publicPort: 0,
      internalPort: 0,
      publicBindHost: "127.0.0.1",
      internalBindHost: "127.0.0.1",
      ingestToken: "a".repeat(64),
      environment
    });
    const firstPublicPort = (first.publicServer.address() as { port: number }).port;
    const firstInternalPort = (first.internalServer.address() as { port: number }).port;
    const capability = await issueProductionCapability(firstInternalPort);
    const initial = await productionEvaluationBodyRequest(
      firstPublicPort,
      capability.bearerToken,
      "restart-idempotency-key-001"
    );
    assert.equal(initial.statusCode, 200);
    await first.close();
    first = null;

    second = await startProductionServers({
      publicPort: 0,
      internalPort: 0,
      publicBindHost: "127.0.0.1",
      internalBindHost: "127.0.0.1",
      ingestToken: "a".repeat(64),
      environment
    });
    const secondPublicPort = (second.publicServer.address() as { port: number }).port;
    const secondInternalPort = (second.internalServer.address() as { port: number }).port;
    const replay = await productionEvaluationBodyRequest(
      secondPublicPort,
      capability.bearerToken,
      "restart-idempotency-key-001"
    );
    assert.equal(replay.statusCode, 200);
    assert.deepEqual(replay.json?.data, initial.json?.data);

    const revoke = await sendRawHttpRequest(
      secondInternalPort,
      [
        `POST /internal/sandbox/security/capabilities/${encodeURIComponent(capability.capabilityId)}/revoke HTTP/1.1`,
        "Host: 127.0.0.1",
        `Authorization: Bearer ${PRODUCTION_ADMIN_TOKEN}`,
        "Content-Length: 0",
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );
    assert.equal(revoke.statusCode, 200);
    await second.close();
    second = null;

    third = await startProductionServers({
      publicPort: 0,
      internalPort: 0,
      publicBindHost: "127.0.0.1",
      internalBindHost: "127.0.0.1",
      ingestToken: "a".repeat(64),
      environment
    });
    const thirdPublicPort = (third.publicServer.address() as { port: number }).port;
    const revoked = await productionEvaluationBodyRequest(
      thirdPublicPort,
      capability.bearerToken,
      "restart-idempotency-key-001"
    );
    assert.equal(revoked.statusCode, 401);
  } finally {
    await first?.close().catch(() => undefined);
    await second?.close().catch(() => undefined);
    await third?.close().catch(() => undefined);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-003 raw sentinels never enter managed durable surfaces", async () => {
  const sentinel = "General003-Raw-Secret-9f4b";
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-p6-t3-privacy-"));
  const databasePath = join(parent, "sandbox-security.sqlite");
  const environment = {
    SANDBOX_SECURITY_STORAGE_PATH: databasePath,
    SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY: Buffer.from(
      "0123456789abcdef0123456789abcdef",
      "ascii"
    ).toString("base64url"),
    SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN: PRODUCTION_ADMIN_TOKEN,
    SANDBOX_SECURITY_PRODUCTION_MODE: "rule_only"
  } as const;
  let production: Awaited<ReturnType<typeof startProductionServers>> | null = null;
  const responseLogs: Buffer[] = [];
  try {
    production = await startProductionServers({
      publicPort: 0,
      internalPort: 0,
      publicBindHost: "127.0.0.1",
      internalBindHost: "127.0.0.1",
      ingestToken: "a".repeat(64),
      environment
    });
    const publicPort = (production.publicServer.address() as { port: number }).port;
    const internalPort = (production.internalServer.address() as { port: number }).port;
    const capability = await issueProductionCapability(
      internalPort,
      ["user_input", "model_output", "tool_request"]
    );

    const valid = await productionEvaluationRawBodyRequest(
      publicPort,
      capability.bearerToken,
      "privacy-sentinel-valid-001",
      JSON.stringify(sentinelSubmission(sentinel))
    );
    responseLogs.push(Buffer.from(JSON.stringify(valid), "utf8"));
    assert.equal(valid.statusCode, 200);

    const audit = await sendRawHttpRequest(
      publicPort,
      [
        "GET /api/sandbox/security/audit-events HTTP/1.1",
        "Host: 127.0.0.1",
        `Authorization: Bearer ${capability.bearerToken}`,
        "Connection: close",
        "",
        ""
      ].join("\r\n")
    );
    responseLogs.push(Buffer.from(JSON.stringify(audit), "utf8"));
    assert.equal(audit.statusCode, 200);

    const malformed = JSON.stringify({
      schema_version: "sandbox-security-request.v1",
      request_id: "privacy-sentinel-malformed-001",
      content_items: [{ value: sentinel }]
    }).slice(0, -1);
    const failed = await productionEvaluationRawBodyRequest(
      publicPort,
      capability.bearerToken,
      "privacy-sentinel-malformed-001",
      malformed
    );
    responseLogs.push(Buffer.from(JSON.stringify(failed), "utf8"));
    assert.equal(failed.statusCode, 400);

    await production.close();
    production = null;

    for (const bytes of responseLogs) {
      assertSentinelAbsent(bytes, sentinel);
    }
    for (const bytes of readSandboxSecurityArtifactBytes(parent)) {
      assertSentinelAbsent(bytes, sentinel);
    }
  } finally {
    await production?.close().catch(() => undefined);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-003 production startup rejects a deployment HMAC key mismatch before bind", async () => {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-key-mismatch-"));
  const databasePath = join(parent, "sandbox-security.sqlite");
  const baseEnvironment = {
    SANDBOX_SECURITY_STORAGE_PATH: databasePath,
    SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY: Buffer.from(
      "0123456789abcdef0123456789abcdef",
      "ascii"
    ).toString("base64url"),
    SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN: PRODUCTION_ADMIN_TOKEN,
    SANDBOX_SECURITY_PRODUCTION_MODE: "rule_only"
  } as const;
  let first: Awaited<ReturnType<typeof startProductionServers>> | null = null;
  try {
    first = await startProductionServers({
      publicPort: 0,
      internalPort: 0,
      publicBindHost: "127.0.0.1",
      internalBindHost: "127.0.0.1",
      ingestToken: "a".repeat(64),
      environment: baseEnvironment
    });
    await first.close();
    first = null;
    const mismatchedEnvironment = {
      ...baseEnvironment,
      SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY: Buffer.from(
        "fedcba9876543210fedcba9876543210",
        "ascii"
      ).toString("base64url")
    } as const;
    await assert.rejects(
      () => startProductionServers({
        publicPort: 0,
        internalPort: 0,
        publicBindHost: "127.0.0.1",
        internalBindHost: "127.0.0.1",
        ingestToken: "a".repeat(64),
        environment: mismatchedEnvironment
      }),
      /SANDBOX_SECURITY_STARTUP_FAILED/
    );
  } finally {
    await first?.close().catch(() => undefined);
    rmSync(parent, { recursive: true, force: true });
  }
});
