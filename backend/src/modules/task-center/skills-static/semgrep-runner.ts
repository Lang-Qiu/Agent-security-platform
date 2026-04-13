import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import {
  SkillsStaticExecutionError,
  type SkillsStaticExecutionReason
} from "./skills-static-execution-error.ts";

const execFileAsync = promisify(execFile);

type SemgrepExecFile = typeof execFileAsync;

export interface SemgrepScanOptions {
  targetPath: string;
  rulePath: string;
  timeoutMs?: number;
  execFileImpl?: SemgrepExecFile;
}

export async function runSemgrepScan(options: SemgrepScanOptions): Promise<unknown> {
  if (!existsSync(options.rulePath)) {
    throw new SkillsStaticExecutionError({
      provider: "semgrep",
      phase: "runner",
      reason: "ruleset_missing",
      detail: options.rulePath
    });
  }

  if (!existsSync(options.targetPath)) {
    throw new SkillsStaticExecutionError({
      provider: "semgrep",
      phase: "runner",
      reason: "target_missing",
      detail: options.targetPath
    });
  }

  const execFileImpl = options.execFileImpl ?? execFileAsync;
  const timeoutMs = options.timeoutMs ?? 15000;

  try {
    const { stdout } = await execFileImpl(
      "semgrep",
      [
        "scan",
        "--config",
        options.rulePath,
        "--json",
        "--quiet",
        "--metrics=off",
        "--disable-version-check",
        "--no-git-ignore",
        // The current repository intentionally keeps worktrees under `.worktrees/`.
        // This fixture lives inside that path, so we must bypass Semgrep's default
        // ignore discovery to exercise the real-tool path in this isolated worktree.
        "--x-ignore-semgrepignore-files",
        "."
      ],
      {
        cwd: options.targetPath,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        timeout: timeoutMs,
        killSignal: "SIGTERM",
        env: {
          ...process.env,
          SEMGREP_SEND_METRICS: "off"
        }
      }
    );

    try {
      return JSON.parse(stdout);
    } catch (error) {
      throw new SkillsStaticExecutionError({
        provider: "semgrep",
        phase: "runner",
        reason: "output_invalid_json",
        cause: error
      });
    }
  } catch (error) {
    if (error instanceof SkillsStaticExecutionError) {
      throw error;
    }

    const reason: SkillsStaticExecutionReason =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
        ? "binary_missing"
        : typeof error === "object" &&
            error !== null &&
            "killed" in error &&
            (error as { killed?: boolean }).killed === true
          ? "timeout"
          : "exit_non_zero";

    throw new SkillsStaticExecutionError({
      provider: "semgrep",
      phase: "runner",
      reason,
      detail: error instanceof Error ? error.message : String(error),
      cause: error
    });
  }
}
