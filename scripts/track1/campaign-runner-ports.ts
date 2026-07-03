/**
 * Production implementation of Track1CampaignRunnerPorts
 *
 * This module provides the concrete ports implementation for the Track 1 campaign runner,
 * connecting to actual OpenClaw runtime, backend ingest API, and system resources.
 */

import { randomBytes, createHash } from "node:crypto";
import type {
  Track1CampaignRunnerPorts,
  Track1SafeProgressEvent
} from "./campaign-runner.ts";
import type { Track1PreflightResult } from "./preflight.ts";
import type { Track1CompiledPrompt } from "./case-prompt.ts";
import type {
  OpenClawAgentInvocation,
  SafeOpenClawInvocationResult
} from "./openclaw-command.ts";
import type {
  Track1CampaignStartEnvelope,
  Track1CampaignFinalizeEnvelope
} from "../../shared/types/campaign-ingest.ts";
import type { Track1AttemptObservation, Track1AttemptAwaitRequest } from "./campaign-runner.ts";
import { runPreflight } from "./preflight.ts";
import { compilePromptForCase } from "./case-prompt.ts";
import { invokeOpenClawAgent } from "./openclaw-command.ts";

interface ProductionPortsConfig {
  ingestBaseUrl: string;
  ingestToken: string;
  progressCallback?: (event: Track1SafeProgressEvent) => void;
}

export function createProductionPorts(
  config: ProductionPortsConfig
): Track1CampaignRunnerPorts {
  const { ingestBaseUrl, ingestToken, progressCallback } = config;

  return {
    async preflight(): Promise<Track1PreflightResult> {
      return await runPreflight();
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
      return await compilePromptForCase(input);
    },

    async invokeAgent(
      input: OpenClawAgentInvocation
    ): Promise<SafeOpenClawInvocationResult> {
      return await invokeOpenClawAgent(input);
    },

    async awaitAttempt(
      input: Track1AttemptAwaitRequest
    ): Promise<Track1AttemptObservation> {
      // Poll the backend for attempt observation
      const maxAttempts = 120; // 10 minutes with 5s intervals
      let attempts = 0;

      while (attempts < maxAttempts) {
        attempts++;

        const response = await fetch(
          `${ingestBaseUrl}/attempts/${input.attempt_id}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${ingestToken}`
            }
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch attempt observation: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        // Check if observation is ready (has final_action or retry_classification)
        if (data.final_action !== null || data.retry_classification !== null) {
          return data as Track1AttemptObservation;
        }

        // Wait 5 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      throw new Error(
        `Attempt observation timeout after ${maxAttempts * 5}s for ${input.attempt_id}`
      );
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
