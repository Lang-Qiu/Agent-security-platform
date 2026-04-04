import type { SkillsStaticEngineOutput } from "../skills-static/skills-static-engine-output.ts";
import type { EngineDispatchTicket } from "../adapters/engine-adapter.ts";
import type { EngineClient, EngineClientDispatchReceipt } from "./engine-client.ts";

function createMockSkillsStaticEngineResult(ticket: EngineDispatchTicket<"static_analysis">): SkillsStaticEngineOutput {
  const language =
    typeof ticket.payload.analysis_parameters?.language === "string" ? ticket.payload.analysis_parameters.language : "typescript";

  return {
    sample_name: ticket.payload.target.display_name ?? ticket.payload.target.target_value,
    language,
    entry_files: ["src/index.ts", "src/report.ts"],
    files_scanned: 2,
    risk_score: 92,
    engine_private_session_id: "mock-session-001",
    rule_hits: [
      {
        rule_id: "SK001",
        title: "Dangerous command execution",
        category: "command_execution",
        severity: "high",
        message: "Detected child_process.exec with untrusted input",
        file_path: "src/index.ts",
        line_start: 12,
        line_end: 14,
        code_snippet: "exec(userInput)",
        recommendation: "Replace shell execution with a safe allowlist wrapper",
        source_type: "user_input",
        sink_type: "command_execution",
        tags: ["command", "unsafe-input"],
        engine_private_trace_id: "trace-private-001"
      },
      {
        rule_id: "SK002",
        title: "Network egress without allowlist",
        category: "network_access",
        severity: "medium",
        message: "Detected outbound fetch to an unapproved endpoint",
        file_path: "src/report.ts",
        line_start: 8,
        line_end: 9,
        code_snippet: "fetch(reportUrl)",
        recommendation: "Restrict outbound destinations with an allowlist",
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

export class SkillsStaticEngineClient implements EngineClient {
  engineType: "skills_static";
  endpoint: string;
  onDispatch?: (ticket: EngineDispatchTicket<"static_analysis">) => void | Promise<void>;

  constructor(options?: {
    endpoint?: string;
    onDispatch?: (ticket: EngineDispatchTicket<"static_analysis">) => void | Promise<void>;
  }) {
    this.engineType = "skills_static";
    this.endpoint = options?.endpoint ?? "internal://skills-static";
    this.onDispatch = options?.onDispatch;
  }

  async dispatch(ticket: EngineDispatchTicket): Promise<EngineClientDispatchReceipt> {
    const staticAnalysisTicket = ticket as EngineDispatchTicket<"static_analysis">;

    if (this.onDispatch) {
      await this.onDispatch(staticAnalysisTicket);
    }

    return {
      accepted: true,
      engine_type: this.engineType,
      endpoint: this.endpoint,
      mock_result: createMockSkillsStaticEngineResult(staticAnalysisTicket)
    };
  }
}
