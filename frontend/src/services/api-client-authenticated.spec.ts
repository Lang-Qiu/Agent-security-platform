import { describe, expect, it, vi } from "vitest";

import { requestAuthenticatedJson } from "./api-client";

const OK_ENVELOPE = {
  success: true,
  message: "ok",
  data: { value: 1 },
  error_code: null,
  request_id: "http:1"
};

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return {
    ok: (init?.status ?? 200) < 400,
    status: init?.status ?? 200,
    headers: { get: (name: string) => init?.headers?.[name.toLowerCase()] ?? null },
    json: async () => body
  } as unknown as Response;
}

describe("REQ-SBX-GENERAL-005 authenticated transport", () => {
  it("sends the bearer token and idempotency key on POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));

    await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-abc",
      idempotencyKey: "key-1",
      body: { schema_version: "sandbox-security-request.v1" },
      normalize: (value) => value as { value: number },
      options: { fetchImpl }
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok-abc");
    expect(headers["idempotency-key"]).toBe("key-1");
    expect(headers["content-type"]).toBe("application/json");
    expect(init.method).toBe("POST");
  });

  it("omits the idempotency header on a bodyless GET", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));

    await requestAuthenticatedJson({
      path: "/api/sandbox/security/audit-events?limit=50",
      method: "GET",
      capabilityToken: "tok-abc",
      normalize: (value) => value as { value: number },
      options: { fetchImpl }
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.body).toBeUndefined();
    expect(Object.keys(init.headers as object)).not.toContain("idempotency-key");
  });

  it("surfaces error_code and Retry-After without a server message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: false,
          message: "should not be surfaced",
          data: null,
          error_code: "SANDBOX_SECURITY_RATE_LIMITED",
          request_id: "http:2"
        },
        { status: 429, headers: { "retry-after": "7" } }
      )
    );

    const result = await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-abc",
      idempotencyKey: "key-1",
      body: {},
      normalize: (value) => value as unknown,
      options: { fetchImpl }
    });

    expect(result).toEqual({
      kind: "error",
      httpStatus: 429,
      errorCode: "SANDBOX_SECURITY_RATE_LIMITED",
      retryAfterSeconds: 7
    });
  });

  it("returns invalid when the normalizer rejects the payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));

    const result = await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-abc",
      idempotencyKey: "key-1",
      body: {},
      normalize: () => null,
      options: { fetchImpl }
    });

    expect(result).toEqual({ kind: "invalid" });
  });

  it("returns unavailable when transport throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-abc",
      idempotencyKey: "key-1",
      body: {},
      normalize: (value) => value as unknown,
      options: { fetchImpl }
    });

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("trims safe edge whitespace before constructing the authorization header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));

    const result = await requestAuthenticatedJson({
      path: "/api/sandbox/security/audit-events?limit=50",
      method: "GET",
      capabilityToken: `\r\n tok-abc \n`,
      normalize: (value) => value as { value: number },
      options: { fetchImpl }
    });

    expect(result.kind).toBe("ok");
    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer tok-abc"
    );
  });

  it("rejects interior control characters before calling fetch", async () => {
    const fetchImpl = vi.fn();

    const result = await requestAuthenticatedJson({
      path: "/api/sandbox/security/audit-events?limit=50",
      method: "GET",
      capabilityToken: `tok-${String.fromCharCode(13)}abc`,
      normalize: (value) => value as { value: number },
      options: { fetchImpl }
    });

    expect(result).toEqual({ kind: "invalid_token" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never writes the capability token to storage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-secret",
      idempotencyKey: "key-1",
      body: {},
      normalize: (value) => value as unknown,
      options: { fetchImpl }
    });

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
