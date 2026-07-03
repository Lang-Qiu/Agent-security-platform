// P4-T1: strict, side-effect-free normalizer for the Track 1 cloud model and
// ingest environment. Never reads process.env directly — the caller supplies
// a snapshot so tests stay deterministic and production code has one seam.

const MODEL_ID_PATTERN = /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/;
const MIN_INGEST_TOKEN_BYTES = 32;

export interface Track1CloudModelConfig {
  base_url: string;
  model_id: string;
  api_key: string;
  ingest_token: string;
}

export class Track1EnvironmentError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1EnvironmentError";
    this.code = code;
  }
}

function fail(): never {
  throw new Track1EnvironmentError("track1_environment_invalid");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateBaseUrl(value: string): string {
  if (/\s/.test(value)) fail();
  // Reject dot-segment traversal before parsing: URL parsing resolves
  // "/../" segments, which would otherwise hide traversal in the raw input.
  if (value.includes("..")) fail();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail();
  }

  if (url.protocol !== "https:") fail();
  if (url.username !== "" || url.password !== "") fail();
  if (url.search !== "") fail();
  if (url.hash !== "") fail();
  if (url.port !== "") fail();
  if (url.pathname.split("/").includes("..")) fail();

  return value;
}

function validateModelId(value: string): string {
  if (!MODEL_ID_PATTERN.test(value)) fail();
  return value;
}

function validateApiKey(value: string): string {
  if (!isNonEmptyString(value)) fail();
  return value;
}

function validateIngestToken(value: string): string {
  if (!isNonEmptyString(value)) fail();
  if (Buffer.byteLength(value, "utf8") < MIN_INGEST_TOKEN_BYTES) fail();
  return value;
}

export function normalizeTrack1CloudModelConfig(
  environment: Readonly<Record<string, string | undefined>>
): Track1CloudModelConfig {
  if (environment === null || typeof environment !== "object") fail();

  const baseUrl = environment.OPENCLAW_MODEL_BASE_URL;
  const modelId = environment.OPENCLAW_MODEL_ID;
  const apiKey = environment.OPENCLAW_MODEL_API_KEY;
  const ingestToken = environment.TRACK1_INGEST_TOKEN;

  if (!isNonEmptyString(baseUrl)) fail();
  if (!isNonEmptyString(modelId)) fail();
  if (!isNonEmptyString(apiKey)) fail();
  if (!isNonEmptyString(ingestToken)) fail();

  return Object.freeze({
    base_url: validateBaseUrl(baseUrl),
    model_id: validateModelId(modelId),
    api_key: validateApiKey(apiKey),
    ingest_token: validateIngestToken(ingestToken)
  });
}
