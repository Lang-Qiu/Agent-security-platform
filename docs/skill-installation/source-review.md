# Skill 来源审核

审核时间：2026-08-05（Asia/Shanghai）

## 审核范围与方法

- 公开仓库通过 `gh skill preview` 逐项预览，未执行任何 Skill 附带脚本。
- 通过只读 `git ls-remote`、临时浅克隆和 Git tree 检查确认仓库 HEAD、目录、文件模式和入口数量。
- 临时审核目录位于 `/tmp/awesome-copilot-source-review` 和 `/tmp/academic-research-skills-codex-source-review`，不属于项目安装目录。
- `gh skill preview` 的终端渲染没有显示源 frontmatter；对固定 commit 的 Git tree 文件直接检查后确认五个 awesome-copilot `SKILL.md` 均包含合法、非空的 `name` 和 `description`。GitHub CLI 安装的 Skill 另带来源 tracking metadata，人工回退副本保留上游 frontmatter，并由 `skill-lock.md` 记录来源 SHA。

## awesome-copilot

- Repository: `github/awesome-copilot`
- Branch: `main`
- Commit SHA: `9db369d00f121542e1c99fd9b6cd6f707bade765`
- 预览命令：`gh skill preview github/awesome-copilot <skill-name>`

| Skill | 上游路径 | 源内容身份 | 附带文件 | 风险结论 |
|---|---|---|---|---|
| `doc-and-modernize` | `skills/doc-and-modernize` | `name` 与目录一致，`description` 非空；正文为本地代码库架构文档和现代化规划工作流 | `references/copilot-instructions.template.md`、`references/migration-hazards.md` | 通过；要求优先读取本地仓库，并要求对远程事实标记不确定性；未发现凭据读取、上传或安装 hook 指令 |
| `architecture-blueprint-generator` | `skills/architecture-blueprint-generator` | `name` 与目录一致，`description` 非空；正文为技术栈、架构模式、模块和数据流分析提示 | 无 | 通过；纯提示型架构分析内容，未发现脚本、网络上传或凭据行为 |
| `doublecheck` | `skills/doublecheck` | `name` 与目录一致，`description` 非空；正文为三层事实核验和可追溯来源工作流 | `assets/verification-report-template.md` | 通过；包含按任务触发的 web search 说明，这是预期的外部事实核验能力；未发现凭据读取、代码上传或安装 hook |
| `agentic-eval` | `skills/agentic-eval` | `name` 与目录一致，`description` 非空；正文为生成、评估、批评、修改循环 | 无 | 通过；示例中的 `llm`/`run_tests` 是伪代码接口，不是随安装执行的脚本 |
| `draw-io-diagram-generator` | `skills/draw-io-diagram-generator` | `name` 与目录一致，`description` 非空；正文为可编辑 draw.io 图表生成、编辑和校验工作流 | `assets/templates/*`、`references/*`、`scripts/README.md`、`scripts/add-shape.py`、`scripts/validate-drawio.py` | 通过但需注意；两个 Python 文件均为上游普通文件权限 `100644`，本次只安装文件，不执行脚本；未发现上传、凭据或 post-install 行为 |

所有目标目录均真实存在且含 `SKILL.md`。预览命令均返回 0。awesome-copilot 目标目录中未发现 `hooks/`，也未发现 `100755` 可执行文件。

## ARS-Codex Plugin

- Repository: `Imbad0202/academic-research-skills-codex`
- Branch: `main`
- Commit SHA: `f8d6b061efe98564a3f554c917fce66dcef6ca54`
- Plugin path: `plugins/ars-codex`
- Plugin manifest: `plugins/ars-codex/.codex-plugin/plugin.json`
- Plugin version: `0.1.22`
- Target Skill path: `plugins/ars-codex/skills/academic-research-suite/SKILL.md`
- Root registered Skill count: 1
- Root Skill frontmatter: `name: academic-research-suite`，有非空 `description`，并声明 `metadata.version: 0.1.22`

### ARS 风险与边界

- Plugin manifest 只声明 `skills/`，没有 Codex hook 注册项或 post-install hook。
- `academic-research-suite` 内部包含 vendored `ars/` 的大量 references、templates、scripts，以及上游 Claude `ars/hooks/hooks.json` 和可执行 `run_guard.sh`；这些是随 Skill 内容保留的来源材料，不在本次执行。
- ARS `SKILL.md` 明确将 SessionStart/PreToolUse hooks、`ars_update_check.sh` 和 full-runtime hooks 标为 Claude/upstream 元数据，并要求 Codex 不安装或执行；本次遵守该边界。
- Skill 允许任务关联的 `WebSearch` 和受限 `Bash(python*)` 能力。外部文献查询、可选 bibliographic API 和跨模型上传只应由后续明确任务触发；文件中明确要求不得在未获同意时上传未发表稿件、私有笔记或完整语料。本次安装未读取凭据、未执行脚本、未访问这些运行期服务。
- 未发现安装期间自动读取凭据、上传项目代码或执行 post-install hook 的行为，因此未触发安全阻断。

## 结果判定

- `academic-research-suite`: 来源可信、入口唯一，允许按官方 Codex Plugin 流程安装。
- 五个 awesome-copilot Skill：来源可信、功能与本任务匹配，允许按 `gh skill install` 项目作用域安装。
- 本次没有发现需要标记为 `BLOCKED_BY_SECURITY_REVIEW` 的目标 Skill。
