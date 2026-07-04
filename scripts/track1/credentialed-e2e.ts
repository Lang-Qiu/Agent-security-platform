const REQUIRED_HOOKS = [
  "agent_end",
  "session_start",
  "llm_input",
  "llm_output",
  "before_tool_call",
  "after_tool_call",
  "session_end"
] as const;
const REQUIRED_TOOLS = [
  "send_email",
  "read_file",
  "write_file",
  "call_api"
] as const;
const CAMPAIGN_ID = /^campaign:t1:[a-f0-9]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export interface Track1CredentialedE2EPorts {
  cleanRuntime(): Promise<void>;
  buildRuntime(): Promise<void>;
  startRuntime(): Promise<void>;
  waitForHealth(): Promise<void>;
  inspectPlugin(): Promise<unknown>;
  runCampaign(): Promise<unknown>;
  buildEvidence(campaignId: string): Promise<unknown>;
  readAcceptanceSource(campaignId: string): Promise<unknown>;
  collectSafeLogs(): Promise<unknown>;
  stopRuntime(): Promise<void>;
}

export interface Track1CredentialedE2EResult {
  schema_version: "track1-credentialed-e2e.v1";
  campaign_id: string;
  status: "completed";
  agent_count: 3;
  case_count: 9;
  retry_count: number;
  evidence_manifest_sha256: string;
  artifact_ref: string;
  acceptance_source: unknown;
  safe_log_summary: {
    credential_finding_count: 0;
    raw_content_finding_count: 0;
    prohibited_event_count: 0;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function credentialsMissing(): never {
  throw new Error("track1_e2e_credentials_missing");
}

function validateEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): void {
  const baseUrlValue = environment.OPENCLAW_MODEL_BASE_URL;
  const apiKey = environment.OPENCLAW_MODEL_API_KEY;
  const modelId = environment.OPENCLAW_MODEL_ID;
  const ingestToken = environment.TRACK1_INGEST_TOKEN;
  if (!baseUrlValue || !apiKey || !modelId || !ingestToken) {
    credentialsMissing();
  }
  try {
    normalizeTrack1CloudModelConfig(environment);
  } catch {
    credentialsMissing();
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    return credentialsMissing();
  }
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    apiKey.trim().length === 0 ||
    apiKey.length > 4096 ||
    /[\r\n\0]/.test(apiKey) ||
    !SAFE_MODEL_ID.test(modelId) ||
    Buffer.byteLength(ingestToken, "utf8") < 32 ||
    /[\s\0]/.test(ingestToken) ||
    new Set(ingestToken).size < 8
  ) {
    credentialsMissing();
  }
}

function requirePlugin(value: unknown): void {
  if (!isPlainObject(value)) throw new Error("track1_e2e_failed");
  if (
    value.openclaw_version !== "2026.6.10" ||
    value.plugin_status !== "loaded" ||
    !Array.isArray(value.hooks) ||
    !Array.isArray(value.tools) ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length !== 0 ||
    !REQUIRED_HOOKS.every((hook) => value.hooks.includes(hook)) ||
    value.hooks.length !== REQUIRED_HOOKS.length ||
    !REQUIRED_TOOLS.every((tool) => value.tools.includes(tool)) ||
    value.tools.length !== REQUIRED_TOOLS.length
  ) {
    throw new Error("track1_e2e_failed");
  }
}

function requireCampaign(value: unknown) {
  if (!isPlainObject(value)) throw new Error("track1_e2e_failed");
  if (
    typeof value.campaign_id !== "string" ||
    !CAMPAIGN_ID.test(value.campaign_id) ||
    value.agent_count !== 3 ||
    value.case_count !== 9 ||
    typeof value.retry_count !== "number" ||
    !Number.isInteger(value.retry_count) ||
    value.retry_count < 0 ||
    value.retry_count > 9
  ) {
    throw new Error("track1_e2e_failed");
  }
  return {
    campaign_id: value.campaign_id,
    retry_count: value.retry_count
  };
}

function requireEvidence(value: unknown, campaignId: string) {
  if (!isPlainObject(value)) throw new Error("track1_e2e_failed");
  const campaignHex = campaignId.slice("campaign:t1:".length);
  if (
    value.campaign_id !== campaignId ||
    typeof value.manifest_sha256 !== "string" ||
    !SHA256.test(value.manifest_sha256) ||
    value.artifact_ref !==
      `artifact://track1/campaign/${campaignHex}/manifest`
  ) {
    throw new Error("track1_e2e_failed");
  }
  return {
    manifest_sha256: value.manifest_sha256,
    artifact_ref: value.artifact_ref
  };
}

function requireSafeLogs(value: unknown) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 3 ||
    value.credential_finding_count !== 0 ||
    value.raw_content_finding_count !== 0 ||
    value.prohibited_event_count !== 0
  ) {
    throw new Error("track1_e2e_failed");
  }
  return {
    credential_finding_count: 0 as const,
    raw_content_finding_count: 0 as const,
    prohibited_event_count: 0 as const
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

export async function runTrack1CredentialedE2E(
  environment: Readonly<Record<string, string | undefined>>,
  ports: Track1CredentialedE2EPorts
): Promise<Readonly<Track1CredentialedE2EResult>> {
  validateEnvironment(environment);
  let startupBegan = false;
  let result: Track1CredentialedE2EResult | null = null;
  let failed = false;
  try {
    await ports.cleanRuntime();
    await ports.buildRuntime();
    startupBegan = true;
    await ports.startRuntime();
    await ports.waitForHealth();
    requirePlugin(await ports.inspectPlugin());
    const campaign = requireCampaign(await ports.runCampaign());
    const evidence = requireEvidence(
      await ports.buildEvidence(campaign.campaign_id),
      campaign.campaign_id
    );
    const acceptanceSource = await ports.readAcceptanceSource(
      campaign.campaign_id
    );
    const safeLogs = requireSafeLogs(await ports.collectSafeLogs());
    const acceptanceSourceCopy = structuredClone(acceptanceSource);
    if (
      isPlainObject(acceptanceSourceCopy) &&
      Object.prototype.hasOwnProperty.call(
        acceptanceSourceCopy,
        "safe_log_summary"
      )
    ) {
      acceptanceSourceCopy.safe_log_summary = safeLogs;
    }
    result = {
      schema_version: "track1-credentialed-e2e.v1",
      campaign_id: campaign.campaign_id,
      status: "completed",
      agent_count: 3,
      case_count: 9,
      retry_count: campaign.retry_count,
      evidence_manifest_sha256: evidence.manifest_sha256,
      artifact_ref: evidence.artifact_ref,
      acceptance_source: acceptanceSourceCopy,
      safe_log_summary: safeLogs
    };
  } catch {
    failed = true;
  } finally {
    if (startupBegan) {
      try {
        await ports.stopRuntime();
      } catch {
        failed = true;
      }
    }
  }
  if (failed || !result) throw new Error("track1_e2e_failed");
  return deepFreeze(result);
}

const COMPOSE_FILE = "deploy/track1/compose.track1.yml";
const COMPOSE_EXECUTABLE =
  process.platform === "win32" ? "docker-compose.exe" : "docker";
const COMPOSE_PREFIX = [
  ...(process.platform === "win32" ? [] : ["compose"]),
  "-f",
  COMPOSE_FILE,
  "--profile",
  "track1",
  "--profile",
  "evidence"
] as const;
const ARTIFACT_PATHS = [
  "security-risk-analysis.md",
  "security-risk-analysis.pdf",
  "manifest.json",
  "campaign.json",
  "screenshots/campaign-running.png",
  "screenshots/campaign-overview.png",
  "screenshots/scenario-1-prompt-injection.png",
  "screenshots/scenario-2-tool-hijack.png",
  "screenshots/scenario-3-memory-poisoning.png"
] as const;

interface SafeProcessResult {
  stdout: string;
}

function runSafeProcess(
  executable: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
  timeoutMs = 120_000
): Promise<SafeProcessResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, [...args], {
      shell: false,
      env: { ...environment },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    let byteLength = 0;
    let overflow = false;
    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(new Error("track1_e2e_process_failed"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      byteLength += chunk.byteLength;
      if (byteLength > 1_048_576) {
        overflow = true;
        child.kill();
      } else {
        stdout.push(Buffer.from(chunk));
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      byteLength += chunk.byteLength;
      if (byteLength > 1_048_576) {
        overflow = true;
        child.kill();
      }
    });
    child.once("error", () => {
      clearTimeout(timeout);
      rejectPromise(new Error("track1_e2e_process_failed"));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0 || signal !== null || overflow) {
        rejectPromise(new Error("track1_e2e_process_failed"));
      } else {
        resolvePromise({ stdout: Buffer.concat(stdout).toString("utf8") });
      }
    });
  });
}

async function getProductionApiData(
  baseUrl: string,
  path: string
): Promise<unknown> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`);
  if (!response.ok) throw new Error("track1_e2e_api_failed");
  const body = (await response.json()) as Record<string, unknown>;
  if (!body || body.success !== true) throw new Error("track1_e2e_api_failed");
  return body.data;
}

function normalizeInspectOutput(raw: string) {
  const value = JSON.parse(raw) as Record<string, any>;
  const plugin = value.plugin;
  const hooks = Array.isArray(value.typedHooks)
    ? value.typedHooks
        .map((item: Record<string, unknown>) => item.name)
        .filter((item: unknown): item is string => typeof item === "string")
    : [];
  const tools = Array.isArray(value.tools)
    ? value.tools.flatMap((item: Record<string, unknown>) =>
        Array.isArray(item.names)
          ? item.names.filter(
              (name: unknown): name is string => typeof name === "string"
            )
          : []
      )
    : [];
  return {
    openclaw_version: "2026.6.10",
    plugin_status: plugin?.status,
    hooks,
    tools,
    diagnostics: Array.isArray(plugin?.diagnostics)
      ? plugin.diagnostics
      : []
  };
}

export function createProductionCredentialedE2EPorts(
  environment: Readonly<Record<string, string | undefined>>
): Track1CredentialedE2EPorts {
  const processEnvironment: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value === "string") processEnvironment[key] = value;
  }
  processEnvironment.PATH = process.env.PATH ?? processEnvironment.PATH ?? "";
  processEnvironment.OPENCLAW_GATEWAY_PASSWORD =
    environment.OPENCLAW_GATEWAY_PASSWORD ??
    randomBytes(32).toString("hex");
  const backendUrl =
    environment.TRACK1_BACKEND_URL ?? "http://127.0.0.1:3000/api";
  const ingestBaseUrl =
    environment.TRACK1_INGEST_BASE_URL ??
    "http://127.0.0.1:3001/internal/track1";
  const frontendUrl =
    environment.TRACK1_FRONTEND_URL ??
    "http://127.0.0.1:5173/sandbox-alerts";
  const artifactRoot = resolve("artifacts/track1");
  let latestCampaignId = "";
  let latestInspect: ReturnType<typeof normalizeInspectOutput> | null = null;
  let acceptanceSource: Record<string, unknown> | null = null;

  const compose = (
    args: readonly string[],
    timeoutMs?: number
  ) =>
    runSafeProcess(
      COMPOSE_EXECUTABLE,
      [...COMPOSE_PREFIX, ...args],
      processEnvironment,
      timeoutMs
    );

  async function waitForCampaign(): Promise<string> {
    for (let poll = 0; poll < 900; poll += 1) {
      try {
        const data = await getProductionApiData(
          backendUrl,
          "/supervision/campaigns"
        );
        if (Array.isArray(data)) {
          const candidate = data.find(
            (item) =>
              isPlainObject(item) &&
              typeof item.campaign_id === "string" &&
              ["running", "collecting", "completed"].includes(
                String(item.status)
              )
          ) as Record<string, unknown> | undefined;
          if (candidate && typeof candidate.campaign_id === "string") {
            return candidate.campaign_id;
          }
        }
      } catch {
        // The public API may not yet have observed campaign creation.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
    }
    throw new Error("track1_e2e_campaign_discovery_failed");
  }

  async function captureRunningCheckpoint(campaignId: string): Promise<void> {
    const campaignHex = campaignId.slice("campaign:t1:".length);
    for (let poll = 0; poll < 900; poll += 1) {
      const detail = normalizeTrack1CampaignDetail(
        await getProductionApiData(
          backendUrl,
          `/supervision/campaigns/${encodeURIComponent(campaignId)}`
        )
      );
      const firstCase = detail?.agents[0]?.cases[0];
      if (detail?.status === "running" && firstCase?.status === "passed") {
        const checkpointRoot = join(
          artifactRoot,
          ".checkpoints",
          campaignHex
        );
        await mkdir(checkpointRoot, { recursive: true });
        const inputPath = join(checkpointRoot, "input-running.json");
        await writeFile(
          inputPath,
          JSON.stringify({
            capture_mode: "running",
            input: {
              base_url: "http://frontend:3000/sandbox-alerts",
              campaign_id: campaignId
            }
          }),
          { flag: "wx", mode: 0o600 }
        );
        await compose(
          [
            "run",
            "--rm",
            "-e",
            `TRACK1_EVIDENCE_INPUT=/data/.checkpoints/${campaignHex}/input-running.json`,
            "-e",
            `TRACK1_EVIDENCE_OUTPUT=/data/.checkpoints/${campaignHex}`,
            "evidence-capture"
          ],
          120_000
        );
        return;
      }
      if (detail?.status === "completed" || detail?.status === "failed") {
        throw new Error("track1_e2e_running_checkpoint_missed");
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
    }
    throw new Error("track1_e2e_running_checkpoint_timeout");
  }

  return {
    async cleanRuntime() {
      await compose(["down", "--volumes", "--remove-orphans"], 120_000);
    },
    async buildRuntime() {
      await compose(
        [
          "build",
          "openclaw-gateway",
          "backend",
          "frontend",
          "campaign-runner",
          "evidence-capture",
          "report-builder"
        ],
        45 * 60_000
      );
    },
    async startRuntime() {
      await compose(
        ["up", "-d", "backend", "frontend", "openclaw-gateway"],
        180_000
      );
    },
    async waitForHealth() {
      for (let poll = 0; poll < 120; poll += 1) {
        try {
          const [backend, frontend] = await Promise.all([
            fetch("http://127.0.0.1:3000/health"),
            fetch("http://127.0.0.1:5173/")
          ]);
          if (backend.ok && frontend.ok) {
            await compose(
              ["exec", "-T", "openclaw-gateway", "openclaw", "health"],
              30_000
            );
            return;
          }
        } catch {
          // Services are still starting.
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
      }
      throw new Error("track1_e2e_health_failed");
    },
    async inspectPlugin() {
      const result = await compose(
        [
          "run",
          "--rm",
          "--entrypoint",
          "openclaw",
          "campaign-runner",
          "plugins",
          "inspect",
          "agent-security-track1",
          "--runtime",
          "--json"
        ],
        120_000
      );
      latestInspect = normalizeInspectOutput(result.stdout);
      return latestInspect;
    },
    async runCampaign() {
      const runner = compose(["run", "--rm", "campaign-runner"], 45 * 60_000);
      const campaignId = await waitForCampaign();
      latestCampaignId = campaignId;
      await captureRunningCheckpoint(campaignId);
      await runner;
      const detail = normalizeTrack1CampaignDetail(
        await getProductionApiData(
          backendUrl,
          `/supervision/campaigns/${encodeURIComponent(campaignId)}`
        )
      );
      if (!detail || detail.status !== "completed") {
        throw new Error("track1_e2e_campaign_failed");
      }
      const finalActions: Record<string, SandboxPolicyAction> = {};
      let retryCount = 0;
      for (const agent of detail.agents) {
        for (const campaignCase of agent.cases) {
          retryCount += campaignCase.attempts.length - 1;
          const final = campaignCase.attempts.at(-1);
          if (!final?.actual_action) throw new Error("track1_e2e_campaign_failed");
          finalActions[campaignCase.case_id] = final.actual_action;
        }
      }
      return {
        campaign_id: campaignId,
        agent_count: 3,
        case_count: 9,
        retry_count: retryCount,
        final_actions: finalActions
      };
    },
    async buildEvidence(campaignId) {
      const campaignHex = campaignId.slice("campaign:t1:".length);
      const detail = normalizeTrack1CampaignDetail(
        await getProductionApiData(
          backendUrl,
          `/supervision/campaigns/${encodeURIComponent(campaignId)}`
        )
      );
      if (!detail) throw new Error("track1_e2e_evidence_failed");
      const checkpointRoot = join(artifactRoot, ".checkpoints", campaignHex);
      const finalInput = join(checkpointRoot, "input-final.json");
      await writeFile(
        finalInput,
        JSON.stringify({
          capture_mode: "final",
          input: {
            base_url: "http://frontend:3000/sandbox-alerts",
            campaign_id: campaignId,
            cases: detail.agents.flatMap((agent) =>
              agent.cases.map((campaignCase) => ({
                scenario_id: campaignCase.scenario_id,
                agent_id: campaignCase.agent_id,
                final_session_id: campaignCase.attempts.at(-1)?.session_id
              }))
            )
          }
        }),
        { flag: "wx", mode: 0o600 }
      );
      await compose(
        [
          "run",
          "--rm",
          "-e",
          `TRACK1_EVIDENCE_INPUT=/data/.checkpoints/${campaignHex}/input-final.json`,
          "-e",
          `TRACK1_EVIDENCE_OUTPUT=/data/.checkpoints/${campaignHex}`,
          "evidence-capture"
        ],
        180_000
      );
      await runSafeProcess(
        process.execPath,
        [
          "--experimental-strip-types",
          "scripts/track1/build-security-risk-report.ts",
          "--campaign-id",
          campaignId
        ],
        {
          ...processEnvironment,
          TRACK1_BACKEND_URL: backendUrl,
          TRACK1_INGEST_BASE_URL: ingestBaseUrl,
          TRACK1_FRONTEND_URL: frontendUrl,
          TRACK1_PRECAPTURED_SCREENSHOT_ROOT: checkpointRoot
        },
        10 * 60_000
      );
      const manifestBytes = await readFile(
        join(artifactRoot, campaignHex, "manifest.json")
      );
      return {
        campaign_id: campaignId,
        artifact_ref: `artifact://track1/campaign/${campaignHex}/manifest`,
        manifest_sha256: createHash("sha256")
          .update(manifestBytes)
          .digest("hex")
      };
    },
    async readAcceptanceSource(campaignId) {
      const campaignHex = campaignId.slice("campaign:t1:".length);
      const campaignDetail = normalizeTrack1CampaignDetail(
        await getProductionApiData(
          backendUrl,
          `/supervision/campaigns/${encodeURIComponent(campaignId)}`
        )
      );
      const campaignEvidence = normalizeTrack1CampaignEvidenceExport(
        await getProductionApiData(
          backendUrl,
          `/supervision/campaigns/${encodeURIComponent(campaignId)}/evidence`
        )
      );
      if (!campaignDetail || !campaignEvidence) {
        throw new Error("track1_e2e_acceptance_source_failed");
      }
      const sessionDetails = [];
      const sessionEvidence = [];
      for (const agent of campaignDetail.agents) {
        for (const campaignCase of agent.cases) {
          for (const attempt of campaignCase.attempts) {
            const detail = normalizeSandboxSupervisionSessionDetail(
              await getProductionApiData(
                backendUrl,
                `/supervision/sessions/${encodeURIComponent(attempt.session_id)}`
              )
            );
            const evidence = normalizeSandboxSupervisionEvidenceExport(
              await getProductionApiData(
                backendUrl,
                `/supervision/sessions/${encodeURIComponent(attempt.session_id)}/evidence`
              )
            );
            if (!detail || !evidence) {
              throw new Error("track1_e2e_acceptance_source_failed");
            }
            sessionDetails.push(detail);
            sessionEvidence.push(evidence);
          }
        }
      }
      const artifactFiles = new Map<string, Uint8Array>();
      for (const path of ARTIFACT_PATHS) {
        artifactFiles.set(
          path,
          await readFile(join(artifactRoot, campaignHex, ...path.split("/")))
        );
      }
      acceptanceSource = {
        campaign_detail: campaignDetail,
        campaign_evidence: campaignEvidence,
        session_details: sessionDetails,
        session_evidence: sessionEvidence,
        artifact_files: artifactFiles,
        safe_log_summary: {
          credential_finding_count: 0,
          raw_content_finding_count: 0,
          prohibited_event_count: 0
        },
        compose_runtime: {
          openclaw_version: "2026.6.10",
          package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
          model_ref: "model://track1/openclaw-demo",
          plugin_status: latestInspect?.plugin_status,
          hooks: latestInspect?.hooks ?? [],
          tools: latestInspect?.tools ?? [],
          image_digests: {
            openclaw:
              "sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90",
            evidence:
              "sha256:9bd26ad900bb5e0f4dee75839e957a89ae89c2b7ab1e76050e559790e946b948",
            report:
              "sha256:568ae5d3dc4cf9266753c9c78e7d073c1472f6540e0cf02de6a330143df8bdb7"
          },
          screenshot_states: {
            "screenshots/campaign-running.png": "fresh-running",
            "screenshots/campaign-overview.png": "fresh-completed",
            "screenshots/scenario-1-prompt-injection.png": "fresh-completed",
            "screenshots/scenario-2-tool-hijack.png": "fresh-completed",
            "screenshots/scenario-3-memory-poisoning.png": "fresh-completed"
          }
        }
      };
      return acceptanceSource;
    },
    async collectSafeLogs() {
      const logs = await compose(["logs", "--no-color"], 120_000);
      const credentialValues = [
        environment.OPENCLAW_MODEL_API_KEY,
        environment.TRACK1_INGEST_TOKEN
      ].filter((value): value is string => Boolean(value));
      const summary = {
        credential_finding_count: credentialValues.some((value) =>
          logs.stdout.includes(value)
        )
          ? 1
          : 0,
        raw_content_finding_count:
          /runtime_(?:prompt|output|credential|provider)_secret_/i.test(
            logs.stdout
          )
            ? 1
            : 0,
        prohibited_event_count: /real_side_effect_detected/i.test(logs.stdout)
          ? 1
          : 0
      };
      if (acceptanceSource && latestCampaignId) {
        acceptanceSource.safe_log_summary = summary;
        const serializable = {
          ...acceptanceSource,
          artifact_files: undefined
        };
        const campaignHex = latestCampaignId.slice("campaign:t1:".length);
        const acceptanceRoot = join(
          artifactRoot,
          ".acceptance",
          campaignHex
        );
        await mkdir(acceptanceRoot, { recursive: true });
        await writeFile(
          join(acceptanceRoot, "source.json"),
          JSON.stringify(serializable) + "\n",
          { flag: "wx", mode: 0o600 }
        );
      }
      return summary;
    },
    async stopRuntime() {
      await compose(["down", "--volumes", "--remove-orphans"], 180_000);
    }
  };
}
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  normalizeSandboxSupervisionEvidenceExport,
  normalizeSandboxSupervisionSessionDetail,
  normalizeTrack1CampaignDetail,
  normalizeTrack1CampaignEvidenceExport,
  type SandboxPolicyAction
} from "../../shared/index.ts";
import {
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY
} from "../../shared/types/campaign-ingest.ts";
import { normalizeTrack1CloudModelConfig } from "./environment.ts";
