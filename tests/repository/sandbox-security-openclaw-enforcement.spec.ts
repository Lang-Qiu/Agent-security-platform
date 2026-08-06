import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const readJson = (path: string) =>
  JSON.parse(read(path)) as Record<string, unknown>;

test("REQ-SBX-GENERAL-004 keeps one reviewed spec and five ordered plans", () => {
  const spec = read(
    "docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md"
  );
  const master = read(
    "docs/superpowers/plans/2026-08-06-sandbox-security-openclaw-enforcement-004-master.md"
  );
  const sprint = read("docs/sprint-current.md");
  const phasePlans = [
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-1-contracts-package.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-2-backend-sqlite.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-3-plugin-enforcement.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-4-openclaw-patch.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-5-deployment-closure.md"
  ] as const;
  const rootPackage = readJson("package.json") as {
    scripts?: Record<string, string>;
  };

  assert.match(spec, /Final verdict: `PASS`/);
  assert.match(spec, /Status: `SPEC_APPROVED`/);
  assert.match(spec, /openclaw@2026\.6\.34/);
  assert.match(master, /Status: `PLAN_APPROVED`/);
  assert.match(
    sprint,
    /## Status\s+(IMPLEMENTATION_IN_PROGRESS|IMPLEMENTED_PENDING_GLOBAL_P6_GATE)/
  );
  assert.match(sprint, /PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE/);

  const discoveredPhasePlans = readdirSync(
    new URL("../../docs/superpowers/plans/", import.meta.url)
  )
    .filter((name) =>
      /^2026-08-06-sandbox-security-openclaw-enforcement-004-phase-.*\.md$/.test(
        name
      )
    )
    .sort();
  assert.deepEqual(discoveredPhasePlans, [...phasePlans].sort());

  let previousIndex = -1;
  for (const [index, filename] of phasePlans.entries()) {
    read(`docs/superpowers/plans/${filename}`);
    const currentIndex = master.indexOf(`| ${index + 1} | \`${filename}\``);
    assert.ok(
      currentIndex > previousIndex,
      `plan ${index + 1} is missing or out of order`
    );
    previousIndex = currentIndex;
  }

  assert.match(
    rootPackage.scripts?.["test:repo"] ?? "",
    /sandbox-security-openclaw-enforcement\.spec\.ts/
  );
});

test("REQ-SBX-GENERAL-004 leaves the Track 1 package pin unchanged", () => {
  const track1 = readJson("integrations/openclaw/package.json") as {
    dependencies?: Record<string, string>;
  };
  assert.equal(track1.dependencies?.openclaw, "2026.6.10");
});
