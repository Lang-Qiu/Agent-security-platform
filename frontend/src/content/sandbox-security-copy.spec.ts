import { describe, expect, it } from "vitest";

import {
  SANDBOX_SECURITY_ERROR_CODES,
  describeSandboxSecurityFailure
} from "./sandbox-security-copy";

describe("REQ-SBX-GENERAL-005 failure copy", () => {
  it("covers all fifteen documented error codes", () => {
    expect(SANDBOX_SECURITY_ERROR_CODES).toHaveLength(15);
    for (const code of SANDBOX_SECURITY_ERROR_CODES) {
      const copy = describeSandboxSecurityFailure({
        kind: "error",
        httpStatus: 400,
        errorCode: code,
        retryAfterSeconds: null
      });
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.remedy.length).toBeGreaterThan(0);
    }
  });

  it("maps an unauthorized capability to a re-paste remedy", () => {
    const copy = describeSandboxSecurityFailure({
      kind: "error",
      httpStatus: 401,
      errorCode: "SANDBOX_SECURITY_UNAUTHORIZED",
      retryAfterSeconds: null
    });
    expect(copy.requiresNewCapability).toBe(true);
  });

  it("surfaces a retry delay when the backend supplies one", () => {
    const copy = describeSandboxSecurityFailure({
      kind: "error",
      httpStatus: 429,
      errorCode: "SANDBOX_SECURITY_RATE_LIMITED",
      retryAfterSeconds: 12
    });
    expect(copy.retryAfterSeconds).toBe(12);
  });

  it("distinguishes idempotency conflict from in-progress", () => {
    const conflict = describeSandboxSecurityFailure({
      kind: "error",
      httpStatus: 409,
      errorCode: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT",
      retryAfterSeconds: 1
    });
    const inProgress = describeSandboxSecurityFailure({
      kind: "error",
      httpStatus: 409,
      errorCode: "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS",
      retryAfterSeconds: 1
    });
    expect(conflict.title).not.toBe(inProgress.title);
    expect(conflict.requiresNewIdempotencyKey).toBe(true);
    expect(inProgress.requiresNewIdempotencyKey).toBe(false);
  });

  it("handles unknown, invalid, and unavailable results", () => {
    expect(
      describeSandboxSecurityFailure({
        kind: "error",
        httpStatus: 418,
        errorCode: "SOMETHING_NEW",
        retryAfterSeconds: null
      }).title.length
    ).toBeGreaterThan(0);
    expect(describeSandboxSecurityFailure({ kind: "invalid" }).title.length).toBeGreaterThan(0);
    expect(describeSandboxSecurityFailure({ kind: "unavailable" }).title.length).toBeGreaterThan(0);
  });
});
