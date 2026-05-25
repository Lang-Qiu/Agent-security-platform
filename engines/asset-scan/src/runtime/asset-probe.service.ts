import { parse } from "yaml";
import { readFileSync } from "node:fs";

import type { FeatureData, ScanContext } from "../../../../shared/types/asset-scan.ts";
import type { IProtocolHandler } from "../probes/protocol-handler.interface.ts";
import { HttpHandler } from "../probes/http.handler.ts";
import { WsHandler } from "../probes/ws.handler.ts";
import { TcpHandler } from "../probes/tcp.handler.ts";

export class ProbeService {
    private probeRules: any;
    private handlers: Record<string, IProtocolHandler>;

    constructor(rulesPath: string) {
        const fileContent = readFileSync(rulesPath, "utf8");
        this.probeRules = parse(fileContent);
        this.handlers = {
            http: new HttpHandler(),
            ws: new WsHandler(),
            tcp: new TcpHandler()
        };
    }

    public async execute(context: ScanContext): Promise<FeatureData> {
        const featureData: FeatureData = { features: [], endpoints: [], probe_hits: [] };
        const activeProbes = this.probeRules.probes?.filter((probe: any) => probe.enabled) || [];
        const probeHitTracker = new Map<string, boolean>();

        for (const probe of activeProbes) {
            probeHitTracker.set(probe.probe_id, false);
        }

        for (const port of context.discoveredPorts) {
            const baseProtocol = context.identifiedProtocols[port] || "http";

            for (const probe of activeProbes) {
                if (probe.request?.ports && Array.isArray(probe.request.ports) && !probe.request.ports.includes(port)) {
                    continue;
                }

                const probeProtocol = probe.request?.protocol || "http";
                const handler = this.handlers[probeProtocol];

                if (!handler) {
                    continue;
                }

                const result = await handler.execute(context.ip, context.domain, port, baseProtocol, probe);
                if (!result.matched) {
                    continue;
                }

                featureData.features.push(...result.features);
                if (result.endpoints && result.endpoints.length > 0) {
                    featureData.endpoints.push(...result.endpoints);
                }
                probeHitTracker.set(probe.probe_id, true);
            }
        }

        for (const [probeId, matched] of probeHitTracker.entries()) {
            featureData.probe_hits.push({
                probe_id: probeId,
                matched,
                score: matched ? 1.0 : 0.0
            });
        }

        return featureData;
    }
}
