import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { EvidencePipeline } from "./EvidencePipeline";
import { LandingCta } from "./LandingCta";
import { LandingFooter } from "./LandingFooter";
import { PlatformLayerStack } from "./PlatformLayerStack";

test("PlatformLayerStack keeps one product proof image while keyboard activation changes only the overlay", () => {
  render(<PlatformLayerStack />);

  const platform = screen.getByRole("region", { name: /platform security layers/i });
  const layers = within(platform).getAllByRole("button");
  const image = within(platform).getByRole("img", {
    name: /security operations console/i
  });
  const initialOverlay = platform.querySelector(".landing-platform__overlay");
  const initialOverlayClass = initialOverlay?.className;

  expect(layers).toHaveLength(3);
  expect(layers[0]).toHaveAttribute("aria-pressed", "true");
  expect(image).toHaveAttribute("src", "/landing/console-overview-2x.webp");
  expect(image).toHaveAttribute("width", "2400");
  expect(image).toHaveAttribute("height", "1500");

  layers[1].focus();
  fireEvent.click(layers[1]);
  expect(layers[1]).toHaveAttribute("aria-pressed", "true");
  expect(within(platform).getByRole("img", { name: /security operations console/i })).toBe(image);
  expect(platform.querySelector(".landing-platform__overlay")).toBe(initialOverlay);
  expect(platform.querySelector(".landing-platform__overlay")?.className).not.toBe(initialOverlayClass);
  expect(platform.querySelector(".landing-platform__overlay")?.className).toMatch(/static_analysis/);
});

test("PlatformLayerStack replaces an unavailable product proof image with a clean pending state", () => {
  render(<PlatformLayerStack />);

  const platform = screen.getByRole("region", { name: /platform security layers/i });
  const image = within(platform).getByRole("img", {
    name: /security operations console/i
  });

  fireEvent.error(image);

  expect(within(platform).queryByRole("img", { name: /security operations console/i })).not.toBeInTheDocument();
  expect(within(platform).getByRole("status")).toHaveTextContent(
    "First-party Console capture pending approval"
  );
});

test("EvidencePipeline renders six authored bilingual stages with stable identifiers", () => {
  render(<EvidencePipeline />);

  const pipeline = screen.getByRole("region", { name: /architecture evidence pipeline/i });
  const stages = within(pipeline).getAllByRole("listitem");

  expect(stages).toHaveLength(6);
  expect(stages.map((stage) => stage.querySelector("code")?.textContent)).toEqual([
    "asset_scan",
    "interaction_context",
    "reason_code",
    "policy_action",
    "containment_action",
    "evidence_ref"
  ]);
  for (const stage of stages) {
    const explanation = stage.querySelector('p[lang="zh-CN"]');
    expect(explanation?.textContent?.trim()).not.toBe("");
  }
});

test("LandingCta and LandingFooter expose only the approved product destinations", () => {
  render(
    <MemoryRouter>
      <LandingCta />
      <LandingFooter />
    </MemoryRouter>
  );

  expect(screen.getByRole("link", { name: /launch security console/i })).toHaveAttribute(
    "href",
    "/console"
  );
  expect(screen.getByRole("link", { name: /explore runtime/i })).toHaveAttribute(
    "href",
    "#runtime"
  );
  const footer = screen.getByRole("contentinfo");
  expect(within(footer).getByRole("link", { name: "Architecture" })).toHaveAttribute(
    "href",
    "#architecture"
  );
  expect(within(footer).getByRole("link", { name: "Runtime" })).toHaveAttribute(
    "href",
    "#runtime"
  );
  expect(within(footer).getByRole("link", { name: "Console" })).toHaveAttribute(
    "href",
    "/console"
  );
});
