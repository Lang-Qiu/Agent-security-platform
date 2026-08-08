import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SANDBOX_SECURITY_ACTIONS,
  SANDBOX_SECURITY_RISK_CATEGORIES,
  SANDBOX_SECURITY_SEVERITIES,
  SANDBOX_SECURITY_VERDICTS
} from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";

describe("REQ-SBX-GENERAL-005 semantic value tag", () => {
  it("renders every verdict verbatim in English", () => {
    for (const verdict of SANDBOX_SECURITY_VERDICTS) {
      const { unmount } = render(
        <SandboxSecurityValueTag domain="verdict" value={verdict} />
      );
      expect(screen.getByText(verdict)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders every action verbatim in English", () => {
    for (const action of SANDBOX_SECURITY_ACTIONS) {
      const { unmount } = render(
        <SandboxSecurityValueTag domain="action" value={action} />
      );
      expect(screen.getByText(action)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders all nine risk categories", () => {
    expect(SANDBOX_SECURITY_RISK_CATEGORIES).toHaveLength(9);
    for (const category of SANDBOX_SECURITY_RISK_CATEGORIES) {
      const { unmount } = render(
        <SandboxSecurityValueTag domain="category" value={category} />
      );
      expect(screen.getByText(category)).toBeInTheDocument();
      unmount();
    }
  });

  it("distinguishes deny from allow by accessible text, not colour alone", () => {
    render(<SandboxSecurityValueTag domain="action" value="deny" />);
    render(<SandboxSecurityValueTag domain="action" value="allow" />);
    expect(screen.getByText("deny")).toBeInTheDocument();
    expect(screen.getByText("allow")).toBeInTheDocument();
  });

  it("maps severity to a distinct token per level", () => {
    const seen = new Set<string>();
    for (const severity of SANDBOX_SECURITY_SEVERITIES) {
      const { container, unmount } = render(
        <SandboxSecurityValueTag domain="severity" value={severity} />
      );
      const tag = container.querySelector("[data-severity]");
      expect(tag?.getAttribute("data-severity")).toBe(severity);
      seen.add(severity);
      unmount();
    }
    expect(seen.size).toBe(SANDBOX_SECURITY_SEVERITIES.length);
  });

  it("renders info as a valid risk level even though it is not a severity", () => {
    render(<SandboxSecurityValueTag domain="risk_level" value="info" />);
    expect(screen.getByText("info")).toBeInTheDocument();
  });
});
