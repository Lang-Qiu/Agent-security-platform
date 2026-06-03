/**
 * ScannerRunner — 扫描器并行执行编排器
 *
 * REQ-ASSET-SCAN-SCANNER-002: 并行执行所有可用的外部扫描器，
 * 合并输出为统一的 features 和 findings。
 */
import type { ExtractedFeature, FeatureData, Finding, ScanContext } from "../../../../shared/types/asset-scan.ts";
import type { IScannerAdapter, ScannerConfig, ScannerResult } from "./scanner.interface.ts";
import { GitleaksAdapter } from "./gitleaks.adapter.ts";
import { TrivyAdapter } from "./trivy.adapter.ts";

export class ScannerRunner {
    private readonly scanners: IScannerAdapter[];

    constructor(config: ScannerConfig) {
        this.scanners = [];

        if (config.gitleaks?.enabled) {
            this.scanners.push(new GitleaksAdapter({
                binary_path: config.gitleaks.binary_path,
                timeout_ms: config.gitleaks.timeout_ms
            }));
        }

        if (config.trivy?.enabled) {
            this.scanners.push(new TrivyAdapter({
                binary_path: config.trivy.binary_path,
                severity: config.trivy.severity,
                timeout_ms: config.trivy.timeout_ms
            }));
        }
    }

    /**
     * 并行执行所有可用扫描器
     */
    async runAll(
        target: string,
        featureData: FeatureData,
        context: ScanContext
    ): Promise<{
        mergedFeatures: ExtractedFeature[];
        mergedFindings: Finding[];
        scannerResults: ScannerResult[];
    }> {
        // 1. 检查可用性
        const availabilityChecks = await Promise.all(
            this.scanners.map(async (scanner) => ({
                scanner,
                available: await scanner.isAvailable()
            }))
        );

        const availableScanners = availabilityChecks
            .filter(check => check.available)
            .map(check => check.scanner);

        // 2. 如果没有可用扫描器，返回空结果（包含未安装的 error 信息）
        if (availableScanners.length === 0) {
            const errorResults: ScannerResult[] = availabilityChecks
                .filter(check => !check.available)
                .map(check => ({
                    tool: check.scanner.name,
                    features: [],
                    findings: [],
                    execution_ms: 0,
                    error: `${check.scanner.name} is not available in PATH`
                }));

            return {
                mergedFeatures: [],
                mergedFindings: [],
                scannerResults: errorResults
            };
        }

        // 3. 并行执行所有可用扫描器
        const scanPromises = availableScanners.map(scanner =>
            scanner.scan(target, featureData, context)
        );

        const results = await Promise.all(scanPromises);

        // 4. 合并结果
        const mergedFeatures: ExtractedFeature[] = [];
        const mergedFindings: Finding[] = [];

        for (const result of results) {
            mergedFeatures.push(...result.features);
            mergedFindings.push(...result.findings);
        }

        return {
            mergedFeatures,
            mergedFindings,
            scannerResults: results
        };
    }
}
