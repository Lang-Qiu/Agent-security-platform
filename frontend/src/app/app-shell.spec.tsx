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

test("app shell does not expose a hard-coded mock mode badge in the global header", async () => {
  const renderedApp = await renderAppAtRoute("/");

  expect(renderedApp).not.toBeNull();

  if (!renderedApp) {
    return;
  }

  expect(await screen.findByRole("banner")).toBeInTheDocument();
  expect(screen.queryByText(/mock data mode/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create task/i })).toBeInTheDocument();
});
