import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AssetScanResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";

interface EngineBridgeOutput {
  success: boolean;
  details?: AssetScanResultDetails;
  error?: string;
}

export interface AssetScanEngineClient {
  scan(task: Task): Promise<AssetScanResultDetails | null>;
}

export class ProcessAssetScanEngineClient implements AssetScanEngineClient {
  bridgeScriptPath: string;
  workspaceRoot: string;

  constructor(options?: { bridgeScriptPath?: string; workspaceRoot?: string }) {
    const currentFileDir = dirname(fileURLToPath(import.meta.url));
    this.workspaceRoot = options?.workspaceRoot ?? resolve(currentFileDir, "../../../../..");
    this.bridgeScriptPath = options?.bridgeScriptPath ?? resolve(this.workspaceRoot, "engines/asset-scan/src/bridge/scan-task.ts");
  }

  async scan(task: Task): Promise<AssetScanResultDetails | null> {
    const payload = JSON.stringify({ task });
    const stdout = await new Promise<string>((resolvePromise, rejectPromise) => {
      const processHandle = spawn(process.execPath, ["--experimental-strip-types", this.bridgeScriptPath], {
        cwd: this.workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"]
      });

      let out = "";
      let err = "";

      processHandle.stdout.setEncoding("utf8");
      processHandle.stderr.setEncoding("utf8");

      processHandle.stdout.on("data", (chunk) => {
        out += chunk;
      });

      processHandle.stderr.on("data", (chunk) => {
        err += chunk;
      });

      processHandle.on("error", (error) => {
        rejectPromise(error);
      });

      processHandle.on("close", (code) => {
        if (code !== 0) {
          rejectPromise(new Error(`Asset-scan engine process exited with code ${code}: ${err}`));
          return;
        }

        resolvePromise(out);
      });

      processHandle.stdin.write(payload);
      processHandle.stdin.end();
    });

    const parsed = JSON.parse(stdout) as EngineBridgeOutput;

    if (!parsed.success) {
      const reason = parsed.error ?? "asset-scan engine bridge returned an unknown error";
      throw new Error(`Asset-scan engine execution failed: ${reason}`);
    }

    return parsed.details ?? null;
  }
}
