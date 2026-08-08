import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SandboxSecurityWorkbenchPage } from "./SandboxSecurityWorkbenchPage";

const DECISION = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "decision:1",
  request_id: "req-1",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  verdict: "risk_detected",
  action: "deny",
  risk_level: "critical",
  findings: [],
  detector_runs: [],
  evidence_refs: [],
  created_at: "2026-08-07T00:00:00.000Z"
};

function okResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ success: true, message: "ok", data, error_code: null, request_id: "http:1" })
  } as unknown as Response;
}

function errorResponse(status: number, errorCode: string) {
  return {
    ok: false,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ success: false, message: "err", data: null, error_code: errorCode, request_id: "http:1" })
  } as unknown as Response;
}

function pasteTokenAndFill() {
  fireEvent.change(screen.getByLabelText(/能力令牌/), { target: { value: "tok-abc" } });
  fireEvent.change(screen.getByLabelText(/内容值/), { target: { value: "test payload" } });
}

describe("REQ-SBX-GENERAL-005 evaluation workbench page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks submission until a capability token is present", () => {
    render(<SandboxSecurityWorkbenchPage />);
    fireEvent.change(screen.getByLabelText(/内容值/), { target: { value: "test payload" } });
    expect(screen.getByRole("button", { name: /提交评估/ })).toBeDisabled();
  });

  it("sends the bearer token and a generated idempotency key on submit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer tok-abc");
    expect(headers.get("idempotency-key")).toBeTruthy();
  });

  it("reuses the same idempotency key when retrying an unchanged payload", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE"))
      .mockResolvedValueOnce(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /重试/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const first = new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);
    const second = new Headers((fetchImpl.mock.calls[1][1] as RequestInit).headers);
    expect(second.get("idempotency-key")).toBe(first.get("idempotency-key"));
  });

  it("generates a fresh idempotency key after the payload is edited", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/内容值/), { target: { value: "test payload changed" } });
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const first = new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);
    const second = new Headers((fetchImpl.mock.calls[1][1] as RequestInit).headers);
    expect(second.get("idempotency-key")).not.toBe(first.get("idempotency-key"));
  });

  it("renders the decision verdict and action after a successful evaluation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));

    await waitFor(() => expect(screen.getByText("risk_detected")).toBeInTheDocument());
    expect(screen.getByText("deny")).toBeInTheDocument();
  });

  it("prompts for a new capability on 401 without clearing the form payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(401, "SANDBOX_SECURITY_UNAUTHORIZED"));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText(/内容值/)).toHaveValue("test payload");
  });

  it("never places submitted content or the token in the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());

    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    expect(url).not.toContain("test payload");
    expect(url).not.toContain("tok-abc");
  });

  it("never persists submitted content or the token to storage", async () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));

    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());

    for (const spy of [localSet, sessionSet]) {
      for (const call of spy.mock.calls) {
        expect(String(call[1])).not.toContain("test payload");
        expect(String(call[1])).not.toContain("tok-abc");
      }
    }
    localSet.mockRestore();
    sessionSet.mockRestore();
  });

  it("does not submit when a client limit violation is present", () => {
    const fetchImpl = vi.fn();
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    fireEvent.change(screen.getByLabelText(/能力令牌/), { target: { value: "tok-abc" } });
    fireEvent.change(screen.getByLabelText(/内容值/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /提交评估/ }));

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
