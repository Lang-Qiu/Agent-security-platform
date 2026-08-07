# GENERAL-005 Re-Review Report

**Date:** 2026-08-07
**Reviewer role:** Independent scoped re-reviewer
**Scope:** Verify the 5 original findings are addressed and flag any new breakage introduced by the fixes.

---

## Finding Verdicts

### [CRITICAL-1] P2-T2 json_nodes test used snake_case `content_items` instead of camelCase `contentItems`

**ADDRESSED.** The `json_nodes` test in Phase 2 plan P2-T2 (final `it` block) now passes `contentItems` (camelCase) to `validateEvaluationRequest`, includes an inline comment explaining why snake_case would silently trigger the wrong violation, and carries no `policy_profile_id` field.

---

### [CRITICAL-2] P5-T1 static storage gate called undefined `collectSourceFiles`

**ADDRESSED.** Phase 5 plan P5-T1 Step 4 now includes the full `collectSourceFiles` helper definition (using `statSync` and `readdirSync` from `node:fs`) placed before the gate test that calls it, with the `import` statement shown at the top of the added block.

---

### [IMPORTANT-1] Spec and plan used different type name and discriminant for the service result union

**ADDRESSED.** The spec §Frontend Service Signatures now declares `SandboxSecurityCallResult<T>` (not `SandboxSecurityRequestOutcome<T>`), uses `kind` as the discriminant (not `status`), and the `error` branch carries `httpStatus: number` (non-nullable). An inline comment confirms the non-nullable contract. Both function return types (`submitSandboxSecurityEvaluation`, `fetchSandboxSecurityAuditPage`) are typed as `Promise<SandboxSecurityCallResult<…>>`. The Phase 2 Locked Transport Contract block reproduces the same union definition consistently.

---

### [IMPORTANT-2] P4-T3 commit step omitted `ConsoleLayout.tsx`

**ADDRESSED.** Phase 4 P4-T3 Step 4 commit list now includes `frontend/src/layouts/ConsoleLayout.tsx` as the third entry, with an explanatory note immediately after the list stating that omitting it would leave the sandbox-security group collapsed and cause the navigation test to fail (CSSMotion returns null for a never-opened group).

---

### [MINOR] Phase 2 Entry Gate miscounted Phase 1 new frontend spec files

**ADDRESSED.** The Phase 2 Entry Gate now reads "17 files green (15 pre-existing + `console-theme.spec.ts` + `console-theme.provider.spec.tsx`)", correctly counting both new Phase 1 spec files and arriving at 17.

---

## New Breakage Introduced by the Fixes

One Important discrepancy is present in the post-fix documents:

**[IMPORTANT] Function name mismatch between spec §Frontend Service Signatures and Phase 2 plan implementation.**
The spec §Frontend Service Signatures declares `submitSandboxSecurityEvaluation` and `fetchSandboxSecurityAuditPage`, but the Phase 2 plan P2-T3 test (the authoritative RED test) imports and calls `evaluateSandboxSecurityRequest` and `readSandboxSecurityAuditPage`. A worker following both documents would face contradictory function names and either build the wrong contract or need to reconcile them ad hoc. The Phase 2 test code is what drives the actual implementation, so the spec signature section is now misaligned with the plan. This was not introduced by one of the five targeted fixes but is visible in the current document state and should be resolved before Phase 2 implementation begins. Suggested fix: update the two function names in §Frontend Service Signatures to match the Phase 2 plan test signatures (`evaluateSandboxSecurityRequest` / `readSandboxSecurityAuditPage`), or vice versa if the spec names are intended to be canonical.

No other new Critical or Important issues were introduced by the fixes.

---

## Final Verdict

**RE-REVIEW FAIL**

All five original findings are addressed. However, a new Important discrepancy (function name mismatch between spec and plan) is present and must be resolved before a worker begins Phase 2 implementation.
