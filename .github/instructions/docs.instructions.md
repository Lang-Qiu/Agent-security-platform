---
description: "Use when updating docs/, requirement notes, architecture docs, progress logs, or other durable project documentation."
applyTo: "docs/**"
---

# Documentation Instructions

- Link to canonical sources instead of copying long contract or architecture sections across multiple docs.
- Keep one active requirement in [docs/sprint-current.md](../../docs/sprint-current.md); use [docs/progress.md](../../docs/progress.md) for completed requirement outcomes.
- Treat `docs/plans/` as design and execution planning material, not as the source of truth for completed implementation state.
- Treat `docs/temp/` as evidence and working artifacts; do not move durable architecture or API rules there.
- When a requirement changes contracts or architecture, keep [docs/api-contract.md](../../docs/api-contract.md), [docs/architecture.md](../../docs/architecture.md), and the implementation consistent.
- For doc-only tasks, state that the change is a documentation/configuration exception to full TDD instead of implying business behavior changed.
