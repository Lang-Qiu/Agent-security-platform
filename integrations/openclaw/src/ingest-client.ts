import {
  normalizeTrack1CampaignSnapshotAck
} from "../../../shared/contracts/campaign-ingest.ts";
import type {
  Track1CampaignSnapshotAck,
  Track1CampaignSnapshotEnvelope
} from "../../../shared/types/campaign-ingest.ts";

// -- error -----------------------------------------------------------------

export class Track1IngestError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1IngestError";
    this.code = code;
  }
}

// -- transport interface ---------------------------------------------------

export interface Track1IngestTransport {
  request(
    method: "PUT",
    url: URL,
    headers: Readonly<Record<string, string>>,
    body: string,
    signal: AbortSignal
  ): Promise<{ status: number; body: string }>;
}

// -- config ---------------------------------------------------------------

interface Track1IngestConfig {
  ingestEndpoint: string;
  ingestToken: string;
}

const FIXED_TIMEOUT_MS = 5000;
const FIXED_HOST = "backend";
const FIXED_PORT = 3001;
const FIXED_PROTOCOL = "http:";
const FIXED_BASE_PATH = "/internal/track1/campaigns";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeConfig(value: unknown): Track1IngestConfig {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.ingestEndpoint) ||
    !isNonEmptyString(value.ingestToken) ||
    value.ingestToken.trim().length === 0
  ) {
    throw new Track1IngestError("track1_ingest_failed");
  }

  let url: URL;
  try {
    url = new URL(value.ingestEndpoint);
  } catch {
    throw new Track1IngestError("track1_ingest_failed");
  }

  if (
    url.protocol !== FIXED_PROTOCOL ||
    url.hostname !== FIXED_HOST ||
    Number(url.port) !== FIXED_PORT ||
    url.pathname !== FIXED_BASE_PATH ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Track1IngestError("track1_ingest_failed");
  }

  return {
    ingestEndpoint: value.ingestEndpoint,
    ingestToken: value.ingestToken
  };
}

// -- native fetch transport ------------------------------------------------

class NativeFetchTransport implements Track1IngestTransport {
  async request(
    method: "PUT",
    url: URL,
    headers: Readonly<Record<string, string>>,
    body: string,
    signal: AbortSignal
  ): Promise<{ status: number; body: string }> {
    const response = await fetch(url.href, {
      method,
      headers,
      body,
      signal
    });
    const text = await response.text();
    return { status: response.status, body: text };
  }
}

// -- client ----------------------------------------------------------------

export class Track1IngestClient {
  readonly #config: Track1IngestConfig;
  readonly #transport: Track1IngestTransport;

  constructor(config: unknown, transport?: Track1IngestTransport) {
    this.#config = normalizeConfig(config);
    this.#transport = transport ?? new NativeFetchTransport();
  }

  async appendSnapshot(
    envelope: unknown
  ): Promise<Track1CampaignSnapshotAck> {
    // Validate the envelope via the shared normalizer to extract safe fields
    if (!isPlainObject(envelope)) {
      throw new Track1IngestError("track1_ingest_failed");
    }

    const campaignId = envelope.campaign_id;
    const sequence = envelope.sequence;
    const attemptId = envelope.attempt_id;
    const snapshotSha256 = envelope.snapshot_sha256;

    if (
      !isNonEmptyString(campaignId) ||
      typeof sequence !== "number" ||
      !isNonEmptyString(attemptId) ||
      !isNonEmptyString(snapshotSha256)
    ) {
      throw new Track1IngestError("track1_ingest_failed");
    }

    // Build the target URL: fixed origin + /{campaign_id}/snapshots/{sequence}
    const url = new URL(
      `${this.#config.ingestEndpoint}/${encodeURIComponent(campaignId)}/snapshots/${sequence}`
    );

    const headers: Readonly<Record<string, string>> = Object.freeze({
      authorization: `Bearer ${this.#config.ingestToken}`,
      "content-type": "application/json"
    });

    // Serialize the envelope without leaking the token
    const body = JSON.stringify(envelope);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      FIXED_TIMEOUT_MS
    );

    let response: { status: number; body: string };
    try {
      response = await this.#transport.request(
        "PUT",
        url,
        headers,
        body,
        controller.signal
      );
    } catch {
      throw new Track1IngestError("track1_ingest_failed");
    } finally {
      clearTimeout(timeoutId);
    }

    // Accept only 200 and 202
    if (response.status !== 200 && response.status !== 202) {
      throw new Track1IngestError("track1_ingest_failed");
    }

    // Parse and validate the ack
    let parsedAck: unknown;
    try {
      parsedAck = JSON.parse(response.body);
    } catch {
      throw new Track1IngestError("track1_ingest_failed");
    }

    const ack = normalizeTrack1CampaignSnapshotAck(parsedAck);
    if (!ack) {
      throw new Track1IngestError("track1_ingest_failed");
    }

    // Correlation checks: ack must match the envelope
    if (
      ack.campaign_id !== campaignId ||
      ack.attempt_id !== attemptId ||
      ack.sequence !== sequence ||
      ack.snapshot_sha256 !== snapshotSha256
    ) {
      throw new Track1IngestError("track1_ingest_failed");
    }

    return ack;
  }
}
