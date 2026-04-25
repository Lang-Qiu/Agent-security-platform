import type { TaskStatus, RiskLevel, TaskTarget } from "./task.ts";

// --- 枚举类 ---
export type PortStatus = "open" | "closed" | "filtered" | "unknown";
export type ProbeType = "port_exposure" | "web_root" | "api_endpoint" | "rpc_service" | "stream_tunnel" | "metadata_fetch" | "auth_check" | "vulnerability";
export type Protocol = "http" | "https" | "tcp" | "udp" | "grpc" | "websocket";
export type SubProtocol = "http/1.1" | "h2" | "grpc" | "ws" | "wss";
export type ServiceType = "nginx" | "apache" | "uvicorn" | "gunicorn" | "nodejs" | "fastapi" | "flask" | "ollama" | "openclaw" | "mcp" | "unknown";
export type FeatureType = "http_header" | "http_body" | "http_status" | "api_path" | "response_time" | "tls_cert" | "banner" | "favicon_hash" | "html_title" | "cookie" | "js_variable" | "error_message" | "open_port" | "ws_message" | "json_key";
export type FingerprintCategory = "llm_api" | "agent_framework" | "web_framework" | "middleware" | "cloud_service" | "agent_gateway" | "mcp_server" | "agent_application";
export type ModelProvider = "openai" | "azure_openai" | "anthropic" | "google" | "local" | "unknown";
export type FrameworkType = "langchain" | "llamaindex" | "autogen" | "haystack" | "custom" | "unknown" | "langflow" | "autogpt" | "dify" | "anythingllm";
export type FindingType = "unauthorized_access" | "info_leak" | "misconfiguration" | "weak_auth" | "exposed_api";
export type MatchOperator = "equals" | "contains" | "regex" | "in" | "has_key";

// --- 运行时上下文抽象 (预留 Step 1~3 扩展点) ---
export interface ScanContext {
    ip: string;                  // 必须有
    domain?: string;             // 可选，如果存在，HTTP 请求应该携带 Host 头
    discoveredPorts: number[]; // Step 2 的输出预留位
    identifiedProtocols: Record<number, Protocol>; // Step 3 的输出预留位, 记录每个开放端口对应的基础协议
}

// --- Step 4 输出契约 ---
export interface ExtractedFeature {
    feature_type: FeatureType;
    key?: string;   // 特征键（可选），如header 名或匹配方式（contains等）
    value: string;  // 特征值，如uvicorn、choices、路径字符串等
    confidence: number;
}

export interface EndpointInfo {
    method: string; // HTTP 方法，如GET、POST
    path: string;   // API 路径，如/v1/chat/completions
    status_code: number;
    auth_required: boolean;
}

export interface FeatureData {
    features: ExtractedFeature[];
    endpoints: EndpointInfo[];
    probe_hits: Array<
        {
            probe_id: string;
            matched: boolean;
            score: number
        }>;
}

// --- Step 5 输出契约 ---
export interface InferredAttributes {
    service?: ServiceType;
    model_provider?: ModelProvider;
    framework?: FrameworkType;
    deployment_type?: string;
    exposure_type?: string;
}

// 仅包含一个条目
export interface FingerprintMatchItem {
    fingerprint_name: string;
    category: FingerprintCategory;
    confidence: number;
    matched_features: ExtractedFeature[];
    evidence_chain: Array<{ rule_id: string; features: ExtractedFeature[]; score: number }>;
    inferred_attributes?: InferredAttributes;
}

// --- Step 6 输出契约 ---
export interface FindingEvidence {
    type: string;        // e.g., "http_response"
    method?: string;     // e.g., "GET"
    path?: string;       // e.g., "/api/admin/config"
    status_code?: number;// e.g., 200
}

export interface Finding {
    finding_id: string;
    type: FindingType;
    title: string;
    risk_level: RiskLevel;
    reason: string;
    evidence: FindingEvidence[];    
    related_fingerprints: string[];
    recommendation: string;  
}

export interface AssetScanResult {
    result_id: string;
    task_id?: string;                  // 由 run-task 层补全
    task_type?: string;                // 由 run-task 层补全
    engine_type?: string;              // 由 run-task 层补全
    status: TaskStatus;              
    
    // PDF P8: target 是一个对象，而不是简单的 string
    target: TaskTarget;
    
    // PDF P9: asset 区块
    asset?: {
        ip: string;
        domain?: string;
        source: string[];
        timestamp: string;
    };
    
    // PDF P9: network 区块
    network?: {
        open_ports: Array<{
            port: number;
            protocol: string;
            service: string;
            status: string;
        }>;
        protocols: Array<any>;
    };
    
    // PDF P9-10: application 区块
    application: {
        http_endpoints: EndpointInfo[];
        auth: {
            auth_detected: boolean;
            auth_type: string;
        };
    };
    
    // PDF P10: fingerprints 区块
    fingerprints: Record<string, Array<{ name: string; confidence: number }>>;
    
    // PDF P10: inferred_attributes 区块
    inferred_attributes: InferredAttributes;
    
    // PDF P12: findings 区块
    findings: Finding[];
}