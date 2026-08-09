Design Spec：Agent Security Platform Landing Page

已确认的六项决策

┌──────┬─────────────────────────────────────────────────────────────────────────────────┐
│  项  │                                      决定                                       │
├──────┼─────────────────────────────────────────────────────────────────────────────────┤
│ 受众 │ 技术评委 / 答辩评审 → 30 秒建立"这是真系统"的可信度；无 logo 墙、无定价、无留资 │
├──────┼─────────────────────────────────────────────────────────────────────────────────┤
│ 骨架 │ 混合式五屏：HERO → 正向链 → 判定解剖 → 四道 barrier → 入口                      │
├──────┼─────────────────────────────────────────────────────────────────────────────────┤
│ 数据 │ 全静态，复用 showcaseDecision fixture，屏上如实标注                             │
├──────┼─────────────────────────────────────────────────────────────────────────────────┤
│ 语言 │ 中文为主 + 拉丁技术串；负字距只作用于拉丁/mono                                  │
├──────┼─────────────────────────────────────────────────────────────────────────────────┤
│ 动效 │ Linear 标定 + useAnimateOnce 三条门控                                           │
├──────┼─────────────────────────────────────────────────────────────────────────────────┤
│ CSS  │ token 进 app.css :root，规则进 landing.css（零字面量），门禁同步扩展            │
└──────┴─────────────────────────────────────────────────────────────────────────────────┘

1. 路由

用无路径 layout route，现有 console URL 一个不动：

export const appRoutes: RouteObject[] = [
  { path: "/", element: <LandingPage /> },
  { path: "/console", element: <Navigate to="/overview" replace /> },
  {
    element: <ConsoleLayout />,          // 无 path，不吃 URL 段
    children: [
      { path: "overview", element: <OverviewPage /> },
      // 其余 9 条原样；删掉原来的 index: true 子节点
    ]
  }
];

关键点：原 { path: "/", children: [{ index: true }] } 里的 index 子节点必须删除，否则会和新的 / landing 冲突。无路径父节点下，相对 path 仍对根解析，所以 "overview" → /overview，sandbox-security/workbench → /sandbox-security/workbench，被 spec 钉死的两条路径不变。

需实测确认一件事：renderAppAtRoute harness 是否直接吃 appRoutes。是则改动闭合。

2. 组件边界与数据流

每个文件一个职责，全部 presentational，props 进、JSX 出：

pages/LandingPage.tsx          路由外壳；<main>；唯一 h1 归它管
components/landing/
  LandingNav.tsx               fixed 72px + blur；aria-label 不得叫 "console navigation"
  LandingHero.tsx              eyebrow / h1 / 副标题行 / CTA / spacer 编排
  DecisionCardFrame.tsx        首屏视觉：verdict·action·policy + provenance 行
  ForwardChain.tsx             四步因果带（DOM/CSS，非 SVG）+ 四段文字
  DecisionAnatomy.tsx          左文右 mono，单个 finding 的完整形状
  BarrierRail.tsx              四个 enforcement point + fail-closed 下限矩阵
  EntryGrid.tsx                四个 console 入口
  LandingFooter.tsx            provenance 与项目定位
  useAnimateOnce.ts            入场门控 hook（~30 行）
  landing-motion.ts            时长/stagger/easing 常量
content/landing.ts             全部文案 + 选取哪些 fixture 字段
styles/landing.css             全部规则，零色值字面量

数据流是一条单向线，没有 I/O：

content/sandbox-security-showcase.ts   （既有 fixture）
        │ showcaseDecision
        ▼
content/landing.ts   ── 选取 + 标注 ──▶  组件（纯 props）

因此 landing 没有 loading 态、没有 error 态、没有 fetch。 这是设计属性而非遗漏——判定不可能"加载失败"，因为它从不声称是实时的。

一处必须避开的坑：showcasePayloadSummary 里的 claimed_source_type: "tool_result" 和 "retrieved_document" 不在 shared 契约的 SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES 里（契约是 retrieved_content / memory_content 等）。那个 fixture 用 as const 声明所以能编译。landing 若展示 source type，只能用契约内的合法值，不能把这两个错值传播出去。

3. Token 与排版

app.css :root 新增（沿用 --console-showcase-* 的注释先例）：

--landing-hairline: rgba(228, 237, 245, 0.06);
--landing-hairline-strong: rgba(228, 237, 245, 0.1);
--landing-surface-1: rgba(228, 237, 245, 0.02);
--landing-surface-2: rgba(228, 237, 245, 0.03);
--landing-nav-bg: rgba(13, 21, 32, 0.8);
--landing-frame-bg: rgba(18, 28, 40, 0.96);
--landing-glow: rgba(34, 211, 238, 0.03);
--landing-ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--landing-ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
--landing-dur-micro: 100ms;
--landing-dur-hover: 160ms;
--landing-dur-enter: 400ms;

其余全部复用既有 --console-*（bg / ink / muted / muted-dim / accent / mono / veil / grid-line / severity / action / hero-tint）。

字阶——CJK 行高比 Linear 的拉丁值放宽，字距归零，度量用 em：

display-1  h1  clamp(2.25rem, 5.2vw, 4rem)      lh 1.08  ls 0        max-w 10em
display-2  h2  clamp(1.75rem, 3.4vw, 2.75rem)   lh 1.15  ls 0        max-w 14em
statement      clamp(1.375rem, 2.2vw, 1.875rem) lh 1.5   ls 0        max-w 20em  muted
title-3    h3  1.125rem                          lh 1.5   ls 0
body-l         1.0625rem                         lh 1.75  ls 0        max-w 32em
body           0.9375rem                         lh 1.7   ls 0        max-w 32em
mono-code      0.8125rem                         lh 1.6   ls -0.012em
mono-eyebrow   0.6875rem                         lh 1.4   ls 0.08em   uppercase

max-w 10em 让 h1 每行约 10 个汉字，20 字标题自然折两行——复现 Linear 首屏的两行观感。

间距沿用 Linear 的 4px 基数双带：微观 4 8 12 20 28 36，宏观 40 48 80 96 128 160 200 224。区块 padding-block: clamp(4rem, 8vw, 8rem)。

Hero 由 spacer 驱动，不用 vh：

nav 72 → spacer 200 (≤1280:124, ≤1024:92, ≤640:132)
→ h1 → spacer 32 (≤1024:20) → 副标题行 → spacer 70 (≤640:36) → 判定卡框

容器 max-width: 1344px，gutter 46px → 10 → 28 → 16，内嵌 inset 32px → 8。断点全部 max-width，desktop-first：1280 / 1024 / 768 / 640。

4. 五屏内容

HERO — eyebrow AGENT SECURITY PLATFORM；h1 一句定位；副标题点明测绘、静态、运行时三层共用同一条证据链，每个判定带 detector 版本、reason code、evidence:// 引用。CTA：进入控制台 → /console，看评估演示 → /sandbox-security-showcase。主视觉是 DecisionCardFrame，取 showcaseDecision 的 risk_detected / deny / sandbox-security-strict.v1 / critical，卡下一行小字如实标注"示例契约形状，非实时评估；真实评估请用评估工作台"。底部契约事实行：sandbox-security-request.v1 · 9 类风险 · 4 道 barrier · 2 套策略档。

正向链 — 一条连续宽幅带（约 6:1），四步：测绘 → 静态 → 判定 → 阻断，对应仓库三条核心流程 + GENERAL-004。用 DOM/CSS 实现而非 SVG，因为报告里 Wiz 那四张 diagram 的 alt 只复述标题、整套平台论述对屏幕阅读器不可见——我们用真实文本节点绕开这个失败。边只用 accent 单一色相营造"图"感，严重度色只作小面积点缀。≤768px 转竖向堆叠。带下方四段静态文字展开，不做轮播（报告把"同内容渲染两遍"列为明确反模式）。

判定解剖 — 左文右 mono。取 FINDING_INJECTION 的完整形状：detector://sandbox/security/rule/instruction-override v1.4.0、prompt_injection、critical、confidence 0.96、sandbox_security_prompt_injection、text_byte_range 定位、evidence:// 引用。这屏是信任的来源，也是评委会停下来读的地方。

四道 barrier — before_agent_run / before_model_output_delivery / before_tool_execution / before_message_delivery，附 fail-closed 下限矩阵（user/model/outbound → ask，tool → deny），以及并发上限 4 / abort 10000ms / audit deadline 1000ms 与 sandbox_security_evaluation_unavailable。

入口 — Overview / 评估工作台 / 审计事件 / 评估演示四格。页脚重申演示数据边界。

5. 动效

入场   staggerIn: opacity 0→1 + translateY 4px→0，400ms ease-out-quart，stagger 60ms
HERO   逐行 blur-in: blur(10px)→0 + translateY 20%→0
hover  brightness(1.3) 导航 / 1.4 区块链接；:active scale(.97)；160ms ease-out-quad
       全部包在 @media (any-hover: hover)
门控   URL 带 hash → 整体跳过；首次 scroll 事件 → 自取消；每 key 只播一次
reduce 只留 opacity，去掉 transform / blur / 光晕

光晕压到 --landing-glow 的 0.03 量级，reduce 与 ≤640px 下 display: none——Linear 的做法，而非安全站条件反射的霓虹。hairline 在 ≥2dppx 下切 0.5px。

6. 无障碍

唯一 h1；每屏 h2；卡片 h3。landing nav 的 aria-label 必须区别于 console 的 "console navigation"（那个名字被 app-shell spec 钉死）。装饰光晕 aria-hidden。长 hash 视觉截断、title 保留全值。对比度已实算于 #0d1520：ink 15.5:1、muted 7.07:1、muted-dim 5.72:1、accent 10.15:1、severity-critical 6.67:1，全部过 AA 正文。

7. 测试

新增  frontend/src/pages/landing.page.spec.tsx
      唯一 h1 / 五屏 h2 有序 / 无 console chrome（无 banner、无 console navigation）
      两个 CTA 是真链接且指向 /console 与 /sandbox-security-showcase
      判定卡附近存在 provenance 标注 ← 诚实性断言
      不出现契约外的 claimed_source_type 值
改    frontend/src/app/app-shell.spec.tsx
      "/" 改断 landing；新增 "/overview" 断原 console 断言；新增 /console → /overview
改    tests/repository/frontend-console-theme-literals.spec.ts
      landing.css 零色值字面量；components/landing/** 零色值字面量
不动  frontend/src/app/sandbox-security-navigation.spec.tsx 必须原样跑绿