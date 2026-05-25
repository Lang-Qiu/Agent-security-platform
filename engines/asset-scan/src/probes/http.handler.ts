import type { IProtocolHandler, ProbeExecutionResult } from "./protocol-handler.interface.ts";
import { extractFeaturesFromPayload } from "./feature-extractor.util.ts";

export class HttpHandler implements IProtocolHandler {
    async execute(ip: string, domain: string | undefined, port: number, baseProtocol: string, probe: any): Promise<ProbeExecutionResult> {
        if (baseProtocol !== "http" && baseProtocol !== "https") {
            return { matched: false, features: [] };
        }

        const path = probe.request.path || "/";
        const physicalUrl = `${baseProtocol}://${ip}:${port}${path}`;
        const headers: Record<string, string> = domain ? { Host: domain } : {};

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), probe.request.timeout_ms || 1200);

            const response = await fetch(physicalUrl, {
                method: probe.request.method,
                headers,
                signal: controller.signal
            });
            clearTimeout(timer);

            const body = probe.request.method === "HEAD" ? "" : await response.text();
            const responseHeaders = Object.fromEntries(response.headers.entries());
            const extracted = extractFeaturesFromPayload(
                probe.feature_extractors,
                response.status,
                responseHeaders,
                body,
                path
            );

            if (extracted.length > 0) {
                return {
                    matched: true,
                    features: extracted,
                    endpoints: [{
                        method: probe.request.method,
                        path,
                        status_code: response.status,
                        auth_required: response.status === 401 || response.status === 403
                    }]
                };
            }
        } catch {
        }

        return { matched: false, features: [] };
    }
}
