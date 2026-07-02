export const TRACK1_CAMPAIGN_START_SCHEMA_VERSION = "track1-campaign-start.v1";
export const TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION = "track1-campaign-snapshot.v1";
export const TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION = "track1-campaign-snapshot-ack.v1";
export const TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION = "track1-campaign-finalize.v1";
export const TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION = "track1-campaign-evidence-registration.v1";
export const TRACK1_OPENCLAW_VERSION = "2026.6.10";
export const TRACK1_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const TRACK1_LIFECYCLE_MAX_BYTES = 256 * 1024;
// P2-4: pinned package integrity and canonical model_ref as public contract
// constants. Exported so fixtures and Phase 4 callers reference a single
// source of truth instead of duplicating hardcoded strings.
export const TRACK1_OPENCLAW_PACKAGE_INTEGRITY = "sha512-LcooND2tBQw8A+kc1Ujltu3lg30bJ0w7XaeRy7eYzobb8BBdcW6DOGbwJL4vpj1vl9+gjRceOtlh5nh9OARcug==";
export const TRACK1_MODEL_REF_CANONICAL = "model://track1/openclaw-demo";
// R2 (Phase 2 rework finding 5): the campaign manifest hash is pinned to the
// SHA-256 of samples/track1/openclaw/campaign.v1.json. The start envelope
// normalizer rejects any other 64-hex value so that arbitrary manifests
// cannot be ingested as a Track 1 campaign. The hash is a public contract
// constant: fixtures, the ingest service, and the gate test all reference
// this single source of truth.
export const TRACK1_CAMPAIGN_MANIFEST_SHA256 = "3fb7887447cc0d8814a52932ad0ad26abbd7a46b372ef4d629426ead205a1408";
