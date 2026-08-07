# Re-review 2 — REQ-SBX-GENERAL-005

Date: 2026-08-07
Reviewer: independent scoped re-reviewer

---

## Finding: Function name mismatch between spec §Frontend Service Signatures and Phase 2 plan P2-T3

**ADDRESSED.** The spec §Frontend Service Signatures (lines 447–464 of the design doc) now declares `evaluateSandboxSecurityRequest` and `readSandboxSecurityAuditPage`, with an explicit inline comment — "Function names match the Phase 2 plan test imports (authoritative RED tests)" — and the input shapes in the spec (capabilityToken, idempotencyKey, requestId, stage, policyProfileId, contentItems, toolRequest?, options? for evaluate; capabilityToken, limit, cursor?, options? for read) match the fixture call sites in P2-T3 exactly.

---

## New breakage

None.

---

## Final verdict

RE-REVIEW PASS
