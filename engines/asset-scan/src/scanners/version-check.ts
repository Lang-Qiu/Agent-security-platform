/**
 * 外部扫描器版本锁定与校验
 *
 * REQ-ASSET-SCAN-SCANNER-002: 供应链安全 — 固定工具版本，不使用 floating tag。
 * 参考研究文档：Trivy 2026 供应链事件教训。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** 固定版本映射表 */
export const PINNED_VERSIONS: Record<string, string> = {
    gitleaks: "8.18.4",
    trivy: "0.52.0"
};

export interface VersionCheckResult {
    tool: string;
    expected: string;
    actual: string | null;
    ok: boolean;
    error?: string;
}

/**
 * 校验工具版本是否匹配固定版本
 */
export async function verifyToolVersion(tool: string, binaryPath?: string): Promise<VersionCheckResult> {
    const expected = PINNED_VERSIONS[tool];
    if (!expected) {
        return { tool, expected: "unknown", actual: null, ok: false, error: `No pinned version for ${tool}` };
    }

    const path = binaryPath ?? tool;

    try {
        const { stdout } = await execFileAsync(path, ["--version"], { timeout: 5000 });
        const actual = extractVersion(stdout.trim());

        return {
            tool,
            expected,
            actual,
            ok: actual === expected
        };
    } catch (error) {
        return {
            tool,
            expected,
            actual: null,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * 从版本输出中提取版本号
 * 支持格式: "gitleaks version 8.18.4", "Version: 0.52.0", "8.18.4"
 */
function extractVersion(output: string): string {
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : output;
}
