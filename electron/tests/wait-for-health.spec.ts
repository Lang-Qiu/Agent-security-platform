import assert from "node:assert/strict";
import { test } from "node:test";

import { waitForHealth } from "../src/wait-for-health.mjs";

test("waitForHealth resolves as soon as fetch returns 200", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return { status: 200 };
  };

  await waitForHealth("http://127.0.0.1:9/health", { fetch: fakeFetch, timeoutMs: 1000, intervalMs: 10 });

  assert.equal(calls, 1);
});

test("waitForHealth retries on non-200 and rejection until it succeeds", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error("ECONNREFUSED");
    }
    if (calls === 2) {
      return { status: 503 };
    }
    return { status: 200 };
  };

  await waitForHealth("http://127.0.0.1:9/health", { fetch: fakeFetch, timeoutMs: 1000, intervalMs: 5 });

  assert.equal(calls, 3);
});

test("waitForHealth rejects after the timeout elapses", async () => {
  const fakeFetch = async () => {
    throw new Error("ECONNREFUSED");
  };

  await assert.rejects(
    () => waitForHealth("http://127.0.0.1:9/health", { fetch: fakeFetch, timeoutMs: 50, intervalMs: 10 }),
    /Timed out waiting for/
  );
});
