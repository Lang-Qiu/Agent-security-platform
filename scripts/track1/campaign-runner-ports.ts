/**
 * Production implementation of Track1CampaignRunnerPorts
 *
 * This module provides the concrete ports implementation for the Track 1 campaign runner,
 * connecting to actual OpenClaw runtime, backend ingest API, and system resources.
 */

import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Track1CampaignRunnerPorts,
  Track1SafeProgressEvent
} from "./campaign-runner.ts";
import type { Track1PreflightResult, Track1PreflightPorts } from "./preflight.ts";
import type { Track1CompiledPrompt } from "./case-prompt.ts";
import type {
  OpenClawAgentInvocation,
  SafeOpenClawInvocationResult,
  ProcessPort,
  EphemeralMessagePort,
  ProcessHandle
} from "./openclaw-command.ts";
import type {
  Track1CampaignStartEnvelope,
  Track1CampaignFinalizeEnvelope
} from "../../shared/types/campaign-ingest.ts";
import type { Track1AttemptObservation, Track1AttemptAwaitRequest } from "./campaign-runner.ts";
import { runTrack1Preflight } from "./preflight.ts";
import { compileTrack1CasePrompt } from "./case-prompt.ts";
import { invokeOpenClawAgent } from "./openclaw-command.ts";

interface ProductionPortsConfig {
  ingestBaseUrl: string;
  ingestToken: string;
  publicApiBaseUrl?: string; // For querying campaign status
  progressCallback?: (event: Track1SafeProgressEvent) => void;
}

// Production implementation of ProcessPort using Node.js child_process
class NodeProcessPort implements ProcessPort {
  async spawn(
    executable: string,
    args: readonly string[],
    options: Readonly<{
      shell: false;
      env: Readonly<Record<string, string>>;
      stdio: readonly ["ignore", "pipe", "pipe"];
      timeout?: number;
    }>
  ): Promise<ProcessHandle> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args as string[], {
        shell: options.shell,
        env: options.env as Record<string, string>,
        stdio: options.stdio as ["ignore", "pipe", "pipe"],
        timeout: options.timeout
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout?.on("data", (chunk) => stdoutChunks.push(chunk));
      child.stderr?.on("data", (chunk) => stderrChunks.push(chunk));

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code, signal) => {
        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8");

        resolve({
          exitCode: code,
          signalCode: signal ?? null,
          stdout,
          stderr
        });
      });
    });
  }
}

// Production implementation of EphemeralMessagePort using temporary files
class NodeEphemeralMessagePort implements EphemeralMessagePort {
  async withFile<T>(
    path: string,
    bytes: Uint8Array,
    run: () => Promise<T>
  ): Promise<T> {
    const fullPath = join(tmpdir(), path);
    await writeFile(fullPath, bytes);
    try {
      return await run();
    } finally {
      await unlink(fullPath).catch(() => {
        // Ignore cleanup errors
      });
    }
  }
}

// Helper to infer retry classification from case detail
function inferRetryClassification(caseDetail: any): Track1AttemptObservation["retry_classification"] {
  // For now, return a generic failure classification
  // Future: parse from case metadata or backend response
  if (caseDetail.status === "failed") {
    return "ingest_failed";
  }
  return "success";
}

export function createProductionPorts(
  config: ProductionPortsConfig
): Track1CampaignRunnerPorts {
  const { ingestBaseUrl, ingestToken, publicApiBaseUrl, progressCallback } = config;

  // Default public API URL - derived from ingest URL
  const apiBaseUrl = publicApiBaseUrl ?? ingestBaseUrl.replace(/:\d+\/.*$/, ":3000/api");

  const processPort = new NodeProcessPort();
  const ephemeralMessagePort = new NodeEphemeralMessagePort();

  // Create preflight ports adapter
  const preflightPorts: Track1PreflightPorts = {
    async inspectDocker() {
      const result = await processPort.spawn("docker", ["compose", "version", "--format", "json"], {
        shell: false,
        env: process.env as Record<string, string>,
        stdio: ["ignore", "pipe", "pipe"] as const
      });
      return { compose_v2: result.exitCode === 0 };
    },
    async inspectOpenClaw() {
      const result = await processPort.spawn("openclaw", ["version", "--json"], {
        shell: false,
        env: process.env as Record<string, string>,
        stdio: ["ignore", "pipe", "pipe"] as const
      });
      if (result.exitCode !== 0) {
        throw new Error("OpenClaw version check failed");
      }
      const parsed = JSON.parse(result.stdout);
      return { version: parsed.version, integrity: parsed.integrity };
    },
    async probePlugin() {
      const result = await processPort.spawn(
        "openclaw",
        ["plugins", "inspect", "--runtime", "--json", "agent-security-track1"],
        {
          shell: false,
          env: process.env as Record<string, string>,
          stdio: ["ignore", "pipe", "pipe"] as const
        }
      );
      if (result.exitCode !== 0) {
        throw new Error("Plugin probe failed");
      }
      return JSON.parse(result.stdout);
    },
    async checkBackend() {
      try {
        const publicRes = await fetch(`${apiBaseUrl.replace("/api", "")}/health`);
        const internalRes = await fetch(`${ingestBaseUrl.replace(/\/internal\/.*$/, "")}/health`);
        return {
          public_ready: publicRes.ok,
          internal_ready: internalRes.ok
        };
      } catch {
        return { public_ready: false, internal_ready: false };
      }
    },
    async loadManifest() {
      const manifestPath = join(import.meta.dirname, "../../samples/track1/openclaw/campaign.v1.json");
      const content = await readFile(manifestPath, "utf8");
      return JSON.parse(content);
    }
  };

  return {
    async preflight(): Promise<Track1PreflightResult> {
      return await runTrack1Preflight(process.env, preflightPorts);
    },

    async createCampaign(input: Track1CampaignStartEnvelope): Promise<void> {
      const response = await fetch(`${ingestBaseUrl}/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ingestToken}`
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to create campaign: ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`
        );
      }
    },

    async compilePrompt(input: {
      campaign_id: string;
      agent_id: string;
      scenario_id: string;
      case_id: string;
      attempt_id: string;
      attempt_index: 1 | 2;
      session_id: string;
    }): Promise<Track1CompiledPrompt> {
      // Load manifest to find case entry
      const manifestPath = join(import.meta.dirname, "../../samples/track1/openclaw/campaign.v1.json");
      const manifestBytes = await readFile(manifestPath);
      const manifest = JSON.parse(manifestBytes.toString("utf8"));

      // Find case entry
      const caseEntry = manifest.cases.find((c: any) => c.case_id === input.case_id);
      if (!caseEntry) {
        throw new Error(`Case ${input.case_id} not found in manifest`);
      }

      // Load canonical case bytes
      const caseFilePath = join(import.meta.dirname, "../..", caseEntry.case_ref);
      const fileBuffer = await readFile(caseFilePath);
      const canonicalCaseBytes = new Uint8Array(fileBuffer);

      // Call compiler with all required data
      return compileTrack1CasePrompt({
        manifest_entry: {
          agent_id: input.agent_id,
          case_id: caseEntry.case_id,
          scenario_id: caseEntry.scenario_id,
          case_ref: caseEntry.case_ref,
          case_sha256: caseEntry.case_sha256,
          expected_action: caseEntry.expected_action
        },
        canonical_case_bytes: canonicalCaseBytes,
        campaign_id: input.campaign_id,
        agent_id: input.agent_id,
        attempt_id: input.attempt_id,
        attempt_index: input.attempt_index,
        session_id: input.session_id
      });
    },

    async invokeAgent(
      input: OpenClawAgentInvocation
    ): Promise<SafeOpenClawInvocationResult> {
      return await invokeOpenClawAgent(
        input,
        process.env,
        processPort,
        ephemeralMessagePort
      );
    },

    async awaitAttempt(
      input: Track1AttemptAwaitRequest
    ): Promise<Track1AttemptObservation> {
      // Poll backend supervision API for attempt completion
      const maxAttempts = 120; // 10 minutes with 5s intervals
      let attempts = 0;

      while (attempts < maxAttempts) {
        attempts++;

        // Query campaign detail to get attempt status
        const response = await fetch(
          `${apiBaseUrl}/supervision/campaigns/${input.campaign_id}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json"
            }
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch campaign detail: ${response.status} ${response.statusText}`
          );
        }

        const apiResponse = await response.json();

        // Extract campaign detail from ApiResponse wrapper
        if (!apiResponse.success || !apiResponse.data) {
          throw new Error("Invalid API response structure");
        }

        const campaignDetail = apiResponse.data;

        // Navigate: campaign -> agents -> cases -> attempts
        const agent = campaignDetail.agents?.find(
          (a: any) => a.agent_id === input.agent_id
        );
        if (!agent) {
          throw new Error(`Agent ${input.agent_id} not found in campaign detail`);
        }

        const caseDetail = agent.cases?.find(
          (c: any) => c.case_id === input.case_id
        );
        if (!caseDetail) {
          throw new Error(`Case ${input.case_id} not found in agent detail`);
        }

        const attemptSummary = caseDetail.attempts?.find(
          (a: any) => a.attempt_id === input.attempt_id
        );
        if (!attemptSummary) {
          // Attempt not yet registered, wait and retry
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        // Check if attempt is complete (passed or failed)
        if (attemptSummary.status === "passed") {
          return {
            attempt_id: input.attempt_id,
            final_action: attemptSummary.policy_action!,
            observation_complete: true,
            retry_classification: "success"
          };
        }

        if (attemptSummary.status === "failed") {
          // Parse retry_classification from case status or use generic failure
          const retryClassification = inferRetryClassification(caseDetail);
          return {
            attempt_id: input.attempt_id,
            final_action: attemptSummary.policy_action ?? "deny",
            observation_complete: true,
            retry_classification: retryClassification
          };
        }

        // Attempt still running, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      throw new Error(
        `Attempt observation timeout after ${maxAttempts * 5}s for ${input.attempt_id}`
      );
    },

    async recordCampaign(
      input: Track1CampaignCreateEnvelope
    ): Promise<void> {
      const response = await fetch(`${ingestBaseUrl}/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ingestToken}`
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to record campaign: ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`
        );
      }
    },

    async recordAttempt(
      input: Track1AttemptRecordEnvelope
    ): Promise<void> {
      const response = await fetch(
        `${ingestBaseUrl}/campaigns/${input.campaign_id}/attempts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ingestToken}`
          },
          body: JSON.stringify(input)
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to record attempt: ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`
        );
      }
    },

    async finalizeCampaign(
      input: Track1CampaignFinalizeEnvelope
    ): Promise<void> {
      const response = await fetch(
        `${ingestBaseUrl}/campaigns/${input.campaign_id}/finalize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ingestToken}`
          },
          body: JSON.stringify(input)
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to finalize campaign: ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`
        );
      }
    },

    now(): string {
      return new Date().toISOString();
    },

    randomHex32(): string {
      return randomBytes(16).toString("hex");
    },

    progress(event: Track1SafeProgressEvent): void {
      if (progressCallback) {
        progressCallback(event);
      }
    }
  };
}
