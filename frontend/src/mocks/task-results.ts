import type { BaseResult } from "../../../../shared/types/result";

export const taskResultMocks: Record<string, BaseResult> = {
  task_asset_001: {
    task_id: "task_asset_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "running",
    risk_level: "high",
    summary: "Detected open ports and a partially identified fingerprint",
    details: {
      confidence: 0.93,
      open_ports: [{ port: 443 }, { port: 8443 }],
      findings: [{ title: "Admin surface exposed" }]
    },
    created_at: "2026-03-26T09:15:00Z",
    updated_at: "2026-03-26T09:18:00Z"
  },
  task_static_001: {
    task_id: "task_static_001",
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "partial_success",
    risk_level: "medium",
    summary: "Rule hit aggregation completed for the primary package",
    details: {
      sample_name: "mail-routing",
      language: "TypeScript",
      files_scanned: 14,
      rule_hits: [{ id: "RULE-001" }, { id: "RULE-002" }]
    },
    created_at: "2026-03-26T08:45:00Z",
    updated_at: "2026-03-26T08:57:00Z"
  },
  task_sandbox_001: {
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "blocked",
    risk_level: "critical",
    summary: "Outbound script download was blocked by sandbox policy",
    details: {
      session_id: "session_demo_001",
      events: [
        {
          event_id: "event_tool_001",
          session_id: "session_demo_001",
          sequence: 1,
          event_type: "tool_request",
          occurred_at: "2026-03-26T07:30:01Z",
          source: "agent",
          evidence_refs: ["evidence://tool/001"],
          payload: {
            call_id: "call_001",
            tool_name: "send_email",
            target_ref: "recipient://outside.example",
            arguments_ref: "fixture://cases/T1-SC-002-C01/tool-request"
          }
        },
        {
          event_id: "event_decision_deny",
          session_id: "session_demo_001",
          sequence: 2,
          event_type: "policy_decision",
          occurred_at: "2026-03-26T07:30:02Z",
          source: "policy",
          evidence_refs: ["evidence://decision/deny"],
          payload: {
            decision_id: "decision_deny",
            subject_event_id: "event_tool_001",
            policy_id: "policy_tool_target",
            action: "deny",
            reason_code: "target_not_approved",
            reason: "Recipient outside approved fixture set",
            evidence_refs: ["evidence://decision/deny"],
            decided_at: "2026-03-26T07:30:02Z"
          }
        },
        {
          event_id: "event_decision_alert",
          session_id: "session_demo_001",
          sequence: 3,
          event_type: "policy_decision",
          occurred_at: "2026-03-26T07:30:03Z",
          source: "policy",
          evidence_refs: ["evidence://decision/alert"],
          payload: {
            decision_id: "decision_alert",
            subject_event_id: "event_tool_001",
            policy_id: "policy_suspicious_target",
            action: "alert",
            reason_code: "target_requires_review",
            reason: "Target triggered alert threshold",
            evidence_refs: ["evidence://decision/alert"],
            decided_at: "2026-03-26T07:30:03Z"
          }
        }
      ],
      policy_decisions: [
        {
          decision_id: "decision_deny",
          subject_event_id: "event_tool_001",
          policy_id: "policy_tool_target",
          action: "deny",
          reason_code: "target_not_approved",
          reason: "Recipient outside approved fixture set",
          evidence_refs: ["evidence://decision/deny"],
          decided_at: "2026-03-26T07:30:02Z"
        },
        {
          decision_id: "decision_alert",
          subject_event_id: "event_tool_001",
          policy_id: "policy_suspicious_target",
          action: "alert",
          reason_code: "target_requires_review",
          reason: "Target triggered alert threshold",
          evidence_refs: ["evidence://decision/alert"],
          decided_at: "2026-03-26T07:30:03Z"
        }
      ],
      alerts: [
        {
          alert_id: "alert_001",
          subject_event_id: "event_tool_001",
          decision_id: "decision_alert",
          risk_level: "high",
          category: "tool_target",
          title: "Suspicious tool target detected",
          reason: "Target differs from approved fixture",
          evidence_refs: ["evidence://alert/001"],
          occurred_at: "2026-03-26T07:30:04Z"
        },
        {
          alert_id: "alert_002",
          subject_event_id: "event_tool_001",
          decision_id: "decision_alert",
          risk_level: "medium",
          category: "outbound_contact",
          title: "Outbound contact requires review",
          reason: "First-time contact to external recipient",
          evidence_refs: ["evidence://alert/002"],
          occurred_at: "2026-03-26T07:30:05Z"
        }
      ],
      blocked_records: [
        {
          blocked_record_id: "blocked_001",
          subject_event_id: "event_tool_001",
          decision_id: "decision_deny",
          resource_ref: "recipient://outside.example",
          reason: "Policy denied the target",
          evidence_refs: ["evidence://blocked/001"],
          occurred_at: "2026-03-26T07:30:02Z"
        }
      ],
      blocked: true,
      event_count: 3
    },
    created_at: "2026-03-26T07:30:00Z",
    updated_at: "2026-03-26T07:41:00Z"
  }
};
