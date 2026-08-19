import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { LandingNav } from "./LandingNav";

test("LandingNav traps focus, closes by Escape, and restores document state", () => {
  const originalOverflow = document.body.style.overflow;
  const view = render(
    <MemoryRouter>
      <LandingNav />
    </MemoryRouter>
  );
  const trigger = screen.getByRole("button", { name: /open navigation/i });

  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: /landing navigation/i });
  const close = within(dialog).getByRole("button", { name: /close navigation/i });
  const links = within(dialog).getAllByRole("link");

  expect(close).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(links.at(-1)).toHaveFocus();
  links.at(-1)?.focus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(close).toHaveFocus();

  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe(originalOverflow);

  fireEvent.click(trigger);
  view.unmount();
  expect(document.body.style.overflow).toBe(originalOverflow);
});

test("LandingNav exposes only approved product anchors and Console route", () => {
  render(
    <MemoryRouter>
      <LandingNav />
    </MemoryRouter>
  );

  expect(screen.getByRole("navigation", { name: /product navigation/i })).toBeVisible();
  expect(screen.getByRole("link", { name: /agent security platform home/i }))
    .toHaveAttribute("href", "#top");
  expect(screen.getByRole("link", { name: /launch security console/i }))
    .toHaveAttribute("href", "/console");
  expect(screen.queryByRole("navigation", { name: /console navigation/i }))
    .not.toBeInTheDocument();
});
