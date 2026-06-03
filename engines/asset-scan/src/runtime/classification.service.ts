import { parse } from "yaml";
import { readFileSync } from "node:fs";

import type {
    FingerprintMatchItem,
    EndpointInfo,
    Finding,
    AssetScanResult,
    ScanContext,
    ExtractedFeature,
    ExposureAssessment,
    ExploitabilityAssessment,
    MaxPrivilegeAssessment,
    RiskDimensionScores,
    ExploitabilityStatus,
    FingerprintCategory
} from "../../../../shared/types/asset-scan.ts";

import type { RiskLevel } from "../../../../shared/types/task.ts";

interface RiskRule {
    rule_id: string;
    name: string;
    finding_type: string;
    conditions: {
        fingerprint_category_in?: string[];
        has_unauthenticated_endpoints?: boolean;
        feature_patterns?: Array<{
            feature_type: string;
            key_pattern?: string;
            key?: string;
            version_regex?: boolean;
            value_contains?: string;
            value_contains_any?: string[];
            value_equals?: string;
        }>;
        protocol_is?: string;
        path_matches_any?: string[];
        sensitive_paths?: string[];
    };
    risk_level: RiskLevel;
    exposure_score: number;
    exploitability_status: ExploitabilityStatus;
    control_gap_score: number;
    remediation: string[];
}

interface PrivilegeMapEntry {
    level: string;
    score: number;
    identity_scope: string;
    blast_radius: string;
}

export class ClassificationService {
    private readonly riskRules: any;

    constructor(riskRulesPath: string) {
        this.riskRules = parse(readFileSync(riskRulesPath, "utf8"));
    }

    public buildResult(
        originalTargetUrl: string,
        context: ScanContext,
        matches: FingerprintMatchItem[],
        endpoints: EndpointInfo[],
        features?: ExtractedFeature[]
    ): Partial<AssetScanResult> {
        // 1. 组装分类指纹
        const categorizedFingerprints: Record<string, Array<{ name: string; confidence: number }>> = {};
        let primaryAttributes = {};

        if (matches.length > 0) {
            primaryAttributes = matches[0].inferred_attributes || {};

            for (const match of matches) {
                if (!categorizedFingerprints[match.category]) {
                    categorizedFingerprints[match.category] = [];
                }
                categorizedFingerprints[match.category].push({
                    name: match.fingerprint_name,
                    confidence: match.confidence
                });
            }
        }

        // 2. 组装端口信息
        const openPorts = context.discoveredPorts.map((port) => {
            const protocolInfo = context.protocols.find((item) => item.port === port);

            return {
                port,
                protocol: "tcp" as const,
                service: protocolInfo?.service && protocolInfo.service !== "unknown"
                    ? protocolInfo.service
                    : context.identifiedProtocols[port] ?? "unknown",
                status: "open" as const
            };
        });

        // 3. 生成风险发现（YAML 驱动的多规则推断）
        const resolvedFeatures = features ?? [];
        const findings: Finding[] = this.evaluateRiskRules(matches, endpoints, resolvedFeatures, context);

        // 4. 计算全局风险指标
        const overallRiskScore = findings.reduce(
            (max, f) => Math.max(max, f.composite_risk_score ?? 0), 0
        );
        const overallRiskLevel = this.scoreToRiskLevel(overallRiskScore);
        const maxPrivilege = this.deriveMaxPrivilege(matches, findings);

        // 5. 拼接最终 JSON 结构
        return {
            target: {
                target_type: "url",
                target_value: originalTargetUrl
            },
            asset: {
                ip: context.ip,
                domain: context.domain ?? context.asset?.domain,
                source: context.asset?.source ?? ["engine_runtime"],
                timestamp: context.asset?.timestamp ?? new Date().toISOString()
            },
            network: {
                open_ports: openPorts,
                protocols: context.protocols
            },
            application: {
                http_endpoints: endpoints,
                auth: {
                    auth_detected: endpoints.some(e => e.auth_required),
                    auth_type: "unknown"
                }
            },
            fingerprints: categorizedFingerprints,
            inferred_attributes: primaryAttributes,
            findings,
            overall_risk_score: overallRiskScore,
            overall_risk_level: overallRiskLevel,
            max_privilege: maxPrivilege
        };
    }

    // ─────────────────────────────────────────────
    //  YAML 驱动的多规则推断引擎
    // ─────────────────────────────────────────────

    private evaluateRiskRules(
        matches: FingerprintMatchItem[],
        endpoints: EndpointInfo[],
        features: ExtractedFeature[],
        context: ScanContext
    ): Finding[] {
        const findings: Finding[] = [];
        const topMatch = matches[0];
        const rules: RiskRule[] = this.riskRules.rules ?? [];
        const unauthEndpoints = endpoints.filter(e => !e.auth_required);

        for (const rule of rules) {
            const matched = this.matchRule(rule, topMatch, unauthEndpoints, endpoints, features, context);
            if (!matched) continue;

            const finding = this.buildFinding(rule, topMatch, unauthEndpoints, features, context);
            if (finding) {
                findings.push(finding);
            }
        }

        return findings;
    }

    private matchRule(
        rule: RiskRule,
        topMatch: FingerprintMatchItem | undefined,
        unauthEndpoints: EndpointInfo[],
        allEndpoints: EndpointInfo[],
        features: ExtractedFeature[],
        context: ScanContext
    ): boolean {
        const cond = rule.conditions;

        // 条件 1: fingerprint_category_in
        if (cond.fingerprint_category_in) {
            if (!topMatch || !cond.fingerprint_category_in.includes(topMatch.category)) {
                return false;
            }
        }

        // 条件 2: has_unauthenticated_endpoints
        if (cond.has_unauthenticated_endpoints) {
            if (unauthEndpoints.length === 0) return false;

            // 如果同时指定了 sensitive_paths，只检查这些路径
            if (cond.sensitive_paths) {
                const sensitiveUnauth = unauthEndpoints.filter(e =>
                    cond.sensitive_paths!.some(sp => e.path.includes(sp))
                );
                if (sensitiveUnauth.length === 0) return false;
            }
        }

        // 条件 3: feature_patterns
        if (cond.feature_patterns) {
            const patternMatched = this.matchFeaturePatterns(cond.feature_patterns, features);
            if (!patternMatched) return false;
        }

        // 条件 4: protocol_is
        if (cond.protocol_is) {
            // 检查是否有端口使用了指定协议
            const hasProtocol = context.protocols.some(p => p.protocol === cond.protocol_is);
            if (!hasProtocol) return false;

            // 如果同时指定了 path_matches_any，检查是否有匹配的端点
            if (cond.path_matches_any) {
                const pathMatched = allEndpoints.some(e =>
                    cond.path_matches_any!.some(pattern => e.path.includes(pattern))
                );
                if (!pathMatched) return false;
            }
        }

        return true;
    }

    private matchFeaturePatterns(
        patterns: RiskRule["conditions"]["feature_patterns"],
        features: ExtractedFeature[]
    ): boolean {
        if (!patterns || patterns.length === 0) return true;

        // 任一 pattern 匹配即触发（OR 语义）
        return patterns.some(pattern => {
            return features.some(feature => {
                // 匹配 feature_type
                if (feature.feature_type !== pattern.feature_type) return false;

                // 匹配 key（用于 http_header 的 header 名称）
                if (pattern.key && feature.key !== pattern.key) return false;

                // 匹配 key_pattern（用于 Server/X-Powered-By 等 header）
                if (pattern.key_pattern && feature.key !== pattern.key_pattern) return false;

                // 版本号正则检测（数字.数字）
                if (pattern.version_regex) {
                    return /\d+\.\d+/.test(feature.value);
                }

                // 匹配 value_contains
                if (pattern.value_contains) {
                    return feature.value.toLowerCase().includes(pattern.value_contains.toLowerCase());
                }

                // 匹配 value_contains_any（任一子串匹配）
                if (pattern.value_contains_any) {
                    const lowerValue = feature.value.toLowerCase();
                    return pattern.value_contains_any.some(v => lowerValue.includes(v.toLowerCase()));
                }

                // 匹配 value_equals
                if (pattern.value_equals) {
                    return feature.value === pattern.value_equals;
                }

                // 如果只有 feature_type 没有其他约束，匹配该类型的任意 feature
                return true;
            });
        });
    }

    // ─────────────────────────────────────────────
    //  Finding 构建
    // ─────────────────────────────────────────────

    private buildFinding(
        rule: RiskRule,
        topMatch: FingerprintMatchItem | undefined,
        unauthEndpoints: EndpointInfo[],
        features: ExtractedFeature[],
        context: ScanContext
    ): Finding | null {
        const category = topMatch?.category as FingerprintCategory | undefined;
        const privilegeEntry = category ? this.riskRules.privilege_map?.[category] as PrivilegeMapEntry | undefined : undefined;

        // 构建证据列表
        const evidence = this.buildEvidence(rule, unauthEndpoints, features);

        // 构建暴露面评估
        const exposure: ExposureAssessment = {
            reachable_from: this.inferReachableFrom(context),
            auth_required: false,
            cross_boundary: false,
            notes: rule.name
        };

        // 构建可利用性评估
        const exploitability: ExploitabilityAssessment = {
            status: rule.exploitability_status,
            preconditions: this.inferPreconditions(rule, context),
            control_gaps: this.inferControlGaps(rule)
        };

        // 构建权限评估
        const maxPrivilege: MaxPrivilegeAssessment = privilegeEntry
            ? {
                level: privilegeEntry.level as MaxPrivilegeAssessment["level"],
                score: privilegeEntry.score,
                identity_scope: privilegeEntry.identity_scope,
                blast_radius: privilegeEntry.blast_radius
            }
            : { level: "L0", score: 0, identity_scope: "unknown", blast_radius: "无" };

        // 计算各维度分数
        const riskDimensions: RiskDimensionScores = {
            exposure: rule.exposure_score,
            exploitability: this.exploitabilityToScore(rule.exploitability_status),
            privilege_impact: maxPrivilege.score / 10,
            path_reachability: this.riskRules.path_reachability_default ?? 0.50,
            control_gap: rule.control_gap_score
        };

        // 计算复合风险评分
        const compositeScore = this.calculateCompositeScore(riskDimensions);

        return {
            finding_id: `finding_${Date.now()}_${rule.rule_id}`,
            type: rule.finding_type as Finding["type"],
            title: rule.name,
            risk_level: rule.risk_level,
            reason: this.buildReason(rule, topMatch),
            evidence,
            related_fingerprints: topMatch ? [topMatch.fingerprint_name] : [],
            recommendation: rule.remediation.join("；"),
            exposure,
            exploitability,
            max_privilege: maxPrivilege,
            risk_dimensions: riskDimensions,
            composite_risk_score: compositeScore
        };
    }

    private buildEvidence(
        rule: RiskRule,
        unauthEndpoints: EndpointInfo[],
        features: ExtractedFeature[]
    ): Finding["evidence"] {
        const evidence: Finding["evidence"] = [];

        // 从端点生成证据
        if (rule.conditions.has_unauthenticated_endpoints) {
            const targetEndpoints = rule.conditions.sensitive_paths
                ? unauthEndpoints.filter(e =>
                    rule.conditions.sensitive_paths!.some(sp => e.path.includes(sp))
                )
                : unauthEndpoints;

            for (const ep of targetEndpoints) {
                evidence.push({
                    type: "http_response",
                    method: ep.method,
                    path: ep.path,
                    status_code: ep.status_code
                });
            }
        }

        // 从特征模式生成证据
        if (rule.conditions.feature_patterns) {
            for (const pattern of rule.conditions.feature_patterns) {
                const matched = features.filter(f => {
                    if (f.feature_type !== pattern.feature_type) return false;
                    if (pattern.key && f.key !== pattern.key) return false;
                    if (pattern.key_pattern && f.key !== pattern.key_pattern) return false;
                    return true;
                });
                for (const f of matched) {
                    evidence.push({
                        type: f.feature_type,
                        path: f.key ? `${f.key}: ${f.value}` : f.value
                    });
                }
            }
        }

        return evidence;
    }

    private buildReason(rule: RiskRule, topMatch: FingerprintMatchItem | undefined): string {
        const name = topMatch?.fingerprint_name ?? "未知资产";
        return `检测到 ${name} 存在 ${rule.name} 风险：${rule.remediation[0] ?? "需要修复"}`;
    }

    private inferReachableFrom(context: ScanContext): string[] {
        // 基于协议和端口推断可达来源
        const sources: string[] = ["network"];
        const hasHttp = context.protocols.some(p => p.protocol === "http" || p.protocol === "https");
        if (hasHttp) sources.push("user_prompt");
        return sources;
    }

    private inferPreconditions(rule: RiskRule, context: ScanContext): string[] {
        const preconditions: string[] = [];
        if (rule.exploitability_status === "reproducible" || rule.exploitability_status === "deterministic") {
            preconditions.push("目标服务可达");
        }
        if (rule.conditions.has_unauthenticated_endpoints) {
            preconditions.push("无需认证凭据");
        }
        return preconditions;
    }

    private inferControlGaps(rule: RiskRule): string[] {
        const gaps: string[] = [];
        if (rule.control_gap_score >= 0.75) {
            gaps.push("缺少访问控制");
        }
        if (rule.control_gap_score >= 0.50) {
            gaps.push("安全配置不足");
        }
        return gaps;
    }

    // ─────────────────────────────────────────────
    //  复合评分计算
    // ─────────────────────────────────────────────

    private calculateCompositeScore(dimensions: RiskDimensionScores): number {
        const weights = this.riskRules.scoring_weights;
        if (!weights) return 0;

        const score = Math.round(100 * (
            weights.exposure * dimensions.exposure +
            weights.exploitability * dimensions.exploitability +
            weights.privilege_impact * dimensions.privilege_impact +
            weights.path_reachability * dimensions.path_reachability +
            weights.control_gap * dimensions.control_gap
        ));

        return Math.max(0, Math.min(100, score));
    }

    private exploitabilityToScore(status: ExploitabilityStatus): number {
        const map: Record<ExploitabilityStatus, number> = {
            deterministic: 1.0,
            reproducible: 0.75,
            plausible: 0.50,
            theoretical: 0.25,
            none: 0.00
        };
        return map[status] ?? 0;
    }

    private scoreToRiskLevel(score: number): RiskLevel {
        const thresholds = this.riskRules.risk_level_thresholds;
        if (!thresholds) return "info";
        if (score >= thresholds.critical) return "critical";
        if (score >= thresholds.high) return "high";
        if (score >= thresholds.medium) return "medium";
        return "low";
    }

    // ─────────────────────────────────────────────
    //  权限映射
    // ─────────────────────────────────────────────

    private deriveMaxPrivilege(
        matches: FingerprintMatchItem[],
        findings: Finding[]
    ): MaxPrivilegeAssessment | undefined {
        // 从 findings 中取最高权限
        let maxPriv: MaxPrivilegeAssessment | undefined;
        for (const finding of findings) {
            if (!finding.max_privilege) continue;
            if (!maxPriv || finding.max_privilege.score > maxPriv.score) {
                maxPriv = finding.max_privilege;
            }
        }

        // 如果 findings 中没有权限信息，从 top match 推断
        if (!maxPriv && matches.length > 0) {
            const topMatch = matches[0];
            const entry = this.riskRules.privilege_map?.[topMatch.category] as PrivilegeMapEntry | undefined;
            if (entry) {
                maxPriv = {
                    level: entry.level as MaxPrivilegeAssessment["level"],
                    score: entry.score,
                    identity_scope: entry.identity_scope,
                    blast_radius: entry.blast_radius
                };
            }
        }

        return maxPriv;
    }
}
