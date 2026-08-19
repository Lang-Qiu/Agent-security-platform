import { screen, waitFor } from "@testing-library/react";
import { test, expect } from "vitest";

import { renderAppAtRoute } from "../test/app-test-harness";

test("app shell renders the public landing page at the root route", async () => {
  const renderedApp = await renderAppAtRoute("/");

  expect(renderedApp).not.toBeNull();

  if (!renderedApp) {
    return;
  }

  const heading = await screen.findByRole("heading", {
    level: 1,
    name: "Secure every decision your agents make."
  });
  const main = screen.getByRole("main");
  const landingPage = renderedApp.container.querySelector(".landing-page");

  expect(heading).toBeInTheDocument();
  expect(main).toHaveAttribute("id", "landing-content");
  expect(landingPage).toContainElement(main);
  expect.soft(screen.getByRole("link", { name: /skip to content/i })).toHaveClass(
    "landing-skip-link"
  );
  for (const consoleLink of screen.getAllByRole("link", {
    name: /launch security console/i
  })) {
    expect.soft(consoleLink).toHaveAttribute("href", "/console");
  }
  expect(screen.queryByRole("navigation", { name: /console navigation/i })).not.toBeInTheDocument();
});

test("app shell replaces the console entry route with overview", async () => {
  const renderedApp = await renderAppAtRoute("/console");

  expect(renderedApp).not.toBeNull();

  if (!renderedApp) {
    return;
  }

  expect(await screen.findByRole("navigation", { name: /console navigation/i })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { level: 1, name: /overview/i })).toBeInTheDocument();
  expect(renderedApp.router.state.location.pathname).toBe("/overview");
  expect(renderedApp.router.state.historyAction).toBe("REPLACE");
});

test("app shell preserves the overview console header actions without a mock mode badge", async () => {
  const renderedApp = await renderAppAtRoute("/overview");

  expect(renderedApp).not.toBeNull();

  if (!renderedApp) {
    return;
  }

  expect(await screen.findByRole("banner")).toBeInTheDocument();
  expect(screen.queryByText(/mock data mode/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create task/i })).toBeInTheDocument();
});

test("app shell gives Landing and Console distinct document titles", async () => {
  const landing = await renderAppAtRoute("/");

  await waitFor(() => expect(document.title).toBe("Agent Security Platform"));
  landing?.unmount();

  await renderAppAtRoute("/overview");
  await waitFor(() =>
    expect(document.title).toBe("Agent Security Platform Console")
  );
});
