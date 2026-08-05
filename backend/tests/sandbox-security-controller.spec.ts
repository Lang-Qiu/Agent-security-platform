import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";

import { AppModule } from "../src/app.module.ts";
import { InternalAppModule } from "../src/internal-app.module.ts";
import {
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError,
  SandboxSecurityClaimCleanupError,
  SandboxSecurityServiceError
} from "../src/modules/sandbox-security/sandbox-security.errors.ts";
import { toSandboxSecurityEngineRuntime } from "../src/modules/sandbox-security/ports/runtime.ts";
import * as sandboxSecurityBoundary from "../src/modules/sandbox-security/sandbox-security.module.ts";
import { createRuntimeDependencies } from "../src/runtime-dependencies.ts";

interface CapturedResponse {
  statusCode: number | undefined;
  body: unknown;
  headers: Record<string, string>;
}

function makeResponse(): CapturedResponse & ServerResponse {
  const captured: CapturedResponse = {
    statusCode: undefined,
    body: undefined,
    headers: {}
  };
  const response = {
    get statusCode() {
      return captured.statusCode as number;
    },
    set statusCode(value: number) {
      captured.statusCode = value;
    },
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
      return response;
    },
    end(value?: string) {
      captured.body = value === undefined ? undefined : JSON.parse(value);
      return response;
    }
  } as unknown as CapturedResponse & ServerResponse;

  Object.defineProperties(response, {
    body: {
      get: () => captured.body
    },
    headers: {
      get: () => captured.headers
    }
  });
  return response;
}

function makeRequest(method: string, url: string): IncomingMessage {
  return {
    method,
    url,
    headers: {}
  } as IncomingMessage;
}

async function invoke(
  handler: { handle(request: IncomingMessage, response: ServerResponse): Promise<void> },
  method: string,
  url: string
): Promise<CapturedResponse> {
  const response = makeResponse();
  await handler.handle(makeRequest(method, url), response);
  return response;
}

function fixedSuccessResponse(statusCode = 200): { statusCode: number; body: unknown } {
  return { statusCode, body: { success: true } };
}

function makeStructuralSandboxModule(calls: string[], rawCapabilityIds: string[]) {
  return {
    publicController: {
      async evaluate() {
        calls.push("evaluate");
        return fixedSuccessResponse();
      },
      async listAuditEvents() {
        calls.push("audit-read");
        return fixedSuccessResponse();
      }
    },
    adminController: {
      async issue() {
        calls.push("issue");
        return fixedSuccessResponse(201);
      },
      async revoke(
        _request: IncomingMessage,
        rawCapabilityIdSegment: string
      ) {
        calls.push("revoke");
        rawCapabilityIds.push(rawCapabilityIdSegment);
        return fixedSuccessResponse();
      },
      async purge() {
        calls.push("purge");
        return fixedSuccessResponse();
      }
    },
    async close() {}
  };
}

test("REQ-SBX-GENERAL-003 AppModule dispatches public sandbox routes to an injected module", async () => {
  const calls: string[] = [];
  const rawCapabilityIds: string[] = [];
  const sandboxModule = makeStructuralSandboxModule(calls, rawCapabilityIds);
  const appModule = new (AppModule as unknown as new (...args: unknown[]) => AppModule)(
    createRuntimeDependencies(),
    sandboxModule
  );

  const evaluation = await invoke(
    appModule,
    "POST",
    "/api/sandbox/security/evaluations"
  );
  const auditRead = await invoke(
    appModule,
    "GET",
    "/api/sandbox/security/audit-events"
  );

  assert.deepEqual(calls, ["evaluate", "audit-read"]);
  assert.equal(evaluation.statusCode, 200);
  assert.equal(auditRead.statusCode, 200);
  assert.deepEqual(rawCapabilityIds, []);
});

test("REQ-SBX-GENERAL-003 InternalAppModule dispatches admin sandbox routes and preserves revoke segment", async () => {
  const calls: string[] = [];
  const rawCapabilityIds: string[] = [];
  const sandboxModule = makeStructuralSandboxModule(calls, rawCapabilityIds);
  const deps = createRuntimeDependencies();
  const internalAppModule = new InternalAppModule({
    campaignRepository: deps.campaignRepository,
    taskRepository: deps.taskRepository,
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: sandboxModule
  } as never);

  const issue = await invoke(
    internalAppModule,
    "POST",
    "/internal/sandbox/security/capabilities"
  );
  const revoke = await invoke(
    internalAppModule,
    "POST",
    "/internal/sandbox/security/capabilities/capability%3A123/revoke"
  );
  const purge = await invoke(
    internalAppModule,
    "POST",
    "/internal/sandbox/security/audit-events/purge"
  );

  assert.deepEqual(calls, ["issue", "revoke", "purge"]);
  assert.deepEqual(rawCapabilityIds, ["capability%3A123"]);
  assert.equal(issue.statusCode, 201);
  assert.equal(revoke.statusCode, 200);
  assert.equal(purge.statusCode, 200);
});

test("REQ-SBX-GENERAL-003 existing AppModule health, task, supervision, and campaign routes remain dispatched", async () => {
  const calls: string[] = [];
  const sandboxModule = makeStructuralSandboxModule(calls, []);
  const appModule = new (AppModule as unknown as new (...args: unknown[]) => AppModule)(
    createRuntimeDependencies(),
    sandboxModule
  );

  const response = await invoke(appModule, "GET", "/health");
  const tasks = await invoke(appModule, "GET", "/api/tasks");
  const sessions = await invoke(
    appModule,
    "GET",
    "/api/supervision/sessions"
  );
  const campaigns = await invoke(
    appModule,
    "GET",
    "/api/supervision/campaigns"
  );

  assert.equal(response.statusCode, 200);
  assert.equal(tasks.statusCode, 200);
  assert.equal(sessions.statusCode, 200);
  assert.equal(campaigns.statusCode, 200);
  assert.deepEqual(calls, []);
});

test("REQ-SBX-GENERAL-003 recognized public sandbox route without module returns fixed internal error", async () => {
  const response = await invoke(
    new AppModule(createRuntimeDependencies()),
    "POST",
    "/api/sandbox/security/evaluations"
  );

  assert.equal(response.statusCode, 500);
  assert.equal(
    (response.body as { error_code?: string }).error_code,
    "INTERNAL_ERROR"
  );
});

test("REQ-SBX-GENERAL-003 recognized internal sandbox route without module returns fixed internal error", async () => {
  const deps = createRuntimeDependencies();
  const response = await invoke(
    new InternalAppModule({
      campaignRepository: deps.campaignRepository,
      taskRepository: deps.taskRepository,
      ingestToken: "a".repeat(64)
    }),
    "POST",
    "/internal/sandbox/security/capabilities"
  );

  assert.equal(response.statusCode, 500);
  assert.equal(
    (response.body as { error_code?: string }).error_code,
    "INTERNAL_ERROR"
  );
});

test("REQ-SBX-GENERAL-003 projects only the exact Engine runtime port", () => {
  const runtime = {
    now: () => "2026-08-05T00:00:00.000Z",
    monotonicNowMs: () => 12.5,
    randomBytes: () => new Uint8Array([1]),
    nextCapabilityId: () => "capability-1",
    nextAuditEventId: () => "event-1",
    nextDecisionId: () => "decision-1",
    scheduleTimeout: (_delayMs: number, callback: () => void) => {
      callback();
      return () => {};
    },
    scheduleInterval: () => ({
      unref() {},
      cancel() {}
    })
  };

  const projected = toSandboxSecurityEngineRuntime(runtime);

  assert.notEqual(projected, runtime);
  assert.equal(Object.isFrozen(projected), true);
  assert.deepEqual(Object.keys(projected), [
    "now",
    "nextDecisionId",
    "monotonicNowMs",
    "scheduleTimeout"
  ]);
  assert.equal(projected.now(), "2026-08-05T00:00:00.000Z");
  assert.equal(projected.nextDecisionId(), "decision-1");
  assert.equal(projected.monotonicNowMs(), 12.5);
  assert.equal("randomBytes" in projected, false);
  assert.equal("scheduleInterval" in projected, false);
});

test("REQ-SBX-GENERAL-003 exposes tagged claim cleanup and closed service errors", () => {
  assert.equal(typeof sandboxSecurityBoundary.toSandboxSecurityEngineRuntime, "function");
  assert.equal(
    sandboxSecurityBoundary.SandboxSecurityClaimCleanupError,
    SandboxSecurityClaimCleanupError
  );
  assert.equal(
    sandboxSecurityBoundary.createSandboxSecurityServiceError,
    createSandboxSecurityServiceError
  );
  assert.equal(
    sandboxSecurityBoundary.isSandboxSecurityServiceError,
    isSandboxSecurityServiceError
  );

  const cleanup = new SandboxSecurityClaimCleanupError();
  assert.equal(cleanup.name, "SandboxSecurityClaimCleanupError");
  assert.equal(cleanup.message, "SANDBOX_SECURITY_CLAIM_CLEANUP_FAILED");
  assert.equal(cleanup.code, "SANDBOX_SECURITY_CLAIM_CLEANUP_FAILED");

  const cases = [
    {
      descriptor: { code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED" as const },
      rejection: null,
      retry: null
    },
    {
      descriptor: {
        code: "SANDBOX_SECURITY_FORBIDDEN" as const,
        audit_rejection_code: "scope_forbidden" as const
      },
      rejection: "scope_forbidden",
      retry: null
    },
    {
      descriptor: {
        code: "SANDBOX_SECURITY_FORBIDDEN" as const,
        audit_rejection_code: "stage_forbidden" as const
      },
      rejection: "stage_forbidden",
      retry: null
    },
    {
      descriptor: {
        code: "SANDBOX_SECURITY_FORBIDDEN" as const,
        audit_rejection_code: "profile_forbidden" as const
      },
      rejection: "profile_forbidden",
      retry: null
    },
    {
      descriptor: { code: "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND" as const },
      rejection: null,
      retry: null
    },
    {
      descriptor: {
        code: "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID" as const,
        audit_rejection_code: "invalid_request" as const
      },
      rejection: "invalid_request",
      retry: null
    },
    {
      descriptor: {
        code: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT" as const,
        audit_rejection_code: "idempotency_conflict" as const
      },
      rejection: "idempotency_conflict",
      retry: null
    },
    {
      descriptor: {
        code: "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS" as const,
        audit_rejection_code: "idempotency_in_progress" as const
      },
      rejection: "idempotency_in_progress",
      retry: 1
    },
    {
      descriptor: {
        code: "SANDBOX_SECURITY_CONCURRENCY_LIMITED" as const,
        audit_rejection_code: "concurrency_limited" as const
      },
      rejection: "concurrency_limited",
      retry: 1
    },
    {
      descriptor: {
        code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE" as const,
        audit_rejection_code: "storage_unavailable" as const
      },
      rejection: "storage_unavailable",
      retry: 60
    },
    {
      descriptor: { code: "SANDBOX_SECURITY_INTERNAL_ERROR" as const },
      rejection: null,
      retry: null
    }
  ] as const;

  for (const item of cases) {
    const error = createSandboxSecurityServiceError(item.descriptor);
    assert.ok(error instanceof SandboxSecurityServiceError);
    assert.equal(isSandboxSecurityServiceError(error), true);
    assert.equal(error.code, item.descriptor.code);
    assert.equal(error.audit_rejection_code, item.rejection);
    assert.equal(error.retry_after_seconds, item.retry);
    assert.equal(isSandboxSecurityServiceError(new Error("other")), false);
  }

  assert.throws(
    () =>
      createSandboxSecurityServiceError({
        code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
        audit_rejection_code: "idempotency_in_progress"
      } as never),
    TypeError
  );
  assert.throws(
    () =>
      createSandboxSecurityServiceError({
        code: "SANDBOX_SECURITY_INTERNAL_ERROR",
        unexpected: true
      } as never),
    TypeError
  );
});
