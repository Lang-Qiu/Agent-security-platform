import { parse } from "yaml";
import { readFileSync } from "node:fs";

import type { ExtractedFeature, FeatureData, FingerprintMatchItem, MatchOperator } from "../../../../shared/types/asset-scan.ts";

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
                const matchedFeature = featureData.features.find((feature) => this.isSignalMatch(signal, feature));
                if (matchedFeature) {
                    score += signal.weight;
                    evidence.push(matchedFeature);
                }
            }

            const confidence = Math.max(0, Math.min(1, Number(score.toFixed(2))));
            const threshold = rule.confidence_override?.medium_threshold ?? this.fingerprintRules.confidence_policy.suspected_threshold;

            if (confidence >= threshold) {
                matches.push({
                    fingerprint_name: rule.target_id,
                    category: rule.category,
                    confidence,
                    matched_features: evidence.slice(0, 3),
                    inferred_attributes: rule.inferred_attributes,
                    evidence_chain: [{
                        rule_id: rule.fingerprint_id,
                        features: evidence,
                        score: confidence
                    }]
                });
            }
        }

        return matches.sort((left, right) => right.confidence - left.confidence);
    }

    private isSignalMatch(signal: any, feature: ExtractedFeature): boolean {
        if (signal.signal_type !== feature.feature_type) return false;

        const expected = signal.match_value;
        const operator = signal.match_operator as MatchOperator;

        switch (operator) {
            case "equals":
                return feature.value === String(expected);
            case "contains":
                return feature.value.includes(String(expected));
            case "has_key":
                return feature.key === expected;
            case "regex":
                return new RegExp(expected).test(feature.value);
            case "in":
                return Array.isArray(expected) && expected.includes(Number(feature.value));
            default:
                return false;
        }
    }
}
