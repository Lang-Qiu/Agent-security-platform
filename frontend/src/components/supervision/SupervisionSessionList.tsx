import type { KeyboardEvent, ReactNode } from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  SyncOutlined
} from "@ant-design/icons";
import { Tag, Typography } from "antd";

import type { TaskStatus } from "../../../../shared/types/task";
import type { SandboxSupervisionSessionSummary } from "../../../../shared/types/supervision";
import { RiskTag } from "../RiskTag";

const { Text } = Typography;

const STATUS_ICON_CONFIG: Record<TaskStatus, { icon: ReactNode; color: string }> = {
  pending: { icon: <ClockCircleOutlined />, color: "var(--console-severity-medium)" },
  running: { icon: <SyncOutlined />, color: "var(--console-severity-low)" },
  finished: { icon: <CheckCircleOutlined />, color: "var(--console-action-allow)" },
  failed: { icon: <CloseCircleOutlined />, color: "var(--console-severity-critical)" },
  blocked: { icon: <StopOutlined />, color: "var(--console-severity-high)" },
  partial_success: { icon: <ExclamationCircleOutlined />, color: "var(--console-severity-medium)" }
};

function CompactStatusIndicator({ status }: { status: TaskStatus }) {
  const config = STATUS_ICON_CONFIG[status];
  return (
    <span
      role="img"
      aria-label={`status: ${status}`}
      style={{ color: config.color, fontSize: "1rem" }}
    >
      {config.icon}
    </span>
  );
}

const ACTION_TAG_COLOR: Record<string, string> = {
  allow: "green",
  deny: "red",
  ask: "gold",
  alert: "orange"
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(value));
}

export interface SupervisionSessionListProps {
  sessions: SandboxSupervisionSessionSummary[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}

export function SupervisionSessionList({
  sessions,
  selectedSessionId,
  onSelect
}: SupervisionSessionListProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute("role") !== "option") return;

    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')
    );
    const currentIndex = items.indexOf(target as HTMLElement);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    switch (e.key) {
      case "ArrowDown":
        nextIndex = Math.min(currentIndex + 1, items.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelect(sessions[currentIndex].session_id);
        return;
      default:
        return;
    }

    if (nextIndex !== null && nextIndex !== currentIndex) {
      e.preventDefault();
      items[nextIndex].focus();
    }
  };

  return (
    <ul
      role="listbox"
      aria-label="Supervision sessions"
      className="supervision-session-list"
      onKeyDown={handleKeyDown}
    >
      {sessions.map((session, index) => {
        const isSelected = session.session_id === selectedSessionId;
        const isFirst = index === 0;
        // Roving tabindex: selected option (or first if none selected) is in tab order
        const tabIndex = isSelected || (!selectedSessionId && isFirst) ? 0 : -1;
        return (
          <li
            key={session.session_id}
            role="option"
            aria-selected={isSelected}
            tabIndex={tabIndex}
            className={
              "supervision-session-row" +
              (isSelected ? " supervision-session-row--selected" : "")
            }
            onClick={() => onSelect(session.session_id)}
          >
            <span className="supervision-session-row__status">
              <CompactStatusIndicator status={session.task_status} />
            </span>
            <Text code className="supervision-session-row__session-id">
              {session.session_id}
            </Text>
            <Text type="secondary" className="supervision-session-row__task-id">
              {session.task_id}
            </Text>
            <span className="supervision-session-row__scenario">
              {session.scenario_id ?? "—"}
              {session.case_id ? ` / ${session.case_id}` : ""}
            </span>
            <span className="supervision-session-row__risk">
              <RiskTag level={session.risk_level} />
            </span>
            <Tag color={ACTION_TAG_COLOR[session.highest_action] ?? "default"}>
              {session.highest_action}
            </Tag>
            <span className="supervision-session-row__tools">
              {session.tool_names.join(", ")}
            </span>
            <span className="supervision-session-row__counts">
              {session.event_count} events / {session.alert_count} alerts /{" "}
              {session.blocked_record_count} blocked
            </span>
            <span className="supervision-session-row__updated">
              {formatTimestamp(session.updated_at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
