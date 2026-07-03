// P4-T8: fixed, argument-free operator entrypoint. Composes production
// preflight ports, runs preflight, and (before Phase 6 wires the evidence
// pipeline) exits non-zero with the fixed `track1_evidence_unavailable`
// code once preflight succeeds. It prints only safe fixed-shape lines.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { runTrack1Preflight, Track1PreflightError } from "./preflight.ts";
import { execOpenclawPluginsInspect } from "../../integrations/openclaw/src/runtime-probe.ts";
import { runTrack1PluginCapabilityProbe } from "../../integrations/openclaw/src/runtime-probe.ts";

if (process.argv.length > 2) {
  process.stderr.write("track1_entrypoint_arguments_not_supported\n");
  process.exit(1);
}

async function main(): Promise<void> {
  try {
    await runTrack1Preflight(process.env, {
      async inspectDocker() {
        execFileSync("docker", ["compose", "version"], {
          encoding: "utf8",
          timeout: 10_000
        });
        return { compose_v2: true };
      },
      async inspectOpenClaw() {
        const stdout = execFileSync("openclaw", ["--version"], {
          encoding: "utf8",
          timeout: 10_000
        });
        const match = stdout.match(/OpenClaw ([0-9.]+)/);
        return {
          version: match ? match[1] : "",
          integrity: process.env.TRACK1_OPENCLAW_PACKAGE_INTEGRITY ?? ""
        };
      },
      async probePlugin() {
        const inspected = execOpenclawPluginsInspect();
        return runTrack1PluginCapabilityProbe({
          inspect: inspected,
          ports: {
            provider: {
              decide() {
                return {
                  policy_id: "policy://track1/default",
                  action: "allow",
                  reason_code: "default_allow",
                  reason: "Track 1 default allow",
                  evidence_refs: []
                };
              }
            },
            async ingestSnapshot() {
              throw new Error("track1_ingest_unavailable");
            }
          }
        });
      },
      async checkBackend() {
        const base = process.env.TRACK1_BACKEND_URL ?? "";
        if (!base) return { public_ready: false, internal_ready: false };
        try {
          const response = await fetch(`${base}/health`);
          return { public_ready: response.ok, internal_ready: response.ok };
        } catch {
          return { public_ready: false, internal_ready: false };
        }
      },
      async loadManifest() {
        return readFile(
          new URL(
            "../../samples/track1/openclaw/campaign.v1.json",
            import.meta.url
          )
        );
      }
    });
  } catch (error) {
    if (error instanceof Track1PreflightError) {
      process.stderr.write(`${error.code}\n`);
      process.exit(1);
    }
    process.stderr.write("track1_preflight_failed\n");
    process.exit(1);
  }

  // Preflight succeeded. The evidence pipeline is wired in Phase 6; before
  // that, a real campaign command must fail closed with a fixed code rather
  // than claiming success.
  process.stdout.write("status=preflight_ok\n");
  process.stderr.write("track1_evidence_unavailable\n");
  process.exit(1);
}

await main();
