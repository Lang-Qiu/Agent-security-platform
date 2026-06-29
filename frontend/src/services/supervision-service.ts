import {
  normalizeSandboxSupervisionSessionDetail,
  normalizeSandboxSupervisionEvidenceExport,
  normalizeSandboxSupervisionOverview
} from "../../../shared/contracts/supervision";
import type { SandboxPolicyAction } from "../../../shared/types/sandbox";
import type { RiskLevel, TaskStatus } from "../../../shared/types/task";
import type {
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail,
  SandboxSupervisionToolName
} from "../../../shared/types/supervision";
import {
  findMockEvidence,
  findMockSession,
  makeSupervisionOverview
} from "../mocks/supervision";
import {
  requestApiDataWithStatus,
  type ApiClientOptions
} from "./api-client";

export interface SupervisionQuery {
  q?: string;
  status?: TaskStatus;
  risk_level?: RiskLevel;
  action?: SandboxPolicyAction;
  scenario_id?: string;
  tool_name?: SandboxSupervisionToolName;
}

export interface SupervisionRequestOptions extends ApiClientOptions {}

export interface SupervisionDataResult<T> {
  data: T;
  source: "api" | "integration-error" | "mock";
}

const SUPERVISION_SESSIONS_ENDPOINT = "/api/supervision/sessions";

const FILTER_ORDER: Array<keyof SupervisionQuery> = [
  "q",
  "status",
  "risk_level",
  "action",
  "scenario_id",
  "tool_name"
];

export function serializeSupervisionQuery(query: SupervisionQuery): string {
  const params = new URLSearchParams();

  for (const key of FILTER_ORDER) {
    const value = query[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "string" && value.length === 0) {
      continue;
    }
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized.length === 0 ? "" : `?${serialized}`;
}

function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch | null {
  return fetchImpl ?? globalThis.fetch ?? null;
}

export async function listSupervisionSessions(
  query: SupervisionQuery,
  options?: SupervisionRequestOptions
): Promise<SupervisionDataResult<SandboxSupervisionOverview>> {
  const mode = options?.mode ?? "api-preferred";
  const fetchImpl = resolveFetchImpl(options?.fetchImpl);

  if (mode === "mock-only" || !fetchImpl) {
    return {
      data: makeSupervisionOverview(),
      source: "mock"
    };
  }

  try {
    const path = `${SUPERVISION_SESSIONS_ENDPOINT}${serializeSupervisionQuery(query)}`;
    const result = await requestApiDataWithStatus({
      path,
      options,
      normalize: normalizeSandboxSupervisionOverview
    });

    if (result.data) {
      return {
        data: result.data,
        source: "api"
      };
    }

    if (result.status === "invalid") {
      return {
        data: makeSupervisionOverview(),
        source: "integration-error"
      };
    }

    return {
      data: makeSupervisionOverview(),
      source: "mock"
    };
  } catch {
    return {
      data: makeSupervisionOverview(),
      source: "mock"
    };
  }
}

export async function getSupervisionSession(
  sessionId: string,
  options?: SupervisionRequestOptions
): Promise<SupervisionDataResult<SandboxSupervisionSessionDetail> | null> {
  const mode = options?.mode ?? "api-preferred";
  const fetchImpl = resolveFetchImpl(options?.fetchImpl);

  if (mode === "mock-only" || !fetchImpl) {
    const mockDetail = findMockSession(sessionId);
    if (!mockDetail) {
      return null;
    }
    return {
      data: mockDetail,
      source: "mock"
    };
  }

  try {
    const encodedId = encodeURIComponent(sessionId);
    const path = `${SUPERVISION_SESSIONS_ENDPOINT}/${encodedId}`;
    const result = await requestApiDataWithStatus({
      path,
      options,
      normalize: normalizeSandboxSupervisionSessionDetail
    });

    if (result.data) {
      return {
        data: result.data,
        source: "api"
      };
    }

    if (result.status === "invalid") {
      return null;
    }

    const mockDetail = findMockSession(sessionId);
    if (!mockDetail) {
      return null;
    }
    return {
      data: mockDetail,
      source: "mock"
    };
  } catch {
    const mockDetail = findMockSession(sessionId);
    if (!mockDetail) {
      return null;
    }
    return {
      data: mockDetail,
      source: "mock"
    };
  }
}

export async function getSupervisionEvidence(
  sessionId: string,
  options?: SupervisionRequestOptions
): Promise<SupervisionDataResult<SandboxSupervisionEvidenceExport> | null> {
  const mode = options?.mode ?? "api-preferred";
  const fetchImpl = resolveFetchImpl(options?.fetchImpl);

  if (mode === "mock-only" || !fetchImpl) {
    const mockEvidence = findMockEvidence(sessionId);
    if (!mockEvidence) {
      return null;
    }
    return {
      data: mockEvidence,
      source: "mock"
    };
  }

  try {
    const encodedId = encodeURIComponent(sessionId);
    const path = `${SUPERVISION_SESSIONS_ENDPOINT}/${encodedId}/evidence`;
    const result = await requestApiDataWithStatus({
      path,
      options,
      normalize: normalizeSandboxSupervisionEvidenceExport
    });

    if (result.data) {
      return {
        data: result.data,
        source: "api"
      };
    }

    if (result.status === "invalid") {
      return null;
    }

    const mockEvidence = findMockEvidence(sessionId);
    if (!mockEvidence) {
      return null;
    }
    return {
      data: mockEvidence,
      source: "mock"
    };
  } catch {
    const mockEvidence = findMockEvidence(sessionId);
    if (!mockEvidence) {
      return null;
    }
    return {
      data: mockEvidence,
      source: "mock"
    };
  }
}

export function serializeSupervisionEvidence(
  value: SandboxSupervisionEvidenceExport
): string {
  const normalized = normalizeSandboxSupervisionEvidenceExport(value);
  if (!normalized) {
    throw new Error("invalid supervision evidence");
  }
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function buildSupervisionEvidenceFilename(sessionId: string): string {
  const sanitized = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `supervision-${sanitized}.json`;
}

export async function downloadSupervisionEvidence(
  sessionId: string,
  options?: SupervisionRequestOptions
): Promise<"downloaded" | "unavailable" | "invalid"> {
  const mode = options?.mode ?? "api-preferred";
  const fetchImpl = resolveFetchImpl(options?.fetchImpl);

  if (mode === "mock-only" || !fetchImpl) {
    return "unavailable";
  }

  try {
    const encodedId = encodeURIComponent(sessionId);
    const path = `${SUPERVISION_SESSIONS_ENDPOINT}/${encodedId}/evidence`;
    const result = await requestApiDataWithStatus({
      path,
      options,
      normalize: normalizeSandboxSupervisionEvidenceExport
    });

    if (!result.data) {
      return result.status === "invalid" ? "invalid" : "unavailable";
    }

    const serialized = serializeSupervisionEvidence(result.data);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename = buildSupervisionEvidenceFilename(sessionId);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    return "downloaded";
  } catch {
    return "unavailable";
  }
}
