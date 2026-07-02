import { normalizeTrack1CampaignSnapshotAck, normalizeTrack1CampaignSnapshotEnvelope } from "../../../shared/contracts/campaign-ingest.js";
// -- error -----------------------------------------------------------------
export class Track1IngestError extends Error {
    code;
    constructor(code) {
        super(code);
        this.name = "Track1IngestError";
        this.code = code;
    }
}
const FIXED_TIMEOUT_MS = 5000;
const FIXED_HOST = "backend";
const FIXED_PORT = 3001;
const FIXED_PROTOCOL = "http:";
const FIXED_BASE_PATH = "/internal/track1/campaigns";
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function normalizeConfig(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.ingestEndpoint) ||
        !isNonEmptyString(value.ingestToken) ||
        value.ingestToken.trim().length === 0) {
        throw new Track1IngestError("track1_ingest_failed");
    }
    let url;
    try {
        url = new URL(value.ingestEndpoint);
    }
    catch {
        throw new Track1IngestError("track1_ingest_failed");
    }
    if (url.protocol !== FIXED_PROTOCOL ||
        url.hostname !== FIXED_HOST ||
        Number(url.port) !== FIXED_PORT ||
        url.pathname !== FIXED_BASE_PATH ||
        url.search !== "" ||
        url.hash !== "") {
        throw new Track1IngestError("track1_ingest_failed");
    }
    return {
        ingestEndpoint: value.ingestEndpoint,
        ingestToken: value.ingestToken
    };
}
// -- native fetch transport ------------------------------------------------
class NativeFetchTransport {
    async request(method, url, headers, body, signal) {
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
    #config;
    #transport;
    constructor(config, transport) {
        this.#config = normalizeConfig(config);
        this.#transport = transport ?? new NativeFetchTransport();
    }
    async appendSnapshot(envelope) {
        // P1-Fix4: validate the envelope via the shared normalizer before sending.
        // This ensures structural correctness (closed-set IDs, hashes, manifest)
        // is enforced identically at ingest and projector boundaries.
        const normalized = normalizeTrack1CampaignSnapshotEnvelope(envelope);
        if (!normalized) {
            throw new Track1IngestError("track1_ingest_failed");
        }
        const campaignId = normalized.campaign_id;
        const sequence = normalized.sequence;
        const attemptId = normalized.attempt_id;
        const snapshotSha256 = normalized.snapshot_sha256;
        // P1-Fix3: POST to .../{campaign_id}/snapshots (no sequence in URL).
        // The backend assigns sequence authority; the client must not encode it
        // into the resource path.
        const url = new URL(`${this.#config.ingestEndpoint}/${encodeURIComponent(campaignId)}/snapshots`);
        const headers = Object.freeze({
            authorization: `Bearer ${this.#config.ingestToken}`,
            "content-type": "application/json"
        });
        // Serialize the normalized envelope without leaking the token
        const body = JSON.stringify(normalized);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FIXED_TIMEOUT_MS);
        let response;
        try {
            response = await this.#transport.request("POST", url, headers, body, controller.signal);
        }
        catch {
            throw new Track1IngestError("track1_ingest_failed");
        }
        finally {
            clearTimeout(timeoutId);
        }
        // Accept only 200 and 202
        if (response.status !== 200 && response.status !== 202) {
            throw new Track1IngestError("track1_ingest_failed");
        }
        // Parse and validate the ack
        let parsedAck;
        try {
            parsedAck = JSON.parse(response.body);
        }
        catch {
            throw new Track1IngestError("track1_ingest_failed");
        }
        const ack = normalizeTrack1CampaignSnapshotAck(parsedAck);
        if (!ack) {
            throw new Track1IngestError("track1_ingest_failed");
        }
        // Correlation checks: ack must match the envelope
        if (ack.campaign_id !== campaignId ||
            ack.attempt_id !== attemptId ||
            ack.sequence !== sequence ||
            ack.snapshot_sha256 !== snapshotSha256) {
            throw new Track1IngestError("track1_ingest_failed");
        }
        return ack;
    }
}
