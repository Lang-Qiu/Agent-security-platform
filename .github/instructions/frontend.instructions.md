---
description: "Use when working in frontend/ React code, UI routes, frontend tests, or API consumption patterns."
applyTo: "frontend/**"
---

# Frontend Instructions

- Keep operator-facing console surfaces in an information-dense admin-console style aligned with Ant Design Pro simple, not a marketing layout.
- Authorized exception (user decision, `2026-08-09`): the public product landing route is a presentation surface and may use landing-page composition, expressive motion, and dedicated presentation components kept under a landing-only directory. This exception does not extend to any console route, and must not change console behavior, the URL semantics of existing console paths, or business logic.
- Frontend code must consume platform APIs only. Do not couple pages or services directly to engine-internal payloads or engine-private routes.
- Reuse `shared/` contracts for cross-boundary types when practical; avoid duplicating task, status, risk, or result enums locally.
- Keep page-level data loading separate from presentational components when that makes testing or iteration clearer.
- Before changing request or response assumptions, re-check [docs/api-contract.md](../../docs/api-contract.md) and [metadata.md](../../metadata.md).
- Validate with the narrowest relevant Vitest spec first, then widen to `npm run test --prefix frontend` or `npm run test:frontend` as needed.
