// 协议处理器接口
// 每个具体协议的处理类都必须实现这个接口，向外屏蔽底层的网络通信细节。

import type { ExtractedFeature, EndpointInfo } from "../../../../shared/types/asset-scan.ts";

export interface ProbeExecutionResult {
    matched: boolean;
    features: ExtractedFeature[];
    endpoints?: EndpointInfo[];
}

export interface IProtocolHandler {
    /**
     * 执行具体协议的探测任务
     * @param ip 目标IP
     * @param domain 目标域名 (可选)
     * @param port 目标端口
     * @param baseProtocol 基础协议 (如 http, https)
     * @param probe YAML中定义的单个探针规则
     */
    execute(ip: string, domain: string | undefined, port: number, baseProtocol: string, probe: any): Promise<ProbeExecutionResult>;
}