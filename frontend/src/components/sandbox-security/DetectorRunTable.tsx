import { Empty, Table } from "antd";

import type { SandboxDetectorRun } from "../../../../shared/types/sandbox-security";

export interface DetectorRunTableProps {
  runs: SandboxDetectorRun[];
}

/**
 * Renders a detector run's variant-specific field by narrowing on `status`:
 * matched/no_match expose `finding_ids`, failed/timeout/invalid_result expose
 * `error_code`, and skipped exposes `skip_reason`. Detector kind, obligation,
 * and elapsed milliseconds render for every run.
 */
function describeVariantField(run: SandboxDetectorRun): string {
  switch (run.status) {
    case "matched":
    case "no_match":
      return run.finding_ids.join(", ");
    case "failed":
    case "timeout":
    case "invalid_result":
      return run.error_code;
    case "skipped":
      return run.skip_reason;
    default: {
      const _exhaustive: never = run;
      return _exhaustive;
    }
  }
}

export function DetectorRunTable({ runs }: DetectorRunTableProps) {
  if (runs.length === 0) {
    return <Empty description="未执行检测器" />;
  }
  return (
    <Table
      rowKey={(run) => `${run.detector_id}@${run.detector_version}`}
      dataSource={runs}
      pagination={false}
      columns={[
        {
          title: "检测器",
          dataIndex: "detector_id",
          render: (detectorId: string) => (
            <span style={{ fontFamily: "var(--console-mono)" }}>{detectorId}</span>
          )
        },
        {
          title: "类型",
          dataIndex: "detector_kind",
          render: (kind: string) => <span>{kind}</span>
        },
        {
          title: "义务",
          dataIndex: "obligation",
          render: (obligation: string) => <span>{obligation}</span>
        },
        {
          title: "状态",
          dataIndex: "status",
          render: (status: string) => <span>{status}</span>
        },
        {
          title: "耗时(ms)",
          dataIndex: "elapsed_ms",
          render: (elapsedMs: number) => <span>{String(elapsedMs)}</span>
        },
        {
          title: "详情",
          key: "variant",
          render: (_value: unknown, run: SandboxDetectorRun) => (
            <span style={{ fontFamily: "var(--console-mono)" }}>
              {describeVariantField(run)}
            </span>
          )
        }
      ]}
    />
  );
}
