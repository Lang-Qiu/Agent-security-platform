import {
  runTrack1OpenClawCampaign,
  type Track1CampaignRunnerPorts,
  type Track1CampaignRunSummary
} from "./campaign-runner.ts";
import { normalizeTrack1CloudModelConfig } from "./environment.ts";

export interface Track1CampaignEntrypointResult
  extends Track1CampaignRunSummary {
  completed: true;
}

export async function executeTrack1CampaignEntrypoint(
  environment: Readonly<Record<string, string | undefined>>,
  ports: Track1CampaignRunnerPorts,
  writeSafeLine: (line: string) => void
): Promise<Track1CampaignEntrypointResult> {
  normalizeTrack1CloudModelConfig(environment);
  const summary = await runTrack1OpenClawCampaign(ports);
  const result = Object.freeze({
    ...summary,
    completed: true as const
  });
  writeSafeLine(`status=completed campaign_id=${result.campaign_id}`);
  writeSafeLine(
    `agents=${result.agent_count} cases=${result.case_count} retries=${result.retry_count}`
  );
  return result;
}
