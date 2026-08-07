# Phase 3 Presentational Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Complete one task, review it, commit its exact paths, and stop
> before starting the next task.

**Goal:** Build the eleven presentational components for the evaluation
workbench and audit view — props in, callbacks out, no data fetching — with
every catalog value rendered from its shared constant and both discriminated
unions rendered exhaustively.

**Architecture:** No component in this Phase imports a service, calls `fetch`,
or reads the router. Each takes plain props and emits callbacks, matching the
repository's established split (`frontend.instructions.md`: "Keep page-level
data loading separate from presentational components"). Phase 4 wires them.
`SandboxSecurityValueTag` is built first because every other component depends
on it for semantic colour.

**Tech Stack:** React 19.2.4, antd 6.3.4, TypeScript 6.0.2, Vitest 4.1.1,
`@testing-library/react` 16.3.2, shared catalogs from
`shared/types/sandbox-security`.

---

## Document Status

- Requirement: `REQ-SBX-GENERAL-005`
- Phase: 3 of 5
- Date: `2026-08-07`
- Status: `PLAN_DRAFT_PENDING_REVIEW`
- Canonical specification:
  `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`
- Predecessor: Phase 2 complete, committed, reviewed, all exit criteria met

---

## Entry Gate

- [ ] Confirm Phase 2's exit criteria hold, including that no violation, error
  value, or URL carries a submitted value or capability token.
- [ ] Read the approved spec sections `UI Component Skeleton`,
  `Route And Navigation Surface`, `Accessibility`, and `Privacy Rules`.
- [ ] Record the baseline:

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
```

Expected: all Phase 1 and Phase 2 suites green, 221 pre-existing tests
unchanged.

---

## Locked Presentation Rules

These are fixed for the whole Phase and are asserted by tests, not left to
judgement.

1. **English enum values, Chinese chrome.** A contract value
   (`risk_detected`, `deny`, `prompt_injection`, `tool_hijacking`) renders
   verbatim in English so an operator can correlate it with backend logs and
   audit rows. Chinese appears in column headers, section titles, helper text,
   legends, and buttons. No component translates a contract value into Chinese
   as its primary rendering.
2. **No local enum for the seven runtime catalogs.** Exactly seven catalogs
   exist as runtime `as const` arrays in `shared/types/sandbox-security`:
   `SANDBOX_SECURITY_STAGES`, `SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES`,
   `SANDBOX_SECURITY_RISK_CATEGORIES`, `SANDBOX_SECURITY_POLICY_PROFILE_IDS`,
   `SANDBOX_SECURITY_SEVERITIES`, `SANDBOX_SECURITY_VERDICTS`, and
   `SANDBOX_SECURITY_ACTIONS`. A hardcoded array duplicating any of those seven
   fails review.

   **Two catalogs are type-only and have no runtime array — this is an explicit
   exception, not an oversight.** `SandboxDetectorRunStatus`
   (`shared/types/sandbox-security.ts`) and `SandboxSecurityAuditEventType`
   (`shared/types/sandbox-security-api.ts`) are bare union types;
   `shared/types/sandbox-security-api.ts` exports no `const` array at all, and
   this requirement may not add a shared contract. For these two, production
   code enforces exhaustiveness with a `switch` over the discriminant closed by
   a `const _exhaustive: never = value` guard — never by mapping an array. A
   literal array is permitted only inside a test, purely to drive iteration, and
   only with a comment naming this exception.
3. **Monospace only for machine identity.** `--console-mono` applies to IDs,
   digests, cursors, and provenance refs. Never to prose.
4. **Exhaustive unions.** `SandboxDetectorRun` has three status groups and
   `SandboxSecurityAuditEvent` has eight variants. Each must render its own
   variant-specific fields; a default branch that silently drops fields fails
   review.
5. **No content in chrome.** No component writes a submitted value into a
   `title` attribute, `aria-label`, `data-*` attribute, URL, or storage.

---

### Task P3-T1: Semantic Value Tag

**Files:**
- Create: `frontend/src/components/sandbox-security/SandboxSecurityValueTag.tsx`
- Create: `frontend/src/components/sandbox-security/sandbox-security-value-tag.spec.tsx`

Every other component depends on this, so it lands first.

- [ ] **Step 1: Write the failing tag test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SANDBOX_SECURITY_ACTIONS,
  SANDBOX_SECURITY_RISK_CATEGORIES,
  SANDBOX_SECURITY_SEVERITIES,
  SANDBOX_SECURITY_VERDICTS
} from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";

describe("REQ-SBX-GENERAL-005 semantic value tag", () => {
  it("renders every verdict verbatim in English", () => {
    for (const verdict of SANDBOX_SECURITY_VERDICTS) {
      const { unmount } = render(
        <SandboxSecurityValueTag domain="verdict" value={verdict} />
      );
      expect(screen.getByText(verdict)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders every action verbatim in English", () => {
    for (const action of SANDBOX_SECURITY_ACTIONS) {
      const { unmount } = render(
        <SandboxSecurityValueTag domain="action" value={action} />
      );
      expect(screen.getByText(action)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders all nine risk categories", () => {
    expect(SANDBOX_SECURITY_RISK_CATEGORIES).toHaveLength(9);
    for (const category of SANDBOX_SECURITY_RISK_CATEGORIES) {
      const { unmount } = render(
        <SandboxSecurityValueTag domain="category" value={category} />
      );
      expect(screen.getByText(category)).toBeInTheDocument();
      unmount();
    }
  });

  it("distinguishes deny from allow by accessible text, not colour alone", () => {
    render(<SandboxSecurityValueTag domain="action" value="deny" />);
    render(<SandboxSecurityValueTag domain="action" value="allow" />);
    expect(screen.getByText("deny")).toBeInTheDocument();
    expect(screen.getByText("allow")).toBeInTheDocument();
  });

  it("maps severity to a distinct token per level", () => {
    const seen = new Set<string>();
    for (const severity of SANDBOX_SECURITY_SEVERITIES) {
      const { container, unmount } = render(
        <SandboxSecurityValueTag domain="severity" value={severity} />
      );
      const tag = container.querySelector("[data-severity]");
      expect(tag?.getAttribute("data-severity")).toBe(severity);
      seen.add(severity);
      unmount();
    }
    expect(seen.size).toBe(SANDBOX_SECURITY_SEVERITIES.length);
  });

  it("renders info as a valid risk level even though it is not a severity", () => {
    render(<SandboxSecurityValueTag domain="risk_level" value="info" />);
    expect(screen.getByText("info")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify the RED, then GREEN**

Implement domains `verdict`, `action`, `severity`, `risk_level`, `category`,
`stage`, `profile`, `detector_status`, `audit_event_type`. Colour comes from the
Phase 1 token module; no hex literal appears in this file. Note that
`risk_level` is `"info" | SandboxSecuritySeverity` — `info` is deliberately not
a member of `SANDBOX_SECURITY_SEVERITIES`, so the `risk_level` domain must accept
it explicitly.

- [ ] **Step 3: Commit exactly**

```text
frontend/src/components/sandbox-security/SandboxSecurityValueTag.tsx
frontend/src/components/sandbox-security/sandbox-security-value-tag.spec.tsx
```

Suggested message:
`feat(frontend): add sandbox security semantic value tag`

---

### Task P3-T2: Capability Session Panel

**Files:**
- Create: `frontend/src/components/sandbox-security/CapabilitySessionPanel.tsx`
- Create: `frontend/src/components/sandbox-security/capability-session-panel.spec.tsx`

This is the component the approved capability decision rests on. Its tests are
the enforcement of "memory-only".

- [ ] **Step 1: Write the failing capability test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CapabilitySessionPanel } from "./CapabilitySessionPanel";

describe("REQ-SBX-GENERAL-005 capability session panel", () => {
  it("uses a password-type field so the token is not shoulder-readable", () => {
    render(<CapabilitySessionPanel hasToken={false} onTokenChange={vi.fn()} onClear={vi.fn()} />);
    const field = screen.getByLabelText(/能力令牌/);
    expect(field).toHaveAttribute("type", "password");
  });

  it("never writes the token to localStorage or sessionStorage", async () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");
    const onTokenChange = vi.fn();

    render(<CapabilitySessionPanel hasToken={false} onTokenChange={onTokenChange} onClear={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/能力令牌/), "tok-secret");

    expect(onTokenChange).toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    localSet.mockRestore();
    sessionSet.mockRestore();
  });

  it("disables autocomplete and spellcheck on the token field", () => {
    render(<CapabilitySessionPanel hasToken={false} onTokenChange={vi.fn()} onClear={vi.fn()} />);
    const field = screen.getByLabelText(/能力令牌/);
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("spellcheck", "false");
  });

  it("never renders the token value back into the document once held", () => {
    render(<CapabilitySessionPanel hasToken onTokenChange={vi.fn()} onClear={vi.fn()} />);
    expect(document.body.textContent).not.toContain("tok-secret");
  });

  it("offers a clear action that drops the in-memory token", async () => {
    const onClear = vi.fn();
    render(<CapabilitySessionPanel hasToken onTokenChange={vi.fn()} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: /清除/ }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("states that the token is memory-only and lost on reload", () => {
    render(<CapabilitySessionPanel hasToken={false} onTokenChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText(/仅保存在内存/)).toBeInTheDocument();
  });

  it("prompts for a fresh token when the backend reported it unusable", () => {
    render(
      <CapabilitySessionPanel
        hasToken
        requiresNewCapability
        onTokenChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify the RED, then GREEN**

The component is controlled: it holds no token in its own state beyond the
input's transient value, and reports upward through `onTokenChange`. It receives
`hasToken: boolean`, never the token itself, so the token cannot be re-rendered
into the DOM. The capability is opaque, so render no expiry countdown — surface
expiry only when the backend answers 401/403.

- [ ] **Step 3: Commit exactly**

```text
frontend/src/components/sandbox-security/CapabilitySessionPanel.tsx
frontend/src/components/sandbox-security/capability-session-panel.spec.tsx
```

Suggested message:
`feat(frontend): add memory-only capability session panel`

---

### Task P3-T3: Evaluation Request Form

**Files:**
- Create: `frontend/src/components/sandbox-security/EvaluationRequestForm.tsx`
- Create: `frontend/src/components/sandbox-security/ContentItemRow.tsx`
- Create: `frontend/src/components/sandbox-security/ToolRequestFields.tsx`
- Create: `frontend/src/components/sandbox-security/RequestLimitMeter.tsx`
- Create: `frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx`

- [ ] **Step 1: Write the failing form test**

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_TEXT_BYTES,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES
} from "../../../../shared/types/sandbox-security";
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

  it("caps the add-item control at the shared item bound", () => {
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
```

- [ ] **Step 2: Verify the RED, then GREEN**

The form is fully controlled — it owns no request state; the page does. Content
`value` lives only in React props/state, never in the URL, never in storage.
The profile control is a fixed two-option selector because
`SandboxSecurityRequest` forbids caller-submitted profiles. `ToolRequestFields`
renders `call_id`, `tool_name`, `arguments` (JSON), and optional `target`, and
must expose no provider, model, endpoint, timeout, retry, or production-mode
field.

- [ ] **Step 3: Commit exactly**

```text
frontend/src/components/sandbox-security/EvaluationRequestForm.tsx
frontend/src/components/sandbox-security/ContentItemRow.tsx
frontend/src/components/sandbox-security/ToolRequestFields.tsx
frontend/src/components/sandbox-security/RequestLimitMeter.tsx
frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx
```

Suggested message:
`feat(frontend): add sandbox security evaluation request form`

---

### Task P3-T4: Decision Rendering

**Files:**
- Create: `frontend/src/components/sandbox-security/DecisionSummaryPanel.tsx`
- Create: `frontend/src/components/sandbox-security/FindingsTable.tsx`
- Create: `frontend/src/components/sandbox-security/DetectorRunTable.tsx`
- Create: `frontend/src/components/sandbox-security/decision-rendering.spec.tsx`

The detector-run union is the correctness risk here: three status groups with
mutually exclusive fields.

- [ ] **Step 1: Write the failing decision test**

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  SandboxDetectorRun,
  SandboxSecurityDecision,
  SandboxSecurityFinding
} from "../../../../shared/types/sandbox-security";
import { DecisionSummaryPanel } from "./DecisionSummaryPanel";
import { DetectorRunTable } from "./DetectorRunTable";
import { FindingsTable } from "./FindingsTable";

const FINDING: SandboxSecurityFinding = {
  finding_id: "finding:1",
  detector_id: "rule.injection",
  detector_version: "1.4.0",
  category: "prompt_injection",
  severity: "critical",
  confidence: 0.94,
  reason_code: "sandbox_security_prompt_injection",
  subject_refs: [
    {
      kind: "content_source",
      source_token: "srctok-1",
      locator: { kind: "text_byte_range", start_byte: 12, end_byte: 48 }
    }
  ],
  evidence_refs: ["evidence:1"]
};

const DECISION: SandboxSecurityDecision = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "decision:1",
  request_id: "req-1",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-strict.v1",
  verdict: "risk_detected",
  action: "deny",
  risk_level: "critical",
  findings: [FINDING],
  detector_runs: [],
  evidence_refs: ["evidence:1"],
  created_at: "2026-08-07T00:00:00.000Z"
};

describe("REQ-SBX-GENERAL-005 decision summary", () => {
  it("announces verdict and action in a live region", () => {
    render(<DecisionSummaryPanel decision={DECISION} />);
    const live = screen.getByRole("status");
    expect(within(live).getByText("risk_detected")).toBeInTheDocument();
    expect(within(live).getByText("deny")).toBeInTheDocument();
  });

  it("labels the decision as simulation and not enforcement", () => {
    render(<DecisionSummaryPanel decision={DECISION} />);
    expect(screen.getByText("simulation")).toBeInTheDocument();
    expect(screen.getByText(/不可用于实际拦截/)).toBeInTheDocument();
  });

  it("renders decision identity in monospace-marked elements", () => {
    const { container } = render(<DecisionSummaryPanel decision={DECISION} />);
    const identity = container.querySelector('[data-mono="true"]');
    expect(identity?.textContent).toContain("decision:1");
  });

  it("explains no_detected_risk as not a safety proof", () => {
    render(
      <DecisionSummaryPanel
        decision={{ ...DECISION, verdict: "no_detected_risk", action: "allow", risk_level: "info", findings: [] }}
      />
    );
    expect(screen.getByText(/并不证明输入安全/)).toBeInTheDocument();
  });
});

describe("REQ-SBX-GENERAL-005 findings table", () => {
  it("renders category, severity, confidence, and reason code", () => {
    render(<FindingsTable findings={[FINDING]} />);
    expect(screen.getByText("prompt_injection")).toBeInTheDocument();
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("sandbox_security_prompt_injection")).toBeInTheDocument();
    expect(screen.getByText("0.94")).toBeInTheDocument();
  });

  it("renders a byte-range locator as a position, never as content", () => {
    render(<FindingsTable findings={[FINDING]} />);
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/48/)).toBeInTheDocument();
  });

  it("renders a json_pointer locator", () => {
    render(
      <FindingsTable
        findings={[
          {
            ...FINDING,
            subject_refs: [
              {
                kind: "content_source",
                source_token: "srctok-1",
                locator: { kind: "json_pointer", pointer: "/messages/0/text" }
              }
            ]
          }
        ]}
      />
    );
    expect(screen.getByText("/messages/0/text")).toBeInTheDocument();
  });

  it("renders a tool_request subject with its component", () => {
    render(
      <FindingsTable
        findings={[
          {
            ...FINDING,
            subject_refs: [
              { kind: "tool_request", call_token: "calltok-1", component: "tool_name" }
            ]
          }
        ]}
      />
    );
    expect(screen.getByText("tool_name")).toBeInTheDocument();
  });

  it("renders an empty state without inventing a finding", () => {
    render(<FindingsTable findings={[]} />);
    expect(screen.getByText(/未产生风险发现/)).toBeInTheDocument();
  });
});

describe("REQ-SBX-GENERAL-005 detector run table", () => {
  const runs: SandboxDetectorRun[] = [
    {
      detector_id: "rule.injection",
      detector_version: "1.4.0",
      detector_kind: "rule",
      obligation: "profile_required",
      elapsed_ms: 4,
      status: "matched",
      finding_ids: ["finding:1"]
    },
    {
      detector_id: "local.classifier",
      detector_version: "2.0.0",
      detector_kind: "local_model",
      obligation: "runtime_required",
      elapsed_ms: 812,
      status: "timeout",
      error_code: "detector_timeout"
    },
    {
      detector_id: "external.judge",
      detector_version: "1.0.0",
      detector_kind: "external_judge",
      obligation: "optional_not_selected",
      elapsed_ms: 0,
      status: "skipped",
      skip_reason: "optional_not_configured"
    }
  ];

  it("renders the variant-specific field for each status group", () => {
    render(<DetectorRunTable runs={runs} />);
    expect(screen.getByText("finding:1")).toBeInTheDocument();
    expect(screen.getByText("detector_timeout")).toBeInTheDocument();
    expect(screen.getByText("optional_not_configured")).toBeInTheDocument();
  });

  it("renders detector kind and obligation for every run", () => {
    render(<DetectorRunTable runs={runs} />);
    expect(screen.getByText("rule")).toBeInTheDocument();
    expect(screen.getByText("local_model")).toBeInTheDocument();
    expect(screen.getByText("external_judge")).toBeInTheDocument();
    expect(screen.getByText("profile_required")).toBeInTheDocument();
  });

  it("renders elapsed milliseconds for every run", () => {
    render(<DetectorRunTable runs={runs} />);
    expect(screen.getByText(/812/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify the RED, then GREEN**

`DetectorRunTable` must narrow on `status` and render `finding_ids`,
`error_code`, or `skip_reason` accordingly. `FindingsTable` renders
`subject_refs` as content-free positions — `source_token`, `call_token`,
`component`, byte range, or JSON pointer. A locator is a position, so rendering
it is privacy-safe; rendering the content at that position is not, and no
component in this Phase has access to it.

- [ ] **Step 3: Commit exactly**

```text
frontend/src/components/sandbox-security/DecisionSummaryPanel.tsx
frontend/src/components/sandbox-security/FindingsTable.tsx
frontend/src/components/sandbox-security/DetectorRunTable.tsx
frontend/src/components/sandbox-security/decision-rendering.spec.tsx
```

Suggested message:
`feat(frontend): add sandbox security decision rendering`

---

### Task P3-T5: Audit Rendering

**Files:**
- Create: `frontend/src/components/sandbox-security/AuditEventTable.tsx`
- Create: `frontend/src/components/sandbox-security/AuditCursorPager.tsx`
- Create: `frontend/src/components/sandbox-security/audit-rendering.spec.tsx`

Eight variants, each with its own required fields.

- [ ] **Step 1: Write the failing audit test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SandboxSecurityAuditEvent } from "../../../../shared/types/sandbox-security-api";
import { AuditCursorPager } from "./AuditCursorPager";
import { AuditEventTable } from "./AuditEventTable";

const BASE = {
  schema_version: "sandbox-security-audit-event.v1" as const,
  occurred_at: "2026-08-07T00:00:00.000Z",
  subject_id: "subject-1",
  authorization_scope_id: "scope-1",
  capability_id: "cap-1"
};

const EVAL_FIELDS = {
  request_id: "req-1",
  stage: "user_input" as const,
  policy_profile_id: "sandbox-security-balanced.v1" as const,
  composition_binding: "rule_only",
  elapsed_ms: 12
};

const EVENTS: SandboxSecurityAuditEvent[] = [
  {
    ...BASE,
    ...EVAL_FIELDS,
    event_id: "audit:1",
    event_type: "evaluation_completed",
    verdict: "risk_detected",
    action: "deny",
    risk_level: "critical",
    category_counts: {
      prompt_injection: 1,
      jailbreak: 0,
      instruction_override: 0,
      privilege_escalation: 0,
      sensitive_data_exposure: 0,
      tool_hijacking: 0,
      unsafe_side_effect: 0,
      memory_poisoning: 0,
      trust_boundary_violation: 0
    },
    detector_run_status_counts: {
      matched: 1,
      no_match: 2,
      failed: 0,
      timeout: 0,
      invalid_result: 0,
      skipped: 1
    }
  },
  {
    ...BASE,
    ...EVAL_FIELDS,
    event_id: "audit:2",
    event_type: "evaluation_interrupted",
    interruption_code: "engine_error"
  },
  {
    ...BASE,
    event_id: "audit:3",
    event_type: "request_rejected",
    route_id: "evaluation",
    request_id: "req-2",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: "rule_only",
    elapsed_ms: 3,
    rejection_code: "scope_forbidden"
  },
  {
    ...BASE,
    event_id: "audit:4",
    event_type: "capability_issued",
    scopes: ["sandbox_security:evaluate"],
    allowed_stages: ["user_input"],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
    issued_at: "2026-08-07T00:00:00.000Z",
    expires_at: "2026-08-07T00:15:00.000Z"
  },
  {
    ...BASE,
    event_id: "audit:5",
    event_type: "capability_revoked",
    revoked_at: "2026-08-07T00:10:00.000Z"
  },
  {
    ...BASE,
    event_id: "audit:6",
    event_type: "audit_read",
    returned_count: 50,
    next_cursor_present: true,
    elapsed_ms: 5
  },
  {
    ...BASE,
    event_id: "audit:7",
    event_type: "audit_purged",
    subject_id: "system:bootstrap-admin",
    authorization_scope_id: null,
    capability_id: null,
    retention_days: 90,
    deleted_count: 1000,
    has_more: true,
    elapsed_ms: 40
  },
  {
    // Eighth variant. `evaluation_replayed` shares the completed shape, so a
    // component that narrows only on `evaluation_completed` drops every field
    // here. The exit criterion claims all eight variants render, so all eight
    // must appear in this fixture.
    ...BASE,
    ...EVAL_FIELDS,
    event_id: "audit:8",
    event_type: "evaluation_replayed",
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    category_counts: {
      prompt_injection: 0,
      jailbreak: 0,
      instruction_override: 0,
      privilege_escalation: 0,
      sensitive_data_exposure: 0,
      tool_hijacking: 0,
      unsafe_side_effect: 0,
      memory_poisoning: 0,
      trust_boundary_violation: 0
    },
    detector_run_status_counts: {
      matched: 0,
      no_match: 3,
      failed: 0,
      timeout: 0,
      invalid_result: 0,
      skipped: 1
    }
  }
];

describe("REQ-SBX-GENERAL-005 audit event table", () => {
  it("renders each event type with its variant-specific field", () => {
    render(<AuditEventTable events={EVENTS} />);
    expect(screen.getByText("evaluation_completed")).toBeInTheDocument();
    expect(screen.getByText("engine_error")).toBeInTheDocument();
    expect(screen.getByText("scope_forbidden")).toBeInTheDocument();
    expect(screen.getByText("capability_revoked")).toBeInTheDocument();
    expect(screen.getByText("audit_purged")).toBeInTheDocument();
    // Eighth variant. Without this, a component narrowing only on
    // `evaluation_completed` ships green while dropping every replayed field.
    expect(screen.getByText("evaluation_replayed")).toBeInTheDocument();
  });

  it("renders the nine category counts in catalog order for a completed event", () => {
    render(<AuditEventTable events={[EVENTS[0]]} expandedEventId="audit:1" />);
    expect(screen.getByText(/prompt_injection/)).toBeInTheDocument();
  });

  it("renders the six detector status counts in catalog order", () => {
    render(<AuditEventTable events={[EVENTS[0]]} expandedEventId="audit:1" />);
    for (const status of ["matched", "no_match", "failed", "timeout", "invalid_result", "skipped"]) {
      expect(screen.getByText(new RegExp(status))).toBeInTheDocument();
    }
  });

  it("tolerates the null scope and capability of a purge event", () => {
    render(<AuditEventTable events={[EVENTS[6]]} />);
    expect(screen.getByText("system:bootstrap-admin")).toBeInTheDocument();
  });

  it("renders an empty state for a page with no events", () => {
    render(<AuditEventTable events={[]} />);
    expect(screen.getByText(/暂无审计事件/)).toBeInTheDocument();
  });
});

describe("REQ-SBX-GENERAL-005 audit cursor pager", () => {
  it("disables next when no cursor is present", () => {
    render(<AuditCursorPager nextCursor={null} loading={false} onNext={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByRole("button", { name: /下一页/ })).toBeDisabled();
  });

  it("emits the opaque cursor without placing it in a URL", async () => {
    const onNext = vi.fn();
    render(
      <AuditCursorPager
        nextCursor="sbxcur_v1.abc.def"
        loading={false}
        onNext={onNext}
        onRestart={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /下一页/ }));
    expect(onNext).toHaveBeenCalledWith("sbxcur_v1.abc.def");
    expect(window.location.search).not.toContain("sbxcur_v1");
  });
});
```

- [ ] **Step 2: Verify the RED, then GREEN**

Narrow on `event_type` for all eight variants. `audit_purged` has
`authorization_scope_id: null` and `capability_id: null` by contract, so the
table must not assume those are present. Count records render in catalog order
from the shared constants, not in object-key order.

- [ ] **Step 3: Commit exactly**

```text
frontend/src/components/sandbox-security/AuditEventTable.tsx
frontend/src/components/sandbox-security/AuditCursorPager.tsx
frontend/src/components/sandbox-security/audit-rendering.spec.tsx
```

Suggested message:
`feat(frontend): add sandbox security audit rendering`

---

## Phase 3 Exit Criteria

- [ ] All eleven components exist and no component imports a service, calls
  `fetch`, or reads the router.
- [ ] Every catalog renders from a shared constant; no local enum duplicate
  exists in any new file.
- [ ] `SandboxDetectorRun` renders all three status groups with their exclusive
  fields; `SandboxSecurityAuditEvent` renders all eight variants.
- [ ] The capability panel receives `hasToken: boolean`, never the token, and
  its tests prove no storage write.
- [ ] Verdict and action are announced in a live region; the decision is
  labelled `simulation`.
- [ ] `no_detected_risk` is presented as "not a safety proof", matching the
  Engine's evidence-bounded semantics.
- [ ] No submitted value reaches a `title`, `aria-label`, `data-*`, URL, or
  storage.
- [ ] No hex literal appears in any new component file.
- [ ] All 221 pre-existing tests still pass with no existing spec edited.

Stop and report before Phase 4. Register no route in this Phase.
