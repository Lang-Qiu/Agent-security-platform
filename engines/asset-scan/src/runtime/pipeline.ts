import { resolve } from "node:path";

import type {
    Asset,
    AssetScanResult,
    DiscoveryInput,
    FeatureData,
    FingerprintMatchItem,
    Finding,
    PortInfo,
    ProtocolInfo,
    ScanContext
} from "../../../../shared/types/asset-scan.ts";
import type { ScannerRunner } from "../scanners/runner.ts";
import { ProbeService } from "./asset-probe.service.ts";
import { FingerprintService } from "./asset-fingerprint.service.ts";
import { ClassificationService } from "./classification.service.ts";
import { AssetDiscoveryService } from "./asset-discovery.service.ts";
import { PortScanService } from "./port-scan.service.ts";
import { ProtocolIdentificationService } from "./protocol-identification.service.ts";

type DiscoveryServiceLike = {
    discover: (input: DiscoveryInput) => Promise<Asset[]>;
};

type PortScanServiceLike = {
    scan: (input: { ip: string; ports?: number[] }) => Promise<PortInfo>;
};

type ProtocolIdentificationServiceLike = {
    identify: (input: { ip: string; ports: number[]; domain?: string }) => Promise<ProtocolInfo>;
};

type ProbeServiceLike = {
    execute: (context: ScanContext) => Promise<FeatureData>;
};

type FingerprintServiceLike = {
    evaluate: (featureData: FeatureData) => FingerprintMatchItem[];
};

type ClassificationServiceLike = {
    buildResult: (
        originalTargetUrl: string,
        context: ScanContext,
        matches: FingerprintMatchItem[],
        endpoints: FeatureData["endpoints"],
        features?: FeatureData["features"]
    ) => Partial<AssetScanResult>;
};

export interface AssetScanPipelineDependencies {
    discoveryService: DiscoveryServiceLike;
    portScanService: PortScanServiceLike;
    protocolIdentificationService: ProtocolIdentificationServiceLike;
    probeService: ProbeServiceLike;
    fingerprintService: FingerprintServiceLike;
    classificationService: ClassificationServiceLike;
    scannerRunner?: ScannerRunner;
}

export interface AssetScanPipelineRunOptions {
    discoveryInput?: DiscoveryInput;
    candidatePorts?: number[];
}

export class AssetScanPipeline {
    private readonly discoveryService: DiscoveryServiceLike;
    private readonly portScanService: PortScanServiceLike;
    private readonly protocolIdentificationService: ProtocolIdentificationServiceLike;
    private readonly probeService: ProbeServiceLike;
    private readonly fingerprintService: FingerprintServiceLike;
    private readonly classificationService: ClassificationServiceLike;
    private readonly scannerRunner?: ScannerRunner;

    constructor(workspaceRoot: string, dependencies?: Partial<AssetScanPipelineDependencies>) {
        const probeRules = resolve(workspaceRoot, "engines/asset-scan/rules/probes.v2.yaml");
        const fingerprintRules = resolve(workspaceRoot, "engines/asset-scan/rules/fingerprints.v2.yaml");
        const riskRules = resolve(workspaceRoot, "engines/asset-scan/rules/risk-rules.v1.yaml");

        this.discoveryService = dependencies?.discoveryService ?? new AssetDiscoveryService();
        this.portScanService = dependencies?.portScanService ?? new PortScanService();
        this.protocolIdentificationService = dependencies?.protocolIdentificationService ?? new ProtocolIdentificationService();
        this.probeService = dependencies?.probeService ?? new ProbeService(probeRules);
        this.fingerprintService = dependencies?.fingerprintService ?? new FingerprintService(fingerprintRules);
        this.classificationService = dependencies?.classificationService ?? new ClassificationService(riskRules);
        this.scannerRunner = dependencies?.scannerRunner;
    }

    public async run(targetUrl: string, options?: AssetScanPipelineRunOptions): Promise<Partial<AssetScanResult>> {
        const parsedUrl = new URL(targetUrl);
        const hostname = parsedUrl.hostname;
        const candidatePorts = this.buildCandidatePorts(parsedUrl, options?.candidatePorts);
        const discoveryInput = options?.discoveryInput ?? { seed: [hostname] };

        const assets = await this.discoveryService.discover(discoveryInput);
        const asset = this.selectAsset(assets, hostname);

        if (!asset) {
            throw new Error(`No candidate asset discovered for target ${targetUrl}`);
        }

        const portInfo = await this.portScanService.scan({
            ip: asset.ip,
            ports: candidatePorts
        });
        const openPorts = portInfo.ports.filter((item) => item.status === "open").map((item) => item.port);

        const protocolInfo = await this.protocolIdentificationService.identify({
            ip: asset.ip,
            domain: asset.domain,
            ports: openPorts
        });
        const hintedPort = parsedUrl.port
            ? Number(parsedUrl.port)
            : parsedUrl.protocol === "https:"
                ? 443
                : 80;
        const hintedProtocol = parsedUrl.protocol === "https:" ? "https" : "http";
        const normalizedPortProtocols = protocolInfo.port_protocols.map((item) => {
            if (item.port !== hintedPort || item.protocol !== "tcp") {
                return item;
            }

            return {
                ...item,
                protocol: hintedProtocol,
                service: item.service === "unknown" ? hintedProtocol : item.service
            };
        });

        const context: ScanContext = {
            ip: asset.ip,
            domain: asset.domain,
            asset,
            discoveredPorts: openPorts,
            identifiedProtocols: Object.fromEntries(
                normalizedPortProtocols.map((item) => [item.port, item.protocol])
            ),
            protocols: normalizedPortProtocols
        };

        const featureData = await this.probeService.execute(context);
        for (const port of context.discoveredPorts) {
            featureData.features.push({
                feature_type: "open_port",
                value: String(port),
                confidence: 1.0
            });
        }

        // === 阶段二：外部扫描器增强 ===
        let scannerMergedFindings: Finding[] = [];
        if (this.scannerRunner) {
            const scannerOutput = await this.scannerRunner.runAll(targetUrl, featureData, context);
            featureData.features.push(...scannerOutput.mergedFeatures);
            scannerMergedFindings = scannerOutput.mergedFindings;
        }

        const matches = this.fingerprintService.evaluate(featureData);
        const result = this.classificationService.buildResult(targetUrl, context, matches, featureData.endpoints, featureData.features);

        // 合并外部扫描器直接产出的 findings
        if (scannerMergedFindings.length > 0) {
            result.findings = [...(result.findings ?? []), ...scannerMergedFindings];
        }

        return result;
    }

    private selectAsset(assets: Asset[], hostname: string): Asset | undefined {
        return assets.find((candidate) => candidate.domain === hostname || candidate.ip === hostname) ?? assets[0];
    }

    private buildCandidatePorts(parsedUrl: URL, override?: number[]): number[] {
        const hintedPort = parsedUrl.port
            ? Number(parsedUrl.port)
            : parsedUrl.protocol === "https:"
                ? 443
                : 80;
        const configuredPorts = override ?? [hintedPort];

        return Array.from(new Set([...configuredPorts, hintedPort])).sort((a, b) => a - b);
    }
}
