# agent-security-platform

> **当前工作状态：** GENERAL-002 已完成确定性 P7 门禁实现，但正式 P6
> 签名 evidence 尚未产生，因此 hermetic replay 继续 fail-closed；详见
> [`docs/sprint-current.md`](./docs/sprint-current.md)。

## Asset Scan Discovery Pipeline

`engines/asset-scan` now models the first six-step asset-scan flow inside the engine runtime.

- Step 1 `asset discovery`: normalize `seed[]` into candidate `Asset[]` with merged `ip`, `domain`, `source`, `tags`, and `timestamp`
- Step 2 `port scan`: scan candidate IPs into `PortInfo`, preserving `open`, `closed`, and `filtered` status
- Step 3 `protocol identification`: classify open ports into `ProtocolInfo` with `protocol`, `subprotocol`, `service`, optional `tls`, and aggregated `confidence`
- Step 4 to Step 6 remain probe collection, fingerprint matching, and asset classification

Current teaching-stage boundary:

- default runtime path is for controlled targets such as `localhost` and explicitly provided URLs
- the pipeline uses URL-derived port hints by default and only widens the scan set when candidate ports are explicitly provided
- backend continues to orchestrate through the engine bridge; discovery, scanning, and protocol classification now live in `engines/asset-scan/src/runtime/*`

## Backend Internal Engine Wiring

- `static_analysis` still enters through `POST /api/tasks`
- `asset_scan` can now be fed by a dev-side FOFA API collector script that converts FOFA search results into the existing `POST /api/tasks` contract without adding a new public route
- backend now keeps `task_type -> adapter` resolution and `engine_type -> engine client` resolution as two separate internal layers
- `SkillsStaticEngineClient` is the current internal bridge for routing `skills_static` dispatch tickets without introducing a new public route
- `skills_static` now supports a deterministic mock-analysis closed loop that backfills the existing `Task`, `BaseResult`, and `RiskSummary` records after dispatch
- `skills_static` also supports one minimal real-tool path through local `semgrep` CLI when `SKILLS_STATIC_ENGINE_PROVIDER=semgrep`
- both providers now converge on the same standardized risk-result core before the finished `static_analysis` record is exposed to the platform read APIs
- operators still read the closed-loop state through the existing `GET /api/tasks/:taskId`, `GET /api/tasks/:taskId/result`, and `GET /api/tasks/:taskId/risk-summary` routes

## Track 1 Simulated Business Tools

- `engines/sandbox/src/simulated-tools` provides deterministic `send_email`, `read_file`, `write_file`, and `call_api` behavior for controlled Track 1 cases.
- Email is restricted to the reserved `local.invalid` domain and is stored only in an in-memory outbox.
- File operations are restricted to the in-memory `sandbox://fixtures/` namespace.
- API operations resolve only against injected `mock://api.local/` routes and never call a network.
- Safety rejection is separate from sandbox policy decisions; `allow`, `deny`, `ask`, and `alert` remain owned by the next supervision-contract requirement.
- Targeted verification command: `npm run test:engine:sandbox`.

## FOFA API Dev Script

- `FOFA_EMAIL=your_email FOFA_KEY=your_key npm run run:fofa:api:task-scan -- --backend http://127.0.0.1:3000 --query='port="11434" && protocol="http"'`
- The script calls FOFA official `GET /api/v1/search/all`, maps each result row into the current `asset_scan` task contract, and submits it to `POST /api/tasks`
- Default mapping is targeted at `ollama` and sets `parameters.probe_mode=live`, `parameters.probe_target_id=ollama`, and `parameters.probe_port_hint=<fofa_port>`
- Credentials are read from `FOFA_EMAIL` and `FOFA_KEY` unless `--email` and `--key` are passed explicitly
- If `FOFA_EMAIL` or `FOFA_KEY` is not already present in the shell, the script will also try local env files in this order: `.env.local`, `.env`, `~/.config/agent-security-platform/fofa.env`
- On Linux / macOS, prefer the `--query='...'` form. If `&&` is left unquoted, the shell will treat it as a command separator instead of a FOFA query string.

Linux / macOS persistent env example:

```bash
mkdir -p ~/.config/agent-security-platform
cat > ~/.config/agent-security-platform/fofa.env <<'EOF'
export FOFA_EMAIL='your_email'
export FOFA_KEY='your_new_key'
EOF
chmod 600 ~/.config/agent-security-platform/fofa.env
source ~/.config/agent-security-platform/fofa.env
```

Then run:

```bash
cd /home/chartte/work/Agent-security-platform
npm run run:fofa:api:task-scan -- \
  --backend http://127.0.0.1:3000 \
  --query='port="11434" && protocol="http"'
```

Fetch a created task result:

```bash
curl http://127.0.0.1:3000/api/tasks/<task_id>/result
curl http://127.0.0.1:3000/api/tasks/<task_id>/risk-summary
```

Batch report for multiple created tasks:

```bash
npm run run:fofa:task-batch-report -- \
  --backend http://127.0.0.1:3000 \
  --taskIds task_a,task_b,task_c
```

Current note: FOFA-created `asset_scan` tasks are now backfilled to finished results using the existing asset-scan bridge during task creation, so the result and risk-summary APIs can be queried immediately after creation.

## Skills Static Real Provider

- Default provider remains `mock`
- Set `SKILLS_STATIC_ENGINE_PROVIDER=semgrep` to enable the minimal real detection path
- The real path expects `semgrep` CLI to be available on `PATH`
- The real path uses `engines/skills-static/rules/semgrep-minimal.yml`
- The real path uses `SKILLS_STATIC_SEMGREP_TIMEOUT_MS` for the minimal provider timeout boundary; the default is `15000`
- Explicit unsupported `SKILLS_STATIC_ENGINE_PROVIDER` values now fail through a stable internal provider-selection error path instead of silently falling back to `mock`
- Strong standardized fields currently fixed across providers: `sample_name`, `language`, standardized `rule_hits`, and derived `RiskSummary`
- `entry_files`, `files_scanned`, `sensitive_capabilities`, `dependency_summary`, and optional extension fields currently stay on a weaker contract until platform reads depend on them more strongly
- Targeted verification command:
  `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/skills-static-semgrep.spec.ts`

面向智能体（Agent）安全检测与管理的平台型仓库，用于统一承载资产测绘、Skills 静态安全检测、动态沙箱监控与越权阻断，以及平台化展示、任务编排和结果汇总能力。

当前仓库阶段目标是先完成第一版 monorepo 工程骨架与初始化文档，确保团队可以在统一目录约束下并行推进前端、后端与三个检测引擎。

## 项目简介

`agent-security-platform` 的目标不是只做单点检测工具，而是建设一个可扩展的平台：

- 面向 Agent、Skills、运行会话等对象做统一建模。
- 将资产扫描、静态分析、动态沙箱三类能力拆分为独立引擎，避免平台后端与具体检测实现强耦合。
- 通过统一任务模型、统一结果契约、统一风险等级，实现平台层的汇总、追踪与展示。
- 为后续接入更多检测规则、更多执行环境和更多部署形态预留空间。

## 系统总体模块

- `frontend`：平台控制台，负责资产列表、检测任务、风险结果、沙箱告警等页面展示。
- `backend`：平台后端，负责 API、任务编排、结果归档、权限与模块聚合。
- `engines/asset-scan`：资产测绘与指纹识别引擎。
- `engines/skills-static`：Skills 静态安全分析引擎。
- `engines/sandbox`：动态沙箱监控、策略判定与阻断引擎。
- `shared`：跨前后端与引擎共享的类型、契约、常量和通用工具。
- `docs`：架构、接口、计划、会议记录、设计决策等文档。

## 技术栈

- 前端：React + TypeScript
- 前端 UI：Ant Design，信息架构参考 Ant Design Pro simple
- 后端：Node.js + TypeScript
- 工程组织：推荐 `pnpm workspace` 作为 monorepo 管理方式
- 后端风格：模块化组织，设计上接近 NestJS 的分层与模块边界
- 引擎形态：可独立演进的 Node.js/TypeScript 子项目，后续可根据需要替换为其他语言实现

## 仓库结构说明

```text
agent-security-platform/
├─ frontend/                 # React 控制台
│  ├─ public/
│  └─ src/
├─ backend/                  # 平台 API 与任务编排
│  └─ src/
│     ├─ common/
│     ├─ config/
│     └─ modules/
├─ engines/                  # 三类检测引擎
│  ├─ asset-scan/
│  │  ├─ rules/
│  │  ├─ src/
│  │  └─ tests/
│  ├─ skills-static/
│  │  ├─ rules/
│  │  ├─ src/
│  │  └─ tests/
│  └─ sandbox/
│     ├─ policies/
│     ├─ src/
│     └─ tests/
├─ shared/                   # 公共契约层
│  ├─ constants/
│  ├─ contracts/
│  ├─ types/
│  └─ utils/
├─ docs/
│  ├─ adr/
│  ├─ meeting-notes/
│  ├─ plans/
│  ├─ api-contract.md
│  ├─ architecture.md
│  └─ development-plan.md
├─ scripts/
│  ├─ bootstrap/
│  ├─ ci/
│  └─ dev/
├─ samples/
│  ├─ assets/
│  ├─ sandbox/
│  └─ skills/
├─ deploy/
│  ├─ compose/
│  ├─ docker/
│  └─ k8s/
└─ tests/
   ├─ e2e/
   ├─ fixtures/
   └─ integration/
```

## 目录设计原则

- 平台层与检测层解耦：`backend` 只负责任务、编排、结果聚合，不内嵌具体检测逻辑。
- 引擎独立演进：三个引擎位于 `engines/` 下，具备各自规则、测试与运行边界。
- 共享契约前置：所有跨模块通信用到的数据结构优先收敛到 `shared`。
- 文档与代码并行：在 `docs` 中持续记录架构、接口、决策和迭代计划，便于 3 人团队低成本协作。
- 平台测试与模块测试分层：模块内各自维护单元测试，仓库根 `tests` 负责集成与端到端验证。

## 团队分工占位

建议先按能力边界做分工，再通过 `shared` 和 `docs` 对齐接口：

- 成员 A：`frontend` + 平台展示交互
- 成员 B：`backend` + 任务编排 + 数据聚合
- 成员 C：`engines/*` 三个引擎主责，优先推进一个主引擎，另外两个先完成协议与骨架

后续可根据阶段调整为：

- A：前端 + 联调
- B：后端 + 数据层 + 部署
- C：检测引擎 + 规则能力

## 开发启动说明

当前仓库已经可以本地启动前后端最小联调链路：

- 后端默认监听 `http://127.0.0.1:3000`
- 前端默认监听 `http://127.0.0.1:5173`
- 前端开发服务器会将 `/api` 和 `/health` 代理到后端

### 环境要求

- Node.js `>=22.19.0`
- 建议使用仓库当前声明的 `pnpm@10.0.0` 安装依赖

### 安装依赖

在仓库根目录执行：

```powershell
corepack enable
pnpm install
```

Linux / macOS 可直接执行：

```bash
corepack enable
pnpm install
```

### 启动后端

`backend/` 当前还没有单独的 `dev` 脚本，按下面方式直接启动：

Linux / macOS:

```bash
cd backend
PORT=3000 node --experimental-strip-types src/main.ts
```

Windows PowerShell:

```powershell
Set-Location backend
$env:PORT = "3000"
node --experimental-strip-types src/main.ts
```

启动成功后，可通过以下地址检查健康状态：

- `http://127.0.0.1:3000/health`

### 启动前端

打开第二个终端，在仓库根目录执行：

Linux / macOS:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Windows PowerShell:

```powershell
Set-Location frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

如果不是 Windows PowerShell，可将上面的 `npm.cmd` 替换为 `npm`。

如果你当前就在 Linux 环境，推荐直接使用上面的 bash 命令，不需要 `npm.cmd`。

### 访问入口

- 前端控制台：`http://127.0.0.1:5173/`
- 后端健康检查：`http://127.0.0.1:3000/health`

前端页面访问到的 `/api/*` 和 `/health` 请求会通过 Vite 代理转发到后端，无需额外配置。

### 本地验证命令

在仓库根目录执行：

- 全量测试：`npm run test`
- 仓库边界测试：`npm run test:repo`
- 共享契约测试：`npm run test:shared`
- 后端任务中枢测试：`npm run test:backend`
- 前端后台骨架测试：`npm run test:frontend`

如果在 Windows PowerShell 中遇到 `npm` 执行策略限制，可改用 `npm.cmd`，或使用 `cmd /c npm run <script>`。

## 当前交付范围

当前仓库已包含：

- 第一版 monorepo 目录结构
- 仓库根说明文档
- 架构说明、开发计划、接口契约草案
- 前后端与三个引擎的职责说明
- `shared` 第一版共享契约与运行时规范化能力
- `backend` 最小任务中枢与内存级 API
- `frontend` 最小后台壳子、路由骨架和 `Overview` 页面
- `sandbox` 的 GENERAL-001 通用安全核心、策略归约和兼容适配器
- `sandbox` 的 GENERAL-002 生产 detector 组合、确定性 sanitizer、显式 Judge 协议适配器和 sealed benchmark 工具链

Sandbox Security Production currently adds production detector composition,
deterministic sanitization, selected Judge protocol adapters, and sealed
benchmark tooling. It remains engine-owned: no new backend REST route,
frontend DTO, persistent audit store, or deployment surface is opened by
GENERAL-002.

### GENERAL-002 benchmark boundary

The production entry point is
`createSandboxSecurityProductionEngine` in
`engines/sandbox/src/security-production/index.ts`. The hermetic benchmark
replay is a separate, credential-free command:

```bash
npm run benchmark:sandbox-security:replay
```

`benchmark:sandbox-security:qualify:live` is an explicit operator command and
is never included in `test:all`; ordinary CI uses only corpus validation and
the network-isolated replay gate. Replay fails closed until a formally signed
and sealed P6 evidence root is present. The current GENERAL-002 continuation
has no formal P6 acceptance and is not `VERIFIED`.

The external Judge channel is selected only from the mode-`600` operator
environment file: `SANDBOX_SECURITY_JUDGE_PROTOCOL`,
`SANDBOX_SECURITY_JUDGE_BASE_URL`, `SANDBOX_SECURITY_JUDGE_MODEL`, and
`SANDBOX_SECURITY_JUDGE_API_KEY` (with the enable flag). Source code contains
no provider URL, external model default, or credential. The local Ollama
`qwen3:8b` name remains a separate fixed digest-pinned benchmark requirement.

## Sandbox Security Core

Sandbox Security Core 的实际引擎入口是
`engines/sandbox/src/security/index.ts`，由
`createSandboxSecurityEngine` 构造评估引擎。引擎接受受信任适配器构造的
`SandboxSecurityEvaluationRequest`，返回版本化的
`sandbox-security-decision.v1` 决策 schema；平台层只消费归一化后的决策，
不直接依赖 detector 或 Judge 的内部结构。

当前核心边界包含 authoritative source、balanced/strict policy profile、
Monitor 与 Track1 兼容适配器，以及 fail-closed 的 finding qualification
与 policy reduction。
该入口用于 REQ-SBX-GENERAL-001 的核心联调与测试；GENERAL-002 生产能力位于
`engines/sandbox/src/security-production/`，不代表已开放新的后端 REST 路由。

Sandbox Security Core 当前仍未包含生产级通用 detector、sanitizer 和 external Judge；
这些 GENERAL-002 能力由相邻的 `security-production/` 模块
组合，冻结 Core 仅通过既有契约被调用。

### GENERAL-003 production startup

生产后端启动前必须提供且只读取以下四个 GENERAL-003 配置项：

- `SANDBOX_SECURITY_STORAGE_PATH`：绝对路径；父目录必须预先存在、为真实的
  `0700`（或更严格）目录，数据库及 `-wal`/`-shm` 文件必须是 `0600` 普通文件。
- `SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY`：无填充 canonical base64url，解码后
  必须正好 32 字节。
- `SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN`：32 个随机字节的无填充 canonical
  base64url 表示；该值只用于管理员认证，不会写入日志或数据库。
- `SANDBOX_SECURITY_PRODUCTION_MODE`：固定为 `rule_only`、`local` 或
  `local_and_judge`，进程生命周期内不可切换。

`startProductionServers` 先完成配置规范化、HMAC/projector、SQLite migration 和
完整性检查、repository/maintenance recovery，再由 production gateway 构造
GENERAL-002 Engine，最后才绑定 public/internal listener。任何缺失值、相对路径、
HMAC/database identity mismatch、migration/recovery/Engine 构造失败都会在 bind 前
fail-closed；`local` 与 `local_and_judge` 还必须满足 GENERAL-002 的私有 provider
配置先决条件。普通测试通过 `createProductionServers` 显式注入同一个 module，不能
借用隐式 test/default module。

关闭时两个 listener 先停止接收并等待 in-flight handler 完成，随后按
maintenance -> SQLite checkpoint/close 的逆序释放资源；partial bind 和任意 close
错误都会继续执行其余清理并以聚合错误报告。重复 close 不会重复释放资源。

配置与启动验证：

```bash
SANDBOX_SECURITY_STORAGE_PATH=/var/lib/agent-security/sandbox-security.sqlite \
SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY='<43-char-unpadded-base64url>' \
SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN='<43-char-unpadded-base64url>' \
SANDBOX_SECURITY_PRODUCTION_MODE=rule_only \
TRACK1_INGEST_TOKEN='<ingest-token>' \
node --experimental-strip-types backend/src/main.ts

npm run test:shared
npm run test:backend
npm run typecheck:backend
```

### GENERAL-004 protected OpenClaw enforcement runtime

REQ-SBX-GENERAL-004 packages a standalone, patched OpenClaw `2026.6.34`
runtime that enforces the GENERAL-002 Engine at four awaited barriers
(`before_agent_run`, `before_model_output_delivery`, `before_tool_execution`,
`before_message_delivery`). It is isolated from Track 1 (which stays on OpenClaw
`2026.6.10`) and adds no public route. The full operator runbook —
prerequisites, dedicated `sbxcap_v1.*` capability issuance (one-hour maximum TTL,
no automatic rotation), startup order, audit-degraded behavior, tmpfs/no-volume
model, health inspection, and safe stop — lives in
`deploy/sandbox-security/README.md`.

The image builds only the nested `integrations/openclaw/general-security`
package plus its public Engine/shared inputs, installs with the frozen nested
lockfile, verifies the official package identity, applies the sealed
`2026.6.34` patch, revalidates every post-patch hash, and reruns the
package/patch/four-barrier probe at container startup before hooks register. It
runs as non-root with a read-only root filesystem, all capabilities dropped,
`no-new-privileges`, no host port, no durable volume, and every OpenClaw
session/transcript/workspace/plugin-scratch path on tmpfs. Audit events flow
only to the internal
`POST /internal/sandbox/security/enforcement-events` route with the dedicated
`sandbox_security:enforcement:audit:write` capability.

```bash
# Build and probe the protected runtime (dummy-only config, no model call).
docker network create --internal sandbox-security-internal-audit
export SANDBOX_SECURITY_POLICY_PROFILE_ID=sandbox-security-balanced.v1
export SANDBOX_SECURITY_PRODUCTION_MODE=rule_only
export SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN=sbxcap_v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security config
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security build openclaw-security
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security run --rm --no-deps --entrypoint openclaw \
  openclaw-security plugins inspect agent-security-sandbox-general \
  --runtime --json
```

Expected: exact version `2026.6.34`, one `agent-security-sandbox-general`
plugin, all four barriers, registration count one, enforcement healthy, and
either healthy or the specified degraded audit when the backend is unattached.

# Track 1 OpenClaw Evidence Workflow

The Track 1 path uses Node.js `>=22.19.0`, `pnpm@10.0.0`, OpenClaw
`2026.6.10`, and digest-pinned runtime, browser, and report images.

Offline verification:

```powershell
npm.cmd run test:track1:openclaw
npm.cmd run test:track1:report
npm.cmd run test:track1:acceptance
npm.cmd run test:repo
```

Build the browser and report images:

```powershell
npm.cmd run test:track1:report:docker
```

Generate ignored fixture evidence (never competition evidence):

```powershell
npm.cmd run track1:evidence:fixture
```

The credentialed gate is explicit and never skips:

```powershell
npm.cmd run test:track1:openclaw:e2e
```

Before invoking it, place `OPENCLAW_MODEL_BASE_URL`,
`OPENCLAW_MODEL_API_KEY`, `OPENCLAW_MODEL_ID`, and a 32-byte-or-longer
`TRACK1_INGEST_TOKEN` in the local worker environment. Do not put credentials
in source, command arguments, reports, screenshots, or commits.

After a successful real run, rebuild/register a report and promote only an
independently accepted campaign:

```powershell
npm.cmd run report:track1 -- --campaign-id campaign:t1:<32-lowercase-hex>
node.exe --experimental-strip-types scripts/track1/promote-openclaw-baseline.ts --campaign-id campaign:t1:<32-lowercase-hex>
```

Fixture output under `artifacts/` is ignored. Only the nine-file allowlist may
be promoted to `docs/track1/evidence/openclaw-baseline/`.
