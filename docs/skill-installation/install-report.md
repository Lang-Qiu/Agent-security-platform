# 竞赛作品报告辅助工作流 Skill 安装报告

安装时间：2026-08-05T17:37:32+08:00

## 1. 环境信息

| 项目 | 结果 |
|---|---|
| Repo root | `/Agent-security-platform` |
| WSL | WSL2，Linux kernel `6.18.33.2-microsoft-standard-WSL2` |
| Ubuntu | `Ubuntu 24.04.1 LTS (Noble Numbat)` |
| Codex | `codex-cli 0.144.1` |
| GitHub CLI | 初始未安装；现为官方 `gh version 2.97.0 (2026-07-31)` |
| Python | `Python 3.12.3` |
| Git | `git version 2.43.0` |
| GH_SKILL_COMMAND | `gh skill`；`gh skills` 是同一命令的别名 |

Codex 原生支持 `plugin marketplace add`、`plugin add`、`plugin list`。GitHub CLI 支持 `install`、`preview`、`list`、`update`，以及 `--scope`、`--agent`、`--force`、`--pin`。实际安装使用了项目 scope 和 `--agent codex`。

## 2. 安装前状态

- 初始仓库根目录检查：`pwd` 和 `git rev-parse --show-toplevel` 均为 `/Agent-security-platform`。
- 初始工作区已经存在未提交的 sandbox-security 相关修改；安装过程未修改这些文件。后续只读检查又观察到其他用户/并发修改，均未触碰。
- 当前仓库、父目录和 `$HOME/.agents/skills` 没有目标 Skill。
- `$HOME/.codex/skills` 只有系统预装 Skill：`imagegen`、`openai-docs`、`plugin-creator`、`skill-creator`、`skill-installer`。
- 已有用户级 Plugin 只有 `superpowers@openai-curated`，版本 `11c74d6b`，与目标名称不冲突。
- 安装前 `gh skill list --agent codex --scope project` 返回 `[]`。
- 安装前没有 `academic-research-suite`，也没有 `academic-paper`、`academic-pipeline`、`deep-research`、`academic-paper-reviewer`、`experiment-agent` 的独立入口。
- 目标目录不存在，因此没有覆盖操作，也没有创建 `.skill-backups/<timestamp>/`。安装期间只出现过一个由失败 CLI 尝试留下的空 `architecture-blueprint-generator` 目录，已移除；其中没有文件、版本或用户内容，不需要备份。

详细盘点见 [before-install.md](./before-install.md)。

## 3. 来源审核

### awesome-copilot

- Repository: `github/awesome-copilot`
- Branch: `main`
- Commit SHA: `9db369d00f121542e1c99fd9b6cd6f707bade765`
- 五个目标目录均真实存在，均含合法、非空的 frontmatter `name` 和 `description`。
- `doc-and-modernize` 含 2 个 references 文件；`doublecheck` 含 1 个 asset；draw.io Skill 含 5 个模板、3 个 references 和 2 个 Python scripts；其他目标没有附属脚本。
- draw.io 两个 Python 文件为上游权限 `100644`，本次未执行。五个项目 Skill 文件中没有可执行文件。
- `doublecheck` 的 web search 是其事实核验功能的一部分；未发现读取凭据、上传代码或 post-install hook。

### ARS-Codex

- Repository: `Imbad0202/academic-research-skills-codex`
- Branch: `main`
- Commit SHA: `f8d6b061efe98564a3f554c917fce66dcef6ca54`
- Plugin: `plugins/ars-codex/.codex-plugin/plugin.json`
- Plugin version: `0.1.22`
- 唯一 Codex Skill 入口：`plugins/ars-codex/skills/academic-research-suite/SKILL.md`。
- `SKILL.md` 的 `name` 为 `academic-research-suite`，有非空 `description` 和 `metadata.version: 0.1.22`。
- vendored `ars/` 内确实含大量 scripts，以及上游 Claude `ars/hooks/hooks.json` 和可执行 `run_guard.sh`。这些文件只被审查了名称、权限和内容，未执行。
- ARS Skill 明确将上游 Claude hooks、`ars_update_check.sh` 和 Codex full-runtime hooks 标为非默认/不执行的内容；Codex Plugin manifest 没有注册安装时 hook。
- ARS 支持任务触发的 `WebSearch` 和可选 bibliographic API；其安全边界要求外部上传前取得明确同意。本次安装未读取凭据、未上传项目文件或研究材料。

详细来源结论见 [source-review.md](./source-review.md)。

## 4. 安装结果

| Skill | 状态 | 作用域 | 本地路径 | 来源 Commit |
|---|---|---|---|---|
| `academic-research-suite` | `SUCCESS` | user | `/root/.codex/plugins/cache/ars-codex/ars-codex/0.1.22/skills/academic-research-suite` | `f8d6b061efe98564a3f554c917fce66dcef6ca54` |
| `doc-and-modernize` | `SUCCESS` | project | `/Agent-security-platform/.agents/skills/doc-and-modernize` | `9db369d00f121542e1c99fd9b6cd6f707bade765` |
| `architecture-blueprint-generator` | `SUCCESS` | project | `/Agent-security-platform/.agents/skills/architecture-blueprint-generator` | `9db369d00f121542e1c99fd9b6cd6f707bade765` |
| `doublecheck` | `SUCCESS` | project | `/Agent-security-platform/.agents/skills/doublecheck` | `9db369d00f121542e1c99fd9b6cd6f707bade765` |
| `agentic-eval` | `SUCCESS` | project | `/Agent-security-platform/.agents/skills/agentic-eval` | `9db369d00f121542e1c99fd9b6cd6f707bade765` |
| `draw-io-diagram-generator` | `SUCCESS` | project | `/Agent-security-platform/.agents/skills/draw-io-diagram-generator` | `9db369d00f121542e1c99fd9b6cd6f707bade765` |
| `ciscn-work-report` | `CUSTOM_SKILL_PENDING_CREATION` | - | 未安装 | - |
| `ciscn-latex-report` | `CUSTOM_SKILL_PENDING_CREATION` | - | 未安装 | - |

最终 `gh skill list --agent codex --scope project` 发现五个 awesome-copilot Skill。最终 ARS Plugin 列表显示 `ars-codex@ars-codex installed, enabled 0.1.22`。ARS 安装缓存中只有一个 `SKILL.md`，没有产生独立的 `academic-paper`、`academic-pipeline`、`deep-research`、`academic-paper-reviewer` 或 `experiment-agent` 入口。

没有出现最终状态 `SKIPPED_ALREADY_INSTALLED`、`UPDATED`、`FAILED` 或 `BLOCKED_BY_SECURITY_REVIEW` 的目标 Skill；CLI 回退失败过程见下一节。

## 5. 实际执行过的关键命令

环境与能力探测：

```text
pwd
git rev-parse --show-toplevel
git status --short
uname -a
cat /etc/os-release
command -v git && git --version
command -v python3 && python3 --version
command -v codex && codex --version
command -v gh && gh --version
codex --help
codex plugin --help
codex plugin marketplace --help
codex plugin marketplace add --help
codex plugin add --help
gh skill --help
gh skills --help
gh skill install --help
gh skill preview --help
gh skill list --help
gh skill update --help
```

来源预览与版本核对：

```text
gh skill preview github/awesome-copilot doc-and-modernize
gh skill preview github/awesome-copilot architecture-blueprint-generator
gh skill preview github/awesome-copilot doublecheck
gh skill preview github/awesome-copilot agentic-eval
gh skill preview github/awesome-copilot draw-io-diagram-generator
git ls-remote --symref https://github.com/github/awesome-copilot.git HEAD refs/heads/main
git ls-remote --symref https://github.com/Imbad0202/academic-research-skills-codex.git HEAD refs/heads/main
```

ARS Plugin 安装：

```text
codex plugin marketplace add Imbad0202/academic-research-skills-codex --ref main
codex plugin add ars-codex@ars-codex
codex plugin list
```

awesome-copilot 安装尝试和回退：

```text
gh skill install github/awesome-copilot doc-and-modernize --agent codex --scope project --pin 9db369d00f121542e1c99fd9b6cd6f707bade765
gh skill install github/awesome-copilot architecture-blueprint-generator --agent codex --scope project --pin 9db369d00f121542e1c99fd9b6cd6f707bade765
gh skill install github/awesome-copilot skills/architecture-blueprint-generator --agent codex --scope project --pin 9db369d00f121542e1c99fd9b6cd6f707bade765
gh skill install github/awesome-copilot doublecheck --agent codex --scope project --pin 9db369d00f121542e1c99fd9b6cd6f707bade765
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/github/awesome-copilot.git /tmp/awesome-copilot-source-review
git sparse-checkout set --no-cone 'skills/<skill-name>/**'
git read-tree -mu HEAD
cp -a /tmp/awesome-copilot-source-review/skills/<skill-name>/. /Agent-security-platform/.agents/skills/<skill-name>/
```

最终验证：

```text
find /Agent-security-platform/.agents/skills -maxdepth 3 -name SKILL.md -print
gh skill list --agent codex --scope project --json skillName,sourceURL,scope,version,pinned,path
codex plugin list --marketplace ars-codex
find /root/.codex/plugins/cache/ars-codex/ars-codex/0.1.22/skills -type f -name SKILL.md -print
```

## 6. 失败命令与错误摘要

- 初始 `command -v gh` 返回 1，`gh --version` 返回 command not found。已通过 GitHub 官方 APT 源安装 `gh 2.97.0`。
- `apt-get update` 对 Ubuntu `noble-security` 源出现连接失败 warning；APT 仍成功读取 GitHub 官方源并安装 `gh 2.97.0`。该 warning 没有影响最终 `gh` 版本。
- `gh skill install ... architecture-blueprint-generator ...` 和精确路径重试返回 `HTTP 403: API rate limit exceeded`。`doublecheck` 的 CLI 安装也返回同一未认证 API rate limit。当前没有可用 `GH_TOKEN`/`GITHUB_TOKEN`，因此没有伪造 CLI 成功状态。
- 第一次 `git archive` 和普通完整 `git clone` 遇到 GitHub TLS `GnuTLS recv error`、`early EOF`。官方 codeload 归档也曾部分传输并返回 `curl (18) Transferred a partial file`，断点续传返回 `curl (33) HTTP server doesn't seem to support byte ranges`。
- 使用已审核的 blobless shallow clone 逐目录 sparse-checkout 重试成功；每个回退目录的文件均与同一 commit 的 Git blob SHA 比对通过。回退过程中没有使用网页零散文本拼装，也没有执行 Skill 脚本。

## 7. 配置、权限和安全

- 用户级 Codex 配置已修改：`$HOME/.codex/config.toml` 新增 `ars-codex@ars-codex` Plugin 和 `ars-codex` marketplace；相应 marketplace/cache 目录已生成。既有 `superpowers` 配置未覆盖。
- 系统级 GitHub CLI 配置已新增 `/etc/apt/keyrings/githubcli-archive-keyring.gpg` 和 `/etc/apt/sources.list.d/github-cli.list`，keyring SHA256 为 `6084d5d7bd8e288441e0e94fc6275570895da18e6751f70f057485dc2d1a811b`，来源为 `https://cli.github.com/packages`。
- 没有用 `sudo` 执行安装或写入；当前 UID 为 0。仅运行过 `sudo -n -v` 作为无提示能力检查，没有 sudo 修改动作。
- 未覆盖已有目标 Skill，因此没有备份目录。`.skill-backups/` 当前不存在。
- 发现的可执行脚本：ARS vendored `ars/hooks/run_guard.sh` 及若干 `ars/scripts/*`；draw.io Python scripts 是 `100644`。所有脚本只查看了文件名/权限/内容，没有执行。
- 发现的运行期网络能力：`doublecheck` 的 web search、ARS 的 WebSearch 和可选 bibliographic API。这些不是安装时自动行为；本次未读取凭据、未上传代码或研究材料，也未触发任何 hook。
- 本次仓库写入仅限 `.agents/skills/` 和 `docs/skill-installation/`。其他 backend、frontend、tests、package.json、数据库、CI 或已有 docs 修改属于工作区原有/并发状态，本次未触碰。

## 8. 后续操作

1. 新建 Codex 会话，或重启当前 Codex 会话；不要假设当前会话已经重新加载了新 Skill。
2. 在新会话中运行 `/skills`，确认 `academic-research-suite`、`doc-and-modernize`、`architecture-blueprint-generator`、`doublecheck`、`agentic-eval`、`draw-io-diagram-generator` 可见。
3. 后续单独设计并创建 `ciscn-work-report`。
4. 后续单独设计并创建 `ciscn-latex-report`；本次没有安装来源不明的 LaTeX Skill。
5. 需要生成 LaTeX 报告时，再单独安装 XeLaTeX、`latexmk` 和中文字体依赖；本次没有安装完整 LaTeX 发行版。
6. 本次没有安装 `md-to-docx` 或其他以 Word 为最终输出的 Skill。
