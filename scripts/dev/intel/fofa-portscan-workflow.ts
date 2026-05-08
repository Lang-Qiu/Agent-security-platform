import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { exportFofaSamples } from "./fofa-sample-export.ts";

export type PortscanWorkflowTarget = {
  source_query: string;
  source_ip: string;
  source_port: number;
  protocol: string;
  target_value: string;
  probe_target_id: string;
  task_id: string;
  requested_by: string;
};

export type PortscanCommandRunner = {
  run: (command: string, args: string[], timeoutMs?: number) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
};

export type FofaPortscanWorkflowOutput = {
  summary: {
    total_targets: number;
    naabu_success_targets: number;
    nmap_attempted_targets: number;
    verified_count: number;
    candidate_count: number;
    failed_count: number;
  };
  outputPath: string;
};

function parseNaabuPorts(stdout: string): number[] {
  const ports: number[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/:(\d+)$/);
    if (match) {
      ports.push(Number(match[1]));
    }
  }

  return [...new Set(ports)].sort((a, b) => a - b);
}

function detectOllamaFingerprint(output: string): boolean {
  const lower = output.toLowerCase();
  return lower.includes("/api/tags") || lower.includes("ollama");
}

export async function runFofaPortscanWorkflow(options: {
  targets: PortscanWorkflowTarget[];
  outputDir: string;
  runner: PortscanCommandRunner;
  naabuTimeoutMs?: number;
  nmapTimeoutMs?: number;
}): Promise<FofaPortscanWorkflowOutput> {
  const exposureCandidates: Array<Record<string, unknown>> = [];
  const verifiedFingerprints: Array<Record<string, unknown>> = [];
  const rawEvidence: Array<Record<string, unknown>> = [];

  let naabuSuccessTargets = 0;
  let nmapAttemptedTargets = 0;
  let failedCount = 0;

  for (const target of options.targets) {
    const now = new Date().toISOString();
    exposureCandidates.push({
      source_query: target.source_query,
      source_ip: target.source_ip,
      source_port: target.source_port,
      protocol: target.protocol,
      target_value: target.target_value,
      probe_target_id: target.probe_target_id,
      task_id: target.task_id,
      status: "candidate",
      first_seen_at: now,
      last_seen_at: now,
      requested_by: target.requested_by
    });

    const naabuExecution = await options.runner.run(
      "naabu",
      ["-host", target.source_ip, "-silent"],
      options.naabuTimeoutMs ?? 12_000
    );

    if (naabuExecution.exitCode === 0) {
      naabuSuccessTargets += 1;
    }

    const naabuPorts = parseNaabuPorts(naabuExecution.stdout);
    const isPortOpen = naabuPorts.includes(target.source_port);

    if (!isPortOpen) {
      rawEvidence.push({
        task_id: target.task_id,
        source_ip: target.source_ip,
        source_port: target.source_port,
        naabu_output: naabuExecution.stdout || naabuExecution.stderr,
        nmap_output: "",
        probe_response_excerpt: "",
        tool_exit_codes: {
          naabu: naabuExecution.exitCode
        }
      });
      continue;
    }

    nmapAttemptedTargets += 1;

    const nmapExecution = await options.runner.run(
      "nmap",
      [
        "-Pn",
        "-sV",
        "--script",
        "http-title,ssl-cert,http-enum",
        "-p",
        String(target.source_port),
        target.source_ip
      ],
      options.nmapTimeoutMs ?? 15_000
    );

    const nmapOutput = nmapExecution.stdout || nmapExecution.stderr;

    rawEvidence.push({
      task_id: target.task_id,
      source_ip: target.source_ip,
      source_port: target.source_port,
      naabu_output: naabuExecution.stdout || naabuExecution.stderr,
      nmap_output: nmapOutput,
      probe_response_excerpt: "",
      tool_exit_codes: {
        naabu: naabuExecution.exitCode,
        nmap: nmapExecution.exitCode
      }
    });

    if (nmapExecution.exitCode !== 0) {
      failedCount += 1;
      continue;
    }

    if (!detectOllamaFingerprint(nmapOutput)) {
      continue;
    }

    verifiedFingerprints.push({
      sample_id: `${target.probe_target_id}.${target.task_id}`,
      target_id: `${target.source_ip}:${target.source_port}`,
      request_summary: `${target.protocol} ${target.target_value}`,
      response_status: 200,
      response_headers: {},
      response_body_excerpt: nmapOutput.slice(0, 512),
      source: "fofa_scan",
      collected_at: new Date().toISOString()
    });
  }

  const outputDir = resolve(options.outputDir);
  await exportFofaSamples({
    outputDir,
    exposureCandidates,
    verifiedFingerprints,
    rawEvidence
  });

  const summary = {
    total_targets: options.targets.length,
    naabu_success_targets: naabuSuccessTargets,
    nmap_attempted_targets: nmapAttemptedTargets,
    verified_count: verifiedFingerprints.length,
    candidate_count: exposureCandidates.length,
    failed_count: failedCount
  };

  const outputPath = resolve(outputDir, "workflow-summary.json");
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        summary
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    summary,
    outputPath
  };
}
