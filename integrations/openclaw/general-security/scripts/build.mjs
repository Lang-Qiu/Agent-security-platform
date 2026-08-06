import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(__dirname, "../src/index.ts");
const out = path.resolve(__dirname, "../dist/index.js");

await esbuild.build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["openclaw"]
});
