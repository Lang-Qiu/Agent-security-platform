// P4-T1: strict closed-set validation for the Track 1 cloud model
// configuration. No process.env access here — the entrypoint supplies a
// snapshot so normalizers stay pure and testable.

export interface Track1CloudModelConfig {
  base_url: string;
  model_id: string;
  api_key: string;
  ingest_token: string;
}

const REQUIRED_KEYS = [
  "OPENCLAW_MODEL_BASE_URL",
  "OPENCLAW_MODEL_API_KEY",
  "OPENCLAW_MODEL_ID",
  "TRACK1_INGEST_TOKEN"
] as const;

const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const MIN_INGEST_TOKEN_BYTES = 32;

class Track1EnvironmentError extends Error {
  constructor() {
    super("track1_environment_invalid");
    this.name = "Track1EnvironmentError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateBaseUrl(rawBaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Track1EnvironmentError();
  }

  if (parsed.protocol !== "https:") {
    throw new Track1EnvironmentError();
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Track1EnvironmentError();
  }
  if (parsed.search !== "") {
    throw new Track1EnvironmentError();
  }
  if (parsed.hash !== "") {
    throw new Track1EnvironmentError();
  }
  if (rawBaseUrl !== rawBaseUrl.trim()) {
    throw new Track1EnvironmentError();
  }
  if (rawBaseUrl.includes("..")) {
    throw new Track1EnvironmentError();
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new Track1EnvironmentError();
  }

  return rawBaseUrl;
}

function validateModelId(rawModelId: string): string {
  if (!MODEL_ID_PATTERN.test(rawModelId)) {
    throw new Track1EnvironmentError();
  }
  return rawModelId;
}

function validateApiKey(rawApiKey: string): string {
  if (!isNonEmptyString(rawApiKey)) {
    throw new Track1EnvironmentError();
  }
  return rawApiKey;
}

function validateIngestToken(rawToken: string): string {
  if (!isNonEmptyString(rawToken)) {
    throw new Track1EnvironmentError();
  }
  if (Buffer.byteLength(rawToken, "utf8") < MIN_INGEST_TOKEN_BYTES) {
    throw new Track1EnvironmentError();
  }
  return rawToken;
}

export function normalizeTrack1CloudModelConfig(
  environment: Readonly<Record<string, string | undefined>>
): Track1CloudModelConfig {
  for (const key of REQUIRED_KEYS) {
    if (!isNonEmptyString(environment[key])) {
      throw new Track1EnvironmentError();
    }
  }

  const base_url = validateBaseUrl(environment.OPENCLAW_MODEL_BASE_URL as string);
  const model_id = validateModelId(environment.OPENCLAW_MODEL_ID as string);
  const api_key = validateApiKey(environment.OPENCLAW_MODEL_API_KEY as string);
  const ingest_token = validateIngestToken(environment.TRACK1_INGEST_TOKEN as string);

  return Object.freeze({ base_url, model_id, api_key, ingest_token });
}
