import { describe, expect, it } from "vitest";

import {
  consolePalette,
  consoleThemeTokens,
  contrastRatio
} from "./console-theme";

describe("REQ-SBX-GENERAL-005 console theme tokens", () => {
  it("exposes the locked dark slate seed tokens", () => {
    expect(consoleThemeTokens.colorPrimary).toBe("#22d3ee");
    expect(consoleThemeTokens.colorBgBase).toBe("#0d1520");
    expect(consoleThemeTokens.colorTextBase).toBe("#e4edf5");
    expect(consoleThemeTokens.borderRadius).toBe(6);
  });

  it("keeps every text token at or above WCAG AA 4.5 on bg and surface", () => {
    const textTokens = [
      "ink",
      "muted",
      "mutedDim",
      "accent",
      "severityCritical",
      "severityHigh",
      "severityMedium",
      "severityLow",
      "severityInfo",
      "actionAllow",
      "actionDeny"
    ] as const;

    for (const token of textTokens) {
      const value = consolePalette[token];
      expect(
        contrastRatio(value, consolePalette.bg),
        `${token} on bg`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(value, consolePalette.surface),
        `${token} on surface`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the interactive control border at or above WCAG 1.4.11 3:1", () => {
    expect(
      contrastRatio(consolePalette.borderInteractive, consolePalette.bg)
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(consolePalette.borderInteractive, consolePalette.surface)
    ).toBeGreaterThanOrEqual(3);
  });

  it("rejects the earlier muted-dim draft that failed AA body text", () => {
    expect(consolePalette.mutedDim).not.toBe("#6b7f94");
    expect(contrastRatio("#6b7f94", consolePalette.bg)).toBeLessThan(4.5);
  });

  it("computes a known contrast ratio correctly", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#0d1520", "#0d1520")).toBeCloseTo(1, 5);
  });
});
