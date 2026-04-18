import { parse } from "yaml";
import { readFileSync } from "node:fs";
import type { FeatureData, FingerprintMatchItem, ExtractedFeature, MatchOperator } from "../../../../shared/types/asset-scan.ts";

export class FingerprintService {
    private fingerprintRules: any;

    constructor(rulesPath: string) {
        this.fingerprintRules = parse(readFileSync(rulesPath, "utf8"));
    }

    public evaluate(featureData: FeatureData): FingerprintMatchItem[] {
        const matches: FingerprintMatchItem[] = [];

        for (const rule of this.fingerprintRules.fingerprints) {
            const evidence: ExtractedFeature[] = [];
            let score = 0;

            for (const signal of rule.signals) {
                const matchedFeature = featureData.features.find(f => this.isSignalMatch(signal, f));
                if (matchedFeature) {
                    score += signal.weight;
                    evidence.push(matchedFeature);
                }
            }

            const confidence = Math.max(0, Math.min(1, Number(score.toFixed(2))));
            const threshold = rule.confidence_override?.medium_threshold ?? this.fingerprintRules.confidence_policy.suspected_threshold;

            // =======================  添加调试代码  =======================
            console.error(`\n[Debug] Evaluating Fingerprint: ${rule.target_id}`);
            console.error(`[Debug] -> Target: ${rule.target_id}, Score Calculated: ${score}, Confidence: ${confidence}, Threshold needed: ${threshold}`);
            console.error(`[Debug] -> Matched Evidence:`, JSON.stringify(evidence));
            // =======================  添加调试代码  =======================

            
            if (confidence >= threshold) {
                matches.push({
                    fingerprint_name: rule.target_id,
                    category: rule.category,
                    confidence,
                    matched_features: evidence.slice(0, 3), // 取Top3核心特征展示
                    inferred_attributes: rule.inferred_attributes,
                    evidence_chain: [{
                        rule_id: rule.fingerprint_id,
                        features: evidence,
                        score: confidence
                    }]
                });
            }
        }

        // 按置信度降序排序
        return matches.sort((a, b) => b.confidence - a.confidence);
    }

    private isSignalMatch(signal: any, feature: ExtractedFeature): boolean {
        if (signal.signal_type !== feature.feature_type) return false;

        const expected = signal.match_value;
        const operator = signal.match_operator as MatchOperator;

        switch (operator) {
            case "equals": return feature.value === String(expected);
            case "contains": return feature.value.includes(String(expected));
            case "has_key": return feature.key === expected;
            case "regex": return new RegExp(expected).test(feature.value);
            case "in": return Array.isArray(expected) && expected.includes(Number(feature.value));
            default: return false;
        }
    }
}