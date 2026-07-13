import {
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_JSON_NODES,
  SANDBOX_SECURITY_MAX_TEXT_BYTES,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES,
  type SandboxSecurityClaimedSourceType,
  type SandboxSecurityJsonValue,
  type SandboxSecurityRequest,
  type SandboxSecuritySubmittedContentItem,
  type SandboxSecurityToolRequest
} from "../types/sandbox-security.ts";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/;
const PROVENANCE_PATTERN =
  /^(source|platform|retrieval|memory):\/\/[A-Za-z0-9][A-Za-z0-9._:-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._:-]{0,63}){0,7}$/;
const TARGET_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const INVALID_JSON = Symbol("invalid-sandbox-security-json");

type JsonCloneResult = SandboxSecurityJsonValue | typeof INVALID_JSON;
type PlainRecord = Record<string, unknown>;

interface JsonCloneState {
  nodes: number;
  readonly active: WeakSet<object>;
}

function isCatalogValue<const TCatalog extends readonly string[]>(
  catalog: TCatalog,
  value: unknown
): value is TCatalog[number] {
  return typeof value === "string" && catalog.includes(value);
}

function hasExactOwnDataProperties(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): value is PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }

  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const ownKeys = Reflect.ownKeys(value);

  if (
    ownKeys.some((key) => typeof key !== "string" || !allowedKeys.has(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }

  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function isDenseOrdinaryArray(
  value: unknown,
  maxLength: number
): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return false;
  }

  const length = lengthDescriptor.value as number;
  if (length > maxLength) {
    return false;
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) {
    return false;
  }

  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return false;
    }
  }

  return ownKeys.every((key) => {
    if (key === "length") {
      return true;
    }
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) {
      return false;
    }
    const index = Number(key);
    return Number.isSafeInteger(index) && index >= 0 && index < length;
  });
}

function hasValidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (
        index + 1 >= value.length ||
        nextCodeUnit < 0xdc00 ||
        nextCodeUnit > 0xdfff
      ) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }

  return true;
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    IDENTIFIER_PATTERN.test(value)
  );
}

function isToolName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    TOOL_NAME_PATTERN.test(value)
  );
}

function isTarget(value: unknown): value is string {
  return (
    typeof value === "string" &&
    hasValidUnicode(value) &&
    !TARGET_CONTROL_PATTERN.test(value) &&
    Buffer.byteLength(value, "utf8") <= 1024
  );
}

function isProvenanceRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 256 &&
    PROVENANCE_PATTERN.test(value)
  );
}

function cloneJsonValue(
  value: unknown,
  state: JsonCloneState,
  containerDepth = 0
): JsonCloneResult {
  state.nodes += 1;
  if (state.nodes > SANDBOX_SECURITY_MAX_JSON_NODES) {
    return INVALID_JSON;
  }

  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_JSON;
  }
  if (typeof value === "string") {
    return hasValidUnicode(value) &&
      Buffer.byteLength(value, "utf8") <= SANDBOX_SECURITY_MAX_TEXT_BYTES
      ? value
      : INVALID_JSON;
  }
  if (typeof value !== "object") {
    return INVALID_JSON;
  }
  if (containerDepth >= SANDBOX_SECURITY_MAX_JSON_DEPTH || state.active.has(value)) {
    return INVALID_JSON;
  }

  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        !isDenseOrdinaryArray(
          value,
          SANDBOX_SECURITY_MAX_JSON_NODES - state.nodes
        )
      ) {
        return INVALID_JSON;
      }

      const result: SandboxSecurityJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor)) {
          return INVALID_JSON;
        }
        const cloned = cloneJsonValue(
          descriptor.value,
          state,
          containerDepth + 1
        );
        if (cloned === INVALID_JSON) {
          return INVALID_JSON;
        }
        result.push(cloned);
      }
      return result;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return INVALID_JSON;
    }

    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      return INVALID_JSON;
    }
    if (ownKeys.length > SANDBOX_SECURITY_MAX_JSON_NODES - state.nodes) {
      return INVALID_JSON;
    }

    const result: { [key: string]: SandboxSecurityJsonValue } = {};
    for (const key of ownKeys as string[]) {
      if (FORBIDDEN_JSON_KEYS.has(key) || !hasValidUnicode(key)) {
        return INVALID_JSON;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        return INVALID_JSON;
      }

      const cloned = cloneJsonValue(
        descriptor.value,
        state,
        containerDepth + 1
      );
      if (cloned === INVALID_JSON) {
        return INVALID_JSON;
      }
      result[key] = cloned;
    }
    return result;
  } finally {
    state.active.delete(value);
  }
}

function cloneJson(value: unknown): JsonCloneResult {
  return cloneJsonValue(value, { nodes: 0, active: new WeakSet() });
}

function normalizeContentItem(
  value: unknown
): SandboxSecuritySubmittedContentItem | null {
  if (
    !hasExactOwnDataProperties(value, [
      "source_id",
      "claimed_source_type",
      "media_type",
      "value",
      "provenance_ref"
    ]) ||
    !isIdentifier(value.source_id) ||
    !isCatalogValue(
      SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
      value.claimed_source_type
    ) ||
    !isProvenanceRef(value.provenance_ref)
  ) {
    return null;
  }

  if (value.media_type === "text/plain") {
    if (
      typeof value.value !== "string" ||
      !hasValidUnicode(value.value) ||
      Buffer.byteLength(value.value, "utf8") > SANDBOX_SECURITY_MAX_TEXT_BYTES
    ) {
      return null;
    }

    return {
      source_id: value.source_id,
      claimed_source_type: value.claimed_source_type,
      media_type: "text/plain",
      value: value.value,
      provenance_ref: value.provenance_ref
    };
  }

  if (value.media_type !== "application/json") {
    return null;
  }

  const normalizedJson = cloneJson(value.value);
  if (normalizedJson === INVALID_JSON) {
    return null;
  }

  return {
    source_id: value.source_id,
    claimed_source_type: value.claimed_source_type,
    media_type: "application/json",
    value: normalizedJson,
    provenance_ref: value.provenance_ref
  };
}

function normalizeToolRequest(value: unknown): SandboxSecurityToolRequest | null {
  if (
    !hasExactOwnDataProperties(
      value,
      ["call_id", "tool_name", "arguments"],
      ["target"]
    ) ||
    !isIdentifier(value.call_id) ||
    !isToolName(value.tool_name) ||
    (Object.hasOwn(value, "target") && !isTarget(value.target))
  ) {
    return null;
  }

  const normalizedArguments = cloneJson(value.arguments);
  if (normalizedArguments === INVALID_JSON) {
    return null;
  }

  return {
    call_id: value.call_id,
    tool_name: value.tool_name,
    ...(Object.hasOwn(value, "target") ? { target: value.target as string } : {}),
    arguments: normalizedArguments
  };
}

function satisfiesStageMatrix(
  stage: SandboxSecurityRequest["stage"],
  contentItems: readonly SandboxSecuritySubmittedContentItem[],
  hasToolRequest: boolean
): boolean {
  const counts: Record<SandboxSecurityClaimedSourceType, number> = {
    system_instruction: 0,
    developer_instruction: 0,
    user_input: 0,
    retrieved_content: 0,
    memory_content: 0,
    model_output: 0
  };

  for (const item of contentItems) {
    counts[item.claimed_source_type] += 1;
  }

  if (
    counts.system_instruction > 1 ||
    counts.developer_instruction > 1 ||
    counts.retrieved_content > 32 ||
    counts.memory_content > 32
  ) {
    return false;
  }

  if (stage === "user_input") {
    return (
      counts.user_input === 1 &&
      counts.model_output === 0 &&
      !hasToolRequest
    );
  }

  if (stage === "model_output") {
    return (
      counts.user_input <= 1 &&
      counts.model_output === 1 &&
      !hasToolRequest
    );
  }

  return (
    counts.user_input <= 1 &&
    counts.model_output === 1 &&
    hasToolRequest
  );
}

export function normalizeSandboxSecurityRequest(
  value: unknown
): SandboxSecurityRequest | null {
  try {
    if (
      !hasExactOwnDataProperties(
        value,
        [
          "schema_version",
          "request_id",
          "stage",
          "policy_profile_id",
          "content_items"
        ],
        ["tool_request"]
      ) ||
      value.schema_version !== "sandbox-security-request.v1" ||
      !isIdentifier(value.request_id) ||
      !isCatalogValue(SANDBOX_SECURITY_STAGES, value.stage) ||
      !isCatalogValue(
        SANDBOX_SECURITY_POLICY_PROFILE_IDS,
        value.policy_profile_id
      ) ||
      !isDenseOrdinaryArray(
        value.content_items,
        SANDBOX_SECURITY_MAX_CONTENT_ITEMS
      ) ||
      value.content_items.length < 1
    ) {
      return null;
    }

    const contentItems: SandboxSecuritySubmittedContentItem[] = [];
    const sourceIds = new Set<string>();
    for (const item of value.content_items) {
      const normalizedItem = normalizeContentItem(item);
      if (normalizedItem === null || sourceIds.has(normalizedItem.source_id)) {
        return null;
      }
      sourceIds.add(normalizedItem.source_id);
      contentItems.push(normalizedItem);
    }

    const hasToolRequest = Object.hasOwn(value, "tool_request");
    const toolRequest = hasToolRequest
      ? normalizeToolRequest(value.tool_request)
      : undefined;
    if (
      (hasToolRequest && toolRequest === null) ||
      !satisfiesStageMatrix(value.stage, contentItems, hasToolRequest)
    ) {
      return null;
    }

    return {
      schema_version: "sandbox-security-request.v1",
      request_id: value.request_id,
      stage: value.stage,
      policy_profile_id: value.policy_profile_id,
      content_items: contentItems,
      ...(toolRequest === null || toolRequest === undefined
        ? {}
        : { tool_request: toolRequest })
    };
  } catch {
    return null;
  }
}
