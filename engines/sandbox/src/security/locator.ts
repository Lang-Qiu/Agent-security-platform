import type {
  SandboxSecurityAuthorityBoundContent,
  SandboxSecurityNormalizedToolRequest
} from "./input-boundary.ts";

export type SandboxSecurityContentLocator =
  | { kind: "whole_source" }
  | { kind: "text_byte_range"; start_byte: number; end_byte: number }
  | { kind: "json_pointer"; pointer: string };

export type SandboxSecurityToolLocator =
  | { kind: "whole_arguments" }
  | { kind: "json_pointer"; pointer: string };

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnDataProperties(
  value: unknown,
  requiredKeys: readonly string[]
): value is PlainRecord {
  if (!isPlainRecord(value)) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== requiredKeys.length ||
    ownKeys.some((key) => typeof key !== "string" || !requiredKeys.includes(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }
  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isCodePointBoundary(bytes: readonly number[], index: number): boolean {
  if (index < 0 || index > bytes.length) {
    return false;
  }
  if (index === bytes.length) {
    return true;
  }
  const byte = bytes[index];
  // UTF-8 continuation bytes are 10xxxxxx and cannot start a code point.
  return (byte & 0xc0) !== 0x80;
}

const OBJECT_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

function isValidRestrictedJsonPointer(pointer: string): boolean {
  if (typeof pointer !== "string") {
    return false;
  }
  if (Buffer.byteLength(pointer, "utf8") > 512) {
    return false;
  }
  if (pointer === "") {
    return true;
  }
  if (!pointer.startsWith("/")) {
    return false;
  }
  const tokens = pointer.slice(1).split("/");
  for (const token of tokens) {
    const unescaped = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (token.includes("~") && !/^([^~]|~0|~1)*$/.test(token)) {
      return false;
    }
    if (/^(0|[1-9][0-9]*)$/.test(unescaped)) {
      // canonical array index (no leading zero except 0)
      continue;
    }
    if (!OBJECT_TOKEN_PATTERN.test(unescaped)) {
      return false;
    }
  }
  return true;
}

function pointerExistsInValue(
  pointer: string,
  value: unknown
): boolean {
  if (pointer === "") {
    return true;
  }
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = value;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        return false;
      }
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
      continue;
    }
    if (
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !Object.hasOwn(current as object, token)
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return true;
}

export function validateSandboxSecurityContentLocator(
  locator: unknown,
  content: Readonly<SandboxSecurityAuthorityBoundContent>
): SandboxSecurityContentLocator | null {
  if (hasExactOwnDataProperties(locator, ["kind"]) && locator.kind === "whole_source") {
    return { kind: "whole_source" };
  }

  if (
    hasExactOwnDataProperties(locator, ["kind", "start_byte", "end_byte"]) &&
    locator.kind === "text_byte_range"
  ) {
    // text_byte_range is only proven for text/plain original UTF-8 bytes.
    if (content.media_type !== "text/plain") {
      return { kind: "whole_source" };
    }
    const { start_byte, end_byte } = locator;
    if (
      !isNonNegativeInteger(start_byte) ||
      !isNonNegativeInteger(end_byte) ||
      start_byte >= end_byte ||
      end_byte > content.original_utf8_bytes.length
    ) {
      return null;
    }
    if (
      !isCodePointBoundary(content.original_utf8_bytes, start_byte) ||
      !isCodePointBoundary(content.original_utf8_bytes, end_byte)
    ) {
      return null;
    }
    return {
      kind: "text_byte_range",
      start_byte,
      end_byte
    };
  }

  if (
    hasExactOwnDataProperties(locator, ["kind", "pointer"]) &&
    locator.kind === "json_pointer" &&
    typeof locator.pointer === "string"
  ) {
    if (content.media_type !== "application/json") {
      return null;
    }
    if (!isValidRestrictedJsonPointer(locator.pointer)) {
      return null;
    }
    if (!pointerExistsInValue(locator.pointer, content.value)) {
      return null;
    }
    return { kind: "json_pointer", pointer: locator.pointer };
  }

  return null;
}

export function validateSandboxSecurityToolLocator(
  locator: unknown,
  tool: Readonly<SandboxSecurityNormalizedToolRequest>
): SandboxSecurityToolLocator | null {
  if (
    hasExactOwnDataProperties(locator, ["kind"]) &&
    locator.kind === "whole_arguments"
  ) {
    return { kind: "whole_arguments" };
  }

  if (
    hasExactOwnDataProperties(locator, ["kind", "pointer"]) &&
    locator.kind === "json_pointer" &&
    typeof locator.pointer === "string"
  ) {
    if (!isValidRestrictedJsonPointer(locator.pointer)) {
      return null;
    }
    // Tool pointers apply only to arguments tree, never tool_name/target fields.
    if (
      locator.pointer === "/tool_name" ||
      locator.pointer.startsWith("/tool_name/") ||
      locator.pointer === "/target" ||
      locator.pointer.startsWith("/target/")
    ) {
      return null;
    }
    if (!pointerExistsInValue(locator.pointer, tool.arguments)) {
      return null;
    }
    return { kind: "json_pointer", pointer: locator.pointer };
  }

  return null;
}
