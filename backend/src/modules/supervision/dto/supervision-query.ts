import { DomainError } from "../../../common/errors/domain-error.ts";
import type { SandboxPolicyAction } from "../../../../../shared/types/sandbox.ts";
import type {
  RiskLevel,
  TaskStatus
} from "../../../../../shared/types/task.ts";
import type { SandboxSupervisionToolName } from "../../../../../shared/types/supervision.ts";

export interface SupervisionQuery {
  q?: string;
  status?: TaskStatus;
  risk_level?: RiskLevel;
  action?: SandboxPolicyAction;
  scenario_id?: string;
  tool_name?: SandboxSupervisionToolName;
}

const ALLOWED_PARAMS = new Set<string>([
  "q",
  "status",
  "risk_level",
  "action",
  "scenario_id",
  "tool_name"
]);

const VALID_STATUSES = new Set<string>([
  "pending",
  "running",
  "finished",
  "failed",
  "blocked",
  "partial_success"
]);

const VALID_RISK_LEVELS = new Set<string>([
  "info",
  "low",
  "medium",
  "high",
  "critical"
]);

const VALID_ACTIONS = new Set<string>(["allow", "deny", "ask", "alert"]);

const VALID_TOOL_NAMES = new Set<string>([
  "send_email",
  "read_file",
  "write_file",
  "call_api"
]);

const SCENARIO_ID_PATTERN = /^T1-SC-\d{3}$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const MAX_Q_LENGTH = 128;

function invalidQuery(message: string): DomainError {
  return new DomainError(message, "INVALID_SUPERVISION_QUERY", 400);
}

export function normalizeSupervisionQuery(
  searchParams: URLSearchParams
): SupervisionQuery {
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

  const query: SupervisionQuery = {};

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
    if (!VALID_STATUSES.has(status)) {
      throw invalidQuery(`Invalid status: ${status}`);
    }
    query.status = status as TaskStatus;
  }

  const riskLevel = searchParams.get("risk_level");
  if (riskLevel !== null) {
    if (!VALID_RISK_LEVELS.has(riskLevel)) {
      throw invalidQuery(`Invalid risk_level: ${riskLevel}`);
    }
    query.risk_level = riskLevel as RiskLevel;
  }

  const action = searchParams.get("action");
  if (action !== null) {
    if (!VALID_ACTIONS.has(action)) {
      throw invalidQuery(`Invalid action: ${action}`);
    }
    query.action = action as SandboxPolicyAction;
  }

  const scenarioId = searchParams.get("scenario_id");
  if (scenarioId !== null) {
    if (!SCENARIO_ID_PATTERN.test(scenarioId)) {
      throw invalidQuery(`Invalid scenario_id: ${scenarioId}`);
    }
    query.scenario_id = scenarioId;
  }

  const toolName = searchParams.get("tool_name");
  if (toolName !== null) {
    if (!VALID_TOOL_NAMES.has(toolName)) {
      throw invalidQuery(`Invalid tool_name: ${toolName}`);
    }
    query.tool_name = toolName as SandboxSupervisionToolName;
  }

  return query;
}
