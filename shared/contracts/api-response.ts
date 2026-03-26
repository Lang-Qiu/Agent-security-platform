import type { ApiResponse } from "../types/api-response.ts";
import { isBoolean, isPlainObject, isString } from "../utils/guards.ts";

export function createApiResponse<T>(value: {
  success?: boolean;
  message: string;
  data: T;
  error_code?: string | null;
  request_id: string;
}): ApiResponse<T> {
  return {
    success: value.success ?? true,
    message: value.message,
    data: value.data,
    error_code: value.error_code ?? null,
    request_id: value.request_id
  };
}

export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!isPlainObject(value)) {
    return false;
  }

  const maybeErrorCode = value.error_code;

  return (
    isBoolean(value.success) &&
    isString(value.message) &&
    "data" in value &&
    (maybeErrorCode === null || isString(maybeErrorCode)) &&
    isString(value.request_id)
  );
}
