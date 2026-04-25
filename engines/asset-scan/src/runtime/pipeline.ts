// 负责解析受控目标的 URL，将应用层输入“降维”模拟成网络层的 ScanContext 供下游消费

import { resolve } from "node:path";
import type { ScanContext, AssetScanResult, Protocol } from "../../../../shared/types/asset-scan.ts";
import { ProbeService } from "./asset-probe.service.ts";
import { FingerprintService } from "./asset-fingerprint.service.ts";
import { ClassificationService } from "./classification.service.ts";

export class AssetScanPipeline {
    private probeService: ProbeService;
    private fingerprintService: FingerprintService;
    private classificationService: ClassificationService;

    constructor(workspaceRoot: string) {
        const probeRules = resolve(workspaceRoot, "engines/asset-scan/rules/probes.v2.yaml");
        const fingerprintRules = resolve(workspaceRoot, "engines/asset-scan/rules/fingerprints.v2.yaml");

        this.probeService = new ProbeService(probeRules);
        this.fingerprintService = new FingerprintService(fingerprintRules);
        this.classificationService = new ClassificationService();
    }

    // 返回 Partial<AssetScanResult>，由外层 run-task 补齐 task_id 等任务调度属性
    public async run(targetUrl: string): Promise<Partial<AssetScanResult>> {
        
        // ==========================================
        // 【Mocking】模拟 Step 1 ~ 3 的执行结果(真实的DNS解析和端口扫描)
        // ==========================================
        const parsedUrl = new URL(targetUrl);
        const hostname = parsedUrl.hostname;

        let ip = hostname;
        let domain: string | undefined = undefined;

        // 根据受控测试目标模拟 DNS 资产发现 (Step 1)
        if (hostname === "localhost") {
            ip = "127.0.0.1";
            domain = "localhost";
        } else if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname)) {
            // 如果是域名（如 test.example.com），在没有真实 DNS 解析的情况下，mock 一个受控 IP
            ip = "127.0.0.1"; 
            domain = hostname;
        }

        // 确定端口号：优先使用URL指定的端口，否则根据协议默认端口
        const port = parsedUrl.port ? Number(parsedUrl.port) : (parsedUrl.protocol === "https:" ? 443 : 80);
        const protocol = parsedUrl.protocol.replace(':', '') as Protocol;

        // 构造严谨的、基于 IP 的 ScanContext
        const context: ScanContext = {
            ip: ip,                               // e.g., 127.0.0.1
            domain: domain,                       // e.g., demo-agent.example.com (可选)
            discoveredPorts: [port],              // e.g., [11434]
            identifiedProtocols: {                // e.g., { 11434: "http" }
                [port]: protocol
            }
        };

        // ==========================================
        // Step 4: 执行探针并收集特征
        // ==========================================
        const featureData = await this.probeService.execute(context);

        // 开放端口记录转换为 FeatureData，供指纹匹配规则使用
        for (const p of context.discoveredPorts) {
            featureData.features.push({ feature_type: "open_port", value: String(p), confidence: 1.0 });
        }

        // =======================  添加调试代码  =======================
        console.error(`\n[Debug] Features Extracted:`);
        console.error(JSON.stringify(featureData.features, null, 2));
        // =======================  添加调试代码  =======================

        // ==========================================
        // Step 5: 指纹判定
        // ==========================================
        const matches = this.fingerprintService.evaluate(featureData);

        // ==========================================
        // Step 6: 资产归类与风险标签
        // ==========================================
        // 将原始输入URL与解析后的上下文一并传入，用于最终展示拼接
        return this.classificationService.buildResult(targetUrl, context, matches, featureData.endpoints);
    }
}