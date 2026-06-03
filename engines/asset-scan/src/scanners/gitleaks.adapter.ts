/**
 * Gitleaks 适配器 — 远程响应模式
 *
 * REQ-ASSET-SCAN-SCANNER-002: 扫描 HTTP 响应中的泄露密钥/Token。
 * 不扫描文件系统，而是从 Step 4 采集的 HTTP 响应特征中提取文本，
 * 写入临时文件后调用 gitleaks detect 扫描。
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ExtractedFeature, FeatureData, Finding, ScanContext } from "../../../../shared/types/asset-scan.ts";
import type { IScannerAdapter, ScannerResult } from "./scanner.interface.ts";

const execFileAsync = promisify(execFile);

export interface GitleaksOptions {
    binary_path?: string;
    timeout_ms?: number;
}

export class GitleaksAdapter implements IScannerAdapter {
    readonly name = "gitleaks";
    private readonly binaryPath: string;
    private readonly timeoutMs: number;

    constructor(options?: GitleaksOptions) {
        this.binaryPath = options?.binary_path ?? "gitleaks";
        this.timeoutMs = options?.timeout_ms ?? 30000;
    }

    async isAvailable(): Promise<boolean> {
        try {
            await execFileAsync(this.binaryPath, ["version"], { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async scan(target: string, featureData: FeatureData, context: ScanContext): Promise<ScannerResult> {
        const startTime = Date.now();

        try {
            // 1. 从 featureData 中提取 HTTP 响应文本
            const responseText = this.extractResponseText(featureData);

            if (!responseText.trim()) {
                return this.emptyResult(startTime, "No HTTP response text to scan");
            }

            // 2. 写入临时目录
            const tmpDir = join(tmpdir(), `gitleaks-scan-${Date.now()}`);
            await mkdir(tmpDir, { recursive: true });
            const tmpFile = join(tmpDir, "response.txt");
            await writeFile(tmpFile, responseText, "utf-8");

            try {
                // 3. 执行 gitleaks detect
                const { stdout } = await execFileAsync(
                    this.binaryPath,
                    ["detect", "--source", tmpDir, "--report-format", "json", "--no-git"],
                    { timeout: this.timeoutMs, maxBuffer: 10 * 1024 * 1024 }
                );

                // 4. 解析 JSON 输出
                const leaks = this.parseGitleaksJson(stdout);

                // 5. 转化为 features + findings
                const features = this.convertToFeatures(leaks);
                const findings = this.convertToFindings(leaks);

                return {
                    tool: this.name,
                    features,
                    findings,
                    raw_output: leaks,
                    execution_ms: Date.now() - startTime
                };
            } finally {
                // 清理临时文件
                await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);

            // 工具未安装或超时等非致命错误
            return this.emptyResult(startTime, msg);
        }
    }

    /**
     * 从 featureData 中提取 HTTP 响应文本
     */
    extractResponseText(featureData: FeatureData): string {
        const parts: string[] = [];

        for (const feature of featureData.features) {
            if (feature.feature_type === "http_header" && feature.key) {
                parts.push(`${feature.key}: ${feature.value}`);
            } else if (feature.feature_type === "http_body") {
                parts.push(feature.value);
            } else if (feature.feature_type === "error_message") {
                parts.push(feature.value);
            } else if (feature.feature_type === "json_key") {
                parts.push(`${feature.key ?? ""}: ${feature.value}`);
            }
        }

        return parts.join("\n");
    }

    /**
     * 解析 gitleaks JSON 输出
     */
    parseGitleaksJson(stdout: string): Array<{
        RuleID: string;
        Description: string;
        Secret: string;
        File: string;
        StartLine: number;
    }> {
        try {
            const parsed = JSON.parse(stdout);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    /**
     * 将 gitleaks 发现转化为 ExtractedFeature
     */
    convertToFeatures(leaks: ReturnType<GitleaksAdapter["parseGitleaksJson"]>): ExtractedFeature[] {
        return leaks.map(leak => ({
            feature_type: "secret_leak" as const,
            key: leak.RuleID,
            value: this.maskSecret(leak.Secret),
            confidence: 0.95
        }));
    }

    /**
     * 将 gitleaks 发现转化为 Finding
     */
    convertToFindings(leaks: ReturnType<GitleaksAdapter["parseGitleaksJson"]>): Finding[] {
        return leaks.map((leak, index) => {
            const isHighRisk = this.isHighRiskSecret(leak.RuleID, leak.Secret);

            return {
                finding_id: `gitleaks_${Date.now()}_${index}`,
                type: isHighRisk ? "unauthorized_access" as const : "info_leak" as const,
                title: `Secret leak detected: ${leak.RuleID}`,
                risk_level: isHighRisk ? "critical" as const : "high" as const,
                reason: `${leak.Description}. Secret pattern matched rule ${leak.RuleID}.`,
                evidence: [{
                    type: "secret_leak",
                    path: leak.Secret
                }],
                related_fingerprints: [],
                recommendation: "Rotate the leaked credential immediately. Remove hardcoded secrets from code and use environment variables or a secrets manager.",
                exposure: {
                    reachable_from: ["http_response"],
                    auth_required: false,
                    cross_boundary: false,
                    notes: `Secret found in HTTP response via ${leak.RuleID} rule`
                },
                exploitability: {
                    status: "deterministic" as const,
                    preconditions: ["Secret is exposed in HTTP response"],
                    control_gaps: ["No output redaction", "Hardcoded credential"]
                },
                max_privilege: isHighRisk
                    ? { level: "L7" as const, score: 9, identity_scope: "leaked-credential", blast_radius: "外部系统/API" }
                    : { level: "L5" as const, score: 7, identity_scope: "leaked-credential", blast_radius: "单服务" },
                composite_risk_score: isHighRisk ? 90 : 65
            };
        });
    }

    /**
     * 判断是否为高风险密钥（API Key、Token 等）
     */
    private isHighRiskSecret(ruleId: string, secret: string): boolean {
        const highRiskPatterns = [
            "api-key", "token", "secret", "password", "bearer",
            "aws", "ghp_", "gho_", "sk-", "sk_live_", "sk_test_",
            "AKIA", "ghp", "github", "openai"
        ];
        const combined = `${ruleId} ${secret}`.toLowerCase();
        return highRiskPatterns.some(p => combined.includes(p.toLowerCase()));
    }

    /**
     * 对密钥做脱敏处理（保留前 4 后 4 字符）
     */
    private maskSecret(secret: string): string {
        if (secret.length <= 12) return "****";
        return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
    }

    private emptyResult(startTime: number, error: string): ScannerResult {
        return {
            tool: this.name,
            features: [],
            findings: [],
            execution_ms: Date.now() - startTime,
            error
        };
    }
}
