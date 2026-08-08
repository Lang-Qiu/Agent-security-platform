import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
  SANDBOX_SECURITY_MAX_TEXT_BYTES,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES
} from "../../../../shared/types/sandbox-security";
import { describeSandboxSecurityViolation } from "../../content/sandbox-security-copy";
import { EvaluationRequestForm } from "./EvaluationRequestForm";
import { RequestLimitMeter } from "./RequestLimitMeter";

const baseProps = {
  stage: "user_input" as const,
  policyProfileId: "sandbox-security-balanced.v1" as const,
  contentItems: [
    {
      source_id: "src-1",
      claimed_source_type: "user_input" as const,
      media_type: "text/plain" as const,
      value: "hello",
      provenance_ref: "source://client/1"
    }
  ],
  toolRequest: null,
  submitting: false,
  violations: [],
  onChange: vi.fn(),
  onSubmit: vi.fn()
};

describe("REQ-SBX-GENERAL-005 evaluation request form", () => {
  it("offers exactly the three shared stages", () => {
    render(<EvaluationRequestForm {...baseProps} />);
    const group = screen.getByRole("group", { name: /阶段/ });
    for (const stage of SANDBOX_SECURITY_STAGES) {
      expect(within(group).getByText(stage)).toBeInTheDocument();
    }
    expect(SANDBOX_SECURITY_STAGES).toHaveLength(3);
  });

  it("offers exactly the two built-in profiles and no custom profile input", () => {
    render(<EvaluationRequestForm {...baseProps} />);
    const group = screen.getByRole("group", { name: /策略配置/ });
    for (const profile of SANDBOX_SECURITY_POLICY_PROFILE_IDS) {
      expect(within(group).getByText(profile)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/自定义策略/)).not.toBeInTheDocument();
  });

  it("offers all six claimed source types per content item", () => {
    render(<EvaluationRequestForm {...baseProps} />);
    expect(SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES).toHaveLength(6);
  });

  it("shows tool request fields only at the tool_request stage", () => {
    const { rerender } = render(<EvaluationRequestForm {...baseProps} />);
    expect(screen.queryByLabelText(/工具名称/)).not.toBeInTheDocument();

    rerender(
      <EvaluationRequestForm
        {...baseProps}
        stage="tool_request"
        toolRequest={{ call_id: "call-1", tool_name: "", arguments: {} }}
      />
    );
    expect(screen.getByLabelText(/工具名称/)).toBeInTheDocument();
  });

  it("blocks submit while a violation is present", () => {
    render(
      <EvaluationRequestForm
        {...baseProps}
        violations={[{ rule: "text_bytes", sourceId: "src-1" }]}
      />
    );
    expect(screen.getByRole("button", { name: /提交评估/ })).toBeDisabled();
  });

  it("blocks submit while a request is in flight", () => {
    render(<EvaluationRequestForm {...baseProps} submitting />);
    expect(screen.getByRole("button", { name: /提交评估/ })).toBeDisabled();
  });

  // Explicit budget: this is the only test that mounts the maximum bound, which
  // is 64 items x (2 antd Selects + 1 TextArea) = 192 themed controls. Measured
  // at ~4.5 s in jsdom against the 5 s default, so it was already borderline and
  // failed intermittently under the single-worker full suite. The cost is antd
  // control mounting, not application logic.
  it(
    "caps the add-item control at the shared item bound",
    () => {
      const items = Array.from(
        { length: SANDBOX_SECURITY_MAX_CONTENT_ITEMS },
        (_unused, index) => ({
          source_id: `src-${index}`,
          claimed_source_type: "user_input" as const,
          media_type: "text/plain" as const,
          value: "x",
          provenance_ref: `source://client/${index}`
        })
      );
      render(<EvaluationRequestForm {...baseProps} contentItems={items} />);
      expect(screen.getByRole("button", { name: /新增来源/ })).toBeDisabled();
    },
    20000
  );

  it("explains why submit is blocked instead of only disabling it", () => {
    render(
      <EvaluationRequestForm
        {...baseProps}
        violations={[{ rule: "text_bytes", sourceId: "src-1" }]}
      />
    );
    // A disabled control with no stated reason is a dead end for the operator.
    expect(
      screen.getByText(describeSandboxSecurityViolation({ rule: "text_bytes", sourceId: "src-1" }))
    ).toBeInTheDocument();
  });

  it("lists every pending violation, not just the first", () => {
    render(
      <EvaluationRequestForm
        {...baseProps}
        violations={[{ rule: "capability_required" }, { rule: "content_empty" }]}
      />
    );
    expect(
      screen.getByText(describeSandboxSecurityViolation({ rule: "capability_required" }))
    ).toBeInTheDocument();
    expect(
      screen.getByText(describeSandboxSecurityViolation({ rule: "content_empty" }))
    ).toBeInTheDocument();
  });

  it("shows no violation region when the payload is clean", () => {
    render(<EvaluationRequestForm {...baseProps} />);
    expect(screen.queryByText(/提交被阻止/)).not.toBeInTheDocument();
  });

  it("surfaces the request byte budget against the shared whole-request bound", () => {
    render(<EvaluationRequestForm {...baseProps} />);
    const meter = screen.getByRole("progressbar");
    expect(meter).toHaveAttribute("aria-valuemax", String(SANDBOX_SECURITY_MAX_REQUEST_BYTES));
    // A real payload measures above zero, proving the meter is fed the actual
    // serialized request rather than a placeholder constant.
    expect(Number(meter.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });

  it("keeps the violation region free of any submitted value", () => {
    const canary = "SECRET-CANARY-VALUE";
    render(
      <EvaluationRequestForm
        {...baseProps}
        contentItems={[{ ...baseProps.contentItems[0], value: canary }]}
        violations={[{ rule: "text_bytes", sourceId: "src-1" }]}
      />
    );
    expect(screen.getByText(/提交被阻止/).parentElement?.textContent ?? "").not.toContain(
      "SECRET-CANARY"
    );
  });

  it("never places a submitted value in a title or data attribute", async () => {
    const canary = "SECRET-CANARY-VALUE";
    const { container } = render(
      <EvaluationRequestForm
        {...baseProps}
        contentItems={[{ ...baseProps.contentItems[0], value: canary }]}
      />
    );
    for (const element of container.querySelectorAll("*")) {
      expect(element.getAttribute("title") ?? "").not.toContain("SECRET-CANARY");
      for (const attribute of element.getAttributeNames()) {
        if (attribute.startsWith("data-")) {
          expect(element.getAttribute(attribute) ?? "").not.toContain("SECRET-CANARY");
        }
      }
    }
  });
});

describe("REQ-SBX-GENERAL-005 request limit meter", () => {
  it("reports usage against the shared byte bound without echoing content", () => {
    render(<RequestLimitMeter usedBytes={1024} limitBytes={SANDBOX_SECURITY_MAX_TEXT_BYTES} />);
    const meter = screen.getByRole("progressbar");
    expect(meter).toHaveAttribute("aria-valuenow", "1024");
    expect(meter).toHaveAttribute("aria-valuemax", String(SANDBOX_SECURITY_MAX_TEXT_BYTES));
  });

  it("marks an over-limit state accessibly", () => {
    render(
      <RequestLimitMeter
        usedBytes={SANDBOX_SECURITY_MAX_TEXT_BYTES + 1}
        limitBytes={SANDBOX_SECURITY_MAX_TEXT_BYTES}
      />
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-invalid", "true");
  });
});
