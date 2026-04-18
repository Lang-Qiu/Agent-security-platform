import { parse } from "yaml";
import { readFileSync } from "node:fs";

// 引入公共契约
import type { ScanContext, FeatureData } from "../../../../shared/types/asset-scan.ts";

// 引入协议处理相关的策略接口与具体实现
import type { IProtocolHandler } from "../probes/protocol-handler.interface.ts";
import { HttpHandler } from "../probes/http.handler.ts";
import { WsHandler } from "../probes/ws.handler.ts";
import { TcpHandler } from "../probes/tcp.handler.ts";

export class ProbeService {
    private probeRules: any;
    // 使用 Record 存储协议类型与处理策略的映射关系
    private handlers: Record<string, IProtocolHandler>;

    constructor(rulesPath: string) {
        // 解析 YAML 规则配置
        const fileContent = readFileSync(rulesPath, "utf8");
        this.probeRules = parse(fileContent);
        
        // 注册具体协议的探测处理器
        this.handlers = {
            "http": new HttpHandler(),
            "ws": new WsHandler(),
            "tcp": new TcpHandler()
        };
    }

    /**
     * 执行指纹特征采集流水线 (Step 4)
     * @param context 包含目标 IP、域名和开放端口等前置信息的上下文
     * @returns 结构化的特征数据 FeatureData
     */
    public async execute(context: ScanContext): Promise<FeatureData> {
        const featureData: FeatureData = { features: [], endpoints: [], probe_hits: [] };
        
        // 获取所有启用的探针规则
        const activeProbes = this.probeRules.probes?.filter((p: any) => p.enabled) || [];

        // 记录探针命中状态的追踪器
        // 作用：避免同一个探针在多个端口执行时产生多条相同的命中记录
        const probeHitTracker = new Map<string, boolean>();
        for (const probe of activeProbes) {
            probeHitTracker.set(probe.probe_id, false);
        }

        // 遍历所有在 Step 2 发现的开放端口
        for (const port of context.discoveredPorts) {
            // 获取 Step 3 识别出的基础协议 (如果未识别，默认为 http)
            const baseProtocol = context.identifiedProtocols[port] || "http";

            for (const probe of activeProbes) {
                // 端口约束检查：如果探针规则限制了特定端口，且当前端口不匹配，则跳过
                if (probe.request?.ports && Array.isArray(probe.request.ports) && !probe.request.ports.includes(port)) {
                    continue;
                }

                // 获取探针期望的协议并匹配对应的处理器
                const probeProtocol = probe.request?.protocol || "http";
                const handler = this.handlers[probeProtocol];
                
                if (!handler) {
                    console.warn(`[ProbeService] 未知或未注册的探针协议处理器: ${probeProtocol}`);
                    continue;
                }

                // 将发包与解析动作委托给具体的 Handler 执行
                // Handler 内部会决定如何利用 IP、域名和 baseProtocol 构建真实的物理请求
                const result = await handler.execute(context.ip, context.domain, port, baseProtocol, probe);

                // 汇总特征和端点信息
                if (result.matched) {
                    featureData.features.push(...result.features);
                    
                    if (result.endpoints && result.endpoints.length > 0) {
                        featureData.endpoints.push(...result.endpoints);
                    }
                    
                    // 将该探针标记为命中
                    probeHitTracker.set(probe.probe_id, true);
                }
            }
        }

        // 格式化组装所有的探针执行情况，输出给后续流水线
        for (const [probeId, matched] of probeHitTracker.entries()) {
            featureData.probe_hits.push({ 
                probe_id: probeId, 
                matched: matched, 
                score: matched ? 1.0 : 0.0 
            });
        }

        return featureData;
    }
}