import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import type { AssetScanResultDetails } from "../../../../shared/types/result.ts";
import type { TaskTarget } from "../../../../shared/types/task.ts";
import type { ProbeObservation } from "./asset-probe.service.ts";

type MatchDisposition = "direct" | "suspected" | "log_only" | "unknown";

interface FingerprintSignalRule {
  signal_id: string;
  signal_type: "port" | "path" | "body";
  match_operator: "equals" | "contains" | "in";
  match_value: string;
  weight: number;
}

interface FingerprintRule {
  fingerprint_id: string;
  target_id: string;
  product_name: string;
  product_version: string;
  signals: FingerprintSignalRule[];
}

interface FingerprintRulesDocument {
  confidence_policy?: {
    direct_output_threshold?: number;
    suspected_threshold?: number;
  };
  fingerprints?: FingerprintRule[];
}

interface FingerprintSample {
  sample_id: string;
  target_id: string;
  request_summary?: string;
  response_status?: number;
  response_headers?: Record<string, unknown>;
  response_body_excerpt?: string;
  source?: string;
  collected_at?: string;
}

interface CandidateMatch {
  target_id: string;
  product_name: string;
  product_version: string;
  confidence: number;
  matched_signal_ids: string[];
}

export interface AssetFingerprintMatchResult {
  disposition: MatchDisposition;
  confidence: number;
  topCandidate?: CandidateMatch;
  details: AssetScanResultDetails;
}

interface SampleContext {
  port?: number;
  path?: string;
  method?: string;
  bodyExcerpt: string;
  responseStatus?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function tryParseUrlPath(value: string): { path?: string; port?: number } {
  try {
    const parsed = new URL(value);
    const parsedPort = parsed.port ? Number(parsed.port) : undefined;

    return {
      path: parsed.pathname || "/",
      port: Number.isFinite(parsedPort) ? parsedPort : undefined
    };
  } catch {
    return {};
  }
}

function normalizeRulesDocument(value: unknown): FingerprintRulesDocument {
  if (!isPlainObject(value)) {
    return {};
  }

  const normalizedDocument: FingerprintRulesDocument = {};

  if (isPlainObject(value.confidence_policy)) {
    normalizedDocument.confidence_policy = {};

    if (isNumber(value.confidence_policy.direct_output_threshold)) {
      normalizedDocument.confidence_policy.direct_output_threshold = value.confidence_policy.direct_output_threshold;
    }

    if (isNumber(value.confidence_policy.suspected_threshold)) {
      normalizedDocument.confidence_policy.suspected_threshold = value.confidence_policy.suspected_threshold;
    }
  }

  if (Array.isArray(value.fingerprints)) {
    const normalizedFingerprints: FingerprintRule[] = value.fingerprints
      .filter((fingerprint): fingerprint is Record<string, unknown> => isPlainObject(fingerprint))
      .map((fingerprint): FingerprintRule => {
        const signals: FingerprintSignalRule[] = Array.isArray(fingerprint.signals)
          ? fingerprint.signals
              .filter((signal): signal is Record<string, unknown> => isPlainObject(signal))
              .map((signal): FingerprintSignalRule => {
                const signalType: FingerprintSignalRule["signal_type"] =
                  signal.signal_type === "port" || signal.signal_type === "path" || signal.signal_type === "body"
                    ? signal.signal_type
                    : "body";

                const matchOperator: FingerprintSignalRule["match_operator"] =
                  signal.match_operator === "equals" || signal.match_operator === "contains" || signal.match_operator === "in"
                    ? signal.match_operator
                    : "contains";

                return {
                  signal_id: isString(signal.signal_id) ? signal.signal_id : "",
                  signal_type: signalType,
                  match_operator: matchOperator,
                  match_value: isString(signal.match_value) ? signal.match_value : "",
                  weight: isNumber(signal.weight) ? signal.weight : 0
                };
              })
              .filter((signal) => signal.signal_id.length > 0 && signal.match_value.length > 0)
          : [];

        return {
          fingerprint_id: isString(fingerprint.fingerprint_id) ? fingerprint.fingerprint_id : "",
          target_id: isString(fingerprint.target_id) ? fingerprint.target_id : "",
          product_name: isString(fingerprint.product_name) ? fingerprint.product_name : "",
          product_version: isString(fingerprint.product_version) ? fingerprint.product_version : "unknown",
          signals
        };
      })
      .filter((fingerprint) => fingerprint.target_id.length > 0 && fingerprint.product_name.length > 0 && fingerprint.signals.length > 0);

    normalizedDocument.fingerprints = normalizedFingerprints;
  }

  return normalizedDocument;
}

function normalizeSample(value: unknown): FingerprintSample {
  if (!isPlainObject(value)) {
    throw new Error("Invalid fingerprint sample payload");
  }

  return {
    sample_id: isString(value.sample_id) ? value.sample_id : "unknown",
    target_id: isString(value.target_id) ? value.target_id : "unknown",
    request_summary: isString(value.request_summary) ? value.request_summary : undefined,
    response_status: isNumber(value.response_status) ? value.response_status : undefined,
    response_headers: isPlainObject(value.response_headers) ? value.response_headers : undefined,
    response_body_excerpt: isString(value.response_body_excerpt) ? value.response_body_excerpt : undefined,
    source: isString(value.source) ? value.source : undefined,
    collected_at: isString(value.collected_at) ? value.collected_at : undefined
  };
}

export class EngineAssetFingerprintService {
  workspaceRoot: string;
  rulesFilePath: string;
  cachedRulesDocument?: FingerprintRulesDocument;

  constructor(options?: { workspaceRoot?: string; rulesFilePath?: string }) {
    const currentFileDir = dirname(fileURLToPath(import.meta.url));
    this.workspaceRoot = options?.workspaceRoot ?? resolve(currentFileDir, "../../../..");
    this.rulesFilePath = options?.rulesFilePath ?? resolve(this.workspaceRoot, "engines/asset-scan/rules/fingerprints.v1.yaml");
  }

  evaluateSampleFromFile(samplePath: string): AssetFingerprintMatchResult {
    const sample = this.readSample(samplePath);

    return this.evaluateSample(sample);
  }

  createInitialDetailsFromSampleRef(sampleRef: string, target?: TaskTarget): AssetScanResultDetails {
    const result = this.evaluateSampleFromFile(this.resolveWorkspacePath(sampleRef));

    return {
      target,
      fingerprint: result.details.fingerprint,
      confidence: result.details.confidence,
      matched_features: result.details.matched_features,
      open_ports: result.details.open_ports,
      http_endpoints: result.details.http_endpoints,
      auth_detected: result.details.auth_detected,
      findings: []
    };
  }

  createInitialDetailsFromObservation(observation: ProbeObservation, target?: TaskTarget): AssetScanResultDetails {
    const evaluated = this.evaluateSample({
      sample_id: `live-${observation.targetId}-${Date.now()}`,
      target_id: observation.targetId,
      request_summary: observation.requestSummary,
      response_status: observation.responseStatus,
      response_headers: observation.responseHeaders,
      response_body_excerpt: observation.responseBodyExcerpt,
      source: observation.source,
      collected_at: observation.collectedAt
    });

    return {
      target,
      fingerprint: evaluated.details.fingerprint,
      confidence: evaluated.details.confidence,
      matched_features: evaluated.details.matched_features,
      open_ports: evaluated.details.open_ports,
      http_endpoints: evaluated.details.http_endpoints,
      auth_detected: evaluated.details.auth_detected,
      findings: []
    };
  }

  readSample(samplePath: string): FingerprintSample {
    const content = readFileSync(samplePath, "utf8");

    return normalizeSample(JSON.parse(content) as unknown);
  }

  evaluateSample(sample: FingerprintSample): AssetFingerprintMatchResult {
    const rulesDocument = this.getRulesDocument();
    const directThreshold = rulesDocument.confidence_policy?.direct_output_threshold ?? 0.8;
    const suspectedThreshold = rulesDocument.confidence_policy?.suspected_threshold ?? 0.7;
    const sampleContext = this.buildSampleContext(sample);

    const candidates = (rulesDocument.fingerprints ?? [])
      .map((fingerprint) => this.evaluateRule(fingerprint, sampleContext))
      .filter((candidate): candidate is CandidateMatch => candidate !== null)
      .sort((left, right) => right.confidence - left.confidence);

    const topCandidate = candidates[0];

    if (!topCandidate) {
      return {
        disposition: "unknown",
        confidence: 0,
        details: {
          confidence: 0,
          auth_detected: false,
          findings: []
        }
      };
    }

    let disposition: MatchDisposition = "log_only";

    if (topCandidate.confidence >= directThreshold) {
      disposition = "direct";
    } else if (topCandidate.confidence >= suspectedThreshold) {
      disposition = "suspected";
    }

    const details: AssetScanResultDetails = {
      confidence: topCandidate.confidence,
      matched_features: [...topCandidate.matched_signal_ids],
      auth_detected: false,
      findings: []
    };

    if (sampleContext.port !== undefined) {
      details.open_ports = [{ port: sampleContext.port }];
    }

    if (sampleContext.path) {
      details.http_endpoints = [
        {
          path: sampleContext.path,
          status_code: sampleContext.responseStatus ?? 0,
          method: sampleContext.method ?? "GET"
        }
      ];
    }

    if (disposition === "direct" || disposition === "suspected") {
      details.fingerprint = {
        agent_name: topCandidate.product_name,
        framework: topCandidate.target_id,
        version: topCandidate.product_version
      };
    }

    return {
      disposition,
      confidence: topCandidate.confidence,
      topCandidate,
      details
    };
  }

  evaluateRule(rule: FingerprintRule, sampleContext: SampleContext): CandidateMatch | null {
    const matchedSignals: string[] = [];
    let score = 0;

    for (const signal of rule.signals) {
      if (this.matchesSignal(signal, sampleContext)) {
        matchedSignals.push(signal.signal_id);
        score += signal.weight;
      }
    }

    const confidence = clampConfidence(score);

    if (confidence <= 0) {
      return null;
    }

    return {
      target_id: rule.target_id,
      product_name: rule.product_name,
      product_version: rule.product_version,
      confidence,
      matched_signal_ids: matchedSignals
    };
  }

  matchesSignal(signal: FingerprintSignalRule, sampleContext: SampleContext): boolean {
    if (signal.signal_type === "port") {
      if (sampleContext.port === undefined) {
        return false;
      }

      return this.matchScalar(String(sampleContext.port), signal.match_operator, signal.match_value);
    }

    if (signal.signal_type === "path") {
      if (!sampleContext.path) {
        return false;
      }

      return this.matchScalar(sampleContext.path, signal.match_operator, signal.match_value);
    }

    return this.matchScalar(sampleContext.bodyExcerpt, signal.match_operator, signal.match_value);
  }

  matchScalar(actualValue: string, operator: FingerprintSignalRule["match_operator"], expectedValue: string): boolean {
    if (operator === "equals") {
      return actualValue === expectedValue;
    }

    if (operator === "contains") {
      return actualValue.includes(expectedValue);
    }

    const acceptedValues = expectedValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return acceptedValues.includes(actualValue);
  }

  buildSampleContext(sample: FingerprintSample): SampleContext {
    const requestLineMatch = sample.request_summary?.match(/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s+(\S+)/i);
    let path = requestLineMatch?.[2];
    let method = requestLineMatch?.[1]?.toUpperCase();
    let port: number | undefined;

    if (path && path.startsWith("http")) {
      const parsedUrl = tryParseUrlPath(path);
      path = parsedUrl.path;
      port = parsedUrl.port;
    }

    if (sample.source) {
      const sourceMatch = sample.source.match(/((?:https?|wss?):\/\/\S+)/i);

      if (sourceMatch?.[1]) {
        const parsedUrl = tryParseUrlPath(sourceMatch[1]);

        if (!path && parsedUrl.path) {
          path = parsedUrl.path;
        }

        if (port === undefined && parsedUrl.port !== undefined) {
          port = parsedUrl.port;
        }
      }
    }

    if (!path && sample.response_headers && isString(sample.response_headers.upgrade) && sample.response_headers.upgrade.toLowerCase() === "websocket") {
      path = "/";
      method = method ?? "GET";
    }

    return {
      port,
      path,
      method,
      bodyExcerpt: sample.response_body_excerpt ?? "",
      responseStatus: sample.response_status
    };
  }

  getRulesDocument(): FingerprintRulesDocument {
    if (!this.cachedRulesDocument) {
      const rulesContent = readFileSync(this.rulesFilePath, "utf8");
      this.cachedRulesDocument = normalizeRulesDocument(parse(rulesContent) as unknown);
    }

    return this.cachedRulesDocument;
  }

  resolveWorkspacePath(filePath: string): string {
    if (isAbsolute(filePath)) {
      return filePath;
    }

    return resolve(this.workspaceRoot, filePath);
  }
}
