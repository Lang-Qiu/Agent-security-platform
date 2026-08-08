import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SandboxSecurityAuditPage } from "./SandboxSecurityAuditPage";

function page(events: unknown[], nextCursor: string | null) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      success: true,
      message: "ok",
      data: {
        schema_version: "sandbox-security-audit-page.v1",
        events,
        next_cursor: nextCursor
      },
      error_code: null,
      request_id: "http:1"
    })
  } as unknown as Response;
}

// Identity values must satisfy the real shared normalizer patterns
// (audit: + UUIDv4, authscope:hmac-sha256: + 64 hex, capability: + UUIDv4),
// because this page test flows through the real service and normalizer. The
// plan's simplified "audit:1"/"scope-1"/"cap-1" placeholders are rejected by
// normalizeSandboxSecurityAuditEvent and would surface as an invalid page.
const EVENT = {
  schema_version: "sandbox-security-audit-event.v1",
  event_id: "audit:11111111-1111-4111-8111-111111111111",
  event_type: "audit_read",
  occurred_at: "2026-08-07T00:00:00.000Z",
  subject_id: "subject-1",
  authorization_scope_id: `authscope:hmac-sha256:${"a".repeat(64)}`,
  capability_id: "capability:22222222-2222-4222-8222-222222222222",
  returned_count: 1,
  next_cursor_present: false,
  elapsed_ms: 4
};

describe("REQ-SBX-GENERAL-005 audit page", () => {
  it("requires a capability before reading", async () => {
    const fetchImpl = vi.fn();
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/能力令牌/)).toBeInTheDocument();
  });

  it("sends the bearer token and no idempotency key on a read", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([EVENT], null));
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    fireEvent.change(screen.getByLabelText(/能力令牌/), { target: { value: "tok-abc" } });
    fireEvent.click(screen.getByRole("button", { name: /加载审计/ }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const headers = new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer tok-abc");
    expect(headers.get("idempotency-key")).toBeNull();
  });

  it("passes the opaque cursor as a query value without writing it to the page URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page([EVENT], "sbxcur_v1.aaaa.bbbb"))
      .mockResolvedValueOnce(page([EVENT], null));
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    fireEvent.change(screen.getByLabelText(/能力令牌/), { target: { value: "tok-abc" } });
    fireEvent.click(screen.getByRole("button", { name: /加载审计/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /下一页/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /下一页/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    expect(String(fetchImpl.mock.calls[1][0])).toContain("cursor=");
    expect(window.location.search).not.toContain("sbxcur_v1");
  });

  it("surfaces a cursor rejection as a recoverable restart", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        success: false,
        message: "err",
        data: null,
        error_code: "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID",
        request_id: "http:1"
      })
    } as unknown as Response);
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    fireEvent.change(screen.getByLabelText(/能力令牌/), { target: { value: "tok-abc" } });
    fireEvent.click(screen.getByRole("button", { name: /加载审计/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /重新开始/ })).toBeInTheDocument();
  });

  it("never renders a field that could carry raw content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([EVENT], null));
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    fireEvent.change(screen.getByLabelText(/能力令牌/), { target: { value: "tok-abc" } });
    fireEvent.click(screen.getByRole("button", { name: /加载审计/ }));
    await waitFor(() => expect(screen.getByText("audit_read")).toBeInTheDocument());

    expect(document.body.textContent).not.toContain("tok-abc");
  });

  it("REQ-SBX-GENERAL-005 keeps the audit table headers associated", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([EVENT], null));
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    fireEvent.change(screen.getByLabelText(/能力令牌/), { target: { value: "tok-abc" } });
    fireEvent.click(screen.getByRole("button", { name: /加载审计/ }));
    await waitFor(() => expect(screen.getByText("audit_read")).toBeInTheDocument());

    for (const header of screen.getAllByRole("columnheader")) {
      expect(header.textContent?.trim()).toBeTruthy();
    }
  });
});
