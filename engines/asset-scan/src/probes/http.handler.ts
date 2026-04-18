// HTTP 探测，用于向目标主机发送 HTTP 请求并收集响应信息，供指纹识别引擎使用

import type { IProtocolHandler, ProbeExecutionResult } from "./protocol-handler.interface.ts";
import { extractFeaturesFromPayload } from "./feature-extractor.util.ts";

export class HttpHandler implements IProtocolHandler {
    async execute(ip: string, domain: string | undefined, port: number, baseProtocol: string, probe: any): Promise<ProbeExecutionResult> {
        // 如果基础协议不支持 HTTP/HTTPS，直接退出
        if (baseProtocol !== "http" && baseProtocol !== "https") {
            return { matched: false, features: [] };
        }

        const path = probe.request.path || "/";
        const physicalUrl = `${baseProtocol}://${ip}:${port}${path}`;
        const headers: Record<string, string> = domain ? { "Host": domain } : {};

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), probe.request.timeout_ms || 1200);
            
            const res = await fetch(physicalUrl, { method: probe.request.method, headers, signal: controller.signal });
            clearTimeout(timer);

            const body = probe.request.method === "HEAD" ? "" : await res.text();
            const resHeaders = Object.fromEntries(res.headers.entries());

            // =======================  添加调试代码  =======================
            console.error(`\n[Debug] Probe [${probe.probe_id}] Response Status: ${res.status}`);
            console.error(`[Debug] Probe [${probe.probe_id}] Response Body:`, body.substring(0, 200)); // 打印前200个字符
            // =======================  添加调试代码  =======================

            const extracted = extractFeaturesFromPayload(probe.feature_extractors, res.status, resHeaders, body, path);
            
            if (extracted.length > 0) {
                return {
                    matched: true,
                    features: extracted,
                    endpoints: [{
                        method: probe.request.method,
                        path: path,
                        status_code: res.status,
                        auth_required: res.status === 401 || res.status === 403
                    }]
                };
            }
        } catch (e) {
            // 网络超时或拒绝连接
        }

        return { matched: false, features: [] };
    }
}