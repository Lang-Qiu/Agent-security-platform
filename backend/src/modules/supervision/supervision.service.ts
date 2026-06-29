import { DomainError } from "../../common/errors/domain-error.ts";
import type {
  StoredTaskRecord,
  TaskRepository
} from "../task-center/repositories/task.repository.ts";
import {
  SANDBOX_SUPERVISION_SCHEMA_VERSION,
  normalizeSandboxSupervisionEvidenceExport,
  normalizeSandboxSupervisionOverview,
  normalizeSandboxSupervisionSessionDetail
} from "../../../../shared/contracts/supervision.ts";
import type {
  SandboxSupervisionCounts,
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail,
  SandboxSupervisionSessionSummary
} from "../../../../shared/types/supervision.ts";
import {
  projectSupervisionRecord,
  type ProjectedSupervisionRecord
} from "./supervision-projector.ts";
import type { SupervisionQuery } from "./dto/supervision-query.ts";

const ROW_LIMIT = 100;

interface SessionBucket {
  projections: ProjectedSupervisionRecord[];
  ambiguous: boolean;
}

function internalError(message: string): DomainError {
  return new DomainError(message, "INTERNAL_ERROR", 500);
}

function notFound(sessionId: string): DomainError {
  return new DomainError(
    `Session not found: ${sessionId}`,
    "SUPERVISION_SESSION_NOT_FOUND",
    404
  );
}

function ambiguous(sessionId: string): DomainError {
  return new DomainError(
    `Session is ambiguous: ${sessionId}`,
    "SUPERVISION_SESSION_AMBIGUOUS",
    409
  );
}

function evidenceNotAvailable(sessionId: string): DomainError {
  return new DomainError(
    `Evidence not available for session: ${sessionId}`,
    "SUPERVISION_EVIDENCE_NOT_AVAILABLE",
    409
  );
}

function sortSessions(
  sessions: SandboxSupervisionSessionSummary[]
): SandboxSupervisionSessionSummary[] {
  return [...sessions].sort((a, b) => {
    if (a.updated_at !== b.updated_at) {
      return a.updated_at > b.updated_at ? -1 : 1;
    }
    return a.session_id < b.session_id ? -1 : 1;
  });
}

function matchesFilters(
  summary: SandboxSupervisionSessionSummary,
  query: SupervisionQuery
): boolean {
  if (query.q) {
    const needle = query.q.toLowerCase();
    const inTask = summary.task_id.toLowerCase().includes(needle);
    const inSession = summary.session_id.toLowerCase().includes(needle);
    if (!inTask && !inSession) return false;
  }
  if (query.status && summary.task_status !== query.status) return false;
  if (query.risk_level && summary.risk_level !== query.risk_level) return false;
  if (query.action && summary.highest_action !== query.action) return false;
  if (query.scenario_id && summary.scenario_id !== query.scenario_id)
    return false;
  if (query.tool_name && !summary.tool_names.includes(query.tool_name))
    return false;
  return true;
}

function computeCounts(
  sessions: SandboxSupervisionSessionSummary[]
): SandboxSupervisionCounts {
  let running = 0;
  let awaiting = 0;
  let alerts = 0;
  let blocked = 0;

  for (const summary of sessions) {
    if (summary.task_status === "running") running++;
    if (summary.highest_action === "ask") awaiting++;
    alerts += summary.alert_count;
    if (summary.blocked) blocked++;
  }

  return {
    observed_session_count: sessions.length,
    running_session_count: running,
    awaiting_confirmation_count: awaiting,
    alert_record_count: alerts,
    blocked_session_count: blocked
  };
}

export class SupervisionService {
  private readonly repository: TaskRepository;

  constructor(repository: TaskRepository) {
    this.repository = repository;
  }

  private projectAll(): Map<string, SessionBucket> {
    const records: StoredTaskRecord[] = this.repository.list();
    const sessions = new Map<string, SessionBucket>();

    for (const record of records) {
      const projection = projectSupervisionRecord(record);
      if (!projection) continue;

      const sessionId = projection.summary.session_id;
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.projections.push(projection);
        existing.ambiguous = true;
      } else {
        sessions.set(sessionId, {
          projections: [projection],
          ambiguous: false
        });
      }
    }

    return sessions;
  }

  private collectUniqueSummaries(
    sessions: Map<string, SessionBucket>
  ): SandboxSupervisionSessionSummary[] {
    const summaries: SandboxSupervisionSessionSummary[] = [];
    for (const bucket of sessions.values()) {
      if (bucket.ambiguous) continue;
      summaries.push(bucket.projections[0].summary);
    }
    return summaries;
  }

  listSessions(query: SupervisionQuery): SandboxSupervisionOverview {
    const sessions = this.projectAll();
    const sorted = sortSessions(this.collectUniqueSummaries(sessions));

    const counts = computeCounts(sorted.slice(0, ROW_LIMIT));

    const filtered = sorted.filter((summary) =>
      matchesFilters(summary, query)
    );
    const matched = filtered.length;
    const capped = filtered.slice(0, ROW_LIMIT);

    const overview: SandboxSupervisionOverview = {
      schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
      counts,
      matched_session_count: matched,
      returned_session_count: capped.length,
      limit: 100,
      truncated: matched > ROW_LIMIT,
      sessions: capped
    };

    const normalized = normalizeSandboxSupervisionOverview(overview);
    if (!normalized) {
      throw internalError("Failed to normalize supervision overview");
    }
    return normalized;
  }

  private findSession(sessionId: string): ProjectedSupervisionRecord {
    const sessions = this.projectAll();
    const bucket = sessions.get(sessionId);
    if (!bucket) {
      throw notFound(sessionId);
    }
    if (bucket.ambiguous) {
      throw ambiguous(sessionId);
    }
    return bucket.projections[0];
  }

  getSessionDetail(sessionId: string): SandboxSupervisionSessionDetail {
    const projection = this.findSession(sessionId);
    const normalized = normalizeSandboxSupervisionSessionDetail(
      projection.detail
    );
    if (!normalized) {
      throw internalError("Failed to normalize supervision detail");
    }
    return normalized;
  }

  getSessionEvidence(
    sessionId: string
  ): SandboxSupervisionEvidenceExport {
    const projection = this.findSession(sessionId);
    if (!projection.evidence) {
      throw evidenceNotAvailable(sessionId);
    }
    const normalized = normalizeSandboxSupervisionEvidenceExport(
      projection.evidence
    );
    if (!normalized) {
      throw internalError("Failed to normalize supervision evidence");
    }
    return normalized;
  }
}
