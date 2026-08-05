import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";

import type {
  SandboxSecurityAuditCursorFields,
  SandboxSecurityHmacService,
  SandboxSecurityProductionMode
} from "./sandbox-security.types.ts";

const FRAME_PREFIX = "sandbox-security-hmac-frame.v1";
const PRODUCTION_COMPOSITION = "sandbox-security-production-composition.v1";
const DEPLOYMENT_KEY_DOMAIN = "sandbox-security-deployment-key-id.v1";
const AUTHORIZATION_SCOPE_DOMAIN = "sandbox-security-authorization-scope.v1";
const IDEMPOTENCY_KEY_DOMAIN = "sandbox-security-idempotency-key.v1";
const CANONICAL_FINGERPRINT_DOMAIN = "sandbox-security-canonical-fingerprint.v1";
const AUDIT_CURSOR_PAYLOAD_DOMAIN = "sandbox-security-audit-cursor-payload.v1";
const AUDIT_CURSOR_DOMAIN = "sandbox-security-audit-cursor.v1";
const CURSOR_PREFIX = "sbxcur_v1.";
const CAPABILITY_PREFIX = "sbxcap_v1.";
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const AUTHORIZATION_SCOPE_PATTERN = /^authscope:hmac-sha256:[0-9a-f]{64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const EVENT_ID_PATTERN =
  /^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UTC_MILLISECOND_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const CURSOR_PATTERN = /^sbxcur_v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

type Frame = Readonly<{
  domain: string;
  fields: readonly Uint8Array[];
}>;

function copyBytes(value: Uint8Array, label: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
  return new Uint8Array(value);
}

function asciiBytes(value: string, label: string): Uint8Array {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be ASCII`);
  }
  const bytes = Buffer.allocUnsafe(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) {
      throw new TypeError(`${label} must be ASCII`);
    }
    bytes[index] = code;
  }
  return bytes;
}

function hmacSha256(key: Uint8Array, input: Uint8Array): Uint8Array {
  return new Uint8Array(
    createHmac("sha256", Buffer.from(key)).update(Buffer.from(input)).digest()
  );
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decodeCanonicalBase64Url(value: string): Uint8Array | null {
  if (
    value.length === 0 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length === 0 || decoded.toString("base64url") !== value) {
      return null;
    }
    return new Uint8Array(decoded);
  } catch {
    return null;
  }
}

/**
 * The sole implementation of the backend's domain-separated binary frame.
 * Textual domains are ASCII and all lengths are encoded big-endian.
 */
function hmacFrame(domain: string, fields: readonly Uint8Array[]): Uint8Array {
  const prefix = asciiBytes(FRAME_PREFIX, "frame prefix");
  const domainBytes = asciiBytes(domain, "HMAC domain");
  if (domainBytes.byteLength > 0xffff) {
    throw new RangeError("HMAC domain is too long");
  }
  if (fields.length > 0xff) {
    throw new RangeError("HMAC frame has too many fields");
  }

  const chunks: Uint8Array[] = [
    prefix,
    Uint8Array.of(0),
    Uint8Array.of((domainBytes.byteLength >>> 8) & 0xff, domainBytes.byteLength & 0xff),
    domainBytes,
    Uint8Array.of(fields.length)
  ];
  for (const field of fields) {
    const copied = copyBytes(field, "HMAC field");
    if (copied.byteLength > 0xffffffff) {
      throw new RangeError("HMAC field is too long");
    }
    chunks.push(
      Uint8Array.of(
        (copied.byteLength >>> 24) & 0xff,
        (copied.byteLength >>> 16) & 0xff,
        (copied.byteLength >>> 8) & 0xff,
        copied.byteLength & 0xff
      ),
      copied
    );
  }
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function parseHmacFrame(
  value: Uint8Array,
  expectedDomain: string,
  expectedFieldCount: number
): Frame | null {
  const bytes = copyBytes(value, "HMAC frame");
  const prefix = asciiBytes(FRAME_PREFIX, "frame prefix");
  let offset = 0;
  if (bytes.byteLength < prefix.byteLength + 1 + 2 + 1) return null;
  if (Buffer.compare(Buffer.from(bytes.subarray(0, prefix.byteLength)), Buffer.from(prefix)) !== 0) {
    return null;
  }
  offset += prefix.byteLength;
  if (bytes[offset++] !== 0) return null;
  if (offset + 2 > bytes.byteLength) return null;
  const domainLength = (bytes[offset] << 8) | bytes[offset + 1];
  offset += 2;
  if (offset + domainLength + 1 > bytes.byteLength) return null;
  const domainBytes = bytes.subarray(offset, offset + domainLength);
  offset += domainLength;
  if (domainBytes.some((byte) => byte > 0x7f)) return null;
  const domain = Buffer.from(domainBytes).toString("ascii");
  if (domain !== expectedDomain) return null;
  const fieldCount = bytes[offset++];
  if (fieldCount !== expectedFieldCount) return null;

  const fields: Uint8Array[] = [];
  for (let index = 0; index < fieldCount; index += 1) {
    if (offset + 4 > bytes.byteLength) return null;
    const fieldLength =
      bytes[offset] * 0x1000000 +
      bytes[offset + 1] * 0x10000 +
      bytes[offset + 2] * 0x100 +
      bytes[offset + 3];
    offset += 4;
    if (fieldLength > bytes.byteLength - offset) return null;
    fields.push(new Uint8Array(bytes.slice(offset, offset + fieldLength)));
    offset += fieldLength;
  }
  if (offset !== bytes.byteLength) return null;
  return { domain, fields };
}

function stringFromAsciiBytes(value: Uint8Array): string | null {
  if (value.some((byte) => byte > 0x7f)) return null;
  return Buffer.from(value).toString("ascii");
}

function isStrictUtcMillisecondTimestamp(value: string): boolean {
  const match = UTC_MILLISECOND_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59 || month < 1 || month > 12) {
    return false;
  }
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = month === 2 && leap ? 29 : daysInMonth[month - 1];
  if (day < 1 || day > maxDay) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validateCursorFields(input: Readonly<SandboxSecurityAuditCursorFields>): void {
  if (
    typeof input.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(input.subject_id) ||
    typeof input.authorization_scope_id !== "string" ||
    !AUTHORIZATION_SCOPE_PATTERN.test(input.authorization_scope_id) ||
    typeof input.occurred_at !== "string" ||
    !isStrictUtcMillisecondTimestamp(input.occurred_at) ||
    typeof input.event_id !== "string" ||
    !EVENT_ID_PATTERN.test(input.event_id)
  ) {
    throw new TypeError("Invalid sandbox security audit cursor fields");
  }
  asciiBytes(input.subject_id, "cursor subject");
  asciiBytes(input.authorization_scope_id, "cursor authorization scope");
  asciiBytes(input.occurred_at, "cursor timestamp");
  asciiBytes(input.event_id, "cursor event ID");
}

function decodeCursorFields(
  payload: Uint8Array,
  expected: Readonly<{ subject_id: string; authorization_scope_id: string }>
): Readonly<SandboxSecurityAuditCursorFields> | null {
  const parsed = parseHmacFrame(payload, AUDIT_CURSOR_PAYLOAD_DOMAIN, 4);
  if (parsed === null) return null;
  const values = parsed.fields.map(stringFromAsciiBytes);
  if (values.some((value) => value === null)) return null;
  const [subjectId, authorizationScopeId, occurredAt, eventId] = values as [
    string,
    string,
    string,
    string
  ];
  const fields = {
    subject_id: subjectId,
    authorization_scope_id: authorizationScopeId,
    occurred_at: occurredAt,
    event_id: eventId
  } satisfies SandboxSecurityAuditCursorFields;
  try {
    validateCursorFields(fields);
  } catch {
    return null;
  }
  if (
    fields.subject_id !== expected.subject_id ||
    fields.authorization_scope_id !== expected.authorization_scope_id
  ) {
    return null;
  }
  return fields;
}

export function createSandboxSecurityHmacService(
  deploymentKey: Uint8Array
): SandboxSecurityHmacService {
  const key = copyBytes(deploymentKey, "deployment key");
  if (key.byteLength !== 32) {
    throw new RangeError("Deployment key must be exactly 32 bytes");
  }

  const service: SandboxSecurityHmacService = {
    deploymentKeyId(): string {
      const digest = hmacSha256(key, hmacFrame(DEPLOYMENT_KEY_DOMAIN, []));
      return `deployment-key:hmac-sha256:${Buffer.from(digest).toString("hex")}`;
    },

    authorizationScopeId(
      scopeSeed: Uint8Array,
      productionMode: SandboxSecurityProductionMode
    ): string {
      const scope = copyBytes(scopeSeed, "scope seed");
      if (scope.byteLength !== 32) {
        throw new RangeError("Scope seed must be exactly 32 bytes");
      }
      if (!["rule_only", "local", "local_and_judge"].includes(productionMode)) {
        throw new TypeError("Invalid production mode");
      }
      const digest = hmacSha256(
        key,
        hmacFrame(AUTHORIZATION_SCOPE_DOMAIN, [
          scope,
          asciiBytes(PRODUCTION_COMPOSITION, "production composition"),
          asciiBytes(productionMode, "production mode")
        ])
      );
      return `authscope:hmac-sha256:${Buffer.from(digest).toString("hex")}`;
    },

    idempotencyKeyHmac(idempotencyKey: string): `idem-key:hmac-sha256:${string}` {
      if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        throw new TypeError("Invalid ASCII idempotency key");
      }
      const digest = hmacSha256(
        key,
        hmacFrame(IDEMPOTENCY_KEY_DOMAIN, [asciiBytes(idempotencyKey, "idempotency key")])
      );
      return `idem-key:hmac-sha256:${Buffer.from(digest).toString("hex")}`;
    },

    fingerprintCanonicalBytes(canonicalBytes: Uint8Array): `hmac-sha256:${string}` {
      const digest = hmacSha256(
        key,
        hmacFrame(CANONICAL_FINGERPRINT_DOMAIN, [copyBytes(canonicalBytes, "canonical bytes")])
      );
      return `hmac-sha256:${Buffer.from(digest).toString("hex")}`;
    },

    encodeAuditCursor(input: Readonly<SandboxSecurityAuditCursorFields>): string {
      validateCursorFields(input);
      const payload = hmacFrame(AUDIT_CURSOR_PAYLOAD_DOMAIN, [
        asciiBytes(input.subject_id, "cursor subject"),
        asciiBytes(input.authorization_scope_id, "cursor authorization scope"),
        asciiBytes(input.occurred_at, "cursor timestamp"),
        asciiBytes(input.event_id, "cursor event ID")
      ]);
      const mac = hmacSha256(key, hmacFrame(AUDIT_CURSOR_DOMAIN, [payload]));
      return `${CURSOR_PREFIX}${encodeBase64Url(payload)}.${encodeBase64Url(mac)}`;
    },

    decodeAuditCursor(
      cursor: string,
      expected: Readonly<{ subject_id: string; authorization_scope_id: string }>
    ): Readonly<SandboxSecurityAuditCursorFields> | null {
      if (typeof cursor !== "string" || cursor.length > 2048) return null;
      const match = CURSOR_PATTERN.exec(cursor);
      if (match === null) return null;
      const payloadSegment = match[1];
      const macSegment = match[2];
      const payload = decodeCanonicalBase64Url(payloadSegment);
      const suppliedMac = decodeCanonicalBase64Url(macSegment);
      if (payload === null || suppliedMac === null || suppliedMac.byteLength !== 32) {
        return null;
      }
      const calculatedMac = hmacSha256(key, hmacFrame(AUDIT_CURSOR_DOMAIN, [payload]));
      if (!timingSafeEqual(Buffer.from(calculatedMac), Buffer.from(suppliedMac))) {
        return null;
      }
      return decodeCursorFields(payload, expected);
    }
  };
  return Object.freeze(service);
}

export function createSandboxSecurityOpaqueCapability(input: Readonly<{
  random_bytes: (length: number) => Uint8Array;
}>): Readonly<{ bearer_token: string; token_digest: `sha256:${string}` }> {
  if (input === null || typeof input !== "object" || typeof input.random_bytes !== "function") {
    throw new TypeError("random_bytes is required");
  }
  const entropy = copyBytes(input.random_bytes(32), "capability entropy");
  if (entropy.byteLength !== 32) {
    throw new RangeError("Capability entropy must be exactly 32 bytes");
  }
  const bearerToken = `${CAPABILITY_PREFIX}${encodeBase64Url(entropy)}`;
  if (!/^sbxcap_v1\.[A-Za-z0-9_-]{43}$/.test(bearerToken)) {
    throw new Error("Capability token grammar failure");
  }
  const tokenDigest = `sha256:${createHash("sha256").update(bearerToken, "ascii").digest("hex")}` as const;
  return Object.freeze({ bearer_token: bearerToken, token_digest: tokenDigest });
}
