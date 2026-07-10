import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  runTrack1PluginCapabilityProbe,
  type PluginInspectOutput
} from "../../integrations/openclaw/src/runtime-probe.ts";
import { normalizeTrack1CampaignDetail } from "../../shared/contracts/campaign-supervision.ts";
import {
  TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
  type Track1CampaignFinalizeEnvelope,
  type Track1CampaignSnapshotEnvelope,
  type Track1CampaignStartEnvelope
} from "../../shared/types/campaign-ingest.ts";
import type {
  Track1CampaignAgentId,
  Track1CaseId,
  Track1ScenarioId,
  Track1SessionId
} from "../../shared/types/campaign-supervision.ts";
import { compileTrack1CasePrompt, type Track1CompiledPrompt } from "./case-prompt.ts";
import type {
  Track1AttemptObservation,
  Track1CampaignFinalizeInput,
  Track1CampaignRunnerPorts
} from "./campaign-runner.ts";
import {
  invokeOpenClawAgent,
  type EphemeralMessagePort,
  type ProcessHandle,
  type ProcessPort
} from "./openclaw-command.ts";
import { runTrack1Preflight } from "./preflight.ts";

export interface ProductionPortsConfig {
  ingestBaseUrl: string;
  ingestToken: string;
  publicApiBaseUrl?: string;
  progressCallback?: (event: Readonly<Record<string, unknown>>) => void;
}

export interface ProductionPortsDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  processPort?: ProcessPort;
  messagePort?: EphemeralMessagePort;
  isContainer?: () => boolean | Promise<boolean>;
  now?: () => string;
  captureRunningCheckpoint?: Track1CampaignRunnerPorts["captureRunningCheckpoint"];
}

export class NodeProcessPort implements ProcessPort {
  spawn(
    executable: string,
    args: readonly string[],
    options: Readonly<{
      shell: false;
      env: Readonly<Record<string, string>>;
      stdio: readonly ["ignore", "pipe", "pipe"];
    }>
  ): ProcessHandle {
    const child = spawn(executable, [...args], {
      shell: false,
      env: { ...options.env },
      stdio: [...options.stdio]
    });
    const stdoutListeners: Array<(chunk: Uint8Array) => void> = [];
    const stderrListeners: Array<(chunk: Uint8Array) => void> = [];
    const exitListeners: Array<
      (result: { code: number | null; signal: string | null }) => void
    > = [];

    child.stdout?.on("data", (chunk: Buffer) => {
      for (const listener of stdoutListeners) listener(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      for (const listener of stderrListeners) listener(chunk);
    });
    child.once("error", () => {
      for (const listener of exitListeners) {
        listener({ code: null, signal: "SPAWN_ERROR" });
      }
    });
    child.once("exit", (code, signal) => {
      for (const listener of exitListeners) {
        listener({ code, signal });
      }
    });

    return {
      onStdout(listener) {
        stdoutListeners.push(listener);
      },
      onStderr(listener) {
        stderrListeners.push(listener);
      },
      onExit(listener) {
        exitListeners.push(listener);
      },
      kill() {
        child.kill();
      }
    };
  }
}

class NodeEphemeralMessagePort implements EphemeralMessagePort {
  async withFile<T>(
    path: string,
    bytes: Uint8Array,
    run: () => Promise<T>
  ): Promise<T> {
    if (!path.startsWith("/run/track1/messages/")) {
      throw new Error("track1_ephemeral_path_invalid");
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    try {
      return await run();
    } finally {
      await unlink(path).catch(() => undefined);
    }
  }
}

const CHILD_ENV_KEYS = [
  "OPENCLAW_CONFIG_PATH",
  "OPENCLAW_GATEWAY_PASSWORD",
  "OPENCLAW_ALLOW_INSECURE_PRIVATE_WS",
  "TRACK1_INGEST_TOKEN",
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "PATHEXT",
  "SystemRoot",
  "ComSpec"
] as const;

function selectChildEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const key of CHILD_ENV_KEYS) {
    const value = environment[key];
    if (typeof value === "string" && value.length > 0) selected[key] = value;
  }
  return selected;
}

async function collectProcess(
  processPort: ProcessPort,
  executable: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
  timeoutMs = 30_000
): Promise<string> {
  const handle = processPort.spawn(executable, args, {
    shell: false,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const chunks: Buffer[] = [];
  let byteLength = 0;
  let overflow = false;
  const capture = (chunk: Uint8Array) => {
    byteLength += chunk.byteLength;
    if (byteLength > 512_000) {
      overflow = true;
      handle.kill();
      return;
    }
    chunks.push(Buffer.from(chunk));
  };
  handle.onStdout(capture);
  handle.onStderr((chunk) => {
    byteLength += chunk.byteLength;
    if (byteLength > 512_000) {
      overflow = true;
      handle.kill();
    }
  });
  const result = await new Promise<{ code: number | null; signal: string | null }>(
    (resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        handle.kill();
        rejectPromise(new Error("track1_process_failed"));
      }, timeoutMs);
      handle.onExit((exit) => {
        clearTimeout(timeout);
        resolvePromise(exit);
      });
    }
  );
  if (overflow || result.code !== 0 || result.signal !== null) {
    throw new Error("track1_process_failed");
  }
  return Buffer.concat(chunks).toString("utf8");
}

function normalizeRealInspect(
  value: unknown,
  runtimeVersion: string
): PluginInspectOutput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("track1_plugin_probe_failed");
  }
  const root = value as Record<string, unknown>;
  const plugin =
    typeof root.plugin === "object" && root.plugin !== null
      ? (root.plugin as Record<string, unknown>)
      : null;
  if (!plugin || plugin.status !== "loaded") {
    throw new Error("track1_plugin_probe_failed");
  }
  const typedHooks = Array.isArray(root.typedHooks) ? root.typedHooks : [];
  const tools = Array.isArray(root.tools) ? root.tools : [];
  const toolNames = tools.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const names = (entry as Record<string, unknown>).names;
    return Array.isArray(names)
      ? names.filter((name): name is string => typeof name === "string")
      : [];
  });
  const hookNames = typedHooks.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const name = (entry as Record<string, unknown>).name;
    return typeof name === "string" ? [name] : [];
  });
  const diagnostics = Array.isArray(plugin.diagnostics)
    ? plugin.diagnostics
    : [];
  return {
    id: String(plugin.id ?? ""),
    name: String(plugin.name ?? ""),
    runtime_version: runtimeVersion,
    tools: toolNames.map((name) => ({ name, label: name })),
    hooks: hookNames,
    diagnostics: diagnostics.map(() => ({
      code: "plugin_diagnostic",
      message: "plugin diagnostic"
    }))
  };
}

function apiUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

export function createProductionPorts(
  config: ProductionPortsConfig,
  dependencies: ProductionPortsDependencies = {}
): Track1CampaignRunnerPorts {
  const environment = dependencies.environment ?? process.env;
  const fetchImpl = dependencies.fetch ?? fetch;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolvePromise) =>
        setTimeout(resolvePromise, milliseconds)
      ));
  const processPort = dependencies.processPort ?? new NodeProcessPort();
  const messagePort = dependencies.messagePort ?? new NodeEphemeralMessagePort();
  const now = dependencies.now ?? (() => new Date().toISOString());
  const isContainer =
    dependencies.isContainer ??
    (async () => {
      try {
        await access("/.dockerenv");
        return true;
      } catch {
        return false;
      }
    });
  const childEnvironment = selectChildEnvironment(environment);
  const internalHealthUrl = new URL("/internal/health", config.ingestBaseUrl)
    .toString();
  const publicApiBaseUrl =
    config.publicApiBaseUrl ??
    (() => {
      const url = new URL(config.ingestBaseUrl);
      url.port = "3000";
      url.pathname = "/api";
      return url.toString().replace(/\/$/, "");
    })();
  const publicHealthUrl = new URL(
    "/health",
    new URL(publicApiBaseUrl).origin
  ).toString();

  return {
    async preflight() {
      return runTrack1Preflight(environment, {
        async inspectDocker() {
          if (await isContainer()) return { compose_v2: true };
          await collectProcess(
            processPort,
            "docker",
            ["compose", "version"],
            childEnvironment
          );
          return { compose_v2: true };
        },
        async inspectOpenClaw() {
          const output = await collectProcess(
            processPort,
            "openclaw",
            ["--version"],
            childEnvironment
          );
          return {
            version: output.match(/\b(\d{4}\.\d+\.\d+)\b/)?.[1] ?? "",
            integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY
          };
        },
        async probePlugin() {
          const [inspectOutput, versionOutput] = await Promise.all([
            collectProcess(
              processPort,
              "openclaw",
              [
                "plugins",
                "inspect",
                "agent-security-track1",
                "--runtime",
                "--json"
              ],
              childEnvironment
            ),
            collectProcess(
              processPort,
              "openclaw",
              ["--version"],
              childEnvironment
            )
          ]);
          const runtimeVersion =
            versionOutput.match(/\b(\d{4}\.\d+\.\d+)\b/)?.[1] ?? "";
          const inspect = normalizeRealInspect(
            JSON.parse(inspectOutput),
            runtimeVersion
          );
          let idCounter = 0;
          return runTrack1PluginCapabilityProbe({
            inspect,
            ports: {
              provider: {
                decide() {
                  return {
                    policy_id: "policy://track1/probe",
                    action: "allow",
                    reason_code: "probe_allow",
                    reason: "Probe allow",
                    evidence_refs: ["evidence://track1/probe/allow"]
                  };
                }
              },
              async ingestSnapshot(envelope: Track1CampaignSnapshotEnvelope) {
                return {
                  schema_version: TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION,
                  campaign_id: envelope.campaign_id,
                  attempt_id: envelope.attempt_id,
                  sequence: envelope.sequence,
                  snapshot_sha256: envelope.snapshot_sha256,
                  accepted_at: now()
                };
              },
              now,
              nextId(kind) {
                idCounter += 1;
                return `${kind}:probe:${idCounter}`;
              }
            }
          });
        },
        async checkBackend() {
          try {
            const [publicResponse, internalResponse] = await Promise.all([
              fetchImpl(publicHealthUrl),
              fetchImpl(internalHealthUrl)
            ]);
            return {
              public_ready: publicResponse.ok,
              internal_ready: internalResponse.ok
            };
          } catch {
            return { public_ready: false, internal_ready: false };
          }
        },
        async loadManifest() {
          return readFile(
            join(
              import.meta.dirname,
              "../../samples/track1/openclaw/campaign.v1.json"
            )
          );
        }
      });
    },

    async createCampaign(input: Track1CampaignStartEnvelope) {
      const response = await fetchImpl(
        apiUrl(config.ingestBaseUrl, "/campaigns"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.ingestToken}`
          },
          body: JSON.stringify(input)
        }
      );
      if (!response.ok) throw new Error("track1_campaign_create_failed");
    },

    async compilePrompt(input: {
      campaign_id: string;
      agent_id: Track1CampaignAgentId;
      scenario_id: Track1ScenarioId;
      case_id: Track1CaseId;
      attempt_id: string;
      attempt_index: 1 | 2;
      session_id: string;
    }): Promise<Track1CompiledPrompt> {
      const manifest = JSON.parse(
        await readFile(
          join(
            import.meta.dirname,
            "../../samples/track1/openclaw/campaign.v1.json"
          ),
          "utf8"
        )
      ) as { cases: Array<Record<string, unknown>> };
      const entry = manifest.cases.find(
        (candidate) => candidate.case_id === input.case_id
      );
      if (
        !entry ||
        entry.agent_id !== input.agent_id ||
        entry.scenario_id !== input.scenario_id ||
        typeof entry.case_ref !== "string"
      ) {
        throw new Error("track1_case_not_found");
      }
      const canonicalBytes = await readFile(
        join(import.meta.dirname, "../..", entry.case_ref)
      );
      return compileTrack1CasePrompt({
        manifest_entry: {
          agent_id: entry.agent_id as string,
          scenario_id: entry.scenario_id as string,
          case_id: entry.case_id as string,
          case_sha256: entry.case_sha256 as string
        },
        canonical_case_bytes: canonicalBytes,
        campaign_id: input.campaign_id,
        agent_id: input.agent_id,
        attempt_id: input.attempt_id,
        attempt_index: input.attempt_index,
        session_id: input.session_id
      });
    },

    async invokeAgent(input) {
      return invokeOpenClawAgent(
        input,
        environment,
        processPort,
        messagePort
      );
    },

    async awaitAttempt(input): Promise<Track1AttemptObservation> {
      // Version banner so we can confirm the live runner has this code path.
      try {
        process.stderr.write(
          `await_attempt_start case=${input.case_id} attempt=${input.attempt_id} session=${input.session_id}\n`
        );
      } catch {
        // ignore
      }
      for (let poll = 0; poll < 120; poll += 1) {
        let response: Response;
        try {
          response = await fetchImpl(
            apiUrl(
              publicApiBaseUrl,
              `/supervision/campaigns/${encodeURIComponent(input.campaign_id)}`
            )
          );
        } catch (err) {
          if (poll % 6 === 0) {
            try {
              process.stderr.write(
                `await_attempt_fetch_err poll=${poll} err=${String(err)}\n`
              );
            } catch {
              // ignore
            }
          }
          await sleep(5_000);
          continue;
        }
        if (!response.ok) {
          if (poll % 6 === 0) {
            try {
              process.stderr.write(
                `await_attempt_http poll=${poll} status=${response.status}\n`
              );
            } catch {
              // ignore
            }
          }
          await sleep(5_000);
          continue;
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          await sleep(5_000);
          continue;
        }
        if (
          typeof body !== "object" ||
          body === null ||
          (body as Record<string, unknown>).success !== true
        ) {
          await sleep(5_000);
          continue;
        }
        const data = (body as Record<string, unknown>).data;
        // Always walk the raw detail payload. Do not depend on
        // normalizeTrack1CampaignDetail: after the final case passes, all
        // agents are "completed" while campaign status is still "running"
        // until finalize runs, and the shared normalizer rejects that
        // transitional shape (returning null forever -> observation timeout).
        let attempt:
          | {
              attempt_id: string;
              session_id: string;
              status: string;
              actual_action: string | null;
            }
          | undefined;
        if (
          typeof data === "object" &&
          data !== null &&
          Array.isArray((data as { agents?: unknown }).agents)
        ) {
          for (const agent of (data as { agents: unknown[] }).agents) {
            if (typeof agent !== "object" || agent === null) continue;
            const cases = (agent as { cases?: unknown }).cases;
            if (!Array.isArray(cases)) continue;
            for (const caseDetail of cases) {
              if (typeof caseDetail !== "object" || caseDetail === null) continue;
              const attempts = (caseDetail as { attempts?: unknown }).attempts;
              if (!Array.isArray(attempts)) continue;
              for (const candidate of attempts) {
                if (typeof candidate !== "object" || candidate === null) continue;
                const row = candidate as Record<string, unknown>;
                if (row.attempt_id !== input.attempt_id) continue;
                // Match by attempt_id only (globally unique in a campaign).
                attempt = {
                  attempt_id: String(row.attempt_id),
                  session_id: String(row.session_id ?? ""),
                  status: String(row.status ?? "running"),
                  actual_action:
                    typeof row.actual_action === "string"
                      ? row.actual_action
                      : null
                };
              }
            }
          }
        }
        if (!attempt || attempt.status === "running") {
          if (poll % 3 === 0) {
            try {
              process.stderr.write(
                `await_attempt_poll poll=${poll} case=${input.case_id} found=${Boolean(attempt)} status=${attempt?.status ?? "null"}\n`
              );
            } catch {
              // ignore
            }
          }
          await sleep(5_000);
          continue;
        }
        const sessionMatches =
          attempt.session_id === input.session_id ||
          attempt.session_id.replace(/^session:/, "session-") ===
            input.session_id.replace(/^session:/, "session-") ||
          attempt.session_id.replace(/^session-/, "session:") ===
            input.session_id.replace(/^session-/, "session:");
        if (!sessionMatches || attempt.actual_action === null) {
          try {
            process.stderr.write(
              `await_attempt_corr case=${input.case_id} want_session=${input.session_id} got_session=${attempt.session_id} action=${String(attempt.actual_action)}\n`
            );
          } catch {
            // ignore
          }
          return {
            outcome: "terminal_failed",
            final_action: null,
            reason: "correlation_invalid"
          };
        }
        if (attempt.status === "passed") {
          try {
            process.stderr.write(
              `await_attempt_passed case=${input.case_id} action=${attempt.actual_action}\n`
            );
          } catch {
            // ignore
          }
          return {
            outcome: "passed",
            final_action: attempt.actual_action as never,
            reason: null
          };
        }
        return {
          outcome: "retryable_failed",
          final_action: attempt.actual_action as never,
          reason: "derived_action_mismatch"
        };
      }
      throw new Error("track1_attempt_observation_timeout");
    },

    async captureRunningCheckpoint(input) {
      await dependencies.captureRunningCheckpoint?.(input);
    },

    async finalizeCampaign(input: Track1CampaignFinalizeInput) {
      const envelope: Track1CampaignFinalizeEnvelope = {
        schema_version: TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION,
        campaign_id:
          input.campaign_id as Track1CampaignFinalizeEnvelope["campaign_id"],
        requested_status: input.status,
        completed_at: input.completed_at
      };
      const response = await fetchImpl(
        apiUrl(
          config.ingestBaseUrl,
          `/campaigns/${encodeURIComponent(input.campaign_id)}/finalize`
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.ingestToken}`
          },
          body: JSON.stringify(envelope)
        }
      );
      if (!response.ok) throw new Error("track1_campaign_finalize_failed");
    },

    now,
    randomHex32() {
      return randomBytes(16).toString("hex");
    },
    progress(event) {
      config.progressCallback?.(Object.freeze({ ...event }));
    }
  };
}
