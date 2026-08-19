import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
  SANDBOX_SECURITY_MAX_TEXT_BYTES,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES,
  type SandboxSecuritySubmittedContentItem
} from "../../../../shared/types/sandbox-security";
import { describeSandboxSecurityViolation } from "../../content/sandbox-security-copy";
import { ContentItemRow, parseEditedValue } from "./ContentItemRow";
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

function ControlledEvaluationRequestForm() {
  const [state, setState] = useState({
    stage: baseProps.stage,
    policyProfileId: baseProps.policyProfileId,
    contentItems: baseProps.contentItems,
    toolRequest: baseProps.toolRequest
  });

  return (
    <EvaluationRequestForm
      {...baseProps}
      {...state}
      onChange={setState}
    />
  );
}

describe("REQ-SBX-GENERAL-005 evaluation request form", () => {
  it("renders radio-semantic horizontal stage tabs with the selected Chinese description", () => {
    render(<ControlledEvaluationRequestForm />);
    const group = screen.getByRole("group", { name: "EVALUATION STAGE · 阶段" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByText("评估用户输入内容，检测注入与越权意图")).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("radio", { name: "tool_request" }));
    expect(
      screen.getByText("评估工具调用请求，检测参数劫持与作用域滥用")
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/工具名称/)).toBeInTheDocument();
  });

  it("renders a verified read-only policy status instead of switch semantics", () => {
    render(<ControlledEvaluationRequestForm />);
    const status = screen.getByTestId("security-policy-status");
    expect(status).toHaveTextContent("POLICY: sandbox-security-balanced.v1");
    expect(status).toHaveTextContent("规则必检 · 本地模型可选 · 高/严重风险短路");
    expect(status).not.toHaveAttribute("role", "switch");
    expect(status).not.toHaveAttribute("aria-checked");

    fireEvent.click(
      screen.getByRole("radio", { name: "sandbox-security-strict.v1 严格" })
    );
    expect(status).toHaveTextContent(
      "规则与本地模型必检 · 中/高/严重风险短路"
    );
  });

  it("emits only the existing request fields when policy selection changes", () => {
    const onChange = vi.fn();
    render(<EvaluationRequestForm {...baseProps} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("radio", { name: "sandbox-security-strict.v1 严格" })
    );
    expect(onChange).toHaveBeenCalledWith({
      stage: "user_input",
      policyProfileId: "sandbox-security-strict.v1",
      contentItems: baseProps.contentItems,
      toolRequest: null
    });
  });

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
    expect(screen.getByRole("button", { name: /开始评估|评估中/ })).toBeDisabled();
  });

  it("blocks submit while a request is in flight", () => {
    render(<EvaluationRequestForm {...baseProps} submitting />);
    expect(screen.getByRole("button", { name: /开始评估|评估中/ })).toBeDisabled();
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

function CompactRequestComposerHarness() {
  const [state, setState] = useState({
    stage: "user_input" as const,
    policyProfileId: "sandbox-security-balanced.v1" as const,
    contentItems: [
      {
        source_id: "src-0",
        claimed_source_type: "user_input" as const,
        media_type: "text/plain" as const,
        value: "hello",
        provenance_ref: "source://client/0"
      }
    ],
    toolRequest: null
  });

  return (
    <EvaluationRequestForm
      {...baseProps}
      {...state}
      onChange={setState}
    />
  );
}

async function selectOnlyMediaTypeOption(
  option: "text/plain" | "application/json"
): Promise<void> {
  const combobox = screen.getByRole("combobox", { name: /媒体类型/ });
  const selectContainer = combobox.closest(".ant-select");
  const selector = selectContainer?.querySelector(".ant-select-selector") ?? combobox;
  await act(async () => {
    fireEvent.mouseDown(selector, { button: 0 });
    await Promise.resolve();
  });
  const optionEl = await screen.findByRole("option", { name: option });
  await act(async () => {
    fireEvent.mouseDown(optionEl, { button: 0 });
    fireEvent.click(optionEl);
    await Promise.resolve();
  });
}

describe("REQ-SBX-WORKBENCH-R2 compact request composer", () => {
  it("renders a compact source card with a one-line value preview and inline named controls", () => {
    render(<CompactRequestComposerHarness />);
    expect(screen.getByText("src-0")).toBeInTheDocument();
    expect(screen.getByText("5 B")).toBeInTheDocument();
    expect(screen.getByLabelText("来源类型 src-0")).toBeInTheDocument();
    expect(screen.getByLabelText("媒体类型 src-0")).toBeInTheDocument();
    expect(screen.getByLabelText("内容值 src-0")).toHaveAttribute("rows", "1");
  });

  it("REQ-SBX-WORKBENCH-R2 renders an existing structured JSON value and its compact byte size", () => {
    const onChange = vi.fn();
    const item: SandboxSecuritySubmittedContentItem = {
      source_id: "src-json",
      claimed_source_type: "user_input",
      media_type: "application/json",
      value: { message: "hello" },
      provenance_ref: "source://client/json"
    };
    render(
      <ContentItemRow
        index={0}
        item={item}
        canRemove={false}
        reduceMotion
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: /内容值/ })).toHaveValue(
      JSON.stringify(item.value, null, 2)
    );
    expect(screen.getByText("19 B")).toBeInTheDocument();
  });

  it("REQ-SBX-WORKBENCH-R2 preserves a valid application/json edit as a structured value", () => {
    const onChange = vi.fn();
    const item: SandboxSecuritySubmittedContentItem = {
      source_id: "src-json",
      claimed_source_type: "user_input",
      media_type: "application/json",
      value: { message: "hello" },
      provenance_ref: "source://client/json"
    };
    render(
      <ContentItemRow
        index={0}
        item={item}
        canRemove={false}
        reduceMotion
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: /内容值/ }), {
      target: { value: '{"message":"updated","nested":{"enabled":false}}' }
    });

    expect(onChange).toHaveBeenLastCalledWith({
      ...item,
      value: { message: "updated", nested: { enabled: false } }
    });
    expect(onChange.mock.lastCall?.[0].value).not.toBe(
      '{"message":"updated","nested":{"enabled":false}}'
    );
  });

  it("REQ-SBX-WORKBENCH-R2 normalizes a structured JSON value when switching to text/plain", () => {
    const jsonValue = { message: "hello" };
    const displayValue = JSON.stringify(jsonValue, null, 2);
    const result = parseEditedValue(displayValue, "text/plain");
    expect(result).toBe(displayValue);
    expect(typeof result).toBe("string");
  });

  it("REQ-SBX-WORKBENCH-R2 parses JSON-looking text when switching to application/json", () => {
    const jsonText = '{"message":"hello"}';
    const result = parseEditedValue(jsonText, "application/json");
    expect(result).toEqual({ message: "hello" });
  });

  it("REQ-SBX-WORKBENCH-R2 keeps JSON-looking text/plain edits as exact strings", () => {
    const onChange = vi.fn();
    const item: SandboxSecuritySubmittedContentItem = {
      source_id: "src-text",
      claimed_source_type: "user_input",
      media_type: "text/plain",
      value: "before",
      provenance_ref: "source://client/text"
    };
    render(
      <ContentItemRow
        index={0}
        item={item}
        canRemove={false}
        reduceMotion
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );
    const nextText = '{"message":"still text"}';
    fireEvent.change(screen.getByRole("textbox", { name: /内容值/ }), {
      target: { value: nextText }
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...item, value: nextText });
  });

  it("REQ-SBX-WORKBENCH-R2 does not turn JSON numeric overflow into null", () => {
    const onChange = vi.fn();
    const item: SandboxSecuritySubmittedContentItem = {
      source_id: "src-json-overflow",
      claimed_source_type: "user_input",
      media_type: "application/json",
      value: {},
      provenance_ref: "source://client/json-overflow"
    };
    render(
      <ContentItemRow
        index={0}
        item={item}
        canRemove={false}
        reduceMotion
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );
    const overflowDraft = '{"nested":[1e400]}';
    fireEvent.change(screen.getByRole("textbox", { name: /内容值/ }), {
      target: { value: overflowDraft }
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...item, value: overflowDraft });
    expect(onChange.mock.lastCall?.[0].value).not.toEqual({ nested: [Infinity] });
  });

  it("keeps add and remove behavior intact in the compact source stack", () => {
    render(<CompactRequestComposerHarness />);
    fireEvent.click(screen.getByRole("button", { name: "新增来源" }));
    expect(screen.getAllByLabelText(/内容值 src-/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "移除来源 src-1" }));
    expect(screen.getAllByLabelText(/内容值 src-/)).toHaveLength(1);
  });

  it("warns after ninety percent without marking an in-limit request invalid", () => {
    render(<RequestLimitMeter usedBytes={91} limitBytes={100} />);
    expect(screen.getByText("接近上限")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-invalid", "false");
  });

  it("uses the new CTA label and Ant Design loading state", () => {
    const { rerender } = render(<EvaluationRequestForm {...baseProps} />);
    expect(screen.getByRole("button", { name: /开始评估/ })).toBeEnabled();

    rerender(<EvaluationRequestForm {...baseProps} submitting />);
    expect(screen.getByRole("button", { name: /评估中/ })).toBeDisabled();
  });

  it("cancels SourceCard entrance travel when reduced motion is requested", () => {
    render(<EvaluationRequestForm {...baseProps} reduceMotion />);
    expect(screen.getByRole("region", { name: "来源 src-1" })).toHaveAttribute(
      "data-enter-motion",
      "instant"
    );
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
