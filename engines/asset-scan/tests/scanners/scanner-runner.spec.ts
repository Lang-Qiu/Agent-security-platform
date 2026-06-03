/**
 * REQ-ASSET-SCAN-SCANNER-002: ScannerRunner 编排器测试
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { ScannerRunner } from "../../src/scanners/runner.ts";
import type { FeatureData, ScanContext } from "../../../shared/types/asset-scan.ts";

function makeFeatureData(): FeatureData {
    return { features: [], endpoints: [], probe_hits: [] };
}

function makeContext(): ScanContext {
    return {
        ip: "127.0.0.1",
        discoveredPorts: [11434],
        identifiedProtocols: { 11434: "http" },
        protocols: [{ port: 11434, protocol: "http", service: "ollama" }]
    };
}

describe("ScannerRunner: 编排逻辑", () => {

    test("无可用扫描器时返回空结果", async () => {
        const runner = new ScannerRunner({
            gitleaks: { enabled: false },
            trivy: { enabled: false }
        });

        const result = await runner.runAll("http://127.0.0.1:11434", makeFeatureData(), makeContext());

        assert.equal(result.mergedFeatures.length, 0);
        assert.equal(result.mergedFindings.length, 0);
        assert.equal(result.scannerResults.length, 0);
    });

    test("扫描器未安装时自动跳过", async () => {
        const runner = new ScannerRunner({
            gitleaks: { enabled: true, binary_path: "/nonexistent/gitleaks" },
            trivy: { enabled: true, binary_path: "/nonexistent/trivy" }
        });

        const result = await runner.runAll("http://127.0.0.1:11434", makeFeatureData(), makeContext());

        // 两个扫描器都未安装，应返回空结果但不报错
        assert.equal(result.mergedFeatures.length, 0);
        assert.equal(result.mergedFindings.length, 0);
        // scannerResults 应包含两个结果（带 error 信息）
        assert.equal(result.scannerResults.length, 2);
        for (const sr of result.scannerResults) {
            assert.ok(sr.error, `扫描器 ${sr.tool} 应有 error 信息`);
        }
    });

    test("并行执行多个扫描器", async () => {
        const runner = new ScannerRunner({
            gitleaks: { enabled: true, binary_path: "/nonexistent/gitleaks" },
            trivy: { enabled: true, binary_path: "/nonexistent/trivy" }
        });

        const startTime = Date.now();
        const result = await runner.runAll("http://127.0.0.1:11434", makeFeatureData(), makeContext());
        const elapsed = Date.now() - startTime;

        // 并行执行，总时间应小于两个超时之和
        assert.ok(elapsed < 10000, `并行执行应较快完成，实际 ${elapsed}ms`);
        assert.equal(result.scannerResults.length, 2);
    });
});
