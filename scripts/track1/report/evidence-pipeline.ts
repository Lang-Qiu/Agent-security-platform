import {
  normalizeTrack1CampaignEvidenceRegistration
} from "../../../shared/contracts/campaign-ingest.ts";
import {
  TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION
} from "../../../shared/types/campaign-ingest.ts";
import {
  EXPECTED_TRACK1_ARTIFACT_PATHS,
  type Track1EvidenceManifestBuild
} from "./evidence-manifest.ts";
import type { Track1ReportModel } from "./report-model.ts";

const CAMPAIGN_ID = /^campaign:t1:([a-f0-9]{32})$/;

export interface Track1EvidenceCapture {
  path: string;
  bytes: Uint8Array;
}

export interface Track1TempEvidenceDirectory {
  temp_directory: string;
  files: Map<string, Uint8Array>;
}

export interface Track1EvidencePipelinePorts {
  loadSource(campaignId: string): Promise<unknown>;
  projectReport(source: unknown): Track1ReportModel;
  captureRunning(model: Track1ReportModel): Promise<Track1EvidenceCapture>;
  captureFinal(model: Track1ReportModel): Promise<Track1EvidenceCapture[]>;
  buildMarkdown(model: Track1ReportModel): Promise<Uint8Array>;
  buildPdf(
    model: Track1ReportModel,
    markdown: Uint8Array,
    screenshots: ReadonlyMap<string, Uint8Array>
  ): Promise<Uint8Array>;
  buildCampaignJson(model: Track1ReportModel): Uint8Array;
  buildManifest(
    model: Track1ReportModel,
    artifacts: Map<string, Uint8Array>
  ): Track1EvidenceManifestBuild;
  writeTempFiles(
    campaignId: string,
    files: ReadonlyMap<string, Uint8Array>
  ): Promise<Track1TempEvidenceDirectory>;
  rereadValidate(
    temp: Track1TempEvidenceDirectory
  ): Promise<Track1TempEvidenceDirectory>;
  atomicPublish(campaignId: string, temp: Track1TempEvidenceDirectory): Promise<string>;
  registerEvidence(input: Record<string, unknown>): Promise<void>;
  now(): string;
}

export interface Track1EvidencePackResult {
  campaign_id: string;
  status: "registered";
  artifact_ref: string;
  artifact_manifest_sha256: string;
  output_directory: string;
}

function cliFail(): never {
  throw new Error("track1_report_cli_invalid");
}

function buildFail(): never {
  throw new Error("track1_evidence_build_failed");
}

function normalizeRequest(value: unknown): { campaign_id: string; campaign_hex: string } {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return buildFail();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.campaign_id !== "string"
  ) {
    return buildFail();
  }
  const match = record.campaign_id.match(CAMPAIGN_ID);
  if (!match) return buildFail();
  return { campaign_id: record.campaign_id, campaign_hex: match[1] };
}

function copyCapture(
  capture: Track1EvidenceCapture,
  expectedPath: string
): [string, Uint8Array] {
  if (
    capture === null ||
    typeof capture !== "object" ||
    capture.path !== expectedPath ||
    !(capture.bytes instanceof Uint8Array) ||
    capture.bytes.byteLength === 0
  ) {
    return buildFail();
  }
  return [capture.path, Uint8Array.from(capture.bytes)];
}

function assertRereadMatches(
  expected: ReadonlyMap<string, Uint8Array>,
  actual: Track1TempEvidenceDirectory
): void {
  if (
    !actual ||
    typeof actual.temp_directory !== "string" ||
    !(actual.files instanceof Map) ||
    actual.files.size !== expected.size
  ) {
    buildFail();
  }
  for (const [path, bytes] of expected) {
    const reread = actual.files.get(path);
    if (
      !(reread instanceof Uint8Array) ||
      !Buffer.from(reread).equals(Buffer.from(bytes))
    ) {
      buildFail();
    }
  }
}

export function parseTrack1ReportCli(
  args: readonly string[]
): { campaign_id: string } {
  if (
    args.length !== 2 ||
    args[0] !== "--campaign-id" ||
    !CAMPAIGN_ID.test(args[1] ?? "")
  ) {
    return cliFail();
  }
  return Object.freeze({ campaign_id: args[1] });
}

export async function buildTrack1EvidencePack(
  request: unknown,
  ports: Track1EvidencePipelinePorts
): Promise<Readonly<Track1EvidencePackResult>> {
  const { campaign_id: campaignId, campaign_hex: campaignHex } =
    normalizeRequest(request);
  if (!ports || typeof ports.loadSource !== "function") buildFail();

  let manifestBuild: Track1EvidenceManifestBuild;
  let validated: Track1TempEvidenceDirectory;
  try {
    const source = await ports.loadSource(campaignId);
    const model = ports.projectReport(source);
    if (
      model.campaign.campaign_id !== campaignId ||
      model.campaign.status !== "completed"
    ) {
      buildFail();
    }
    const running = await ports.captureRunning(model);
    const final = await ports.captureFinal(model);
    const screenshotEntries = [
      copyCapture(running, "screenshots/campaign-running.png"),
      ...final.map((capture, index) =>
        copyCapture(
          capture,
          EXPECTED_TRACK1_ARTIFACT_PATHS[index + 4]
        )
      )
    ];
    if (final.length !== 4) buildFail();
    const screenshots = new Map<string, Uint8Array>(screenshotEntries);
    const markdown = Uint8Array.from(await ports.buildMarkdown(model));
    const pdf = Uint8Array.from(
      await ports.buildPdf(model, markdown, screenshots)
    );
    const campaignJson = Uint8Array.from(ports.buildCampaignJson(model));
    const artifacts = new Map<string, Uint8Array>([
      ["security-risk-analysis.md", markdown],
      ["security-risk-analysis.pdf", pdf],
      ["campaign.json", campaignJson],
      ...screenshotEntries
    ]);
    manifestBuild = ports.buildManifest(model, artifacts);
    const allFiles = new Map(artifacts);
    allFiles.set(
      "manifest.json",
      Buffer.from(manifestBuild.canonical_json, "utf8")
    );
    const temporary = await ports.writeTempFiles(campaignId, allFiles);
    validated = await ports.rereadValidate(temporary);
    assertRereadMatches(allFiles, validated);
  } catch {
    return buildFail();
  }

  const artifactRef = `artifact://track1/campaign/${campaignHex}/manifest`;
  let outputDirectory: string;
  try {
    outputDirectory = await ports.atomicPublish(campaignId, validated);
  } catch {
    return buildFail();
  }
  const registration = normalizeTrack1CampaignEvidenceRegistration({
    schema_version: TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION,
    campaign_id: campaignId,
    artifact_manifest_sha256: manifestBuild.manifest_sha256,
    artifact_manifest_ref: artifactRef,
    registered_at: ports.now()
  });
  if (!registration) buildFail();
  try {
    await ports.registerEvidence(registration);
  } catch {
    throw new Error("track1_evidence_registration_failed");
  }
  return Object.freeze({
    campaign_id: campaignId,
    status: "registered" as const,
    artifact_ref: artifactRef,
    artifact_manifest_sha256: manifestBuild.manifest_sha256,
    output_directory: outputDirectory
  });
}
