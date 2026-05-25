import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as tlsConnect } from "node:tls";

import type { PortProtocol, Protocol, ProtocolInfo, ProtocolInput, ServiceType, TlsInfo } from "../../../../shared/types/asset-scan.ts";

interface ProtocolInspectionResult {
    protocol: Protocol;
    subprotocol?: string;
    service: ServiceType | string;
    tls?: TlsInfo;
    confidence: number;
}

interface ProtocolIdentificationServiceOptions {
    inspect?: (input: { ip: string; port: number; domain?: string }) => Promise<ProtocolInspectionResult>;
}

export class ProtocolIdentificationService {
    private readonly inspect: (input: { ip: string; port: number; domain?: string }) => Promise<ProtocolInspectionResult>;

    constructor(options?: ProtocolIdentificationServiceOptions) {
        this.inspect = options?.inspect ?? this.defaultInspect.bind(this);
    }

    async identify(input: ProtocolInput): Promise<ProtocolInfo> {
        const portProtocols: PortProtocol[] = [];
        const confidenceScores: number[] = [];

        for (const port of input.ports) {
            const inspected = await this.inspect({
                ip: input.ip,
                port,
                domain: input.domain
            });

            confidenceScores.push(inspected.confidence);
            portProtocols.push({
                port,
                protocol: inspected.protocol,
                subprotocol: inspected.subprotocol,
                service: inspected.service,
                ...(inspected.tls ? { tls: inspected.tls } : {})
            });
        }

        const confidence = confidenceScores.length === 0
            ? 0
            : Math.round(((confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length) + Number.EPSILON) * 100) / 100;

        return {
            ip: input.ip,
            port_protocols: portProtocols,
            confidence
        };
    }

    private async defaultInspect(input: { ip: string; port: number; domain?: string }): Promise<ProtocolInspectionResult> {
        const tlsProbe = await this.tryTls(input);
        if (tlsProbe) {
            return tlsProbe;
        }

        const httpProbe = await this.tryHttp(input);
        if (httpProbe) {
            return httpProbe;
        }

        if (input.port === 50051) {
            return {
                protocol: "grpc",
                subprotocol: "grpc",
                service: "unknown",
                confidence: 0.7
            };
        }

        return {
            protocol: "tcp",
            service: "unknown",
            confidence: 0.4
        };
    }

    private tryTls(input: { ip: string; port: number; domain?: string }): Promise<ProtocolInspectionResult | null> {
        return new Promise((resolve) => {
            const socket = tlsConnect({
                host: input.ip,
                port: input.port,
                servername: input.domain ?? input.ip,
                ALPNProtocols: ["h2", "http/1.1"],
                rejectUnauthorized: false
            });

            const finalize = (result: ProtocolInspectionResult | null) => {
                socket.destroy();
                resolve(result);
            };

            socket.setTimeout(700, () => finalize(null));
            socket.once("error", () => finalize(null));
            socket.once("secureConnect", () => {
                const alpn = socket.alpnProtocol && socket.alpnProtocol !== false ? [socket.alpnProtocol] : ["http/1.1"];
                const tlsVersion = socket.getProtocol() ?? "TLS";
                const service = this.normalizeService(socket.getPeerCertificate()?.subject?.O ?? "");

                finalize({
                    protocol: "https",
                    subprotocol: alpn[0] ?? "http/1.1",
                    service,
                    tls: {
                        version: tlsVersion,
                        alpn
                    },
                    confidence: 0.85
                });
            });
        });
    }

    private async tryHttp(input: { ip: string; port: number; domain?: string }): Promise<ProtocolInspectionResult | null> {
        const response = await this.requestHead(httpRequest, input);
        if (!response) {
            return null;
        }

        return {
            protocol: "http",
            subprotocol: response.version === "2.0" ? "h2" : "http/1.1",
            service: this.normalizeService(response.server),
            confidence: 0.8
        };
    }

    private requestHead(
        client: typeof httpRequest | typeof httpsRequest,
        input: { ip: string; port: number; domain?: string }
    ): Promise<{ version: string; server: string } | null> {
        return new Promise((resolve) => {
            const request = client({
                host: input.ip,
                port: input.port,
                method: "HEAD",
                path: "/",
                timeout: 700,
                rejectUnauthorized: false,
                headers: input.domain ? { Host: input.domain } : undefined
            }, (response) => {
                resolve({
                    version: response.httpVersion,
                    server: String(response.headers.server ?? "")
                });
                response.resume();
            });

            request.once("timeout", () => {
                request.destroy();
                resolve(null);
            });
            request.once("error", () => resolve(null));
            request.end();
        });
    }

    private normalizeService(value: string): ServiceType | "unknown" {
        const service = value.toLowerCase();
        if (service.includes("uvicorn")) return "uvicorn";
        if (service.includes("gunicorn")) return "gunicorn";
        if (service.includes("nginx")) return "nginx";
        if (service.includes("apache")) return "apache";
        if (service.includes("node")) return "nodejs";
        if (service.includes("ollama")) return "ollama";
        return "unknown";
    }
}
