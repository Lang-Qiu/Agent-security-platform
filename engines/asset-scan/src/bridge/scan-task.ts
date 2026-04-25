import { runAssetScanTask } from "../runtime/run-task.ts";
import type { Task } from "../../../../shared/types/task.ts";
import type { AssetScanResultDetails } from "../../../../shared/types/result.ts";

async function main() {
  let input = "";
  
  // 1. 从标准输入读取 Backend 传递的 Task Payload
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const payload = JSON.parse(input);
    const task: Task = payload.task;

    if (!task) {
      throw new Error("Missing task payload in stdin");
    }

    // 2. 调用已实现的引擎核心入口 (执行 Pipeline)
    const fullResult = await runAssetScanTask(task);

    // 3. 将引擎级的 AssetScanResult 降维映射为平台级 AssetScanResultDetails
    const details: AssetScanResultDetails = {
      target: fullResult.target,
      fingerprint: fullResult.fingerprints,
      open_ports: fullResult.network?.open_ports || [],
      http_endpoints: fullResult.application?.http_endpoints || [],
      auth_detected: fullResult.application?.auth?.auth_detected || false,
      findings: fullResult.findings || []
    };

    // 4. 将结果以 JSON 格式输出到 stdout 供 Backend 消费
    console.log(JSON.stringify({ 
      success: true, 
      details 
    }));

  } catch (error) {
    // 错误信息输出到 stderr，并向 stdout 返回失败状态
    console.error(`[Bridge Error]`, error);
    console.log(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }));
    process.exit(1);
  }
}

main();