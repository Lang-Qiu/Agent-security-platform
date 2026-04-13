import { resolve } from "node:path";

import type { SkillsStaticEngineOutput } from "../skills-static/skills-static-engine-output.ts";
import {
  SkillsStaticExecutionError,
  type SkillsStaticProvider,
  toSkillsStaticExecutionError
} from "../skills-static/skills-static-execution-error.ts";
import {
  defaultSkillsStaticRuntimeLogSink,
  type SkillsStaticRuntimeLogSink
} from "../skills-static/skills-static-runtime-log.ts";
import { mapSemgrepOutputToEngineOutput } from "../skills-static/semgrep-output-mapper.ts";
import { runSemgrepScan } from "../skills-static/semgrep-runner.ts";
import type { EngineDispatchTicket } from "../adapters/engine-adapter.ts";
import type { EngineClient, EngineClientDispatchReceipt } from "./engine-client.ts";

const DEFAULT_SEMGREP_RULE_PATH = resolve(import.meta.dirname, "../../../../../engines/skills-static/rules/semgrep-minimal.yml");

function createMockSkillsStaticEngineResult(ticket: EngineDispatchTicket<"static_analysis">): SkillsStaticEngineOutput {
  const language =
    typeof ticket.payload.analysis_parameters?.language === "string" ? ticket.payload.analysis_parameters.language : "typescript";

  return {
    sample_name: ticket.payload.target.display_name ?? ticket.payload.target.target_value,
    language,
    entry_files: ["src/commands.ts", "src/network.ts"],
    files_scanned: 2,
    risk_score: 92,
    engine_private_session_id: "mock-session-001",
    rule_hits: [
      {
        rule_id: "command_execution.shell_exec",
        title: "Shell command reaches an execution sink",
        category: "command_execution",
        severity: "high",
        message: "Potential command execution sink reached",
        file_path: "src/commands.ts",
        line_start: 4,
        line_end: 4,
        code_snippet: "return exec(commandInput);",
        recommendation: "Replace shell execution with an allowlisted wrapper",
        source_type: "user_input",
        sink_type: "command_execution",
        tags: ["command", "input-flow"],
        engine_private_trace_id: "trace-private-001"
      },
      {
        rule_id: "network_access.outbound_fetch",
        title: "Outbound network request lacks destination allowlist",
        category: "network_access",
        severity: "medium",
        message: "Outbound network request lacks destination allowlist",
        file_path: "src/network.ts",
        line_start: 2,
        line_end: 2,
        code_snippet: "return fetch(targetUrl);",
        recommendation: "Restrict outbound destinations to an allowlist",
        source_type: "config",
        sink_type: "network_request",
        tags: ["network", "egress"],
        risk_score: 55
      }
    ],
    sensitive_capabilities: ["command_execution", "network_access"],
    dependency_summary: {
      direct_dependency_count: 2,
      flagged_dependency_count: 1
    }
  };
}

function resolveSkillsStaticProvider(override?: string): SkillsStaticProvider {
  const configuredProvider = override ?? process.env.SKILLS_STATIC_ENGINE_PROVIDER;

  if (configuredProvider === undefined || configuredProvider === "") {
    return "mock";
  }

  if (configuredProvider === "mock" || configuredProvider === "semgrep") {
    return configuredProvider;
  }

  throw new SkillsStaticExecutionError({
    provider: configuredProvider,
    phase: "provider_selection",
    reason: "unsupported_provider",
    detail: configuredProvider
  });
}

function resolveSemgrepTimeoutMs(override?: number): number {
  if (typeof override === "number") {
    return override;
  }

  const configuredTimeout = process.env.SKILLS_STATIC_SEMGREP_TIMEOUT_MS;

  if (configuredTimeout === undefined || configuredTimeout === "") {
    return 15000;
  }

  const parsedTimeout = Number(configuredTimeout);

  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    throw new SkillsStaticExecutionError({
      provider: "semgrep",
      phase: "provider_selection",
      reason: "invalid_provider_config",
      detail: configuredTimeout
    });
  }

  return parsedTimeout;
}

export class SkillsStaticEngineClient implements EngineClient {
  engineType: "skills_static";
  endpoint: string;
  onDispatch?: (ticket: EngineDispatchTicket<"static_analysis">) => void | Promise<void>;
  logEvent: SkillsStaticRuntimeLogSink;
  providerOverride?: string;
  semgrepTimeoutMs?: number;
  runSemgrepScanImpl: typeof runSemgrepScan;
  mapSemgrepOutputToEngineOutputImpl: typeof mapSemgrepOutputToEngineOutput;

  constructor(options?: {
    endpoint?: string;
    onDispatch?: (ticket: EngineDispatchTicket<"static_analysis">) => void | Promise<void>;
    logEvent?: SkillsStaticRuntimeLogSink;
    provider?: string;
    semgrepTimeoutMs?: number;
    runSemgrepScan?: typeof runSemgrepScan;
    mapSemgrepOutputToEngineOutput?: typeof mapSemgrepOutputToEngineOutput;
  }) {
    this.engineType = "skills_static";
    this.endpoint = options?.endpoint ?? "internal://skills-static";
    this.onDispatch = options?.onDispatch;
    this.logEvent = options?.logEvent ?? defaultSkillsStaticRuntimeLogSink;
    this.providerOverride = options?.provider;
    this.semgrepTimeoutMs = options?.semgrepTimeoutMs;
    this.runSemgrepScanImpl = options?.runSemgrepScan ?? runSemgrepScan;
    this.mapSemgrepOutputToEngineOutputImpl = options?.mapSemgrepOutputToEngineOutput ?? mapSemgrepOutputToEngineOutput;
  }

  async dispatch(ticket: EngineDispatchTicket): Promise<EngineClientDispatchReceipt> {
    const staticAnalysisTicket = ticket as EngineDispatchTicket<"static_analysis">;
    const targetRef = staticAnalysisTicket.payload.target.display_name ?? staticAnalysisTicket.payload.target.target_value;

    if (this.onDispatch) {
      await this.onDispatch(staticAnalysisTicket);
    }

    let provider: string | undefined;

    try {
      provider = resolveSkillsStaticProvider(this.providerOverride);

      await this.logEvent({
        event: "provider_selected",
        task_id: staticAnalysisTicket.task_id,
        engine_type: "skills_static",
        provider,
        target_ref: targetRef
      });

      await this.logEvent({
        event: "scan_started",
        task_id: staticAnalysisTicket.task_id,
        engine_type: "skills_static",
        provider,
        target_ref: targetRef
      });

      const mockResult =
        provider === "semgrep"
          ? this.mapSemgrepOutputToEngineOutputImpl(
              await this.runSemgrepScanImpl({
                targetPath: staticAnalysisTicket.payload.target.target_value,
                rulePath: DEFAULT_SEMGREP_RULE_PATH,
                timeoutMs: resolveSemgrepTimeoutMs(this.semgrepTimeoutMs)
              }),
              {
                target: staticAnalysisTicket.payload.target,
                parameters: staticAnalysisTicket.payload.analysis_parameters
              }
            )
          : createMockSkillsStaticEngineResult(staticAnalysisTicket);

      await this.logEvent({
        event: "scan_succeeded",
        task_id: staticAnalysisTicket.task_id,
        engine_type: "skills_static",
        provider,
        target_ref: targetRef
      });

      return {
        accepted: true,
        engine_type: this.engineType,
        endpoint: this.endpoint,
        provider,
        mock_result: mockResult
      };
    } catch (error) {
      const executionError =
        error instanceof SkillsStaticExecutionError
          ? error
          : toSkillsStaticExecutionError(error, {
              provider: provider ?? this.providerOverride ?? process.env.SKILLS_STATIC_ENGINE_PROVIDER ?? "mock",
              phase: "mapper",
              reason: "mapping_failed",
              detail: error instanceof Error ? error.message : String(error)
            });

      await this.logEvent({
        event: "scan_failed",
        task_id: staticAnalysisTicket.task_id,
        engine_type: "skills_static",
        provider: executionError.provider,
        target_ref: targetRef,
        phase: executionError.phase,
        reason: executionError.reason,
        error_summary: executionError.detail ?? executionError.message
      });

      throw executionError;
    }
  }
}
