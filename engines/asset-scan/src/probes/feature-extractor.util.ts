// 通用特征提取器

import type { ExtractedFeature, FeatureType } from "../../../../shared/types/asset-scan.ts";

// TODO:ask if reqPath is needed
export function extractFeaturesFromPayload(
    extractors: any[],
    status: number,
    headers: Record<string, string>,
    body: string,
    reqPath: string = "" // 请求路径 
): ExtractedFeature[] {
    const results: ExtractedFeature[] = [];
    if (!extractors || !Array.isArray(extractors)) return results;

    let parsedJson: any = null;
    try { parsedJson = JSON.parse(body); } catch { /* ignore */ }

    for (const ext of extractors) {
        const type = ext.feature_type as FeatureType;
        
        if (type === "http_status" && status.toString() === ext.extract_value) {
            results.push({ feature_type: type, value: status.toString(), confidence: 1.0 });
        } 
        else if (type === "json_key" && parsedJson && ext.extract_key in parsedJson) {
            results.push({ feature_type: type, key: ext.extract_key, value: "true", confidence: 1.0 });
        }
        else if ((type === "http_body" || type === "ws_message") && ext.extract_key === "contains") {
            if (body.includes(ext.extract_value)) {
                results.push({ feature_type: type, value: ext.extract_value, confidence: 0.95 });
            }
        }
        // TODO：支持提取 api_path 特征, 是否需要
        else if (type === "api_path") {
            if (ext.extract_key === "equals" && reqPath === ext.extract_value) {
                results.push({ feature_type: type, value: reqPath, confidence: 1.0 });
            } else if (ext.extract_key === "contains" && reqPath.includes(ext.extract_value)) {
                results.push({ feature_type: type, value: ext.extract_value, confidence: 1.0 });
            }
        }
    }
    
    return results;
}