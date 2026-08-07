# GENERAL-005 Independent Review

Verdict: **FAIL** (Critical 2, Important 2, Minor 1)

Reviewer: in-session review against shared types and all 7 documents.
Date: 2026-08-07

---

## Findings

### [CRITICAL] P2-T2 json_nodes test uses snake_case field names inconsistent with the function's camelCase API

Location: Phase 2 plan, §Task P2-T2, Step 1 — the final test case ("rejects a JSON value exceeding the shared node bound")

Finding: Every other test in P2-T2 passes `contentItems` (camelCase) to `validateEvaluationRequest`. The json_nodes test passes `content_items` (snake_case) and an extra `policy_profile_id` field that the function does not accept. If the function is implemented to match the six other test cases (camelCase `contentItems`), calling it with `content_items: [...]` leaves `contentItems` as `undefined`, which triggers the "content_items" (empty/missing items) violation — not the "json_nodes" violation the test asserts. The assertion `expect(result.violations.some(v => v.rule === "json_nodes")).toBe(true)` would then fail for the wrong reason, breaking TDD's RED guarantee.

Evidence:
```ts
// ALL other P2-T2 tests use camelCase:
validateEvaluationRequest({ stage: "user_input", contentItems: [...] })

// json_nodes test uses snake_case and extra field:
const result = validateEvaluationRequest({
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",  // not in the function API
  content_items: [{ ... }]                             // snake_case, not camelCase
});
expect(result.violations.some((v) => v.rule === "json_nodes")).toBe(true);
```

Suggested fix: Replace the json_nodes test call to use `contentItems` (camelCase) matching every other test in the same file, and remove `policy_profile_id`:
```ts
const result = validateEvaluationRequest({
  stage: "user_input",
  contentItems: [
    {
      source_id: "src-1",
      claimed_source_type: "user_input",
      media_type: "application/json",
      value: wide,
      provenance_ref: "source://client/1"
    }
  ]
});
```

---

### [CRITICAL] P5-T1 static storage gate calls undefined `collectSourceFiles` helper

Location: Phase 5 plan, §Task P5-T1, Step 4

Finding: The static storage gate test added to `tests/repository/sandbox-security-frontend-spec.spec.ts` calls `collectSourceFiles(relative)` but that function is never defined, imported, or exported in that file or in any file shown in the plan. The existing Phase 1 test uses only a `read(path)` helper. The gate cannot compile or run as written; an implementer would get a `ReferenceError: collectSourceFiles is not defined` at runtime.

Evidence:
```ts
// Phase 5, Step 4 — collectSourceFiles used but never defined:
for (const relative of roots) {
  for (const file of collectSourceFiles(relative)) {   // ← undefined
    const source = read(file);
    ...
  }
}
```

Suggested fix: Define `collectSourceFiles` in the gate test, e.g.:
```ts
import { readdirSync, statSync } from "node:fs";

function collectSourceFiles(relativePath: string): string[] {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  const stat = statSync(url, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return [relativePath];
  return readdirSync(url, { recursive: true })
    .map((f) => `${relativePath}/${f}`)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}
```
Add this definition to the plan's Step 4 snippet so the implementer knows exactly what to write.

---

### [IMPORTANT] Spec and plan use different type name and discriminant for the service result union

Location: Spec §Frontend Service Signatures vs Phase 2 plan §Locked Transport Contract

Finding: The spec defines `SandboxSecurityRequestOutcome<T>` with a `status` discriminant (`status: "ok"`, `status: "error"`, etc.) and `httpStatus: number | null`. Phase 2 defines `SandboxSecurityCallResult<T>` with a `kind` discriminant (`kind: "ok"`, `kind: "error"`, etc.) and `httpStatus: number` (non-nullable). Every test in Phase 2 (P2-T1, P2-T3) and Phase 4 (P4-T1) uses `result.kind`, confirming the tests enforce the plan's interface. An implementer who reads the spec first and implements `status`/`SandboxSecurityRequestOutcome` will see the Phase 2 and Phase 4 tests fail immediately, because the tests use `result.kind`.

Evidence:
```ts
// Spec (§Frontend Service Signatures):
export type SandboxSecurityRequestOutcome<T> =
  | { status: "ok"; data: T }
  | { status: "error"; errorCode: ...; httpStatus: number | null; ... }

// Phase 2 plan (§Locked Transport Contract) and all tests:
export type SandboxSecurityCallResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "error"; httpStatus: number; errorCode: string | null; ... }

// Phase 2 test assertion:
expect(result).toEqual({ kind: "error", httpStatus: 429, ... });
```

Suggested fix: Update the spec §Frontend Service Signatures to match the plan's interface (the plan + tests are internally consistent; the spec text is the outlier):
- Rename `SandboxSecurityRequestOutcome<T>` → `SandboxSecurityCallResult<T>`
- Change discriminant from `status` to `kind`
- Change `httpStatus: number | null` → `httpStatus: number` (matching plan and tests)
- Update the service function return types accordingly

---

### [IMPORTANT] P4-T3 commit step omits `ConsoleLayout.tsx` from the file list

Location: Phase 4 plan, §Task P4-T3, Step 4 (commit step)

Finding: The task's Step 2 explicitly requires exactly one line change to `frontend/src/layouts/ConsoleLayout.tsx` (`defaultOpenKeys={["results", "sandbox-security"]}`), and both the spec (§Route and Navigation Surface) and the Phase 4 exit criteria enforce it. However, the commit step lists only three paths and omits `ConsoleLayout.tsx`:

```text
frontend/src/app/routes.tsx
frontend/src/app/navigation.tsx
frontend/src/app/sandbox-security-navigation.spec.tsx
```

An implementer following this commit step would not stage `ConsoleLayout.tsx`, leaving the sandbox-security group collapsed by default. The navigation test's `renderAppAtRoute("/sandbox-security/audit")` assertion would then fail because the link is absent from the DOM (CSSMotion returns null for a never-opened group).

Suggested fix: Add `ConsoleLayout.tsx` to the P4-T3 commit file list:
```text
frontend/src/app/routes.tsx
frontend/src/app/navigation.tsx
frontend/src/layouts/ConsoleLayout.tsx
frontend/src/app/sandbox-security-navigation.spec.tsx
```

---

### [MINOR] Phase 2 Entry Gate miscounts Phase 1 new frontend spec files

Location: Phase 2 plan, §Entry Gate

Finding: The entry gate says "Expected: 16 files green (15 pre-existing + `console-theme.spec.ts`)". Phase 1 creates two frontend spec files: `frontend/src/styles/console-theme.spec.ts` and `frontend/src/styles/console-theme.provider.spec.tsx`. After Phase 1 the count is 17, not 16.

Evidence (Phase 1 creates):
```
frontend/src/styles/console-theme.spec.ts       ← counted
frontend/src/styles/console-theme.provider.spec.tsx  ← not counted
tests/repository/sandbox-security-frontend-spec.spec.ts  ← repo test, not in frontend count
tests/repository/frontend-console-theme-literals.spec.ts ← repo test, not in frontend count
```

Suggested fix: Change the entry gate to:
```
Expected: 17 files green (15 pre-existing + console-theme.spec.ts + console-theme.provider.spec.tsx),
221 pre-existing tests plus Phase 1's new cases.
```

---

## Summary

| Severity | Count |
|---|---|
| Critical | 2 |
| Important | 2 |
| Minor | 1 |
