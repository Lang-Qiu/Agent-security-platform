import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SandboxDetectorRun,
  SandboxSecurityDecision
} from "../../../shared/types/sandbox-security";

import { SandboxSecurityWorkbenchPage } from "./SandboxSecurityWorkbenchPage";

// Reduced motion is the default so the pre-existing success/privacy semantics
// settle immediately; only the reveal-order test opts into normal motion.
const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => motionPreference.reduced
  };
});

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

const TRACE_DECISION: SandboxSecurityDecision = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "opaque-decision-value",
  request_id: "req-trace-1",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-strict.v1",
  verdict: "risk_detected",
  action: "deny",
  risk_level: "critical",
  findings: [
    {
      finding_id: "finding:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      detector_id: "detector://rule-engine/injection/v1",
      detector_version: "1.0.0",
      category: "prompt_injection",
      severity: "critical",
      confidence: 0.91,
      reason_code: "sandbox_security_prompt_injection",
      subject_refs: [
        {
          kind: "content_source",
          source_token: "source://sandbox/security/client-0001/0001",
          locator: { kind: "text_byte_range", start_byte: 4, end_byte: 18 }
        }
      ],
      evidence_refs: ["evidence://sandbox/security/client-0001/0001"]
    }
  ],
  detector_runs: [
    {
      detector_id: "detector://rule-engine/injection/v1",
      detector_version: "1.0.0",
      detector_kind: "rule",
      obligation: "profile_required",
      elapsed_ms: 8,
      status: "matched",
      finding_ids: ["finding:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
    },
    {
      detector_id: "detector://rule-engine/secondary/v1",
      detector_version: "1.0.0",
      detector_kind: "rule",
      obligation: "optional_not_selected",
      elapsed_ms: 0,
      status: "skipped",
      skip_reason: "optional_not_selected"
    },
    {
      detector_id: "detector://local-model/classifier/v2",
      detector_version: "2.0.0",
      detector_kind: "local_model",
      obligation: "profile_required",
      elapsed_ms: 1200,
      status: "timeout",
      error_code: "detector_timeout"
    },
    {
      detector_id: "detector://external/judge/v3",
      detector_version: "3.0.0",
      detector_kind: "external_judge",
      obligation: "runtime_required",
      elapsed_ms: 480,
      status: "invalid_result",
      error_code: "detector_result_invalid"
    }
  ],
  evidence_refs: ["evidence://sandbox/security/client-0001/0001"],
  created_at: "2026-08-10T00:00:01.000Z"
};

// One real finding so the reveal test can assert findings presentation without
// importing authored Showcase fixture data.
const REVEAL_DECISION: SandboxSecurityDecision = {
  ...TRACE_DECISION,
  findings: [
    {
      finding_id:
        "finding:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      detector_id: "detector://rule-engine/injection/v1",
      detector_version: "1.0.0",
      category: "prompt_injection",
      severity: "critical",
      confidence: 0.91,
      reason_code: "sandbox_security_prompt_injection",
      subject_refs: [
        {
          kind: "content_source",
          source_token: "source://sandbox/security/client-0001/0002",
          locator: { kind: "text_byte_range", start_byte: 4, end_byte: 18 }
        }
      ],
      evidence_refs: ["evidence://sandbox/security/client-0001/0002"]
    }
  ]
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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await act(async () => {
    for (let pass = 0; pass < 12; pass += 1) {
      await Promise.resolve();
    }
  });
}

/**
 * Steps the presentation clock until the Inspector reports the requested phase.
 * Asserts relative phase order only — never elapsed milliseconds or timer counts,
 * because the reveal delays are visual tuning inputs rather than contracts.
 */
async function advanceInspectorToPhase(
  phase: "findings" | "detectors" | "decision" | "execution" | "settled"
) {
  const inspector = screen.getByLabelText("评估检查器");
  for (
    let attempt = 0;
    attempt < 500 && inspector.getAttribute("data-reveal-phase") !== phase;
    attempt += 1
  ) {
    await act(async () => vi.advanceTimersToNextTimerAsync());
  }
  expect(inspector).toHaveAttribute("data-reveal-phase", phase);
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(",");

/**
 * Waits until EvidenceTrace is bound to a returned decision. Both `result` and
 * `settled` are result-bound states in the trace's own union: `settled` is the
 * post-reveal resting state, which reduced motion reaches on the first render.
 * Asserting either keeps these checks about data binding rather than about
 * presentation timing.
 */
async function expectResultBoundTrace(trace: HTMLElement): Promise<void> {
  await waitFor(() =>
    expect(["result", "settled"]).toContain(trace.getAttribute("data-state"))
  );
}

function expectPendingSurfaceIsNotKeyboardReachable(
  surface: HTMLElement
): void {
  expect(surface).toHaveAttribute("aria-hidden", "true");
  expect(surface).toHaveAttribute("inert");
  for (const node of surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    expect(node.closest("[inert]")).not.toBeNull();
  }
}

describe("REQ-SBX-GENERAL-005 evaluation workbench page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    motionPreference.reduced = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    motionPreference.reduced = true;
  });

  it("blocks submission until a capability token is present", () => {
    render(<SandboxSecurityWorkbenchPage />);
    fireEvent.change(screen.getByLabelText(/内容值/), { target: { value: "test payload" } });
    expect(screen.getByRole("button", { name: /开始评估|评估中/ })).toBeDisabled();
  });

  it("sends the bearer token and a generated idempotency key on submit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));

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
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/内容值/), { target: { value: "test payload changed" } });
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const first = new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);
    const second = new Headers((fetchImpl.mock.calls[1][1] as RequestInit).headers);
    expect(second.get("idempotency-key")).not.toBe(first.get("idempotency-key"));
  });

  it("renders the decision verdict and action after a successful evaluation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));

    await waitFor(() => expect(screen.getByText("risk_detected")).toBeInTheDocument());
    expect(screen.getByText("deny")).toBeInTheDocument();
  });

  it("prompts for a new capability on 401 without clearing the form payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(401, "SANDBOX_SECURITY_UNAUTHORIZED"));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText(/内容值/)).toHaveValue("test payload");
    expect(screen.getByLabelText(/能力令牌/)).toHaveValue("");
    expect(screen.getByRole("button", { name: /开始评估/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/能力令牌/), {
      target: { value: "tok-replacement" }
    });
    expect(screen.getByRole("button", { name: /开始评估/ })).toBeEnabled();
  });

  it("never places submitted content or the token in the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("REQ-SBX-GENERAL-005 announces the verdict to assistive technology", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估|评估中/ }));

    await waitFor(() => expect(screen.getByText("risk_detected")).toBeInTheDocument());
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent(/risk_detected/);
  });

  it("REQ-SBX-GENERAL-005 gives every form control an accessible name", () => {
    render(<SandboxSecurityWorkbenchPage fetchImpl={vi.fn()} />);
    for (const control of [
      ...screen.getAllByRole("textbox"),
      ...screen.getAllByRole("combobox"),
      ...screen.getAllByRole("button")
    ]) {
      expect(control).toHaveAccessibleName();
    }
  });

  it("REQ-SBX-GENERAL-005 reaches submit by keyboard alone", () => {
    render(<SandboxSecurityWorkbenchPage fetchImpl={vi.fn()} />);
    // Submit is deliberately disabled until a token and non-empty content exist
    // (asserted by "blocks submission until a capability token is present"), and
    // a disabled control cannot receive focus. Fill a valid payload so the
    // control is actionable, then prove it is keyboard-reachable.
    pasteTokenAndFill();
    const submit = screen.getByRole("button", { name: /开始评估|评估中/ });
    submit.focus();
    expect(submit).toHaveFocus();
  });

  it("REQ-SBX-WORKBENCH-R2 renders an inert five-node EvidenceTrace before submission", () => {
    render(<SandboxSecurityWorkbenchPage />);
    const trace = screen.getByTestId("evidence-trace");
    expect(trace).toHaveAttribute("aria-hidden", "true");
    expect(trace).toHaveAttribute("data-state", "idle");
    expect(trace).toHaveAttribute("data-animated", "false");
    expect(
      within(trace).getAllByTestId(/evidence-node-/).map((node) => node.dataset.node)
    ).toEqual(["source", "rule", "model", "judge", "decision"]);
  });

  it("REQ-SBX-WORKBENCH-R2 keeps EvidenceTrace static while the one-shot request is pending", async () => {
    const deferred = createDeferred<Response>();
    const fetchImpl = vi.fn().mockReturnValueOnce(deferred.promise);
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const trace = screen.getByTestId("evidence-trace");
    expect(trace).toHaveAttribute("data-state", "loading");
    expect(trace).toHaveAttribute("data-animated", "false");
    expect(document.body).not.toHaveTextContent("rule.injection");
    expect(document.body).not.toHaveTextContent(/\d+%/);

    deferred.resolve(okResponse(TRACE_DECISION));
    await waitFor(() => expect(screen.getByText("risk_detected")).toBeInTheDocument());
  });

  it("REQ-SBX-WORKBENCH-R2 maps evidence nodes by execution status, not risk severity", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(TRACE_DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    const trace = await screen.findByTestId("evidence-trace");
    await expectResultBoundTrace(trace);
    expect(within(trace).getByTestId("evidence-node-rule")).toHaveAttribute(
      "data-outcome",
      "completed"
    );
    expect(within(trace).getByTestId("evidence-node-model")).toHaveAttribute(
      "data-outcome",
      "timeout"
    );
    expect(within(trace).getByTestId("evidence-node-judge")).toHaveAttribute(
      "data-outcome",
      "error"
    );
    expect(within(trace).getByTestId("evidence-node-decision")).toHaveAttribute(
      "data-outcome",
      "decision-deny"
    );
    expect(within(trace).getByTestId("evidence-node-rule")).not.toHaveAttribute(
      "data-outcome",
      "critical"
    );
  });

  it.each([
    {
      action: "alert",
      policyProfileId: "sandbox-security-balanced.v1",
      outcome: "decision-alert"
    },
    {
      action: "ask",
      policyProfileId: "sandbox-security-strict.v1",
      outcome: "decision-ask"
    }
  ] as const)(
    "REQ-SBX-WORKBENCH-R2 maps the $action decision action without borrowing risk color",
    async ({ action, policyProfileId, outcome }) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        okResponse({
          ...TRACE_DECISION,
          action,
          policy_profile_id: policyProfileId,
          risk_level: "low",
          findings: TRACE_DECISION.findings.map((finding) => ({
            ...finding,
            severity: "low"
          }))
        })
      );
      render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
      pasteTokenAndFill();
      fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

      const trace = await screen.findByTestId("evidence-trace");
      await expectResultBoundTrace(trace);
      expect(within(trace).getByTestId("evidence-node-decision")).toHaveAttribute(
        "data-outcome",
        outcome
      );
    }
  );

  it("REQ-SBX-WORKBENCH-R2 derives seven lifecycle rows without fabricated fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(TRACE_DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    const lifecycle = await screen.findByTestId("execution-trace");
    expect(within(lifecycle).getAllByRole("listitem")).toHaveLength(7);
    expect(lifecycle).toHaveTextContent("req-trace-1");
    expect(lifecycle).toHaveTextContent("1 sources");
    expect(lifecycle).toHaveTextContent(/\d+ B/);
    const submitted = within(lifecycle).getByTestId(
      "execution-step-request_submitted"
    );
    expect(submitted).toHaveTextContent("REQUEST_SUBMITTED");
    expect(submitted).toHaveTextContent("CLIENT_SUBMITTED");
    expect(submitted).toHaveTextContent("请求提交");
    expect(submitted).toHaveTextContent("client_submitted_at:");
    expect(submitted).not.toHaveTextContent(
      /REQUEST_RECEIVED|请求接收|server_received_at/i
    );
    expect(lifecycle).toHaveTextContent("1 timeout");
    expect(lifecycle).toHaveTextContent("sandbox-security-strict.v1");
    expect(lifecycle).toHaveTextContent("opaque-decision-value");
    expect(within(lifecycle).getByTestId("execution-step-rule_evaluation")).toHaveClass(
      "workbench-trace-step--ok"
    );
    expect(lifecycle).not.toHaveTextContent("confidence");
    expect(lifecycle).not.toHaveTextContent("chain of thought");
    expect(lifecycle).not.toHaveTextContent("test payload");
    expect(lifecycle).not.toHaveTextContent("tok-abc");
  });

  it.each(["matched", "no_match"] as const)(
    "REQ-SBX-WORKBENCH-R2 keeps $status plus optional skipped as completed evidence and ok execution",
    async (status) => {
      const completedRule: SandboxDetectorRun = {
        detector_id: `detector://rule-engine/${status}/v1`,
        detector_version: "1.0.0",
        detector_kind: "rule",
        obligation: "profile_required",
        elapsed_ms: 8,
        status,
        finding_ids: status === "matched" ? ["finding:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] : []
      };
      const decision: SandboxSecurityDecision = {
        ...TRACE_DECISION,
        detector_runs: [
          completedRule,
          TRACE_DECISION.detector_runs[1],
          ...TRACE_DECISION.detector_runs.filter(
            (run) => run.detector_kind !== "rule"
          )
        ]
      };
      const fetchImpl = vi.fn().mockResolvedValue(okResponse(decision));
      render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
      pasteTokenAndFill();
      fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

      const evidence = await screen.findByTestId("evidence-trace");
      await expectResultBoundTrace(evidence);
      expect(within(evidence).getByTestId("evidence-node-rule")).toHaveAttribute(
        "data-outcome",
        "completed"
      );

      const step = await screen.findByTestId("execution-step-rule_evaluation");
      expect(step).toHaveClass("workbench-trace-step--ok");
      expect(step).not.toHaveClass("workbench-trace-step--warn");
      expect(step).not.toHaveClass("workbench-trace-step--skipped");
      expect(step).toHaveTextContent("2 run");
      expect(step).toHaveTextContent(`1 ${status}`);
      expect(step).toHaveTextContent("1 skipped");
      expect(step).toHaveTextContent("8 ms");
      expect(step).not.toHaveTextContent(/· SKIPPED$/);
    }
  );

  it("REQ-SBX-WORKBENCH-R2 keeps result trace facts bound after the form is edited", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(TRACE_DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    const lifecycle = await screen.findByTestId("execution-trace");
    expect(lifecycle).toHaveTextContent("1 sources");
    const frozenLifecycleText = lifecycle.textContent;
    fireEvent.click(screen.getByRole("button", { name: "新增来源" }));
    expect(screen.getAllByLabelText(/内容值 src-/)).toHaveLength(2);
    expect(lifecycle).toHaveTextContent("1 sources");
    expect(lifecycle).not.toHaveTextContent("2 sources");
    expect(lifecycle.textContent).toBe(frozenLifecycleText);
  });

  it("REQ-SBX-WORKBENCH-R2 marks an absent detector kind as skipped", async () => {
    const decisionWithoutJudge: SandboxSecurityDecision = {
      ...TRACE_DECISION,
      detector_runs: TRACE_DECISION.detector_runs.filter(
        (run) => run.detector_kind !== "external_judge"
      )
    };
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(decisionWithoutJudge));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    const trace = await screen.findByTestId("evidence-trace");
    await expectResultBoundTrace(trace);
    expect(within(trace).getByTestId("evidence-node-judge")).toHaveAttribute(
      "data-outcome",
      "skipped"
    );
    expect(await screen.findByTestId("execution-step-judge_evaluation")).toHaveTextContent(
      "SKIPPED"
    );
  });

  it("REQ-SBX-WORKBENCH-R2 renders one idle inspector with an inert trace", () => {
    render(<SandboxSecurityWorkbenchPage />);
    const inspector = screen.getByLabelText("评估检查器");
    expect(inspector).toHaveAttribute("data-inspector-state", "idle");
    expect(inspector).toHaveAttribute("aria-busy", "false");
    expect(within(inspector).getByText("等待评估")).toBeInTheDocument();
    expect(within(inspector).getByTestId("evidence-trace")).toHaveAttribute(
      "data-state",
      "idle"
    );
    expect(within(inspector).getByRole("status")).toBeEmptyDOMElement();
  });

  it("REQ-SBX-WORKBENCH-R2 shows honest loading copy while the API promise is pending", async () => {
    const deferred = createDeferred<Response>();
    const fetchImpl = vi.fn().mockReturnValueOnce(deferred.promise);
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const inspector = screen.getByLabelText("评估检查器");
    expect(inspector).toHaveAttribute("data-inspector-state", "loading");
    expect(inspector).toHaveAttribute("aria-busy", "true");
    expect(within(inspector).getByText("EVALUATING")).toBeInTheDocument();
    expect(within(inspector).getByText("rule")).toBeInTheDocument();
    expect(within(inspector).getByText("local_model")).toBeInTheDocument();
    expect(within(inspector).getByText("external_judge")).toBeInTheDocument();
    expect(within(inspector).queryByText("rule.injection")).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(inspector).not.toHaveTextContent(/\d+%/);
    expect(within(inspector).getByRole("status")).toBeEmptyDOMElement();

    deferred.resolve(okResponse(TRACE_DECISION));
    await waitFor(() =>
      expect(inspector).toHaveAttribute("data-inspector-state", "result")
    );
  });

  it("REQ-SBX-GENERAL-006 renders each runtime stage before the final decision", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      }
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" }
      })
    );
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    const send = async (eventName: string, event: unknown) => {
      await act(async () => {
        controller.enqueue(
          new TextEncoder().encode(
            `event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`
          )
        );
        await Promise.resolve();
      });
    };

    await send("stage", {
      schema_version: "sandbox-security-evaluation-stream.v1",
      event_type: "stage",
      request_id: request.request_id,
      sequence: 1,
      stage: "source",
      status: "completed",
      delivery: "live",
      result: { source_count: 1, tool_request_present: false, elapsed_ms: 0 }
    });
    expect(await screen.findByTestId("runtime-stage-source")).toHaveAttribute(
      "data-stage-status",
      "completed"
    );
    expect(screen.getByTestId("runtime-stage-rule")).toHaveAttribute(
      "data-stage-status",
      "pending"
    );

    for (const [sequence, stage, detectorKind, skipReason] of [
      [2, "rule", "rule", null],
      [3, "model", "local_model", "optional_not_configured"],
      [4, "judge", "external_judge", "routing_not_selected"]
    ] as const) {
      await send("stage", {
        schema_version: "sandbox-security-evaluation-stream.v1",
        event_type: "stage",
        request_id: request.request_id,
        sequence,
        stage,
        status: skipReason === null ? "no_match" : "skipped",
        delivery: "live",
        result: {
          detector_id: `detector://sandbox/security/${stage}/default/v1`,
          detector_version: "1.0.0",
          detector_kind: detectorKind,
          obligation: skipReason === null ? "profile_required" : "optional_not_selected",
          elapsed_ms: 2,
          ...(skipReason === null ? {} : { skip_reason: skipReason })
        }
      });
    }
    expect(screen.getByTestId("runtime-stage-judge")).toHaveAttribute(
      "data-stage-status",
      "skipped"
    );
    expect(screen.getByTestId("runtime-stage-judge")).toHaveTextContent(
      "routing_not_selected"
    );

    await send("decision", {
      schema_version: "sandbox-security-evaluation-stream.v1",
      event_type: "decision",
      request_id: request.request_id,
      sequence: 5,
      stage: "decision",
      delivery: "live",
      decision: { ...TRACE_DECISION, request_id: request.request_id }
    });
    controller.close();
    await waitFor(() =>
      expect(screen.getByLabelText("评估检查器")).toHaveAttribute(
        "data-inspector-state",
        "result"
      )
    );
    expect(screen.getByTestId("insight-grid")).toBeInTheDocument();
  });

  it("REQ-SBX-WORKBENCH-R2 replaces loading with a retryable error inspector", async () => {
    const deferred = createDeferred<Response>();
    const fetchImpl = vi.fn().mockReturnValueOnce(deferred.promise);
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    deferred.resolve(
      errorResponse(503, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE")
    );
    const inspector = screen.getByLabelText("评估检查器");
    await waitFor(() =>
      expect(inspector).toHaveAttribute("data-inspector-state", "error")
    );
    expect(within(inspector).getByRole("alert")).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: /重试/ })).toBeEnabled();
  });

  it("REQ-SBX-WORKBENCH-R2 removes the previous result as soon as re-submit starts", async () => {
    const secondResponse = createDeferred<Response>();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okResponse(TRACE_DECISION))
      .mockReturnValueOnce(secondResponse.promise);
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
    await waitFor(() => expect(screen.getByText("risk_detected")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("内容值 src-0"), {
      target: { value: "changed payload" }
    });
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
    const inspector = screen.getByLabelText("评估检查器");
    expect(inspector).toHaveAttribute("data-inspector-state", "loading");
    expect(within(inspector).queryByText("risk_detected")).not.toBeInTheDocument();

    secondResponse.resolve(okResponse(TRACE_DECISION));
    await waitFor(() =>
      expect(inspector).toHaveAttribute("data-inspector-state", "result")
    );
  });

  it("REQ-SBX-WORKBENCH-R2 keeps final DOM order while revealing findings and detectors before decision", async () => {
    motionPreference.reduced = false;
    vi.useFakeTimers();
    const deferred = createDeferred<Response>();
    const fetchImpl = vi.fn().mockReturnValueOnce(deferred.promise);
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
    deferred.resolve(okResponse(REVEAL_DECISION));
    await flushAsyncWork();

    const inspector = screen.getByLabelText("评估检查器");
    const liveRegion = within(inspector).getByRole("status");
    expect(liveRegion).toBeEmptyDOMElement();
    expect(inspector).toHaveAttribute("data-inspector-state", "result");
    expect(inspector).toHaveAttribute("data-reveal-phase", "evidence");
    const trace = within(inspector).getByTestId("evidence-trace");
    const decision = within(inspector).getByLabelText("评估决策摘要");
    const insight = within(inspector).getByTestId("insight-grid");
    const execution = within(inspector).getByTestId("execution-trace");
    const findings = within(insight).getByTestId("findings-presentation");
    const detectors = within(insight).getByTestId("detectors-presentation");
    const ordered = [trace, decision, insight, execution];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      expect(
        ordered[index].compareDocumentPosition(ordered[index + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
    expect(decision).toHaveAttribute("data-reveal-state", "pending");
    expect(findings).toHaveAttribute("data-presentation-active", "false");
    expect(detectors).toHaveAttribute("data-presentation-active", "false");
    expectPendingSurfaceIsNotKeyboardReachable(decision);
    expectPendingSurfaceIsNotKeyboardReachable(findings);
    expectPendingSurfaceIsNotKeyboardReachable(detectors);
    expectPendingSurfaceIsNotKeyboardReachable(execution);

    await advanceInspectorToPhase("findings");
    expect(findings).toHaveAttribute("data-presentation-active", "true");
    expect(findings).not.toHaveAttribute("aria-hidden");
    expect(findings).not.toHaveAttribute("inert");
    const findingButton = within(findings).getByRole("button", { expanded: false });
    findingButton.focus();
    expect(findingButton).toHaveFocus();
    expectPendingSurfaceIsNotKeyboardReachable(detectors);
    expect(decision).toHaveAttribute("data-reveal-state", "pending");

    await advanceInspectorToPhase("detectors");
    expect(detectors).toHaveAttribute("data-presentation-active", "true");
    expect(detectors).not.toHaveAttribute("aria-hidden");
    expect(detectors).not.toHaveAttribute("inert");
    expect(decision).toHaveAttribute("data-reveal-state", "pending");
    expectPendingSurfaceIsNotKeyboardReachable(decision);

    await advanceInspectorToPhase("decision");
    expect(decision).toHaveAttribute("data-reveal-state", "visible");
    expect(decision).not.toHaveAttribute("aria-hidden");
    expect(decision).not.toHaveAttribute("inert");
    expect(within(inspector).getByRole("status")).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent("risk_detected deny critical");
    expectPendingSurfaceIsNotKeyboardReachable(execution);

    await advanceInspectorToPhase("execution");
    expect(execution).toHaveAttribute("data-reveal-state", "visible");
    expect(execution).not.toHaveAttribute("aria-hidden");
    expect(execution).not.toHaveAttribute("inert");
    expect(within(inspector).getByText("prompt_injection")).toBeInTheDocument();
    await advanceInspectorToPhase("settled");
  });

  it("REQ-SBX-WORKBENCH-R2 cancels every reveal gate under reduced motion", async () => {
    motionPreference.reduced = true;
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(REVEAL_DECISION));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    const inspector = screen.getByLabelText("评估检查器");
    const liveRegion = within(inspector).getByRole("status");
    expect(liveRegion).toBeEmptyDOMElement();
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    await waitFor(() =>
      expect(inspector).toHaveAttribute("data-inspector-state", "result")
    );
    expect(inspector).toHaveAttribute("data-reveal-phase", "settled");
    expect(within(inspector).getByLabelText("评估决策摘要")).toHaveAttribute(
      "data-reveal-state",
      "visible"
    );
    expect(within(inspector).getByTestId("execution-trace")).toHaveAttribute(
      "data-reveal-state",
      "visible"
    );
    for (const surface of [
      within(inspector).getByLabelText("评估决策摘要"),
      within(inspector).getByTestId("findings-presentation"),
      within(inspector).getByTestId("detectors-presentation"),
      within(inspector).getByTestId("execution-trace")
    ]) {
      expect(surface).not.toHaveAttribute("aria-hidden");
      expect(surface).not.toHaveAttribute("inert");
    }
    expect(within(inspector).getByRole("status")).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent("risk_detected deny critical");
    expect(within(inspector).getByText("prompt_injection")).toBeInTheDocument();
  });

  it("REQ-SBX-WORKBENCH-R2 marks a detector kind with only skipped runs as skipped", async () => {
    const skippedJudgeRun: SandboxDetectorRun = {
      detector_id: "detector://external/judge-optional/v3",
      detector_version: "3.0.0",
      detector_kind: "external_judge",
      obligation: "optional_not_selected",
      elapsed_ms: 0,
      status: "skipped",
      skip_reason: "optional_not_selected"
    };
    const decisionWithSkippedJudge: SandboxSecurityDecision = {
      ...TRACE_DECISION,
      detector_runs: [
        ...TRACE_DECISION.detector_runs.filter(
          (run) => run.detector_kind !== "external_judge"
        ),
        skippedJudgeRun
      ]
    };
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(decisionWithSkippedJudge));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    const trace = await screen.findByTestId("evidence-trace");
    await expectResultBoundTrace(trace);
    expect(within(trace).getByTestId("evidence-node-judge")).toHaveAttribute(
      "data-outcome",
      "skipped"
    );
    const step = await screen.findByTestId("execution-step-judge_evaluation");
    expect(step).toHaveClass("workbench-trace-step--skipped");
    expect(step).not.toHaveClass("workbench-trace-step--ok");
    expect(step).toHaveTextContent("SKIPPED");
  });
});
