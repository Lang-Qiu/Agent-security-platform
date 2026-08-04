import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = fileURLToPath(
  new URL("../../scripts/benchmark/sandbox-security/", import.meta.url)
);
const ROOT_BINDING_VERIFIER = "assertSandboxSecurityLiveRootBinding";
const LIVE_ROOTS = [
  "corpus_root",
  "capture_parent_root",
  "output_root"
] as const;
const LIVE_WORKERS = [
  "prepare-live-worker.ts",
  "capture-live-worker.ts",
  "evaluate-live-worker.ts",
  "seal-live-worker.ts"
] as const;

function readScript(name: string): string {
  return readFileSync(`${SCRIPT_ROOT}${name}`, "utf8");
}

test("REQ-SBX-GENERAL-002 authority forwards dev and ino for every bound live root", () => {
  const authority = readScript("accept-live.ts");

  assert.match(authority, /bindSandboxSecurityLiveRoots/u);
  for (const root of LIVE_ROOTS) {
    assert.match(
      authority,
      new RegExp(`bound\\.${root}\\.dev\\b`, "u"),
      `${root} dev identity is not forwarded from the bound root`
    );
    assert.match(
      authority,
      new RegExp(`bound\\.${root}\\.ino\\b`, "u"),
      `${root} ino identity is not forwarded from the bound root`
    );
  }
});

test("REQ-SBX-GENERAL-002 every fixed worker verifies live root identity", () => {
  const snapshot = readScript("fs-snapshot.ts");
  assert.match(
    snapshot,
    new RegExp(`export function ${ROOT_BINDING_VERIFIER}\\b`, "u"),
    "shared live-root identity verifier is missing"
  );
  assert.match(snapshot, /\bdev\b/u);
  assert.match(snapshot, /\bino\b/u);

  for (const worker of LIVE_WORKERS) {
    const source = readScript(worker);
    assert.match(
      source,
      new RegExp(`\\b${ROOT_BINDING_VERIFIER}\\b`, "u"),
      `${worker} does not verify the bound live-root identity`
    );
  }
});
