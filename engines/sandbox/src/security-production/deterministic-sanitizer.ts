import type {
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecuritySanitizedJudgeObligation,
  SandboxSecuritySanitizedJudgePayload,
  SandboxSecuritySanitizer
} from "../security/index.ts";
import { deriveSandboxSecurityExternalTokenRegistry } from "../security/sanitized-boundary.ts";

export const SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION =
  "sandbox-security-deterministic-sanitizer.v1" as const;

const FAILURE = "external_redaction_failed";
const MAX_STRING_CODE_UNITS = 128 * 1024;
const MAX_TOTAL_STRING_CODE_UNITS = 384 * 1024;
const MAX_JSON_DEPTH = 4;
const MAX_JSON_NODES = 1536;
const MAX_CONTAINER_ENTRIES = 512;
const MAX_OUTPUT_UTF8_BYTES = 192 * 1024;
const MAX_OBLIGATIONS = 64;
const MAX_ATOMS = 512;
const MAX_ATOM_CODE_UNITS = 128 * 1024;
const MAX_MATCH_CODE_UNITS = 4096;
const MAX_RAW_BYTE_METADATA_ENTRIES = MAX_STRING_CODE_UNITS * 4;

const PLACEHOLDERS = Object.freeze([
  "[REDACTED_CREDENTIAL]",
  "[REDACTED_TOKEN]",
  "[REDACTED_EMAIL]",
  "[REDACTED_PHONE]",
  "[REDACTED_IP]",
  "[REDACTED_IDENTIFIER]",
  "[REDACTED_PATH]",
  "[REDACTED_HOST]",
  "[REDACTED_URL_SECRET]",
  "[REDACTED_HIGH_ENTROPY]"
]);

const SAFE_KEYS = new Set([
  "arguments",
  "body",
  "content",
  "endpoint",
  "headers",
  "method",
  "name",
  "path",
  "recipient",
  "subject",
  "target",
  "url"
]);

const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxy_authorization",
  "credential",
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "x_api_key",
  "token",
  "access_token",
  "refresh_token",
  "signature",
  "cookie",
  "set_cookie",
  "session",
  "session_id",
  "client_secret",
  "x_auth_token",
  "private_token",
  "private_key"
]);

const TOKEN_KEY_SEGMENTS = new Set(["token", "cookie", "session"]);
const SOURCE_TYPES = new Set([
  "system_instruction",
  "developer_instruction",
  "user_input",
  "retrieved_content",
  "memory_content",
  "model_output"
]);
const STAGES = new Set(["user_input", "model_output", "tool_request"]);
const PROFILE_IDS = new Set([
  "sandbox-security-balanced.v1",
  "sandbox-security-strict.v1"
]);
const CATEGORIES = new Set([
  "prompt_injection",
  "jailbreak",
  "instruction_override",
  "privilege_escalation",
  "sensitive_data_exposure",
  "tool_hijacking",
  "unsafe_side_effect",
  "memory_poisoning",
  "trust_boundary_violation"
]);

const SOURCE_HANDLE = /^hsrc:[a-f0-9]{32}:(000[1-9]|00[1-5][0-9]|006[0-4])$/u;
const CALL_HANDLE = /^hcall:[a-f0-9]{32}:0000$/u;
const SOURCE_TOKEN = /^etok:src:[a-f0-9]{32}:(000[1-9]|00[1-5][0-9]|006[0-4])$/u;
const CALL_TOKEN = /^etok:call:[a-f0-9]{32}:0000$/u;
const OBLIGATION_ID = /^obligation:\/\/sandbox\/security\/[A-Za-z0-9_.-]{1,128}\/0[0-9]{3}$/u;
const URL_PREFIX = /^([A-Za-z][A-Za-z0-9+.-]{0,31}):\/\//u;
const PRIVATE_KEY_BEGIN = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/u;
const PRIVATE_KEY_BLOCK = /-----BEGIN ((?:[A-Z0-9]+ )*PRIVATE KEY)-----[\s\S]*?-----END \1-----/gu;
const AUTHORIZATION = /\b(Bearer|Basic)[ \t]+([^\s]+)/giu;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const UUID = /^\{?[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}\}?$/u;
const EMAIL = /^[^\s<>"'()\[\]{},;@]+@[^\s<>"'()\[\]{},;@]+$/u;
const HEX_TOKEN = /^[A-Fa-f0-9]{32,}$/u;
const BASE64_TOKEN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const BASE64URL_TOKEN = /^[A-Za-z0-9_-]+$/u;
const MIXED_TOKEN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])\S+$/u;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:\\[^\u0000-\u001f\u007f]+$/u;
const WINDOWS_UNC_PATH = /^\\\\[^\\\s]+\\[^\u0000-\u001f\u007f]+$/u;
const POSIX_PATH = /^(?:\/[^\u0000-\u001f\u007f]*|~(?:[A-Za-z0-9._-]+)?\/[^\u0000-\u001f\u007f]+)$/u;

const URL_CANDIDATE = /(?<![A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]{0,31}:\/\/[^\s)},;<>"'`|]+(?![^\s)},;<>"'`|])/gu;
const JWT_CANDIDATE = /(?<![A-Za-z0-9_.-])[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![A-Za-z0-9_.-])/gu;
const EMAIL_CANDIDATE = /(?<![^\s<>"'`()\[\]{},;|=])[^\s<>"'`()\[\]{},;|@=]+@[^\s<>"'`()\[\]{},;|@=]+(?![^\s<>"'`()\[\]{},;|=])/gu;
const PHONE_CANDIDATE = /(?<![A-Za-z0-9_.+\-])\+?[0-9][0-9 .()\-]{5,}[0-9](?![A-Za-z0-9_.+\-])/gu;
const IPV4_CANDIDATE = /(?<![A-Za-z0-9_.])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![A-Za-z0-9_.])/gu;
const IPV6_CANDIDATE = /(?<![A-Za-z0-9_.:%])[A-Fa-f0-9:.]*:[A-Fa-f0-9:.]*(?![A-Za-z0-9_.:%])/gu;
const UUID_CANDIDATE = /(?<![A-Za-z0-9_{}\-])\{?[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}\}?(?![A-Za-z0-9_{}\-])/gu;
const PATH_CANDIDATE = /(?<![A-Za-z0-9_.~\\/])(?:[A-Za-z]:\\|\\\\[^\\\s]+\\|~(?:[A-Za-z0-9._-]+)?\/|\/)[^\s)\]},;<>"'`|]+(?![^\s)\]},;<>"'`|])/gu;
const ENCODED_TOKEN_CANDIDATE = /(?<![A-Za-z0-9+/_=\-])[A-Za-z0-9+/_=-]{24,}(?![A-Za-z0-9+/_=\-])/gu;
const MIXED_TOKEN_CANDIDATE = /\S{24,}/gu;

const ABORTED_GETTER = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted"
)?.get;

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface GuardContext {
  nodes: number;
  totalStringCodeUnits: number;
  readonly active: WeakSet<object>;
  readonly signal: AbortSignal;
}

interface AtomContext {
  readonly atoms: Set<string>;
  atomCodeUnits: number;
}

interface SanitizedTextSpan {
  readonly value: string;
  readonly generated: boolean;
}

interface ValidatedSource {
  readonly source_handle: string;
  readonly source_type: string;
  readonly media_type: "text/plain" | "application/json";
  readonly value: JsonValue;
}

interface ValidatedTool {
  readonly call_handle: string;
  readonly has_target: boolean;
  readonly target?: string;
  readonly arguments: JsonValue;
}

interface ValidatedSnapshot {
  readonly original: Readonly<SandboxSecurityRawDetectorSnapshot>;
  readonly stage: "user_input" | "model_output" | "tool_request";
  readonly profile_id:
    | "sandbox-security-balanced.v1"
    | "sandbox-security-strict.v1";
  readonly sources: readonly ValidatedSource[];
  readonly tool?: ValidatedTool;
}

function newFailure(): Error {
  const error = new Error(FAILURE);
  error.name = FAILURE;
  return error;
}

function fail(): never {
  throw newFailure();
}

function checkAbort(signal: AbortSignal): void {
  if (ABORTED_GETTER === undefined) fail();
  let aborted: unknown;
  try {
    aborted = Reflect.apply(ABORTED_GETTER, signal, []);
  } catch {
    fail();
  }
  if (aborted !== false) fail();
}

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function countString(value: string, context: GuardContext): string {
  checkAbort(context.signal);
  if (!isWellFormedUtf16(value) || value.length > MAX_STRING_CODE_UNITS) fail();
  context.totalStringCodeUnits += value.length;
  if (context.totalStringCodeUnits > MAX_TOTAL_STRING_CODE_UNITS) fail();
  return value;
}

function protocolString(value: unknown, context: GuardContext): string {
  if (typeof value !== "string") fail();
  const copied = countString(value, context);
  if (copied.normalize("NFKC") !== copied) fail();
  return copied;
}

function reflectOwnKeys(value: object, signal: AbortSignal): readonly PropertyKey[] {
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    fail();
  }
  checkAbort(signal);
  return keys;
}

function ownDataDescriptor(
  value: object,
  key: PropertyKey,
  signal: AbortSignal
): PropertyDescriptor {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    fail();
  }
  checkAbort(signal);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    fail();
  }
  return descriptor;
}

function assertPlainFrozenObject(value: unknown, signal: AbortSignal): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  try {
    if (
      Object.getPrototypeOf(value) !== Object.prototype ||
      !Object.isFrozen(value)
    ) {
      fail();
    }
  } catch {
    fail();
  }
  checkAbort(signal);
  return value;
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  signal: AbortSignal
): ReadonlyMap<string, unknown> {
  const object = assertPlainFrozenObject(value, signal);
  const keys = reflectOwnKeys(object, signal);
  const allowed = new Set([...required, ...optional]);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !keys.includes(key))
  ) {
    fail();
  }
  const result = new Map<string, unknown>();
  for (const key of keys) {
    if (typeof key !== "string") fail();
    result.set(key, ownDataDescriptor(object, key, signal).value);
  }
  return result;
}

function ownDataValue(value: unknown, key: string, signal: AbortSignal): unknown {
  const object = assertPlainFrozenObject(value, signal);
  const keys = reflectOwnKeys(object, signal);
  if (!keys.includes(key)) fail();
  return ownDataDescriptor(object, key, signal).value;
}

function boundedArrayLength(
  value: readonly unknown[],
  maxEntries: number,
  signal: AbortSignal
): number {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    fail();
  }
  checkAbort(signal);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== false ||
    !Number.isInteger(descriptor.value) ||
    descriptor.value < 0 ||
    descriptor.value > maxEntries
  ) {
    fail();
  }
  return descriptor.value as number;
}

function denseArray(value: unknown, signal: AbortSignal): readonly unknown[] {
  if (!Array.isArray(value)) fail();
  const length = boundedArrayLength(value, MAX_CONTAINER_ENTRIES, signal);
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value)) {
      fail();
    }
  } catch {
    fail();
  }
  const keys = reflectOwnKeys(value, signal);
  const expected = Array.from({ length }, (_, index) => String(index));
  if (
    keys.length !== expected.length + 1 ||
    keys[keys.length - 1] !== "length" ||
    expected.some((key, index) => keys[index] !== key)
  ) {
    fail();
  }
  const result: unknown[] = [];
  for (const key of expected) {
    result.push(ownDataDescriptor(value, key, signal).value);
  }
  return result;
}

function validateFrozenDenseByteMetadata(
  value: unknown,
  signal: AbortSignal
): void {
  if (!Array.isArray(value)) fail();
  const length = boundedArrayLength(
    value,
    MAX_RAW_BYTE_METADATA_ENTRIES,
    signal
  );
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value)) {
      fail();
    }
  } catch {
    fail();
  }
  const keys = reflectOwnKeys(value, signal);
  if (keys.length !== length + 1 || keys[keys.length - 1] !== "length") {
    fail();
  }
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (keys[index] !== key) fail();
    const byte = ownDataDescriptor(value, key, signal).value;
    if (!Number.isInteger(byte) || (byte as number) < 0 || (byte as number) > 255) {
      fail();
    }
  }
}

function defineData(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

// These are local resource guards. The frozen core remains the final authority
// for the exact payload byte, depth, node, and token limits.
function cloneJson(value: unknown, context: GuardContext, depth = 0): JsonValue {
  checkAbort(context.signal);
  context.nodes += 1;
  if (context.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) fail();
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail();
    return value;
  }
  if (typeof value === "string") return countString(value, context);
  if (typeof value !== "object") fail();
  if (context.active.has(value)) fail();
  context.active.add(value);
  try {
    if (Array.isArray(value)) {
      return denseArray(value, context.signal).map((item) =>
        cloneJson(item, context, depth + 1)
      );
    }
    const object = assertPlainFrozenObject(value, context.signal);
    const keys = reflectOwnKeys(object, context.signal);
    if (keys.length > MAX_CONTAINER_ENTRIES) fail();
    const normalizedKeys = new Set<string>();
    const result: Record<string, JsonValue> = {};
    for (const rawKey of keys) {
      if (typeof rawKey !== "string") fail();
      const key = countString(rawKey, context);
      const normalizedKey = key.normalize("NFKC");
      if (normalizedKeys.has(normalizedKey)) fail();
      normalizedKeys.add(normalizedKey);
      const nested = ownDataDescriptor(object, rawKey, context.signal).value;
      defineData(result, rawKey, cloneJson(nested, context, depth + 1));
    }
    return result;
  } finally {
    context.active.delete(value);
  }
}

function utf16Compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalSensitiveKey(key: string): string | null {
  if (!/^[\x00-\x7f]*$/u.test(key)) return null;
  return key.toLowerCase().replaceAll("-", "_");
}

function isSensitiveKey(key: string): boolean {
  const canonical = canonicalSensitiveKey(key);
  if (canonical === null) return false;
  if (SENSITIVE_KEYS.has(canonical)) return true;
  return canonical
    .split("_")
    .some((segment) => segment === "secret" || TOKEN_KEY_SEGMENTS.has(segment));
}

function placeholderForKey(key: string): string {
  const canonical = canonicalSensitiveKey(key) ?? "";
  if (
    canonical.split("_").some((segment) => TOKEN_KEY_SEGMENTS.has(segment)) ||
    canonical === "token" ||
    canonical === "access_token" ||
    canonical === "refresh_token"
  ) {
    return "[REDACTED_TOKEN]";
  }
  return "[REDACTED_CREDENTIAL]";
}

function addAtom(atom: string, context: AtomContext): void {
  const candidates = [atom, atom.normalize("NFKC")];
  for (const candidate of candidates) {
    if (candidate.length < 4 || context.atoms.has(candidate)) continue;
    if (
      candidate.length > MAX_MATCH_CODE_UNITS ||
      context.atoms.size >= MAX_ATOMS ||
      context.atomCodeUnits + candidate.length > MAX_ATOM_CODE_UNITS
    ) {
      fail();
    }
    context.atoms.add(candidate);
    context.atomCodeUnits += candidate.length;
  }
}

function collectStringAtoms(value: JsonValue, context: AtomContext): void {
  if (typeof value === "string") {
    addAtom(value, context);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringAtoms(item, context);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) collectStringAtoms(nested, context);
  }
}

function isCanonicalIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^(?:0|[1-9][0-9]{0,2})$/u.test(part) && Number(part) <= 255
    )
  );
}

function isCanonicalIpv6(value: string): boolean {
  if (value.includes("%") || !value.includes(":")) return false;
  const doubleColon = value.indexOf("::");
  if (doubleColon !== -1 && doubleColon !== value.lastIndexOf("::")) return false;
  const validatePart = (part: string): boolean => /^[A-Fa-f0-9]{1,4}$/u.test(part);
  const halves = value.split("::");
  const left = halves[0] === "" ? [] : halves[0]!.split(":");
  const right = halves.length === 1 || halves[1] === "" ? [] : halves[1]!.split(":");
  const expandIpv4 = (parts: string[]): { valid: boolean; count: number } => {
    if (parts.length === 0) return { valid: true, count: 0 };
    const last = parts[parts.length - 1]!;
    if (!last.includes(".")) {
      return { valid: parts.every(validatePart), count: parts.length };
    }
    return {
      valid: parts.slice(0, -1).every(validatePart) && isCanonicalIpv4(last),
      count: parts.length + 1
    };
  };
  const leftStats = expandIpv4(left);
  const rightStats = expandIpv4(right);
  if (!leftStats.valid || !rightStats.valid) return false;
  const count = leftStats.count + rightStats.count;
  return halves.length === 2 ? count < 8 : count === 8;
}

function isEmail(value: string): boolean {
  if (value.length > 254 || !EMAIL.test(value)) return false;
  return value.indexOf("@") === value.lastIndexOf("@");
}

function isPhone(value: string): boolean {
  if (!/^\+?[0-9 .()\-]+$/u.test(value)) return false;
  if (/^[0-9.]+$/u.test(value) && value.split(".").length === 4) return false;
  const digits = value.replaceAll(/[^0-9]/gu, "");
  return digits.length >= 7 && digits.length <= 15;
}

function looksLikePath(value: string): boolean {
  return (
    POSIX_PATH.test(value) ||
    WINDOWS_DRIVE_PATH.test(value) ||
    WINDOWS_UNC_PATH.test(value)
  );
}

function validateUrlAndRedact(
  value: string,
  atomContext: AtomContext
): string | null {
  const prefix = URL_PREFIX.exec(value);
  if (!prefix) return null;
  const authorityAndPath = value.slice(prefix[0].length);
  if (
    value.length > MAX_MATCH_CODE_UNITS ||
    authorityAndPath === "" ||
    authorityAndPath.startsWith("/") ||
    /[\u0000-\u0020\u007f\\]/u.test(value) ||
    /%(?![A-Fa-f0-9]{2})/u.test(value)
  ) {
    fail();
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail();
  }
  if (parsed.protocol !== `${prefix[1]!.toLowerCase()}:`) fail();
  if (parsed.protocol !== "file:" && parsed.hostname.length === 0) fail();
  const hadSecret = parsed.username !== "" || parsed.password !== "" || parsed.search !== "";
  addAtom(parsed.hostname, atomContext);
  addAtom(parsed.pathname, atomContext);
  if (parsed.username !== "") addAtom(parsed.username, atomContext);
  if (parsed.password !== "") addAtom(parsed.password, atomContext);
  if (parsed.search !== "") addAtom(parsed.search, atomContext);
  if (parsed.hash !== "") addAtom(parsed.hash, atomContext);
  return `${prefix[1]}://[REDACTED_HOST]/[REDACTED_PATH]${
    hadSecret ? "?[REDACTED_URL_SECRET]" : ""
  }`;
}

function rejectAmbiguousUrlContinuation(match: RegExpMatchArray): void {
  const index = match.index;
  const input = match.input;
  if (index === undefined || input === undefined) fail();
  const remainder = input.slice(index + match[0].length);
  if (
    /^[ \t]+(?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]+\/[^\s]+/u.test(remainder)
  ) {
    fail();
  }
}

function replacePlainMatches(
  spans: readonly SanitizedTextSpan[],
  pattern: RegExp,
  replace: (candidate: string, match: RegExpMatchArray) => string | null
): SanitizedTextSpan[] {
  const result: SanitizedTextSpan[] = [];
  for (const span of spans) {
    if (span.generated) {
      result.push(span);
      continue;
    }
    pattern.lastIndex = 0;
    let cursor = 0;
    for (const match of span.value.matchAll(pattern)) {
      const candidate = match[0];
      const index = match.index;
      if (index === undefined || candidate.length === 0) fail();
      if (candidate.length > MAX_MATCH_CODE_UNITS) fail();
      const replacement = replace(candidate, match);
      if (replacement === null) continue;
      if (index > cursor) {
        result.push({ value: span.value.slice(cursor, index), generated: false });
      }
      result.push({ value: replacement, generated: true });
      cursor = index + candidate.length;
    }
    if (cursor < span.value.length) {
      result.push({ value: span.value.slice(cursor), generated: false });
    }
  }
  return result;
}

function replacePrivateKeys(
  value: string,
  atomContext: AtomContext
): SanitizedTextSpan[] {
  PRIVATE_KEY_BLOCK.lastIndex = 0;
  const matches = [...value.matchAll(PRIVATE_KEY_BLOCK)];
  if (PRIVATE_KEY_BEGIN.test(value) && matches.length === 0) fail();
  const spans = replacePlainMatches(
    [{ value, generated: false }],
    PRIVATE_KEY_BLOCK,
    (candidate) => {
      addAtom(candidate, atomContext);
      return "[REDACTED_CREDENTIAL]";
    }
  );
  if (
    spans.some(
      (span) => !span.generated && PRIVATE_KEY_BEGIN.test(span.value)
    )
  ) {
    fail();
  }
  return spans;
}

function sanitizeString(value: string, atomContext: AtomContext): string {
  const normalized = value.normalize("NFKC");
  if (PLACEHOLDERS.some((placeholder) => normalized.includes(placeholder))) fail();

  let spans = replacePrivateKeys(normalized, atomContext);
  spans = replacePlainMatches(spans, AUTHORIZATION, (candidate, match) => {
    addAtom(candidate, atomContext);
    addAtom(match[2]!, atomContext);
    return match[1]!.toLowerCase() === "basic"
      ? "[REDACTED_CREDENTIAL]"
      : "[REDACTED_TOKEN]";
  });
  spans = replacePlainMatches(spans, URL_CANDIDATE, (candidate, match) => {
    rejectAmbiguousUrlContinuation(match);
    return validateUrlAndRedact(candidate, atomContext);
  });
  spans = replacePlainMatches(spans, JWT_CANDIDATE, (candidate) => {
    if (!JWT.test(candidate)) return null;
    addAtom(candidate, atomContext);
    return "[REDACTED_TOKEN]";
  });
  spans = replacePlainMatches(spans, EMAIL_CANDIDATE, (candidate) => {
    if (!isEmail(candidate)) return null;
    addAtom(candidate, atomContext);
    return "[REDACTED_EMAIL]";
  });
  spans = replacePlainMatches(spans, PHONE_CANDIDATE, (candidate) => {
    if (!isPhone(candidate)) return null;
    addAtom(candidate, atomContext);
    return "[REDACTED_PHONE]";
  });
  spans = replacePlainMatches(spans, IPV4_CANDIDATE, (candidate) => {
    if (!isCanonicalIpv4(candidate)) return null;
    addAtom(candidate, atomContext);
    return "[REDACTED_IP]";
  });
  spans = replacePlainMatches(spans, IPV6_CANDIDATE, (candidate) => {
    if (!isCanonicalIpv6(candidate)) return null;
    addAtom(candidate, atomContext);
    return "[REDACTED_IP]";
  });
  spans = replacePlainMatches(spans, UUID_CANDIDATE, (candidate) => {
    if (!UUID.test(candidate)) return null;
    addAtom(candidate, atomContext);
    return "[REDACTED_IDENTIFIER]";
  });
  spans = replacePlainMatches(spans, ENCODED_TOKEN_CANDIDATE, (candidate) => {
    if (
      looksLikePath(candidate) ||
      (!HEX_TOKEN.test(candidate) &&
        decodeCanonicalBase64Bytes(candidate) === null)
    ) {
      return null;
    }
    addAtom(candidate, atomContext);
    return "[REDACTED_TOKEN]";
  });
  spans = replacePlainMatches(spans, PATH_CANDIDATE, (candidate) => {
    if (!looksLikePath(candidate)) return null;
    addAtom(candidate, atomContext);
    return "[REDACTED_PATH]";
  });
  spans = replacePlainMatches(spans, MIXED_TOKEN_CANDIDATE, (candidate) => {
    if (!MIXED_TOKEN.test(candidate)) return null;
    addAtom(candidate, atomContext);
    return "[REDACTED_HIGH_ENTROPY]";
  });
  return spans.map((span) => span.value).join("");
}

function sanitizeJson(
  value: JsonValue,
  atomContext: AtomContext,
  headers = false
): JsonValue {
  if (typeof value === "string") return sanitizeString(value, atomContext);
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item, atomContext));
  }

  const entries = Object.keys(value).map((rawKey) => ({
    rawKey,
    normalizedKey: rawKey.normalize("NFKC"),
    value: value[rawKey]!
  }));
  const normalizedSeen = new Set<string>();
  for (const entry of entries) {
    if (normalizedSeen.has(entry.normalizedKey)) fail();
    normalizedSeen.add(entry.normalizedKey);
  }
  const unknown = entries
    .filter((entry) => headers || !SAFE_KEYS.has(entry.normalizedKey))
    .sort((left, right) => utf16Compare(left.normalizedKey, right.normalizedKey));
  const ordinals = new Map(
    unknown.map((entry, index) => [
      entry.rawKey,
      `field_${String(index + 1).padStart(4, "0")}`
    ])
  );
  const projected = entries.map((entry) => {
    const sensitive = isSensitiveKey(entry.normalizedKey);
    if (sensitive) collectStringAtoms(entry.value, atomContext);
    return {
      key: ordinals.get(entry.rawKey) ?? entry.normalizedKey,
      value: sensitive
        ? placeholderForKey(entry.normalizedKey)
        : sanitizeJson(
            entry.value,
            atomContext,
            !headers && entry.normalizedKey === "headers"
          )
    };
  });
  projected.sort((left, right) => utf16Compare(left.key, right.key));
  const result: Record<string, JsonValue> = {};
  for (const entry of projected) {
    if (Object.hasOwn(result, entry.key)) fail();
    defineData(result, entry.key, entry.value);
  }
  return result;
}

function cloneLocator(
  value: unknown,
  context: GuardContext,
  tool: boolean
): Record<string, unknown> {
  const kind = ownDataValue(value, "kind", context.signal);
  if (kind === "whole_source" && !tool) {
    exactRecord(value, ["kind"], [], context.signal);
    return { kind: protocolString(kind, context) };
  }
  if (kind === "whole_arguments" && tool) {
    exactRecord(value, ["kind"], [], context.signal);
    return { kind: protocolString(kind, context) };
  }
  if (kind === "json_pointer") {
    const record = exactRecord(value, ["kind", "pointer"], [], context.signal);
    const pointer = protocolString(record.get("pointer"), context);
    if (PLACEHOLDERS.some((placeholder) => pointer.includes(placeholder))) fail();
    return {
      kind: protocolString(record.get("kind"), context),
      pointer
    };
  }
  if (kind === "text_byte_range" && !tool) {
    const record = exactRecord(
      value,
      ["kind", "start_byte", "end_byte"],
      [],
      context.signal
    );
    const start = record.get("start_byte");
    const end = record.get("end_byte");
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      (start as number) < 0 ||
      (end as number) <= (start as number)
    ) {
      fail();
    }
    return { kind: protocolString(kind, context), start_byte: start, end_byte: end };
  }
  fail();
}

function cloneSubjectRef(
  value: unknown,
  context: GuardContext
): Record<string, unknown> {
  const kind = ownDataValue(value, "kind", context.signal);
  if (kind === "content_source") {
    const record = exactRecord(
      value,
      ["kind", "source_token", "locator"],
      [],
      context.signal
    );
    const token = protocolString(record.get("source_token"), context);
    if (!SOURCE_TOKEN.test(token)) fail();
    return {
      kind: protocolString(kind, context),
      source_token: token,
      locator: cloneLocator(record.get("locator"), context, false)
    };
  }
  if (kind === "tool_request") {
    const base = exactRecord(
      value,
      ["kind", "call_token", "component"],
      ["locator"],
      context.signal
    );
    const token = protocolString(base.get("call_token"), context);
    const component = protocolString(base.get("component"), context);
    if (!CALL_TOKEN.test(token)) fail();
    if (component === "arguments") {
      if (!base.has("locator")) fail();
      return {
        kind: protocolString(kind, context),
        call_token: token,
        component,
        locator: cloneLocator(base.get("locator"), context, true)
      };
    }
    if (
      !["whole_call", "tool_name", "target"].includes(component) ||
      base.has("locator")
    ) {
      fail();
    }
    return { kind: protocolString(kind, context), call_token: token, component };
  }
  fail();
}

function cloneObligations(
  value: unknown,
  context: GuardContext
): SandboxSecuritySanitizedJudgeObligation[] {
  const obligations = denseArray(value, context.signal);
  if (obligations.length === 0 || obligations.length > MAX_OBLIGATIONS) fail();
  const ids = new Set<string>();
  return obligations.map((obligation) => {
    const record = exactRecord(
      obligation,
      ["obligation_id", "category", "subject_refs"],
      [],
      context.signal
    );
    const obligationId = protocolString(record.get("obligation_id"), context);
    const category = protocolString(record.get("category"), context);
    if (!OBLIGATION_ID.test(obligationId) || !CATEGORIES.has(category) || ids.has(obligationId)) {
      fail();
    }
    ids.add(obligationId);
    const refs = denseArray(record.get("subject_refs"), context.signal);
    if (refs.length === 0 || refs.length > 8) fail();
    return {
      obligation_id: obligationId,
      category: category as SandboxSecuritySanitizedJudgeObligation["category"],
      subject_refs: refs.map((ref) => cloneSubjectRef(ref, context)) as never
    };
  });
}

function validateSnapshot(
  snapshot: unknown,
  context: GuardContext
): ValidatedSnapshot {
  const outer = exactRecord(
    snapshot,
    [
      "request_id",
      "evaluation_mode",
      "stage",
      "profile",
      "contents",
      "canonical_request_sha256"
    ],
    ["tool_request"],
    context.signal
  );
  protocolString(outer.get("request_id"), context);
  protocolString(outer.get("evaluation_mode"), context);
  protocolString(outer.get("canonical_request_sha256"), context);
  const stage = protocolString(outer.get("stage"), context);
  if (!STAGES.has(stage)) fail();
  const profileId = protocolString(
    ownDataValue(outer.get("profile"), "profile_id", context.signal),
    context
  );
  if (!PROFILE_IDS.has(profileId)) fail();
  const contents = denseArray(outer.get("contents"), context.signal);
  if (contents.length === 0 || contents.length > 64) fail();
  const sources = contents.map((source) => {
    const record = exactRecord(
      source,
      [
        "source_handle",
        "source_id",
        "source_type",
        "media_type",
        "authority_kind",
        "value",
        "provenance_ref",
        "original_utf8_bytes",
        "original_value_sha256",
        "comparison_value",
        "trust_class"
      ],
      [],
      context.signal
    );
    const handle = protocolString(record.get("source_handle"), context);
    const sourceType = protocolString(record.get("source_type"), context);
    const mediaType = protocolString(record.get("media_type"), context);
    protocolString(record.get("source_id"), context);
    protocolString(record.get("authority_kind"), context);
    protocolString(record.get("provenance_ref"), context);
    protocolString(record.get("original_value_sha256"), context);
    protocolString(record.get("trust_class"), context);
    validateFrozenDenseByteMetadata(
      record.get("original_utf8_bytes"),
      context.signal
    );
    if (
      !SOURCE_HANDLE.test(handle) ||
      !SOURCE_TYPES.has(sourceType) ||
      (mediaType !== "text/plain" && mediaType !== "application/json")
    ) {
      fail();
    }
    return {
      source_handle: handle,
      source_type: sourceType,
      media_type: mediaType as ValidatedSource["media_type"],
      value: cloneJson(record.get("value"), context)
    };
  });

  let tool: ValidatedTool | undefined;
  if (outer.has("tool_request")) {
    const record = exactRecord(
      outer.get("tool_request"),
      [
        "call_handle",
        "call_id",
        "authority_kind",
        "tool_name",
        "arguments",
        "arguments_jcs_sha256",
        "has_target"
      ],
      ["target"],
      context.signal
    );
    const callHandle = protocolString(record.get("call_handle"), context);
    protocolString(record.get("call_id"), context);
    protocolString(record.get("authority_kind"), context);
    protocolString(record.get("tool_name"), context);
    protocolString(record.get("arguments_jcs_sha256"), context);
    const hasTarget = record.get("has_target");
    if (
      !CALL_HANDLE.test(callHandle) ||
      typeof hasTarget !== "boolean" ||
      hasTarget !== record.has("target")
    ) {
      fail();
    }
    const targetValue = record.get("target");
    const target = record.has("target")
      ? typeof targetValue === "string"
        ? countString(targetValue, context)
        : fail()
      : undefined;
    tool = {
      call_handle: callHandle,
      has_target: hasTarget,
      ...(target === undefined ? {} : { target }),
      arguments: cloneJson(record.get("arguments"), context)
    };
  }

  return {
    original: snapshot as Readonly<SandboxSecurityRawDetectorSnapshot>,
    stage: stage as ValidatedSnapshot["stage"],
    profile_id: profileId as ValidatedSnapshot["profile_id"],
    ...(tool ? { tool } : {}),
    sources
  };
}

function stripPlaceholders(value: string): string {
  let result = value;
  for (const placeholder of PLACEHOLDERS) result = result.replaceAll(placeholder, "");
  return result;
}

function containsAtom(value: string, atoms: ReadonlySet<string>): boolean {
  for (const atom of atoms) {
    if (value.includes(atom)) return true;
  }
  return false;
}

function decodePercentRuns(value: string): string {
  let result = "";
  let cursor = 0;
  for (const match of value.matchAll(/(?:%[A-Fa-f0-9]{2})+/gu)) {
    const index = match.index;
    if (index === undefined || match[0].length > MAX_MATCH_CODE_UNITS * 3) fail();
    result += value.slice(cursor, index);
    try {
      result += decodeURIComponent(match[0]);
    } catch {
      fail();
    }
    cursor = index + match[0].length;
  }
  return result + value.slice(cursor);
}

function decodeCanonicalBase64Bytes(candidate: string): Buffer | null {
  if (candidate.length % 4 === 0 && BASE64_TOKEN.test(candidate)) {
    const bytes = Buffer.from(candidate, "base64");
    if (bytes.toString("base64") === candidate) return bytes;
  }
  if (
    candidate.length % 4 !== 1 &&
    BASE64URL_TOKEN.test(candidate)
  ) {
    const bytes = Buffer.from(candidate, "base64url");
    if (bytes.toString("base64url") === candidate) return bytes;
  }
  return null;
}

function decodeCanonicalBase64(candidate: string): string | null {
  const bytes = decodeCanonicalBase64Bytes(candidate);
  if (bytes === null) return null;
  const decoded = bytes.toString("utf8");
  return Buffer.from(decoded, "utf8").equals(bytes) ? decoded : null;
}

function assertNoSensitiveAtoms(
  outputs: readonly string[],
  atomContext: AtomContext
): void {
  for (const output of outputs) {
    const stripped = stripPlaceholders(output);
    if (
      containsAtom(stripped, atomContext.atoms) ||
      containsAtom(stripped.normalize("NFKC"), atomContext.atoms)
    ) {
      fail();
    }
    const percentDecoded = decodePercentRuns(stripped);
    if (
      containsAtom(percentDecoded, atomContext.atoms) ||
      containsAtom(percentDecoded.normalize("NFKC"), atomContext.atoms)
    ) {
      fail();
    }
    const encodedCandidates = stripped.match(/[A-Za-z0-9+/_=-]{4,}/gu) ?? [];
    for (const candidate of encodedCandidates) {
      if (candidate.length > MAX_MATCH_CODE_UNITS) continue;
      const decoded = decodeCanonicalBase64(candidate);
      if (
        decoded !== null &&
        (containsAtom(decoded, atomContext.atoms) ||
          containsAtom(decoded.normalize("NFKC"), atomContext.atoms))
      ) {
        fail();
      }
    }
  }
}

function collectSanitizedStrings(value: JsonValue, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSanitizedStrings(item, output);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectSanitizedStrings(nested, output);
    }
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, seen);
  } else {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested, seen);
    }
  }
  return Object.freeze(value);
}

function sanitizeInternal(
  snapshotValue: unknown,
  obligationsValue: unknown,
  signal: AbortSignal,
  atomContext: AtomContext
): SandboxSecuritySanitizedJudgePayload {
  checkAbort(signal);
  const guard: GuardContext = {
    nodes: 0,
    totalStringCodeUnits: 0,
    active: new WeakSet(),
    signal
  };
  const snapshot = validateSnapshot(snapshotValue, guard);
  const obligations = cloneObligations(obligationsValue, guard);
  checkAbort(signal);
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot.original);
  if (registry.source_tokens.length !== snapshot.sources.length) fail();
  const allowedSources = new Set(registry.source_tokens.map((entry) => entry.source_token));
  const allowedCall = registry.call_token?.call_token;
  for (const obligation of obligations) {
    for (const ref of obligation.subject_refs) {
      if (ref.kind === "content_source") {
        if (!allowedSources.has(ref.source_token)) fail();
      } else if (ref.call_token !== allowedCall) {
        fail();
      }
    }
  }

  const sources = snapshot.sources.map((source, index) => ({
    source_token: registry.source_tokens[index]!.source_token,
    source_type: source.source_type as SandboxSecuritySanitizedJudgePayload["sources"][number]["source_type"],
    media_type: source.media_type,
    sanitized_value: sanitizeJson(source.value, atomContext) as never
  }));
  const toolRequest = snapshot.tool && registry.call_token
    ? {
        call_token: registry.call_token.call_token,
        tool_name_token: registry.call_token.tool_name_token,
        ...(snapshot.tool.target === undefined
          ? {}
          : { sanitized_target: sanitizeString(snapshot.tool.target, atomContext) }),
        sanitized_arguments: sanitizeJson(snapshot.tool.arguments, atomContext) as never
      }
    : undefined;
  if ((snapshot.tool === undefined) !== (registry.call_token === undefined)) fail();

  const payload: SandboxSecuritySanitizedJudgePayload = {
    schema_version: "sandbox-security-sanitized-judge.v1",
    request_token: registry.request_token,
    stage: snapshot.stage,
    policy_profile_id: snapshot.profile_id,
    sources,
    ...(toolRequest ? { tool_request: toolRequest } : {}),
    routed_obligations: obligations
  };
  checkAbort(signal);
  let encoded: string;
  try {
    encoded = JSON.stringify(payload);
  } catch {
    fail();
  }
  if (new TextEncoder().encode(encoded).byteLength > MAX_OUTPUT_UTF8_BYTES) fail();
  const defenseStrings: string[] = [];
  for (const source of sources) {
    collectSanitizedStrings(source.sanitized_value, defenseStrings);
  }
  if (toolRequest) {
    if (toolRequest.sanitized_target !== undefined) {
      defenseStrings.push(toolRequest.sanitized_target);
    }
    collectSanitizedStrings(toolRequest.sanitized_arguments, defenseStrings);
  }
  for (const obligation of obligations) {
    for (const ref of obligation.subject_refs) {
      if ("locator" in ref && ref.locator.kind === "json_pointer") {
        defenseStrings.push(ref.locator.pointer);
      }
    }
  }
  assertNoSensitiveAtoms(defenseStrings, atomContext);
  checkAbort(signal);
  return deepFreeze(payload);
}

export function createSandboxSecurityDeterministicSanitizer(): SandboxSecuritySanitizer {
  return Object.freeze({
    async sanitize(
      snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
      routed_obligations: readonly SandboxSecuritySanitizedJudgeObligation[],
      signal: AbortSignal
    ) {
      const atomContext: AtomContext = { atoms: new Set(), atomCodeUnits: 0 };
      try {
        return sanitizeInternal(snapshot, routed_obligations, signal, atomContext);
      } catch {
        throw newFailure();
      } finally {
        atomContext.atoms.clear();
        atomContext.atomCodeUnits = 0;
      }
    }
  });
}
