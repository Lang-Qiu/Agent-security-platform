// 打分

import { matchSignal } from "./matcher";

export function scoreFingerprint(fp: any, probes: any[]) {
    let score = 0;
    const matched: string[] = [];

    for (const sig of fp.signals) {
        const hit = probes.some(p => matchSignal(sig, p));

        if (hit) {
        score += sig.weight;
        matched.push(sig.signal_id); // 记录命中的信号
        }
    }

    return { score, matched };
    }

    export function classify(score: number, policy: any) {
    if (score >= policy.direct_output_threshold) return "confirmed";
    if (score >= policy.suspected_threshold) return "suspected";
    return "unknown";
}