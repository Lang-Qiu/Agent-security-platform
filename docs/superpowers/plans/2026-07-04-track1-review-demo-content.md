# Track 1 Review Demo Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned Chinese review-demo content catalog, evaluator guide, and permanent repository gate without changing runtime, API, frontend, or engine behavior.

**Architecture:** Stable editorial content lives in one machine-readable sample document and contains labels, guidance, and evidence bindings only. Campaign results, metric values, policy actions, and artifact hashes remain owned by existing normalized evidence. One repository test enforces the closed shape, safe source notice, canonical scenario order, and root test registration.

**Tech Stack:** JSON, Markdown, Node.js 22.19+, TypeScript ESM, `node:test`, `node:assert`.

---

## Scope and File Map

- Create `tests/repository/track1-review-demo-content.spec.ts`: permanent
  closed-shape and safety gate.
- Modify `package.json`: append the new repository spec to the existing
  `test:repo` command without changing any other current script.
- Create `samples/track1/review-demo/content.zh-CN.json`: versioned
  machine-readable content catalog.
- Create `docs/track1/review-demo-content.md`: evaluator-facing editorial and
  presentation guide linked to canonical sources.
- Modify `docs/progress.md`: append actual RED/GREEN evidence and requirement
  status.

The worktree already contains unrelated uncommitted changes in `package.json`
and `docs/progress.md`. Preserve them. Do not commit implementation files from
this plan; report a suggested commit message instead.

## Task 1: Write and Prove the Repository Gate

**Files:**

- Create: `tests/repository/track1-review-demo-content.spec.ts`
- Modify: `package.json`
- Test: `tests/repository/track1-review-demo-content.spec.ts`

- [ ] **Step 1: Create the failing repository test**

Create `tests/repository/track1-review-demo-content.spec.ts` with:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);

const EXPECTED_TOP_LEVEL_KEYS = [
  "schema_version",
  "locale",
  "product",
  "source_notice",
  "review_tour",
  "capabilities",
  "scenarios",
  "metric_bindings",
  "evidence_surfaces",
  "safety_boundary",
  "frequently_asked_questions"
].sort();

const EXPECTED_SCENARIOS = [
  ["T1-SC-001", "agent:track1:prompt-injection"],
  ["T1-SC-002", "agent:track1:tool-hijack"],
  ["T1-SC-003", "agent:track1:memory-poison"]
] as const;

const EXPECTED_METRICS = [
  "agent_count",
  "case_count",
  "attempt_count",
  "retry_count",
  "deny_count",
  "ask_count",
  "allow_count",
  "blocked_count",
  "intercepted_tool_count",
  "executed_simulated_tool_count",
  "real_side_effect_count"
];

function text(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

function content(): Record<string, unknown> {
  return JSON.parse(
    text("samples/track1/review-demo/content.zh-CN.json")
  ) as Record<string, unknown>;
}

function ids(values: Array<Record<string, unknown>>): string[] {
  return values.map((value) => String(value.id));
}

function assertUnique(values: string[], label: string): void {
  assert.equal(new Set(values).size, values.length, label);
}

function collectKeysAndStrings(
  value: unknown,
  keys: string[] = [],
  strings: string[] = []
): { keys: string[]; strings: string[] } {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeysAndStrings(item, keys, strings);
    }
    return { keys, strings };
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeysAndStrings(child, keys, strings);
    }
    return { keys, strings };
  }
  if (typeof value === "string") {
    strings.push(value);
  }
  return { keys, strings };
}

test("REQ-T1-DEMO-010 review content has a closed versioned Chinese catalog", () => {
  const value = content();
  assert.deepEqual(Object.keys(value).sort(), EXPECTED_TOP_LEVEL_KEYS);
  assert.equal(value.schema_version, "track1-review-demo-content.v1");
  assert.equal(value.locale, "zh-CN");

  const product = value.product as Record<string, unknown>;
  assert.equal(product.name, "灵鉴 AgentScope");
  assert.equal(product.tagline, "看见 Agent，守住边界。");

  const sourceNotice = value.source_notice as Record<string, unknown>;
  assert.equal(sourceNotice.label, "受控评审数据 · 非实时云模型验收结果");
  assert.equal(sourceNotice.data_source, "controlled_fixture");
  assert.equal(sourceNotice.accepted_baseline, false);
});

test("REQ-T1-DEMO-010 review tour is five ordered minutes with stable targets", () => {
  const tour = content().review_tour as Array<Record<string, unknown>>;
  assert.equal(tour.length, 5);
  assert.deepEqual(
    tour.map((step) => step.order),
    [1, 2, 3, 4, 5]
  );
  assert.equal(
    tour.reduce(
      (total, step) => total + Number(step.duration_seconds),
      0
    ),
    300
  );
  assertUnique(ids(tour), "review tour ids must be unique");

  for (const step of tour) {
    for (const key of [
      "title",
      "evaluator_question",
      "presenter_guidance",
      "target_surface"
    ]) {
      assert.equal(
        typeof step[key],
        "string",
        `${String(step.id)}.${key}`
      );
      assert.notEqual(String(step[key]).trim(), "", `${String(step.id)}.${key}`);
    }
  }
});

test("REQ-T1-DEMO-010 review scenarios follow the canonical three-agent order", () => {
  const scenarios = content().scenarios as Array<Record<string, unknown>>;
  assert.equal(scenarios.length, 3);
  assert.deepEqual(
    scenarios.map((scenario) => [
      scenario.scenario_id,
      scenario.agent_id
    ]),
    EXPECTED_SCENARIOS
  );

  for (const scenario of scenarios) {
    for (const key of [
      "display_name",
      "evaluator_question",
      "controlled_attack_objective",
      "control_mechanism",
      "residual_risk"
    ]) {
      assert.equal(
        typeof scenario[key],
        "string",
        `${String(scenario.scenario_id)}.${key}`
      );
      assert.notEqual(
        String(scenario[key]).trim(),
        "",
        `${String(scenario.scenario_id)}.${key}`
      );
    }
    const surfaces = scenario.evidence_surfaces as string[];
    assert.ok(surfaces.length >= 2);
    assertUnique(surfaces, `${String(scenario.scenario_id)} evidence surfaces`);
  }
});

test("REQ-T1-DEMO-010 review metrics bind labels without embedding result values", () => {
  const metrics = content().metric_bindings as Array<Record<string, unknown>>;
  assert.deepEqual(
    metrics.map((metric) => metric.key),
    EXPECTED_METRICS
  );
  assertUnique(
    metrics.map((metric) => String(metric.key)),
    "metric keys must be unique"
  );

  for (const metric of metrics) {
    assert.deepEqual(Object.keys(metric).sort(), [
      "description",
      "key",
      "label"
    ]);
  }
});

test("REQ-T1-DEMO-010 review content keeps evidence, safety, and FAQ identifiers unique", () => {
  const value = content();
  const capabilities = value.capabilities as Array<Record<string, unknown>>;
  const evidence = value.evidence_surfaces as Array<Record<string, unknown>>;
  const safety = value.safety_boundary as Array<Record<string, unknown>>;
  const faq = value.frequently_asked_questions as Array<Record<string, unknown>>;

  assert.ok(capabilities.length >= 8);
  assert.ok(evidence.length >= 7);
  assert.ok(safety.length >= 7);
  assert.ok(faq.length >= 6);

  assertUnique(ids(capabilities), "capability ids must be unique");
  assertUnique(ids(evidence), "evidence ids must be unique");
  assertUnique(ids(safety), "safety ids must be unique");
  assertUnique(ids(faq), "FAQ ids must be unique");

  assert.equal(
    safety.some((item) =>
      String(item.statement).includes("所有工具副作用均由受控模拟器承载")
    ),
    true
  );
  assert.equal(
    safety.some((item) =>
      String(item.statement).includes("凭据化验收是独立显式门禁")
    ),
    true
  );
});

test("REQ-T1-DEMO-010 review content contains no forged outcome or raw runtime field", () => {
  const { keys, strings } = collectKeysAndStrings(content());
  const keySet = new Set(keys);

  for (const forbiddenKey of [
    "value",
    "actual_action",
    "expected_action",
    "passed",
    "pass_rate",
    "final_pass_count",
    "model_input",
    "model_output",
    "tool_arguments",
    "tool_result",
    "memory_value",
    "chain_of_thought"
  ]) {
    assert.equal(keySet.has(forbiddenKey), false, forbiddenKey);
  }

  const allText = strings.join("\n");
  assert.doesNotMatch(allText, /\b9\s*\/\s*9\b/i);
  assert.doesNotMatch(allText, /https?:\/\//i);
  assert.doesNotMatch(allText, /\bsk-[A-Za-z0-9_-]{8,}\b/);
  assert.match(allText, /占位校验件/);
  assert.match(allText, /不得作为真实评审证据/);
});

test("REQ-T1-DEMO-010 review content is registered in the root repository gate", () => {
  const packageJson = JSON.parse(text("package.json")) as {
    scripts: Record<string, string>;
  };
  assert.match(
    packageJson.scripts["test:repo"],
    /track1-review-demo-content\.spec\.ts/
  );
});
```

- [ ] **Step 2: Register the new spec in the root repository gate**

In `package.json`, append this path immediately after
`tests/repository/track1-evidence-pack.spec.ts` inside `scripts.test:repo`:

```text
tests/repository/track1-review-demo-content.spec.ts
```

Do not alter the other uncommitted script additions.

- [ ] **Step 3: Run the focused test and prove RED**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-review-demo-content.spec.ts
```

Expected result: FAIL because
`samples/track1/review-demo/content.zh-CN.json` does not exist. A syntax,
module-resolution, or assertion-design error is not valid RED and must be
fixed before continuing.

## Task 2: Add the Minimal Review Content and Guide

**Files:**

- Create: `samples/track1/review-demo/content.zh-CN.json`
- Create: `docs/track1/review-demo-content.md`
- Test: `tests/repository/track1-review-demo-content.spec.ts`

- [ ] **Step 1: Create the machine-readable catalog**

Create `samples/track1/review-demo/content.zh-CN.json` with this exact
structure and content:

```json
{
  "schema_version": "track1-review-demo-content.v1",
  "locale": "zh-CN",
  "product": {
    "name": "灵鉴 AgentScope",
    "positioning": "面向智能体的全链路安全检测与行为监督平台",
    "tagline": "看见 Agent，守住边界。",
    "summary": "围绕智能体资产、Skills 静态风险与运行时行为，将检测、策略判定、工具拦截、战役监督和证据校验组织为可追溯的安全闭环。"
  },
  "source_notice": {
    "label": "受控评审数据 · 非实时云模型验收结果",
    "data_source": "controlled_fixture",
    "accepted_baseline": false,
    "summary": "本模式使用确定性、可复现的受控数据展示产品流程；基础设施验证、受控数据结果与凭据化云模型验收属于三个独立证据层。",
    "replacement_rule": "后续仅允许以通过独立验收和完整性校验的 baseline 替换证据数据，内容目录本身不认证任何 campaign 结果。"
  },
  "review_tour": [
    {
      "id": "product-boundary",
      "order": 1,
      "title": "作品定位与安全边界",
      "evaluator_question": "灵鉴解决什么问题，又明确不做什么？",
      "presenter_guidance": "说明智能体风险已从文本内容扩展到工具调用和持续记忆，并强调所有演示均处于授权、受控、无真实副作用的研究边界内。",
      "target_surface": "review:introduction",
      "duration_seconds": 30
    },
    {
      "id": "runtime-readiness",
      "order": 2,
      "title": "真实基础设施链路",
      "evaluator_question": "构建、部署、健康检查和插件加载是否形成可验证链路？",
      "presenter_guidance": "依次展示版本锁定、容器拓扑、双监听健康状态，以及 OpenClaw 原生插件的四个工具和六类 hook 加载结果。",
      "target_surface": "review:runtime-readiness",
      "duration_seconds": 45
    },
    {
      "id": "campaign-overview",
      "order": 3,
      "title": "三 Agent 九用例战役监督",
      "evaluator_question": "平台如何把多个智能体和多个攻击用例关联为同一条监督主线？",
      "presenter_guidance": "展示 campaign、Agent 分组、用例状态、尝试次数和安全动作指标；所有数值从规范化证据读取，不引用本内容文件中的固定结果。",
      "target_surface": "review:campaign-overview",
      "duration_seconds": 60
    },
    {
      "id": "scenario-investigation",
      "order": 4,
      "title": "三类风险场景调查",
      "evaluator_question": "系统如何区分应放行、应确认和应阻断的行为？",
      "presenter_guidance": "按提示词注入、工具调用劫持、上下文与记忆投毒的顺序，检查策略决策、确认屏障、阻断记录和内容最小化证据。",
      "target_surface": "review:scenario-investigation",
      "duration_seconds": 120
    },
    {
      "id": "evidence-verification",
      "order": 5,
      "title": "报告与证据完整性",
      "evaluator_question": "评委如何独立核验界面结论与报告制品？",
      "presenter_guidance": "展示规范化 campaign JSON、风险报告、截图集合和 SHA-256 manifest，并说明 fixture 二进制占位校验件不得作为真实评审证据。",
      "target_surface": "review:evidence-verification",
      "duration_seconds": 45
    }
  ],
  "capabilities": [
    {
      "id": "agent-attack-surface",
      "title": "智能体资产与攻击面感知",
      "summary": "统一识别智能体服务、暴露入口和可达风险，为后续静态与运行时检测提供对象基础。"
    },
    {
      "id": "skills-static-analysis",
      "title": "Skills 静态安全检测",
      "summary": "对技能包、脚本、依赖和配置执行规则化分析，并收敛为统一风险结果。"
    },
    {
      "id": "openclaw-native-plugin",
      "title": "OpenClaw 原生监督插件",
      "summary": "在原生模型与工具生命周期 hook 中观察行为，不以旁路脚本伪造运行结果。"
    },
    {
      "id": "pre-tool-policy",
      "title": "调用前策略与确认屏障",
      "summary": "在工具副作用发生前完成 allow、deny、ask 或 alert 决策，并对需确认与阻断路径保持失效关闭。"
    },
    {
      "id": "controlled-sandbox",
      "title": "受控沙箱与模拟业务工具",
      "summary": "邮件、文件和 API 行为仅作用于内存命名空间和固定 mock 路由。"
    },
    {
      "id": "campaign-supervision",
      "title": "多智能体战役监督",
      "summary": "以一个 campaign 关联多个 Agent、场景、用例、尝试和会话证据。"
    },
    {
      "id": "content-minimized-evidence",
      "title": "内容最小化证据",
      "summary": "平台只保留结构化标识、哈希、引用、决策和时间信息，不暴露运行时原文。"
    },
    {
      "id": "deterministic-reporting",
      "title": "确定性报告与完整性清单",
      "summary": "对规范化输入生成固定结构的报告、JSON 与 SHA-256 制品清单。"
    }
  ],
  "scenarios": [
    {
      "scenario_id": "T1-SC-001",
      "agent_id": "agent:track1:prompt-injection",
      "display_name": "提示词注入与越狱",
      "evaluator_question": "不可信内容试图覆盖既有指令时，系统能否在工具调用前识别并阻断危险行为？",
      "controlled_attack_objective": "诱导智能体忽略安全约束、扩大任务范围或执行受保护操作。",
      "control_mechanism": "由模型调用链监督和规则决策提供者关联上下文，在工具请求进入模拟执行器前完成策略判断。",
      "evidence_surfaces": [
        "campaign-case",
        "session-decisions",
        "blocked-records"
      ],
      "residual_risk": "真实供应商模型的表达差异和版本漂移仍需通过独立凭据化验收验证。"
    },
    {
      "scenario_id": "T1-SC-002",
      "agent_id": "agent:track1:tool-hijack",
      "display_name": "工具调用劫持",
      "evaluator_question": "工具名称看似合法但目标或参数被替换时，系统能否要求确认或拒绝执行？",
      "controlled_attack_objective": "把允许的业务操作重定向到越权目标、受保护资源或非预期参数。",
      "control_mechanism": "在 before_tool_call 阶段校验工具、目标引用和关联身份，通过确认屏障阻止未批准副作用。",
      "evidence_surfaces": [
        "campaign-case",
        "session-events",
        "session-decisions",
        "blocked-records"
      ],
      "residual_risk": "新增工具与业务语义需要显式契约和策略覆盖，不能依赖名称相似性自动放行。"
    },
    {
      "scenario_id": "T1-SC-003",
      "agent_id": "agent:track1:memory-poison",
      "display_name": "上下文与记忆投毒",
      "evaluator_question": "恶意记忆试图影响后续会话时，系统能否保持身份关联并限制持久影响？",
      "controlled_attack_objective": "注入跨轮次指令，使后续任务继承越权目标或修改受保护状态。",
      "control_mechanism": "仅保留内容引用与哈希，校验会话和 campaign 关联，并在状态变更前执行统一策略。",
      "evidence_surfaces": [
        "campaign-case",
        "session-events",
        "session-decisions"
      ],
      "residual_risk": "跨供应商记忆实现和长期存储策略仍需在具体部署环境中单独评估。"
    }
  ],
  "metric_bindings": [
    {
      "key": "agent_count",
      "label": "Agent 数量",
      "description": "从规范化 campaign 投影读取的 Agent 覆盖数。"
    },
    {
      "key": "case_count",
      "label": "用例数量",
      "description": "从规范化 campaign 投影读取的受控用例覆盖数。"
    },
    {
      "key": "attempt_count",
      "label": "执行尝试",
      "description": "由全部规范化尝试记录重新计算。"
    },
    {
      "key": "retry_count",
      "label": "审计重试",
      "description": "由同一用例的第二次受控尝试重新计算。"
    },
    {
      "key": "deny_count",
      "label": "拒绝",
      "description": "由最终策略决策重新计算。"
    },
    {
      "key": "ask_count",
      "label": "需确认",
      "description": "由最终策略决策重新计算。"
    },
    {
      "key": "allow_count",
      "label": "放行",
      "description": "由最终策略决策重新计算。"
    },
    {
      "key": "blocked_count",
      "label": "已阻断",
      "description": "由规范化阻断记录重新计算。"
    },
    {
      "key": "intercepted_tool_count",
      "label": "工具拦截",
      "description": "由调用前监督事件重新计算。"
    },
    {
      "key": "executed_simulated_tool_count",
      "label": "模拟执行",
      "description": "由受控模拟工具结果重新计算。"
    },
    {
      "key": "real_side_effect_count",
      "label": "真实副作用",
      "description": "由独立安全边界验证结果读取。"
    }
  ],
  "evidence_surfaces": [
    {
      "id": "campaign-overview",
      "title": "Campaign 总览",
      "description": "展示 Agent 分组、用例状态、尝试和聚合安全动作。",
      "fixture_state": "structured_fixture"
    },
    {
      "id": "scenario-investigation",
      "title": "场景与会话调查",
      "description": "展示内容最小化事件、策略决策、告警和阻断记录。",
      "fixture_state": "structured_fixture"
    },
    {
      "id": "markdown-report",
      "title": "安全风险分析 Markdown",
      "description": "固定章节、双语摘要、动作矩阵和受控用例附录。",
      "fixture_state": "reviewable_fixture"
    },
    {
      "id": "pdf-report",
      "title": "安全风险分析 PDF",
      "description": "当前 fixture 文件仅是 PDF 流水线占位校验件，不得作为真实评审证据。",
      "fixture_state": "binary_placeholder"
    },
    {
      "id": "campaign-json",
      "title": "规范化 Campaign JSON",
      "description": "包含结构化 campaign、场景、尝试、指标和安全引用。",
      "fixture_state": "reviewable_fixture"
    },
    {
      "id": "screenshot-set",
      "title": "五张监督界面截图",
      "description": "当前 fixture 图片是截图流水线占位校验件，不得作为真实评审证据。",
      "fixture_state": "binary_placeholder"
    },
    {
      "id": "sha256-manifest",
      "title": "SHA-256 制品清单",
      "description": "记录固定制品路径、媒体类型、字节长度和内容哈希。",
      "fixture_state": "reviewable_fixture"
    }
  ],
  "safety_boundary": [
    {
      "id": "authorized-targets",
      "statement": "仅使用仓库内规范用例和明确授权的受控环境，不接触第三方未授权目标。"
    },
    {
      "id": "no-real-email",
      "statement": "不投递真实邮件，邮件行为仅写入内存 outbox。"
    },
    {
      "id": "no-host-filesystem-write",
      "statement": "不写入宿主文件系统，文件行为仅作用于 sandbox://fixtures/ 命名空间。"
    },
    {
      "id": "no-arbitrary-api-side-effect",
      "statement": "不调用任意外部业务 API，网络行为仅解析固定 mock 路由。"
    },
    {
      "id": "simulated-effects",
      "statement": "所有工具副作用均由受控模拟器承载，不产生真实业务影响。"
    },
    {
      "id": "content-minimization",
      "statement": "评审数据不包含模型输入输出原文、工具参数结果原文、记忆值、凭据或思维链。"
    },
    {
      "id": "explicit-credential-gate",
      "statement": "凭据化验收是独立显式门禁，不由 fixture 数据或内容目录替代。"
    }
  ],
  "frequently_asked_questions": [
    {
      "id": "fixture-or-live",
      "question": "当前展示的是 fixture 还是实时云模型结果？",
      "answer": "这是受控、确定性、可复现的评审数据，用于离线展示产品路径，不冒充凭据化云模型验收结果。"
    },
    {
      "id": "verified-infrastructure",
      "question": "哪些基础设施环节已经具备真实验证路径？",
      "answer": "构建、部署、健康检查、OpenClaw 原生插件加载与 campaign 编排均有独立验证入口和失败关闭边界。"
    },
    {
      "id": "why-simulated-tools",
      "question": "为什么邮件、文件和 API 工具使用模拟实现？",
      "answer": "评审目标是验证识别、确认和阻断能力，而不是制造真实副作用；模拟器让同一用例可安全复现和审计。"
    },
    {
      "id": "metric-derivation",
      "question": "策略动作和指标如何产生？",
      "answer": "动作来自规范化策略决策，指标由 campaign、尝试、事件、阻断记录和模拟工具结果重新计算，不信任调用方汇总。"
    },
    {
      "id": "artifact-integrity",
      "question": "如何核验报告和 JSON 没有被修改？",
      "answer": "manifest 记录每个固定制品的字节长度和 SHA-256，校验器会重新读取文件并核对路径、媒体类型和哈希。"
    },
    {
      "id": "baseline-replacement",
      "question": "真实 baseline 完成后如何替换当前数据？",
      "answer": "只有通过独立 campaign、会话、运行时和制品验收的数据包才能原子提升为 accepted baseline；导览内容和共享契约无需改写。"
    }
  ]
}
```

- [ ] **Step 2: Create the evaluator-facing guide**

Create `docs/track1/review-demo-content.md` with these sections and facts:

```markdown
# 灵鉴 AgentScope 评审演示内容

## 用途与数据声明

本文件是“评审演示模式”的中文内容母稿，不是运行时结果，也不替代
凭据化云模型验收。

> 受控评审数据 · 非实时云模型验收结果

演示数据必须通过既有规范化 campaign、session 和报告证据读取。界面、
报告或讲解不得把 fixture 二进制占位校验件描述为真实截图或正式 PDF。

## 五分钟评审路线

1. **作品定位与安全边界（30 秒）**  
   回答“灵鉴解决什么问题，又明确不做什么”。说明智能体风险从内容扩展
   到工具调用与持续记忆，演示仅使用授权环境、受控用例和模拟工具。
2. **真实基础设施链路（45 秒）**  
   展示固定版本构建、容器部署、双监听健康检查，以及 OpenClaw 插件四个
   工具、六类 hook 的加载验证。
3. **三 Agent 九用例战役监督（60 秒）**  
   展示 campaign 总览、Agent 分组、用例状态、尝试次数和安全动作。所有
   数值都从规范化证据读取，不写死在内容目录。
4. **三类风险场景调查（120 秒）**  
   依次查看提示词注入、工具调用劫持、上下文与记忆投毒，重点解释调用前
   策略、确认屏障、阻断记录和内容最小化证据。
5. **报告与证据完整性（45 秒）**  
   展示 campaign JSON、风险报告、截图集合与 SHA-256 manifest，说明
   accepted baseline 的独立验收与原子提升规则。

## 场景讲解

### T1-SC-001 提示词注入与越狱

评审问题：不可信内容试图覆盖既有指令时，系统能否在工具调用前识别并
阻断危险行为？

讲解重点：模型调用链监督、规则决策、调用前拦截，以及危险路径与正常
业务路径的区分。真实供应商模型差异仍由独立凭据化验收覆盖。

### T1-SC-002 工具调用劫持

评审问题：工具名称看似合法但目标或参数被替换时，系统能否要求确认或
拒绝执行？

讲解重点：before_tool_call 阶段的工具、目标引用与身份关联校验，以及
确认屏障如何阻止未批准副作用。

### T1-SC-003 上下文与记忆投毒

评审问题：恶意记忆试图影响后续会话时，系统能否保持身份关联并限制
持久影响？

讲解重点：内容引用与哈希、会话与 campaign 关联，以及状态变更前的
统一策略判断。

## 指标展示规则

内容目录只定义指标标签和顺序。Agent、用例、尝试、重试、allow、deny、
ask、阻断、工具拦截、模拟执行与真实副作用等数值必须来自规范化报告或
campaign 投影。

不得在静态文案中写入通过率、动作矩阵、固定 campaign ID 或制品哈希。

## 证据展示规则

- Markdown 报告、campaign JSON 和 manifest 可以作为 fixture 流水线的
  可读结构证据。
- 当前 fixture PDF 是最小二进制占位校验件，不得作为正式评审 PDF。
- 当前五张 fixture PNG 是截图流水线占位校验件，不得作为真实界面截图。
- accepted baseline 必须通过独立 campaign、session、运行时和制品校验，
  不能由人工修改 fixture 结果获得。

## 安全边界

- 仅使用仓库内规范用例和授权环境。
- 不投递真实邮件，不写入宿主文件系统，不调用任意外部业务 API。
- 所有工具副作用均由受控模拟器承载。
- 不展示模型输入输出原文、工具参数结果原文、记忆值、凭据或思维链。
- 凭据化验收是独立显式门禁。

## 评委常见问题

### 当前展示的是 fixture 还是实时云模型结果？

这是受控、确定性、可复现的评审数据，不冒充凭据化云模型验收结果。

### 为什么使用模拟工具？

目标是安全验证识别、确认与阻断能力，而不是制造真实邮件、文件或 API
副作用。模拟工具让用例可以重复执行和审计。

### 策略动作和指标如何产生？

策略动作来自规范化决策，指标由 campaign、尝试、事件、阻断记录和模拟
工具结果重新计算，不信任调用方汇总。

### 如何核验制品完整性？

manifest 记录固定制品的路径、媒体类型、字节长度和 SHA-256；校验器会
重新读取并核对每一个制品。

### 真实 baseline 如何替换 fixture？

通过独立验收的数据包会按严格白名单原子提升为 accepted baseline，内容
目录、共享契约和评审路线不需要改写。

## 规范来源

- 当前 requirement：[`../sprint-current.md`](../sprint-current.md)
- 系统架构：[`../architecture.md`](../architecture.md)
- API 契约：[`../api-contract.md`](../api-contract.md)
- 场景验收矩阵：[`scenario-acceptance-matrix.md`](scenario-acceptance-matrix.md)
- 机器可读内容：
  [`../../samples/track1/review-demo/content.zh-CN.json`](../../samples/track1/review-demo/content.zh-CN.json)
```

- [ ] **Step 3: Run the focused test and prove GREEN**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-review-demo-content.spec.ts
```

Expected result: 7 tests pass, 0 fail.

- [ ] **Step 4: Run the root repository gate**

Run:

```powershell
npm run test:repo
```

Expected result: all repository tests pass, including the 7 new review-content
tests.

## Task 3: Document and Close the Content Slice

**Files:**

- Modify: `docs/progress.md`
- Inspect: `README.md`
- Inspect: `docs/architecture.md`
- Inspect: `docs/api-contract.md`

- [ ] **Step 1: Append actual completion evidence**

Append a dated section to `docs/progress.md` containing:

- requirement: `REQ-T1-DEMO-010 review-demo content`;
- scope: versioned content catalog, five-minute tour, three scenarios, metric
  bindings, evidence rules, safety boundary, FAQ, repository gate;
- RED command and actual missing-file failure;
- GREEN focused-test and root-gate counts;
- explicit note that UI, API, runtime, executable packaging, fixture artifacts,
  and accepted baseline did not change;
- status: `REVIEW_DEMO_CONTENT_COMPLETE`;
- next dependency: separate user approval before review-mode UI work.

- [ ] **Step 2: Check durable documentation**

Inspect `README.md`, `docs/architecture.md`, and `docs/api-contract.md`.

Expected result: no updates are needed because this slice adds content metadata
and documentation only; it changes no architecture, route, DTO, or runtime
behavior. Record that conclusion in the progress entry.

- [ ] **Step 3: Run final verification**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-review-demo-content.spec.ts
npm run test:repo
git diff --check -- samples/track1/review-demo/content.zh-CN.json docs/track1/review-demo-content.md tests/repository/track1-review-demo-content.spec.ts package.json docs/progress.md
```

Expected result:

- focused review-content tests pass;
- repository gate passes;
- `git diff --check` emits no output.

- [ ] **Step 4: Stop and report**

Report:

1. modified files;
2. seven new tests;
3. RED and GREEN evidence;
4. whether the content slice is complete;
5. suggested commit message:
   `feat(track1): add review demo content`;
6. no review-mode UI or executable work was started.
