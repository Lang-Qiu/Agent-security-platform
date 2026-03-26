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
