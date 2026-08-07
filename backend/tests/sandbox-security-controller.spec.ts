import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

import { AppModule } from "../src/app.module.ts";
import { InternalAppModule } from "../src/internal-app.module.ts";
import { DomainError } from "../src/common/errors/domain-error.ts";
import { writeJsonResponse } from "../src/common/http/http-response.ts";
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

type FakeIncomingMessage = EventEmitter & {
  rawHeaders: string[];
  headers: Record<string, string | string[] | undefined>;
  complete: boolean;
  aborted: boolean;
  destroyed: boolean;
  pause(): void;
  [Symbol.asyncIterator](): AsyncIterator<Buffer | string, undefined>;
};

type StreamFixture = EventEmitter & {
  rawHeaders: string[];
  headers: Record<string, string>;
  complete: boolean;
  readableEnded?: boolean;
  aborted: boolean;
  destroyed: boolean;
  pause(): void;
  [Symbol.asyncIterator](): AsyncIterator<any, undefined>;
};

function makeRawRequest(input: Readonly<{
  rawHeaders?: readonly string[];
  headers?: Record<string, string | string[] | undefined>;
  chunks?: readonly (Buffer | string)[];
}>): IncomingMessage {
  const request = new EventEmitter() as unknown as FakeIncomingMessage;
  request.rawHeaders = [...(input.rawHeaders ?? [])];
  request.headers = input.headers ?? {};
  request.complete = true;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  const chunks = [...(input.chunks ?? [])];
  request[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer | string, undefined> {
    for (const chunk of chunks) yield chunk;
    return undefined;
  };
  return request as unknown as IncomingMessage;
}

function makeDeferredBodylessRequest(input: Readonly<{
  rawHeaders: readonly string[];
}>): Readonly<{
  request: IncomingMessage & EventEmitter;
  push(chunk: Buffer | string): void;
  end(): void;
}> {
  const request = new EventEmitter() as unknown as FakeIncomingMessage;
  request.rawHeaders = [...input.rawHeaders];
  request.headers = {};
  request.complete = false;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  const chunks: (Buffer | string)[] = [];
  request[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer | string, undefined> {
    while (!request.complete || chunks.length > 0) {
      if (chunks.length === 0) {
        await new Promise<void>((resolve) => request.once("sandbox:data", resolve));
      }
      while (chunks.length > 0) yield chunks.shift()!;
    }
    return undefined;
  };
  return {
    request: request as unknown as IncomingMessage & EventEmitter,
    push(chunk) {
      chunks.push(chunk);
      request.emit("sandbox:data");
    },
    end() {
      request.complete = true;
      request.emit("sandbox:data");
    }
  };
}

function makeNoIteratorRequest(input: Readonly<{
  rawHeaders: readonly string[];
  complete: boolean;
}>): IncomingMessage {
  const request = {
    rawHeaders: [...input.rawHeaders],
    headers: {},
    complete: input.complete,
    aborted: false,
    destroyed: false,
    pause() {}
  } as unknown as IncomingMessage;
  return request;
}

function hasHttpError(
  statusCode: number,
  code: string,
  options: Readonly<{ close_after_response?: boolean }> = {}
): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof sandboxSecurityBoundary.SandboxSecurityHttpError &&
    error.statusCode === statusCode &&
    error.code === code &&
    (options.close_after_response === undefined ||
      error.close_after_response === options.close_after_response);
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

test("REQ-SBX-GENERAL-003 preserves existing generic error responses after request cleanup", async () => {
  const appModule = new (AppModule as unknown as new (...args: unknown[]) => AppModule)(
    createRuntimeDependencies()
  );
  (appModule.taskCenterModule.controller as unknown as {
    listTasks(): never;
  }).listTasks = () => {
    throw new DomainError("Existing route failure", "EXISTING_ROUTE_FAILURE", 400);
  };
  const request = {
    method: "GET",
    url: "/api/tasks",
    headers: {},
    rawHeaders: [],
    aborted: true,
    destroyed: true,
    complete: false,
    readableEnded: false,
    socket: { destroyed: true }
  } as unknown as IncomingMessage;
  const response = makeResponse();
  await appModule.handle(request, response);
  assert.equal(response.statusCode, 400);
  assert.equal(
    (response.body as { error_code?: string }).error_code,
    "EXISTING_ROUTE_FAILURE"
  );
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

test("REQ-SBX-GENERAL-003 rejects duplicate Authorization from rawHeaders", () => {
  assert.equal(typeof sandboxSecurityBoundary.readSandboxSecurityBearer, "function");
  const request = makeRawRequest({
    rawHeaders: [
      "Authorization", "Bearer sbxcap_v1." + "A".repeat(43),
      "authorization", "Bearer sbxcap_v1." + "B".repeat(43)
    ]
  });
  assert.throws(
    () => sandboxSecurityBoundary.readSandboxSecurityBearer(request, "public"),
    (error: unknown) =>
      error instanceof sandboxSecurityBoundary.SandboxSecurityHttpError &&
      error.statusCode === 401 &&
      error.code === "SANDBOX_SECURITY_UNAUTHORIZED"
  );
});

test("REQ-SBX-GENERAL-003 fails closed when rawHeaders is missing", () => {
  const request = makeRawRequest({
    headers: {
      authorization: "Bearer sbxcap_v1." + "A".repeat(43)
    }
  });
  delete (request as unknown as { rawHeaders?: unknown }).rawHeaders;
  assert.throws(
    () => sandboxSecurityBoundary.readSandboxSecurityBearer(request, "public"),
    hasHttpError(401, "SANDBOX_SECURITY_UNAUTHORIZED")
  );
});

test("REQ-SBX-GENERAL-003 fails closed when rawHeaders is not an array", () => {
  const request = makeRawRequest({
    headers: {
      authorization: "Bearer sbxcap_v1." + "A".repeat(43)
    }
  });
  (request as unknown as { rawHeaders: unknown }).rawHeaders = {
    authorization: "Bearer sbxcap_v1." + "A".repeat(43)
  };
  assert.throws(
    () => sandboxSecurityBoundary.readSandboxSecurityBearer(request, "public"),
    hasHttpError(401, "SANDBOX_SECURITY_UNAUTHORIZED")
  );
});

test("REQ-SBX-GENERAL-003 bodyless admission fails closed without an iterator before completion", async () => {
  const request = makeNoIteratorRequest({
    rawHeaders: ["Content-Length", "0"],
    complete: false
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.assertSandboxSecurityBodyless(request),
    hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
});

test("REQ-SBX-GENERAL-003 enforces exact bearer and idempotency-key grammar", () => {
  const validToken = "sbxcap_v1." + "A".repeat(43);
  const bearerCases = [
    undefined,
    "Basic " + validToken,
    "Bearer  " + validToken,
    " Bearer " + validToken,
    "Bearer " + validToken + " "
  ];
  for (const value of bearerCases) {
    const request = makeRawRequest({
      rawHeaders: value === undefined ? [] : ["Authorization", value]
    });
    assert.throws(
      () => sandboxSecurityBoundary.readSandboxSecurityBearer(request, "public"),
      hasHttpError(401, "SANDBOX_SECURITY_UNAUTHORIZED")
    );
  }
  for (const value of ["A".repeat(15), "A".repeat(129), "A".repeat(16), "A".repeat(128)]) {
    const request = makeRawRequest({ rawHeaders: ["Idempotency-Key", value] });
    if (value.length === 16 || value.length === 128) {
      assert.equal(sandboxSecurityBoundary.readSandboxSecurityIdempotencyKey(request), value);
    } else {
      assert.throws(
        () => sandboxSecurityBoundary.readSandboxSecurityIdempotencyKey(request),
        hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
      );
    }
  }
  assert.throws(
    () => sandboxSecurityBoundary.readSandboxSecurityIdempotencyKey(
      makeRawRequest({
        rawHeaders: [
          "Idempotency-Key", "A".repeat(16),
          "idempotency-key", "B".repeat(16)
        ]
      })
    ),
    hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
});

test("REQ-SBX-GENERAL-003 enforces administrator bearer grammar and duplicate rejection", () => {
  const valid = "bootstrap-admin-secret";
  assert.equal(
    sandboxSecurityBoundary.readSandboxSecurityBearer(
      makeRawRequest({ rawHeaders: ["Authorization", `Bearer ${valid}`] }),
      "administrator"
    ),
    valid
  );
  for (const value of [undefined, "Basic secret", "Bearer  secret", "Bearer secret "]) {
    const request = makeRawRequest({
      rawHeaders: value === undefined ? [] : ["Authorization", value]
    });
    assert.throws(
      () => sandboxSecurityBoundary.readSandboxSecurityBearer(request, "administrator"),
      hasHttpError(401, "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED")
    );
  }
  assert.throws(
    () => sandboxSecurityBoundary.readSandboxSecurityBearer(
      makeRawRequest({
        rawHeaders: [
          "Authorization", `Bearer ${valid}`,
          "authorization", `Bearer ${valid}`
        ]
      }),
      "administrator"
    ),
    hasHttpError(401, "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED")
  );
});

test("REQ-SBX-GENERAL-003 rejects content encoding, invalid transfer codings, and missing framing", async () => {
  for (const rawHeaders of [
    ["Content-Type", "application/json", "Content-Length", "2", "Content-Encoding", "identity"],
    ["Content-Type", "application/json", "Transfer-Encoding", "gzip"],
    ["Content-Type", "application/json", "Transfer-Encoding", "chunked, chunked"],
    ["Content-Type", "application/json"]
  ]) {
    await assert.rejects(
      () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(
        makeRawRequest({ rawHeaders, chunks: [Buffer.from("{}")] }),
        { max_bytes: 65536, deadline_ms: 5000 }
      ),
      hasHttpError(
        rawHeaders.includes("Content-Encoding") ? 415 : 400,
        rawHeaders.includes("Content-Encoding")
          ? "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE"
          : "SANDBOX_SECURITY_INVALID_REQUEST"
      )
    );
  }
});

test("REQ-SBX-GENERAL-003 rejects declared/observed length mismatch and counts chunked bytes incrementally", async () => {
  const mismatch = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Content-Length", "3"],
    chunks: [Buffer.from("{}")]
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(mismatch, {
      max_bytes: 65536,
      deadline_ms: 5000
    }),
    hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );

  let pauseCalls = 0;
  let nextCalls = 0;
  const chunks = [Buffer.alloc(40000, 0x61), Buffer.alloc(40000, 0x61)];
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Type", "application/json", "Transfer-Encoding", "chunked"];
  request.headers = {};
  request.complete = true;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => {
    pauseCalls += 1;
  };
  request[Symbol.asyncIterator] = () => ({
    next: async () => {
      nextCalls += 1;
      const value = chunks.shift();
      return value === undefined
        ? { done: true, value: undefined }
        : { done: false, value };
    },
    return: async () => ({ done: true, value: undefined })
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request as unknown as IncomingMessage, {
      max_bytes: 65536,
      deadline_ms: 5000
    } as never),
    hasHttpError(413, "SANDBOX_SECURITY_BODY_TOO_LARGE", {
      close_after_response: true
    })
  );
  assert.equal(pauseCalls, 1);
  assert.equal(nextCalls, 2);
});

test("REQ-SBX-GENERAL-003 rejects over-limit declarations before starting iteration", async () => {
  let nextCalls = 0;
  let pauseCalls = 0;
  const request = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Content-Length", "65537"],
    chunks: [Buffer.from("{}")]
  }) as unknown as StreamFixture;
  request.pause = () => {
    pauseCalls += 1;
  };
  request[Symbol.asyncIterator] = () => ({
    next: async () => {
      nextCalls += 1;
      return { done: true, value: undefined };
    },
    return: async () => ({ done: true, value: undefined })
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request as unknown as IncomingMessage, {
      max_bytes: 65536,
      deadline_ms: 5000
    }),
    hasHttpError(413, "SANDBOX_SECURITY_BODY_TOO_LARGE", {
      close_after_response: true
    })
  );
  assert.equal(nextCalls, 0);
  assert.equal(pauseCalls, 1);
});

test("REQ-SBX-GENERAL-003 enforces the 65536-byte boundary", async () => {
  const exact = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Content-Length", "65536"],
    chunks: [Buffer.from(`"${"a".repeat(65534)}"`)]
  });
  assert.equal(
    (await sandboxSecurityBoundary.readSandboxSecurityJsonBody(exact, {
      max_bytes: 65536,
      deadline_ms: 5000
    })).byte_length,
    65536
  );
  const over = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Content-Length", "65537"],
    chunks: [Buffer.from(`"${"a".repeat(65535)}"`)]
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(over, {
      max_bytes: 65536,
      deadline_ms: 5000
    }),
    hasHttpError(413, "SANDBOX_SECURITY_BODY_TOO_LARGE", {
      close_after_response: true
    })
  );
});

test("REQ-SBX-GENERAL-003 rejects duplicate media, encoding, and framing headers", async () => {
  const duplicateCases = [
    ["Content-Type", "application/json", "content-type", "application/json", 415, "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE"],
    ["Content-Encoding", "identity", "content-encoding", "identity", 415, "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE"],
    ["Content-Length", "2", "content-length", "2", 400, "SANDBOX_SECURITY_INVALID_REQUEST"],
    ["Transfer-Encoding", "chunked", "transfer-encoding", "chunked", 400, "SANDBOX_SECURITY_INVALID_REQUEST"]
  ] as const;
  for (const [name, value, name2, value2, statusCode, code] of duplicateCases) {
    const request = makeRawRequest({
      rawHeaders: [name, value, name2, value2, "Content-Length", "2"],
      chunks: [Buffer.from("{}")]
    });
    await assert.rejects(
      () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request, {
        max_bytes: 65536,
        deadline_ms: 5000
      }),
      hasHttpError(statusCode, code)
    );
  }
});

test("REQ-SBX-GENERAL-003 applies media grammar and framing exclusivity", async () => {
  const acceptedMedia = [
    " APPLICATION/JSON ",
    "application/json; charset=utf-8",
    "Application/Json;Charset=UTF-8"
  ];
  for (const contentType of acceptedMedia) {
    const request = makeRawRequest({
      rawHeaders: ["Content-Type", contentType, "Content-Length", "2"],
      chunks: [Buffer.from("{}")]
    });
    assert.deepEqual(
      (await sandboxSecurityBoundary.readSandboxSecurityJsonBody(request, {
        max_bytes: 65536,
        deadline_ms: 5000
      })).value,
      {}
    );
  }
  for (const contentType of [
    "application/json; charset=\"utf-8\"",
    "application/json; charset=utf-8; foo=bar",
    "text/application/json",
    "application/json\n"
  ]) {
    const request = makeRawRequest({
      rawHeaders: ["Content-Type", contentType, "Content-Length", "2"],
      chunks: [Buffer.from("{}")]
    });
    await assert.rejects(
      () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request, {
        max_bytes: 65536,
        deadline_ms: 5000
      }),
      hasHttpError(415, "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE")
    );
  }
  const chunked = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Transfer-Encoding", "chunked"],
    chunks: [Buffer.from("{}")]
  });
  assert.deepEqual(
    (await sandboxSecurityBoundary.readSandboxSecurityJsonBody(chunked, {
      max_bytes: 65536,
      deadline_ms: 5000
    })).value,
    {}
  );
  const both = makeRawRequest({
    rawHeaders: [
      "Content-Type", "application/json",
      "Content-Length", "2",
      "Transfer-Encoding", "chunked"
    ],
    chunks: [Buffer.from("{}")]
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(both, {
      max_bytes: 65536,
      deadline_ms: 5000
    }),
    hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
});

test("REQ-SBX-GENERAL-003 rejects malformed/empty JSON and canonical length violations", async () => {
  for (const chunks of [[], [Buffer.from(" ")], [Buffer.from("{")]]) {
    const request = makeRawRequest({
      rawHeaders: ["Content-Type", "application/json", "Content-Length", String(Buffer.concat(chunks).byteLength)],
      chunks
    });
    await assert.rejects(
      () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request, {
        max_bytes: 65536,
        deadline_ms: 5000
      }),
      hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
  }
  for (const contentLength of ["+2", "02", " 2", "2 "]) {
    const request = makeRawRequest({
      rawHeaders: ["Content-Type", "application/json", "Content-Length", contentLength],
      chunks: [Buffer.from("{}")]
    });
    await assert.rejects(
      () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request, {
        max_bytes: 65536,
        deadline_ms: 5000
      }),
      hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
  }
});

test("REQ-SBX-GENERAL-004 shared body admission rejects duplicate and malformed JSON structures", async () => {
  let nested = "0";
  for (let index = 0; index < 130; index += 1) nested = `[${nested}]`;
  const bodies = [
    '{"action":"allow","action":"allow"}',
    '{"outer":{"key":1,"key":1}}',
    `{"outer":[{"key":1,"key":1}],"depth":${nested}}`,
    '{"action":"\\uZZZZ"}',
    '{"action":truex}'
  ];
  for (const body of bodies) {
    const request = makeRawRequest({
      rawHeaders: ["Content-Type", "application/json", "Content-Length", String(Buffer.byteLength(body))],
      chunks: [Buffer.from(body)]
    });
    await assert.rejects(
      () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request, {
        max_bytes: 65536,
        deadline_ms: 5000
      }),
      hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
  }
  const valid = '{"action":"allow","nested":{"value":[1,2,3]}}';
  const validRequest = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Content-Length", String(Buffer.byteLength(valid))],
    chunks: [Buffer.from(valid)]
  });
  assert.deepEqual(
    (await sandboxSecurityBoundary.readSandboxSecurityJsonBody(validRequest, {
      max_bytes: 65536,
      deadline_ms: 5000
    })).value,
    { action: "allow", nested: { value: [1, 2, 3] } }
  );
});

test("REQ-SBX-GENERAL-003 body admission times out and rejects caller abort", async () => {
  const slow = new EventEmitter() as unknown as StreamFixture;
  slow.rawHeaders = ["Content-Type", "application/json", "Transfer-Encoding", "chunked"];
  slow.headers = {};
  slow.aborted = false;
  slow.destroyed = false;
  slow.pause = () => undefined;
  slow[Symbol.asyncIterator] = () => ({
    next: () => new Promise<IteratorResult<Buffer, undefined>>(() => {}),
    return: async () => ({ done: true, value: undefined })
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(slow as unknown as IncomingMessage, {
      max_bytes: 65536,
      deadline_ms: 5000
    }),
    hasHttpError(408, "SANDBOX_SECURITY_REQUEST_TIMEOUT", { close_after_response: true })
  );

  const aborted = new EventEmitter() as unknown as StreamFixture;
  aborted.rawHeaders = ["Content-Type", "application/json", "Transfer-Encoding", "chunked"];
  aborted.headers = {};
  aborted.aborted = false;
  aborted.destroyed = false;
  aborted[Symbol.asyncIterator] = () => ({
    next: () => new Promise<IteratorResult<Buffer, undefined>>(() => {}),
    return: async () => ({ done: true, value: undefined })
  });
  const attempt = sandboxSecurityBoundary.readSandboxSecurityJsonBody(aborted as unknown as IncomingMessage, {
    max_bytes: 65536,
    deadline_ms: 5000
  });
  aborted.aborted = true;
  aborted.emit("aborted");
  await assert.rejects(
    attempt,
    hasHttpError(408, "SANDBOX_SECURITY_REQUEST_TIMEOUT", { close_after_response: true })
  );
});

test("REQ-SBX-GENERAL-003 ignores normal close after a complete body", async () => {
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Type", "application/json", "Content-Length", "2"];
  request.headers = {};
  request.complete = false;
  request.readableEnded = false;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  let index = 0;
  request[Symbol.asyncIterator] = () => ({
    next: async () => {
      if (index++ === 0) return { done: false, value: Buffer.from("{}") };
      return await new Promise<IteratorResult<Buffer, undefined>>((resolve) => {
        queueMicrotask(() => {
          request.complete = true;
          request.readableEnded = true;
          request.destroyed = true;
          request.emit("close");
          setImmediate(() => resolve({ done: true, value: undefined }));
        });
      });
    },
    return: async () => ({ done: true, value: undefined })
  });
  const result = await sandboxSecurityBoundary.readSandboxSecurityJsonBody(request as unknown as IncomingMessage, {
    max_bytes: 65536,
    deadline_ms: 5000
  });
  assert.deepEqual(result.value, {});
});

test("REQ-SBX-GENERAL-003 does not remap a normal-EOF iterator error as timeout", async () => {
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Type", "application/json", "Transfer-Encoding", "chunked"];
  request.headers = {};
  request.complete = false;
  request.readableEnded = false;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  let index = 0;
  request[Symbol.asyncIterator] = () => ({
    next: async () => {
      if (index++ === 0) return { done: false, value: Buffer.from("{}") };
      request.complete = true;
      request.readableEnded = true;
      request.destroyed = true;
      throw new Error("normal-end-stream-error");
    },
    return: async () => ({ done: true, value: undefined })
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(
      request as unknown as IncomingMessage,
      { max_bytes: 65536, deadline_ms: 5000 }
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "normal-end-stream-error"
  );
});

test("REQ-SBX-GENERAL-003 preserves a normal EOF body state when request is already destroyed", async () => {
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Type", "application/json", "Content-Length", "0"];
  request.headers = {};
  request.complete = true;
  request.readableEnded = true;
  request.aborted = false;
  request.destroyed = true;
  request.pause = () => undefined;
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(
      request as unknown as IncomingMessage,
      { max_bytes: 65536, deadline_ms: 5000 }
    ),
    hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
});

test("REQ-SBX-GENERAL-003 allows bodyless admission after normal EOF destroyed state", async () => {
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Length", "0"];
  request.headers = {};
  request.complete = true;
  request.readableEnded = true;
  request.aborted = false;
  request.destroyed = true;
  request.pause = () => undefined;
  await sandboxSecurityBoundary.assertSandboxSecurityBodyless(
    request as unknown as IncomingMessage
  );
});

test("REQ-SBX-GENERAL-003 treats close before completion as caller abort", async () => {
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Type", "application/json", "Transfer-Encoding", "chunked"];
  request.headers = {};
  request.complete = false;
  request.readableEnded = false;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  request[Symbol.asyncIterator] = () => ({
    next: () => new Promise<IteratorResult<Buffer, undefined>>((resolve) => {
      setImmediate(() => {
        request.destroyed = true;
        request.emit("close");
        void resolve;
      });
    }),
    return: async () => ({ done: true, value: undefined })
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request as unknown as IncomingMessage, {
      max_bytes: 65536,
      deadline_ms: 5000
    }),
    hasHttpError(408, "SANDBOX_SECURITY_REQUEST_TIMEOUT", {
      close_after_response: true
    })
  );
});

test("REQ-SBX-GENERAL-003 ignores normal close after bodyless completion", async () => {
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Length", "0"];
  request.headers = {};
  request.complete = false;
  request.readableEnded = false;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  request[Symbol.asyncIterator] = () => ({
    next: () => new Promise<IteratorResult<Buffer, undefined>>((resolve) => {
      queueMicrotask(() => {
        request.complete = true;
        request.readableEnded = true;
        request.destroyed = true;
        request.emit("close");
        setImmediate(() => resolve({ done: true, value: undefined }));
      });
    }),
    return: async () => ({ done: true, value: undefined })
  });
  await sandboxSecurityBoundary.assertSandboxSecurityBodyless(request as unknown as IncomingMessage);
});

test("REQ-SBX-GENERAL-003 real node http normal close does not reject a complete JSON body", async () => {
  const server = createServer((request, response) => {
    void sandboxSecurityBoundary.readSandboxSecurityJsonBody(request, {
      max_bytes: 65536,
      deadline_ms: 5000
    }).then(
      (body) => {
        response.statusCode = 200;
        response.end(JSON.stringify(body.value));
      },
      (error: unknown) => {
        const httpError = error as { statusCode?: number };
        response.statusCode = httpError.statusCode ?? 500;
        response.end();
      }
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const response = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
    const client = httpRequest({
      host: "127.0.0.1",
      port: address.port,
      method: "POST",
      path: "/",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "2"
      }
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => resolve({
        statusCode: incoming.statusCode,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    client.on("error", reject);
    client.end("{}");
  });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "{}");
});

test("REQ-SBX-GENERAL-003 does not block timeout delivery on a hanging iterator cleanup", async () => {
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Type", "application/json", "Transfer-Encoding", "chunked"];
  request.headers = {};
  request.complete = false;
  request.aborted = false;
  request.destroyed = false;
  request[Symbol.asyncIterator] = () => ({
    next: () => new Promise<IteratorResult<Buffer, undefined>>(() => {}),
    return: () => new Promise<IteratorResult<Buffer, undefined>>(() => {})
  });
  const attempt = sandboxSecurityBoundary.readSandboxSecurityJsonBody(
    request as unknown as IncomingMessage,
    { max_bytes: 65536, deadline_ms: 5000 }
  );
  request.aborted = true;
  request.emit("aborted");
  const outcome = await Promise.race([
    attempt.then(
      () => "resolved",
      (error: unknown) => error
    ),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 100))
  ]);
  assert.notEqual(outcome, "pending");
  assert.ok(hasHttpError(408, "SANDBOX_SECURITY_REQUEST_TIMEOUT", {
    close_after_response: true
  })(outcome));
});

test("REQ-SBX-GENERAL-003 over-limit rejection does not close the request through iterator cleanup", async () => {
  let returnCalls = 0;
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Type", "application/json", "Transfer-Encoding", "chunked"];
  request.headers = {};
  request.complete = true;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  request[Symbol.asyncIterator] = () => ({
    next: async () => ({ done: false, value: Buffer.alloc(65537, 0x61) }),
    return: async () => {
      returnCalls += 1;
      request.destroyed = true;
      return { done: true, value: undefined };
    }
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(
      request as unknown as IncomingMessage,
      { max_bytes: 65536, deadline_ms: 5000 }
    ),
    hasHttpError(413, "SANDBOX_SECURITY_BODY_TOO_LARGE", {
      close_after_response: true
    })
  );
  assert.equal(returnCalls, 0);
  assert.equal(request.destroyed, false);
});

test("REQ-SBX-GENERAL-003 timeout rejection does not close the request through iterator cleanup", async () => {
  let returnCalls = 0;
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Type", "application/json", "Transfer-Encoding", "chunked"];
  request.headers = {};
  request.complete = false;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  request[Symbol.asyncIterator] = () => ({
    next: () => new Promise<IteratorResult<Buffer, undefined>>(() => {}),
    return: async () => {
      returnCalls += 1;
      request.destroyed = true;
      return { done: true, value: undefined };
    }
  });
  const attempt = sandboxSecurityBoundary.readSandboxSecurityJsonBody(
    request as unknown as IncomingMessage,
    { max_bytes: 65536, deadline_ms: 5000 }
  );
  request.aborted = true;
  request.emit("aborted");
  await assert.rejects(
    attempt,
    hasHttpError(408, "SANDBOX_SECURITY_REQUEST_TIMEOUT", {
      close_after_response: true
    })
  );
  assert.equal(returnCalls, 0);
  assert.equal(request.destroyed, false);
});

test("REQ-SBX-GENERAL-003 bodyless admission does not block abort delivery on hanging cleanup", async () => {
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = ["Content-Length", "0"];
  request.headers = {};
  request.complete = false;
  request.aborted = false;
  request.destroyed = false;
  request[Symbol.asyncIterator] = () => ({
    next: () => new Promise<IteratorResult<Buffer, undefined>>(() => {}),
    return: () => new Promise<IteratorResult<Buffer, undefined>>(() => {})
  });
  const attempt = sandboxSecurityBoundary.assertSandboxSecurityBodyless(
    request as unknown as IncomingMessage
  );
  request.aborted = true;
  request.emit("aborted");
  const outcome = await Promise.race([
    attempt.then(
      () => "resolved",
      (error: unknown) => error
    ),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 100))
  ]);
  assert.notEqual(outcome, "pending");
  assert.ok(hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")(outcome));
});

test("REQ-SBX-GENERAL-003 bodyless framing rejects declared bodies and accepts empty chunks", async () => {
  for (const rawHeaders of [
    ["Content-Length", "1"],
    ["Content-Length", "x"],
    ["Transfer-Encoding", "chunked"]
  ]) {
    await assert.rejects(
      () => sandboxSecurityBoundary.assertSandboxSecurityBodyless(
        makeRawRequest({ rawHeaders })
      ),
      hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
  }
  const emptyChunks = makeRawRequest({
    rawHeaders: ["Content-Length", "0"],
    chunks: [Buffer.alloc(0), ""]
  });
  await sandboxSecurityBoundary.assertSandboxSecurityBodyless(emptyChunks);
});

test("REQ-SBX-GENERAL-003 audit query rejects unknown/duplicate/invalid values", () => {
  const invalidQueries = [
    "?unknown=value",
    "?limit=1&limit=2",
    "?cursor=a%ZZ",
    "?cursor=",
    "?limit=0",
    "?limit=101",
    "?limit=01",
    "?limit=+1",
    `?cursor=${"a".repeat(2049)}`,
    "?cursor=%E2%82%AC"
  ];
  for (const query of invalidQueries) {
    assert.throws(
      () => sandboxSecurityBoundary.parseSandboxSecurityAuditQuery(
        `/api/sandbox/security/audit-events${query}`
      ),
      hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
  }
});

test("REQ-SBX-GENERAL-003 reads the exact UTF-8 body limit and rejects one more byte", async () => {
  const exact = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Content-Length", "786432"],
    chunks: [Buffer.from(`"${"a".repeat(786430)}"`)]
  });
  const read = await sandboxSecurityBoundary.readSandboxSecurityJsonBody(exact, {
    max_bytes: 786432,
    deadline_ms: 5000
  });
  assert.equal(read.byte_length, 786432);
  assert.equal(read.value, "a".repeat(786430));

  const over = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Content-Length", "786433"],
    chunks: [Buffer.from(`"${"a".repeat(786431)}"`)]
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(over, {
      max_bytes: 786432,
      deadline_ms: 5000
    }),
    (error: unknown) =>
      error instanceof sandboxSecurityBoundary.SandboxSecurityHttpError &&
      error.statusCode === 413 &&
      error.code === "SANDBOX_SECURITY_BODY_TOO_LARGE" &&
      error.close_after_response === true
  );
});

test("REQ-SBX-GENERAL-003 rejects invalid UTF-8 before JSON parsing", async () => {
  const request = makeRawRequest({
    rawHeaders: ["Content-Type", "application/json", "Content-Length", "2"],
    chunks: [Buffer.from([0xc3, 0x28])]
  });
  await assert.rejects(
    () => sandboxSecurityBoundary.readSandboxSecurityJsonBody(request, {
      max_bytes: 65536,
      deadline_ms: 5000
    }),
    (error: unknown) =>
      error instanceof sandboxSecurityBoundary.SandboxSecurityHttpError &&
      error.code === "SANDBOX_SECURITY_INVALID_REQUEST" &&
      error.statusCode === 400
  );
});

test("REQ-SBX-GENERAL-003 bodyless admission rejects a delayed observed byte", async () => {
  const fixture = makeDeferredBodylessRequest({
    rawHeaders: ["Content-Length", "0"]
  });
  const admission = sandboxSecurityBoundary.assertSandboxSecurityBodyless(fixture.request);
  queueMicrotask(() => {
    fixture.push(Buffer.from("x", "ascii"));
    fixture.end();
  });
  await assert.rejects(
    admission,
    (error: unknown) =>
      error instanceof sandboxSecurityBoundary.SandboxSecurityHttpError &&
      error.statusCode === 400 &&
      error.code === "SANDBOX_SECURITY_INVALID_REQUEST"
  );
});

test("REQ-SBX-GENERAL-003 rejects an already aborted bodyless request", async () => {
  const request = makeRawRequest({ rawHeaders: ["Content-Length", "0"] });
  (request as IncomingMessage & { aborted: boolean }).aborted = true;
  await assert.rejects(
    () => sandboxSecurityBoundary.assertSandboxSecurityBodyless(request),
    (error: unknown) =>
      error instanceof sandboxSecurityBoundary.SandboxSecurityHttpError &&
      error.statusCode === 400 &&
      error.code === "SANDBOX_SECURITY_INVALID_REQUEST"
  );
});

test("REQ-SBX-GENERAL-003 parses only the bounded audit cursor and limit query", () => {
  assert.deepEqual(
    sandboxSecurityBoundary.parseSandboxSecurityAuditQuery(
      "/api/sandbox/security/audit-events?limit=100&cursor=opaque"
    ),
    { cursor: "opaque", limit: 100 }
  );
  assert.deepEqual(
    sandboxSecurityBoundary.parseSandboxSecurityAuditQuery(
      "/api/sandbox/security/audit-events"
    ),
    { limit: 50 }
  );
  assert.throws(
    () => sandboxSecurityBoundary.parseSandboxSecurityAuditQuery(
      "/api/sandbox/security/audit-events?limit=01"
    ),
    (error: unknown) =>
      error instanceof sandboxSecurityBoundary.SandboxSecurityHttpError &&
      error.code === "SANDBOX_SECURITY_INVALID_REQUEST"
  );
});

test("REQ-SBX-GENERAL-003 maps every service error to stable HTTP metadata", () => {
  const cases = [
    ["SANDBOX_SECURITY_ADMIN_UNAUTHORIZED", 401, undefined],
    ["SANDBOX_SECURITY_FORBIDDEN", 403, undefined],
    ["SANDBOX_SECURITY_CAPABILITY_NOT_FOUND", 404, undefined],
    ["SANDBOX_SECURITY_AUDIT_CURSOR_INVALID", 400, undefined],
    ["SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT", 409, undefined],
    ["SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS", 409, 1],
    ["SANDBOX_SECURITY_CONCURRENCY_LIMITED", 429, 1],
    ["SANDBOX_SECURITY_STORAGE_UNAVAILABLE", 503, 60],
    ["SANDBOX_SECURITY_INTERNAL_ERROR", 500, undefined]
  ] as const;
  for (const [code, statusCode, retryAfter] of cases) {
    const descriptor = code === "SANDBOX_SECURITY_FORBIDDEN"
      ? { code, audit_rejection_code: "scope_forbidden" as const }
      : code === "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID"
        ? { code, audit_rejection_code: "invalid_request" as const }
        : code === "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT"
          ? { code, audit_rejection_code: "idempotency_conflict" as const }
          : code === "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS"
            ? { code, audit_rejection_code: "idempotency_in_progress" as const }
            : code === "SANDBOX_SECURITY_CONCURRENCY_LIMITED"
              ? { code, audit_rejection_code: "concurrency_limited" as const }
              : code === "SANDBOX_SECURITY_STORAGE_UNAVAILABLE"
                ? { code, audit_rejection_code: "storage_unavailable" as const }
                : { code };
    const httpError = sandboxSecurityBoundary.sandboxSecurityServiceErrorToHttpError(
      createSandboxSecurityServiceError(descriptor as never)
    );
    assert.equal(httpError.statusCode, statusCode);
    assert.equal(httpError.code, code);
    assert.equal(httpError.retry_after_seconds, retryAfter);
  }
});

test("REQ-SBX-GENERAL-003 destroys a timed-out request only after response finish", () => {
  const order: string[] = [];
  let finish: (() => void) | undefined;
  const response = {
    writableEnded: false,
    destroyed: false,
    writable: true,
    headersSent: false,
    set statusCode(_value: number) {
      order.push("status");
    },
    setHeader() {
      order.push("write");
    },
    once(event: string, listener: () => void) {
      assert.equal(event, "finish");
      finish = listener;
    },
    end() {
      order.push("end");
    }
  } as unknown as ServerResponse;
  const socket = {
    destroyed: false,
    destroy() {
      order.push("socket.destroy");
      this.destroyed = true;
    }
  };
  const request = {
    aborted: false,
    destroyed: false,
    socket,
    destroy: () => {
      order.push("request.destroy");
      request.destroyed = true;
    }
  } as unknown as IncomingMessage;
  const error = new sandboxSecurityBoundary.SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_REQUEST_TIMEOUT",
    statusCode: 408,
    close_after_response: true
  });
  writeJsonResponse(
    response,
    sandboxSecurityBoundary.sandboxSecurityHttpErrorResponse(error, "req-timeout"),
    request
  );
  assert.equal(order.includes("request.destroy"), false);
  finish?.();
  assert.deepEqual(order.slice(-2), ["request.destroy", "socket.destroy"]);
});

test("REQ-SBX-GENERAL-003 maps retry metadata and 413 close headers into the envelope", () => {
  const inProgress = sandboxSecurityBoundary.sandboxSecurityServiceErrorToHttpError(
    createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS",
      audit_rejection_code: "idempotency_in_progress"
    })
  );
  const inProgressResponse = sandboxSecurityBoundary.sandboxSecurityHttpErrorResponse(
    inProgress,
    "request-in-progress"
  );
  assert.equal(inProgressResponse.headers?.["Retry-After"], "1");
  assert.equal(inProgressResponse.headers?.Connection, undefined);
  assert.equal(
    (inProgressResponse.body as { request_id: string }).request_id,
    "request-in-progress"
  );

  const bodyTooLarge = new sandboxSecurityBoundary.SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_BODY_TOO_LARGE",
    statusCode: 413,
    close_after_response: true
  });
  const bodyResponse = sandboxSecurityBoundary.sandboxSecurityHttpErrorResponse(
    bodyTooLarge,
    "request-413"
  );
  assert.equal(bodyResponse.headers?.Connection, "close");
  assert.equal(bodyResponse.headers?.["Retry-After"], undefined);
  assert.equal((bodyResponse.body as { error_code: string }).error_code, "SANDBOX_SECURITY_BODY_TOO_LARGE");
});

test("REQ-SBX-GENERAL-003 writes 413 before finish and destroys once, while non-writable states are no-op", () => {
  const order: string[] = [];
  const headers: Record<string, string> = {};
  let finish: (() => void) | undefined;
  const response = {
    writableEnded: false,
    destroyed: false,
    writable: true,
    headersSent: false,
    set statusCode(_value: number) {
      order.push("status");
    },
    setHeader(name: string, value: string) {
      order.push(`write:${name}`);
      headers[name] = value;
    },
    once(event: string, listener: () => void) {
      assert.equal(event, "finish");
      finish = listener;
    },
    end() {
      order.push("end");
    }
  } as unknown as ServerResponse;
  const socket = {
    destroyed: false,
    destroy() {
      order.push("socket.destroy");
      this.destroyed = true;
    }
  };
  const request = {
    aborted: false,
    destroyed: false,
    socket,
    destroy() {
      order.push("request.destroy");
    }
  } as unknown as IncomingMessage;
  const error = new sandboxSecurityBoundary.SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_BODY_TOO_LARGE",
    statusCode: 413,
    close_after_response: true
  });
  writeJsonResponse(
    response,
    sandboxSecurityBoundary.sandboxSecurityHttpErrorResponse(error, "request-413"),
    request
  );
  assert.equal(order.includes("end"), true);
  assert.equal(headers.Connection, "close");
  assert.equal(headers["content-type"], "application/json; charset=utf-8");
  assert.equal(order.includes("request.destroy"), false);
  finish?.();
  finish?.();
  assert.equal(order.filter((item) => item === "request.destroy").length, 1);
  assert.equal(order.filter((item) => item === "socket.destroy").length, 1);
  assert.ok(order.indexOf("end") < order.indexOf("request.destroy"));

  for (const state of [
    { writableEnded: true },
    { destroyed: true },
    { writable: false },
    { headersSent: true }
  ]) {
    let writes = 0;
    const noOpResponse = {
      ...state,
      setHeader() {
        writes += 1;
      },
      end() {
        writes += 1;
      }
    } as unknown as ServerResponse;
    writeJsonResponse(noOpResponse, { statusCode: 413, body: {} }, request);
    assert.equal(writes, 0);
  }
  for (const requestState of [
    { aborted: true, destroyed: false },
    { aborted: false, destroyed: true }
  ]) {
    let writes = 0;
    const noOpResponse = {
      setHeader() {
        writes += 1;
      },
      end() {
        writes += 1;
      }
    } as unknown as ServerResponse;
    writeJsonResponse(
      noOpResponse,
      { statusCode: 413, body: {} },
      { ...requestState } as unknown as IncomingMessage
    );
    assert.equal(writes, 0);
  }
});

test("REQ-SBX-GENERAL-003 writes a typed response after normal request EOF despite IncomingMessage.destroyed", () => {
  let endCalls = 0;
  let statusCode: number | undefined;
  const response = {
    writableEnded: false,
    destroyed: false,
    writable: true,
    headersSent: false,
    set statusCode(value: number) {
      statusCode = value;
    },
    setHeader() {},
    end() {
      endCalls += 1;
    }
  } as unknown as ServerResponse;
  const request = {
    aborted: false,
    destroyed: true,
    complete: true,
    readableEnded: true,
    socket: { destroyed: false }
  } as unknown as IncomingMessage;
  writeJsonResponse(
    response,
    { statusCode: 403, body: { error_code: "SANDBOX_SECURITY_FORBIDDEN" } },
    request
  );
  assert.equal(statusCode, 403);
  assert.equal(endCalls, 1);
});

test("REQ-SBX-GENERAL-003 detects lowercase connection close response headers", () => {
  let finish: (() => void) | undefined;
  const response = {
    writableEnded: false,
    destroyed: false,
    writable: true,
    headersSent: false,
    set statusCode(_value: number) {},
    setHeader() {},
    once(_event: string, listener: () => void) {
      finish = listener;
    },
    end() {}
  } as unknown as ServerResponse;
  let requestDestroyed = false;
  const requestState = {
    aborted: false,
    destroyed: false,
    complete: false,
    readableEnded: false,
    socket: {
      destroyed: false,
      destroy() {
        this.destroyed = true;
      }
    },
    destroy() {
      requestDestroyed = true;
    }
  };
  const request = requestState as unknown as IncomingMessage;
  writeJsonResponse(
    response,
    { statusCode: 200, body: {}, headers: { connection: "close" } },
    request
  );
  assert.notEqual(finish, undefined);
  finish?.();
  assert.equal(requestDestroyed, true);
});

test("REQ-SBX-GENERAL-003 forces close policy on 408 and 413 typed errors", () => {
  for (const statusCode of [408, 413] as const) {
    const code = statusCode === 408
      ? "SANDBOX_SECURITY_REQUEST_TIMEOUT"
      : "SANDBOX_SECURITY_BODY_TOO_LARGE";
    const error = new sandboxSecurityBoundary.SandboxSecurityHttpError({
      code,
      statusCode,
      close_after_response: false
    });
    const response = sandboxSecurityBoundary.sandboxSecurityHttpErrorResponse(
      error,
      `request-${statusCode}`
    );
    assert.equal(response.headers?.Connection, "close");
  }
});

test("REQ-SBX-GENERAL-003 does not write a sandbox response after caller abort", async () => {
  const sandboxModule = makeStructuralSandboxModule([], []);
  const appModule = new (AppModule as unknown as new (...args: unknown[]) => AppModule)(
    createRuntimeDependencies(),
    sandboxModule
  );
  const publicRequest = {
    method: "POST",
    url: "/api/sandbox/security/evaluations",
    headers: {},
    rawHeaders: [],
    aborted: true,
    destroyed: false
  } as unknown as IncomingMessage;
  const publicResponse = makeResponse();
  await appModule.handle(publicRequest, publicResponse);
  assert.equal(publicResponse.body, undefined);

  const dependencies = createRuntimeDependencies();
  const internalModule = new InternalAppModule({
    campaignRepository: dependencies.campaignRepository,
    taskRepository: dependencies.taskRepository,
    ingestToken: "a".repeat(64),
    sandboxSecurityModule: sandboxModule
  } as never);
  const internalRequest = {
    method: "POST",
    url: "/internal/sandbox/security/capabilities",
    headers: {},
    rawHeaders: [],
    aborted: true,
    destroyed: false
  } as unknown as IncomingMessage;
  const internalResponse = makeResponse();
  await internalModule.handle(internalRequest, internalResponse);
  assert.equal(internalResponse.body, undefined);
});

test("REQ-SBX-GENERAL-003 preserves generic public errors after request abort", async () => {
  const appModule = new AppModule(createRuntimeDependencies());
  const request = {
    method: "GET",
    url: "/api/unknown",
    headers: {},
    aborted: true,
    destroyed: false
  } as unknown as IncomingMessage;
  const response = makeResponse();
  await appModule.handle(request, response);
  assert.equal(response.statusCode, 404);
  assert.equal((response.body as { error_code?: string }).error_code, "NOT_FOUND");
});

test("REQ-SBX-GENERAL-003 preserves generic internal errors after request destruction", async () => {
  const dependencies = createRuntimeDependencies();
  const internalModule = new InternalAppModule({
    campaignRepository: dependencies.campaignRepository,
    taskRepository: dependencies.taskRepository,
    ingestToken: "a".repeat(64)
  });
  const request = {
    method: "POST",
    url: "/internal/track1/campaigns",
    headers: {},
    aborted: false,
    destroyed: true
  } as unknown as IncomingMessage;
  const response = makeResponse();
  await internalModule.handle(request, response);
  assert.equal(response.statusCode, 401);
  assert.equal(
    (response.body as { error_code?: string }).error_code,
    "CAMPAIGN_INGEST_UNAUTHORIZED"
  );
});

test("REQ-SBX-GENERAL-003 public controller factory is available at the module boundary", () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController?: unknown;
  };
  assert.equal(typeof boundary.createSandboxSecurityController, "function");
});

test("REQ-SBX-GENERAL-003 rejects a non-production composition binding at the controller boundary", () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => unknown;
  };
  assert.throws(
    () => boundary.createSandboxSecurityController({
      ...makePublicControllerDependencies([], makePublicControllerCapability()),
      composition_binding: "sandbox-security-production-composition.v1:untrusted"
    }),
    TypeError
  );
});

test("REQ-SBX-GENERAL-003 denies evaluation scope before reading the body", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const bodyRead = { count: 0 };
  const capability = makePublicControllerCapability();
  const fixture = makePublicControllerDependencies(calls, capability, {
    requireEvaluationScopeError: true
  });
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.evaluate(makeUnreadControllerRequest(() => { bodyRead.count += 1; }), "http-request-1"),
    hasHttpError(403, "SANDBOX_SECURITY_FORBIDDEN")
  );
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_evaluate_scope",
    "record_rejection"
  ]);
  assert.equal(bodyRead.count, 0);
});

test("REQ-SBX-GENERAL-003 evaluates only after ordered public admission gates", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<any>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  const controller = boundary.createSandboxSecurityController(fixture);
  const body = JSON.stringify(makePublicEvaluationSubmission());
  const response = await controller.evaluate(
    makeRawRequest({
      rawHeaders: [
        "Authorization",
        `Bearer sbxcap_v1.${"a".repeat(43)}`,
        "Idempotency-Key",
        "request-key-0001",
        "Content-Type",
        "application/json",
        "Content-Length",
        String(Buffer.byteLength(body))
      ],
      chunks: [body]
    }),
    "http-request-2"
  );
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    success: true,
    message: "Sandbox security evaluation completed",
    data: {},
    error_code: null,
    request_id: "http-request-2"
  });
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_evaluate_scope",
    "maintenance",
    "capability_bucket",
    "stage_profile_grant",
    "evaluation_service"
  ]);
});

test("REQ-SBX-GENERAL-003 awaits bodyless audit admission and defaults limit to fifty", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      listAuditEvents(request: IncomingMessage, url: URL, requestId: string): Promise<any>;
    };
  };
  const calls: string[] = [];
  let auditQuery: Record<string, unknown> | undefined;
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  (fixture.audit_service as { list(input: Record<string, unknown>): unknown }).list = (input) => {
    auditQuery = input;
    calls.push("audit_service");
    return { schema_version: "sandbox-security-audit-page.v1", events: [], next_cursor: null };
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  const response = await controller.listAuditEvents(
    makeRawRequest({
      rawHeaders: [
        "Authorization",
        `Bearer sbxcap_v1.${"a".repeat(43)}`,
        "Content-Length",
        "0"
      ]
    }),
    new URL("http://127.0.0.1/api/sandbox/security/audit-events"),
    "http-request-3"
  );
  assert.equal(response.statusCode, 200);
  assert.deepEqual(auditQuery, {
    capability: makePublicControllerCapability(),
    limit: 50
  });
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_audit_scope",
    "capability_bucket",
    "audit_service"
  ]);
});

test("REQ-SBX-GENERAL-003 does not write an audit_read event for unsupported bodyless encoding", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      listAuditEvents(request: IncomingMessage, url: URL, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.listAuditEvents(
      makeRawRequest({
        rawHeaders: [
          "Authorization",
          `Bearer sbxcap_v1.${"a".repeat(43)}`,
          "Content-Length",
          "0",
          "Content-Encoding",
          "identity"
        ]
      }),
      new URL("http://127.0.0.1/api/sandbox/security/audit-events"),
      "http-request-unsupported-bodyless"
    ),
    hasHttpError(415, "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE")
  );
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_audit_scope",
    "capability_bucket"
  ]);
});

test("REQ-SBX-GENERAL-003 global rate rejection and unknown capability write no audit", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const globalCalls: string[] = [];
  const globalFixture = makePublicControllerDependencies(
    globalCalls,
    makePublicControllerCapability()
  );
  (globalFixture.global_bucket as { consume(): unknown }).consume = () => {
    globalCalls.push("global_bucket");
    return { allowed: false, retry_after_seconds: 4 };
  };
  const globalController = boundary.createSandboxSecurityController(globalFixture);
  await assert.rejects(
    () => globalController.evaluate(makeUnreadControllerRequest(() => {
      globalCalls.push("body");
    }), "http-request-global-rate"),
    hasHttpError(429, "SANDBOX_SECURITY_RATE_LIMITED")
  );
  assert.deepEqual(globalCalls, ["global_bucket"]);

  const unknownCalls: string[] = [];
  const unknownFixture = makePublicControllerDependencies(
    unknownCalls,
    makePublicControllerCapability()
  );
  (unknownFixture.authenticator as { authenticateToken(): unknown }).authenticateToken = () => {
    unknownCalls.push("authenticate");
    return { kind: "unknown" };
  };
  const unknownController = boundary.createSandboxSecurityController(unknownFixture);
  await assert.rejects(
    () => unknownController.evaluate(makeUnreadControllerRequest(() => {
      unknownCalls.push("body");
    }), "http-request-unknown"),
    hasHttpError(401, "SANDBOX_SECURITY_UNAUTHORIZED")
  );
  assert.deepEqual(unknownCalls, ["global_bucket", "authenticate"]);
});

test("REQ-SBX-GENERAL-003 known capability rejection audits the exact injected composition", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  let rejection: Record<string, unknown> | undefined;
  (fixture.authenticator as { authenticateToken(): unknown }).authenticateToken = () => {
    calls.push("authenticate");
    return {
      kind: "known_denied",
      rejection_code: "capability_expired",
      audit_identity: makePublicControllerCapability()
    };
  };
  (fixture.audit_projector as { requestRejected(input: Record<string, unknown>): unknown }).requestRejected = (input) => {
    calls.push("record_rejection");
    rejection = input;
    return {};
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.evaluate(makeUnreadControllerRequest(() => {
      calls.push("body");
    }), "http-request-expired"),
    hasHttpError(401, "SANDBOX_SECURITY_UNAUTHORIZED")
  );
  assert.equal(rejection?.composition_binding, "sandbox-security-production-composition.v1:rule_only");
  assert.equal(rejection?.route_id, "evaluation");
  assert.equal(rejection?.rejection_code, "capability_expired");
  assert.deepEqual(calls, ["global_bucket", "authenticate", "record_rejection"]);
});

test("REQ-SBX-GENERAL-003 capability rate rejection is audited before body admission", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  (fixture.capability_limiters as { consume(): unknown }).consume = () => {
    calls.push("capability_bucket");
    return { allowed: false, retry_after_seconds: 7 };
  };
  let rejection: Record<string, unknown> | undefined;
  (fixture.audit_projector as { requestRejected(input: Record<string, unknown>): unknown }).requestRejected = (input) => {
    calls.push("record_rejection");
    rejection = input;
    return {};
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.evaluate(makeUnreadControllerRequest(() => {
      calls.push("body");
    }), "http-request-rate"),
    hasHttpError(429, "SANDBOX_SECURITY_RATE_LIMITED")
  );
  assert.equal(rejection?.composition_binding, "sandbox-security-production-composition.v1:rule_only");
  assert.equal(rejection?.rejection_code, "capability_rate_limited");
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_evaluate_scope",
    "maintenance",
    "capability_bucket",
    "record_rejection"
  ]);
});

test("REQ-SBX-GENERAL-003 audit scope denial precedes malformed query and bodyless admission", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      listAuditEvents(request: IncomingMessage, url: URL, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  (fixture.authenticator as { requireScope(_capability: unknown, scope: string): void }).requireScope = (_capability, scope) => {
    calls.push(scope === "sandbox_security:audit:read" ? "require_audit_scope" : "require_evaluate_scope");
    if (scope === "sandbox_security:audit:read") {
      throw createSandboxSecurityServiceError({
        code: "SANDBOX_SECURITY_FORBIDDEN",
        audit_rejection_code: "scope_forbidden"
      });
    }
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.listAuditEvents(
      makeUnreadControllerRequest(() => {
        calls.push("body");
      }),
      new URL("http://127.0.0.1/api/sandbox/security/audit-events?unknown=value"),
      "http-request-audit-scope"
    ),
    hasHttpError(403, "SANDBOX_SECURITY_FORBIDDEN")
  );
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_audit_scope",
    "record_rejection"
  ]);
});

test("REQ-SBX-GENERAL-003 slow body timeout occurs before evaluation service", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  let evaluationCalls = 0;
  (fixture.evaluation_service as { evaluate(): Promise<unknown> }).evaluate = async () => {
    evaluationCalls += 1;
    return {};
  };
  const request = new EventEmitter() as unknown as StreamFixture;
  request.rawHeaders = [
    "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
    "Idempotency-Key", "request-key-0001",
    "Content-Type", "application/json",
    "Transfer-Encoding", "chunked"
  ];
  request.headers = {};
  request.complete = false;
  request.aborted = false;
  request.destroyed = false;
  request[Symbol.asyncIterator] = () => ({
    next: () => new Promise<IteratorResult<Buffer, undefined>>(() => {}),
    return: async () => ({ done: true, value: undefined })
  });
  const attempt = boundary.createSandboxSecurityController(fixture).evaluate(
    request as unknown as IncomingMessage,
    "http-request-timeout"
  );
  request.aborted = true;
  request.emit("aborted");
  await assert.rejects(
    attempt,
    hasHttpError(408, "SANDBOX_SECURITY_REQUEST_TIMEOUT")
  );
  assert.equal(evaluationCalls, 0);
});

test("REQ-SBX-GENERAL-003 invalid normalized body is audited without invoking evaluation", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  let rejection: Record<string, unknown> | undefined;
  (fixture.audit_projector as { requestRejected(input: Record<string, unknown>): unknown }).requestRejected = (input) => {
    calls.push("record_rejection");
    rejection = input;
    return {};
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.evaluate(
      makeRawRequest({
        rawHeaders: [
          "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
          "Idempotency-Key", "request-key-0001",
          "Content-Type", "application/json",
          "Content-Length", "2"
        ],
        chunks: ["{}"]
      }),
      "http-request-invalid-body"
    ),
    hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(rejection?.rejection_code, "invalid_request");
  assert.equal(rejection?.composition_binding, "sandbox-security-production-composition.v1:rule_only");
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_evaluate_scope",
    "maintenance",
    "capability_bucket",
    "record_rejection"
  ]);
});

test("REQ-SBX-GENERAL-003 stage and profile denials are audited after normalization", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  for (const auditRejectionCode of ["stage_forbidden", "profile_forbidden"] as const) {
    const calls: string[] = [];
    const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
    let rejection: Record<string, unknown> | undefined;
    (fixture.authenticator as { requireEvaluationGrant(): void }).requireEvaluationGrant = () => {
      calls.push("stage_profile_grant");
      throw createSandboxSecurityServiceError({
        code: "SANDBOX_SECURITY_FORBIDDEN",
        audit_rejection_code: auditRejectionCode
      });
    };
    (fixture.audit_projector as { requestRejected(input: Record<string, unknown>): unknown }).requestRejected = (input) => {
      calls.push("record_rejection");
      rejection = input;
      return {};
    };
    const controller = boundary.createSandboxSecurityController(fixture);
    await assert.rejects(
      () => controller.evaluate(
        makeRawRequest({
          rawHeaders: [
            "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
            "Idempotency-Key", "request-key-0001",
            "Content-Type", "application/json",
            "Content-Length", String(Buffer.byteLength(JSON.stringify(makePublicEvaluationSubmission())))
          ],
          chunks: [JSON.stringify(makePublicEvaluationSubmission())]
        }),
        `http-request-${auditRejectionCode}`
      ),
      hasHttpError(403, "SANDBOX_SECURITY_FORBIDDEN")
    );
    assert.equal(rejection?.rejection_code, auditRejectionCode);
    assert.equal(rejection?.request_id, "request-001");
    assert.equal(rejection?.composition_binding, "sandbox-security-production-composition.v1:rule_only");
    assert.equal(calls.at(-1), "record_rejection");
  }
});

test("REQ-SBX-GENERAL-003 maintenance storage rejection is audited and body admission is skipped", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  (fixture.maintenance as { assertEvaluationAvailable(): void }).assertEvaluationAvailable = () => {
    calls.push("maintenance");
    throw createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
      audit_rejection_code: "storage_unavailable"
    });
  };
  let rejection: Record<string, unknown> | undefined;
  (fixture.audit_projector as { requestRejected(input: Record<string, unknown>): unknown }).requestRejected = (input) => {
    calls.push("record_rejection");
    rejection = input;
    return {};
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.evaluate(makeUnreadControllerRequest(() => {
      calls.push("body");
    }), "http-request-storage"),
    hasHttpError(503, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE")
  );
  assert.equal(rejection?.rejection_code, "storage_unavailable");
  assert.equal(rejection?.composition_binding, "sandbox-security-production-composition.v1:rule_only");
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_evaluate_scope",
    "maintenance",
    "record_rejection"
  ]);
});

test("REQ-SBX-GENERAL-003 idempotency conflict is mapped without duplicate controller audit", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  (fixture.evaluation_service as { evaluate(): Promise<unknown> }).evaluate = async () => {
    calls.push("evaluation_service");
    throw createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT",
      audit_rejection_code: "idempotency_conflict"
    });
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.evaluate(
      makeRawRequest({
        rawHeaders: [
          "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
          "Idempotency-Key", "request-key-0001",
          "Content-Type", "application/json",
          "Content-Length", String(Buffer.byteLength(JSON.stringify(makePublicEvaluationSubmission())))
        ],
        chunks: [JSON.stringify(makePublicEvaluationSubmission())]
      }),
      "http-request-conflict"
    ),
    hasHttpError(409, "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT")
  );
  assert.equal(calls.includes("record_rejection"), false);
  assert.equal(calls.at(-1), "evaluation_service");
});

test("REQ-SBX-GENERAL-003 invalid audit limit is audited only after bodyless completion", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      listAuditEvents(request: IncomingMessage, url: URL, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  let rejection: Record<string, unknown> | undefined;
  (fixture.audit_projector as { requestRejected(input: Record<string, unknown>): unknown }).requestRejected = (input) => {
    calls.push("record_rejection");
    rejection = input;
    return {};
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.listAuditEvents(
      makeRawRequest({
        rawHeaders: [
          "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
          "Content-Length", "0"
        ]
      }),
      new URL("http://127.0.0.1/api/sandbox/security/audit-events?limit=101"),
      "http-request-invalid-limit"
    ),
    hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(rejection?.route_id, "audit_read");
  assert.equal(rejection?.rejection_code, "invalid_request");
  assert.deepEqual(calls, [
    "global_bucket",
    "authenticate",
    "require_audit_scope",
    "capability_bucket",
    "record_rejection"
  ]);
});

test("REQ-SBX-GENERAL-003 known revoked capability is audited without body admission", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const calls: string[] = [];
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  let rejection: Record<string, unknown> | undefined;
  (fixture.authenticator as { authenticateToken(): unknown }).authenticateToken = () => {
    calls.push("authenticate");
    return {
      kind: "known_denied",
      rejection_code: "capability_revoked",
      audit_identity: makePublicControllerCapability()
    };
  };
  (fixture.audit_projector as { requestRejected(input: Record<string, unknown>): unknown }).requestRejected = (input) => {
    calls.push("record_rejection");
    rejection = input;
    return {};
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  await assert.rejects(
    () => controller.evaluate(makeUnreadControllerRequest(() => {
      calls.push("body");
    }), "http-request-revoked"),
    hasHttpError(401, "SANDBOX_SECURITY_UNAUTHORIZED")
  );
  assert.equal(rejection?.rejection_code, "capability_revoked");
  assert.equal(rejection?.composition_binding, "sandbox-security-production-composition.v1:rule_only");
  assert.deepEqual(calls, ["global_bucket", "authenticate", "record_rejection"]);
});

test("REQ-SBX-GENERAL-003 idempotency in-progress and concurrency rejection are transaction-owned", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const body = JSON.stringify(makePublicEvaluationSubmission());
  for (const [serviceCode, auditCode, statusCode] of [
    ["SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS", "idempotency_in_progress", 409],
    ["SANDBOX_SECURITY_CONCURRENCY_LIMITED", "concurrency_limited", 429]
  ] as const) {
    const calls: string[] = [];
    const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
    (fixture.evaluation_service as { evaluate(): Promise<unknown> }).evaluate = async () => {
      calls.push("evaluation_service");
      if (serviceCode === "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS") {
        throw createSandboxSecurityServiceError({
          code: serviceCode,
          audit_rejection_code: "idempotency_in_progress"
        });
      }
      throw createSandboxSecurityServiceError({
        code: "SANDBOX_SECURITY_CONCURRENCY_LIMITED",
        audit_rejection_code: "concurrency_limited"
      });
    };
    const controller = boundary.createSandboxSecurityController(fixture);
    await assert.rejects(
      () => controller.evaluate(
        makeRawRequest({
          rawHeaders: [
            "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
            "Idempotency-Key", "request-key-0001",
            "Content-Type", "application/json",
            "Content-Length", String(Buffer.byteLength(body))
          ],
          chunks: [body]
        }),
        `http-request-${auditCode}`
      ),
      hasHttpError(statusCode, serviceCode, {
        close_after_response: false
      })
    );
    assert.equal(calls.includes("record_rejection"), false);
    assert.equal(calls.at(-1), "evaluation_service");
  }
});

test("REQ-SBX-GENERAL-003 audit limit 100 succeeds and limit 0 is rejected", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      listAuditEvents(request: IncomingMessage, url: URL, requestId: string): Promise<any>;
    };
  };
  const calls: string[] = [];
  let receivedLimit = 0;
  const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
  (fixture.audit_service as { list(input: { limit: number }): unknown }).list = (input) => {
    receivedLimit = input.limit;
    calls.push("audit_service");
    return { schema_version: "sandbox-security-audit-page.v1", events: [], next_cursor: null };
  };
  const controller = boundary.createSandboxSecurityController(fixture);
  const success = await controller.listAuditEvents(
    makeRawRequest({
      rawHeaders: [
        "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
        "Content-Length", "0"
      ]
    }),
    new URL("http://127.0.0.1/api/sandbox/security/audit-events?limit=100"),
    "http-request-limit-100"
  );
  assert.equal(success.statusCode, 200);
  assert.equal(receivedLimit, 100);

  calls.length = 0;
  await assert.rejects(
    () => controller.listAuditEvents(
      makeRawRequest({
        rawHeaders: [
          "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
          "Content-Length", "0"
        ]
      }),
      new URL("http://127.0.0.1/api/sandbox/security/audit-events?limit=0"),
      "http-request-limit-0"
    ),
    hasHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(calls.includes("audit_service"), false);
});

test("REQ-SBX-GENERAL-003 controller body admission audits actual 413 and 408 failures", async () => {
  const boundary = sandboxSecurityBoundary as unknown as {
    createSandboxSecurityController: (input: Record<string, unknown>) => {
      evaluate(request: IncomingMessage, requestId: string): Promise<unknown>;
    };
  };
  const bodyCases = [
    {
      name: "too-large",
      headers: [
        "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
        "Idempotency-Key", "request-key-0001",
        "Content-Type", "application/json",
        "Content-Length", "786433"
      ],
      expectedStatus: 413,
      expectedHttpCode: "SANDBOX_SECURITY_BODY_TOO_LARGE",
      expectedAuditCode: "body_too_large"
    },
    {
      name: "timeout",
      headers: [
        "Authorization", `Bearer sbxcap_v1.${"a".repeat(43)}`,
        "Idempotency-Key", "request-key-0001",
        "Content-Type", "application/json",
        "Transfer-Encoding", "chunked"
      ],
      expectedStatus: 408,
      expectedHttpCode: "SANDBOX_SECURITY_REQUEST_TIMEOUT",
      expectedAuditCode: "body_timeout"
    }
  ] as const;

  for (const bodyCase of bodyCases) {
    const calls: string[] = [];
    const fixture = makePublicControllerDependencies(calls, makePublicControllerCapability());
    let rejection: Record<string, unknown> | undefined;
    (fixture.audit_projector as { requestRejected(input: Record<string, unknown>): unknown }).requestRejected = (input) => {
      calls.push("record_rejection");
      rejection = input;
      return {};
    };
    const controller = boundary.createSandboxSecurityController(fixture);
    const request = bodyCase.name === "timeout"
      ? (() => {
          const hanging = new EventEmitter() as unknown as StreamFixture;
          hanging.rawHeaders = [...bodyCase.headers];
          hanging.headers = {};
          hanging.complete = false;
          hanging.aborted = false;
          hanging.destroyed = false;
          hanging[Symbol.asyncIterator] = () => ({
            next: () => new Promise<IteratorResult<Buffer, undefined>>(() => {}),
            return: async () => ({ done: true, value: undefined })
          });
          return hanging as unknown as IncomingMessage;
        })()
      : makeRawRequest({ rawHeaders: bodyCase.headers });
    const attempt = controller.evaluate(request, `http-request-${bodyCase.name}`);
    await assert.rejects(
      attempt,
      hasHttpError(bodyCase.expectedStatus, bodyCase.expectedHttpCode, {
        close_after_response: true
      })
    );
    assert.equal(rejection?.rejection_code, bodyCase.expectedAuditCode);
    assert.equal(rejection?.composition_binding, "sandbox-security-production-composition.v1:rule_only");
    assert.equal(calls.includes("evaluation_service"), false);
  }
});

function makePublicControllerCapability(): Record<string, unknown> {
  return {
    capability_id: "capability:00000000-0000-4000-8000-000000000001",
    subject_id: "subject-a",
    authorization_scope_id: `authscope:hmac-sha256:${"a".repeat(64)}`,
    scopes: ["sandbox_security:evaluate", "sandbox_security:audit:read"],
    allowed_stages: ["user_input"],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
    issued_at: "2026-08-01T00:00:00.000Z",
    expires_at: "2026-08-01T01:00:00.000Z"
  };
}

function makePublicEvaluationSubmission(): Record<string, unknown> {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "request-001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "source-001",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: "hello",
        provenance_ref: "source://sandbox/security/source-001/0001"
      }
    ]
  };
}

function makeUnreadControllerRequest(onRead: () => void): IncomingMessage {
  const request = new EventEmitter() as unknown as FakeIncomingMessage;
  request.rawHeaders = [
    "Authorization",
    `Bearer sbxcap_v1.${"a".repeat(43)}`
  ];
  request.headers = {};
  request.complete = false;
  request.aborted = false;
  request.destroyed = false;
  request.pause = () => undefined;
  request[Symbol.asyncIterator] = () => {
    onRead();
    return {
      next: async () => ({ done: true, value: undefined })
    } as AsyncIterator<Buffer | string, undefined>;
  };
  return request as unknown as IncomingMessage;
}

function makePublicControllerDependencies(
  calls: string[],
  capability: Record<string, unknown>,
  options: Readonly<{
    requireEvaluationScopeError?: boolean;
  }> = {}
): Record<string, unknown> {
  return {
    composition_binding: "sandbox-security-production-composition.v1:rule_only",
    authenticator: {
      authenticateToken() {
        calls.push("authenticate");
        return { kind: "authorized", capability };
      },
      requireScope(_capability: unknown, scope: string) {
        calls.push(scope === "sandbox_security:audit:read" ? "require_audit_scope" : "require_evaluate_scope");
        if (options.requireEvaluationScopeError === true) {
          throw createSandboxSecurityServiceError({
            code: "SANDBOX_SECURITY_FORBIDDEN",
            audit_rejection_code: "scope_forbidden"
          });
        }
      },
      requireEvaluationGrant() {
        calls.push("stage_profile_grant");
      },
      authenticateAdministrator() {}
    },
    evaluation_service: {
      async evaluate() {
        calls.push("evaluation_service");
        return {};
      }
    },
    audit_service: {
      list() {
        calls.push("audit_service");
        return { schema_version: "sandbox-security-audit-page.v1", events: [], next_cursor: null };
      },
      purgeExpired() {
        return { schema_version: "sandbox-security-audit-purge-result.v1", retention_days: 90, deleted_count: 0, has_more: false };
      }
    },
    maintenance: {
      state: () => "healthy",
      assertEvaluationAvailable() {
        calls.push("maintenance");
      },
      claim: () => ({ kind: "claimed" }),
      runHourlyCleanup() {},
      runPurgePreCleanup() {},
      close() {}
    },
    global_bucket: {
      consume() {
        calls.push("global_bucket");
        return { allowed: true };
      }
    },
    capability_limiters: {
      consume() {
        calls.push("capability_bucket");
        return { allowed: true };
      },
      remove() {},
      size: () => 1
    },
    audit_projector: {
      requestRejected() {
        calls.push("record_rejection");
        return {};
      },
      evaluationCompleted: () => ({}),
      evaluationReplayed: () => ({}),
      evaluationInterrupted: () => ({}),
      capabilityIssued: () => ({}),
      capabilityRevoked: () => ({}),
      auditRead: () => ({}),
      auditPurged: () => ({})
    },
    audit_repository: {
      append() {}
    },
    runtime: {
      now: () => "2026-08-01T00:00:00.000Z",
      monotonicNowMs: () => 0,
      randomBytes: () => new Uint8Array(32),
      nextCapabilityId: () => "capability:00000000-0000-4000-8000-000000000001",
      nextAuditEventId: () => "audit:00000000-0000-4000-8000-000000000001",
      nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000001",
      scheduleTimeout: () => () => undefined,
      scheduleInterval: () => ({ unref() {}, cancel() {} })
    }
  };
}
