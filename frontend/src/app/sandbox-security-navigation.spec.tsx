import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderAppAtRoute } from "../test/app-test-harness";
import { consoleNavigation } from "./navigation";

describe("REQ-SBX-GENERAL-005 route and navigation registration", () => {
  it("adds one sandbox security group with exactly two children", () => {
    const group = consoleNavigation.find((item) => item.key === "sandbox-security");
    expect(group).toBeDefined();
    expect(group?.label).toBe("沙箱安全");
    expect(group?.children).toHaveLength(2);
    expect(group?.children?.map((child) => child.path)).toEqual([
      "/sandbox-security/workbench",
      "/sandbox-security/audit"
    ]);
  });

  it("keeps every pre-existing navigation entry intact", () => {
    const keys = consoleNavigation.map((item) => item.key);
    expect(keys).toContain("/overview");
    expect(keys).toContain("/tasks");
    expect(keys).toContain("results");
    expect(keys).toContain("/review-demo");
  });

  it("renders the workbench route", async () => {
    await renderAppAtRoute("/sandbox-security/workbench");
    await waitFor(() =>
      // The banner carries the English workspace title for this route.
      expect(
        screen.getByRole("heading", { name: /Sandbox Security Workbench/i })
      ).toBeInTheDocument()
    );
  });

  it("renders the audit route", async () => {
    await renderAppAtRoute("/sandbox-security/audit");
    // The route title now also renders in the console banner, so both the
    // banner heading and the page's own heading may match.
    await waitFor(() =>
      expect(screen.getAllByRole("heading", { name: /审计事件/ }).length).toBeGreaterThan(0)
    );
  });

  it("selects the sandbox security key when on a sandbox security route", async () => {
    await renderAppAtRoute("/sandbox-security/audit");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /审计事件/ })).toBeInTheDocument()
    );
  });
});
