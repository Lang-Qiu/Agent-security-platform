import { useEffect, useState } from "react";
import { Tag, Typography } from "antd";

import type { SandboxSupervisionSessionDetail } from "../../../shared/types/supervision";
import { SupervisionEventDetails } from "./SupervisionEventDetails";

const { Text } = Typography;

const EVENT_TYPE_TAG_COLOR: Record<string, string> = {
  model_input: "blue",
  model_output: "blue",
  tool_request: "cyan",
  tool_result: "cyan",
  policy_decision: "purple",
  memory_write: "geekblue",
  memory_read: "geekblue"
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(value));
}

export interface SupervisionEventTimelineProps {
  detail: SandboxSupervisionSessionDetail;
}

export function SupervisionEventTimeline({
  detail
}: SupervisionEventTimelineProps): JSX.Element {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const sortedEvents = [...detail.events].sort((a, b) => a.sequence - b.sequence);

  // Close expanded event safely when it disappears after refresh.
  useEffect(() => {
    if (expandedEventId === null) return;
    const stillPresent = detail.events.some(
      (e) => e.event_id === expandedEventId
    );
    if (!stillPresent) {
      setExpandedEventId(null);
    }
  }, [detail.events, expandedEventId]);

  const handleToggle = (eventId: string): void => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  };

  return (
    <div className="supervision-event-timeline">
      <ul className="supervision-timeline-list">
        {sortedEvents.map((event) => {
          const isExpanded = event.event_id === expandedEventId;
          return (
            <li
              key={event.event_id}
              className={
                "supervision-timeline-row" +
                (isExpanded ? " supervision-timeline-row--expanded" : "")
              }
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`event-panel-${event.event_id}`}
                onClick={() => handleToggle(event.event_id)}
                className="supervision-timeline-row__header"
              >
                <Text strong>Event {event.sequence}</Text>
                <Tag color={EVENT_TYPE_TAG_COLOR[event.event_type] ?? "default"}>
                  {event.event_type}
                </Tag>
                <Text type="secondary">{event.source}</Text>
                <Text type="secondary">{formatTimestamp(event.occurred_at)}</Text>
              </button>
              {isExpanded ? (
                <div
                  id={`event-panel-${event.event_id}`}
                  className="supervision-timeline-row__panel"
                >
                  <SupervisionEventDetails
                    event={event}
                    decisions={detail.policy_decisions}
                    alerts={detail.alerts}
                    blockedRecords={detail.blocked_records}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
