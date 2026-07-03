// P4-T1: deterministic, fail-fast preflight. Runs docker -> openclaw ->
// plugin -> backend -> manifest, in that fixed order, and stops at the first
// failure. The returned result never carries the API key, ingest token, or
// any raw environment value.

import { createHash } from "node:crypto";
import {
  normalizeTrack1CloudModelConfig,
  Track1EnvironmentError
} from "./environment.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_VERSION
} from "../../shared/types/campaign-ingest.ts";
import type { Track1PluginProbeResult } from "../../integrations/openclaw/src/runtime-probe.ts";

export class Track1PreflightError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1PreflightError";
    this.code = code;
  }
}

export interface Track1PreflightPorts {
  inspectDocker(): Promise<{ compose_v2: boolean }>;
  inspectOpenClaw(): Promise<{ version: string; integrity: string }>;
  probePlugin(): Promise<Track1PluginProbeResult>;
  checkBackend(): Promise<{ public_ready: boolean; internal_ready: boolean }>;
  loadManifest(): Promise<Uint8Array>;
}

export interface Track1PreflightResult {
  schema_version: "track1-preflight.v1";
  compose_v2: true;
  openclaw_version: typeof TRACK1_OPENCLAW_VERSION;
  openclaw_package_integrity: string;
  model_ref: string;
  plugin_probe: Track1PluginProbeResult;
  backend_public_ready: true;
  backend_internal_ready: true;
  campaign_manifest_sha256: string;
}

function fail(): never {
  throw new Track1PreflightError("track1_preflight_failed");
}

export async function runTrack1Preflight(
  environment: Readonly<Record<string, string | undefined>>,
  ports: Track1PreflightPorts
): Promise<Track1PreflightResult> {
  let config;
  try {
    config = normalizeTrack1CloudModelConfig(environment);
  } catch (error) {
    if (error instanceof Track1EnvironmentError) fail();
    throw error;
  }

  const docker = await ports.inspectDocker();
  if (docker.compose_v2 !== true) fail();

  const openclaw = await ports.inspectOpenClaw();
  if (openclaw.version !== TRACK1_OPENCLAW_VERSION) fail();
  if (typeof openclaw.integrity !== "string" || openclaw.integrity.length === 0) {
    fail();
  }

  let pluginProbe: Track1PluginProbeResult;
  try {
    pluginProbe = await ports.probePlugin();
  } catch {
    fail();
  }
  if (!pluginProbe || pluginProbe.plugin_id !== "agent-security-track1") fail();

  const backend = await ports.checkBackend();
  if (backend.public_ready !== true || backend.internal_ready !== true) fail();

  const manifestBytes = await ports.loadManifest();
  if (!(manifestBytes instanceof Uint8Array)) fail();
  const manifestSha256 = createHash("sha256")
    .update(manifestBytes)
    .digest("hex");
  if (manifestSha256 !== TRACK1_CAMPAIGN_MANIFEST_SHA256) fail();

  return Object.freeze({
    schema_version: "track1-preflight.v1",
    compose_v2: true,
    openclaw_version: TRACK1_OPENCLAW_VERSION,
    openclaw_package_integrity: openclaw.integrity,
    model_ref: config.model_id,
    plugin_probe: pluginProbe,
    backend_public_ready: true,
    backend_internal_ready: true,
    campaign_manifest_sha256: manifestSha256
  });
}
