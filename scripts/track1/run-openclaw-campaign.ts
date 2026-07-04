import { executeTrack1CampaignEntrypoint } from "./campaign-entrypoint.ts";
import { createProductionPorts } from "./campaign-runner-ports.ts";

if (process.argv.length > 2) {
  process.stderr.write("track1_entrypoint_arguments_not_supported\n");
  process.exit(1);
}

const requiredEnvironment = [
  "OPENCLAW_MODEL_BASE_URL",
  "OPENCLAW_MODEL_API_KEY",
  "OPENCLAW_MODEL_ID",
  "TRACK1_INGEST_TOKEN",
  "OPENCLAW_GATEWAY_PASSWORD"
] as const;

if (
  requiredEnvironment.some(
    (name) => !process.env[name] || process.env[name]?.trim().length === 0
  )
) {
  process.stderr.write("track1_environment_invalid\n");
  process.exit(1);
}

const ports = createProductionPorts({
  ingestBaseUrl:
    process.env.TRACK1_INGEST_BASE_URL ??
    "http://backend:3001/internal/track1",
  publicApiBaseUrl:
    process.env.TRACK1_BACKEND_URL ??
    "http://backend:3000/api",
  ingestToken: process.env.TRACK1_INGEST_TOKEN!,
  progressCallback(event) {
    const safe = [
      `event=${String(event.event_type ?? "unknown")}`,
      event.case_id ? `case_id=${String(event.case_id)}` : "",
      event.attempt_id ? `attempt_id=${String(event.attempt_id)}` : ""
    ].filter(Boolean);
    process.stdout.write(`${safe.join(" ")}\n`);
  }
});

try {
  await executeTrack1CampaignEntrypoint(
    process.env,
    ports,
    (line) => process.stdout.write(`${line}\n`)
  );
} catch {
  process.stderr.write("track1_campaign_failed\n");
  process.exit(1);
}
