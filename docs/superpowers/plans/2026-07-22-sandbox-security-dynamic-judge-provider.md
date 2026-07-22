# Dynamic Judge Provider Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed OpenAI Judge vendor/endpoint/model/credential/enable variables with a source-controlled allowlisted, process-immutable, dynamically selected Judge provider while keeping `sandbox-security-benchmark.v1` in place.

**Architecture:** Only `production-config.ts` reads Judge env vars. It resolves an allowlisted provider (initial: Doro `https://doro.lol/v1` → Responses `https://doro.lol/v1/responses`), validates a safe requested model, and privately hands the API key plus resolved non-secret provider fields to the default HTTP transport once. Judge wire types remain OpenAI Responses protocol names; persisted evidence records the actual provider ID, base URL, Responses URL, requested model, and resolved model. Capture manifest replaces `openai_model` with five non-secret fields; P7 later consumes sealed evidence only.

**Tech Stack:** Node.js ≥22.19 TypeScript, `node:test`, existing security-production tree, benchmark scripts under `scripts/benchmark/sandbox-security/`.

**Canonical amendment:** `docs/superpowers/specs/2026-07-22-sandbox-security-dynamic-judge-provider-amendment.md`

**Constraint (AGENTS.md / TDD):** No production code without a failing test first. One task closed at a time: Design → RED → GREEN → docs touch as needed → report. Do not create seals or run real credentialed capture in this plan's deterministic tasks.

---

## File Map

| Area | Create / Modify |
| --- | --- |
| Production config | `engines/sandbox/src/security-production/production-config.ts` |
| Config tests | `engines/sandbox/tests/sandbox-security-production-config.spec.ts` |
| HTTP transport | `engines/sandbox/src/security-production/http-transport.ts` |
| Transport tests | `engines/sandbox/tests/sandbox-security-production-transport.spec.ts` (if present) or related production transport tests |
| Judge contract | `engines/sandbox/src/security-production/openai-judge-contract.ts` |
| Contract tests | `engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts` |
| Judge detector | `engines/sandbox/src/security-production/openai-judge-detector.ts` |
| Detector tests | `engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts` |
| Provider outcomes | `engines/sandbox/src/security-production/provider-outcomes.ts` |
| Outcome tests | `engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts` |
| Benchmark composition | `engines/sandbox/src/security-production/benchmark-composition.ts` |
| Composition tests | `engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts` |
| Capture contracts | `scripts/benchmark/sandbox-security/contracts.ts` |
| Capture live | `scripts/benchmark/sandbox-security/capture-live.ts` |
| Capture parent | `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts` |
| Capture sink | `scripts/benchmark/sandbox-security/capture-sink.ts` |
| Benchmark tests | `tests/benchmark/sandbox-security-*.spec.ts` |
| Spec/docs | production-detectors spec, sprint-current, architecture/api as needed, progress |

---

### Task 1: Production config allowlist and new env surface

**Files:**
- Modify: `engines/sandbox/src/security-production/production-config.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-config.spec.ts`
- Modify (minimal signature only if required by config handoff): `engines/sandbox/src/security-production/http-transport.ts`

**Design:**
- Env names (only this module may read them for production):
  - `SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST` (existing)
  - `SANDBOX_SECURITY_JUDGE_BASE_URL`
  - `SANDBOX_SECURITY_JUDGE_MODEL`
  - `SANDBOX_SECURITY_JUDGE_API_KEY`
  - `SANDBOX_SECURITY_ENABLE_JUDGE`
- Reject former Judge names: `OPENAI_API_KEY`, `SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE` (not valid config sources)
- Allowlist constant (source-controlled):
  - provider_id `doro`
  - base_url `https://doro.lol/v1`
  - responses_url `https://doro.lol/v1/responses`
- Model regex: `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$`
- API key: nonempty after trim; reject ASCII controls `\u0000-\u001f\u007f`
- Enable: exact `"1"` (no alternate truthy forms)
- Base URL: exact canonical match to allowlist base URL after trim
- Summary may expose: `judge_configured`, `judge_provider_id`, `judge_base_url`, `judge_responses_url`, `judge_requested_model` (+ existing ollama fields). Never API key.
- Private WeakMap state: digest, api key, responses_url (and any other non-secret fields transport needs). Single-use handoff to default transport; clear intermediates.

- [ ] **Step 1: Write failing config tests**

Replace/extend tests so `validJudgeEnv()` becomes:

```ts
const DORO_BASE = "https://doro.lol/v1";
const DORO_RESPONSES = "https://doro.lol/v1/responses";
const REQUESTED_MODEL = "gpt-5.4-mini";

function validJudgeEnv(): Record<string, string | undefined> {
  return {
    SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: VALID_DIGEST,
    SANDBOX_SECURITY_JUDGE_BASE_URL: DORO_BASE,
    SANDBOX_SECURITY_JUDGE_MODEL: REQUESTED_MODEL,
    SANDBOX_SECURITY_JUDGE_API_KEY: PRIVATE_API_KEY,
    SANDBOX_SECURITY_ENABLE_JUDGE: "1"
  };
}
```

Required scenarios (test names must include requirement + scenario):
1. Accept allowlisted base URL + safe model + key + enable=1; summary includes provider fields, no key leakage
2. Reject unallowlisted base URL, credential-bearing URL, query/fragment URL, http URL, trailing slash variant if not exact
3. Reject malformed models (empty, leading punctuation, controls, overlength)
4. Reject empty/whitespace/control keys; reject enable != exact `1`
5. Former `OPENAI_API_KEY` / `SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE` alone do not configure Judge
6. Source gate: only config module reads `process.env`; uppercase env string literals are the five allowed names (not old OpenAI names)
7. Transport handoff source still clears key; passes resolved responses URL + key (new option names)
8. local mode still does not read Judge keys

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-config.spec.ts
```

Expected: FAIL on new assertions (missing env names, missing summary fields, still accepting OPENAI_*).

- [ ] **Step 3: Minimal GREEN implementation in production-config.ts**

Implement allowlist resolution, validation, summary, private state, transport handoff options matching tests. If transport constructor keys change, add minimal accept-and-store of `judge_api_key` + `judge_responses_url` in `http-transport.ts` without yet switching request URL if a separate Task 2 owns live request URL (prefer Task 1+2 coupled if tests require URL already).

- [ ] **Step 4: Re-run config tests GREEN**

Same command; all must PASS.

- [ ] **Step 5: Commit (only if user requested commits; otherwise skip)**

```bash
git add engines/sandbox/src/security-production/production-config.ts \
  engines/sandbox/tests/sandbox-security-production-config.spec.ts \
  engines/sandbox/src/security-production/http-transport.ts
git commit -m "feat(sandbox): select allowlisted Judge provider at config boundary"
```

---

### Task 2: HTTP transport uses resolved Responses URL

**Files:**
- Modify: `engines/sandbox/src/security-production/http-transport.ts`
- Modify: transport-related production tests (search `OPENAI_RESPONSES_URL` / `api.openai.com`)

**Design:**
- Remove hard-coded `https://api.openai.com/v1/responses` as sole destination
- Construction requires non-null `judge_api_key` + allowlisted `judge_responses_url` when Judge is configured; null/null when not
- Judge POST uses resolved `judge_responses_url` only; never an arbitrary env URL
- Keep provider wire name `"openai"` + operation `"responses"` as protocol labels

- [ ] **Step 1: RED tests** for allowlisted URL used, missing URL fails closed, key still not logged
- [ ] **Step 2: GREEN** transport
- [ ] **Step 3: Verify** production transport tests

---

### Task 3: Judge request/response dynamic model

**Files:**
- Modify: `openai-judge-contract.ts`, `openai-judge-detector.ts`
- Modify: `sandbox-security-production-openai-contract.spec.ts`, `...-openai-detector.spec.ts`

**Design:**
- Request builder accepts `judge_requested_model: string` (already validated by config)
- Serialize dynamic `model` field; keep store:false, reasoning low, strict schema
- Parser accepts bounded non-empty model string as `judge_resolved_model` (alias OK; need not equal requested)
- Detector propagates resolved model into normalized outcome
- Reject missing/malformed resolved model

- [ ] RED → GREEN → verify contract + detector tests

---

### Task 4: Provider outcomes + sealed provider config binding

**Files:**
- Modify: `provider-outcomes.ts`, `benchmark-composition.ts`
- Modify matching tests

**Design:**
- `SandboxSecurityReplayOpenAIResponse.model` becomes bounded `string` (not only `gpt-5.6-terra`)
- Sealed provider config replaces `openai_model` with:
  - `judge_provider_id`
  - `judge_base_url`
  - `judge_responses_url`
  - `judge_requested_model`
  - `judge_resolved_model`
- Composition validates structural bounds; no secrets

- [ ] RED → GREEN → verify composition + outcome tests

---

### Task 5: Benchmark capture contracts, live capture, parent env handoff

**Files:**
- Modify: `scripts/benchmark/sandbox-security/contracts.ts`
- Modify: `capture-live.ts`, `prepare-capture-bundle.ts`, `capture-sink.ts`
- Modify: `tests/benchmark/sandbox-security-contracts.spec.ts`, `capture-live.spec.ts`, `isolation.spec.ts`, related

**Design:**
- Capture schema `sandbox-security-benchmark-capture.v1` in place: drop `openai_model`; add five judge fields
- Cassette normalized Judge response retains resolved model string
- `prepare-capture-bundle` child env closed list adds (when present):
  - `SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST`
  - `SANDBOX_SECURITY_JUDGE_BASE_URL`
  - `SANDBOX_SECURITY_JUDGE_MODEL`
  - `SANDBOX_SECURITY_JUDGE_API_KEY`
  - `SANDBOX_SECURITY_ENABLE_JUDGE`
  Never put values in argv/bundle metadata/stdout/stderr/tracked files
- Live readiness: success path normalizes provider response and records resolved model; drift fails closed
- Secret scans: reject new key name in artifacts; stop requiring only `OPENAI_API_KEY` as sole secret token (include `SANDBOX_SECURITY_JUDGE_API_KEY`)

- [ ] RED → GREEN → verify benchmark tests (not real P6-T4 live)

---

### Task 6: Documentation and progress closure

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-sandbox-security-production-detectors-spec.md` (Judge sections)
- Modify: `docs/sprint-current.md` (current work points at amendment)
- Modify: `docs/architecture.md` / `docs/api-contract.md` if Judge config is documented
- Modify: `docs/progress.md`
- Modify plan Phase 6/7 env name references where they freeze old OpenAI names
- Modify repository plan/spec lock tests if they pin old names

- [ ] Doc-only updates; run affected repository lock tests
- [ ] Record: deterministic gates GREEN; P6-T4 still requires real credential + Ollama pin separately

---

## Spec Coverage Checklist

| Amendment requirement | Task |
| --- | --- |
| Source-controlled endpoint allowlist (Doro first) | T1 |
| Runtime model selection with safe regex | T1, T3 |
| `SANDBOX_SECURITY_JUDGE_API_KEY` only; never expose | T1, T5 |
| `SANDBOX_SECURITY_ENABLE_JUDGE=1`; reject old enable/key names | T1 |
| Config-only env reads | T1 |
| Transport receives resolved Responses URL | T2 |
| Requested vs resolved model; alias OK; drift fails | T3, T5 |
| Capture manifest five fields; seal binds via capture hash | T4, T5 |
| Parent closed env handoff | T5 |
| Docs/plan/progress update | T6 |
| No v2 corpus; no fabricated seal | all |

## Out of scope

- Creating `capture.json` / `replay/` / `seal.json`
- Real Doro credentialed P6-T4 run (only after deterministic GREEN)
- GENERAL-001 core changes
- Adding arbitrary third-party endpoints without allowlist source change

