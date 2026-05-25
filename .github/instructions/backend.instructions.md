---
description: "Use when working in backend/, backend tests, or backend API and task orchestration changes."
applyTo: "backend/**"
---

# Backend Instructions

- Keep backend code focused on platform orchestration, task lifecycle, result aggregation, and API exposure. Do not move engine-private detection logic into platform modules.
- Preserve the internal split between `task_type -> adapter` resolution and `engine_type -> engine client` resolution.
- Prefer NestJS-style boundaries: module, controller, service, adapter or client.
- If a backend change alters any cross-boundary DTO or response shape, update `shared/` and [docs/api-contract.md](../../docs/api-contract.md) in the same task.
- Read [metadata.md](../../metadata.md), [docs/architecture.md](../../docs/architecture.md), and [docs/sprint-current.md](../../docs/sprint-current.md) before widening a backend change.
- Keep the public task-centered API stable unless the current requirement explicitly changes the contract.
- Validate with the narrowest backend spec first, then widen to `npm run test:backend` only when the touched slice needs it.
- If backend validation is blocked by a missing `semgrep` binary in an unrelated `skills-static` path, report it as an environment dependency instead of changing unrelated code.
