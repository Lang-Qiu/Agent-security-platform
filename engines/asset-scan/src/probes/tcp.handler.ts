// 端口探测

import type { IProtocolHandler, ProbeExecutionResult } from "./protocol-handler.interface.ts";

export class TcpHandler implements IProtocolHandler {
    async execute(ip: string, domain: string | undefined, port: number, baseProtocol: string, probe: any): Promise<ProbeExecutionResult> {
        // 因为能进入到这里，说明 ScanContext 已经确认这个端口是开放的
        // TCP 探针在引擎侧只需要直接记录特征即可。
        return {
            matched: true,
            features: [
                { feature_type: "open_port", value: String(port), confidence: 1.0 }
            ]
        };
    }
}