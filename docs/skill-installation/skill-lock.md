# Installed Skill Lock

安装时间：2026-08-05T17:37:32+08:00

| Skill | 来源仓库 | 上游路径 | Commit SHA | 安装方式 | 安装作用域 | 本地路径 |
|---|---|---|---|---|---|---|
| `academic-research-suite` | `Imbad0202/academic-research-skills-codex` | `plugins/ars-codex/skills/academic-research-suite` | `f8d6b061efe98564a3f554c917fce66dcef6ca54` | Codex Plugin marketplace + `codex plugin add` | user | `/root/.codex/plugins/cache/ars-codex/ars-codex/0.1.22/skills/academic-research-suite` |
| `doc-and-modernize` | `github/awesome-copilot` | `skills/doc-and-modernize` | `9db369d00f121542e1c99fd9b6cd6f707bade765` | `gh skill install` with `--agent codex --scope project --pin` | project | `/Agent-security-platform/.agents/skills/doc-and-modernize` |
| `architecture-blueprint-generator` | `github/awesome-copilot` | `skills/architecture-blueprint-generator` | `9db369d00f121542e1c99fd9b6cd6f707bade765` | official Git sparse-checkout manual fallback after `gh` API rate limit | project | `/Agent-security-platform/.agents/skills/architecture-blueprint-generator` |
| `doublecheck` | `github/awesome-copilot` | `skills/doublecheck` | `9db369d00f121542e1c99fd9b6cd6f707bade765` | official Git sparse-checkout manual fallback after `gh` API rate limit | project | `/Agent-security-platform/.agents/skills/doublecheck` |
| `agentic-eval` | `github/awesome-copilot` | `skills/agentic-eval` | `9db369d00f121542e1c99fd9b6cd6f707bade765` | official Git sparse-checkout manual fallback after `gh` API rate limit | project | `/Agent-security-platform/.agents/skills/agentic-eval` |
| `draw-io-diagram-generator` | `github/awesome-copilot` | `skills/draw-io-diagram-generator` | `9db369d00f121542e1c99fd9b6cd6f707bade765` | official Git sparse-checkout manual fallback after `gh` API rate limit | project | `/Agent-security-platform/.agents/skills/draw-io-diagram-generator` |

## Lock Notes

- `doc-and-modernize` contains GitHub CLI tracking metadata and is pinned to the commit above.
- The four manual-fallback Skills retain upstream frontmatter and complete support files. Their `gh skill list` entries have empty `sourceURL`/`version` because the CLI did not inject tracking metadata; this lock file is the installation record for their audited commit.
- `ciscn-work-report` and `ciscn-latex-report` intentionally have no lock entries because they are `CUSTOM_SKILL_PENDING_CREATION` and no trusted source was supplied.
- No Commit SHA is inferred for any uninstalled Skill.
