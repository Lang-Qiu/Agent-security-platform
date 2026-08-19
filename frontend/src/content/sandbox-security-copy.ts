import {
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_JSON_NODES,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
  SANDBOX_SECURITY_MAX_TEXT_BYTES,
  type SandboxSecurityRiskCategory
} from "../../../shared/types/sandbox-security";
import type { SandboxSecurityCallResult } from "../services/api-client";

/**
 * One human-facing sentence per risk category, for the RISK FINDINGS summary
 * column.
 *
 * This copy is deliberately CLIENT-SIDE and deliberately keyed on `category`
 * alone. Two reasons, both contractual:
 *
 * 1. `reason_code` is mechanically `sandbox_security_${category}`, so it carries
 *    no information a category-keyed map does not already have. A server-sent
 *    summary string would duplicate an existing enum.
 * 2. A summary produced from what a detector actually matched would carry
 *    matched content out of the engine and into the decision payload, breaking
 *    the content-free rendering guarantee the privacy suite enforces. Keeping
 *    the sentence here means it is derived from the category enum only and can
 *    never quote a submitted value.
 *
 * Each sentence therefore describes the CATEGORY OF RISK, never the evidence.
 */
const RISK_CATEGORY_SUMMARY: Record<SandboxSecurityRiskCategory, string> = {
  prompt_injection: "检测到试图注入指令、覆盖既有约束的模式。",
  jailbreak: "检测到试图绕过安全策略与角色限制的模式。",
  instruction_override: "检测到试图替换或压制上层指令的模式。",
  privilege_escalation: "检测到试图获取超出当前授权范围能力的模式。",
  sensitive_data_exposure: "检测到可能导致敏感数据或个人标识外泄的模式。",
  tool_hijacking: "检测到试图劫持工具调用或篡改调用参数的模式。",
  unsafe_side_effect: "检测到可能产生不可逆或高风险副作用的模式。",
  memory_poisoning: "检测到试图污染长期记忆或检索内容的模式。",
  trust_boundary_violation: "检测到跨越信任边界、混用不同来源权限的模式。"
};

const UNKNOWN_CATEGORY_SUMMARY = "检测到不属于既有类别的风险模式。";

/**
 * Maps a finding's risk category to one human-facing Chinese sentence. Derived
 * from the category enum only: it never receives, quotes, or paraphrases a
 * submitted value, a matched substring, or a byte offset.
 */
export function describeSandboxSecurityRiskCategory(category: string): string {
  return category in RISK_CATEGORY_SUMMARY
    ? RISK_CATEGORY_SUMMARY[category as SandboxSecurityRiskCategory]
    : UNKNOWN_CATEGORY_SUMMARY;
}

/**
 * The fifteen documented GENERAL-003 error codes, in the order of the API
 * contract Status And Error Table. Enum/identifier values stay English per
 * metadata.md; only human-facing title/remedy copy is Chinese.
 */
export const SANDBOX_SECURITY_ERROR_CODES = [
  "SANDBOX_SECURITY_INVALID_REQUEST",
  "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID",
  "SANDBOX_SECURITY_UNAUTHORIZED",
  "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED",
  "SANDBOX_SECURITY_FORBIDDEN",
  "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND",
  "SANDBOX_SECURITY_REQUEST_TIMEOUT",
  "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT",
  "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS",
  "SANDBOX_SECURITY_BODY_TOO_LARGE",
  "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE",
  "SANDBOX_SECURITY_RATE_LIMITED",
  "SANDBOX_SECURITY_CONCURRENCY_LIMITED",
  "SANDBOX_SECURITY_INTERNAL_ERROR",
  "SANDBOX_SECURITY_STORAGE_UNAVAILABLE"
] as const;

export type SandboxSecurityErrorCode = (typeof SANDBOX_SECURITY_ERROR_CODES)[number];

export interface SandboxSecurityFailureCopy {
  title: string;
  remedy: string;
  requiresNewCapability: boolean;
  requiresNewIdempotencyKey: boolean;
  retryAfterSeconds: number | null;
}

interface CopyEntry {
  title: string;
  remedy: string;
}

const ERROR_COPY: Record<SandboxSecurityErrorCode, CopyEntry> = {
  SANDBOX_SECURITY_INVALID_REQUEST: {
    title: "请求格式无效",
    remedy: "请检查评估内容与字段格式后重试。"
  },
  SANDBOX_SECURITY_AUDIT_CURSOR_INVALID: {
    title: "审计游标无效",
    remedy: "请返回首页重新加载审计事件列表。"
  },
  SANDBOX_SECURITY_UNAUTHORIZED: {
    title: "凭证无效或已过期",
    remedy: "请重新粘贴有效的能力凭证。"
  },
  SANDBOX_SECURITY_ADMIN_UNAUTHORIZED: {
    title: "管理员凭证无效",
    remedy: "请联系管理员获取有效的引导凭证。"
  },
  SANDBOX_SECURITY_FORBIDDEN: {
    title: "凭证权限不足",
    remedy: "请重新粘贴具备所需范围、阶段与策略的能力凭证。"
  },
  SANDBOX_SECURITY_CAPABILITY_NOT_FOUND: {
    title: "目标能力不存在",
    remedy: "请确认能力标识后重试。"
  },
  SANDBOX_SECURITY_REQUEST_TIMEOUT: {
    title: "请求超时",
    remedy: "请稍后使用新的幂等键重试。"
  },
  SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT: {
    title: "幂等键冲突",
    remedy: "同一凭证与幂等键对应不同请求内容，请使用新的幂等键重试。"
  },
  SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS: {
    title: "相同请求正在处理",
    remedy: "相同请求正在执行，请稍候再查看结果。"
  },
  SANDBOX_SECURITY_BODY_TOO_LARGE: {
    title: "请求体过大",
    remedy: "请减少内容条目或单条内容体积后重试。"
  },
  SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE: {
    title: "媒体类型不受支持",
    remedy: "请使用 application/json 提交请求。"
  },
  SANDBOX_SECURITY_RATE_LIMITED: {
    title: "请求过于频繁",
    remedy: "请在稍后按提示的等待时间重试。"
  },
  SANDBOX_SECURITY_CONCURRENCY_LIMITED: {
    title: "评估并发已满",
    remedy: "请稍后重试，当前评估槽位已被占用。"
  },
  SANDBOX_SECURITY_INTERNAL_ERROR: {
    title: "服务内部错误",
    remedy: "请稍后重试；若持续出现请联系管理员。"
  },
  SANDBOX_SECURITY_STORAGE_UNAVAILABLE: {
    title: "存储暂不可用",
    remedy: "请在稍后按提示的等待时间重试。"
  }
};

const CAPABILITY_CODES = new Set<string>([
  "SANDBOX_SECURITY_UNAUTHORIZED",
  "SANDBOX_SECURITY_FORBIDDEN"
]);

const IDEMPOTENCY_KEY_CODES = new Set<string>([
  "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT"
]);

const UNKNOWN_ERROR: CopyEntry = {
  title: "请求失败",
  remedy: "请稍后重试；若持续出现请联系管理员。"
};

const INVALID_COPY: CopyEntry = {
  title: "响应无法校验",
  remedy: "服务返回的数据未通过校验，请稍后重试。"
};

const INVALID_TOKEN_COPY: CopyEntry = {
  title: "令牌格式无效",
  remedy: "请重新粘贴能力令牌，确保令牌前后和内部没有换行或控制字符。"
};

const UNAVAILABLE_COPY: CopyEntry = {
  title: "服务不可达",
  remedy: "网络或服务暂时不可用，请检查连接后重试。"
};

/**
 * Client-side pre-flight violation rules emitted by
 * `validateEvaluationRequest` plus the two page-level gates
 * (`capability_required`, `content_empty`). Kept in one closed catalog so a new
 * rule cannot reach the operator as a disabled button with no explanation.
 */
export const SANDBOX_SECURITY_VIOLATION_RULES = [
  "capability_required",
  "content_empty",
  "content_items",
  "text_bytes",
  "json_depth",
  "json_nodes",
  "request_bytes",
  "tool_request_required"
] as const;

export type SandboxSecurityViolationRule =
  (typeof SANDBOX_SECURITY_VIOLATION_RULES)[number];

const VIOLATION_COPY: Record<SandboxSecurityViolationRule, string> = {
  capability_required: "请先粘贴能力令牌。",
  content_empty: "每个来源的内容值都不能为空。",
  content_items: `内容条目数必须在 1 到 ${SANDBOX_SECURITY_MAX_CONTENT_ITEMS} 之间。`,
  text_bytes: `单条文本内容超出 ${SANDBOX_SECURITY_MAX_TEXT_BYTES} 字节上限。`,
  json_depth: `JSON 嵌套深度超出 ${SANDBOX_SECURITY_MAX_JSON_DEPTH} 层上限。`,
  json_nodes: `JSON 节点数超出 ${SANDBOX_SECURITY_MAX_JSON_NODES} 个上限。`,
  request_bytes: `请求整体超出 ${SANDBOX_SECURITY_MAX_REQUEST_BYTES} 字节上限。`,
  tool_request_required: "tool_request 阶段必须填写工具调用信息。"
};

const UNKNOWN_VIOLATION = "请求未通过客户端预检，请检查表单内容。";

/**
 * Maps a client-side pre-flight violation to human-facing Chinese copy. The
 * returned string names only the failing rule, its shared numeric bound, and at
 * most the item's `source_id` — never the submitted value, a substring, or a
 * byte offset.
 */
export function describeSandboxSecurityViolation(violation: {
  rule: string;
  sourceId?: string;
}): string {
  const base =
    violation.rule in VIOLATION_COPY
      ? VIOLATION_COPY[violation.rule as SandboxSecurityViolationRule]
      : UNKNOWN_VIOLATION;
  return violation.sourceId === undefined
    ? base
    : `${base}（来源 ${violation.sourceId}）`;
}

/**
 * Maps a failed call result to human-facing Chinese copy. Never surfaces a
 * server message, token, or submitted content; copy never instructs the
 * operator to place a token in a URL or persist it anywhere.
 */
export function describeSandboxSecurityFailure(
  result: Exclude<SandboxSecurityCallResult<unknown>, { kind: "ok" }>
): SandboxSecurityFailureCopy {
  if (result.kind === "invalid") {
    return {
      ...INVALID_COPY,
      requiresNewCapability: false,
      requiresNewIdempotencyKey: false,
      retryAfterSeconds: null
    };
  }

  if (result.kind === "invalid_token") {
    return {
      ...INVALID_TOKEN_COPY,
      requiresNewCapability: false,
      requiresNewIdempotencyKey: false,
      retryAfterSeconds: null
    };
  }

  if (result.kind === "unavailable") {
    return {
      ...UNAVAILABLE_COPY,
      requiresNewCapability: false,
      requiresNewIdempotencyKey: false,
      retryAfterSeconds: null
    };
  }

  const code = result.errorCode;
  const entry =
    code !== null && code in ERROR_COPY
      ? ERROR_COPY[code as SandboxSecurityErrorCode]
      : UNKNOWN_ERROR;

  return {
    title: entry.title,
    remedy: entry.remedy,
    requiresNewCapability: code !== null && CAPABILITY_CODES.has(code),
    requiresNewIdempotencyKey: code !== null && IDEMPOTENCY_KEY_CODES.has(code),
    retryAfterSeconds: result.retryAfterSeconds
  };
}
