import { Empty, Table } from "antd";

import { SANDBOX_SECURITY_RISK_CATEGORIES } from "../../../../shared/types/sandbox-security";
import type { SandboxSecurityAuditEvent } from "../../../../shared/types/sandbox-security-api";

// Detector-run status catalog. `SandboxDetectorRunStatus` is a bare union type
// with no runtime `const` array in the shared contract (an explicit exception
// documented in the Phase 3 plan). This literal exists only inside this
// component to iterate the six statuses in a fixed order; it duplicates no
// shared runtime array because none exists to import.
const DETECTOR_RUN_STATUSES = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const;

const mono = { fontFamily: "var(--console-mono)" } as const;

export interface AuditEventTableProps {
  events: SandboxSecurityAuditEvent[];
  /**
   * Accepted for parity with the page-level API; the table renders every
   * variant's detail inline, so no row needs to be expanded to reveal it.
   */
  expandedEventId?: string;
}

/**
 * Renders the content-free audit event union. Every one of the eight variants
 * narrows on `event_type` and renders its own variant-specific fields; no
 * default branch silently drops a variant. Count records render in catalog
 * order from the shared constants, not in object-key order. `audit_purged`
 * carries `authorization_scope_id: null` and `capability_id: null` by contract,
 * so the table never assumes those are present. The submitted content that
 * produced an event is never part of this union and is never rendered.
 */
function renderVariantDetail(event: SandboxSecurityAuditEvent) {
  switch (event.event_type) {
    case "evaluation_completed":
    case "evaluation_replayed":
      return (
        <div>
          <span style={mono}>{event.verdict}</span>{" "}
          <span style={mono}>{event.action}</span>{" "}
          <span style={mono}>{event.risk_level}</span>
          <dl style={{ margin: "4px 0 0" }}>
            {SANDBOX_SECURITY_RISK_CATEGORIES.map((category) => (
              <div key={category}>
                <dt style={{ display: "inline", ...mono }}>{category}</dt>{" "}
                <dd style={{ display: "inline", margin: 0 }}>
                  {String(event.category_counts[category])}
                </dd>
              </div>
            ))}
            {DETECTOR_RUN_STATUSES.map((status) => (
              <div key={status}>
                <dt style={{ display: "inline", ...mono }}>{status}</dt>{" "}
                <dd style={{ display: "inline", margin: 0 }}>
                  {String(event.detector_run_status_counts[status])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case "evaluation_interrupted":
      return <span style={mono}>{event.interruption_code}</span>;
    case "request_rejected":
      return <span style={mono}>{event.rejection_code}</span>;
    case "capability_issued":
      return (
        <span style={mono}>
          {event.scopes.join(", ")} · {event.issued_at} → {event.expires_at}
        </span>
      );
    case "capability_revoked":
      return <span style={mono}>{event.revoked_at}</span>;
    case "audit_read":
      return (
        <span style={mono}>
          {String(event.returned_count)} ·{" "}
          {event.next_cursor_present ? "has_more" : "end"}
        </span>
      );
    case "audit_purged":
      return (
        <span style={mono}>
          retention {String(event.retention_days)} · deleted{" "}
          {String(event.deleted_count)} · {event.has_more ? "has_more" : "end"}
        </span>
      );
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export function AuditEventTable({ events }: AuditEventTableProps) {
  if (events.length === 0) {
    return <Empty description="暂无审计事件" />;
  }
  return (
    <Table
      rowKey="event_id"
      dataSource={events}
      pagination={false}
      columns={[
        {
          title: "事件类型",
          dataIndex: "event_type",
          render: (eventType: string) => <span style={mono}>{eventType}</span>
        },
        {
          title: "主体",
          dataIndex: "subject_id",
          render: (subjectId: string) => <span style={mono}>{subjectId}</span>
        },
        {
          title: "发生时间",
          dataIndex: "occurred_at",
          render: (occurredAt: string) => <span style={mono}>{occurredAt}</span>
        },
        {
          title: "详情",
          key: "detail",
          render: (_value: unknown, event: SandboxSecurityAuditEvent) =>
            renderVariantDetail(event)
        }
      ]}
    />
  );
}
