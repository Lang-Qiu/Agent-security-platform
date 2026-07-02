// P5-T1: Strict campaign read service.
//
// Consumes the Phase 1 read contracts and the Phase 2 public campaign API.
// Campaign API failures never masquerade as successful campaign data: an
// `api-preferred` failure returns `integration-error` with `data: null`,
// never a mock fallback. Explicit `mock-only` mode returns sanitized fixtures
// tagged with `source: "mock"`.
//
// The service reuses `requestApiDataWithStatus` (api-client) and the shared
// campaign normalizers. It does not duplicate campaign contract validation.
// The evidence endpoint inspects the HTTP status code and `error_code` field
// directly so a 409 `CAMPAIGN_EVIDENCE_NOT_READY` is surfaced as the typed
// `not-ready` read state rather than collapsed into `unavailable`.

import {
  normalizeTrack1CampaignDetail,
  normalizeTrack1CampaignEvidenceExport,
  normalizeTrack1CampaignSummary
} from "../../../shared/contracts/campaign-supervision";
import { isApiResponse } from "../../../shared/contracts/api-response";
import type {
  Track1CampaignAgentId,
  Track1CampaignDetail,
  Track1CampaignEvidenceExport,
  Track1CampaignStatus,
  Track1CampaignSummary,
  Track1ScenarioId
} from "../../../shared/types/campaign-supervision";
import {
  makeCampaignDetail,
  makeCampaignEvidence,
  makeCampaignSummary
} from "../mocks/campaign-supervision";
import {
  requestApiDataWithStatus,
  type ApiClientOptions
} from "./api-client";

export interface CampaignQuery {
  q?: string;
  status?: Track1CampaignStatus;
  scenario_id?: Track1ScenarioId;
  agent_id?: Track1CampaignAgentId;
}

export type CampaignReadError = "unavailable" | "invalid" | "not-ready";

export interface CampaignDataResult<T> {
  data: T | null;
  source: "api" | "integration-error" | "mock";
  error: CampaignReadError | null;
}

export interface CampaignRequestOptions extends ApiClientOptions {}

// Query order is exactly q, status, scenario_id, agent_id (P5-T1 acceptance).
// Mirrors the backend CampaignQuery DTO order so the two sides cannot drift.
const CAMPAIGN_QUERY_ORDER: ReadonlyArray<keyof CampaignQuery> = [
  "q",
  "status",
  "scenario_id",
  "agent_id"
];

const CAMPAIGNS_ENDPOINT = "/api/supervision/campaigns";

export function serializeCampaignQuery(query: CampaignQuery): string {
  // Throw on unknown keys at runtime — exact-key normalizer per plan requirement.
  const allowed = new Set<string>(CAMPAIGN_QUERY_ORDER as readonly string[]);
  const unknownKeys = Object.keys(query).filter((k) => !allowed.has(k));
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown campaign query key(s): ${unknownKeys.join(", ")}`
    );
  }

  const params = new URLSearchParams();
  for (const key of CAMPAIGN_QUERY_ORDER) {
    const value = query[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "string" && value.length === 0) {
      continue;
    }
    // URLSearchParams.toString() URL-encodes values, so an agent_id such as
    // `agent:track1:tool-hijack` becomes `agent%3Atrack1%3Atool-hijack`.
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized.length === 0 ? "" : `?${serialized}`;
}

function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch | null {
  return fetchImpl ?? globalThis.fetch ?? null;
}

function normalizeCampaignSummaryArray(
  value: unknown
): readonly Track1CampaignSummary[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: Track1CampaignSummary[] = [];
  for (const item of value) {
    const normalized = normalizeTrack1CampaignSummary(item);
    if (!normalized) {
      return null;
    }
    out.push(normalized);
  }
  return out;
}

function apiResult<T>(
  data: T | null,
  error: CampaignReadError | null
): CampaignDataResult<T> {
  if (data) {
    return { data, source: "api", error: null };
  }
  return { data: null, source: "integration-error", error };
}

export async function listCampaigns(
  query: CampaignQuery,
  options?: CampaignRequestOptions
): Promise<CampaignDataResult<readonly Track1CampaignSummary[]>> {
  const mode = options?.mode ?? "api-preferred";

  if (mode === "mock-only") {
    return {
      data: [makeCampaignSummary()],
      source: "mock",
      error: null
    };
  }

  const fetchImpl = resolveFetchImpl(options?.fetchImpl);
  if (!fetchImpl) {
    return { data: null, source: "integration-error", error: "unavailable" };
  }

  try {
    const path = `${CAMPAIGNS_ENDPOINT}${serializeCampaignQuery(query)}`;
    const result = await requestApiDataWithStatus({
      path,
      options,
      normalize: normalizeCampaignSummaryArray
    });
    if (result.data) {
      return apiResult(result.data, null);
    }
    return apiResult(null, result.status === "invalid" ? "invalid" : "unavailable");
  } catch {
    return apiResult(null, "unavailable");
  }
}

export async function getCampaign(
  campaignId: string,
  options?: CampaignRequestOptions
): Promise<CampaignDataResult<Track1CampaignDetail>> {
  const mode = options?.mode ?? "api-preferred";

  if (mode === "mock-only") {
    return {
      data: makeCampaignDetail(),
      source: "mock",
      error: null
    };
  }

  const fetchImpl = resolveFetchImpl(options?.fetchImpl);
  if (!fetchImpl) {
    return { data: null, source: "integration-error", error: "unavailable" };
  }

  try {
    const encodedId = encodeURIComponent(campaignId);
    const path = `${CAMPAIGNS_ENDPOINT}/${encodedId}`;
    const result = await requestApiDataWithStatus({
      path,
      options,
      normalize: normalizeTrack1CampaignDetail
    });
    if (result.data) {
      return apiResult(result.data, null);
    }
    return apiResult(null, result.status === "invalid" ? "invalid" : "unavailable");
  } catch {
    return apiResult(null, "unavailable");
  }
}

// The evidence endpoint distinguishes 409 CAMPAIGN_EVIDENCE_NOT_READY from
// other failures. `requestApiDataWithStatus` collapses all non-200 responses
// to `unavailable`, so we fetch directly here and inspect the status code and
// error_code field. Shared normalizer is still the single source of contract
// validation — no duplication.
export async function getCampaignEvidence(
  campaignId: string,
  options?: CampaignRequestOptions
): Promise<CampaignDataResult<Track1CampaignEvidenceExport>> {
  const mode = options?.mode ?? "api-preferred";

  if (mode === "mock-only") {
    return {
      data: makeCampaignEvidence(),
      source: "mock",
      error: null
    };
  }

  const fetchImpl = resolveFetchImpl(options?.fetchImpl);
  if (!fetchImpl) {
    return { data: null, source: "integration-error", error: "unavailable" };
  }

  const encodedId = encodeURIComponent(campaignId);
  const path = `${CAMPAIGNS_ENDPOINT}/${encodedId}/evidence`;

  let response: Response;
  try {
    response = await fetchImpl(path, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: options?.signal
    });
  } catch {
    return { data: null, source: "integration-error", error: "unavailable" };
  }

  if (response.status === 409) {
    // Inspect error_code to confirm this is the not-ready signal. A 409
    // without the canonical error_code is still an integration error, but
    // we classify it as `unavailable` to avoid spoofing not-ready.
    const errorCode = await safeReadErrorCode(response);
    if (errorCode === "CAMPAIGN_EVIDENCE_NOT_READY") {
      return { data: null, source: "integration-error", error: "not-ready" };
    }
    return { data: null, source: "integration-error", error: "unavailable" };
  }

  if (!response.ok) {
    return { data: null, source: "integration-error", error: "unavailable" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { data: null, source: "integration-error", error: "invalid" };
  }

  if (!isApiResponse(payload)) {
    return { data: null, source: "integration-error", error: "invalid" };
  }

  const normalized = normalizeTrack1CampaignEvidenceExport(payload.data);
  if (!normalized) {
    return { data: null, source: "integration-error", error: "invalid" };
  }

  return { data: normalized, source: "api", error: null };
}

async function safeReadErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as unknown;
    if (
      typeof body === "object" &&
      body !== null &&
      "error_code" in body &&
      typeof (body as { error_code: unknown }).error_code === "string"
    ) {
      return (body as { error_code: string }).error_code;
    }
    return null;
  } catch {
    return null;
  }
}
