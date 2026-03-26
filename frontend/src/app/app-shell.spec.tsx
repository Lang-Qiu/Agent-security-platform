import { screen } from "@testing-library/react";
import { test, expect } from "vitest";

import { renderAppAtRoute } from "../test/app-test-harness";

test("app shell renders the console layout and redirects the root route to overview", async () => {
  const renderedApp = await renderAppAtRoute("/");

  expect(renderedApp).not.toBeNull();

  if (!renderedApp) {
    return;
  }

  expect(await screen.findByRole("banner")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: /console navigation/i })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { level: 1, name: /overview/i })).toBeInTheDocument();
});
