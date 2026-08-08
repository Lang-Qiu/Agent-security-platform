import { isApiResponse } from "../../../shared/contracts/api-response";

export type DataSourceMode = "api-preferred" | "mock-only";
export type ApiRequestStatus = "ok" | "unavailable" | "invalid";

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  mode?: DataSourceMode;
}

export interface ApiRequestResult<T> {
  status: ApiRequestStatus;
  data: T | null;
}

function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch | null {
  return fetchImpl ?? globalThis.fetch ?? null;
}

export type SandboxSecurityCallResult<T> =
  | { kind: "ok"; data: T }
  | {
      kind: "error";
      httpStatus: number;
      errorCode: string | null;
      retryAfterSeconds: number | null;
    }
  | { kind: "invalid" }
  | { kind: "unavailable" };

export interface AuthenticatedRequestOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (headerValue === null) {
    return null;
  }
  const parsed = Number.parseInt(headerValue, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return Math.min(parsed, Number.MAX_SAFE_INTEGER);
}

function extractErrorCode(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "error_code" in payload) {
    const code = (payload as { error_code: unknown }).error_code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export async function requestAuthenticatedJson<T>(input: {
  path: string;
  method: "GET" | "POST";
  capabilityToken: string;
  idempotencyKey?: string;
  body?: unknown;
  normalize: (value: unknown) => T | null;
  options?: AuthenticatedRequestOptions;
}): Promise<SandboxSecurityCallResult<T>> {
  const fetchImpl = resolveFetchImpl(input.options?.fetchImpl);
  if (!fetchImpl) {
    return { kind: "unavailable" };
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.capabilityToken}`
  };
  const requestInit: RequestInit = {
    method: input.method,
    headers,
    signal: input.options?.signal
  };

  if (input.method === "POST") {
    headers["content-type"] = "application/json";
    if (input.idempotencyKey !== undefined) {
      headers["idempotency-key"] = input.idempotencyKey;
    }
    requestInit.body = JSON.stringify(input.body ?? {});
  }

  let response: Response;
  try {
    response = await fetchImpl(input.path, requestInit);
  } catch {
    return { kind: "unavailable" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    return {
      kind: "error",
      httpStatus: response.status,
      errorCode: extractErrorCode(payload),
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after"))
    };
  }

  if (!isApiResponse(payload)) {
    return { kind: "invalid" };
  }

  const normalizedData = input.normalize(payload.data);
  if (normalizedData === null) {
    return { kind: "invalid" };
  }

  return { kind: "ok", data: normalizedData };
}

export async function requestApiData<T>(input: {
  path: string;
  normalize: (value: unknown) => T | null;
  options?: ApiClientOptions;
}): Promise<T | null> {
  const result = await requestApiDataWithStatus(input);
  return result.data;
}

export async function requestApiDataWithStatus<T>(input: {
  path: string;
  normalize: (value: unknown) => T | null;
  options?: ApiClientOptions;
}): Promise<ApiRequestResult<T>> {
  const mode = input.options?.mode ?? "api-preferred";
  const fetchImpl = resolveFetchImpl(input.options?.fetchImpl);

  if (mode === "mock-only" || !fetchImpl) {
    return {
      status: "unavailable",
      data: null
    };
  }

  try {
    const response = await fetchImpl(input.path, {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: input.options?.signal
    });

    if (!response.ok) {
      return {
        status: "unavailable",
        data: null
      };
    }

    const payload = await response.json();

    if (!isApiResponse(payload)) {
      return {
        status: "invalid",
        data: null
      };
    }

    const normalizedData = input.normalize(payload.data);

    if (normalizedData === null) {
      return {
        status: "invalid",
        data: null
      };
    }

    return {
      status: "ok",
      data: normalizedData
    };
  } catch {
    return {
      status: "unavailable",
      data: null
    };
  }
}
