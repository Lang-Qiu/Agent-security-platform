import { CopyOutlined } from "@ant-design/icons";
import { Button, Descriptions, DescriptionsProps, Tag, Typography } from "antd";

import type {
  SandboxSupervisionAlertView,
  SandboxSupervisionBlockedRecordView,
  SandboxSupervisionDecisionView,
  SandboxSupervisionEventView
} from "../../../shared/types/supervision";
import { RiskTag } from "../RiskTag";

const { Text, Paragraph } = Typography;

const EVENT_TYPE_LABELS: Record<SandboxSupervisionEventView["event_type"], string> = {
  model_input: "Model input",
  model_output: "Model output",
  tool_request: "Tool request",
  tool_result: "Tool result",
  policy_decision: "Policy decision",
  memory_write: "Memory write",
  memory_read: "Memory read"
};

function formatToken(value: string): string {
  return value.replace(/_/g, " ");
}

function RefField({
  label,
  value,
  copyLabel
}: {
  label: string;
  value: string;
  copyLabel: string;
}): JSX.Element {
  return (
    <div className="supervision-ref-field">
      <Text type="secondary">{label}:</Text>{" "}
      <Text code className="supervision-ref-value">
        {value}
      </Text>
      <Button
        size="small"
        type="text"
        icon={<CopyOutlined />}
        aria-label={copyLabel}
        onClick={() => {
          if (navigator.clipboard) {
            void navigator.clipboard.writeText(value);
          }
        }}
      />
    </div>
  );
}

function ModelEventDetails({
  event
}: {
  event: Extract<SandboxSupervisionEventView, { event_type: "model_input" | "model_output" }>;
}): JSX.Element {
  const { payload } = event;
  return (
    <div className="supervision-event-model">
      <RefField
        label="Model ref"
        value={payload.model_ref}
        copyLabel="Copy model ref"
      />
      <RefField
        label="Content ref"
        value={payload.content_ref}
        copyLabel="Copy content ref"
      />
      <RefField
        label="Content SHA-256"
        value={payload.content_sha256}
        copyLabel="Copy content SHA-256"
      />
    </div>
  );
}

function ToolRequestDetails({
  event
}: {
  event: Extract<SandboxSupervisionEventView, { event_type: "tool_request" }>;
}): JSX.Element {
  const { payload } = event;
  return (
    <div className="supervision-event-tool-request">
      <RefField label="Call ID" value={payload.call_id} copyLabel="Copy call ID" />
      <RefField label="Tool name" value={payload.tool_name} copyLabel="Copy tool name" />
      <RefField label="Target ref" value={payload.target_ref} copyLabel="Copy target ref" />
      <RefField
        label="Arguments ref"
        value={payload.arguments_ref}
        copyLabel="Copy arguments ref"
      />
    </div>
  );
}

function ToolResultDetails({
  event
}: {
  event: Extract<SandboxSupervisionEventView, { event_type: "tool_result" }>;
}): JSX.Element {
  const { payload } = event;
  return (
    <div className="supervision-event-tool-result">
      <RefField label="Call ID" value={payload.call_id} copyLabel="Copy call ID" />
      <RefField label="Tool name" value={payload.tool_name} copyLabel="Copy tool name" />
      <div>
        <Text type="secondary">Status:</Text> <Tag>{payload.status}</Tag>
      </div>
      <RefField label="Result ref" value={payload.result_ref} copyLabel="Copy result ref" />
      <div>
        <Text type="secondary">State change:</Text> {formatToken(payload.state_change)}
      </div>
    </div>
  );
}

function PolicyDecisionDetails({
  event
}: {
  event: Extract<SandboxSupervisionEventView, { event_type: "policy_decision" }>;
}): JSX.Element {
  const { payload } = event;
  return (
    <div className="supervision-event-policy-decision">
      <RefField
        label="Decision ID"
        value={payload.decision_id}
        copyLabel="Copy decision ID"
      />
      <RefField
        label="Subject event ID"
        value={payload.subject_event_id}
        copyLabel="Copy subject event ID"
      />
      <RefField label="Policy ID" value={payload.policy_id} copyLabel="Copy policy ID" />
      <div>
        <Text type="secondary">Action:</Text>{" "}
        <Tag color={payload.action === "deny" ? "red" : payload.action === "ask" ? "gold" : payload.action === "alert" ? "orange" : "green"}>
          {payload.action}
        </Tag>
      </div>
      <div>
        <Text type="secondary">Reason:</Text> {formatToken(payload.reason_code)}
      </div>
      {payload.evidence_refs.map((ref, i) => (
        <RefField
          key={i}
          label={`Evidence ref ${i + 1}`}
          value={ref}
          copyLabel={`Copy evidence ref ${i + 1}`}
        />
      ))}
      <div>
        <Text type="secondary">Decided at:</Text> {payload.decided_at}
      </div>
    </div>
  );
}

function MemoryEventDetails({
  event
}: {
  event: Extract<SandboxSupervisionEventView, { event_type: "memory_write" | "memory_read" }>;
}): JSX.Element {
  const { payload } = event;
  return (
    <div className="supervision-event-memory">
      <RefField
        label="Memory entry ID"
        value={payload.memory_entry_id}
        copyLabel="Copy memory entry ID"
      />
      <RefField
        label="Content ref"
        value={payload.content_ref}
        copyLabel="Copy content ref"
      />
      <RefField
        label="Content SHA-256"
        value={payload.content_sha256}
        copyLabel="Copy content SHA-256"
      />
    </div>
  );
}

function CorrelatedOutcomes({
  event,
  decisions,
  alerts,
  blockedRecords
}: {
  event: SandboxSupervisionEventView;
  decisions: SandboxSupervisionDecisionView[];
  alerts: SandboxSupervisionAlertView[];
  blockedRecords: SandboxSupervisionBlockedRecordView[];
}): JSX.Element | null {
  const relatedDecisions = decisions.filter(
    (d) => d.subject_event_id === event.event_id
  );
  const relatedAlerts = alerts.filter(
    (a) => a.subject_event_id === event.event_id
  );
  const relatedBlocked = blockedRecords.filter(
    (b) => b.subject_event_id === event.event_id
  );

  if (
    relatedDecisions.length === 0 &&
    relatedAlerts.length === 0 &&
    relatedBlocked.length === 0
  ) {
    return null;
  }

  const items: DescriptionsProps["items"] = [];

  for (const decision of relatedDecisions) {
    items.push({
      key: `decision-${decision.decision_id}`,
      label: "Policy decision",
      children: (
        <span>
          <Tag
            color={
              decision.action === "deny"
                ? "red"
                : decision.action === "ask"
                  ? "gold"
                  : decision.action === "alert"
                    ? "orange"
                    : "green"
            }
          >
            {decision.action}
          </Tag>{" "}
          {formatToken(decision.reason_code)}
        </span>
      )
    });
  }

  for (const alert of relatedAlerts) {
    items.push({
      key: `alert-${alert.alert_id}`,
      label: "Alert",
      children: (
        <span>
          <RiskTag level={alert.risk_level} /> {formatToken(alert.category)}
        </span>
      )
    });
  }

  for (const blocked of relatedBlocked) {
    items.push({
      key: `blocked-${blocked.blocked_record_id}`,
      label: "Blocked record",
      children: <Tag color="volcano">blocked</Tag>
    });
  }

  return (
    <div className="supervision-event-outcomes">
      <Paragraph type="secondary">Correlated outcomes</Paragraph>
      <Descriptions column={1} size="small" items={items} />
    </div>
  );
}

export interface SupervisionEventDetailsProps {
  event: SandboxSupervisionEventView;
  decisions: SandboxSupervisionDecisionView[];
  alerts: SandboxSupervisionAlertView[];
  blockedRecords: SandboxSupervisionBlockedRecordView[];
}

export function SupervisionEventDetails({
  event,
  decisions,
  alerts,
  blockedRecords
}: SupervisionEventDetailsProps): JSX.Element {
  const label = EVENT_TYPE_LABELS[event.event_type];

  return (
    <div className="supervision-event-details">
      <Paragraph>
        <Text strong>{label}</Text>
      </Paragraph>
      <EventPayloadDetails event={event} />
      <CorrelatedOutcomes
        event={event}
        decisions={decisions}
        alerts={alerts}
        blockedRecords={blockedRecords}
      />
    </div>
  );
}

function EventPayloadDetails({
  event
}: {
  event: SandboxSupervisionEventView;
}): JSX.Element {
  switch (event.event_type) {
    case "model_input":
    case "model_output":
      return <ModelEventDetails event={event} />;
    case "tool_request":
      return <ToolRequestDetails event={event} />;
    case "tool_result":
      return <ToolResultDetails event={event} />;
    case "policy_decision":
      return <PolicyDecisionDetails event={event} />;
    case "memory_write":
    case "memory_read":
      return <MemoryEventDetails event={event} />;
  }
}
