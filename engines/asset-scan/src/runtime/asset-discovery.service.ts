import type { Asset, DiscoveryInput } from "../../../../shared/types/asset-scan.ts";

interface OrganizationLookupResult {
    domain?: string;
    ip: string;
    source: string[];
}

interface AssetDiscoveryServiceOptions {
    dnsLookup?: (host: string) => Promise<string[]>;
    organizationLookup?: (keyword: string) => Promise<OrganizationLookupResult[]>;
    now?: () => string;
}

const IPV4_PATTERN = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOSTNAME_PATTERN = /^(localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/i;

function isIpv4(value: string): boolean {
    return IPV4_PATTERN.test(value);
}

function isHostname(value: string): boolean {
    return HOSTNAME_PATTERN.test(value) && value.includes(".") || value === "localhost";
}

export class AssetDiscoveryService {
    private readonly dnsLookup: (host: string) => Promise<string[]>;
    private readonly organizationLookup: (keyword: string) => Promise<OrganizationLookupResult[]>;
    private readonly now: () => string;

    constructor(options?: AssetDiscoveryServiceOptions) {
        this.dnsLookup = options?.dnsLookup ?? this.defaultDnsLookup;
        this.organizationLookup = options?.organizationLookup ?? (async () => []);
        this.now = options?.now ?? (() => new Date().toISOString());
    }

    async discover(input: DiscoveryInput): Promise<Asset[]> {
        const merged = new Map<string, Omit<Asset, "asset_id">>();

        for (const rawSeed of input.seed) {
            const seed = rawSeed.trim();
            if (!seed) {
                continue;
            }

            if (isIpv4(seed)) {
                this.mergeAsset(merged, {
                    ip: seed,
                    source: ["seed"],
                    tags: ["candidate-agent"],
                    timestamp: this.now()
                });
                continue;
            }

            if (isHostname(seed)) {
                const addresses = await this.dnsLookup(seed);
                for (const ip of addresses) {
                    this.mergeAsset(merged, {
                        ip,
                        domain: seed,
                        source: ["dns"],
                        tags: ["candidate-agent"],
                        timestamp: this.now()
                    });
                }
                continue;
            }

            const organizationAssets = await this.organizationLookup(seed);
            for (const asset of organizationAssets) {
                this.mergeAsset(merged, {
                    ip: asset.ip,
                    domain: asset.domain,
                    source: asset.source,
                    tags: ["candidate-agent"],
                    timestamp: this.now()
                });
            }
        }

        return Array.from(merged.values()).map((asset, index) => ({
            asset_id: `asset_${String(index + 1).padStart(3, "0")}`,
            ...asset
        }));
    }

    private mergeAsset(assets: Map<string, Omit<Asset, "asset_id">>, candidate: Omit<Asset, "asset_id">): void {
        const existing = assets.get(candidate.ip);
        if (!existing) {
            assets.set(candidate.ip, {
                ...candidate,
                source: [...candidate.source],
                tags: [...candidate.tags]
            });
            return;
        }

        existing.domain ??= candidate.domain;
        existing.source = this.mergeUnique(existing.source, candidate.source);
        existing.tags = this.mergeUnique(existing.tags, candidate.tags);
    }

    private mergeUnique(current: string[], incoming: string[]): string[] {
        return Array.from(new Set([...current, ...incoming]));
    }

    private async defaultDnsLookup(host: string): Promise<string[]> {
        if (host === "localhost") {
            return ["127.0.0.1"];
        }

        const dns = await import("node:dns/promises");
        try {
            return await dns.resolve4(host);
        } catch {
            return [];
        }
    }
}
