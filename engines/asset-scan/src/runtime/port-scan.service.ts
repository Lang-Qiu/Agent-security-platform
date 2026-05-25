import { Socket } from "node:net";

import type { PortInfo, PortScanInput, PortStatus } from "../../../../shared/types/asset-scan.ts";

interface PortScanServiceOptions {
    ports?: number[];
    connect?: (input: { ip: string; port: number; timeoutMs: number }) => Promise<PortStatus>;
    timeoutMs?: number;
}

const DEFAULT_PORTS = [80, 443, 50051];

export class PortScanService {
    private readonly ports: number[];
    private readonly connect: (input: { ip: string; port: number; timeoutMs: number }) => Promise<PortStatus>;
    private readonly timeoutMs: number;

    constructor(options?: PortScanServiceOptions) {
        this.ports = options?.ports ?? DEFAULT_PORTS;
        this.connect = options?.connect ?? this.defaultConnect;
        this.timeoutMs = options?.timeoutMs ?? 500;
    }

    async scan(input: PortScanInput): Promise<PortInfo> {
        const ports = this.normalizePorts(input.ports ?? this.ports);
        const results = await Promise.all(
            ports.map(async (port) => ({
                port,
                status: await this.connect({
                    ip: input.ip,
                    port,
                    timeoutMs: this.timeoutMs
                })
            }))
        );

        return {
            ip: input.ip,
            ports: results
        };
    }

    private normalizePorts(ports: number[]): number[] {
        return Array.from(new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port <= 65535))).sort((a, b) => a - b);
    }

    private defaultConnect(input: { ip: string; port: number; timeoutMs: number }): Promise<PortStatus> {
        return new Promise((resolve) => {
            const socket = new Socket();
            let settled = false;

            const finalize = (status: PortStatus) => {
                if (settled) {
                    return;
                }

                settled = true;
                socket.destroy();
                resolve(status);
            };

            socket.setTimeout(input.timeoutMs);
            socket.once("connect", () => finalize("open"));
            socket.once("timeout", () => finalize("filtered"));
            socket.once("error", (error: NodeJS.ErrnoException) => {
                if (error.code === "ECONNREFUSED") {
                    finalize("closed");
                    return;
                }

                finalize("filtered");
            });

            socket.connect(input.port, input.ip);
        });
    }
}
