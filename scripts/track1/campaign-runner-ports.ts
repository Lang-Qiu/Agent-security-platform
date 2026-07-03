/**
 * Production implementation of Track1CampaignRunnerPorts
 *
 * This module provides the concrete ports implementation for the Track 1 campaign runner,
 * connecting to actual OpenClaw runtime, backend ingest API, and system resources.
 */

import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Track1CampaignRunnerPorts,
  Track1SafeProgressEvent
} from "./campaign-runner.ts";
import type { Track1PreflightResult } from "./preflight.ts";
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
        const stdout = Buffer.concat(stdoutChunks);
        const stderr = Buffer.concat(stderrChunks);

        resolve({
          exitCode: code,
          signal: signal ?? undefined,
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

export function createProductionPorts(
  config: ProductionPortsConfig
): Track1CampaignRunnerPorts {
  const { ingestBaseUrl, ingestToken, progressCallback } = config;

  const processPort = new NodeProcessPort();
  const ephemeralMessagePort = new NodeEphemeralMessagePort();

  return {
    async preflight(): Promise<Track1PreflightResult> {
      return await runTrack1Preflight();
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
      return await compileTrack1CasePrompt(input);
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
