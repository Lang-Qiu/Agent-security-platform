import { Empty, Table } from "antd";

import type { ReactNode } from "react";

import type {
  SandboxSecurityFinding,
  SandboxSecurityFindingSubjectRef
} from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";

export interface FindingsTableProps {
  findings: SandboxSecurityFinding[];
}

/**
 * Renders a finding's content-free position references. A locator is a position
 * (source token, call token, component, byte range, or JSON pointer) and is
 * privacy-safe to render; the content at that position is never available to
 * this component and is never shown. Each position piece (token, component,
 * pointer, byte offsets) is a separate element so it stays independently
 * legible rather than fused into one opaque string.
 */
function describeSubjectRef(ref: SandboxSecurityFindingSubjectRef): ReactNode {
  if (ref.kind === "content_source") {
    const locator = ref.locator;
    if (locator.kind === "text_byte_range") {
      return (
        <>
          <span>{ref.source_token}</span> <span>{String(locator.start_byte)}</span>–
          <span>{String(locator.end_byte)}</span>
        </>
      );
    }
    if (locator.kind === "json_pointer") {
      return (
        <>
          <span>{ref.source_token}</span> <span>{locator.pointer}</span>
        </>
      );
    }
    return (
      <>
        <span>{ref.source_token}</span> <span>whole_source</span>
      </>
    );
  }
  if (ref.component === "arguments") {
    const pointer =
      ref.locator.kind === "json_pointer" ? ref.locator.pointer : "whole_arguments";
    return (
      <>
        <span>{ref.call_token}</span> <span>arguments</span> <span>{pointer}</span>
      </>
    );
  }
  return (
    <>
      <span>{ref.call_token}</span> <span>{ref.component}</span>
    </>
  );
}

export function FindingsTable({ findings }: FindingsTableProps) {
  if (findings.length === 0) {
    return <Empty description="未产生风险发现" />;
  }
  return (
    <Table
      rowKey="finding_id"
      dataSource={findings}
      pagination={false}
      columns={[
        {
          title: "类别",
          dataIndex: "category",
          render: (category: string) => (
            <SandboxSecurityValueTag domain="category" value={category} />
          )
        },
        {
          title: "严重级别",
          dataIndex: "severity",
          render: (severity: string) => (
            <SandboxSecurityValueTag domain="severity" value={severity} />
          )
        },
        {
          title: "置信度",
          dataIndex: "confidence",
          render: (confidence: number) => <span>{String(confidence)}</span>
        },
        {
          title: "原因码",
          dataIndex: "reason_code",
          render: (reasonCode: string) => (
            <span style={{ fontFamily: "var(--console-mono)" }}>{reasonCode}</span>
          )
        },
        {
          title: "位置引用",
          dataIndex: "subject_refs",
          render: (_value: unknown, finding: SandboxSecurityFinding) => (
            <ul style={{ margin: 0, paddingInlineStart: "1.1em" }}>
              {finding.subject_refs.map((ref, index) => (
                <li
                  key={`${finding.finding_id}-${index}`}
                  style={{ fontFamily: "var(--console-mono)" }}
                >
                  {describeSubjectRef(ref)}
                </li>
              ))}
            </ul>
          )
        }
      ]}
    />
  );
}
