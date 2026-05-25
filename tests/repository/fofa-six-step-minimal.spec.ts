// 本测试文件主要验证基于 FOFA CSV 的资产测绘六步最小流程（发现、收敛、端口验活、深度指纹、匹配、风险研判）输出。
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../../scripts/dev/intel/fofa-six-step-minimal.ts");
const csvPath = resolve(import.meta.dirname, "../fixtures/fofa/ollama_test.csv");

type CommandRunner = {
  run: (command: string, args: string[], timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
};

type SixStepModule = {
  runFofaSixStepMinimal?: (options: {
    csvPath: string;
    outputPath?: string;
    maxTargets?: number;
    naabuTimeoutMs?: number;
    nmapTimeoutMs?: number;
    runner?: CommandRunner;
  }) => Promise<{
    summary: {
      step1_discovered_targets: number;
      step1_converged_targets: number;
      step2_live_targets: number;
      step3_fingerprinted_targets: number;
      step4_matched_assets: number;
      step6_high_risk_assets: number;
    };
    outputPath: string | null;
  }>;
};

test("fofa six-step minimal pipeline produces normalized fingerprint and risk output", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as SixStepModule;
  assert.equal(typeof module.runFofaSixStepMinimal, "function", "runFofaSixStepMinimal should be exported");

  if (!module.runFofaSixStepMinimal) {
    return;
  }

  let naabuCalled = 0;
  let nmapCalled = 0;

  const runner: CommandRunner = {
    async run(command, args) {
      if (command.includes("naabu")) {
        naabuCalled += 1;
        const target = args[1];

        if (target === "47.113.241.78") {
          return {
            stdout: "47.113.241.78:11434\n",
            stderr: "",
            exitCode: 0
          };
        }

        return {
          stdout: "",
          stderr: "",
          exitCode: 0
        };
      }

      if (command.includes("nmap")) {
        nmapCalled += 1;
        return {
          stdout: [
            "Starting Nmap 7.93",
            "PORT      STATE SERVICE",
            "11434/tcp open  unknown",
            "| http-title: Ollama is running",
            "| http-enum:",
            "|   /api/tags: lists local models",
            "| ssl-cert: Subject: commonName=ollama.local"
          ].join("\n"),
          stderr: "",
          exitCode: 0
        };
      }

      return {
        stdout: "",
        stderr: `unsupported command: ${command}`,
        exitCode: 1
      };
    }
  };

  const tmpDir = await mkdtemp(resolve(os.tmpdir(), "fofa-six-step-"));
  const outputPath = resolve(tmpDir, "six-step-output.json");

  const result = await module.runFofaSixStepMinimal({
    csvPath,
    outputPath,
    maxTargets: 8,
    runner
  });

  assert.equal(result.summary.step1_discovered_targets > 0, true);
  assert.equal(result.summary.step1_converged_targets <= result.summary.step1_discovered_targets, true);
  assert.equal(result.summary.step2_live_targets, 1);
  assert.equal(result.summary.step3_fingerprinted_targets, 1);
  assert.equal(result.summary.step4_matched_assets, 1);
  assert.equal(result.summary.step6_high_risk_assets, 1);

  assert.equal(naabuCalled > 0, true);
  assert.equal(nmapCalled, 1);

  const outputText = await readFile(outputPath, "utf8");
  const output = JSON.parse(outputText) as {
    output_standard: string;
    summary: {
      step2_live_targets: number;
      step6_high_risk_assets: number;
    };
    assets: Array<{
      ip: string;
      port: number;
      fingerprint: {
        name: string;
        confidence: number;
      };
      risk: {
        level: "low" | "medium" | "high" | "critical";
      };
      raw_data: {
        naabu_output: string;
        nmap_output: string;
      };
    }>;
  };

  assert.equal(output.output_standard, "资产测绘_指纹整理.v1-minimal");
  assert.equal(output.summary.step2_live_targets, 1);
  assert.equal(output.summary.step6_high_risk_assets, 1);
  assert.equal(output.assets.length, 1);
  assert.equal(output.assets[0].ip, "47.113.241.78");
  assert.equal(output.assets[0].port, 11434);
  assert.equal(output.assets[0].fingerprint.name, "ollama");
  assert.equal(output.assets[0].fingerprint.confidence >= 0.75, true);
  assert.equal(output.assets[0].risk.level, "high");
  assert.equal(output.assets[0].raw_data.naabu_output.includes("11434"), true);
  assert.equal(output.assets[0].raw_data.nmap_output.includes("/api/tags"), true);
});

// 增加异常场景的测试用例
test("Naabu fails gracefully", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as SixStepModule;
  const runner: CommandRunner = {
    async run(command, args) {
      if (command.includes("naabu")) {
        return {
          stdout: "",
          stderr: "Naabu error",
          exitCode: 1,
        };
      }
      return {
        stdout: "",
        stderr: "Unknown command",
        exitCode: 1,
      };
    },
  };

  const result = await module.runFofaSixStepMinimal({
    csvPath,
    runner,
  });

  assert.equal(result.summary.step2_live_targets, 0, "Live targets should be 0 when Naabu fails");
});

test("Nmap fails gracefully", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as SixStepModule;
  const runner: CommandRunner = {
    async run(command, args) {
      if (command.includes("nmap")) {
        return {
          stdout: "",
          stderr: "Nmap error",
          exitCode: 1,
        };
      }
      return {
        stdout: "",
        stderr: "Unknown command",
        exitCode: 1,
      };
    },
  };

  const result = await module.runFofaSixStepMinimal({
    csvPath,
    runner,
  });

  assert.equal(result.summary.step3_fingerprinted_targets, 0, "Fingerprinted targets should be 0 when Nmap fails");
});
