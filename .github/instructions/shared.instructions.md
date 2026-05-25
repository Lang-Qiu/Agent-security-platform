---
description: "Use when editing shared contracts, shared types, shared constants, or other cross-boundary models in shared/."
applyTo: "shared/**"
---

# Shared Contract Instructions

- `shared/` is only for cross-boundary contracts, shared types, shared constants, and low-coupling utilities.
- If a type or helper is used by only one module, keep it local instead of expanding `shared/`.
- Preserve the stable outer shells already used across the platform, especially `Task`, `BaseResult`, `RiskSummary`, and `ApiResponse`.
- Contract changes must stay aligned with [docs/api-contract.md](../../docs/api-contract.md) and any affected tests in the same task.
- Prefer explicit boundary typing and stable `snake_case` field names for JSON-facing contracts.
- If a change would break multiple modules or widen a public contract, stop and confirm scope before continuing.
