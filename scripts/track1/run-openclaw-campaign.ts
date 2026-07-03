/**
 * REQ-T1-DEMO-010: Track 1 OpenClaw Campaign Runner Entrypoint
 *
 * Fixed entrypoint for executing the Track 1 security evaluation campaign.
 * This script orchestrates the three-agent/nine-case campaign through the
 * OpenClaw runtime without exposing arbitrary commands, paths, or model fallbacks.
 *
 * Usage:
 *   export OPENCLAW_MODEL_BASE_URL="https://api.anthropic.com/v1"
 *   export OPENCLAW_MODEL_API_KEY="your-api-key"
 *   export OPENCLAW_MODEL_ID="anthropic/claude-sonnet-5"
 *   export TRACK1_INGEST_TOKEN="your-token"
 *   export TRACK1_INGEST_BASE_URL="http://localhost:3001/internal/track1"
 *   node --experimental-strip-types scripts/track1/run-openclaw-campaign.ts
 *
 * Required environment variables:
 *   - OPENCLAW_MODEL_BASE_URL: Model provider base URL
 *   - OPENCLAW_MODEL_API_KEY: Model provider API key
 *   - OPENCLAW_MODEL_ID: Model identifier (e.g., "anthropic/claude-sonnet-5")
 *   - TRACK1_INGEST_TOKEN: Backend authentication token
 *   - TRACK1_INGEST_BASE_URL: Backend ingest API base URL (default: http://localhost:3001/internal/track1)
 */

import { runTrack1OpenClawCampaign } from "./campaign-runner.ts";
import { createProductionPorts } from "./campaign-runner-ports.ts";
import type { Track1SafeProgressEvent } from "./campaign-runner.ts";

// Validate required environment variables
const requiredEnv = [
  "OPENCLAW_MODEL_BASE_URL",
  "OPENCLAW_MODEL_API_KEY",
  "OPENCLAW_MODEL_ID",
  "TRACK1_INGEST_TOKEN"
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error("[track1-campaign] Missing required environment variables:");
  for (const key of missing) {
    console.error(`  - ${key}`);
  }
  process.exit(1);
}

// Get configuration from environment
const ingestBaseUrl =
  process.env.TRACK1_INGEST_BASE_URL ??
  "http://localhost:3001/internal/track1";
const ingestToken = process.env.TRACK1_INGEST_TOKEN!;
const publicApiBaseUrl = process.env.TRACK1_BACKEND_URL; // Optional, defaults to derived URL

// Progress callback for logging
function progressCallback(event: Track1SafeProgressEvent): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${event.event_type}`, {
    agent_id: event.agent_id,
    case_id: event.case_id,
    attempt_id: event.attempt_id,
    attempt_index: event.attempt_index,
    final_action: event.final_action,
    case_ordinal: event.case_ordinal,
    total_cases: event.total_cases
  });
}

// Create production ports
const ports = createProductionPorts({
  ingestBaseUrl,
  ingestToken,
  publicApiBaseUrl,
  progressCallback
});

// Run campaign
console.log("[track1-campaign] Starting Track 1 OpenClaw campaign");
console.log(`[track1-campaign] Ingest base URL: ${ingestBaseUrl}`);

try {
  const summary = await runTrack1OpenClawCampaign(ports);

  console.log("[track1-campaign] Campaign completed successfully");
  console.log(`[track1-campaign] Campaign ID: ${summary.campaign_id}`);
  console.log(`[track1-campaign] Cases: ${summary.case_count}`);
  console.log(`[track1-campaign] Agents: ${summary.agent_count}`);
  console.log(`[track1-campaign] Retries: ${summary.retry_count}`);
  console.log(`[track1-campaign] Completed: ${summary.completed}`);
  console.log("[track1-campaign] Final actions:", summary.final_actions);

  process.exit(summary.completed ? 0 : 1);
} catch (error) {
  console.error("[track1-campaign] Campaign failed:", error);
  process.exit(1);
}
