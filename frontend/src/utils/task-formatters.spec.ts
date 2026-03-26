import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const formatterModulePath = resolve(import.meta.dirname, "./task-formatters.ts");
const formatterModuleUrl = pathToFileURL(formatterModulePath);

describe("task formatters", () => {
  test("shared task formatter module exposes stable task type and timestamp labels", async () => {
    assert.equal(
      existsSync(formatterModulePath),
      true,
      "shared task formatter module should exist before page formatting can be centralized"
    );

    const formatters = (await import(formatterModuleUrl.href)) as {
      formatTaskTypeLabel: (taskType: "asset_scan" | "static_analysis" | "sandbox_run") => string;
      formatTaskTimestamp: (value: string) => string;
    };

    expect(formatters.formatTaskTypeLabel("asset_scan")).toBe("Asset Scan");
    expect(formatters.formatTaskTypeLabel("static_analysis")).toBe("Static Analysis");
    expect(formatters.formatTaskTypeLabel("sandbox_run")).toBe("Sandbox Run");
    expect(formatters.formatTaskTimestamp("2026-03-26T09:15:00Z")).toMatch(/Mar 26, 09:15/);
  });
});
