// P4-T1: ordered, fail-fast preflight over injected ports. Checks execute in
// a fixed sequence and stop at the first failure so no campaign is ever
// created against an unverified runtime.

import { normalizeTrack1CloudModelConfig } from "./environment.ts";
import type { Track1CloudModelConfig } from "./environment.ts";

export { normalizeTrack1CloudModelConfig };
import { TRACK1_CAMPAIGN_MANIFEST_SHA256 } from "../../shared/types/campaign-ingest.ts";
import type { Track1PluginProbeResult } from "../../integrations/openclaw/src/runtime-probe.ts";

const REQUIRED_OPENCLAW_VERSION = "2026.6.10";

export interface Track1PreflightPorts {
  inspectDocker(): Promise<{ compose_v2: boolean }>;
  inspectOpenClaw(): Promise<{ version: string; integrity: string }>;
  probePlugin(): Promise<Track1PluginProbeResult>;
  checkBackend(): Promise<{ public_ready: boolean; internal_ready: boolean }>;
  loadManifest(): Promise<unknown>;
}

export interface Track1PreflightResult {
  openclaw_version: string;
  openclaw_integrity: string;
  model_ref: string;
  manifest_sha256: string;
  compose_v2: boolean;
  backend_public_ready: boolean;
  backend_internal_ready: boolean;
}

class Track1PreflightError extends Error {
  constructor() {
    super("track1_preflight_failed");
    this.name = "Track1PreflightError";
  }
}

async function checkDocker(ports: Track1PreflightPorts): Promise<boolean> {
  let capability: { compose_v2: boolean };
  try {
    capability = await ports.inspectDocker();
  } catch {
    throw new Track1PreflightError();
  }
  if (capability.compose_v2 !== true) {
    throw new Track1PreflightError();
  }
  return true;
}

async function checkOpenClaw(
  ports: Track1PreflightPorts
): Promise<{ version: string; integrity: string }> {
  let capability: { version: string; integrity: string };
  try {
    capability = await ports.inspectOpenClaw();
  } catch {
    throw new Track1PreflightError();
  }
  if (capability.version !== REQUIRED_OPENCLAW_VERSION) {
    throw new Track1PreflightError();
  }
  return capability;
}

async function checkPlugin(
  ports: Track1PreflightPorts
): Promise<Track1PluginProbeResult> {
  let probe: Track1PluginProbeResult;
  try {
    probe = await ports.probePlugin();
  } catch {
    throw new Track1PreflightError();
  }
  if (probe.diagnostics.length > 0) {
    throw new Track1PreflightError();
  }
  return probe;
}

async function checkBackend(
  ports: Track1PreflightPorts
): Promise<{ public_ready: boolean; internal_ready: boolean }> {
  let health: { public_ready: boolean; internal_ready: boolean };
  try {
    health = await ports.checkBackend();
  } catch {
    throw new Track1PreflightError();
  }
  if (health.public_ready !== true || health.internal_ready !== true) {
    throw new Track1PreflightError();
  }
  return health;
}

async function checkManifest(ports: Track1PreflightPorts): Promise<void> {
  try {
    await ports.loadManifest();
  } catch {
    throw new Track1PreflightError();
  }
}

export async function runTrack1Preflight(
  environment: Readonly<Record<string, string | undefined>>,
  ports: Track1PreflightPorts
): Promise<Track1PreflightResult> {
  const config: Track1CloudModelConfig = normalizeTrack1CloudModelConfig(environment);

  await checkDocker(ports);
  const openclaw = await checkOpenClaw(ports);
  await checkPlugin(ports);
  const backend = await checkBackend(ports);
  await checkManifest(ports);

  return Object.freeze({
    openclaw_version: openclaw.version,
    openclaw_integrity: openclaw.integrity,
    model_ref: config.model_id,
    manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    compose_v2: true,
    backend_public_ready: backend.public_ready,
    backend_internal_ready: backend.internal_ready
  });
}
