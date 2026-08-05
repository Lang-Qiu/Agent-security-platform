import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import type {
  SandboxSecurityAuditCursorFields,
  SandboxSecurityHmacService
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

const KEY = Uint8Array.from({ length: 32 }, (_, index) => index);
const SCOPE_SEED = Uint8Array.from({ length: 32 }, (_, index) => index + 32);
const CURSOR_FIELDS: SandboxSecurityAuditCursorFields = {
  subject_id: "subject-1",
  authorization_scope_id:
    "authscope:hmac-sha256:35fab58ba1030b8017c1c5e4a1d9e417a40790dcbdae2dfd29cfe8dfcd4c5576",
  occurred_at: "2026-08-05T00:00:00.000Z",
  event_id: "audit:00000000-0000-4000-8000-000000000000"
};
const CURSOR_FIXTURE =
  "sbxcur_v1.c2FuZGJveC1zZWN1cml0eS1obWFjLWZyYW1lLnYxAAAoc2FuZGJveC1zZWN1cml0eS1hdWRpdC1jdXJzb3ItcGF5bG9hZC52MQQAAAAJc3ViamVjdC0xAAAAVmF1dGhzY29wZTpobWFjLXNoYTI1NjozNWZhYjU4YmExMDMwYjgwMTdjMWM1ZTRhMWQ5ZTQxN2E0MDc5MGRjYmRhZTJkZmQyOWNmZThkZmNkNGM1NTc2AAAAGDIwMjYtMDgtMDVUMDA6MDA6MDAuMDAwWgAAACphdWRpdDowMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDA.Wj9H8dTbAMxvo7PKROraABoqjKlUuINNjaK0XGLSpXs";

function getHmacFactory(): (key: Uint8Array) => SandboxSecurityHmacService {
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityHmacService;
  assert.equal(typeof factory, "function");
  return factory as (key: Uint8Array) => SandboxSecurityHmacService;
}

function getOpaqueFactory(): (input: Readonly<{
  random_bytes: (length: number) => Uint8Array;
}>) => Readonly<{ bearer_token: string; token_digest: `sha256:${string}` }> {
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityOpaqueCapability;
  assert.equal(typeof factory, "function");
  return factory as (input: Readonly<{
    random_bytes: (length: number) => Uint8Array;
  }>) => Readonly<{ bearer_token: string; token_digest: `sha256:${string}` }>;
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Independent test-only framing for constructing valid-MAC malformed cursors.
function frame(domain: string, fields: readonly Uint8Array[]): Uint8Array {
  const domainBytes = Buffer.from(domain, "ascii");
  const chunks = [
    Buffer.from("sandbox-security-hmac-frame.v1", "ascii"),
    Buffer.from([0]),
    Buffer.from([(domainBytes.length >>> 8) & 0xff, domainBytes.length & 0xff]),
    domainBytes,
    Buffer.from([fields.length])
  ];
  for (const field of fields) {
    const length = field.byteLength;
    chunks.push(
      Buffer.from([
        (length >>> 24) & 0xff,
        (length >>> 16) & 0xff,
        (length >>> 8) & 0xff,
        length & 0xff
      ]),
      Buffer.from(field));
  }
  return Buffer.concat(chunks);
}

function cursorForPayload(payload: Uint8Array, key = KEY): string {
  const mac = createHmac(
    "sha256",
    Buffer.from(key)
  ).update(frame("sandbox-security-audit-cursor.v1", [payload])).digest();
  return `sbxcur_v1.${encodeBase64Url(payload)}.${encodeBase64Url(mac)}`;
}

function text(value: string): Uint8Array {
  return Buffer.from(value, "utf8");
}

test("REQ-SBX-GENERAL-003 reproduces all independent HMAC vectors", () => {
  const service = getHmacFactory()(KEY);
  assert.equal(
    service.deploymentKeyId(),
    "deployment-key:hmac-sha256:77a1daccca40976ee878c11f4997d2fc892beb7dfce0c784fb220f597643c707"
  );
  assert.equal(
    service.authorizationScopeId(SCOPE_SEED, "rule_only"),
    "authscope:hmac-sha256:35fab58ba1030b8017c1c5e4a1d9e417a40790dcbdae2dfd29cfe8dfcd4c5576"
  );
  assert.equal(
    service.idempotencyKeyHmac("0123456789abcdef"),
    "idem-key:hmac-sha256:5fa0e143c2b27daf6febb5965f3504ec65ea47388a12bca468ce8f3bc0971fab"
  );
  assert.equal(
    service.fingerprintCanonicalBytes(Buffer.from('{"a":1}', "ascii")),
    "hmac-sha256:b2dc6da1345ba6630fdd7aaf1ef1082724b6d1a481ba03016a28286c750dbb11"
  );
});

test("REQ-SBX-GENERAL-003 reproduces the independently published cursor fixture", () => {
  const service = getHmacFactory()(KEY);
  assert.equal(service.encodeAuditCursor(CURSOR_FIELDS), CURSOR_FIXTURE);
  assert.deepEqual(
    service.decodeAuditCursor(CURSOR_FIXTURE, {
      subject_id: CURSOR_FIELDS.subject_id,
      authorization_scope_id: CURSOR_FIELDS.authorization_scope_id
    }),
    CURSOR_FIELDS
  );
});

test("REQ-SBX-GENERAL-003 rejects a cursor with a wrong key or tampered MAC", () => {
  const service = getHmacFactory()(KEY);
  const tampered = `${CURSOR_FIXTURE.slice(0, -1)}${CURSOR_FIXTURE.endsWith("A") ? "B" : "A"}`;
  assert.deepEqual(
    service.decodeAuditCursor(CURSOR_FIXTURE, {
      subject_id: CURSOR_FIELDS.subject_id,
      authorization_scope_id: CURSOR_FIELDS.authorization_scope_id
    }),
    CURSOR_FIELDS
  );
  assert.equal(
    getHmacFactory()(Uint8Array.from(KEY, (value) => value ^ 0xff)).decodeAuditCursor(
      CURSOR_FIXTURE,
      {
        subject_id: CURSOR_FIELDS.subject_id,
        authorization_scope_id: CURSOR_FIELDS.authorization_scope_id
      }
    ),
    null
  );
  assert.equal(
    service.decodeAuditCursor(tampered, {
      subject_id: CURSOR_FIELDS.subject_id,
      authorization_scope_id: CURSOR_FIELDS.authorization_scope_id
    }),
    null
  );
});

test("REQ-SBX-GENERAL-003 rejects padded and non-canonical cursor base64url", () => {
  const service = getHmacFactory()(KEY);
  const [prefix, payload, mac] = CURSOR_FIXTURE.split(".");
  assert.equal(service.decodeAuditCursor(`${prefix}.${payload}=.${mac}`, CURSOR_FIELDS), null);
  assert.equal(service.decodeAuditCursor(`${prefix}.${payload}.${mac}=`, CURSOR_FIELDS), null);
  assert.equal(service.decodeAuditCursor(`${prefix}.${payload.replace("A", "+")}.${mac}`, CURSOR_FIELDS), null);
  assert.equal(service.decodeAuditCursor("sbxcur_v1..", CURSOR_FIELDS), null);
  assert.equal(service.decodeAuditCursor(`${CURSOR_FIXTURE}${"A".repeat(2049)}`, CURSOR_FIELDS), null);
});

test("REQ-SBX-GENERAL-003 rejects cursor field-count and trailing-byte mutations", () => {
  const service = getHmacFactory()(KEY);
  const validPayload = Buffer.from(CURSOR_FIXTURE.split(".")[1], "base64url");
  const wrongFieldCount = Buffer.from(validPayload);
  const fieldCountOffset = Buffer.from("sandbox-security-hmac-frame.v1", "ascii").length + 1 + 2 + Buffer.from("sandbox-security-audit-cursor-payload.v1", "ascii").length;
  wrongFieldCount[fieldCountOffset] = 3;
  assert.equal(service.decodeAuditCursor(cursorForPayload(wrongFieldCount), CURSOR_FIELDS), null);
  const trailing = Buffer.concat([validPayload, Buffer.from([0])]);
  assert.equal(service.decodeAuditCursor(cursorForPayload(trailing), CURSOR_FIELDS), null);
});

test("REQ-SBX-GENERAL-003 rejects non-ASCII and overlength cursor fields", () => {
  const service = getHmacFactory()(KEY);
  const nonAscii = frame("sandbox-security-audit-cursor-payload.v1", [
    text("subject-é"),
    text(CURSOR_FIELDS.authorization_scope_id),
    text(CURSOR_FIELDS.occurred_at),
    text(CURSOR_FIELDS.event_id)
  ]);
  assert.equal(service.decodeAuditCursor(cursorForPayload(nonAscii), CURSOR_FIELDS), null);
  const overlongSubject = `subject-${"a".repeat(65)}`;
  const overlong = frame("sandbox-security-audit-cursor-payload.v1", [
    text(overlongSubject),
    text(CURSOR_FIELDS.authorization_scope_id),
    text(CURSOR_FIELDS.occurred_at),
    text(CURSOR_FIELDS.event_id)
  ]);
  assert.equal(service.decodeAuditCursor(cursorForPayload(overlong), CURSOR_FIELDS), null);
});

test("REQ-SBX-GENERAL-003 rejects wrong cursor subject/scope and invalid timestamp/event ID", () => {
  const service = getHmacFactory()(KEY);
  assert.equal(service.decodeAuditCursor(CURSOR_FIXTURE, { ...CURSOR_FIELDS, subject_id: "subject-2" }), null);
  assert.equal(service.decodeAuditCursor(CURSOR_FIXTURE, { ...CURSOR_FIELDS, authorization_scope_id: "authscope:hmac-sha256:" + "b".repeat(64) }), null);
  for (const fields of [
    { ...CURSOR_FIELDS, occurred_at: "2026-08-05T00:00:00Z" },
    { ...CURSOR_FIELDS, occurred_at: "2026-13-05T00:00:00.000Z" },
    { ...CURSOR_FIELDS, event_id: "audit:not-a-uuid" },
    { ...CURSOR_FIELDS, event_id: "audit:00000000-0000-4000-7000-000000000000" }
  ]) {
    const payload = frame("sandbox-security-audit-cursor-payload.v1", [
      text(fields.subject_id),
      text(fields.authorization_scope_id),
      text(fields.occurred_at),
      text(fields.event_id)
    ]);
    assert.equal(service.decodeAuditCursor(cursorForPayload(payload), CURSOR_FIELDS), null);
  }
});

test("REQ-SBX-GENERAL-003 copies key and input bytes at HMAC service boundaries", () => {
  const mutableKey = Uint8Array.from(KEY);
  const mutableCanonical = Uint8Array.from(Buffer.from('{"a":1}', "ascii"));
  const service = getHmacFactory()(mutableKey);
  const expected = service.fingerprintCanonicalBytes(mutableCanonical);
  mutableKey[0] ^= 0xff;
  mutableCanonical[0] ^= 0xff;
  assert.equal(service.deploymentKeyId(), "deployment-key:hmac-sha256:77a1daccca40976ee878c11f4997d2fc892beb7dfce0c784fb220f597643c707");
  assert.equal(expected, "hmac-sha256:b2dc6da1345ba6630fdd7aaf1ef1082724b6d1a481ba03016a28286c750dbb11");
  assert.throws(() => getHmacFactory()(new Uint8Array(31)), /32/);
  assert.throws(() => service.idempotencyKeyHmac("non-ascii-é"), /ASCII/);
});

test("REQ-SBX-GENERAL-003 issues an opaque token once and retains only its digest", () => {
  let requestedLength = 0;
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
  const result = getOpaqueFactory()({
    random_bytes(length) {
      requestedLength = length;
      return bytes;
    }
  });
  assert.equal(requestedLength, 32);
  assert.match(result.bearer_token, /^sbxcap_v1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(
    result.token_digest,
    `sha256:${createHash("sha256").update(Buffer.from(result.bearer_token)).digest("hex")}`
  );
  assert.deepEqual(Object.keys(result).sort(), ["bearer_token", "token_digest"]);
  assert.equal(result.token_digest.includes(result.bearer_token), false);
});

test("REQ-SBX-GENERAL-003 rejects malformed opaque-token entropy", () => {
  const factory = getOpaqueFactory();
  assert.throws(() => factory({ random_bytes: () => new Uint8Array(31) }), /32/);
  assert.throws(() => factory({ random_bytes: () => new Uint8Array(33) }), /32/);
});
