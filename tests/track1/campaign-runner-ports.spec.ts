/**
 * Tests for production campaign runner ports implementation
 *
 * P1-4: Test coverage for campaign-runner-ports.ts to catch integration issues
 * before they reach production. Tests the concrete implementation that connects
 * to actual OpenClaw runtime, backend ingest API, and system resources.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createProductionPorts } from "../../scripts/track1/campaign-runner-ports.ts";
import type { Track1CampaignRunnerPorts } from "../../scripts/track1/campaign-runner.ts";

// Mock global fetch
global.fetch = vi.fn();

describe("createProductionPorts", () => {
  let ports: Track1CampaignRunnerPorts;
  const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers(); // Mock timers to avoid real delays
    ports = createProductionPorts({
      ingestBaseUrl: "http://backend:3001/internal/track1",
      ingestToken: "test-token-12345",
      publicApiBaseUrl: "http://backend:3000/api"
    });
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers after each test
  });

  describe("createCampaign", () => {
    it("POSTs to ingest API with bearer token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201
      });

      await ports.createCampaign({
        schema_version: "track1_campaign_ingest_v1",
        campaign_id: "T1-CAM-TEST-001",
        model_ref: "claude-sonnet-4-20250514",
        started_at: "2026-06-10T00:00:00.000Z",
        agent_count: 3,
        case_count: 9
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://backend:3001/internal/track1/campaigns",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": "Bearer test-token-12345"
          })
        })
      );
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: "Conflict",
        text: async () => "Campaign already exists"
      });

      await expect(
        ports.createCampaign({
          schema_version: "track1_campaign_ingest_v1",
          campaign_id: "T1-CAM-TEST-001",
          model_ref: "claude-sonnet-4-20250514",
          started_at: "2026-06-10T00:00:00.000Z",
          agent_count: 3,
          case_count: 9
        })
      ).rejects.toThrow(/409 Conflict/);
    });
  });

  describe("awaitAttempt", () => {
    const mockRequest = {
      campaign_id: "T1-CAM-TEST-001",
      agent_id: "T1-AGT-001" as const,
      scenario_id: "T1-SC-001" as const,
      case_id: "T1-SC-001-C001" as const,
      attempt_id: "T1-CAM-TEST-001:T1-AGT-001:T1-SC-001-C001:1",
      session_id: "sess_abc123"
    };

    it("polls supervision API until attempt passes", async () => {
      // First call: attempt still running
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            campaign_id: "T1-CAM-TEST-001",
            agents: [
              {
                agent_id: "T1-AGT-001",
                cases: [
                  {
                    case_id: "T1-SC-001-C001",
                    attempts: [
                      {
                        attempt_id: mockRequest.attempt_id,
                        status: "running",
                        policy_action: null
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })
      });

      // Second call: attempt passed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            campaign_id: "T1-CAM-TEST-001",
            agents: [
              {
                agent_id: "T1-AGT-001",
                cases: [
                  {
                    case_id: "T1-SC-001-C001",
                    attempts: [
                      {
                        attempt_id: mockRequest.attempt_id,
                        status: "passed",
                        policy_action: "deny"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })
      });

      // Start the await call (non-blocking)
      const awaitPromise = ports.awaitAttempt(mockRequest);

      // Advance time to trigger the first poll delay
      await vi.advanceTimersByTimeAsync(5000);

      // Wait for the promise to resolve
      const observation = await awaitPromise;

      expect(observation).toEqual({
        attempt_id: mockRequest.attempt_id,
        final_action: "deny",
        observation_complete: true,
        retry_classification: "success"
      });

      // Should have called supervision API twice
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://backend:3000/api/supervision/campaigns/T1-CAM-TEST-001",
        expect.objectContaining({
          method: "GET"
        })
      );
    });

    it("returns failure observation when attempt fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            campaign_id: "T1-CAM-TEST-001",
            agents: [
              {
                agent_id: "T1-AGT-001",
                cases: [
                  {
                    case_id: "T1-SC-001-C001",
                    status: "failed", // Mark case as failed
                    attempts: [
                      {
                        attempt_id: mockRequest.attempt_id,
                        status: "failed",
                        policy_action: "alert"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })
      });

      const observation = await ports.awaitAttempt(mockRequest);

      expect(observation.observation_complete).toBe(true);
      expect(observation.retry_classification).toBe("ingest_failed");
    });

    it("throws on non-ok API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found"
      });

      await expect(ports.awaitAttempt(mockRequest)).rejects.toThrow(
        /404 Not Found/
      );
    });

    it("throws on invalid API response structure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          data: null
        })
      });

      await expect(ports.awaitAttempt(mockRequest)).rejects.toThrow(
        /Invalid API response structure/
      );
    });
  });

  describe("finalizeCampaign", () => {
    it("POSTs finalize envelope to ingest API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      await ports.finalizeCampaign({
        schema_version: "track1_campaign_ingest_v1",
        campaign_id: "T1-CAM-TEST-001",
        completed_at: "2026-06-10T01:00:00.000Z",
        case_count: 9,
        passed_count: 8,
        failed_count: 1
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://backend:3001/internal/track1/campaigns/T1-CAM-TEST-001/finalize",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": "Bearer test-token-12345"
          })
        })
      );
    });
  });

  describe("randomHex32", () => {
    it("generates 32-character hex string", () => {
      const hex1 = ports.randomHex32();
      const hex2 = ports.randomHex32();

      expect(hex1).toMatch(/^[0-9a-f]{32}$/);
      expect(hex2).toMatch(/^[0-9a-f]{32}$/);
      expect(hex1).not.toBe(hex2); // Should be random
    });
  });

  describe("now", () => {
    it("returns ISO 8601 timestamp with milliseconds", () => {
      const timestamp = ports.now();

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(() => new Date(timestamp)).not.toThrow();
    });
  });

  describe("progress", () => {
    it("invokes callback with progress event", () => {
      const progressCallback = vi.fn();
      const portsWithCallback = createProductionPorts({
        ingestBaseUrl: "http://backend:3001/internal/track1",
        ingestToken: "test-token",
        progressCallback
      });

      portsWithCallback.progress({
        type: "case_start",
        campaign_id: "T1-CAM-001",
        agent_id: "T1-AGT-001",
        case_id: "T1-SC-001-C001",
        timestamp: "2026-06-10T00:00:00.000Z"
      });

      expect(progressCallback).toHaveBeenCalledWith({
        type: "case_start",
        campaign_id: "T1-CAM-001",
        agent_id: "T1-AGT-001",
        case_id: "T1-SC-001-C001",
        timestamp: "2026-06-10T00:00:00.000Z"
      });
    });

    it("does not throw when no callback provided", () => {
      expect(() => {
        ports.progress({
          type: "case_start",
          campaign_id: "T1-CAM-001",
          agent_id: "T1-AGT-001",
          case_id: "T1-SC-001-C001",
          timestamp: "2026-06-10T00:00:00.000Z"
        });
      }).not.toThrow();
    });
  });
});
