import { screen } from "@testing-library/react";
import { test, expect } from "vitest";

import { renderAppAtRoute } from "../test/app-test-harness";

test("overview page renders the platform snapshot, quick start, activity, and risk sections", async () => {
  const renderedApp = await renderAppAtRoute("/overview");

  expect(renderedApp).not.toBeNull();

  if (!renderedApp) {
    return;
  }

  expect(await screen.findByRole("heading", { level: 1, name: /overview/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: /platform snapshot/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: /quick start/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: /recent task activity/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: /risk posture/i })).toBeInTheDocument();
});
