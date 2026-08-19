export const runtimeCheckpointOrder = ["resolve", "detect", "decide", "contain"] as const;

export type RuntimeCheckpoint = (typeof runtimeCheckpointOrder)[number];

export const runtimeScenario = {
  traceId: "runtime_interaction/trace-0142",
  eventType: "tool_invocation",
  actor: "agent://research-assistant",
  target: "tool://workspace/write",
  declaredScope: "workspace:read",
  requestedScope: "workspace:write",
  detectors: ["rule_detector", "local_model", "external_judge"],
  evidenceRefs: [
    "evidence_ref/identity-context",
    "evidence_ref/skill-provenance",
    "evidence_ref/tool-scope"
  ],
  policyProfile: "sandbox-security-balanced.v1",
  policyAction: "deny",
  containment: "active"
} as const;

export const landingRuntimeCopy = {
  sceneLabel: "Runtime security decision workspace",
  chromeLabel: "RUNTIME DECISION",
  illustrativeLabel: "ILLUSTRATIVE SEQUENCE",
  evaluationMode: "evaluation_mode: simulation",
  inputLabel: "Input event",
  resolverLabel: "Trust Resolver",
  detectorsLabel: "Independent evaluation",
  evidenceLabel: "Evidence convergence",
  policyLabel: "Policy Gate",
  outcomeZh: "一次工具调用从信任解析、独立检测到策略收敛的完整安全决策过程。",
  resolvedZh: "策略拒绝当前工具调用，并进入 containment 状态。"
} as const;

export interface LandingSectionCopy {
  readonly id: "discover" | "analyze" | "runtime" | "platform" | "architecture";
  readonly eyebrow: string;
  readonly headingEn: string;
  readonly bodyZh: string;
}

export interface LandingHeroEvidenceRow {
  readonly identifier: string;
  readonly label: string;
}

export interface LandingHeroDetectorRow {
  readonly identifier: string;
  readonly label: string;
}

export type AttackSurfaceEvidenceId =
  | "agent"
  | "framework"
  | "interface"
  | "skill"
  | "tool"
  | "exposure";

export interface LandingAttackSurfaceEvidence {
  readonly id: AttackSurfaceEvidenceId;
  readonly type: string;
  readonly identifier: string;
  readonly value: string;
  readonly definition: string;
}

export type SkillInspectionEvidenceId =
  | "manifest"
  | "dependency"
  | "permission"
  | "invocation"
  | "reason";

export interface LandingSkillInspectionEvidence {
  readonly id: SkillInspectionEvidenceId;
  readonly title: string;
  readonly identifier: string;
  readonly value: string;
  readonly definition: string;
}

export const landingNavigation = [
  { label: "Discover", href: "#discover" },
  { label: "Analyze", href: "#analyze" },
  { label: "Runtime", href: "#runtime" },
  { label: "Architecture", href: "#architecture" }
] as const;

export const landingHeroCopy = {
  eyebrow: "AGENT SECURITY PLATFORM",
  headingEn: "Secure every decision your agents make.",
  bodyZh:
    "从发现暴露面，到分析执行能力，再到运行时监管，为 Agent、Skills 与 Tool Interactions 建立一条可追溯的安全证据链。",
  primaryAction: "Launch Security Console",
  secondaryAction: "Explore the platform",
  microProof: "ASSET DISCOVERY / STATIC ANALYSIS / RUNTIME SECURITY"
} as const;

export const landingHeroAccessibleSummaryZh =
  "示意 Agent 安全评估：系统结合 Skill 与 Tool 上下文评估 Agent 输入，三条检测路径返回证据，运行时策略最终给出隔离决策。";

export const landingHeroEvidenceRows: readonly LandingHeroEvidenceRow[] = [
  { identifier: "identity_context", label: "Identity context" },
  { identifier: "skill_provenance", label: "Skill provenance" },
  { identifier: "tool_scope", label: "Tool scope" },
  { identifier: "prompt_context", label: "Prompt context" },
  { identifier: "dependency_signal", label: "Dependency signal" },
  { identifier: "requested_action", label: "Requested action" }
] as const;

export const landingHeroDetectorRows: readonly LandingHeroDetectorRow[] = [
  { identifier: "rule_detector", label: "Rule detector" },
  { identifier: "local_model", label: "Local model" },
  { identifier: "external_judge", label: "External judge" }
] as const;

export const landingAttackSurfaceCopy = {
  frameLabel: "Attack Surface Recon Surface",
  chromeLabel: "ASSET DISCOVERY",
  scenarioLabel: "ILLUSTRATIVE SCENARIO",
  productLabel: "Product visualization / illustrative scenario",
  evidenceListLabel: "Attack surface evidence",
  selectedLabel: "SELECTED EVIDENCE",
  handoffIdentifier: "tool_endpoint",
  outcomeZh: "把服务入口、执行框架与外部工具关系收敛为一张可核查的攻击面证据图。"
} as const;

export const landingAttackSurfaceEvidence: readonly LandingAttackSurfaceEvidence[] = [
  {
    id: "agent",
    type: "Agent service",
    identifier: "agent_service",
    value: "agent-service-api",
    definition: "Exposed Agent runtime and its reachable service boundary"
  },
  {
    id: "framework",
    type: "Framework",
    identifier: "framework_fingerprint",
    value: "openai-agents/python",
    definition: "Framework identity and runtime signature"
  },
  {
    id: "interface",
    type: "Interface",
    identifier: "interface_endpoint",
    value: "POST /v1/agent/run",
    definition: "Callable interface that admits external Agent input"
  },
  {
    id: "skill",
    type: "Skill package",
    identifier: "skill_package",
    value: "workspace-maintenance",
    definition: "Installed Skill package connected to the service"
  },
  {
    id: "tool",
    type: "External Tool",
    identifier: "tool_endpoint",
    value: "filesystem.move",
    definition: "Outbound Tool destination exposed to the Agent"
  },
  {
    id: "exposure",
    type: "Exposure",
    identifier: "exposure_contour",
    value: "public ingress -> tool scope",
    definition: "Reachability contour joining input, Skill, and Tool boundaries"
  }
] as const;

export const landingSkillInspectionCopy = {
  frameLabel: "Capability Inspection Surface",
  chromeLabel: "SKILL STATIC ANALYSIS",
  outputLabel: "Illustrative analysis output",
  productLabel: "Product visualization / illustrative scenario",
  selectedLabel: "INSPECTION FOCUS",
  incomingIdentifier: "tool_endpoint",
  outgoingIdentifier: "evidence_ref"
} as const;

export const landingSkillInspectionEvidence: readonly LandingSkillInspectionEvidence[] = [
  {
    id: "manifest",
    title: "Manifest",
    identifier: "skill_package",
    value: "workspace-maintenance@1.4.2",
    definition: "Package identity, declared entrypoint, and provenance boundary"
  },
  {
    id: "dependency",
    title: "Dependency",
    identifier: "dependency",
    value: "shell-bridge@3.1.0",
    definition: "Executable dependency introduced by the Skill package"
  },
  {
    id: "permission",
    title: "Permission boundary",
    identifier: "permission_boundary",
    value: "workspace:write",
    definition: "Declared write boundary exceeds the package's stated purpose"
  },
  {
    id: "invocation",
    title: "Tool invocation",
    identifier: "tool_invocation",
    value: "filesystem.move",
    definition: "Tool call path can move content beyond the declared workspace"
  },
  {
    id: "reason",
    title: "Reason code",
    identifier: "reason_code: tool_scope_escalation",
    value: "policy review required",
    definition: "Evidence converges on a tool-scope escalation outcome"
  }
] as const;

export const landingAnalyzeOutcomesZh = [
  "确认 Skill 来源、依赖与执行入口",
  "识别声明权限与实际调用路径的差异",
  "将风险行为收敛为可解释的 reason code"
] as const;

export const landingSections: readonly LandingSectionCopy[] = [
  {
    id: "discover",
    eyebrow: "01 / DISCOVER",
    headingEn: "Map the Agent Attack Surface.",
    bodyZh:
      "识别暴露的 Agent 服务、框架、接口、Skills 与外部 Tools，将分散的资产信号转化为可分析的安全上下文。"
  },
  {
    id: "analyze",
    eyebrow: "02 / ANALYZE",
    headingEn: "Understand what a Skill can really do.",
    bodyZh:
      "不止识别 package name。审视脚本、依赖、声明权限、Prompt 行为与 Tool 调用路径，在 Skill 进入生产前厘清它真正能够读取、调用和改变的边界。"
  },
  {
    id: "runtime",
    eyebrow: "03 / CONTAIN",
    headingEn: "Observe agent behavior at runtime.",
    bodyZh:
      "在 Agent 发起操作的瞬间解析信任上下文、并行评估证据并应用策略，让安全决策及其约束依据清晰可见。"
  },
  {
    id: "platform",
    eyebrow: "ONE PLATFORM. THREE SECURITY LAYERS.",
    headingEn: "See the whole security posture, not isolated checks.",
    bodyZh:
      "在统一的产品视图中关联资产发现、Skill 静态分析与运行时防护，避免把每一层安全能力割裂为孤立检查。"
  },
  {
    id: "architecture",
    eyebrow: "FROM SIGNAL TO DECISION",
    headingEn: "A defensible security decision has a chain of evidence.",
    bodyZh:
      "将发现、归一化、分析、决策、执行与审计串成可追溯的证据链，让每个策略结果都能说明其来源与依据。"
  }
] as const;

export const landingTypographyBeats = [
  "DISCOVER. ANALYZE. CONTAIN.",
  "ONE PLATFORM. THREE SECURITY LAYERS."
] as const;

export const landingFinalCta = {
  eyebrow: "READY TO EVALUATE?",
  headingEn: "Take control of your agent attack surface.",
  bodyZh: "进入 Console，在同一条证据链上查看资产、能力与运行时决策。"
} as const;

export const productLayers = [
  {
    id: "asset_scan",
    index: "01",
    label: "Asset Discovery",
    overlay: "asset_discovery",
    descriptionZh:
      "将 Agent 服务、框架、接口与工具关系归一为可分析资产。"
  },
  {
    id: "skills_static",
    index: "02",
    label: "Static Analysis",
    overlay: "static_analysis",
    descriptionZh:
      "把 Skill 的脚本、依赖、权限与调用路径汇聚为能力证据。"
  },
  {
    id: "sandbox",
    index: "03",
    label: "Runtime Security",
    overlay: "runtime_security",
    descriptionZh:
      "将运行时信号、检测结果与策略动作关联为可审计决策。"
  }
] as const;

export const evidencePipeline = [
  {
    id: "observe",
    labelEn: "Observe",
    identifier: "asset_scan",
    descriptionZh: "采集 Agent 服务、Skill 与工具交互信号。"
  },
  {
    id: "normalize",
    labelEn: "Normalize",
    identifier: "interaction_context",
    descriptionZh: "将分散事件归一为一致的安全上下文。"
  },
  {
    id: "analyze",
    labelEn: "Analyze",
    identifier: "reason_code",
    descriptionZh: "关联权限、行为与来源证据，识别风险意图。"
  },
  {
    id: "decide",
    labelEn: "Decide",
    identifier: "policy_action",
    descriptionZh: "依据证据与策略形成可解释的安全决策。"
  },
  {
    id: "act",
    labelEn: "Act",
    identifier: "containment_action",
    descriptionZh: "按策略执行允许、拒绝或隔离动作。"
  },
  {
    id: "audit",
    labelEn: "Audit",
    identifier: "evidence_ref",
    descriptionZh: "保留原因码与证据引用，形成可追溯记录。"
  }
] as const;
