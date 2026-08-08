import {
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_JSON_NODES,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
  SANDBOX_SECURITY_MAX_TEXT_BYTES
} from "../../../shared/types/sandbox-security";

const utf8Encoder = new TextEncoder();

/** Measures UTF-8 byte length, not UTF-16 code-unit count. */
export function measureUtf8Bytes(value: string): number {
  return utf8Encoder.encode(value).length;
}

/**
 * Measures the nesting depth of a JSON-compatible value. Scalars are depth 0;
 * a container is 1 + the max depth of its children. Arrays and objects are
 * treated alike. Cyclic references are guarded with a visited set so the
 * function never recurses unboundedly.
 */
export function measureJsonDepth(value: unknown): number {
  const visited = new Set<object>();
  const walk = (node: unknown): number => {
    if (node === null || typeof node !== "object") return 0;
    if (visited.has(node as object)) return 0;
    visited.add(node as object);
    let deepest = 0;
    const children = Array.isArray(node)
      ? node
      : Object.values(node as Record<string, unknown>);
    for (const child of children) {
      const childDepth = walk(child);
      if (childDepth > deepest) deepest = childDepth;
    }
    visited.delete(node as object);
    return 1 + deepest;
  };
  return walk(value);
}

/**
 * Counts every node in a JSON-compatible value: the value itself plus each
 * nested value. Shared or cyclic references are counted once via a visited set.
 */
export function countJsonNodes(value: unknown): number {
  const visited = new Set<object>();
  const walk = (node: unknown): number => {
    if (node === null || typeof node !== "object") return 1;
    if (visited.has(node as object)) return 1;
    visited.add(node as object);
    let total = 1;
    const children = Array.isArray(node)
      ? node
      : Object.values(node as Record<string, unknown>);
    for (const child of children) {
      total += walk(child);
    }
    return total;
  };
  return walk(value);
}

export interface EvaluationContentItemInput {
  source_id: string;
  claimed_source_type: string;
  media_type: string;
  value: unknown;
  provenance_ref: string;
}

export interface EvaluationRequestInput {
  stage: string;
  contentItems: EvaluationContentItemInput[];
  toolRequest?: unknown;
}

export interface LimitViolation {
  rule: string;
  sourceId?: string;
}

export interface LimitValidationResult {
  ok: boolean;
  violations: LimitViolation[];
}

/**
 * Client-side pre-flight against the shared engine bounds. A violation names
 * only the failing rule and at most the item's source_id — never the submitted
 * value, a substring, or a byte offset.
 */
export function validateEvaluationRequest(
  input: EvaluationRequestInput
): LimitValidationResult {
  const violations: LimitViolation[] = [];
  const items = Array.isArray(input.contentItems) ? input.contentItems : [];

  if (items.length === 0 || items.length > SANDBOX_SECURITY_MAX_CONTENT_ITEMS) {
    violations.push({ rule: "content_items" });
  }

  for (const item of items) {
    if (item.media_type === "application/json") {
      if (measureJsonDepth(item.value) > SANDBOX_SECURITY_MAX_JSON_DEPTH) {
        violations.push({ rule: "json_depth", sourceId: item.source_id });
      }
      if (countJsonNodes(item.value) > SANDBOX_SECURITY_MAX_JSON_NODES) {
        violations.push({ rule: "json_nodes", sourceId: item.source_id });
      }
    } else if (typeof item.value === "string") {
      if (measureUtf8Bytes(item.value) > SANDBOX_SECURITY_MAX_TEXT_BYTES) {
        violations.push({ rule: "text_bytes", sourceId: item.source_id });
      }
    }
  }

  let requestBytes = 0;
  try {
    requestBytes = measureUtf8Bytes(
      JSON.stringify({
        stage: input.stage,
        content_items: items,
        tool_request: input.toolRequest ?? null
      })
    );
  } catch {
    requestBytes = Number.POSITIVE_INFINITY;
  }
  if (requestBytes > SANDBOX_SECURITY_MAX_REQUEST_BYTES) {
    violations.push({ rule: "request_bytes" });
  }

  if (input.stage === "tool_request" && input.toolRequest === undefined) {
    violations.push({ rule: "tool_request_required" });
  }

  return { ok: violations.length === 0, violations };
}
