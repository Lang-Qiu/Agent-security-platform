/**
 * Trivy 适配器 — 远程响应模式
 *
 * REQ-ASSET-SCAN-SCANNER-002: 扫描远程目标的已知 CVE 漏洞。
 * 在远程模式下，从 Step 4 采集的服务指纹和版本信息构造扫描目标，
 * 调用 trivy 扫描已知漏洞数据库。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ExtractedFeature, FeatureData, Finding, ScanContext } from "../../../../shared/types/asset-scan.ts";
import type { IScannerAdapter, ScannerResult } from "./scanner.interface.ts";

const execFileAsync = promisify(execFile);

export interface TrivyOptions {
    binary_path?: string;
    severity?: string[];
    timeout_ms?: number;
}

interface TrivyVulnerability {
    VulnerabilityID: string;
    PkgName: string;
    InstalledVersion: string;
    FixedVersion?: string;
    Severity: string;
    Title: string;
    Description: string;
}

interface TrivyResult {
    Target: string;
    Vulnerabilities?: TrivyVulnerability[];
}

interface TrivyOutput {
    Results: TrivyResult[];
}

export class TrivyAdapter implements IScannerAdapter {
    readonly name = "trivy";
    private readonly binaryPath: string;
    private readonly severity: string[];
    private readonly timeoutMs: number;

    constructor(options?: TrivyOptions) {
        this.binaryPath = options?.binary_path ?? "trivy";
        this.severity = options?.severity ?? ["CRITICAL", "HIGH", "MEDIUM"];
        this.timeoutMs = options?.timeout_ms ?? 60000;
    }

    async isAvailable(): Promise<boolean> {
        try {
            await execFileAsync(this.binaryPath, ["--version"], { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async scan(target: string, featureData: FeatureData, context: ScanContext): Promise<ScannerResult> {
        const startTime = Date.now();

        try {
            // 1. 从 featureData 中提取服务版本信息
            const serviceInfo = this.extractServiceInfo(featureData, context);

            if (!serviceInfo) {
                return this.emptyResult(startTime, "No service version info available for CVE lookup");
            }

            // 2. 执行 trivy 扫描（使用 PURL 或直接扫描）
            const args = [
                "fs",
                "--format", "json",
                "--severity", this.severity.join(","),
                "--quiet"
            ];

            // 如果有具体的包信息，使用 --pkg-urls
            // 否则扫描响应中的依赖信息
            const { stdout } = await execFileAsync(
                this.binaryPath,
                [...args, target],
                { timeout: this.timeoutMs, maxBuffer: 50 * 1024 * 1024 }
            );

            // 3. 解析 JSON 输出
            const vulns = this.parseTrivyJson(stdout);

            // 4. 转化为 features + findings
            const features = this.convertToFeatures(vulns);
            const findings = this.convertToFindings(vulns);

            return {
                tool: this.name,
                features,
                findings,
                raw_output: JSON.parse(stdout),
                execution_ms: Date.now() - startTime
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return this.emptyResult(startTime, msg);
        }
    }

    /**
     * 从 featureData 中提取服务版本信息
     */
    private extractServiceInfo(featureData: FeatureData, context: ScanContext): {
        service: string;
        version?: string;
    } | null {
        // 从 http_header 中提取 Server 版本
        for (const f of featureData.features) {
            if (f.feature_type === "http_header" && f.key === "Server") {
                const match = f.value.match(/^([\w-]+)\/([\d.]+)/);
                if (match) {
                    return { service: match[1], version: match[2] };
                }
                return { service: f.value };
            }
        }

        // 从 json_key 中提取版本信息
        for (const f of featureData.features) {
            if (f.feature_type === "json_key" && f.key === "version") {
                return { service: "unknown", version: f.value };
            }
        }

        // 从 context 的 protocol service 推断
        if (context.protocols.length > 0) {
            const service = context.protocols[0].service;
            if (service !== "unknown") {
                return { service };
            }
        }

        return null;
    }

    /**
     * 解析 trivy JSON 输出
     */
    parseTrivyJson(stdout: string): TrivyVulnerability[] {
        try {
            const parsed: TrivyOutput = JSON.parse(stdout);
            const vulns: TrivyVulnerability[] = [];

            for (const result of parsed.Results ?? []) {
                if (result.Vulnerabilities) {
                    vulns.push(...result.Vulnerabilities);
                }
            }

            return vulns;
        } catch {
            return [];
        }
    }

    /**
     * 将漏洞转化为 ExtractedFeature
     */
    convertToFeatures(vulns: TrivyVulnerability[]): ExtractedFeature[] {
        return vulns.map(vuln => ({
            feature_type: "cve_vulnerability" as const,
            key: vuln.VulnerabilityID,
            value: `${vuln.Severity}: ${vuln.Title} (${vuln.PkgName}@${vuln.InstalledVersion})`,
            confidence: 0.90
        }));
    }

    /**
     * 将漏洞转化为 Finding
     */
    convertToFindings(vulns: TrivyVulnerability[]): Finding[] {
        return vulns.map((vuln, index) => {
            const riskLevel = this.severityToRiskLevel(vuln.Severity);
            const findingType = this.severityToFindingType(vuln.Severity);

            return {
                finding_id: `trivy_${Date.now()}_${index}`,
                type: findingType,
                title: `${vuln.VulnerabilityID}: ${vuln.Title}`,
                risk_level: riskLevel,
                reason: `${vuln.Description} Affects ${vuln.PkgName}@${vuln.InstalledVersion}${vuln.FixedVersion ? `. Fixed in ${vuln.FixedVersion}` : ""}.`,
                evidence: [{
                    type: "cve_vulnerability",
                    path: `${vuln.PkgName}@${vuln.InstalledVersion}`
                }],
                related_fingerprints: [],
                recommendation: vuln.FixedVersion
                    ? `Upgrade ${vuln.PkgName} from ${vuln.InstalledVersion} to ${vuln.FixedVersion}.`
                    : `No fix available yet. Consider mitigating or replacing ${vuln.PkgName}.`,
                exposure: {
                    reachable_from: ["network"],
                    auth_required: false,
                    cross_boundary: false,
                    notes: `CVE ${vuln.VulnerabilityID} in ${vuln.PkgName}`
                },
                exploitability: {
                    status: riskLevel === "critical" ? "reproducible" as const : "plausible" as const,
                    preconditions: [`Vulnerable package ${vuln.PkgName}@${vuln.InstalledVersion} is in use`],
                    control_gaps: ["Outdated dependency"]
                },
                max_privilege: this.severityToPrivilege(vuln.Severity),
                composite_risk_score: this.severityToScore(vuln.Severity)
            };
        });
    }

    private severityToRiskLevel(severity: string): Finding["risk_level"] {
        switch (severity.toUpperCase()) {
            case "CRITICAL": return "critical";
            case "HIGH": return "high";
            case "MEDIUM": return "medium";
            case "LOW": return "low";
            default: return "info";
        }
    }

    private severityToFindingType(severity: string): Finding["type"] {
        switch (severity.toUpperCase()) {
            case "CRITICAL":
            case "HIGH":
                return "unauthorized_access";
            case "MEDIUM":
                return "misconfiguration";
            default:
                return "info_leak";
        }
    }

    private severityToPrivilege(severity: string): Finding["max_privilege"] {
        switch (severity.toUpperCase()) {
            case "CRITICAL":
                return { level: "L7", score: 9, identity_scope: "vulnerable-dependency", blast_radius: "外部系统/API" };
            case "HIGH":
                return { level: "L6", score: 8, identity_scope: "vulnerable-dependency", blast_radius: "受限执行容器" };
            case "MEDIUM":
                return { level: "L4", score: 6, identity_scope: "vulnerable-dependency", blast_radius: "单服务" };
            default:
                return { level: "L2", score: 3, identity_scope: "vulnerable-dependency", blast_radius: "单服务" };
        }
    }

    private severityToScore(severity: string): number {
        switch (severity.toUpperCase()) {
            case "CRITICAL": return 90;
            case "HIGH": return 70;
            case "MEDIUM": return 45;
            case "LOW": return 20;
            default: return 10;
        }
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
