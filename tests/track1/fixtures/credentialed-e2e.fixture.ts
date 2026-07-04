import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const CAMPAIGN_ID =
  "campaign:t1:0123456789abcdef0123456789abcdef";
export const MANIFEST_SHA256 = "a".repeat(64);

export const PINNED_IMAGE_DIGESTS: Readonly<Record<string, string>> =
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "deploy/track1/image-digests.lock.json"),
      "utf8"
    )
  ) as Record<string, string>;

export function makeValidTrack1Environment() {
  return {
    OPENCLAW_MODEL_BASE_URL: "https://model.example.invalid/v1",
    OPENCLAW_MODEL_API_KEY: "fixture-api-key-never-returned",
    OPENCLAW_MODEL_ID: "provider/model-safe",
    TRACK1_INGEST_TOKEN: "0123456789abcdef0123456789abcdef"
  };
}

export type CredentialedFailure =
  | "clean"
  | "build"
  | "start"
  | "health"
  | "inspect-plugin"
  | "run-campaign"
  | "build-evidence"
  | "read-acceptance-source"
  | "collect-safe-logs"
  | "stop";

export function makeCredentialedE2EPorts(options?: {
  failAt?: CredentialedFailure;
  campaignIdMismatch?: boolean;
  unsafeLogs?: boolean;
}) {
  const calls: string[] = [];
  const failAt = (stage: CredentialedFailure) => {
    if (options?.failAt === stage) {
      throw new Error(`SECRET_E2E_FAILURE_${stage}`);
    }
  };
  const campaignId = CAMPAIGN_ID;
  const manifestHash = MANIFEST_SHA256;
  return {
    calls,
    campaignId,
    manifestHash,
    async cleanRuntime() {
      calls.push("clean");
      failAt("clean");
    },
    async buildRuntime() {
      calls.push("build");
      failAt("build");
    },
    async startRuntime() {
      calls.push("start");
      failAt("start");
    },
    async waitForHealth() {
      calls.push("health");
      failAt("health");
    },
    async inspectPlugin() {
      calls.push("inspect-plugin");
      failAt("inspect-plugin");
      return {
        openclaw_version: "2026.6.10",
        plugin_status: "loaded",
        hooks: [
          "session_start",
          "llm_input",
          "llm_output",
          "before_tool_call",
          "after_tool_call",
          "session_end"
        ],
        tools: ["send_email", "read_file", "write_file", "call_api"],
        diagnostics: []
      };
    },
    async runCampaign() {
      calls.push("run-campaign");
      failAt("run-campaign");
      return {
        campaign_id: campaignId,
        agent_count: 3,
        case_count: 9,
        retry_count: 1,
        final_actions: {}
      };
    },
    async buildEvidence() {
      calls.push("build-evidence");
      failAt("build-evidence");
      return {
        campaign_id: options?.campaignIdMismatch
          ? "campaign:t1:ffffffffffffffffffffffffffffffff"
          : campaignId,
        artifact_ref:
          "artifact://track1/campaign/0123456789abcdef0123456789abcdef/manifest",
        manifest_sha256: manifestHash
      };
    },
    async readAcceptanceSource() {
      calls.push("read-acceptance-source");
      failAt("read-acceptance-source");
      return { schema_version: "track1-acceptance-source.v1" };
    },
    async collectSafeLogs() {
      calls.push("collect-safe-logs");
      failAt("collect-safe-logs");
      return {
        credential_finding_count: options?.unsafeLogs ? 1 : 0,
        raw_content_finding_count: 0,
        prohibited_event_count: 0
      };
    },
    async stopRuntime() {
      calls.push("stop");
      failAt("stop");
    }
  };
}

function makeAcceptanceMarkdown(): Uint8Array {
  const sections = Array.from(
    { length: 18 },
    (_, index) => `## ${index + 1}. Section ${index + 1}`
  );
  const appendix = makeCompletedReportModel().cases.map(
    (item) => `### ${item.case_id}`
  );
  return Buffer.from(
    [
      "# 赛题一安全风险分析",
      ...sections,
      "中文摘要",
      "English Abstract",
      ...appendix
    ].join("\n").concat("\n"),
    "utf8"
  );
}

export function makeAcceptedRealCampaignSource() {
  const reportSource = makeCompletedCampaignReportSource();
  const model = makeCompletedReportModel();
  const artifacts = new Map<string, Uint8Array>(
    EXPECTED_ARTIFACT_PATHS.map((path) => [path, makeArtifactBytes(path)])
  );
  artifacts.set("security-risk-analysis.md", makeAcceptanceMarkdown());
  artifacts.set(
    "campaign.json",
    Buffer.from(canonicalJson(model), "utf8")
  );
  const built = buildTrack1EvidenceManifest(model, artifacts);
  const artifactFiles = new Map(artifacts);
  artifactFiles.set(
    "manifest.json",
    Buffer.from(built.canonical_json, "utf8")
  );
  const campaignHex = reportSource.campaign.campaign_id.slice(
    "campaign:t1:".length
  );
  return {
    campaign_detail: reportSource.campaign,
    campaign_evidence: {
      schema_version: TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION,
      campaign: reportSource.campaign,
      session_evidence_refs: reportSource.sessions.map(
        (evidence) =>
          `evidence://track1/campaign/${campaignHex}/session/${evidence.session.summary.session_id.slice("session:".length)}`
      ),
      artifact_manifest_ref: `artifact://track1/campaign/${campaignHex}/manifest`
    },
    session_details: reportSource.sessions.map((item) => item.session),
    session_evidence: reportSource.sessions,
    artifact_files: artifactFiles,
    safe_log_summary: {
      credential_finding_count: 0,
      raw_content_finding_count: 0,
      prohibited_event_count: 0
    },
    compose_runtime: {
      openclaw_version: TRACK1_OPENCLAW_VERSION,
      package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
      model_ref: TRACK1_MODEL_REF_CANONICAL,
      plugin_status: "loaded",
      hooks: [
        "session_start",
        "llm_input",
        "llm_output",
        "before_tool_call",
        "after_tool_call",
        "session_end"
      ],
      tools: ["send_email", "read_file", "write_file", "call_api"],
      image_digests: { ...PINNED_IMAGE_DIGESTS },
      screenshot_states: {
        "screenshots/campaign-running.png": "fresh-running",
        "screenshots/campaign-overview.png": "fresh-completed",
        "screenshots/scenario-1-prompt-injection.png": "fresh-completed",
        "screenshots/scenario-2-tool-hijack.png": "fresh-completed",
        "screenshots/scenario-3-memory-poisoning.png": "fresh-completed"
      }
    }
  };
}

export const ACCEPTANCE_MUTATIONS = [
  {
    name: "campaign not completed",
    sentinel: "MUTATION_SECRET_STATUS",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      source.campaign_detail.status = "running";
      return source;
    }
  },
  {
    name: "missing session evidence",
    sentinel: "MUTATION_SECRET_SESSION",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      source.session_evidence.pop();
      return source;
    }
  },
  {
    name: "artifact byte changed",
    sentinel: "MUTATION_SECRET_ARTIFACT",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      source.artifact_files.set(
        "campaign.json",
        Buffer.from('{"tampered":true}\n')
      );
      return source;
    }
  },
  {
    name: "unsafe logs",
    sentinel: "MUTATION_SECRET_LOG",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      source.safe_log_summary.credential_finding_count = 1;
      return source;
    }
  },
  {
    name: "wrong runtime version",
    sentinel: "MUTATION_SECRET_RUNTIME",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      source.compose_runtime.openclaw_version = "2026.6.9" as never;
      return source;
    }
  },
  {
    name: "stale screenshot",
    sentinel: "MUTATION_SECRET_SCREENSHOT",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      source.compose_runtime.screenshot_states[
        "screenshots/campaign-overview.png"
      ] = "stale";
      return source;
    }
  },
  {
    name: "wrong expected tool",
    sentinel: "MUTATION_SECRET_TOOL",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      const evidence = source.session_evidence.find(
        (item) => item.session.summary.case_id === "T1-SC-002-C001"
      )!;
      evidence.session.summary.tool_names = ["read_file"];
      for (const event of evidence.session.events) {
        if (
          event.event_type === "tool_request" ||
          event.event_type === "tool_result"
        ) {
          event.payload.tool_name = "read_file";
        }
      }
      return source;
    }
  },
  {
    name: "wrong image digest",
    sentinel: "MUTATION_SECRET_IMAGE",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      source.compose_runtime.image_digests.openclaw =
        "sha256:" + "f".repeat(64);
      return source;
    }
  },
  {
    name: "real side effect",
    sentinel: "MUTATION_SECRET_SIDE_EFFECT",
    expectedCode: "track1_acceptance_invalid",
    apply(source: ReturnType<typeof makeAcceptedRealCampaignSource>) {
      const toolResult = source.session_evidence[2].session.events.find(
        (event) => event.event_type === "tool_result"
      );
      if (toolResult?.event_type === "tool_result") {
        toolResult.payload.state_change = "outbox_append";
      }
      return source;
    }
  }
] as const;

export const EXPECTED_BASELINE_PATHS = Object.freeze([
  "security-risk-analysis.md",
  "security-risk-analysis.pdf",
  "manifest.json",
  "campaign.json",
  "screenshots/campaign-running.png",
  "screenshots/campaign-overview.png",
  "screenshots/scenario-1-prompt-injection.png",
  "screenshots/scenario-2-tool-hijack.png",
  "screenshots/scenario-3-memory-poisoning.png"
]);

export type BaselineMutation =
  | "extra-file"
  | "missing-file"
  | "symlink"
  | "junction"
  | "alternate-data-stream"
  | "path-traversal"
  | "wrong-magic"
  | "content-sentinel";

export function makeBaselinePromotionPorts(options?: {
  mutation?: BaselineMutation;
  failCopyAt?: number;
  destinationExists?: boolean;
}) {
  const source = makeAcceptedRealCampaignSource();
  const entries = [...source.artifact_files].map(([path, bytes]) => ({
    path,
    kind: "file" as const,
    bytes: Uint8Array.from(bytes)
  }));
  switch (options?.mutation) {
    case "extra-file":
      entries.push({
        path: "extra.txt",
        kind: "file",
        bytes: Buffer.from("x")
      });
      break;
    case "missing-file":
      entries.pop();
      break;
    case "symlink":
    case "junction":
      entries[0].kind = options.mutation as never;
      break;
    case "alternate-data-stream":
      entries[0].path = "campaign.json:secret";
      break;
    case "path-traversal":
      entries[0].path = "../campaign.json";
      break;
    case "wrong-magic":
      entries.find((entry) => entry.path.endsWith(".pdf"))!.bytes =
        Buffer.from("not-pdf");
      source.artifact_files.set(
        "security-risk-analysis.pdf",
        Buffer.from("not-pdf")
      );
      break;
    case "content-sentinel":
      entries.find((entry) => entry.path.endsWith(".md"))!.bytes =
        Buffer.from("runtime_prompt_secret_baseline");
      source.artifact_files.set(
        "security-risk-analysis.md",
        Buffer.from("runtime_prompt_secret_baseline")
      );
      break;
  }
  const copiedPaths: string[] = [];
  const temporaryDirectories: string[] = [];
  const copied = new Map<string, Uint8Array>();
  let destination = options?.destinationExists ?? false;
  return {
    copiedPaths,
    temporaryDirectories,
    destinationExists() {
      return destination;
    },
    async baselineExists() {
      return destination;
    },
    async readSource() {
      return {
        acceptance_source: source,
        entries: entries.map((entry) => ({
          ...entry,
          bytes: Uint8Array.from(entry.bytes)
        }))
      };
    },
    async createTemporaryDirectory() {
      temporaryDirectories.push("baseline.tmp");
      return "baseline.tmp";
    },
    async copyFile(
      _temporary: string,
      path: string,
      bytes: Uint8Array
    ) {
      if (
        options?.failCopyAt !== undefined &&
        copiedPaths.length === options.failCopyAt
      ) {
        throw new Error("copy failed");
      }
      copiedPaths.push(path);
      copied.set(path, Uint8Array.from(bytes));
    },
    async rereadTemporary() {
      return new Map(
        [...copied].map(([path, bytes]) => [path, Uint8Array.from(bytes)])
      );
    },
    async publish() {
      destination = true;
      temporaryDirectories.splice(0);
    },
    async cleanupTemporary() {
      temporaryDirectories.splice(0);
      copied.clear();
    }
  };
}
import {
  TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION
} from "../../../shared/types/campaign-supervision.ts";
import {
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
  TRACK1_OPENCLAW_VERSION
} from "../../../shared/types/campaign-ingest.ts";
import { canonicalJson } from "../../../scripts/track1/report/canonical-json.ts";
import { buildTrack1EvidenceManifest } from "../../../scripts/track1/report/evidence-manifest.ts";
import {
  EXPECTED_ARTIFACT_PATHS,
  makeArtifactBytes,
  makeCompletedCampaignReportSource,
  makeCompletedReportModel
} from "./report-evidence.fixture.ts";
