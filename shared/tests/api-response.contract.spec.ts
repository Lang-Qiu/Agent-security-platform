import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const sharedEntrypointPath = resolve(import.meta.dirname, "../index.ts");

type SharedModule = {
  createApiResponse?: <T>(value: {
    success?: boolean;
    message: string;
    data: T;
    error_code?: string | null;
    request_id: string;
  }) => unknown;
  isApiResponse?: (value: unknown) => boolean;
};

async function loadSharedModule(): Promise<SharedModule | null> {
  if (!existsSync(sharedEntrypointPath)) {
    return null;
  }

  return import(pathToFileURL(sharedEntrypointPath).href);
}

test("api response contract creates the fixed response shell expected by frontend and backend", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before the API response shell can be created");

  if (!sharedModule) {
    return;
  }

  const response = sharedModule.createApiResponse?.({
    message: "Task fetched successfully",
    data: {
      task_id: "task_001"
    },
    request_id: "req_001"
  });

  assert.deepEqual(response, {
    success: true,
    message: "Task fetched successfully",
    data: {
      task_id: "task_001"
    },
    error_code: null,
    request_id: "req_001"
  });
});

test("api response contract rejects objects that do not expose the shared outer fields", async () => {
  const sharedModule = await loadSharedModule();

  assert.notEqual(sharedModule, null, "shared/index.ts should exist before the API response shell can be validated");

  if (!sharedModule) {
    return;
  }

  assert.equal(
    sharedModule.isApiResponse?.({
      success: true,
      message: "ok",
      data: null,
      error_code: null,
      request_id: "req_001"
    }),
    true
  );

  assert.equal(
    sharedModule.isApiResponse?.({
      success: true,
      message: "ok",
      payload: null,
      error_code: null,
      request_id: "req_001"
    }),
    false
  );
});
