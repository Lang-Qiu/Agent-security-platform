import type { FingerprintMatchItem, EndpointInfo, Finding, AssetScanResult, ScanContext } from "../../../../shared/types/asset-scan.ts";

export class ClassificationService {
    
    public buildResult(
        originalTargetUrl: string, 
        context: ScanContext, 
        matches: FingerprintMatchItem[], 
        endpoints: EndpointInfo[]
    ): Partial<AssetScanResult> {
        /**
         * 构建最终扫描结果的核心方法
         * @param originalTargetUrl 原始URL
         * @param context 扫描上下文
         * @param matches 指纹匹配项
         * @param endpoints 端点信息
         */
        
        // 1. 组装分类指纹
        // 创建记录对象，key是类别，value是指纹数组
        const categorizedFingerprints: Record<string, Array<{ name: string; confidence: number }>> = {};
        let primaryAttributes = {};

        if (matches.length > 0) {
            primaryAttributes = matches[0].inferred_attributes || {}; // 提取第一置信度的推断属性
            
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
        // 这里的 context.discoveredPorts 起到了承上启下的作用
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

        // 3. 生成基础风险与漏洞发现
        const findings: Finding[] = this.inferFindings(matches, endpoints);

        // 4. 拼接最终 JSON 结构
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
            findings
        };
    }

    /**
     * 根据指纹与收集的端点推断基础业务风险
     * @param matches 指纹匹配项列表
     * @param endpoints HTTP端点信息列表
     * @returns 安全发现列表
     */
    private inferFindings(matches: FingerprintMatchItem[], endpoints: EndpointInfo[]): Finding[] {
        const findings: Finding[] = [];
        const topMatch = matches[0];

        if (!topMatch) return findings;

        // 风险推断策略 1: 发现大模型 API 开放且没有任何鉴权要求
        const isLocalLLM = topMatch.category === "llm_api" || topMatch.category === "agent_framework";
        
        // 过滤出真正处于无鉴权状态的接口
        const unauthEndpoints = endpoints.filter(e => !e.auth_required);

        if (isLocalLLM && unauthEndpoints.length > 0) {
            
            // 将探测到的敏感端点映射为 PDF 要求的 Evidence 结构
            const evidenceList = unauthEndpoints.map(e => ({
                type: "http_response",
                method: e.method,
                path: e.path,
                status_code: e.status_code
            }));

            findings.push({
                finding_id: `finding_${Date.now()}_001`,
                type: "exposed_api",            
                title: `${topMatch.fingerprint_name} API is publicly accessible without Auth`,
                risk_level: "high",             
                reason: `Detected an exposed interface of ${topMatch.fingerprint_name} without authentication, which could lead to unauthorized resource abuse.`,
                evidence: evidenceList,         // 记录具体的越权接口路径（如 GET /api/tags）作为确凿证据
                related_fingerprints: [topMatch.fingerprint_name],
                recommendation: "Restrict network access to trusted IP ranges (e.g., localhost) and enforce API Key authentication." // 给出具体修复建议
            });
        }

        return findings;
    }
}
