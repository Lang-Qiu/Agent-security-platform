import { screen, within } from "@testing-library/react";
import { test, expect } from "vitest";

import { renderAppAtRoute } from "../test/app-test-harness";

test("console menu renders overview, tasks, and result navigation anchors", async () => {
  const renderedApp = await renderAppAtRoute("/results/static-analysis");

  expect(renderedApp).not.toBeNull();

  if (!renderedApp) {
    return;
  }

  const navigation = screen.getByRole("navigation", { name: /console navigation/i });

  expect(within(navigation).getByText("Overview")).toBeInTheDocument();
  expect(within(navigation).getByText("Tasks")).toBeInTheDocument();
  expect(within(navigation).getByText("Asset Results")).toBeInTheDocument();
  expect(within(navigation).getByText("Static Analysis")).toBeInTheDocument();
  expect(within(navigation).getByText("Sandbox Alerts")).toBeInTheDocument();
});
