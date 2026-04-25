import type { IProtocolHandler, ProbeExecutionResult } from "./protocol-handler.interface.ts";
import { extractFeaturesFromPayload } from "./feature-extractor.util.ts";

export class WsHandler implements IProtocolHandler {
    async execute(ip: string, domain: string | undefined, port: number, baseProtocol: string, probe: any): Promise<ProbeExecutionResult> {
        // HTTP 也可以升级为 WS; WebSocket 连接不是独立建立的，而是通过 HTTP 请求来"升级"的
        if (!["ws", "wss", "http", "https"].includes(baseProtocol)) {
            return { matched: false, features: [] };
        }

        const wsProtocol = (baseProtocol === "https" || baseProtocol === "wss") ? "wss" : "ws";
        const path = probe.request.path || "/";
        const physicalUrl = `${wsProtocol}://${ip}:${port}${path}`;

        // WebSocket 连接建立
        const WSConstructor = (globalThis as unknown as { WebSocket?: any }).WebSocket;
        if (!WSConstructor) return { matched: false, features: [] };

        try {
            const { status, body } = await new Promise<{ status: number, body: string }>((resolve, reject) => {
                const ws = new WSConstructor(physicalUrl);
                const timer = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, probe.request.timeout_ms || 1500);

                // open 事件：发送探测 payload（如果配置了）, 即连接建立成功后，立即发送探测数据
                ws.addEventListener("open", () => {
                    if (probe.request.payload) ws.send(probe.request.payload);
                }, { once: true });

                // message 事件：接收响应，返回状态码 101 和消息体
                ws.addEventListener("message", (event: any) => {
                    clearTimeout(timer);
                    ws.close();
                    resolve({ status: 101, body: String(event.data || "") });
                }, { once: true });

                // error 事件：连接失败，拒绝 Promise
                ws.addEventListener("error", () => {
                    clearTimeout(timer);
                    ws.close();
                    reject(new Error("ws error"));
                }, { once: true });
            });

            const extracted = extractFeaturesFromPayload(probe.feature_extractors, status, {}, body, path);
            
            if (extracted.length > 0) {
                return { matched: true, features: extracted };
            }
        } catch (e) { /* ignore */ }

        return { matched: false, features: [] };
    }
}