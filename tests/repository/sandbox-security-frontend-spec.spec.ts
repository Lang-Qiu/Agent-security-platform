import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const SPEC =
  "docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md";
const MASTER =
  "docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-master.md";

test("REQ-SBX-GENERAL-005 keeps one reviewed spec and five ordered plans", () => {
  const spec = read(SPEC);
  const master = read(MASTER);
  const phasePlans = [
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-1-theme-gate.md",
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-2-service-layer.md",
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-3-components.md",
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-4-pages-routing.md",
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-5-privacy-acceptance.md"
  ] as const;

  assert.match(spec, /Requirement: `REQ-SBX-GENERAL-005`/);
  assert.match(master, /Requirement: `REQ-SBX-GENERAL-005`/);

  const discovered = readdirSync(
    new URL("../../docs/superpowers/plans/", import.meta.url)
  )
    .filter((name) =>
      /^2026-08-07-sandbox-security-frontend-workbench-005-phase-.*\.md$/.test(name)
    )
    .sort();
  assert.deepEqual(discovered, [...phasePlans].sort());

  let previousIndex = -1;
  for (const [index, filename] of phasePlans.entries()) {
    read(`docs/superpowers/plans/${filename}`);
    const currentIndex = master.indexOf(`| ${index + 1} | \`${filename}\``);
    assert.ok(
      currentIndex > previousIndex,
      `plan ${index + 1} is missing from the Master plan set or out of order`
    );
    previousIndex = currentIndex;
  }
});

test("REQ-SBX-GENERAL-005 preserves the GENERAL-004 durable record", () => {
  const sprint = read("docs/sprint-current.md");
  assert.match(sprint, /## Requirement ID\s+REQ-SBX-GENERAL-00[45]/);
});

test("REQ-SBX-GENERAL-005 registers its gate in test:repo", () => {
  const rootPackage = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.match(
    rootPackage.scripts?.["test:repo"] ?? "",
    /sandbox-security-frontend-spec\.spec\.ts/
  );
});
