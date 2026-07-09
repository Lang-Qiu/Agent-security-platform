// Polls a URL until it responds with HTTP 200, or rejects after timeoutMs.
// Pure of Electron: usable standalone and unit-testable with node:test.
export async function waitForHealth(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 200;
  const fetchImpl = options.fetch ?? fetch;
  const deadline = Date.now() + timeoutMs;

  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url);
      if (response.status === 200) {
        return;
      }
      lastError = new Error(`Unexpected status ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for ${url} to become healthy: ${lastError?.message ?? "unknown error"}`
  );
}
