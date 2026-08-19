import { fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { renderAppAtRoute } from "../test/app-test-harness";

test("Product Landing exposes one bilingual Discover Analyze Contain narrative", async () => {
  await renderAppAtRoute("/");

  expect(await screen.findAllByRole("heading", { level: 1 })).toHaveLength(1);
  const main = screen.getByRole("main");
  const landingRoot = document.querySelector(".landing-page");

  expect(main).toHaveAttribute("id", "landing-content");
  expect(main).toHaveAttribute("lang", "zh-CN");
  expect(landingRoot).toContainElement(main);
  expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "en");
  expect(screen.getByText(/从发现暴露面/)).toBeVisible();
  expect(
    screen.getByRole("heading", { level: 2, name: /map the agent attack surface/i })
  ).toBeVisible();
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: /understand what a skill can really do/i
    })
  ).toBeVisible();
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: /observe agent behavior at runtime/i
    })
  ).toBeVisible();
  expect(screen.getByText("DISCOVER. ANALYZE. CONTAIN.")).toBeVisible();
  expect(
    screen.getAllByText(/ONE PLATFORM\. THREE SECURITY LAYERS\./)
  ).toHaveLength(2);
  expect(
    screen.getAllByRole("link", { name: /launch security console/i })[0]
  ).toHaveAttribute("href", "/console");

  const headingLevels = screen.getAllByRole("heading").map((heading) =>
    Number(heading.tagName.slice(1))
  );
  expect(headingLevels[0]).toBe(1);
  for (let index = 1; index < headingLevels.length; index += 1) {
    expect(headingLevels[index] - headingLevels[index - 1]).toBeLessThanOrEqual(1);
  }
});

test("Product Landing operates skip and mobile navigation accessibly", async () => {
  const originalOverflow = document.body.style.overflow;
  const app = await renderAppAtRoute("/");
  const main = screen.getByRole("main");
  const skipLink = screen.getByRole("link", { name: /skip to content/i });

  expect(skipLink).toHaveAttribute("href", "#landing-content");
  fireEvent.click(skipLink);
  expect(main).toHaveFocus();

  const trigger = screen.getByRole("button", { name: /open navigation/i });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: /landing navigation/i });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(document.body.style.overflow).toBe("hidden");

  const close = within(dialog).getByRole("button", { name: /close navigation/i });
  const dialogLinks = within(dialog).getAllByRole("link");
  close.focus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(dialogLinks.at(-1)).toHaveFocus();
  dialogLinks.at(-1)?.focus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(close).toHaveFocus();

  fireEvent.click(close);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe(originalOverflow);
  expect(trigger).toHaveFocus();

  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();

  fireEvent.click(trigger);
  app.unmount();
  expect(document.body.style.overflow).toBe(originalOverflow);
});

test("Product Landing presents truthful platform proof, architecture evidence, and closure", async () => {
  await renderAppAtRoute("/");

  const platform = screen.getByRole("region", { name: /platform/i });
  const layerButtons = within(platform).getAllByRole("button");
  expect(layerButtons).toHaveLength(3);
  expect(layerButtons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
    "true",
    "false",
    "false"
  ]);
  expect(layerButtons[0]).toHaveAccessibleName(/asset discovery/i);

  const proofImage = within(platform).getByRole("img", {
    name: /security operations console/i
  });
  expect(proofImage).toHaveAttribute("src", "/landing/console-overview-2x.webp");
  expect(proofImage).toHaveAttribute("width", "2400");
  expect(proofImage).toHaveAttribute("height", "1500");
  expect(proofImage).toHaveAttribute("loading", "lazy");

  fireEvent.click(layerButtons[1]);
  expect(layerButtons[1]).toHaveAttribute("aria-pressed", "true");
  expect(layerButtons[0]).toHaveAttribute("aria-pressed", "false");
  expect(within(platform).getAllByText(/static analysis/i).length).toBeGreaterThan(0);
  expect(within(platform).getAllByText(/Skill|能力/).length).toBeGreaterThan(0);
  expect(within(platform).getByRole("img", { name: /security operations console/i })).toBe(
    proofImage
  );

  const architecture = screen.getByRole("region", { name: /architecture/i });
  const stages = within(architecture).getAllByRole("listitem");
  expect(stages).toHaveLength(6);
  for (const stage of stages) {
    expect(within(stage).getByRole("heading", { level: 3 })).toBeVisible();
    expect(stage.querySelector("code")?.textContent?.trim()).toMatch(/^[a-z_]+$/i);
    const explanation = within(stage).getByText(/[^\x00-\x7F]/);
    expect(explanation).toHaveAttribute("lang", "zh-CN");
    expect(explanation.textContent?.trim()).not.toBe("");
  }

  const finalCta = screen.getByRole("region", { name: /ready to evaluate/i });
  expect(within(finalCta).getByRole("link", { name: /launch security console/i })).toHaveAttribute(
    "href",
    "/console"
  );
  expect(within(finalCta).getByRole("link", { name: /explore runtime/i })).toHaveAttribute(
    "href",
    "#runtime"
  );

  const footer = screen.getByRole("contentinfo");
  expect(screen.getByRole("main").contains(footer)).toBe(false);
  expect(
    footer.compareDocumentPosition(screen.getByRole("main")) & Node.DOCUMENT_POSITION_PRECEDING
  ).toBeTruthy();
  expect(within(footer).getByRole("link", { name: /console/i })).toHaveAttribute("href", "/console");
  expect(within(footer).getByRole("link", { name: /architecture/i })).toHaveAttribute("href", "#architecture");
});
