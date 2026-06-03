/**
 * REQ-ASSET-SCAN-RISK-001: 多维度风险评估测试
 *
 * 测试 ClassificationService 的风险推断、权限映射和复合评分能力。
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test, describe } from "node:test";

import { ClassificationService } from "../src/runtime/classification.service.ts";
import type {
    FingerprintMatchItem,
    EndpointInfo,
    ExtractedFeature,
    ScanContext,
    Finding
} from "../../shared/types/asset-scan.ts";

// ─────────────────────────────────────────────
//  测试辅助：构造 fixture
// ─────────────────────────────────────────────

const RISK_RULES_PATH = resolve(import.meta.dirname, "../rules/risk-rules.v1.yaml");

function makeClassificationService(): ClassificationService {
    return new ClassificationService(RISK_RULES_PATH);
}

function makeTopMatch(category: string, name: string = "test-fingerprint"): FingerprintMatchItem {
    return {
        fingerprint_name: name,
        category: category as FingerprintMatchItem["category"],
        confidence: 0.90,
        matched_features: [],
        evidence_chain: []
    };
}

function makeEndpoint(path: string, authRequired: boolean, method: string = "GET"): EndpointInfo {
    return { method, path, status_code: 200, auth_required: authRequired };
}

function makeFeature(featureType: ExtractedFeature["featureType"], key: string, value: string): ExtractedFeature {
    return { feature_type: featureType, key, value, confidence: 1.0 };
}

function makeContext(protocol: string = "https"): ScanContext {
    return {
        ip: "127.0.0.1",
        discoveredPorts: [11434],
        identifiedProtocols: { 11434: protocol as ScanContext["identifiedProtocols"][number] },
        protocols: [{ port: 11434, protocol: protocol as ScanContext["protocols"][number]["protocol"], service: "ollama" }]
    };
}

// ─────────────────────────────────────────────
//  测试用例
// ─────────────────────────────────────────────

describe("REQ-ASSET-SCAN-RISK-001: 多规则推断引擎", () => {

    test("exposed_api_critical: llm_api 类目 + 未认证端点 → critical finding", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("llm_api", "ollama")];
        const endpoints = [makeEndpoint("/api/tags", false), makeEndpoint("/api/version", false)];
        const context = makeContext();

        const result = svc.buildResult("http://127.0.0.1:11434", context, matches, endpoints);

        const exposedFindings = result.findings!.filter(f => f.type === "exposed_api");
        assert.ok(exposedFindings.length > 0, "应产出 exposed_api finding");
        assert.equal(exposedFindings[0].risk_level, "critical", "llm_api 应为 critical");
        assert.ok(exposedFindings[0].composite_risk_score! >= 75, "composite_risk_score 应 >= 75");
    });

    test("exposed_api_high: agent_framework 类目 + 未认证端点 → high finding", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("agent_framework", "langflow")];
        const endpoints = [makeEndpoint("/api/v1/flows", false)];
        const context = makeContext();

        const result = svc.buildResult("http://127.0.0.1:3000", context, matches, endpoints);

        const exposedFindings = result.findings!.filter(f => f.type === "exposed_api");
        assert.ok(exposedFindings.length > 0, "应产出 exposed_api finding");
        assert.equal(exposedFindings[0].risk_level, "high", "agent_framework 应为 high");
    });

    test("info_leak_version: Server 头含版本号 → low finding", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("web_framework", "nginx")];
        const endpoints = [makeEndpoint("/", true)];
        const features = [makeFeature("http_header", "Server", "nginx/1.21.6")];
        const context = makeContext();

        const result = svc.buildResult("http://127.0.0.1:80", context, matches, endpoints, features);

        const infoLeakFindings = result.findings!.filter(f => f.type === "info_leak");
        assert.ok(infoLeakFindings.length > 0, "应产出 info_leak finding");
        assert.equal(infoLeakFindings[0].risk_level, "low", "版本泄露应为 low");
    });

    test("info_leak_debug: 响应体含 traceback → medium finding", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("web_framework")];
        const endpoints = [makeEndpoint("/", true)];
        const features = [makeFeature("http_body", "", "Traceback (most recent call last): ...")];
        const context = makeContext();

        const result = svc.buildResult("http://127.0.0.1:80", context, matches, endpoints, features);

        const infoLeakFindings = result.findings!.filter(f => f.type === "info_leak");
        assert.ok(infoLeakFindings.length > 0, "应产出 info_leak finding");
        assert.equal(infoLeakFindings[0].risk_level, "medium", "调试信息泄露应为 medium");
    });

    test("misconfiguration_cors: CORS 全开 → medium finding", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("web_framework")];
        const endpoints = [makeEndpoint("/", true)];
        const features = [makeFeature("http_header", "Access-Control-Allow-Origin", "*")];
        const context = makeContext();

        const result = svc.buildResult("http://127.0.0.1:80", context, matches, endpoints, features);

        const misconfigFindings = result.findings!.filter(f => f.type === "misconfiguration");
        assert.ok(misconfigFindings.length > 0, "应产出 misconfiguration finding");
        assert.equal(misconfigFindings[0].risk_level, "medium");
    });

    test("misconfiguration_http_sensitive: HTTP 明文传输敏感 API → medium finding", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("web_framework")];
        const endpoints = [makeEndpoint("/api/v1/test", true)];
        const context = makeContext("http");

        const result = svc.buildResult("http://127.0.0.1:80", context, matches, endpoints);

        const misconfigFindings = result.findings!.filter(f => f.type === "misconfiguration");
        assert.ok(misconfigFindings.length > 0, "应产出 misconfiguration finding");
    });

    test("weak_auth_basic: Basic Auth → medium finding", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("web_framework")];
        const endpoints = [makeEndpoint("/", true)];
        const features = [makeFeature("http_header", "WWW-Authenticate", "Basic realm=\"test\"")];
        const context = makeContext();

        const result = svc.buildResult("http://127.0.0.1:80", context, matches, endpoints, features);

        const weakAuthFindings = result.findings!.filter(f => f.type === "weak_auth");
        assert.ok(weakAuthFindings.length > 0, "应产出 weak_auth finding");
        assert.equal(weakAuthFindings[0].risk_level, "medium");
    });

    test("unauthorized_sensitive_endpoint: 敏感端点未授权 → high finding", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("agent_application")];
        const endpoints = [makeEndpoint("/api/v1/flows", false), makeEndpoint("/api/tags", false)];
        const context = makeContext();

        const result = svc.buildResult("http://127.0.0.1:3000", context, matches, endpoints);

        const unauthFindings = result.findings!.filter(f => f.type === "unauthorized_access");
        assert.ok(unauthFindings.length > 0, "应产出 unauthorized_access finding");
        assert.equal(unauthFindings[0].risk_level, "high");
    });

    test("多个规则可同时触发", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("llm_api", "ollama")];
        const endpoints = [makeEndpoint("/api/tags", false)];
        const features = [
            makeFeature("http_header", "Server", "uvicorn/0.30.0"),
            makeFeature("http_header", "Access-Control-Allow-Origin", "*")
        ];
        const context = makeContext();

        const result = svc.buildResult("http://127.0.0.1:11434", context, matches, endpoints, features);

        assert.ok(result.findings!.length >= 3, `应产出至少 3 个 findings，实际 ${result.findings!.length}`);
    });
});

describe("REQ-ASSET-SCAN-RISK-001: 权限映射", () => {

    test("llm_api → L7", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("llm_api")];
        const endpoints = [makeEndpoint("/api/tags", false)];
        const result = svc.buildResult("http://127.0.0.1:11434", makeContext(), matches, endpoints);

        assert.ok(result.max_privilege, "应有 max_privilege");
        assert.equal(result.max_privilege!.level, "L7");
        assert.equal(result.max_privilege!.score, 9);
    });

    test("agent_framework → L6", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("agent_framework")];
        const endpoints = [makeEndpoint("/api/v1/flows", false)];
        const result = svc.buildResult("http://127.0.0.1:3000", makeContext(), matches, endpoints);

        assert.ok(result.max_privilege);
        assert.equal(result.max_privilege!.level, "L6");
    });

    test("agent_application → L5", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("agent_application")];
        const endpoints = [makeEndpoint("/api/agent/status", false)];
        const result = svc.buildResult("http://127.0.0.1:8000", makeContext(), matches, endpoints);

        assert.ok(result.max_privilege);
        assert.equal(result.max_privilege!.level, "L5");
    });
});

describe("REQ-ASSET-SCAN-RISK-001: 复合风险评分", () => {

    test("llm_api 暴露 → overall_risk_score >= 75 (critical)", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("llm_api")];
        const endpoints = [makeEndpoint("/api/tags", false)];
        const result = svc.buildResult("http://127.0.0.1:11434", makeContext(), matches, endpoints);

        assert.ok(result.overall_risk_score! >= 75, `overall_risk_score 应 >= 75, 实际 ${result.overall_risk_score}`);
        assert.equal(result.overall_risk_level, "critical");
    });

    test("无 findings → overall_risk_score 为 0", () => {
        const svc = makeClassificationService();
        const matches: FingerprintMatchItem[] = [];
        const endpoints: EndpointInfo[] = [];
        const result = svc.buildResult("http://127.0.0.1:80", makeContext(), matches, endpoints);

        assert.equal(result.overall_risk_score, 0);
    });

    test("每个 finding 都有 composite_risk_score", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("llm_api")];
        const endpoints = [makeEndpoint("/api/tags", false)];
        const result = svc.buildResult("http://127.0.0.1:11434", makeContext(), matches, endpoints);

        for (const finding of result.findings!) {
            assert.ok(
                typeof finding.composite_risk_score === "number",
                `finding "${finding.title}" 应有 composite_risk_score`
            );
            assert.ok(finding.composite_risk_score! >= 0 && finding.composite_risk_score! <= 100);
        }
    });

    test("每个 finding 都有 risk_dimensions 五维分数", () => {
        const svc = makeClassificationService();
        const matches = [makeTopMatch("llm_api")];
        const endpoints = [makeEndpoint("/api/tags", false)];
        const result = svc.buildResult("http://127.0.0.1:11434", makeContext(), matches, endpoints);

        for (const finding of result.findings!) {
            assert.ok(finding.risk_dimensions, `finding "${finding.title}" 应有 risk_dimensions`);
            assert.ok(typeof finding.risk_dimensions!.exposure === "number");
            assert.ok(typeof finding.risk_dimensions!.exploitability === "number");
            assert.ok(typeof finding.risk_dimensions!.privilege_impact === "number");
            assert.ok(typeof finding.risk_dimensions!.path_reachability === "number");
            assert.ok(typeof finding.risk_dimensions!.control_gap === "number");
        }
    });
});
