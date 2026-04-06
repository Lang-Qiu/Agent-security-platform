// 引擎入口（给 backend 用）

import { loadFingerprints } from "./loader";
import { scoreFingerprint, classify } from "./core/scorer";
import { httpProbe } from "./probe/httpProbe";

export async function runAssetScan(target: string) {
    // 加载规则
    const { fingerprints, confidence_policy } = loadFingerprints();

    const probes = [];

    // 最小探测（示例：Ollama）
    const httpRes = await httpProbe(target, 11434, "/api/tags");
    if (httpRes) probes.push(httpRes);

    const results = [];

    for (const fp of fingerprints) {
        const { score, matched } = scoreFingerprint(fp, probes);
        const cls = classify(score, confidence_policy);

        if (cls !== "unknown") {
        results.push({
            targetId: fp.target_id,
            score,
            confidence: cls,
            matchedSignals: matched,
        });
        }
    }

    return {
    task_id: "mock-task-id",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "finished",
    risk_level: "low",  // 占位
    summary: "Asset scan completed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
        target: {
        value: target
        },
        fingerprint: {
        detected_products: results
        },
        confidence: Math.max(...results.map(r => r.score), 0),
        matched_features: results.flatMap(r => r.matchedSignals),
        open_ports: probes.map(p => p.port),
        http_endpoints: probes.map(p => p.path),
    }
    };
}