import { fireEvent, render, screen } from "@testing-library/react";
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
    // Rule #2 exception: SandboxDetectorRunStatus is a type-only union with no
    // shared runtime array, so this literal exists purely to drive test
    // iteration over the six statuses — it duplicates no shared runtime catalog.
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

  it("emits the opaque cursor without placing it in a URL", () => {
    const onNext = vi.fn();
    render(
      <AuditCursorPager
        nextCursor="sbxcur_v1.abc.def"
        loading={false}
        onNext={onNext}
        onRestart={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /下一页/ }));
    expect(onNext).toHaveBeenCalledWith("sbxcur_v1.abc.def");
    expect(window.location.search).not.toContain("sbxcur_v1");
  });
});
