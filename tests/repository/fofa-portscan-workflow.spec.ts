import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../../scripts/dev/intel/fofa-portscan-workflow.ts");

type CommandRunner = {
  run: (command: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
};

type WorkflowTarget = {
  source_query: string;
  source_ip: string;
  source_port: number;
  protocol: string;
  target_value: string;
  probe_target_id: string;
  task_id: string;
  requested_by: string;
};

type WorkflowOutput = {
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

type HttpProbeResult = {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
};

type PortscanWorkflowModule = {
  runFofaPortscanWorkflow?: (options: {
    targets: WorkflowTarget[];
    outputDir: string;
    runner: CommandRunner;
    naabuTimeoutMs?: number;
    nmapTimeoutMs?: number;
    enableHttpProbeFallback?: boolean;
    httpProbe?: (url: string, timeoutMs: number) => Promise<HttpProbeResult>;
  }) => Promise<WorkflowOutput>;
};

test("REQ-ASSET-SCAN-PORT-007 workflow enforces naabu-first and nmap-on-hit-only behavior", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as PortscanWorkflowModule;
  assert.equal(typeof module.runFofaPortscanWorkflow, "function", "runFofaPortscanWorkflow should be exported");

  if (!module.runFofaPortscanWorkflow) {
    return;
  }

  const calls: Array<{ command: string; args: string[] }> = [];

  const runner: CommandRunner = {
    async run(command, args) {
      calls.push({ command, args });

      if (command.includes("naabu")) {
        const hostArg = args[1];
        if (hostArg === "198.51.100.10") {
          return { stdout: "198.51.100.10:11434\n", stderr: "", exitCode: 0 };
        }

        return { stdout: "", stderr: "", exitCode: 0 };
      }

      if (command.includes("nmap")) {
        return {
          stdout: [
            "PORT      STATE SERVICE",
            "11434/tcp open  unknown",
            "| http-title: Ollama is running",
            "| http-enum:",
            "|   /api/tags: lists local models",
            "|_  /health: ok"
          ].join("\n"),
          stderr: "",
          exitCode: 0
        };
      }

      return { stdout: "", stderr: `unsupported command: ${command}`, exitCode: 1 };
    }
  };

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-portscan-workflow-"));

  const result = await module.runFofaPortscanWorkflow({
    targets: [
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.10",
        source_port: 11434,
        protocol: "http",
        target_value: "http://198.51.100.10:11434",
        probe_target_id: "ollama_api_tags",
        task_id: "task_1",
        requested_by: "fofa-dev-script"
      },
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.20",
        source_port: 11434,
        protocol: "http",
        target_value: "http://198.51.100.20:11434",
        probe_target_id: "ollama_api_tags",
        task_id: "task_2",
        requested_by: "fofa-dev-script"
      }
    ],
    outputDir: tmpDir,
    runner
  });

  const naabuCalls = calls.filter((call) => call.command.includes("naabu"));
  const nmapCalls = calls.filter((call) => call.command.includes("nmap"));

  assert.equal(naabuCalls.length, 2, "naabu should run for each target");
  assert.equal(nmapCalls.length, 1, "nmap should run only for targets hit by naabu");
  assert.equal(result.summary.total_targets, 2);
  assert.equal(result.summary.naabu_success_targets, 2);
  assert.equal(result.summary.nmap_attempted_targets, 1);
});

test("REQ-ASSET-SCAN-PORT-007 workflow emits candidate, verified and raw evidence JSON with auditable failures", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as PortscanWorkflowModule;
  assert.equal(typeof module.runFofaPortscanWorkflow, "function", "runFofaPortscanWorkflow should be exported");

  if (!module.runFofaPortscanWorkflow) {
    return;
  }

  const runner: CommandRunner = {
    async run(command) {
      if (command.includes("naabu")) {
        return { stdout: "198.51.100.10:11434\n", stderr: "", exitCode: 0 };
      }

      if (command.includes("nmap")) {
        return { stdout: "nmap timeout", stderr: "killed by timeout", exitCode: 124 };
      }

      return { stdout: "", stderr: `unsupported command: ${command}`, exitCode: 1 };
    }
  };

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-portscan-workflow-"));

  const result = await module.runFofaPortscanWorkflow({
    targets: [
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.10",
        source_port: 11434,
        protocol: "http",
        target_value: "http://198.51.100.10:11434",
        probe_target_id: "ollama_api_tags",
        task_id: "task_timeout",
        requested_by: "fofa-dev-script"
      }
    ],
    outputDir: tmpDir,
    runner
  });

  assert.equal(result.summary.total_targets, 1);
  assert.equal(result.summary.candidate_count >= 1, true, "candidate should still be recorded");
  assert.equal(result.summary.verified_count, 0, "nmap timeout must not produce verified sample");
  assert.equal(result.summary.failed_count, 1, "tool timeout should be auditable as failure");
});

test("REQ-ASSET-SCAN-PORT-007 workflow falls back when naabu runner init fails due ipinfo lookup", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as PortscanWorkflowModule;
  assert.equal(typeof module.runFofaPortscanWorkflow, "function", "runFofaPortscanWorkflow should be exported");

  if (!module.runFofaPortscanWorkflow) {
    return;
  }

  const calls: Array<{ command: string; args: string[] }> = [];

  const runner: CommandRunner = {
    async run(command, args) {
      calls.push({ command, args });

      if (command.includes("naabu")) {
        return {
          stdout: "",
          stderr: '[FTL] Could not create runner: Get "https://ipinfo.io/AS12222": read: connection reset by peer',
          exitCode: 1
        };
      }

      if (command.includes("nmap")) {
        if (args.includes("--open")) {
          return {
            stdout: "11434/tcp open  unknown",
            stderr: "",
            exitCode: 0
          };
        }

        return {
          stdout: [
            "PORT      STATE SERVICE",
            "11434/tcp open  unknown",
            "| http-title: Ollama is running",
            "| http-enum:",
            "|   /api/tags: lists local models"
          ].join("\n"),
          stderr: "",
          exitCode: 0
        };
      }

      return { stdout: "", stderr: `unsupported command: ${command}`, exitCode: 1 };
    }
  };

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-portscan-workflow-"));

  const result = await module.runFofaPortscanWorkflow({
    targets: [
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.30",
        source_port: 11434,
        protocol: "http",
        target_value: "http://198.51.100.30:11434",
        probe_target_id: "ollama_api_tags",
        task_id: "task_ipinfo_fallback",
        requested_by: "fofa-dev-script"
      }
    ],
    outputDir: tmpDir,
    runner
  });

  const nmapCalls = calls.filter((call) => call.command.includes("nmap"));
  assert.equal(nmapCalls.length, 2, "nmap should run for fallback open-check and full evidence collection");
  assert.equal(result.summary.nmap_attempted_targets, 1);
  assert.equal(result.summary.verified_count, 1);
});

test("REQ-ASSET-SCAN-PORT-007 workflow verifies via /api/tags fallback when nmap evidence times out", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as PortscanWorkflowModule;
  assert.equal(typeof module.runFofaPortscanWorkflow, "function", "runFofaPortscanWorkflow should be exported");

  if (!module.runFofaPortscanWorkflow) {
    return;
  }

  const runner: CommandRunner = {
    async run(command) {
      if (command.includes("naabu")) {
        return {
          stdout: "",
          stderr: '[FTL] Could not create runner: Get "https://ipinfo.io/AS12222": read: connection reset by peer',
          exitCode: 1
        };
      }

      if (command.includes("nmap")) {
        if (arguments[1]?.includes("--open")) {
          return {
            stdout: "11434/tcp open  unknown",
            stderr: "",
            exitCode: 0
          };
        }

        return {
          stdout: "Starting Nmap 7.94SVN",
          stderr: "",
          exitCode: 124
        };
      }

      return { stdout: "", stderr: `unsupported command: ${command}`, exitCode: 1 };
    }
  };

  const httpProbeCalls: string[] = [];

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-portscan-workflow-"));

  const result = await module.runFofaPortscanWorkflow({
    targets: [
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.30",
        source_port: 11434,
        protocol: "http",
        target_value: "http://198.51.100.30:11434",
        probe_target_id: "ollama_api_tags",
        task_id: "task_http_probe_fallback",
        requested_by: "fofa-dev-script"
      }
    ],
    outputDir: tmpDir,
    runner,
    enableHttpProbeFallback: true,
    httpProbe: async (url) => {
      httpProbeCalls.push(url);
      return {
        ok: true,
        status: 200,
        body: '{"models":[{"name":"llama3.2:3b"}]}'
      };
    }
  });

  assert.equal(httpProbeCalls.length, 1, "http probe fallback should be triggered once");
  assert.equal(httpProbeCalls[0], "http://198.51.100.30:11434/api/tags");
  assert.equal(result.summary.verified_count, 1);
  assert.equal(result.summary.failed_count, 0);
});

test("REQ-ASSET-SCAN-PORT-007 workflow skips repeated naabu runs after ipinfo runner init failure is detected", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as PortscanWorkflowModule;
  assert.equal(typeof module.runFofaPortscanWorkflow, "function", "runFofaPortscanWorkflow should be exported");

  if (!module.runFofaPortscanWorkflow) {
    return;
  }

  let naabuCalls = 0;
  let nmapOpenCheckCalls = 0;

  const runner: CommandRunner = {
    async run(command, args) {
      if (command.includes("naabu")) {
        naabuCalls += 1;
        return {
          stdout: "",
          stderr: '[FTL] Could not create runner: Get "https://ipinfo.io/AS12222": read: connection reset by peer',
          exitCode: 1
        };
      }

      if (command.includes("nmap")) {
        if (args.includes("--open")) {
          nmapOpenCheckCalls += 1;
          return {
            stdout: "11434/tcp open  unknown",
            stderr: "",
            exitCode: 0
          };
        }

        return {
          stdout: "Starting Nmap 7.94SVN",
          stderr: "",
          exitCode: 124
        };
      }

      return { stdout: "", stderr: `unsupported command: ${command}`, exitCode: 1 };
    }
  };

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-portscan-workflow-"));

  await module.runFofaPortscanWorkflow({
    targets: [
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.30",
        source_port: 11434,
        protocol: "http",
        target_value: "http://198.51.100.30:11434",
        probe_target_id: "ollama_api_tags",
        task_id: "task_ipinfo_skip_1",
        requested_by: "fofa-dev-script"
      },
      {
        source_query: 'app="Ollama"',
        source_ip: "198.51.100.31",
        source_port: 11434,
        protocol: "http",
        target_value: "http://198.51.100.31:11434",
        probe_target_id: "ollama_api_tags",
        task_id: "task_ipinfo_skip_2",
        requested_by: "fofa-dev-script"
      }
    ],
    outputDir: tmpDir,
    runner,
    enableHttpProbeFallback: false
  });

  assert.equal(naabuCalls, 1, "naabu should be skipped after ipinfo init failure is detected");
  assert.equal(nmapOpenCheckCalls, 2, "nmap open-check should still run for each target when naabu is skipped");
});
