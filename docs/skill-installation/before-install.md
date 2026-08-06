# Skill 安装前清单

检查时间：2026-08-05（Asia/Shanghai）

## 仓库与工作区

- Repo root: `/Agent-security-platform`
- `pwd`: `/Agent-security-platform`
- `git rev-parse --show-toplevel`: `/Agent-security-platform`
- 首次 `git status --short` 时已存在未提交修改，涉及 sandbox-security benchmark 文件；本任务不修改这些文件。
- 后续只读检查时工作区又出现了 `backend/src/modules/sandbox-security/sandbox-security.module.ts`、`backend/src/modules/sandbox-security/hmac.ts` 和 `package.json` 的变化；这些也被视为用户现有修改，本任务不触碰。

## 目标 Skill 盘点

| Skill | 安装位置 | 来源 | 当前版本 | 是否存在冲突 |
|---|---|---|---|---|
| `academic-research-suite` | 用户级 Codex Plugin | `Imbad0202/academic-research-skills-codex` | 不存在 | 否 |
| `doc-and-modernize` | 项目级 `.agents/skills/doc-and-modernize` | `github/awesome-copilot` | 不存在 | 否 |
| `architecture-blueprint-generator` | 项目级 `.agents/skills/architecture-blueprint-generator` | `github/awesome-copilot` | 不存在 | 否 |
| `doublecheck` | 项目级 `.agents/skills/doublecheck` | `github/awesome-copilot` | 不存在 | 否 |
| `agentic-eval` | 项目级 `.agents/skills/agentic-eval` | `github/awesome-copilot` | 不存在 | 否 |
| `draw-io-diagram-generator` | 项目级 `.agents/skills/draw-io-diagram-generator` | `github/awesome-copilot` | 不存在 | 否 |

## 现有目录与 Plugin

- 当前仓库 `.agents/skills`: 不存在或为空。
- 当前仓库父目录 `.agents/skills`: 不存在。
- `$HOME/.agents/skills`: 不存在。
- `$HOME/.codex/skills`: 仅有 Codex 预装 `.system` Skill：`imagegen`、`openai-docs`、`plugin-creator`、`skill-creator`、`skill-installer`。
- Codex 已安装 Plugin：`superpowers@openai-curated`，版本 `11c74d6b`；与本次目标名称不冲突。
- `gh skill list --agent codex --scope project`: `[]`。
- `gh skill list --agent codex --scope user`: 仅列出上述 5 个 `.system` Skill。

## 预备备份

目标 Skill 目录均不存在，因此没有执行覆盖，也没有创建 Skill 备份目录。任何后续覆盖操作仍必须先写入仓库根目录下的 `.skill-backups/<timestamp>/`。

## 明确不安装项

- `ciscn-work-report`: `CUSTOM_SKILL_PENDING_CREATION`，当前没有可信远程来源。
- `ciscn-latex-report`: `CUSTOM_SKILL_PENDING_CREATION`，当前没有可信远程来源。
- `md-to-docx` 及其他 Word 最终输出 Skill：不在本次范围内。
