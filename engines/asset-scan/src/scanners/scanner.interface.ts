/**
 * 外部扫描器统一接口
 *
 * REQ-ASSET-SCAN-SCANNER-002: 所有外部扫描器适配器实现此接口。
 * 扫描器接收 Step 4 采集的 FeatureData（含 HTTP 响应），输出统一的 features 和 findings。
 */
import type { ExtractedFeature, FeatureData, Finding, ScanContext } from "../../../../shared/types/asset-scan.ts";

/** 单个扫描器的执行结果 */
export interface ScannerResult {
    /** 扫描器名称，如 "gitleaks"、"trivy" */
    tool: string;
    /** 转化为统一特征的输出 */
    features: ExtractedFeature[];
    /** 直接产出的 findings（如 CVE 漏洞、泄露密钥） */
    findings: Finding[];
    /** 原始 JSON 输出，用于审计和调试 */
    raw_output?: unknown;
    /** 执行耗时（毫秒） */
    execution_ms: number;
    /** 非致命错误信息（工具未安装、超时等） */
    error?: string;
}

/** 扫描器适配器接口 */
export interface IScannerAdapter {
    /** 扫描器名称 */
    readonly name: string;

    /** 检查工具是否可用（PATH 中存在、版本正确） */
    isAvailable(): Promise<boolean>;

    /**
     * 执行扫描
     * @param target 目标 URL（如 http://127.0.0.1:11434）
     * @param featureData Step 4 采集的特征数据（含 HTTP 响应）
     * @param context 扫描上下文
     */
    scan(target: string, featureData: FeatureData, context: ScanContext): Promise<ScannerResult>;
}

/** 扫描器配置 */
export interface ScannerConfig {
    gitleaks?: {
        enabled: boolean;
        binary_path?: string;
        timeout_ms?: number;
    };
    trivy?: {
        enabled: boolean;
        binary_path?: string;
        severity?: string[];
        timeout_ms?: number;
    };
}
