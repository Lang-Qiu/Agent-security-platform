/**
 * REQ-ASSET-SCAN-SCANNER-002: Gitleaks 适配器测试
 *
 * 测试策略：
 * - 接口合规测试（不依赖 CLI 安装）
 * - 解析逻辑测试（mock JSON 输出）
 * - 容错测试（CLI 未安装时优雅降级）
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { GitleaksAdapter } from "../../src/scanners/gitleaks.adapter.ts";
import type { FeatureData, ScanContext, ExtractedFeature } from "../../../shared/types/asset-scan.ts";

// ─────────────────────────────────────────────
//  测试辅助
// ─────────────────────────────────────────────

function makeFeatureData(features: ExtractedFeature[] = []): FeatureData {
    return { features, endpoints: [], probe_hits: [] };
}

function makeContext(): ScanContext {
    return {
        ip: "127.0.0.1",
        discoveredPorts: [11434],
        identifiedProtocols: { 11434: "http" },
        protocols: [{ port: 11434, protocol: "http", service: "ollama" }]
    };
}

// ─────────────────────────────────────────────
//  接口合规测试
// ─────────────────────────────────────────────

describe("GitleaksAdapter: 接口合规", () => {

    test("实现 IScannerAdapter 接口", () => {
        const adapter = new GitleaksAdapter();

        assert.equal(adapter.name, "gitleaks");
        assert.equal(typeof adapter.isAvailable, "function");
        assert.equal(typeof adapter.scan, "function");
    });

    test("isAvailable: 工具不存在时返回 false", async () => {
        const adapter = new GitleaksAdapter({ binary_path: "/nonexistent/gitleaks" });
        const available = await adapter.isAvailable();
        assert.equal(available, false);
    });

    test("scan: 工具未安装时返回空结果 + error 信息", async () => {
        const adapter = new GitleaksAdapter({ binary_path: "/nonexistent/gitleaks" });
        const featureData = makeFeatureData([
            { feature_type: "http_header", key: "X-API-Key", value: "sk-1234567890abcdef", confidence: 1.0 }
        ]);

        const result = await adapter.scan("http://127.0.0.1:11434", featureData, makeContext());

        assert.equal(result.tool, "gitleaks");
        assert.equal(result.features.length, 0, "工具未安装时应返回空 features");
        assert.equal(result.findings.length, 0, "工具未安装时应返回空 findings");
        assert.ok(result.error, "应有 error 信息");
        assert.ok(typeof result.execution_ms === "number", "应记录 execution_ms");
    });
});

// ─────────────────────────────────────────────
//  解析逻辑测试（通过 parseGitleaksJson 方法）
// ─────────────────────────────────────────────

describe("GitleaksAdapter: 解析逻辑", () => {

    test("parseGitleaksJson: 正常 JSON 数组 → 返回泄露条目", () => {
        const adapter = new GitleaksAdapter();
        const mockJson = JSON.stringify([
            {
                RuleID: "generic-api-key",
                Description: "Generic API Key detected",
                Secret: "sk-1234567890abcdef1234567890abcdef",
                File: "response.txt",
                StartLine: 1
            }
        ]);

        const leaks = adapter.parseGitleaksJson(mockJson);
        assert.equal(leaks.length, 1);
        assert.equal(leaks[0].RuleID, "generic-api-key");
    });

    test("parseGitleaksJson: 空数组 → 返回空", () => {
        const adapter = new GitleaksAdapter();
        const leaks = adapter.parseGitleaksJson("[]");
        assert.equal(leaks.length, 0);
    });

    test("parseGitleaksJson: 无效 JSON → 返回空", () => {
        const adapter = new GitleaksAdapter();
        const leaks = adapter.parseGitleaksJson("not json");
        assert.equal(leaks.length, 0);
    });

    test("convertToFeatures: 泄露条目 → secret_leak features", () => {
        const adapter = new GitleaksAdapter();
        const leaks = [{
            RuleID: "generic-api-key",
            Description: "Generic API Key",
            Secret: "sk-1234567890abcdef1234567890abcdef",
            File: "response.txt",
            StartLine: 1
        }];

        const features = adapter.convertToFeatures(leaks);

        assert.equal(features.length, 1);
        assert.equal(features[0].feature_type, "secret_leak");
        assert.equal(features[0].key, "generic-api-key");
        assert.ok(features[0].value.includes("****"), "密钥应被脱敏");
    });

    test("convertToFindings: API Key → unauthorized_access + critical", () => {
        const adapter = new GitleaksAdapter();
        const leaks = [{
            RuleID: "generic-api-key",
            Description: "Generic API Key",
            Secret: "sk-1234567890abcdef1234567890abcdef",
            File: "response.txt",
            StartLine: 1
        }];

        const findings = adapter.convertToFindings(leaks);

        assert.equal(findings.length, 1);
        assert.equal(findings[0].type, "unauthorized_access");
        assert.equal(findings[0].risk_level, "critical");
        assert.ok(findings[0].composite_risk_score! >= 75);
    });

    test("convertToFindings: 普通密码 → unauthorized_access + critical（password 是高风险模式）", () => {
        const adapter = new GitleaksAdapter();
        const leaks = [{
            RuleID: "generic-password",
            Description: "Generic Password",
            Secret: "my-secret-password-123",
            File: "response.txt",
            StartLine: 1
        }];

        const findings = adapter.convertToFindings(leaks);

        assert.equal(findings.length, 1);
        // "password" 在高风险模式列表中，所以映射为 unauthorized_access
        assert.equal(findings[0].type, "unauthorized_access");
        assert.equal(findings[0].risk_level, "critical");
    });

    test("convertToFindings: 非高风险模式 → info_leak + high", () => {
        const adapter = new GitleaksAdapter();
        const leaks = [{
            RuleID: "generic-md5",
            Description: "MD5 hash detected",
            Secret: "d41d8cd98f00b204e9800998ecf8427e",
            File: "response.txt",
            StartLine: 1
        }];

        const findings = adapter.convertToFindings(leaks);

        assert.equal(findings.length, 1);
        assert.equal(findings[0].type, "info_leak");
        assert.equal(findings[0].risk_level, "high");
    });
});

// ─────────────────────────────────────────────
//  响应文本提取测试
// ─────────────────────────────────────────────

describe("GitleaksAdapter: 响应文本提取", () => {

    test("extractResponseText: 从 features 中提取 HTTP 头和体", () => {
        const adapter = new GitleaksAdapter();
        const featureData = makeFeatureData([
            { feature_type: "http_header", key: "Server", value: "nginx/1.21.6", confidence: 1.0 },
            { feature_type: "http_header", key: "X-Powered-By", value: "Express", confidence: 1.0 },
            { feature_type: "http_body", value: '{"status":"ok"}', confidence: 1.0 }
        ]);

        const text = adapter.extractResponseText(featureData);

        assert.ok(text.includes("Server: nginx/1.21.6"));
        assert.ok(text.includes("X-Powered-By: Express"));
        assert.ok(text.includes('{"status":"ok"}'));
    });

    test("extractResponseText: 空 features → 空字符串", () => {
        const adapter = new GitleaksAdapter();
        const text = adapter.extractResponseText(makeFeatureData([]));
        assert.equal(text.trim(), "");
    });
});
