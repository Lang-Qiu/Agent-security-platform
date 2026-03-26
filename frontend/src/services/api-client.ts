import { isApiResponse } from "../../../shared/contracts/api-response";

export type DataSourceMode = "api-preferred" | "mock-only";

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  mode?: DataSourceMode;
}

function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch | null {
  return fetchImpl ?? globalThis.fetch ?? null;
}

export async function requestApiData<T>(input: {
  path: string;
  normalize: (value: unknown) => T | null;
  options?: ApiClientOptions;
}): Promise<T | null> {
  const mode = input.options?.mode ?? "api-preferred";
  const fetchImpl = resolveFetchImpl(input.options?.fetchImpl);

  if (mode === "mock-only" || !fetchImpl) {
    return null;
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
      return null;
    }

    const payload = await response.json();

    if (!isApiResponse(payload)) {
      return null;
    }

    return input.normalize(payload.data);
  } catch {
    return null;
  }
}
