import { describe, expect, test, vi } from "vitest";

import type { ApiResponse } from "../../../shared/types/api-response";
import type {
  Track1CampaignDetail,
  Track1CampaignEvidenceExport,
  Track1CampaignSummary
} from "../../../shared/types/campaign-supervision";
import {
  makeCampaignAgentSummary,
  makeCampaignAttemptSummary,
  makeCampaignCaseSummary,
  makeCampaignDetail,
  makeCampaignEvidence,
  makeCampaignSummary
} from "../mocks/campaign-supervision";
import {
  getCampaign,
  getCampaignEvidence,
  listCampaigns,
  serializeCampaignQuery,
  type CampaignQuery
} from "./campaign-supervision-service";

const CAMPAIGN_ID =
  "campaign:t1:0123456789abcdef0123456789abcdef";

function makeApiOk<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    message: "ok",
    data,
    error_code: null,
    request_id: "req-campaign-service-test"
  };
}

function makeApiError(input: {
  error_code: string;
  message: string;
  request_id?: string;
}): ApiResponse<null> {
  return {
    success: false,
    message: input.message,
    data: null,
    error_code: input.error_code,
    request_id: input.request_id ?? "req-campaign-service-test"
  };
}

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function jsonStatus(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("REQ-T1-DEMO-010 campaign supervision service - query serialization", () => {
  test("serializes only supported filters in canonical order", () => {
    const query: CampaignQuery = {
      agent_id: "agent:track1:tool-hijack",
      scenario_id: "T1-SC-002",
      status: "running",
      q: "campaign"
    };
    expect(serializeCampaignQuery(query)).toBe(
      "?q=campaign&status=running&scenario_id=T1-SC-002&agent_id=agent%3Atrack1%3Atool-hijack"
    );
  });

  test("skips undefined and empty-string query values", () => {
    expect(
      serializeCampaignQuery({ q: "", status: undefined, scenario_id: "T1-SC-001" })
    ).toBe("?scenario_id=T1-SC-001");
  });

  test("returns empty string when no filters are provided", () => {
    expect(serializeCampaignQuery({})).toBe("");
  });

  test("does not emit unknown keys even if added via cast", () => {
    const query = {
      q: "needle",
      raw_prompt: "SHOULD_NOT_APPEAR"
    } as unknown as CampaignQuery;
    const serialized = serializeCampaignQuery(query);
    expect(serialized).toBe("?q=needle");
    expect(serialized).not.toContain("raw_prompt");
    expect(serialized).not.toContain("SHOULD_NOT_APPEAR");
  });
});

describe("REQ-T1-DEMO-010 campaign supervision service - getCampaign", () => {
  test("normalizes campaign detail from the encoded read endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonOk(makeApiOk(makeCampaignDetail())));
    const result = await getCampaign(CAMPAIGN_ID, { fetchImpl });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/api/supervision/campaigns/campaign%3At1%3A0123456789abcdef0123456789abcdef"
    );
    expect(result.source).toBe("api");
    expect(result.error).toBeNull();
    expect(result.data?.agents).toHaveLength(3);
    expect(result.data?.agents.flatMap((a) => a.cases)).toHaveLength(9);
  });

  test("API failure never becomes mock campaign success", async () => {
    const fetchImpl = vi.fn(async () => new Response("down", { status: 503 }));
    const result = await getCampaign(CAMPAIGN_ID, { fetchImpl });

    expect(result).toEqual({
      data: null,
      source: "integration-error",
      error: "unavailable"
    });
  });

  test("malformed 200 envelope is reported as integration-error/invalid", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonOk({ not: "an-api-response" })
    );
    const result = await getCampaign(CAMPAIGN_ID, { fetchImpl });

    expect(result.source).toBe("integration-error");
    expect(result.error).toBe("invalid");
    expect(result.data).toBeNull();
  });

  test("extra contract keys on campaign detail are rejected as invalid", async () => {
    const detail = makeCampaignDetail();
    // Attach a raw-content sentinel that the shared normalizer must reject.
    (detail as unknown as { raw_prompt: string }).raw_prompt =
      "CAMPAIGN_DETAIL_SENTINEL";
    const fetchImpl = vi.fn(async () => jsonOk(makeApiOk(detail)));
    const result = await getCampaign(CAMPAIGN_ID, { fetchImpl });

    expect(result.source).toBe("integration-error");
    expect(result.error).toBe("invalid");
    expect(result.data).toBeNull();
  });

  test("404 is reported as integration-error/unavailable", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonStatus(makeApiError({ error_code: "CAMPAIGN_NOT_FOUND", message: "missing" }), 404)
    );
    const result = await getCampaign(CAMPAIGN_ID, { fetchImpl });

    expect(result).toEqual({
      data: null,
      source: "integration-error",
      error: "unavailable"
    });
  });

  test("network error is reported as integration-error/unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("BACKEND_SENTINEL");
    });
    const result = await getCampaign(CAMPAIGN_ID, { fetchImpl });

    expect(result).toEqual({
      data: null,
      source: "integration-error",
      error: "unavailable"
    });
  });

  test("explicit mock-only mode returns fixture tagged as mock", async () => {
    const fetchImpl = vi.fn();
    const result = await getCampaign(CAMPAIGN_ID, {
      fetchImpl,
      mode: "mock-only"
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.source).toBe("mock");
    expect(result.error).toBeNull();
    expect(result.data?.agents).toHaveLength(3);
  });
});

describe("REQ-T1-DEMO-010 campaign supervision service - listCampaigns", () => {
  test("normalizes a list of campaign summaries from the encoded endpoint", async () => {
    const summaries: Track1CampaignSummary[] = [makeCampaignSummary()];
    const fetchImpl = vi.fn(async () => jsonOk(makeApiOk(summaries)));
    const result = await listCampaigns(
      { status: "running", scenario_id: "T1-SC-001" },
      { fetchImpl }
    );

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/api/supervision/campaigns?status=running&scenario_id=T1-SC-001"
    );
    expect(result.source).toBe("api");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  test("malformed summary in list is reported as invalid", async () => {
    const badSummary = {
      ...makeCampaignSummary(),
      passed_case_count: 99
    };
    const fetchImpl = vi.fn(async () => jsonOk(makeApiOk([badSummary])));
    const result = await listCampaigns({}, { fetchImpl });

    expect(result.source).toBe("integration-error");
    expect(result.error).toBe("invalid");
    expect(result.data).toBeNull();
  });

  test("api-preferred failure does not fall back to mock campaign data", async () => {
    const fetchImpl = vi.fn(async () => new Response("down", { status: 500 }));
    const result = await listCampaigns({}, { fetchImpl });

    expect(result.source).toBe("integration-error");
    expect(result.data).toBeNull();
    expect(result.error).toBe("unavailable");
  });
});

describe("REQ-T1-DEMO-010 campaign supervision service - getCampaignEvidence", () => {
  test("normalizes campaign evidence from the encoded evidence endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonOk(makeApiOk(makeCampaignEvidence())));
    const result = await getCampaignEvidence(CAMPAIGN_ID, { fetchImpl });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/api/supervision/campaigns/campaign%3At1%3A0123456789abcdef0123456789abcdef/evidence"
    );
    expect(result.source).toBe("api");
    expect(result.error).toBeNull();
    expect(result.data?.session_evidence_refs.length).toBeGreaterThan(0);
  });

  test("evidence not-ready remains a typed read state", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonStatus(
        makeApiError({
          error_code: "CAMPAIGN_EVIDENCE_NOT_READY",
          message: "Campaign evidence is not ready"
        }),
        409
      )
    );
    const result = await getCampaignEvidence(CAMPAIGN_ID, { fetchImpl });

    expect(result.error).toBe("not-ready");
    expect(result.data).toBeNull();
    expect(result.source).toBe("integration-error");
  });

  test("evidence 404 is reported as unavailable, not not-ready", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonStatus(
        makeApiError({ error_code: "CAMPAIGN_NOT_FOUND", message: "missing" }),
        404
      )
    );
    const result = await getCampaignEvidence(CAMPAIGN_ID, { fetchImpl });

    expect(result.error).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  test("evidence malformed 200 body is reported as invalid", async () => {
    const fetchImpl = vi.fn(async () => jsonOk({ not: "an-api-response" }));
    const result = await getCampaignEvidence(CAMPAIGN_ID, { fetchImpl });

    expect(result.error).toBe("invalid");
    expect(result.data).toBeNull();
  });

  test("explicit mock-only mode returns evidence fixture tagged as mock", async () => {
    const fetchImpl = vi.fn();
    const result = await getCampaignEvidence(CAMPAIGN_ID, {
      fetchImpl,
      mode: "mock-only"
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.source).toBe("mock");
    expect(result.error).toBeNull();
    expect(result.data?.session_evidence_refs.length).toBeGreaterThan(0);
  });
});

describe("REQ-T1-DEMO-010 campaign supervision service - mock fixtures", () => {
  test("makeCampaignSummary returns normalizer-valid summary with no raw content", () => {
    const summary = makeCampaignSummary();
    expect(summary.campaign_id).toBe(CAMPAIGN_ID);
    expect(summary.agent_count).toBe(3);
    expect(summary.case_count).toBe(9);
    expect(JSON.stringify(summary)).not.toContain("SENTINEL");
  });

  test("makeCampaignDetail returns 3 agents, 9 cases, all passed by default", () => {
    const detail = makeCampaignDetail();
    expect(detail.agents).toHaveLength(3);
    expect(detail.agents.flatMap((a) => a.cases)).toHaveLength(9);
    expect(detail.status).toBe("completed");
    for (const agent of detail.agents) {
      for (const c of agent.cases) {
        expect(c.status).toBe("passed");
        expect(c.attempts).toHaveLength(1);
      }
    }
  });

  test("makeCampaignDetail with running status keeps a non-terminal case", () => {
    const detail = makeCampaignDetail({ status: "running" });
    expect(detail.status).toBe("running");
    const allTerminal = detail.agents
      .flatMap((a) => a.cases)
      .every((c) => c.status === "passed" || c.status === "failed");
    expect(allTerminal).toBe(false);
  });

  test("makeCampaignEvidence returns refs in campaign traversal order", () => {
    const evidence: Track1CampaignEvidenceExport = makeCampaignEvidence();
    expect(evidence.session_evidence_refs.length).toBe(9);
    expect(evidence.artifact_manifest_ref).toMatch(
      /^artifact:\/\/track1\/campaign\/[0-9a-f]{32}\/manifest$/
    );
  });

  test("makeCampaignAgentSummary returns a single agent summary for a fixed agent", () => {
    const agent = makeCampaignAgentSummary("agent:track1:tool-hijack");
    expect(agent.agent_id).toBe("agent:track1:tool-hijack");
    expect(agent.scenario_id).toBe("T1-SC-002");
    expect(agent.case_count).toBe(3);
  });

  test("makeCampaignCaseSummary returns a single case summary for a fixed case", () => {
    const c = makeCampaignCaseSummary("T1-SC-002-C002");
    expect(c.case_id).toBe("T1-SC-002-C002");
    expect(c.agent_id).toBe("agent:track1:tool-hijack");
    expect(c.scenario_id).toBe("T1-SC-002");
  });

  test("makeCampaignAttemptSummary returns a single attempt for a fixed case/index", () => {
    const a = makeCampaignAttemptSummary("T1-SC-002-C002", 1);
    expect(a.attempt_index).toBe(1);
    expect(a.case_id).toBe("T1-SC-002-C002");
    expect(a.attempt_id).toBe("attempt:t1-sc-002-c002:1");
  });

  test("factories return defensive copies (mutating one call does not affect the next)", () => {
    const first = makeCampaignDetail();
    first.agents[0].cases[0].status = "failed";
    // T1-SC-001-C001 has expected_action "deny", so the default actual_action
    // is "deny". Mutate to "allow" (a different valid action) to prove the
    // second factory call is unaffected by the first call's mutation.
    first.agents[0].cases[0].attempts[0].actual_action = "allow";

    const second = makeCampaignDetail();
    expect(second.agents[0].cases[0].status).toBe("passed");
    expect(second.agents[0].cases[0].attempts[0].actual_action).toBe("deny");
  });

  test("fixtures never carry raw-content sentinel fields", () => {
    const blob = JSON.stringify({
      summary: makeCampaignSummary(),
      detail: makeCampaignDetail(),
      evidence: makeCampaignEvidence(),
      agent: makeCampaignAgentSummary("agent:track1:prompt-injection"),
      caseSummary: makeCampaignCaseSummary("T1-SC-001-C001"),
      attempt: makeCampaignAttemptSummary("T1-SC-001-C001", 1)
    });
    expect(blob).not.toContain("SENTINEL");
    expect(blob).not.toContain("raw_prompt");
    expect(blob).not.toContain("raw_output");
  });
});
