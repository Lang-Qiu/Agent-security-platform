// Step 4 (scenario-investigation) panel: renders the three canonical
// scenarios from the content catalog, the three live用例 (cases) belonging to
// each scenario's agent (from the already-polled campaign detail — no
// separate fetch), and a deep link into the existing /results/sandbox
// campaign workbench for attempt-level inspection.

import { Card, Empty, Tag, Tooltip, Typography } from "antd";
import { Link } from "react-router-dom";

import type {
  Track1CampaignAgentDetail,
  Track1CampaignCaseDetail
} from "../../../../shared/types/campaign-supervision";
import type { SandboxPolicyAction } from "../../../../shared/types/sandbox";
import type { ReviewScenario } from "../../content/review-demo-content";

const { Paragraph, Text } = Typography;

const CASE_STATUS_LABEL: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  passed: "通过",
  failed: "未通过"
};

const CASE_STATUS_COLOR: Record<string, string> = {
  pending: "default",
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

export interface ScenarioInvestigationPanelProps {
  scenarios: ReviewScenario[];
  campaignId: string | null;
  campaignAgents: Track1CampaignAgentDetail[] | null;
}

function investigationHref(campaignId: string, scenario: ReviewScenario): string {
  const params = new URLSearchParams();
  params.set("campaign_id", campaignId);
  params.set("agent_id", scenario.agent_id);
  return `/results/sandbox?${params.toString()}`;
}

function findAgentCases(
  agents: Track1CampaignAgentDetail[] | null,
  agentId: string
): Track1CampaignCaseDetail[] | null {
  const agent = agents?.find((a) => a.agent_id === agentId);
  return agent?.cases ?? null;
}

export function ScenarioInvestigationPanel({
  scenarios,
  campaignId,
  campaignAgents
}: ScenarioInvestigationPanelProps) {
  return (
    <section
      className="review-demo-scenario-investigation"
      aria-label="三类风险场景调查"
    >
      {scenarios.map((scenario) => {
        const cases = findAgentCases(campaignAgents, scenario.agent_id);
        return (
          <Card
            key={scenario.scenario_id}
            size="small"
            title={scenario.display_name}
            className="review-demo-scenario-card"
          >
            <Paragraph strong>{scenario.evaluator_question}</Paragraph>
            <Paragraph>
              <Text type="secondary">受控攻击目标：</Text>
              {scenario.controlled_attack_objective}
            </Paragraph>
            <Paragraph>
              <Text type="secondary">控制机制：</Text>
              {scenario.control_mechanism}
            </Paragraph>
            <Paragraph>
              <Text type="secondary">残余风险：</Text>
              {scenario.residual_risk}
            </Paragraph>
            <div className="review-demo-scenario-card__evidence">
              {scenario.evidence_surfaces.map((surface) => (
                <Tag key={surface}>{surface}</Tag>
              ))}
            </div>

            <ScenarioCaseList cases={cases} />

            {campaignId ? (
              <Link to={investigationHref(campaignId, scenario)}>
                前往调查该场景
              </Link>
            ) : (
              <Tooltip title="需要先在“三 Agent 九用例战役监督”步骤中确定 campaign">
                <Text disabled>前往调查该场景</Text>
              </Tooltip>
            )}
          </Card>
        );
      })}
    </section>
  );
}

function ScenarioCaseList({
  cases
}: {
  cases: Track1CampaignCaseDetail[] | null;
}) {
  if (!cases) {
    return (
      <Empty
        className="review-demo-scenario-card__cases-empty"
        description="暂无用例数据"
      />
    );
  }

  return (
    <ul
      className="review-demo-scenario-card__cases"
      aria-label="用例列表"
    >
      {cases.map((c) => {
        const lastAttempt = c.attempts[c.attempts.length - 1] ?? null;
        return (
          <li key={c.case_id} className="review-demo-scenario-case-row">
            <Text code className="review-demo-scenario-case-row__id">
              {c.case_id}
            </Text>
            <Tag color={CASE_STATUS_COLOR[c.status] ?? "default"}>
              {CASE_STATUS_LABEL[c.status] ?? c.status}
            </Tag>
            <Text type="secondary">
              预期：<Tag color={ACTION_COLOR[c.expected_action]}>{c.expected_action}</Tag>
            </Text>
            {lastAttempt?.actual_action ? (
              <Text type="secondary">
                实际：
                <Tag color={ACTION_COLOR[lastAttempt.actual_action]}>
                  {lastAttempt.actual_action}
                </Tag>
              </Text>
            ) : (
              <Text type="secondary">
                实际：<Tag>待执行</Tag>
              </Text>
            )}
          </li>
        );
      })}
    </ul>
  );
}
