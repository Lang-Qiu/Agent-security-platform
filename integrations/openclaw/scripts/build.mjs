// Build script for the OpenClaw plugin entry point.
// Uses esbuild to produce a single .js file that the real `openclaw plugins install`
// can load. The entry point re-exports from src/index.ts; esbuild bundles the
// full dependency tree (shared/contracts, engines/sandbox, etc.) into one file.

import * as esbuild from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(__dirname, "../src/index.ts");
const outdir = path.resolve(__dirname, "../dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await esbuild.build({
  entryPoints: { index: entry },
  outdir,
  entryNames: "[name]",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  // Packages that must remain external (not bundled into the plugin):
  // - openclaw: the plugin SDK is loaded by the OpenClaw runtime itself
  external: ["openclaw", "openclaw/*"],
});

console.log("Built:", path.join(outdir, "index.js"));
