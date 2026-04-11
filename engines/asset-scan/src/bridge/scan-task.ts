import { readFileSync } from "node:fs";

import type { AssetScanResultDetails } from "../../../../shared/types/result.ts";
import type { Task } from "../../../../shared/types/task.ts";
import { runAssetScanTask } from "../runtime/run-task.ts";

interface BridgeInput {
  task: Task;
}

interface BridgeOutput {
  success: boolean;
  details?: AssetScanResultDetails;
  error?: string;
}

function readStdIn(): string {
  return readFileSync(0, "utf8");
}

async function main(): Promise<void> {
  let output: BridgeOutput;

  try {
    const raw = readStdIn();
    const parsed = JSON.parse(raw) as BridgeInput;

    if (!parsed?.task || parsed.task.task_type !== "asset_scan") {
      throw new Error("Invalid bridge input: missing asset_scan task");
    }

    const details = await runAssetScanTask(parsed.task);
    output = {
      success: true,
      details
    };
  } catch (error) {
    output = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown bridge error"
    };
  }

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

void main();
