import { describe, expect, it, vi } from "vitest";

import {
  evaluateSandboxSecurityRequest,
  readSandboxSecurityAuditPage
} from "./sandbox-security-service";

const DECISION = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "decision:1",
  request_id: "req-1",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  verdict: "no_detected_risk",
  action: "allow",
  risk_level: "info",
  findings: [],
  detector_runs: [],
  evidence_refs: [],
  created_at: "2026-08-07T00:00:00.000Z"
};

function envelope(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      success: true,
      message: "ok",
      data,
      error_code: null,
      request_id: "http:1"
    })
  } as unknown as Response;
}

const ITEM = {
  source_id: "src-1",
  claimed_source_type: "user_input" as const,
  media_type: "text/plain" as const,
  value: "hello",
  provenance_ref: "source://client/1"
};

describe("REQ-SBX-GENERAL-005 sandbox security service", () => {
  it("posts a normalized decision through the shared normalizer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(DECISION));

    const result = await evaluateSandboxSecurityRequest({
      capabilityToken: "tok",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [ITEM],
      options: { fetchImpl }
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data.decision_id).toBe("decision:1");
      expect(result.data.evaluation_mode).toBe("simulation");
    }
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/sandbox/security/evaluations");
  });

  it("marks a structurally invalid decision as invalid", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(envelope({ ...DECISION, verdict: "not_a_verdict" }));

    const result = await evaluateSandboxSecurityRequest({
      capabilityToken: "tok",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [ITEM],
      options: { fetchImpl }
    });

    expect(result.kind).toBe("invalid");
  });

  it("rejects an over-limit request before any fetch", async () => {
    const fetchImpl = vi.fn();

    const result = await evaluateSandboxSecurityRequest({
      capabilityToken: "tok",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [],
      options: { fetchImpl }
    });

    expect(result.kind).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends only cursor and limit on the audit route", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      envelope({
        schema_version: "sandbox-security-audit-page.v1",
        events: [],
        next_cursor: null
      })
    );

    await readSandboxSecurityAuditPage({
      capabilityToken: "tok",
      limit: 50,
      cursor: "sbxcur_v1.abc.def",
      options: { fetchImpl }
    });

    const url = new URL(fetchImpl.mock.calls[0][0], "https://example.test");
    expect([...url.searchParams.keys()].sort()).toEqual(["cursor", "limit"]);
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("clamps the audit limit into 1..100", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      envelope({
        schema_version: "sandbox-security-audit-page.v1",
        events: [],
        next_cursor: null
      })
    );

    await readSandboxSecurityAuditPage({
      capabilityToken: "tok",
      limit: 5000,
      options: { fetchImpl }
    });

    const url = new URL(fetchImpl.mock.calls[0][0], "https://example.test");
    expect(url.searchParams.get("limit")).toBe("100");
  });

  it("never places submitted content in the request URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(DECISION));
    const canary = "SECRET-CANARY-VALUE";

    await evaluateSandboxSecurityRequest({
      capabilityToken: "tok",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [{ ...ITEM, value: canary }],
      options: { fetchImpl }
    });

    expect(String(fetchImpl.mock.calls[0][0])).not.toContain("SECRET-CANARY");
  });

  it("never places the capability token in the request URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(DECISION));

    await evaluateSandboxSecurityRequest({
      capabilityToken: "tok-secret-value",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [ITEM],
      options: { fetchImpl }
    });

    expect(String(fetchImpl.mock.calls[0][0])).not.toContain("tok-secret-value");
  });

  it("holds no module-level capability state between calls", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(DECISION));
    const base = {
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input" as const,
      policyProfileId: "sandbox-security-balanced.v1" as const,
      contentItems: [ITEM],
      options: { fetchImpl }
    };

    await evaluateSandboxSecurityRequest({ ...base, capabilityToken: "tok-a" });
    await evaluateSandboxSecurityRequest({ ...base, capabilityToken: "tok-b" });

    expect(
      (fetchImpl.mock.calls[0][1].headers as Record<string, string>).authorization
    ).toBe("Bearer tok-a");
    expect(
      (fetchImpl.mock.calls[1][1].headers as Record<string, string>).authorization
    ).toBe("Bearer tok-b");
  });
});
