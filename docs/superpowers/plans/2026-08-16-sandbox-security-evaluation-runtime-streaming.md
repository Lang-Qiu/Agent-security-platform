# Sandbox Security Evaluation Runtime Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver real ordered SOURCE, RULE, MODEL, JUDGE, and DECISION events to the sandbox-security workbench while preserving the existing JSON API and final result presentation.

**Architecture:** Add an exact-key shared SSE event contract. The sandbox engine receives a narrow stage observer and reports terminal detector outcomes in execution order; the evaluation service maps those observations to bounded content-free events and emits DECISION only after existing idempotent completion persistence. The controller selects SSE only for `Accept: text/event-stream`; the React page consumes validated events in memory and hands the final decision to the existing `EvaluationInspector` result DOM.

**Tech Stack:** TypeScript, Node.js HTTP streams, React 19, Vitest, existing shared normalizers and sandbox-security service/gateway boundaries.

---

### Task 1: Shared Streaming Contract

**Files:**
- Modify: `shared/types/sandbox-security-api.ts`
- Modify: `shared/contracts/sandbox-security-api.ts`
- Modify: `shared/index.ts`
- Test: `shared/contracts/sandbox-security-api.spec.ts`

- [ ] **Step 1: Write the failing tests** for accepting the five ordered event variants and rejecting reordered, extra-key, content-bearing, invalid-sequence, and malformed decision/error events.
- [ ] **Step 2: Run `npm run test:shared -- sandbox-security-api` and verify RED** because the stream types and normalizer exports do not exist.
- [ ] **Step 3: Add `SandboxSecurityEvaluationStreamEvent` types and `normalizeSandboxSecurityEvaluationStreamEvent` with exact-key, content-free validation.**
- [ ] **Step 4: Re-run the focused shared suite and verify GREEN.**

### Task 2: Engine Stage Observer

**Files:**
- Modify: `engines/sandbox/src/security/engine.ts`
- Modify: `engines/sandbox/src/security/index.ts`
- Test: `engines/sandbox/src/security/engine.spec.ts`

- [ ] **Step 1: Write failing tests** proving SOURCE then RULE then MODEL then JUDGE order, one terminal event per stage, explicit skipped events for short-circuit/routing, and no observer callback before source snapshot creation.
- [ ] **Step 2: Run the focused engine suite and verify RED** on the missing observer signature/behavior.
- [ ] **Step 3: Add the optional narrow observer parameter and invoke it only at real terminal points, including skipped detector slots, without exposing detector payloads.**
- [ ] **Step 4: Run engine tests and existing sandbox tests; verify GREEN.**

### Task 3: Backend SSE Service and Controller

**Files:**
- Modify: `backend/src/modules/sandbox-security/ports/evaluation.gateway.ts`
- Modify: `backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts`
- Modify: `backend/src/modules/sandbox-security/evaluation.service.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.controller.ts`
- Modify: `backend/src/common/http/http-response.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.types.ts`
- Tests: `backend/tests/sandbox-security-evaluation.service.spec.ts`, `tests/integration/backend-sandbox-security.api.spec.ts`

- [ ] **Step 1: Write failing tests** for live SSE framing, JSON compatibility without the Accept header, ordered stage delivery, skipped stages, DECISION-after-persistence ordering, replay synthesis, pre-header JSON errors, post-header content-free error events, and abort propagation.
- [ ] **Step 2: Run focused backend and integration tests and verify RED** for the absent stream branch.
- [ ] **Step 3: Implement a bounded five-event queue, gateway observer mapping, replay synthesis, SSE writer, Accept negotiation, and abort signal propagation while retaining the existing JSON path.**
- [ ] **Step 4: Run focused backend suites and verify GREEN.**

### Task 4: Frontend Stream Client and Workbench Runtime State

**Files:**
- Modify: `frontend/src/services/api-client.ts`
- Modify: `frontend/src/services/sandbox-security-service.ts`
- Modify: `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx`
- Modify: `frontend/src/components/sandbox-security/EvaluationInspector.tsx`
- Create if needed: `frontend/src/components/sandbox-security/RuntimeStageList.tsx`
- Tests: `frontend/src/services/sandbox-security-service.spec.ts`, `frontend/src/pages/SandboxSecurityWorkbenchPage.spec.tsx`, `frontend/src/components/sandbox-security/EvaluationInspector.spec.tsx`

- [ ] **Step 1: Write failing tests** for SSE parsing, authorization/idempotency/Accept headers, sequence reconciliation, stage visibility as events arrive, safe skipped/error metadata, and final handoff to the unchanged result presentation.
- [ ] **Step 2: Run focused frontend tests and verify RED** because the client has only one-shot JSON handling and timer-based reveal.
- [ ] **Step 3: Implement the stream parser and in-memory `runtimeStages` state; render a fixed five-row runtime list and pass the final decision into the existing result branch, removing detector-streaming claims from timed reveal behavior.**
- [ ] **Step 4: Run focused frontend tests and verify GREEN.**

### Task 5: Documentation, Full Verification, and Review

**Files:**
- Modify: `docs/sprint-current.md`
- Modify: `README.md` if required by the public API change
- Modify: `docs/architecture.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/progress.md`

- [ ] **Step 1: Update the API and architecture documentation** with the SSE representation, event schema, compatibility rules, and privacy boundaries.
- [ ] **Step 2: Run `git diff --check`, focused suites, `npm run test:shared`, `npm run test:backend`, `npm run test:frontend`, and `npm run test:repo`; record any pre-existing baseline failures separately.**
- [ ] **Step 3: Perform the closing code review** using the code-reviewer checklist, fix any Critical or Important findings with a regression test, and re-run the affected tests.
- [ ] **Step 4: Mark `REQ-SBX-GENERAL-006` complete in `docs/progress.md` and stop.**
