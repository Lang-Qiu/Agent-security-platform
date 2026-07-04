import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  normalizeSandboxSupervisionEvidenceExport,
  normalizeTrack1CampaignDetail
} from "../../shared/index.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
  TRACK1_OPENCLAW_VERSION
} from "../../shared/types/campaign-ingest.ts";
import {
  captureTrack1FinalEvidence,
  openTrack1PlaywrightBrowserPort
} from "./capture-openclaw-evidence.ts";
import { canonicalJson } from "./report/canonical-json.ts";
import {
  buildTrack1EvidenceManifest
} from "./report/evidence-manifest.ts";
import {
  buildTrack1EvidencePack,
  parseTrack1ReportCli,
  type Track1EvidencePipelinePorts,
  type Track1TempEvidenceDirectory
} from "./report/evidence-pipeline.ts";
import { buildTrack1MarkdownReport } from "./report/markdown-report.ts";
import {
  buildTrack1Pdf,
  type Track1PdfBuilderPort
} from "./report/pdf-builder.ts";
import { projectTrack1ReportModel } from "./report/report-projector.ts";

const REPORT_IMAGE = "agent-security-track1-report:1";

function apiUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

async function getApiData(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("track1_report_api_failed");
  const body = (await response.json()) as Record<string, unknown>;
  if (!body || body.success !== true) throw new Error("track1_report_api_failed");
  return body.data;
}

function runProcess(
  executable: string,
  args: readonly string[],
  timeoutMs: number
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, [...args], {
      shell: false,
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        PATH: process.env.PATH ?? "",
        PATHEXT: process.env.PATHEXT ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        ComSpec: process.env.ComSpec ?? ""
      }
    });
    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(new Error("track1_report_process_failed"));
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timeout);
      rejectPromise(new Error("track1_report_process_failed"));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0 && signal === null) resolvePromise();
      else rejectPromise(new Error("track1_report_process_failed"));
    });
  });
}

function dockerPdfPort(): Track1PdfBuilderPort {
  return {
    async render(input, assets) {
      const root = await mkdtemp(join(tmpdir(), "track1-pdf-"));
      try {
        const inputRoot = join(root, "input");
        const outputRoot = join(root, "output");
        await mkdir(join(inputRoot, "screenshots"), { recursive: true });
        await mkdir(outputRoot, { recursive: true });
        await writeFile(
          join(inputRoot, "security-risk-analysis.md"),
          assets.markdown,
          { flag: "wx", mode: 0o600 }
        );
        for (const [path, bytes] of assets.screenshots) {
          await writeFile(join(inputRoot, path), bytes, {
            flag: "wx",
            mode: 0o600
          });
        }
        await runProcess(
          "docker",
          [
            "run",
            "--rm",
            "--network",
            "none",
            "--env",
            `SOURCE_DATE_EPOCH=${input.source_date_epoch}`,
            "--volume",
            `${root}:/data`,
            REPORT_IMAGE
          ],
          120_000
        );
        return readFile(join(outputRoot, "security-risk-analysis.pdf"));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  };
}

async function writeFileMap(
  root: string,
  files: ReadonlyMap<string, Uint8Array>
): Promise<void> {
  for (const [path, bytes] of files) {
    if (
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").includes("..")
    ) {
      throw new Error("track1_report_path_invalid");
    }
    const destination = join(root, ...path.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
  }
}

function createProductionEvidencePorts(config: {
  backendBaseUrl: string;
  ingestBaseUrl: string;
  ingestToken: string;
  frontendUrl: string;
  artifactRoot: string;
}): Track1EvidencePipelinePorts {
  return {
    async loadSource(campaignId) {
      const detail = normalizeTrack1CampaignDetail(
        await getApiData(
          apiUrl(
            config.backendBaseUrl,
            `/supervision/campaigns/${encodeURIComponent(campaignId)}`
          )
        )
      );
      if (!detail) throw new Error("track1_report_source_invalid");
      const attempts = detail.agents.flatMap((agent) =>
        agent.cases.flatMap((campaignCase) => campaignCase.attempts)
      );
      const sessions = [];
      for (const attempt of attempts) {
        const evidence = normalizeSandboxSupervisionEvidenceExport(
          await getApiData(
            apiUrl(
              config.backendBaseUrl,
              `/supervision/sessions/${encodeURIComponent(attempt.session_id)}/evidence`
            )
          )
        );
        if (!evidence) throw new Error("track1_report_source_invalid");
        sessions.push(evidence);
      }
      const campaignManifest = JSON.parse(
        await readFile(
          new URL("../../samples/track1/openclaw/campaign.v1.json", import.meta.url),
          "utf8"
        )
      );
      return {
        campaign: detail,
        sessions,
        campaign_manifest: campaignManifest,
        openclaw: {
          version: TRACK1_OPENCLAW_VERSION,
          package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
          model_ref: TRACK1_MODEL_REF_CANONICAL,
          campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256
        }
      };
    },
    projectReport: projectTrack1ReportModel,
    async captureRunning(model) {
      const campaignHex = model.campaign.campaign_id.slice("campaign:t1:".length);
      return {
        path: "screenshots/campaign-running.png",
        bytes: await readFile(
          join(
            config.artifactRoot,
            ".checkpoints",
            campaignHex,
            "campaign-running.png"
          )
        )
      };
    },
    async captureFinal(model) {
      const precaptured = process.env.TRACK1_PRECAPTURED_SCREENSHOT_ROOT;
      if (precaptured) {
        return [
          "campaign-overview.png",
          "scenario-1-prompt-injection.png",
          "scenario-2-tool-hijack.png",
          "scenario-3-memory-poisoning.png"
        ].map((name) => ({
          path: `screenshots/${name}`,
          bytes: readFile(join(precaptured, name))
        })).reduce<Promise<Array<{ path: string; bytes: Uint8Array }>>>(
          async (pending, item) => [
            ...(await pending),
            { path: item.path, bytes: await item.bytes }
          ],
          Promise.resolve([])
        );
      }
      const browser = await openTrack1PlaywrightBrowserPort(config.frontendUrl);
      try {
        return [
          ...(await captureTrack1FinalEvidence(
            {
              base_url: config.frontendUrl,
              campaign_id: model.campaign.campaign_id,
              cases: model.cases.map((item) => ({
                scenario_id: item.scenario_id,
                agent_id: item.agent_id,
                final_session_id: item.final_session_id
              }))
            },
            browser.port
          ))
        ];
      } finally {
        await browser.close();
      }
    },
    async buildMarkdown(model) {
      return Buffer.from(
        await buildTrack1MarkdownReport(model, {
          read(path) {
            return readFile(resolve(path));
          }
        }),
        "utf8"
      );
    },
    async buildPdf(model, markdown, screenshots) {
      return buildTrack1Pdf(
        {
          markdown,
          completed_at: model.campaign.completed_at,
          screenshot_files: screenshots
        },
        dockerPdfPort()
      );
    },
    buildCampaignJson(model) {
      return Buffer.from(canonicalJson(model), "utf8");
    },
    buildManifest: buildTrack1EvidenceManifest,
    async writeTempFiles(campaignId, files) {
      await mkdir(config.artifactRoot, { recursive: true });
      const campaignHex = campaignId.slice("campaign:t1:".length);
      const temporary = await mkdtemp(
        join(config.artifactRoot, `.campaign-${campaignHex}-`)
      );
      await writeFileMap(temporary, files);
      return { temp_directory: temporary, files: new Map(files) };
    },
    async rereadValidate(temp) {
      const files = new Map<string, Uint8Array>();
      for (const path of temp.files.keys()) {
        files.set(path, await readFile(join(temp.temp_directory, ...path.split("/"))));
      }
      return { temp_directory: temp.temp_directory, files };
    },
    async atomicPublish(campaignId, temp: Track1TempEvidenceDirectory) {
      const campaignHex = campaignId.slice("campaign:t1:".length);
      const destination = join(config.artifactRoot, campaignHex);
      try {
        await stat(destination);
        throw new Error("track1_report_destination_exists");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        ) throw error;
      }
      await rename(temp.temp_directory, destination);
      return `artifacts/track1/${basename(destination)}`;
    },
    async registerEvidence(input) {
      const campaignId = String(input.campaign_id);
      const response = await fetch(
        apiUrl(
          config.ingestBaseUrl,
          `/campaigns/${encodeURIComponent(campaignId)}/evidence`
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.ingestToken}`
          },
          body: JSON.stringify(input)
        }
      );
      if (!response.ok) throw new Error("track1_evidence_registration_failed");
    },
    now() {
      return new Date().toISOString();
    }
  };
}

async function runCli(): Promise<void> {
  const request = parseTrack1ReportCli(process.argv.slice(2));
  const ingestToken = process.env.TRACK1_INGEST_TOKEN;
  if (!ingestToken) throw new Error("track1_report_environment_invalid");
  const result = await buildTrack1EvidencePack(
    request,
    createProductionEvidencePorts({
      backendBaseUrl:
        process.env.TRACK1_BACKEND_URL ?? "http://127.0.0.1:3000/api",
      ingestBaseUrl:
        process.env.TRACK1_INGEST_BASE_URL ??
        "http://127.0.0.1:3001/internal/track1",
      ingestToken,
      frontendUrl:
        process.env.TRACK1_FRONTEND_URL ??
        "http://127.0.0.1:5173/sandbox-alerts",
      artifactRoot: resolve("artifacts/track1")
    })
  );
  process.stdout.write(
    `status=${result.status} campaign_id=${result.campaign_id} artifact_ref=${result.artifact_ref}\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await runCli();
  } catch {
    process.stderr.write("track1_report_failed\n");
    process.exitCode = 1;
  }
}
