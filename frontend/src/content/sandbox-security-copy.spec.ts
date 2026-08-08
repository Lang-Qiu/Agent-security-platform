import { describe, expect, it } from "vitest";

import {
  SANDBOX_SECURITY_ERROR_CODES,
  SANDBOX_SECURITY_VIOLATION_RULES,
  describeSandboxSecurityFailure,
  describeSandboxSecurityViolation
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

describe("REQ-SBX-GENERAL-005 client pre-flight violation copy", () => {
  it("covers every client violation rule the workbench can raise", () => {
    expect(SANDBOX_SECURITY_VIOLATION_RULES).toHaveLength(8);
    for (const rule of SANDBOX_SECURITY_VIOLATION_RULES) {
      const copy = describeSandboxSecurityViolation({ rule });
      expect(copy.length, `${rule} has no copy`).toBeGreaterThan(0);
      // Every rule must resolve to its own entry, not the catch-all.
      expect(copy, `${rule} fell through to the unknown fallback`).not.toContain(
        "请求未通过客户端预检"
      );
    }
  });

  it("falls back to a generic remedy for an unmapped rule", () => {
    expect(describeSandboxSecurityViolation({ rule: "something_new" })).toContain(
      "请求未通过客户端预检"
    );
  });

  it("names the offending source without echoing any submitted value", () => {
    const copy = describeSandboxSecurityViolation({
      rule: "text_bytes",
      sourceId: "src-3"
    });
    expect(copy).toContain("src-3");
    // Pin the exact composition: the rule's own copy plus a source suffix and
    // nothing else. The function signature cannot accept a submitted value, so
    // a content leak is structurally impossible; this pins that no other field
    // can be appended later without failing here.
    const base = describeSandboxSecurityViolation({ rule: "text_bytes" });
    expect(copy).toBe(`${base}（来源 src-3）`);
  });

  it("states the shared numeric bound so the operator can act on it", () => {
    expect(describeSandboxSecurityViolation({ rule: "text_bytes" })).toMatch(/\d/);
    expect(describeSandboxSecurityViolation({ rule: "json_depth" })).toMatch(/\d/);
    expect(describeSandboxSecurityViolation({ rule: "request_bytes" })).toMatch(/\d/);
  });
});
