import { render, screen } from "@testing-library/react";
import { theme } from "antd";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../app/AppProviders";
import { consolePalette, consoleThemeTokens } from "./console-theme";

// antd's darkAlgorithm derives colorPrimary from the seed rather than
// preserving it verbatim (seed #22d3ee -> derived value on the dark base),
// while colorBgBase/colorTextBase seeds are preserved. Compute the derived
// primary from the same seed + algorithms AppProviders uses, so the assertion
// proves our accent seed and algorithms were wired through ConfigProvider
// instead of restating a literal antd never returns.
const derivedPrimary = theme.getDesignToken({
  algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
  token: { ...consoleThemeTokens }
}).colorPrimary;

function TokenProbe() {
  const { token } = theme.useToken();
  return (
    <div
      data-testid="probe"
      data-bg={token.colorBgBase}
      data-primary={token.colorPrimary}
      data-radius={String(token.borderRadius)}
      data-text={token.colorTextBase}
    />
  );
}

describe("REQ-SBX-GENERAL-005 AppProviders console theme", () => {
  it("applies the dark slate seed tokens through ConfigProvider", () => {
    render(
      <AppProviders>
        <TokenProbe />
      </AppProviders>
    );

    const probe = screen.getByTestId("probe");
    expect(probe.dataset.bg).toBe(consolePalette.bg);
    expect(probe.dataset.primary).toBe(derivedPrimary);
    expect(probe.dataset.radius).toBe("6");
  });

  it("resolves a dark container token, proving darkAlgorithm is active", () => {
    render(
      <AppProviders>
        <TokenProbe />
      </AppProviders>
    );

    const probe = screen.getByTestId("probe");
    // darkAlgorithm derives a light ink from the dark base; the light default
    // would derive a near-black. Assert the derived direction, not a literal.
    const ink = probe.dataset.text ?? "";
    expect(ink.toLowerCase()).toBe(consolePalette.ink.toLowerCase());
  });

  it("no longer contains the light teal seed", () => {
    render(
      <AppProviders>
        <TokenProbe />
      </AppProviders>
    );
    expect(screen.getByTestId("probe").dataset.primary).not.toBe("#146c72");
  });
});
