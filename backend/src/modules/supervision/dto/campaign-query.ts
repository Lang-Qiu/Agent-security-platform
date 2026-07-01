import { DomainError } from "../../../common/errors/domain-error.ts";
import type {
  Track1CampaignAgentId,
  Track1CampaignStatus,
  Track1ScenarioId
} from "../../../../../shared/types/campaign-supervision.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CAMPAIGN_STATUSES,
  TRACK1_SCENARIO_IDS
} from "../../../../../shared/types/campaign-supervision.ts";

// P2-T6: Campaign query DTO. Only q, status, scenario_id, and agent_id are
// accepted. Duplicate keys, unknown keys, empty-but-present enum values, and
// control characters are rejected.
export interface CampaignQuery {
  q?: string;
  status?: Track1CampaignStatus;
  scenario_id?: Track1ScenarioId;
  agent_id?: Track1CampaignAgentId;
}

const ALLOWED_PARAMS = new Set<string>([
  "q",
  "status",
  "scenario_id",
  "agent_id"
]);

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const MAX_Q_LENGTH = 128;

function invalidQuery(message: string): DomainError {
  return new DomainError(message, "INVALID_CAMPAIGN_QUERY", 400);
}

export function normalizeCampaignQuery(
  searchParams: URLSearchParams
): CampaignQuery {
  const seen = new Set<string>();

  for (const key of searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key)) {
      throw invalidQuery(`Unknown query parameter: ${key}`);
    }
    if (seen.has(key)) {
      throw invalidQuery(`Duplicate query parameter: ${key}`);
    }
    seen.add(key);
  }

  const query: CampaignQuery = {};

  const qRaw = searchParams.get("q");
  if (qRaw !== null) {
    const q = qRaw.trim();
    if (q.length === 0) {
      throw invalidQuery("q parameter must not be empty");
    }
    if (q.length > MAX_Q_LENGTH) {
      throw invalidQuery("q parameter exceeds 128 characters");
    }
    if (CONTROL_CHAR_PATTERN.test(q)) {
      throw invalidQuery("q parameter must not contain control characters");
    }
    query.q = q;
  }

  const status = searchParams.get("status");
  if (status !== null) {
    if (!(TRACK1_CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
      throw invalidQuery(`Invalid status: ${status}`);
    }
    query.status = status as Track1CampaignStatus;
  }

  const scenarioId = searchParams.get("scenario_id");
  if (scenarioId !== null) {
    if (!(TRACK1_SCENARIO_IDS as readonly string[]).includes(scenarioId)) {
      throw invalidQuery(`Invalid scenario_id: ${scenarioId}`);
    }
    query.scenario_id = scenarioId as Track1ScenarioId;
  }

  const agentId = searchParams.get("agent_id");
  if (agentId !== null) {
    if (!(TRACK1_CAMPAIGN_AGENT_IDS as readonly string[]).includes(agentId)) {
      throw invalidQuery(`Invalid agent_id: ${agentId}`);
    }
    query.agent_id = agentId as Track1CampaignAgentId;
  }

  return query;
}
