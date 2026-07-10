import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

import {
  SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION,
  SANDBOX_SUPERVISION_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
  TRACK1_CASE_IDS,
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
  TRACK1_OPENCLAW_VERSION,
  TRACK1_SCENARIO_IDS,
  type SandboxPolicyAction,
  type SandboxSupervisionDecisionView,
  type SandboxSupervisionEventView,
  type SandboxSupervisionEvidenceExport,
  type Track1CampaignAgentDetail,
  type Track1CampaignAttemptSummary,
  type Track1CampaignDetail,
  type Track1CaseId
} from "../../../shared/index.ts";
import {
  getTrack1CaseExpectedAction
} from "../../../shared/types/campaign-supervision.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256
} from "../../../shared/types/campaign-ingest.ts";
import { projectTrack1ReportModel } from "../../../scripts/track1/report/report-projector.ts";
import { canonicalJson } from "../../../scripts/track1/report/canonical-json.ts";
import { buildTrack1EvidenceManifest } from "../../../scripts/track1/report/evidence-manifest.ts";
import { buildTrack1MarkdownReport } from "../../../scripts/track1/report/markdown-report.ts";
import { buildTrack1Pdf } from "../../../scripts/track1/report/pdf-builder.ts";

const STARTED_AT = "2026-06-30T00:00:00.000Z";
const UPDATED_AT = "2026-06-30T00:10:00.000Z";
const SHA256_ZERO = "0".repeat(64);

export const RUNTIME_SENTINELS = Object.freeze({
  prompt: "runtime_prompt_secret_7f194d",
  output: "runtime_output_secret_8a205e",
  credential: "runtime_credential_secret_9b316f",
  provider: "runtime_provider_secret_ac4270"
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

function readManifest(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "samples/track1/openclaw/campaign.v1.json"),
      "utf8"
    )
  ) as Record<string, unknown>;
}

// Fixture attempts always simulate one tool_request event regardless of the
// case's real tool_behavior.disposition. For must_not_execute cases, the
// simulated tool must match the case's declared tools so the acceptance
// validator's per-case tool-name check passes. not_requested cases have no
// declared tool, so the simulated event keeps a scenario-based placeholder.
const CASE_TOOL_NAMES: ReadonlyMap<string, string> = new Map(
  (readManifest().cases as Array<{ case_id: string; case_ref: string }>)
    .map((item) => {
      const caseDoc = JSON.parse(
        readFileSync(resolve(process.cwd(), item.case_ref), "utf8")
      ) as { expected_outcome: { tool_behavior: { tools: string[] } } };
      const tools = caseDoc.expected_outcome.tool_behavior.tools;
      return tools.length > 0
        ? ([item.case_id, tools[0]] as const)
        : null;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null)
);

function toolNameForCase(caseId: string, scenarioId: string): string {
  return (
    CASE_TOOL_NAMES.get(caseId) ??
    (scenarioId === "T1-SC-001"
      ? "read_file"
      : scenarioId === "T1-SC-002"
        ? "send_email"
        : "write_file")
  );
}

function makeDecision(
  attempt: Track1CampaignAttemptSummary,
  action: SandboxPolicyAction,
  suffix: string
): SandboxSupervisionDecisionView {
  return {
    decision_id: `decision:${suffix}`,
    subject_event_id: `event:${suffix}:tool-request`,
    policy_id: "policy:track1:base-filter:v1",
    action,
    reason_code: `fixture-${action}`,
    evidence_refs: [`evidence://track1/decision/${suffix}`],
    decided_at: UPDATED_AT
  };
}

function makeSessionEvidence(
  attempt: Track1CampaignAttemptSummary
): SandboxSupervisionEvidenceExport {
  const suffix = attempt.session_id.replaceAll(":", "-");
  const action = attempt.actual_action ?? "deny";
  const decision = makeDecision(attempt, action, suffix);
  const toolName = toolNameForCase(attempt.case_id, attempt.scenario_id);
  const common = {
    session_id: attempt.session_id,
    occurred_at: UPDATED_AT,
    scenario_id: attempt.scenario_id,
    case_id: attempt.case_id,
    evidence_refs: [`evidence://track1/session/${suffix}`]
  };
  const events: SandboxSupervisionEventView[] = [
    {
      ...common,
      event_id: `event:${suffix}:model-input`,
      sequence: 1,
      event_type: "model_input",
      source: "model",
      payload: {
        model_ref: TRACK1_MODEL_REF_CANONICAL,
        content_ref: `content://track1/${suffix}/model-input`,
        content_sha256: SHA256_ZERO
      }
    },
    {
      ...common,
      event_id: `event:${suffix}:tool-request`,
      sequence: 2,
      event_type: "tool_request",
      source: "agent",
      payload: {
        call_id: `call:${suffix}`,
        tool_name: toolName,
        target_ref: `target://track1/${suffix}`,
        arguments_ref: `arguments://track1/${suffix}`
      }
    },
    {
      ...common,
      event_id: `event:${suffix}:policy-decision`,
      sequence: 3,
      event_type: "policy_decision",
      source: "policy",
      payload: decision
    },
    {
      ...common,
      event_id: `event:${suffix}:tool-result`,
      sequence: 4,
      event_type: "tool_result",
      source: "tool",
      payload: {
        call_id: `call:${suffix}`,
        tool_name: toolName,
        status:
          attempt.status === "failed"
            ? "failed"
            : action === "allow"
              ? "success"
              : "rejected",
        result_ref: `result://track1/${suffix}`,
        state_change: "simulated"
      }
    }
  ];
  const blockedRecords =
    action === "deny"
      ? [
          {
            blocked_record_id: `blocked:${suffix}`,
            subject_event_id: decision.subject_event_id,
            decision_id: decision.decision_id,
            evidence_refs: [`evidence://track1/blocked/${suffix}`],
            occurred_at: UPDATED_AT
          }
        ]
      : [];
  const alerts =
    action === "alert"
      ? [
          {
            alert_id: `alert:${suffix}`,
            subject_event_id: decision.subject_event_id,
            decision_id: decision.decision_id,
            risk_level: "high" as const,
            category: "fixture-alert",
            evidence_refs: [`evidence://track1/alert/${suffix}`],
            occurred_at: UPDATED_AT
          }
        ]
      : [];

  return {
    schema_version: SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION,
    source_schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    session: {
      schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
      summary: {
        task_id: attempt.task_id,
        session_id: attempt.session_id,
        task_status:
          attempt.status === "failed"
            ? "failed"
            : action === "deny"
              ? "blocked"
              : "finished",
        risk_level: action === "deny" || action === "alert" ? "high" : "medium",
        highest_action: action,
        scenario_id: attempt.scenario_id,
        case_id: attempt.case_id,
        tool_names: [toolName],
        event_count: events.length,
        decision_count: 1,
        alert_count: alerts.length,
        blocked_record_count: blockedRecords.length,
        blocked: blockedRecords.length > 0,
        evidence_available: true,
        updated_at: UPDATED_AT,
        last_event_at: UPDATED_AT
      },
      events,
      policy_decisions: [decision],
      alerts,
      blocked_records: blockedRecords
    }
  };
}

function hexSuffix(value: number): string {
  return value.toString(16).padStart(32, "0");
}

function makeBaseCampaignDetail(): Track1CampaignDetail {
  const agents: Track1CampaignAgentDetail[] = TRACK1_CAMPAIGN_AGENT_IDS.map(
    (agentId, agentIndex) => {
      const scenarioId = TRACK1_SCENARIO_IDS[agentIndex];
      const cases = TRACK1_CASE_IDS.slice(agentIndex * 3, agentIndex * 3 + 3).map(
        (caseId, caseWithinAgent) => {
          const caseIndex = agentIndex * 3 + caseWithinAgent;
          const expectedAction = getTrack1CaseExpectedAction(caseId as Track1CaseId);
          const attempt: Track1CampaignAttemptSummary = {
            campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
            agent_id: agentId,
            scenario_id: scenarioId,
            case_id: caseId,
            attempt_id: `attempt:${caseId.toLowerCase()}:1`,
            attempt_index: 1,
            session_id: `session:${hexSuffix(caseIndex + 1)}`,
            task_id: `task:${hexSuffix(caseIndex + 0x101)}`,
            status: "passed",
            actual_action: expectedAction,
            started_at: STARTED_AT,
            updated_at: UPDATED_AT
          };
          return {
            campaign_id: attempt.campaign_id,
            agent_id: agentId,
            scenario_id: scenarioId,
            case_id: caseId,
            status: "passed" as const,
            expected_action: expectedAction,
            attempt_count: 1 as const,
            attempts: [attempt],
            updated_at: UPDATED_AT
          };
        }
      );
      return {
        campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
        agent_id: agentId,
        scenario_id: scenarioId,
        status: "completed" as const,
        case_count: 3 as const,
        cases,
        updated_at: UPDATED_AT
      };
    }
  );

  return {
    schema_version: TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
    campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
    status: "completed",
    started_at: STARTED_AT,
    updated_at: UPDATED_AT,
    agent_count: 3,
    case_count: 9,
    agents
  };
}

function addAuditedRetry(campaign: Track1CampaignDetail): void {
  const firstCase = campaign.agents[0].cases[0];
  const finalAttempt = firstCase.attempts[0];
  const failedAttempt: Track1CampaignAttemptSummary = {
    ...clone(finalAttempt),
    attempt_id: finalAttempt.attempt_id,
    attempt_index: 1,
    session_id: "session:00000000000000000000000000000101",
    task_id: "task:00000000000000000000000000000201",
    status: "failed",
    actual_action: "allow",
    updated_at: "2026-06-30T00:04:00.000Z"
  };
  finalAttempt.attempt_id = finalAttempt.attempt_id.replace(/:1$/, ":2");
  finalAttempt.attempt_index = 2;
  finalAttempt.session_id = "session:00000000000000000000000000000181";
  finalAttempt.task_id = "task:00000000000000000000000000000281";
  finalAttempt.started_at = "2026-06-30T00:05:00.000Z";
  firstCase.attempt_count = 2;
  firstCase.attempts = [failedAttempt, finalAttempt];
}

export function makeCompletedCampaignReportSource() {
  const campaign = makeBaseCampaignDetail();
  addAuditedRetry(campaign);
  const sessions = campaign.agents.flatMap((agent) =>
    agent.cases.flatMap((campaignCase) =>
      campaignCase.attempts.map(makeSessionEvidence)
    )
  );

  return {
    campaign,
    sessions,
    campaign_manifest: readManifest(),
    openclaw: {
      version: TRACK1_OPENCLAW_VERSION,
      package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
      model_ref: TRACK1_MODEL_REF_CANONICAL,
      campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256
    }
  };
}

export function makeRunningCampaignReportSource() {
  const source = makeCompletedCampaignReportSource();
  source.campaign.status = "running";
  source.campaign.agents[0].status = "running";
  source.campaign.agents[0].cases[0].status = "running";
  source.campaign.agents[0].cases[0].attempts[1].status = "running";
  source.campaign.agents[0].cases[0].attempts[1].actual_action = null;
  return source;
}

export function makeFailedCampaignReportSource() {
  const source = makeCompletedCampaignReportSource();
  source.campaign.status = "failed";
  source.campaign.agents[0].status = "failed";
  source.campaign.agents[0].cases[0].status = "failed";
  source.campaign.agents[0].cases[0].attempts[1].status = "failed";
  return source;
}

export function makeNineSessionEvidenceExports() {
  return makeCompletedCampaignReportSource().sessions;
}

export function makeExpectedActionMatrix() {
  const manifest = readManifest();
  return clone(manifest.cases);
}

export function makeRuntimeContentMutations(): unknown[] {
  return Object.values(RUNTIME_SENTINELS).map((sentinel, index) => {
    const source = makeCompletedCampaignReportSource() as Record<string, unknown>;
    const keys = ["raw_prompt", "model_output", "credential", "provider_response"];
    source[keys[index]] = sentinel;
    return source;
  });
}

export const EXPECTED_ARTIFACT_PATHS = Object.freeze([
  "security-risk-analysis.md",
  "security-risk-analysis.pdf",
  "campaign.json",
  "screenshots/campaign-running.png",
  "screenshots/campaign-overview.png",
  "screenshots/scenario-1-prompt-injection.png",
  "screenshots/scenario-2-tool-hijack.png",
  "screenshots/scenario-3-memory-poisoning.png"
]);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const payload = Buffer.from(data);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])));
  return Buffer.concat([length, typeBytes, payload, checksum]);
}

function makeFixturePng(): Buffer {
  const width = 1440;
  const height = 1000;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height, 0x40);
  for (let row = 0; row < height; row += 1) {
    pixels[row * stride] = 0;
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const FIXTURE_PNG = makeFixturePng();

export function makeCompletedReportModel() {
  return projectTrack1ReportModel(makeCompletedCampaignReportSource());
}

export function makeArtifactBytes(path: string): Uint8Array {
  if (path.endsWith(".png")) {
    return Buffer.from(FIXTURE_PNG);
  }
  if (path.endsWith(".pdf")) {
    return Buffer.from("%PDF-1.7\ntrack1-fixture\n%%EOF\n", "utf8");
  }
  if (path.endsWith(".json")) {
    return Buffer.from('{"schema_version":"track1-fixture.v1"}\n', "utf8");
  }
  return Buffer.from("# Track 1 fixture report\n", "utf8");
}

export function makeCompleteArtifactByteMap(): Map<string, Uint8Array> {
  return new Map(
    EXPECTED_ARTIFACT_PATHS.map((path) => [path, makeArtifactBytes(path)])
  );
}

export function makeCanonicalFixturePort(options?: {
  tamperCase?: string;
}) {
  const model = makeCompletedReportModel();
  const fixtures = model.fixture_appendix.map((entry) => {
    const bytes = readFileSync(resolve(process.cwd(), entry.path));
    return {
      ...entry,
      controlled_content: bytes.toString("utf8")
    };
  });
  const readPaths: string[] = [];
  return {
    fixtures,
    readPaths,
    async read(path: string): Promise<Uint8Array> {
      readPaths.push(path);
      const fixture = fixtures.find((item) => item.path === path);
      if (!fixture) throw new Error("fixture_not_found");
      const bytes = Buffer.from(fixture.controlled_content, "utf8");
      if (fixture.case_id === options?.tamperCase) {
        return Buffer.concat([bytes, Buffer.from("\n", "utf8")]);
      }
      return bytes;
    }
  };
}

export type CaptureMutation =
  | "stale"
  | "mock"
  | "loading"
  | "fallback"
  | "error"
  | "horizontal-overflow"
  | "console-error"
  | "failed-api"
  | "raw-sentinel"
  | "wrong-campaign"
  | "wrong-session"
  | "blank";

export function makeCompletedCampaignCaptureInput() {
  const model = makeCompletedReportModel();
  return {
    base_url: "http://frontend:5173/sandbox-alerts",
    campaign_id: model.campaign.campaign_id,
    cases: model.cases.map((item) => ({
      scenario_id: item.scenario_id,
      agent_id: item.agent_id,
      final_session_id: item.final_session_id
    }))
  };
}

export function makeRecordingBrowserPort(options?: {
  mutation?: CaptureMutation;
}) {
  const overflowViewports: Array<[number, number]> = [];
  const requests: Array<Record<string, unknown>> = [];
  return {
    overflowViewports,
    requests,
    async verifyOverflow(
      _input: unknown,
      viewport: readonly [number, number]
    ) {
      overflowViewports.push([viewport[0], viewport[1]]);
      return options?.mutation !== "horizontal-overflow";
    },
    async capture(request: Record<string, unknown>) {
      requests.push(structuredClone(request));
      const expectedState = request.expected_state as string;
      const expectedSession = request.session_id as string | undefined;
      const stateMutation = new Set([
        "stale",
        "mock",
        "loading",
        "fallback",
        "error"
      ]);
      return {
        bytes:
          options?.mutation === "blank"
            ? Buffer.from("89504e470d0a1a0a", "hex")
            : makeArtifactBytes(request.path as string),
        evidence_state: stateMutation.has(options?.mutation ?? "")
          ? options?.mutation
          : expectedState,
        campaign_id:
          options?.mutation === "wrong-campaign"
            ? "campaign:t1:ffffffffffffffffffffffffffffffff"
            : request.campaign_id,
        selected_agent_id: request.agent_id ?? null,
        selected_session_id:
          options?.mutation === "wrong-session"
            ? "session:ffffffffffffffffffffffffffffffff"
            : expectedSession ?? null,
        panel_boxes: [
          { width: 1200, height: 120 },
          { width: 1200, height: 680 }
        ],
        console_errors:
          options?.mutation === "console-error" ? ["console failed"] : [],
        page_errors: [],
        failed_requests:
          options?.mutation === "failed-api" ? ["/api/supervision"] : [],
        unexpected_origins: [],
        body_text:
          options?.mutation === "raw-sentinel"
            ? RUNTIME_SENTINELS.prompt
            : "fresh campaign evidence"
      };
    }
  };
}

export const FIXED_COMPLETION_EPOCH = Math.floor(
  Date.parse(UPDATED_AT) / 1000
);

export function makePdfBuildInput() {
  return {
    markdown: Buffer.from(
      "# 赛题一安全风险分析\n\nEnglish Abstract\n\n受控测试。\n",
      "utf8"
    ),
    completed_at: UPDATED_AT,
    screenshot_files: new Map(
      EXPECTED_ARTIFACT_PATHS.filter((path) => path.endsWith(".png")).map(
        (path) => [path, makeArtifactBytes(path)]
      )
    )
  };
}

function makeFixturePdf(): Uint8Array {
  return Buffer.from(
    "%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n" +
      "% Track 1 中文 English\n%%EOF\n",
    "utf8"
  );
}

export function makeRecordingPdfBuilderPort() {
  const inputs: Array<Record<string, unknown>> = [];
  return {
    inputs,
    async render(
      input: Record<string, unknown>,
      _assets: Readonly<{
        markdown: Uint8Array;
        screenshots: ReadonlyMap<string, Uint8Array>;
      }>
    ) {
      inputs.push(structuredClone(input));
      return makeFixturePdf();
    }
  };
}

export function makeRealContainerPdfPort() {
  return makeRecordingPdfBuilderPort();
}

export function makeFailingPdfPort(sentinel: string) {
  return {
    async render() {
      throw new Error(sentinel);
    }
  };
}

export type ReportBuildFailure =
  | "capture"
  | "markdown"
  | "pdf"
  | "manifest"
  | "reread"
  | "registration";

export function makeReportBuildPorts(options?: {
  failure?: ReportBuildFailure;
}) {
  const calls: string[] = [];
  const registrationInputs: Array<Record<string, unknown>> = [];
  const publishedDirectories: string[] = [];
  let artifactMap = makeCompleteArtifactByteMap();
  const failAt = (stage: ReportBuildFailure) => {
    if (options?.failure === stage) throw new Error(`fixture-${stage}-failure`);
  };
  return {
    calls,
    registrationInputs,
    publishedDirectories,
    async loadSource() {
      calls.push("load-source");
      return makeCompletedCampaignReportSource();
    },
    projectReport(source: unknown) {
      calls.push("project-report");
      return projectTrack1ReportModel(source);
    },
    async captureRunning() {
      calls.push("capture-running");
      failAt("capture");
      return {
        path: "screenshots/campaign-running.png",
        bytes: makeArtifactBytes("screenshots/campaign-running.png")
      };
    },
    async captureFinal() {
      calls.push("capture-final");
      failAt("capture");
      return EXPECTED_ARTIFACT_PATHS.filter(
        (path) => path.endsWith(".png") && !path.endsWith("campaign-running.png")
      ).map((path) => ({ path, bytes: makeArtifactBytes(path) }));
    },
    async buildMarkdown() {
      calls.push("build-markdown");
      failAt("markdown");
      return makeArtifactBytes("security-risk-analysis.md");
    },
    async buildPdf() {
      calls.push("build-pdf");
      failAt("pdf");
      return makeArtifactBytes("security-risk-analysis.pdf");
    },
    buildCampaignJson(model: unknown) {
      calls.push("write-campaign-json");
      return Buffer.from(canonicalJson(model), "utf8");
    },
    buildManifest(model: ReturnType<typeof makeCompletedReportModel>, artifacts: Map<string, Uint8Array>) {
      calls.push("build-manifest");
      failAt("manifest");
      artifactMap = new Map(artifacts);
      return buildTrack1EvidenceManifest(model, artifacts);
    },
    async writeTempFiles(
      _campaignId: string,
      files: ReadonlyMap<string, Uint8Array>
    ) {
      calls.push("write-temp-files");
      return {
        temp_directory: "artifacts/track1/.tmp-fixture",
        files: new Map(files)
      };
    },
    async rereadValidate(
      temp: { temp_directory: string; files: Map<string, Uint8Array> }
    ) {
      calls.push("reread-validate");
      failAt("reread");
      return {
        ...temp,
        files: new Map(temp.files)
      };
    },
    async atomicPublish(campaignId: string) {
      calls.push("atomic-publish");
      const path = `artifacts/track1/${campaignId}`;
      publishedDirectories.push(path);
      return path;
    },
    async registerEvidence(input: Record<string, unknown>) {
      calls.push("register-evidence");
      registrationInputs.push(structuredClone(input));
      failAt("registration");
    },
    now() {
      return UPDATED_AT;
    },
    get artifactMap() {
      return artifactMap;
    }
  };
}

export async function buildFixtureEvidencePack(root: string) {
  const model = makeCompletedReportModel();
  const markdown = Buffer.from(
    await buildTrack1MarkdownReport(model, makeCanonicalFixturePort()),
    "utf8"
  );
  const screenshots = new Map(
    EXPECTED_ARTIFACT_PATHS.filter((path) => path.endsWith(".png")).map(
      (path) => [path, makeArtifactBytes(path)]
    )
  );
  const pdf = await buildTrack1Pdf(
    {
      markdown,
      completed_at: model.campaign.completed_at,
      screenshot_files: screenshots
    },
    makeRecordingPdfBuilderPort()
  );
  const campaignJson = Buffer.from(canonicalJson(model), "utf8");
  const artifacts = new Map<string, Uint8Array>([
    ["security-risk-analysis.md", markdown],
    ["security-risk-analysis.pdf", pdf],
    ["campaign.json", campaignJson],
    ...screenshots
  ]);
  const builtManifest = buildTrack1EvidenceManifest(model, artifacts);
  const files = new Map(artifacts);
  files.set(
    "manifest.json",
    Buffer.from(builtManifest.canonical_json, "utf8")
  );
  for (const [path, bytes] of files) {
    const destination = resolve(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx" });
  }
  const relativePaths = [...files.keys()].sort();
  return {
    relativePaths,
    files,
    manifest: builtManifest.manifest,
    bytes(path: string) {
      const bytes = files.get(path);
      if (!bytes) throw new Error("fixture_artifact_not_found");
      return Uint8Array.from(bytes);
    }
  };
}

export { STARTED_AT, UPDATED_AT };
