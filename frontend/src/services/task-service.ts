import type { ApiResponse } from "../../../shared/types/api-response";
import type { Task } from "../../../shared/types/task";
import { taskQueueMocks } from "../mocks/tasks";

const TASKS_ENDPOINT = "/api/tasks";

export async function listTasks(input: {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<Task[]> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) {
    return taskQueueMocks;
  }

  try {
    const response = await fetchImpl(TASKS_ENDPOINT, {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: input.signal
    });

    if (!response.ok) {
      return taskQueueMocks;
    }

    const payload = (await response.json()) as ApiResponse<Task[]>;

    if (!payload.success || !Array.isArray(payload.data)) {
      return taskQueueMocks;
    }

    return payload.data;
  } catch {
    return taskQueueMocks;
  }
}
