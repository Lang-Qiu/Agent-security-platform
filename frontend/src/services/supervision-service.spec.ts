import { afterEach, describe, expect, test, vi } from "vitest";

import {
  normalizeSandboxSupervisionSessionDetail,
  normalizeSandboxSupervisionEvidenceExport,
  normalizeSandboxSupervisionOverview
} from "../../../shared/contracts/supervision";
import type { ApiResponse } from "../../../shared/types/api-response";
import type {
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail
} from "../../../shared/types/supervision";
import {
  makeSupervisionDetail,
  makeSupervisionEvidence,
  makeSupervisionOverview
} from "../mocks/supervision";
import {
  buildSupervisionEvidenceFilename,
  downloadSupervisionEvidence,
  getSupervisionEvidence,
  getSupervisionSession,
  listSupervisionSessions,
  serializeSupervisionEvidence
} from "./supervision-service";

function makeApiResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    message: "ok",
    data,
    error_code: null,
    request_id: "req_supervision_service_test"
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload
  } as Response;
}

describe("REQ-T1-SUPERVISION-UI-009 service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("service normalizes overview and detail", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeApiResponse(makeSupervisionOverview())))
      .mockResolvedValueOnce(jsonResponse(makeApiResponse(makeSupervisionDetail())));

    const overview = await listSupervisionSessions({}, { fetchImpl });
    const detail = await getSupervisionSession("session:T1-SC-001-C001", {
      fetchImpl
    });

    expect(overview.source).toBe("api");
    expect(overview.data?.schema_version).toBe("track1-supervision-ui.v1");
    expect(detail?.source).toBe("api");
    expect(detail?.data?.summary.session_id).toBe("session:T1-SC-001-C001");
  });

  test("service exposes invalid and unavailable states", async () => {
    const invalidFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApiResponse({ unsafe: true })));
    const unavailableFetch = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(
      listSupervisionSessions({}, { fetchImpl: invalidFetch })
    ).resolves.toMatchObject({ source: "integration-error" });
    await expect(
      listSupervisionSessions({}, { fetchImpl: unavailableFetch })
    ).resolves.toMatchObject({ source: "mock" });
  });

  test("serializes filters in stable order", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApiResponse(makeSupervisionOverview())));

    await listSupervisionSessions(
      {
        tool_name: "send_email",
        action: "deny",
        q: "session"
      },
      { fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/supervision/sessions?q=session&action=deny&tool_name=send_email",
      expect.any(Object)
    );
  });

  test("omits unknown and empty frontend filters", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApiResponse(makeSupervisionOverview())));

    await listSupervisionSessions(
      {
        q: "",
        status: undefined,
        risk_level: undefined,
        action: undefined,
        scenario_id: undefined,
        tool_name: undefined
      },
      { fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/supervision/sessions",
      expect.any(Object)
    );
  });

  test("encodes session IDs in URL paths", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApiResponse(makeSupervisionDetail())));

    await getSupervisionSession("session:T1-SC-001-C001", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/supervision/sessions/session%3AT1-SC-001-C001",
      expect.any(Object)
    );
  });

  test("mock-only mode never calls fetch", async () => {
    const fetchImpl = vi.fn();

    const overview = await listSupervisionSessions({}, {
      fetchImpl,
      mode: "mock-only"
    });
    const detail = await getSupervisionSession("session:T1-SC-001-C001", {
      fetchImpl,
      mode: "mock-only"
    });
    const evidence = await getSupervisionEvidence("session:T1-SC-001-C001", {
      fetchImpl,
      mode: "mock-only"
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(overview.source).toBe("mock");
    expect(detail?.source).toBe("mock");
    expect(evidence?.source).toBe("mock");
  });

  test("mock overview detail and evidence pass shared normalizers", () => {
    const overview = makeSupervisionOverview();
    const detail = makeSupervisionDetail();
    const evidence = makeSupervisionEvidence();

    expect(normalizeSandboxSupervisionOverview(overview)).not.toBeNull();
    expect(normalizeSandboxSupervisionSessionDetail(detail)).not.toBeNull();
    expect(normalizeSandboxSupervisionEvidenceExport(evidence)).not.toBeNull();
  });

  test("mocks cover four actions three task states and three scenarios", () => {
    const overview = makeSupervisionOverview();
    const actions = new Set(overview.sessions.map((s) => s.highest_action));
    const statuses = new Set(overview.sessions.map((s) => s.task_status));
    const scenarios = new Set(
      overview.sessions.map((s) => s.scenario_id).filter((v): v is string => v !== null)
    );

    expect(actions).toEqual(new Set(["allow", "deny", "ask", "alert"]));
    expect(statuses.size).toBeGreaterThanOrEqual(3);
    expect(scenarios.size).toBeGreaterThanOrEqual(3);
  });

  test("mock detail covers seven event types alert and block", () => {
    const detail = makeSupervisionDetail();

    const eventTypes = new Set(detail.events.map((e) => e.event_type));
    expect(eventTypes).toEqual(
      new Set([
        "model_input",
        "model_output",
        "tool_request",
        "tool_result",
        "policy_decision",
        "memory_write",
        "memory_read"
      ])
    );
    expect(detail.alerts.length).toBeGreaterThan(0);
    expect(detail.blocked_records.length).toBeGreaterThan(0);
  });

  test("invalid detail does not partially pass through", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApiResponse({ unsafe: true })));

    const result = await getSupervisionSession("session:T1-SC-001-C001", {
      fetchImpl
    });

    expect(result).toBeNull();
  });

  test("invalid evidence does not partially pass through", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApiResponse({ unsafe: true })));

    const result = await getSupervisionEvidence("session:T1-SC-001-C001", {
      fetchImpl
    });

    expect(result).toBeNull();
  });

  test("no mock serialization contains reason title raw_content or metadata", () => {
    const overview = makeSupervisionOverview();
    const detail = makeSupervisionDetail();
    const evidence = makeSupervisionEvidence();

    const serialized = JSON.stringify({ overview, detail, evidence });
    expect(serialized).not.toContain('"reason"');
    expect(serialized).not.toContain('"title"');
    expect(serialized).not.toContain('"raw_content"');
    expect(serialized).not.toContain('"metadata"');
  });

  test("returns null when session id has no api data and no mock", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => makeApiResponse(null)
      } as Response);

    const result = await getSupervisionSession("session:unknown-001", {
      fetchImpl
    });

    expect(result).toBeNull();
  });

  test("REQ-T1-SUPERVISION-UI-009 builds deterministic evidence bytes", () => {
    const evidence = makeSupervisionEvidence();
    const first = serializeSupervisionEvidence(evidence);
    const second = serializeSupervisionEvidence(evidence);

    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(first).not.toContain('"request_id":');
    expect(first).not.toContain('"metadata":');
    expect(first).not.toContain('"reason":');
  });

  test("REQ-T1-SUPERVISION-UI-009 evidence bytes exclude unnormalized input fields", () => {
    const evidence = makeSupervisionEvidence();
    const serialized = serializeSupervisionEvidence(evidence);

    // The serializer must normalize before serializing so producer narrative
    // and arbitrary metadata never reach the downloaded file.
    const parsed = JSON.parse(serialized);
    expect(Object.keys(parsed).sort()).toEqual(
      ["schema_version", "session", "source_schema_version"].sort()
    );
    expect(parsed.session.summary.evidence_available).toBe(true);
  });

  test("REQ-T1-SUPERVISION-UI-009 sanitizes evidence filenames", () => {
    expect(buildSupervisionEvidenceFilename("session:T1/unsafe?value")).toBe(
      "supervision-session_T1_unsafe_value.json"
    );
  });

  test("REQ-T1-SUPERVISION-UI-009 sanitizes filenames with backslashes and spaces", () => {
    expect(buildSupervisionEvidenceFilename("session:with space\\slash")).toBe(
      "supervision-session_with_space_slash.json"
    );
  });

  test("REQ-T1-SUPERVISION-UI-009 download returns downloaded and revokes object url", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:evidence");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApiResponse(makeSupervisionEvidence())));

    const result = await downloadSupervisionEvidence("session:T1-SC-001-C001", {
      fetchImpl
    });

    expect(result).toBe("downloaded");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:evidence");
  });

  test("REQ-T1-SUPERVISION-UI-009 download returns invalid and creates no blob", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeApiResponse({ unsafe: true })));

    const result = await downloadSupervisionEvidence("session:T1-SC-001-C001", {
      fetchImpl
    });

    expect(result).toBe("invalid");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  test("REQ-T1-SUPERVISION-UI-009 download returns unavailable when fetch throws", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await downloadSupervisionEvidence("session:T1-SC-001-C001", {
      fetchImpl
    });

    expect(result).toBe("unavailable");
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
