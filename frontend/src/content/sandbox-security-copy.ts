import type { SandboxSecurityCallResult } from "../services/api-client";

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

const UNAVAILABLE_COPY: CopyEntry = {
  title: "服务不可达",
  remedy: "网络或服务暂时不可用，请检查连接后重试。"
};

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
