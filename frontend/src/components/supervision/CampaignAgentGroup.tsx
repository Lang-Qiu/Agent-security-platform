// P5-T3: Fixed campaign agent group.
//
// Renders one of the three fixed Track1 campaign agents as an unframed band:
//   - group <section role="group" aria-label="agent:<agent_id>">
//   - one <li role="listitem" aria-label="<case_id>"> per case (3 in fixed
//     contract order)
//   - inside each case, one or two attempt <button> rows that surface the
//     attempt index, status, final marker, expected/actual action, and the
//     session selection affordance.
//
// Keyboard: roving tabindex within the group. The selected attempt (or the
// first attempt if none selected) has tabindex=0; others have tabindex=-1.
// ArrowUp/Down moves focus, Home/End jumps to first/last, Enter/Space
// selects. The list of attempt buttons is flattened across cases (so ArrowDown
// from C001 attempt 1 lands on C002 attempt 1).

import { useCallback, type KeyboardEvent } from "react";
import { Tag, Typography } from "antd";

import type {
  Track1CampaignAgentDetail,
  Track1CampaignAttemptStatus,
  Track1CampaignCaseDetail,
  Track1CampaignCaseStatus
} from "../../../../shared/types/campaign-supervision";
import type { SandboxPolicyAction } from "../../../../shared/types/sandbox";

const { Text } = Typography;

const CASE_STATUS_LABEL: Record<Track1CampaignCaseStatus, string> = {
  pending: "Pending",
  running: "Running",
  passed: "Passed",
  failed: "Failed"
};

const CASE_STATUS_COLOR: Record<Track1CampaignCaseStatus, string> = {
  pending: "default",
  running: "processing",
  passed: "success",
  failed: "error"
};

const ATTEMPT_STATUS_LABEL: Record<Track1CampaignAttemptStatus, string> = {
  running: "Running",
  passed: "Passed",
  failed: "Failed"
};

const ATTEMPT_STATUS_COLOR: Record<Track1CampaignAttemptStatus, string> = {
  running: "processing",
  passed: "success",
  failed: "error"
};

const ACTION_COLOR: Record<SandboxPolicyAction, string> = {
  allow: "green",
  deny: "red",
  ask: "gold",
  alert: "orange"
};

interface FlattenedAttempt {
  caseId: string;
  caseStatus: Track1CampaignCaseStatus;
  expectedAction: SandboxPolicyAction;
  attemptIndex: 1 | 2;
  attemptStatus: Track1CampaignAttemptStatus;
  actualAction: SandboxPolicyAction | null;
  sessionId: string;
  isFinal: boolean;
}

function flattenAttempts(
  agent: Track1CampaignAgentDetail
): FlattenedAttempt[] {
  const out: FlattenedAttempt[] = [];
  for (const c of agent.cases) {
    const attempts = c.attempts;
    const lastIndex = attempts.length - 1;
    attempts.forEach((a, i) => {
      out.push({
        caseId: c.case_id,
        caseStatus: c.status,
        expectedAction: c.expected_action,
        attemptIndex: a.attempt_index,
        attemptStatus: a.status,
        actualAction: a.actual_action,
        sessionId: a.session_id,
        isFinal: i === lastIndex
      });
    });
  }
  return out;
}

export interface CampaignAgentGroupProps {
  agent: Track1CampaignAgentDetail;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function CampaignAgentGroup({
  agent,
  selectedSessionId,
  onSelectSession
}: CampaignAgentGroupProps) {
  const flattened = flattenAttempts(agent);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLUListElement>) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute("role") !== "button") return;

      const buttons = Array.from(
        e.currentTarget.querySelectorAll<HTMLButtonElement>(
          'button[role="button"][data-session-id]'
        )
      );
      const currentIndex = buttons.indexOf(target as HTMLButtonElement);
      if (currentIndex === -1) return;

      let nextIndex: number | null = null;
      switch (e.key) {
        case "ArrowDown":
          nextIndex = Math.min(currentIndex + 1, buttons.length - 1);
          break;
        case "ArrowUp":
          nextIndex = Math.max(currentIndex - 1, 0);
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = buttons.length - 1;
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onSelectSession(buttons[currentIndex].dataset.sessionId ?? "");
          return;
        default:
          return;
      }

      if (nextIndex !== null && nextIndex !== currentIndex) {
        e.preventDefault();
        buttons[nextIndex].focus();
      }
    },
    [onSelectSession]
  );

  return (
    <section
      role="group"
      aria-label={agent.agent_id}
      className="campaign-agent-group"
      data-agent-id={agent.agent_id}
    >
      <ul
        className="campaign-agent-group__cases"
        onKeyDown={handleKeyDown}
      >
        {agent.cases.map((c) => (
          <CaseRow
            key={c.case_id}
            caseDetail={c}
            selectedSessionId={selectedSessionId}
            onSelectSession={onSelectSession}
            flattened={flattened}
          />
        ))}
      </ul>
    </section>
  );
}

interface CaseRowProps {
  caseDetail: Track1CampaignCaseDetail;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  flattened: FlattenedAttempt[];
}

function CaseRow({
  caseDetail,
  selectedSessionId,
  onSelectSession,
  flattened
}: CaseRowProps) {
  const { case_id, status, expected_action, attempts } = caseDetail;

  return (
    <li
      role="listitem"
      aria-label={case_id}
      className="campaign-case-row"
    >
      <div className="campaign-case-row__header">
        <Tag color={CASE_STATUS_COLOR[status]}>
          {CASE_STATUS_LABEL[status]}
        </Tag>
        <Text code className="campaign-case-row__case-id">
          {case_id}
        </Text>
        <Text type="secondary" className="campaign-case-row__expected">
          expected: <Tag color={ACTION_COLOR[expected_action]}>{expected_action}</Tag>
        </Text>
      </div>
      <ul className="campaign-case-row__attempts">
        {attempts.map((a) => {
          const flattenedEntry = flattened.find(
            (f) => f.caseId === case_id && f.attemptIndex === a.attempt_index
          );
          const isFinal = flattenedEntry?.isFinal ?? false;
          const isSelected = a.session_id === selectedSessionId;
          // Roving tabindex: selected (or first attempt of first case if no
          // selection) gets tabindex=0, others get tabindex=-1.
          const isFirstOverall = flattened[0]?.sessionId === a.session_id;
          const tabIndex =
            isSelected || (!selectedSessionId && isFirstOverall) ? 0 : -1;

          return (
            <li key={a.attempt_id} className="campaign-attempt-row">
              <button
                type="button"
                role="button"
                aria-selected={isSelected}
                tabIndex={tabIndex}
                data-session-id={a.session_id}
                aria-label={`Inspect ${case_id} attempt ${a.attempt_index}`}
                className="campaign-attempt-row__button"
                onClick={() => onSelectSession(a.session_id)}
              >
                <span className="campaign-attempt-row__index">
                  #{a.attempt_index}
                </span>
                <Tag color={ATTEMPT_STATUS_COLOR[a.status]}>
                  {ATTEMPT_STATUS_LABEL[a.status]}
                </Tag>
                {a.actual_action ? (
                  <Tag color={ACTION_COLOR[a.actual_action]}>
                    {a.actual_action}
                  </Tag>
                ) : (
                  <Tag>pending</Tag>
                )}
                {isFinal ? (
                  <span
                    data-testid="attempt-final-marker"
                    className="campaign-attempt-row__final"
                    aria-label="final attempt"
                  >
                    final
                  </span>
                ) : null}
                <Text
                  type="secondary"
                  code
                  className="campaign-attempt-row__session-id"
                >
                  {a.session_id}
                </Text>
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
