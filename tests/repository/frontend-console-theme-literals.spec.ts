import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("app.css declares colour literals only inside :root", () => {
  const css = read("frontend/src/styles/app.css");
  const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const outsideRoot = css.replace(rootBlock, "");

  const literals = outsideRoot.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
  assert.deepEqual(
    literals,
    [],
    `app.css must reference var(--console-*) outside :root, found ${literals.join(", ")}`
  );
});

test("app.css uses the dark colour scheme", () => {
  const css = read("frontend/src/styles/app.css");
  assert.match(css, /color-scheme:\s*dark/);
  assert.doesNotMatch(css, /color-scheme:\s*light/);
});

test("no frontend source file outside the theme module hardcodes a colour", () => {
  const offenders: string[] = [];
  for (const path of [
    "frontend/src/app/AppProviders.tsx",
    "frontend/src/components/supervision/SupervisionSessionList.tsx",
    "frontend/src/components/task-detail/StaticAnalysisResultSection.tsx"
  ]) {
    const source = read(path);
    const hits = source.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    if (hits.length > 0) offenders.push(`${path}: ${hits.join(", ")}`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});
