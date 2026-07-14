import { createHash } from "node:crypto";

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;

export class SandboxSecurityCanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxSecurityCanonicalJsonError";
  }
}

function assertValidUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= HIGH_SURROGATE_START && codeUnit <= HIGH_SURROGATE_END) {
      const next = value.charCodeAt(index + 1);
      if (
        index + 1 >= value.length ||
        next < LOW_SURROGATE_START ||
        next > LOW_SURROGATE_END
      ) {
        throw new SandboxSecurityCanonicalJsonError(
          `lone surrogate in ${label}`
        );
      }
      index += 1;
    } else if (codeUnit >= LOW_SURROGATE_START && codeUnit <= LOW_SURROGATE_END) {
      throw new SandboxSecurityCanonicalJsonError(`lone surrogate in ${label}`);
    }
  }
}

function serializeString(value: string): string {
  assertValidUnicode(value, "string");
  // ECMAScript JSON.stringify produces the required RFC 8785 string escapes for
  // ordinary and control characters while preserving non-ASCII code points.
  return JSON.stringify(value);
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new SandboxSecurityCanonicalJsonError("non-finite number");
  }
  // JSON.stringify already serializes -0 as 0 and uses shortest round-trippable form.
  return JSON.stringify(value);
}

function compareUtf16(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    const delta = left.charCodeAt(index) - right.charCodeAt(index);
    if (delta !== 0) {
      return delta;
    }
  }
  return left.length - right.length;
}

function canonicalize(value: unknown, active: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return serializeNumber(value);
  }
  if (typeof value === "string") {
    return serializeString(value);
  }
  if (typeof value !== "object") {
    throw new SandboxSecurityCanonicalJsonError(
      `unsupported JSON value type: ${typeof value}`
    );
  }
  if (active.has(value)) {
    throw new SandboxSecurityCanonicalJsonError("cyclic JSON value");
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new SandboxSecurityCanonicalJsonError("sparse array");
        }
        parts.push(canonicalize(value[index], active));
      }
      return `[${parts.join(",")}]`;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new SandboxSecurityCanonicalJsonError("non-plain object");
    }

    const keys = Object.keys(value).sort(compareUtf16);
    const parts: string[] = [];
    for (const key of keys) {
      assertValidUnicode(key, "object key");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        throw new SandboxSecurityCanonicalJsonError("illegal object property");
      }
      parts.push(
        `${serializeString(key)}:${canonicalize(descriptor.value, active)}`
      );
    }
    return `{${parts.join(",")}}`;
  } finally {
    active.delete(value);
  }
}

export function canonicalizeSandboxSecurityJson(value: unknown): string {
  return canonicalize(value, new WeakSet<object>());
}

export function sha256CanonicalJson(value: unknown): string {
  const canonical = canonicalizeSandboxSecurityJson(value);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function sandboxSecurityJsonCanonicalEqual(
  left: unknown,
  right: unknown
): boolean {
  return (
    canonicalizeSandboxSecurityJson(left) ===
    canonicalizeSandboxSecurityJson(right)
  );
}
