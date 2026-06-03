/**
 * REQ-ASSET-SCAN-SCANNER-002: Trivy 适配器测试
 *
 * 测试策略：
 * - 接口合规测试（不依赖 CLI 安装）
 * - 解析逻辑测试（mock JSON 输出）
 * - 容错测试（CLI 未安装时优雅降级）
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { TrivyAdapter } from "../../src/scanners/trivy.adapter.ts";
import type { FeatureData, ScanContext } from "../../../shared/types/asset-scan.ts";

function makeFeatureData(features: any[] = []): FeatureData {
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

describe("TrivyAdapter: 接口合规", () => {

    test("实现 IScannerAdapter 接口", () => {
        const adapter = new TrivyAdapter();
        assert.equal(adapter.name, "trivy");
        assert.equal(typeof adapter.isAvailable, "function");
        assert.equal(typeof adapter.scan, "function");
    });

    test("isAvailable: 工具不存在时返回 false", async () => {
        const adapter = new TrivyAdapter({ binary_path: "/nonexistent/trivy" });
        const available = await adapter.isAvailable();
        assert.equal(available, false);
    });

    test("scan: 工具未安装时返回空结果 + error 信息", async () => {
        const adapter = new TrivyAdapter({ binary_path: "/nonexistent/trivy" });
        const result = await adapter.scan("http://127.0.0.1:11434", makeFeatureData(), makeContext());

        assert.equal(result.tool, "trivy");
        assert.equal(result.features.length, 0);
        assert.equal(result.findings.length, 0);
        assert.ok(result.error);
    });
});

describe("TrivyAdapter: 解析逻辑", () => {

    test("parseTrivyJson: CVE 漏洞 → cve_vulnerability features", () => {
        const adapter = new TrivyAdapter();
        const mockJson = JSON.stringify({
            Results: [{
                Target: "package.json",
                Vulnerabilities: [{
                    VulnerabilityID: "CVE-2024-12345",
                    PkgName: "lodash",
                    InstalledVersion: "4.17.20",
                    FixedVersion: "4.17.21",
                    Severity: "CRITICAL",
                    Title: "Prototype Pollution in lodash",
                    Description: "lodash versions prior to 4.17.21 are vulnerable to Prototype Pollution."
                }]
            }]
        });

        const vulns = adapter.parseTrivyJson(mockJson);
        assert.equal(vulns.length, 1);
        assert.equal(vulns[0].VulnerabilityID, "CVE-2024-12345");
        assert.equal(vulns[0].Severity, "CRITICAL");
    });

    test("parseTrivyJson: 无漏洞 → 空数组", () => {
        const adapter = new TrivyAdapter();
        const vulns = adapter.parseTrivyJson(JSON.stringify({ Results: [] }));
        assert.equal(vulns.length, 0);
    });

    test("parseTrivyJson: 无效 JSON → 空数组", () => {
        const adapter = new TrivyAdapter();
        const vulns = adapter.parseTrivyJson("not json");
        assert.equal(vulns.length, 0);
    });

    test("convertToFeatures: CRITICAL CVE → cve_vulnerability feature", () => {
        const adapter = new TrivyAdapter();
        const vulns = [{
            VulnerabilityID: "CVE-2024-12345",
            PkgName: "lodash",
            InstalledVersion: "4.17.20",
            FixedVersion: "4.17.21",
            Severity: "CRITICAL",
            Title: "Prototype Pollution",
            Description: "..."
        }];

        const features = adapter.convertToFeatures(vulns);
        assert.equal(features.length, 1);
        assert.equal(features[0].feature_type, "cve_vulnerability");
        assert.equal(features[0].key, "CVE-2024-12345");
    });

    test("convertToFindings: CRITICAL CVE → unauthorized_access + critical", () => {
        const adapter = new TrivyAdapter();
        const vulns = [{
            VulnerabilityID: "CVE-2024-12345",
            PkgName: "lodash",
            InstalledVersion: "4.17.20",
            FixedVersion: "4.17.21",
            Severity: "CRITICAL",
            Title: "Prototype Pollution",
            Description: "lodash versions prior to 4.17.21 are vulnerable."
        }];

        const findings = adapter.convertToFindings(vulns);
        assert.equal(findings.length, 1);
        assert.equal(findings[0].type, "unauthorized_access");
        assert.equal(findings[0].risk_level, "critical");
        assert.ok(findings[0].composite_risk_score! >= 75);
    });

    test("convertToFindings: HIGH CVE → unauthorized_access + high", () => {
        const adapter = new TrivyAdapter();
        const vulns = [{
            VulnerabilityID: "CVE-2024-99999",
            PkgName: "axios",
            InstalledVersion: "0.21.0",
            FixedVersion: "0.21.4",
            Severity: "HIGH",
            Title: "SSRF in axios",
            Description: "..."
        }];

        const findings = adapter.convertToFindings(vulns);
        assert.equal(findings.length, 1);
        assert.equal(findings[0].risk_level, "high");
    });

    test("convertToFindings: MEDIUM CVE → misconfiguration + medium", () => {
        const adapter = new TrivyAdapter();
        const vulns = [{
            VulnerabilityID: "CVE-2024-11111",
            PkgName: "express",
            InstalledVersion: "4.17.0",
            FixedVersion: "4.18.0",
            Severity: "MEDIUM",
            Title: "Minor issue",
            Description: "..."
        }];

        const findings = adapter.convertToFindings(vulns);
        assert.equal(findings.length, 1);
        assert.equal(findings[0].type, "misconfiguration");
        assert.equal(findings[0].risk_level, "medium");
    });
});
