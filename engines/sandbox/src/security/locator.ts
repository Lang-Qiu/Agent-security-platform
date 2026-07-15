import type {
  SandboxSecurityAuthorityBoundContent,
  SandboxSecurityNormalizedToolRequest
} from "./input-boundary.ts";
import type { SandboxSecurityJsonValue } from "../../../../shared/types/sandbox-security.ts";

export type SandboxSecurityContentLocator =
  | { kind: "whole_source" }
  | { kind: "text_byte_range"; start_byte: number; end_byte: number }
  | { kind: "json_pointer"; pointer: string };

export type SandboxSecurityToolLocator =
  | { kind: "whole_arguments" }
  | { kind: "json_pointer"; pointer: string };

const OBJECT_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_POINTER_BYTES = 512;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnDataProperties(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return false;
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }
  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined &&
      descriptor.enumerable &&
      "value" in descriptor
    );
  });
}

function isCodePointBoundary(bytes: readonly number[], index: number): boolean {
  if (index < 0 || index > bytes.length) {
    return false;
  }
  if (index === 0 || index === bytes.length) {
    return true;
  }
  const unit = bytes[index];
  // UTF-8 continuation bytes are 10xxxxxx; boundaries cannot land on them.
  return (unit & 0xc0) !== 0x80;
}

function validateRestrictedJsonPointer(pointer: unknown): string | null {
  if (typeof pointer !== "string") {
    return null;
  }
  if (Buffer.byteLength(pointer, "utf8") > MAX_POINTER_BYTES) {
    return null;
  }
  if (pointer === "") {
    // whole document pointer is not used by this restricted matrix
    return null;
  }
  if (!pointer.startsWith("/")) {
    return null;
  }
  const tokens = pointer.slice(1).split("/");
  for (const token of tokens) {
    if (token.includes("~") && !/^([^~]|~0|~1)*$/.test(token)) {
      return null;
    }
    const unescaped = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (/^(0|[1-9][0-9]*)$/.test(unescaped)) {
      // array index token — already canonical by regex (no leading zeros except 0)
      continue;
    }
    if (!OBJECT_TOKEN_PATTERN.test(unescaped)) {
      return null;
    }
  }
  return pointer;
}

function pointerExistsInJson(
  value: SandboxSecurityJsonValue,
  pointer: string
): boolean {
  if (pointer === "") {
    return true;
  }
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: SandboxSecurityJsonValue = value;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        return false;
      }
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index] as SandboxSecurityJsonValue;
      continue;
    }
    if (
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !Object.hasOwn(current, token)
    ) {
      return false;
    }
    current = (current as { [key: string]: SandboxSecurityJsonValue })[token];
  }
  return true;
}

export function validateSandboxSecurityContentLocator(
  locator: unknown,
  content: Readonly<SandboxSecurityAuthorityBoundContent>
): SandboxSecurityContentLocator | null {
  if (!isPlainRecord(locator) || typeof locator.kind !== "string") {
    return null;
  }

  if (locator.kind === "whole_source") {
    if (!hasExactOwnDataProperties(locator, ["kind"])) {
      return null;
    }
    return { kind: "whole_source" };
  }

  if (locator.kind === "text_byte_range") {
    if (
      !hasExactOwnDataProperties(locator, ["kind", "start_byte", "end_byte"])
    ) {
      return null;
    }
    const start = locator.start_byte;
    const end = locator.end_byte;
    const bytes = content.original_utf8_bytes;

    // Unproven mapping (non-integers) falls back to whole_source per plan.
    if (typeof start !== "number" || typeof end !== "number") {
      return { kind: "whole_source" };
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return { kind: "whole_source" };
    }
    if (start < 0 || end < 0 || start >= end || end > bytes.length) {
      return null;
    }
    if (!isCodePointBoundary(bytes, start) || !isCodePointBoundary(bytes, end)) {
      return null;
    }
    return {
      kind: "text_byte_range",
      start_byte: start,
      end_byte: end
    };
  }

  if (locator.kind === "json_pointer") {
    if (!hasExactOwnDataProperties(locator, ["kind", "pointer"])) {
      return null;
    }
    if (content.media_type !== "application/json") {
      return null;
    }
    const pointer = validateRestrictedJsonPointer(locator.pointer);
    if (pointer === null) {
      return null;
    }
    if (!pointerExistsInJson(content.value as SandboxSecurityJsonValue, pointer)) {
      return null;
    }
    return { kind: "json_pointer", pointer };
  }

  return null;
}

export function validateSandboxSecurityToolLocator(
  locator: unknown,
  tool: Readonly<SandboxSecurityNormalizedToolRequest>
): SandboxSecurityToolLocator | null {
  if (!isPlainRecord(locator) || typeof locator.kind !== "string") {
    return null;
  }

  if (locator.kind === "whole_arguments") {
    if (!hasExactOwnDataProperties(locator, ["kind"])) {
      return null;
    }
    return { kind: "whole_arguments" };
  }

  if (locator.kind === "json_pointer") {
    if (!hasExactOwnDataProperties(locator, ["kind", "pointer"])) {
      return null;
    }
    const pointer = validateRestrictedJsonPointer(locator.pointer);
    if (pointer === null) {
      return null;
    }
    // Arguments tree only: reject synthetic tool_name/target paths.
    if (pointer === "/tool_name" || pointer === "/target" || pointer.startsWith("/tool_name/") || pointer.startsWith("/target/")) {
      return null;
    }
    if (!pointerExistsInJson(tool.arguments, pointer)) {
      return null;
    }
    return { kind: "json_pointer", pointer };
  }

  return null;
}
