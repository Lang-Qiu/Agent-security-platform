import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("task pages use a shared frontend formatter instead of duplicating task label helpers", () => {
  const taskListPage = readFile("frontend/src/pages/TaskListPage.tsx");
  const taskOverviewSection = readFile("frontend/src/components/task-detail/TaskOverviewSection.tsx");

  assert.match(
    taskListPage,
    /from "\.\.\/utils\/task-formatters"/,
    "TaskListPage should import the shared task formatter module"
  );
  assert.match(
    taskOverviewSection,
    /from "\.\.\/\.\.\/utils\/task-formatters"/,
    "TaskOverviewSection should import the shared task formatter module"
  );
  assert.doesNotMatch(
    taskListPage,
    /function formatTaskType\(/,
    "TaskListPage should not keep a local task type formatter"
  );
  assert.doesNotMatch(
    taskListPage,
    /function formatCreatedAt\(/,
    "TaskListPage should not keep a local timestamp formatter"
  );
  assert.doesNotMatch(
    taskOverviewSection,
    /function formatTaskType\(/,
    "TaskOverviewSection should not keep a local task type formatter"
  );
  assert.doesNotMatch(
    taskOverviewSection,
    /function formatTimestamp\(/,
    "TaskOverviewSection should not keep a local timestamp formatter"
  );
});
