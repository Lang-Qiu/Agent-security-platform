import { createHash } from "node:crypto";

import { isOneOf, isPlainObject, isString } from "../utils/guards.ts";
import { normalizeBaseResult } from "./result.ts";
import { hasExactKeys, isCampaignId } from "./campaign-supervision.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS
} from "../types/campaign-supervision.ts";
import type { BaseResult, SandboxRunResultDetails } from "../types/result.ts";
import {
  TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_START_SCHEMA_VERSION,
  TRACK1_LIFECYCLE_MAX_BYTES,
  TRACK1_OPENCLAW_VERSION,
  TRACK1_SNAPSHOT_MAX_BYTES,
  type Track1CampaignEvidenceRegistration,
  type Track1CampaignFinalizeEnvelope,
  type Track1CampaignSnapshotAck,
  type Track1CampaignSnapshotEnvelope,
  type Track1CampaignSnapshotWithoutHash,
  type Track1CampaignStartEnvelope
} from "../types/campaign-ingest.ts";

export {
  TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_START_SCHEMA_VERSION,
  TRACK1_LIFECYCLE_MAX_BYTES,
  TRACK1_OPENCLAW_VERSION,
  TRACK1_SNAPSHOT_MAX_BYTES
} from "../types/campaign-ingest.ts";

// -- shared validation helpers -------------------------------------------------

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ATTEMPT_ID_PATTERN = /^attempt:t1-sc-(\d{3})-c(\d{3}):([12])$/;
const ISO_8601_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function isSha256Hex(value: unknown): value is string {
  return isString(value) && SHA256_PATTERN.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month === 2) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return day <= (isLeapYear ? 29 : 28);
  }

  return day <= daysInMonth[month - 1];
}

function isStrictIso8601(value: unknown): value is string {
  if (!isString(value)) return false;

  const match = value.match(ISO_8601_PATTERN);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isValidCalendarDate(year, month, day)) return false;
  if (!Number.isFinite(Date.parse(value))) return false;

  const offset = match[7];
  if (offset !== "Z") {
    const hours = Number(offset.substring(1, 3));
    const minutes = Number(offset.substring(4, 6));
    if (hours > 14) return false;
    if (hours === 14 && minutes > 0) return false;
  }

  return true;
}

function isAttemptId(value: unknown): value is string {
  if (!isString(value)) return false;
  const match = value.match(ATTEMPT_ID_PATTERN);
  if (!match) return false;
  const caseId = `T1-SC-${match[1]}-C${match[2]}`;
  return (TRACK1_CASE_IDS as readonly string[]).includes(caseId);
}

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function extractCampaignHex(campaignId: string): string | null {
  const match = campaignId.match(/^campaign:t1:([0-9a-f]{32})$/);
  return match ? match[1] : null;
}

// -- canonical JSON and snapshot hashing ----------------------------------------

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("non-finite number encountered during canonicalization");
    }
    return value;
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      const child = value[key];
      if (child === undefined) {
        throw new Error("undefined value encountered during canonicalization");
      }
      result[key] = canonicalize(child);
    }
    return result;
  }
  throw new Error("non-JSON value encountered during canonicalization");
}

function stableCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function calculateTrack1SnapshotSha256(
  input: Track1CampaignSnapshotWithoutHash
): string {
  return createHash("sha256")
    .update(`${stableCanonicalJson(input)}\n`, "utf8")
    .digest("hex");
}

function withinByteLimit(value: unknown, limit: number): boolean {
  try {
    const json = stableCanonicalJson(value);
    return utf8ByteLength(json) <= limit;
  } catch {
    return false;
  }
}

// -- envelope key lists --------------------------------------------------------

const START_KEYS = [
  "schema_version",
  "campaign_id",
  "campaign_manifest_sha256",
  "openclaw_version",
  "openclaw_package_integrity",
  "model_ref",
  "started_at"
] as const;

const SNAPSHOT_KEYS = [
  "schema_version",
  "campaign_id",
  "campaign_manifest_sha256",
  "agent_id",
  "scenario_id",
  "case_id",
  "attempt_id",
  "attempt_index",
  "sequence",
  "previous_snapshot_sha256",
  "observed_at",
  "result",
  "snapshot_sha256"
] as const;

const ACK_KEYS = [
  "schema_version",
  "campaign_id",
  "attempt_id",
  "sequence",
  "snapshot_sha256",
  "accepted_at"
] as const;

const FINALIZE_KEYS = [
  "schema_version",
  "campaign_id",
  "requested_status",
  "completed_at"
] as const;

const EVIDENCE_REGISTRATION_KEYS = [
  "schema_version",
  "campaign_id",
  "artifact_manifest_sha256",
  "artifact_manifest_ref",
  "registered_at"
] as const;

// -- normalizers ---------------------------------------------------------------

export function normalizeTrack1CampaignStartEnvelope(
  input: unknown
): Track1CampaignStartEnvelope | null {
  if (!isPlainObject(input) || !hasExactKeys(input, START_KEYS)) return null;

  if (input.schema_version !== TRACK1_CAMPAIGN_START_SCHEMA_VERSION) return null;
  if (!isCampaignId(input.campaign_id)) return null;
  if (!isSha256Hex(input.campaign_manifest_sha256)) return null;
  if (input.openclaw_version !== TRACK1_OPENCLAW_VERSION) return null;
  if (!isSha256Hex(input.openclaw_package_integrity)) return null;
  if (!isNonEmptyString(input.model_ref)) return null;
  if (!isStrictIso8601(input.started_at)) return null;

  if (!withinByteLimit(input, TRACK1_LIFECYCLE_MAX_BYTES)) return null;

  return {
    schema_version: TRACK1_CAMPAIGN_START_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    campaign_manifest_sha256: input.campaign_manifest_sha256,
    openclaw_version: TRACK1_OPENCLAW_VERSION,
    openclaw_package_integrity: input.openclaw_package_integrity,
    model_ref: input.model_ref,
    started_at: input.started_at
  };
}

export function normalizeTrack1CampaignSnapshotEnvelope(
  input: unknown
): Track1CampaignSnapshotEnvelope | null {
  if (!isPlainObject(input) || !hasExactKeys(input, SNAPSHOT_KEYS)) return null;

  if (input.schema_version !== TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION) return null;
  if (!isCampaignId(input.campaign_id)) return null;
  if (!isSha256Hex(input.campaign_manifest_sha256)) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_AGENT_IDS, input.agent_id)) return null;
  if (!isOneOf(TRACK1_SCENARIO_IDS, input.scenario_id)) return null;
  if (!isOneOf(TRACK1_CASE_IDS, input.case_id)) return null;
  if (input.attempt_index !== 1 && input.attempt_index !== 2) return null;
  if (!isAttemptId(input.attempt_id)) return null;
  if (!isPositiveInteger(input.sequence)) return null;
  if (
    input.previous_snapshot_sha256 !== null &&
    !isSha256Hex(input.previous_snapshot_sha256)
  ) {
    return null;
  }
  if (!isStrictIso8601(input.observed_at)) return null;

  // Correlation: attempt_id must match case_id (lowercased) and attempt_index.
  const expectedAttemptId = `attempt:${input.case_id.toLowerCase()}:${input.attempt_index}`;
  if (input.attempt_id !== expectedAttemptId) return null;

  // Byte limit is enforced before the expensive result normalization so that
  // oversize payloads are rejected without re-normalizing the nested result.
  if (!withinByteLimit(input, TRACK1_SNAPSHOT_MAX_BYTES)) return null;

  const normalizedResult = normalizeBaseResult(input.result);
  if (!normalizedResult) return null;

  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    schema_version: TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    campaign_manifest_sha256: input.campaign_manifest_sha256,
    agent_id: input.agent_id,
    scenario_id: input.scenario_id,
    case_id: input.case_id,
    attempt_id: input.attempt_id,
    attempt_index: input.attempt_index,
    sequence: input.sequence,
    previous_snapshot_sha256: input.previous_snapshot_sha256,
    observed_at: input.observed_at,
    result: normalizedResult as BaseResult<SandboxRunResultDetails>
  };

  const recomputedHash = calculateTrack1SnapshotSha256(withoutHash);
  if (recomputedHash !== input.snapshot_sha256) return null;

  return {
    ...withoutHash,
    snapshot_sha256: recomputedHash
  };
}

export function normalizeTrack1CampaignSnapshotAck(
  input: unknown
): Track1CampaignSnapshotAck | null {
  if (!isPlainObject(input) || !hasExactKeys(input, ACK_KEYS)) return null;

  if (input.schema_version !== TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION) return null;
  if (!isCampaignId(input.campaign_id)) return null;
  if (!isAttemptId(input.attempt_id)) return null;
  if (!isPositiveInteger(input.sequence)) return null;
  if (!isSha256Hex(input.snapshot_sha256)) return null;
  if (!isStrictIso8601(input.accepted_at)) return null;

  if (!withinByteLimit(input, TRACK1_LIFECYCLE_MAX_BYTES)) return null;

  return {
    schema_version: TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    attempt_id: input.attempt_id,
    sequence: input.sequence,
    snapshot_sha256: input.snapshot_sha256,
    accepted_at: input.accepted_at
  };
}

export function normalizeTrack1CampaignFinalizeEnvelope(
  input: unknown
): Track1CampaignFinalizeEnvelope | null {
  if (!isPlainObject(input) || !hasExactKeys(input, FINALIZE_KEYS)) return null;

  if (input.schema_version !== TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION) return null;
  if (!isCampaignId(input.campaign_id)) return null;
  if (input.requested_status !== "completed" && input.requested_status !== "failed") {
    return null;
  }
  if (!isStrictIso8601(input.completed_at)) return null;

  if (!withinByteLimit(input, TRACK1_LIFECYCLE_MAX_BYTES)) return null;

  return {
    schema_version: TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    requested_status: input.requested_status,
    completed_at: input.completed_at
  };
}

export function normalizeTrack1CampaignEvidenceRegistration(
  input: unknown
): Track1CampaignEvidenceRegistration | null {
  if (!isPlainObject(input) || !hasExactKeys(input, EVIDENCE_REGISTRATION_KEYS)) {
    return null;
  }

  if (
    input.schema_version !== TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION
  ) {
    return null;
  }
  if (!isCampaignId(input.campaign_id)) return null;
  if (!isSha256Hex(input.artifact_manifest_sha256)) return null;
  if (!isNonEmptyString(input.artifact_manifest_ref)) return null;
  if (!isStrictIso8601(input.registered_at)) return null;

  // Correlation: artifact_manifest_ref must match the campaign hex.
  const campaignHex = extractCampaignHex(input.campaign_id);
  if (!campaignHex) return null;
  const expectedRef = `artifact://track1/campaign/${campaignHex}/manifest`;
  if (input.artifact_manifest_ref !== expectedRef) return null;

  if (!withinByteLimit(input, TRACK1_LIFECYCLE_MAX_BYTES)) return null;

  return {
    schema_version: TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    artifact_manifest_sha256: input.artifact_manifest_sha256,
    artifact_manifest_ref: input.artifact_manifest_ref,
    registered_at: input.registered_at
  };
}
