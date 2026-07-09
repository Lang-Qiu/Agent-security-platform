import assert from "node:assert/strict";
import { test } from "node:test";

import { decideRouteKind, resolveStaticFilePath } from "../src/static-proxy-server.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("decideRouteKind routes /api/* and /health to the backend proxy", () => {
  assert.equal(decideRouteKind("/api/supervision/campaigns"), "proxy");
  assert.equal(decideRouteKind("/health"), "proxy");
});

test("decideRouteKind routes everything else to the static file server", () => {
  assert.equal(decideRouteKind("/review-demo"), "static");
  assert.equal(decideRouteKind("/assets/index.js"), "static");
  assert.equal(decideRouteKind("/"), "static");
});

test("resolveStaticFilePath serves an existing file directly", () => {
  const root = mkdtempSync(join(tmpdir(), "review-demo-static-"));
  writeFileSync(join(root, "app.js"), "console.log(1)");

  const resolved = resolveStaticFilePath(root, "/app.js");

  assert.equal(resolved, join(root, "app.js"));
});

test("resolveStaticFilePath falls back to index.html for client-side routes", () => {
  const root = mkdtempSync(join(tmpdir(), "review-demo-static-"));
  writeFileSync(join(root, "index.html"), "<html></html>");

  const resolved = resolveStaticFilePath(root, "/review-demo");

  assert.equal(resolved, join(root, "index.html"));
});

test("resolveStaticFilePath rejects path traversal attempts", () => {
  const root = mkdtempSync(join(tmpdir(), "review-demo-static-"));
  writeFileSync(join(root, "index.html"), "<html></html>");

  const resolved = resolveStaticFilePath(root, "/../../../etc/passwd");

  assert.equal(resolved, join(root, "index.html"));
});
