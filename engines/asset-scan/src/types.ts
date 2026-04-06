// 探测结果
export interface ProbeResult {
    port?: number;
    path?: string;
    status?: number;
    headers?: Record<string, string>;
    body?: string;
}

export interface SignalMatch {
    signalId: string;
    matched: boolean;
    weight: number;
}

// 识别结果
export interface DetectedProduct {
    targetId: string;
    score: number;
    confidence: "confirmed" | "suspected" | "unknown";
    matchedSignals: string[];
}
// 最终输出
export interface AssetScanResult {
    target: string;
    products: DetectedProduct[];
}