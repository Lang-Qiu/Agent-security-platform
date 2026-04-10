import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SemgrepScanOptions {
  targetPath: string;
  rulePath: string;
}

export async function runSemgrepScan(options: SemgrepScanOptions): Promise<unknown> {
  const { stdout } = await execFileAsync(
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
      env: {
        ...process.env,
        SEMGREP_SEND_METRICS: "off"
      }
    }
  );

  return JSON.parse(stdout);
}
