import { parseArgs } from "node:util";
import { runAssetScanTask } from "./runtime/run-task.ts";
import type { Task } from "../../../shared/types/task.ts";

async function main() {
    // 1. 解析命令行参数
    const { values } = parseArgs({
        options: {
            target: {
                type: "string",
                short: "t",
                default: "http://127.0.0.1:11434" // 默认测本地的 Ollama
            },
            help: {
                type: "boolean",
                short: "h"
            }
        }
    });

    if (values.help) {
        console.log(`
Usage: node --experimental-strip-types engines/asset-scan/src/cli.ts [options]

Options:
    -t, --target <url>   Specify the target URL to scan (e.g. http://localhost:3000)
    -h, --help           Show help
        `);
        process.exit(0);
    }

    const targetUrl = values.target as string;

    console.log(`🚀 [CLI] Starting standalone asset scan on target: ${targetUrl}`);
    console.log(`--------------------------------------------------------------`);

    // 2. 伪造一个调度系统下发的标准 Task 载荷
    const mockTask: Task = {
        task_id: `task_cli_test_${Date.now()}`,
        task_type: "asset_scan",
        engine_type: "asset_scan",
        status: "pending",
        title: "CLI Standalone Scan",
        target: {
            target_type: "url",
            target_value: targetUrl
        },
        parameters: {
            probe_mode: "live"
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // 3. 执行核心扫描任务
    const startTime = performance.now();
    const result = await runAssetScanTask(mockTask);
    const endTime = performance.now();

    // 4. 美化并输出最终 JSON 结果
    console.log(`\n✅ [CLI] Scan completed in ${(endTime - startTime).toFixed(2)} ms`);
    console.log(`\n📊 [Result Data]:\n`);
    
    // 使用 JSON.stringify 的第三个参数 '2'，实现在终端的美观缩进打印
    console.log(JSON.stringify(result, null, 2));

    // 针对安全分析结果的贴心提示
    if (result.findings && result.findings.length > 0) {
        console.log(`\n⚠️  [Alert]: Detected ${result.findings.length} security finding(s)! Check the 'findings' array above.`);
    }
}

// 运行主函数
main().catch((err) => {
    console.error("❌ [CLI Fatal Error]:", err);
    process.exit(1);
});