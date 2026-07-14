import { createHash } from "node:crypto";

const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const INVALID_JSON_ERROR = "Value is not a supported canonical JSON value";

type CanonicalJsonObject = Record<string, unknown>;

function rejectInvalidJson(): never {
  throw new TypeError(INVALID_JSON_ERROR);
}

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (
        index + 1 >= value.length ||
        nextCodeUnit < 0xdc00 ||
        nextCodeUnit > 0xdfff
      ) {
        rejectInvalidJson();
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      rejectInvalidJson();
    }
  }
}

function encodeString(value: string): string {
  assertValidUnicode(value);
  const encoded = JSON.stringify(value);
  if (typeof encoded !== "string") {
    rejectInvalidJson();
  }
  return encoded;
}

function encodeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    rejectInvalidJson();
  }
  const encoded = JSON.stringify(value);
  if (typeof encoded !== "string") {
    rejectInvalidJson();
  }
  return encoded;
}

function serializeArray(value: unknown[], active: WeakSet<object>): string {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    rejectInvalidJson();
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    rejectInvalidJson();
  }

  const length = lengthDescriptor.value as number;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) {
    rejectInvalidJson();
  }

  for (const key of ownKeys) {
    if (key === "length") {
      continue;
    }
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) {
      rejectInvalidJson();
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
      rejectInvalidJson();
    }
  }

  const items: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      rejectInvalidJson();
    }
    items.push(serializeValue(descriptor.value, active));
  }

  return `[${items.join(",")}]`;
}

function serializeObject(
  value: CanonicalJsonObject,
  active: WeakSet<object>
): string {
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    rejectInvalidJson();
  }

  const entries: Array<[string, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || FORBIDDEN_JSON_KEYS.has(key)) {
      rejectInvalidJson();
    }
    assertValidUnicode(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      rejectInvalidJson();
    }
    entries.push([key, descriptor.value]);
  }

  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const members = entries.map(([key, member]) => {
    const keyText = encodeString(key);
    const memberText = serializeValue(member, active);
    return `${keyText}:${memberText}`;
  });
  return `{${members.join(",")}}`;
}

function serializeValue(value: unknown, active: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return encodeNumber(value);
    case "string":
      return encodeString(value);
    case "object":
      if (active.has(value)) {
        rejectInvalidJson();
      }
      active.add(value);
      try {
        return Array.isArray(value)
          ? serializeArray(value, active)
          : serializeObject(value as CanonicalJsonObject, active);
      } finally {
        active.delete(value);
      }
    default:
      rejectInvalidJson();
  }
}

export function canonicalizeSandboxSecurityJson(value: unknown): string {
  return serializeValue(value, new WeakSet<object>());
}

export function sha256CanonicalJson(value: unknown): string {
  const canonical = canonicalizeSandboxSecurityJson(value);
  return createHash("sha256")
    .update(Buffer.from(canonical, "utf8"))
    .digest("hex");
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
