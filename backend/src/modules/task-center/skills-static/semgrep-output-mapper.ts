import type { Task } from "../../../../../shared/types/task.ts";
import { isNumber, isPlainObject, isString, isStringArray } from "../../../../../shared/utils/guards.ts";
import type { SkillsStaticEngineOutput } from "./skills-static-engine-output.ts";

interface SemgrepMetadata {
  title?: string;
  category?: string;
  platform_severity?: string;
  recommendation?: string;
  source_type?: string;
  sink_type?: string;
  tags?: string[];
}

function normalizeSemgrepRuleId(value: unknown): string {
  if (!isString(value)) {
    return "semgrep.unknown_rule";
  }

  const normalizedSegments = value
    .split(".")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replaceAll("-", "_"));

  if (normalizedSegments.length >= 2) {
    return `${normalizedSegments[normalizedSegments.length - 2]}.${normalizedSegments[normalizedSegments.length - 1]}`;
  }

  return normalizedSegments[0] ?? "semgrep.unknown_rule";
}

function normalizeFilePath(value: unknown): string | undefined {
  if (!isString(value)) {
    return undefined;
  }

  return value.replaceAll("\\", "/");
}

function normalizeScannedPaths(rawOutput: unknown): string[] {
  if (!isPlainObject(rawOutput) || !isPlainObject(rawOutput.paths) || !isStringArray(rawOutput.paths.scanned)) {
    return [];
  }

  return rawOutput.paths.scanned
    .map((scannedPath) => normalizeFilePath(scannedPath))
    .filter((scannedPath): scannedPath is string => typeof scannedPath === "string");
}

function normalizeSemgrepMetadata(value: unknown): SemgrepMetadata {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    title: isString(value.title) ? value.title : undefined,
    category: isString(value.category) ? value.category : undefined,
    platform_severity: isString(value.platform_severity) ? value.platform_severity : undefined,
    recommendation: isString(value.recommendation) ? value.recommendation : undefined,
    source_type: isString(value.source_type) ? value.source_type : undefined,
    sink_type: isString(value.sink_type) ? value.sink_type : undefined,
    tags: isStringArray(value.tags) ? [...value.tags] : undefined
  };
}

export function mapSemgrepOutputToEngineOutput(
  rawOutput: unknown,
  task: Pick<Task, "target" | "parameters">
): SkillsStaticEngineOutput {
  const sampleName = task.target.display_name ?? task.target.target_value;
  const language = typeof task.parameters?.language === "string" ? task.parameters.language : "unknown";
  const scannedPaths = normalizeScannedPaths(rawOutput);
  const rawResults =
    isPlainObject(rawOutput) && Array.isArray(rawOutput.results) ? rawOutput.results : [];

  const ruleHits = rawResults
    .filter((result): result is Record<string, unknown> => isPlainObject(result))
    .map((result) => {
      const extra = isPlainObject(result.extra) ? result.extra : {};
      const metadata = normalizeSemgrepMetadata(extra.metadata);
      const filePath = normalizeFilePath(result.path);
      const ruleId = normalizeSemgrepRuleId(result.check_id);

      return {
        rule_id: ruleId,
        title: metadata.title ?? ruleId,
        category: metadata.category,
        severity: metadata.platform_severity,
        message: isString(extra.message) ? extra.message : undefined,
        file_path: filePath,
        line_start: isPlainObject(result.start) && isNumber(result.start.line) ? result.start.line : undefined,
        line_end: isPlainObject(result.end) && isNumber(result.end.line) ? result.end.line : undefined,
        code_snippet: isString(extra.lines) ? extra.lines : undefined,
        recommendation: metadata.recommendation,
        source_type: metadata.source_type,
        sink_type: metadata.sink_type,
        tags: metadata.tags
      };
    });

  const entryFiles = Array.from(
    new Set(
      ruleHits
        .map((ruleHit) => ruleHit.file_path)
        .filter((filePath): filePath is string => typeof filePath === "string" && filePath.length > 0)
    )
  );
  const fallbackEntryFiles =
    entryFiles.length > 0 ? entryFiles : scannedPaths.length > 0 ? scannedPaths : [task.target.target_value.replaceAll("\\", "/")];
  const sensitiveCapabilities = Array.from(
    new Set(
      ruleHits
        .map((ruleHit) => ruleHit.category)
        .filter((category): category is string => typeof category === "string" && category.length > 0)
    )
  );

  return {
    sample_name: sampleName,
    language,
    entry_files: fallbackEntryFiles,
    files_scanned: scannedPaths.length > 0 ? scannedPaths.length : fallbackEntryFiles.length,
    rule_hits: ruleHits,
    sensitive_capabilities: sensitiveCapabilities,
    dependency_summary: {
      source: "semgrep",
      manifests_scanned: 0
    }
  };
}
