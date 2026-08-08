# Task P4-T4: Awaited Final Assistant Projection Barrier

This is your requirements. Use the exact values, strings, file paths, and test
shapes here verbatim. This brief is extracted from
`docs/superpowers/plans/2026-08-06-sandbox-security-openclaw-enforcement-004-phase-4-openclaw-patch.md`.

**Files:**
- Create: `integrations/openclaw/general-security/tests/general-security-model-barrier.spec.ts`
- Modify through patch: `dist/lifecycle-hook-helpers-Dowa8zK4.js`
- Modify through patch: `dist/selection-DopzNY3I.js`
- Modify through patch: `dist/cli-runner-B0eKIePw.js`
- Modify through patch: `dist/run-attempt-6K7vbtby.js`
- Modify: `integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch`

- [ ] **Step 1: Write failing ordering tests**

The security hook receives final assistant texts/last assistant, exact tool
calls, and the prompt/run/session tuple read from the same active host turn
carrier. It is awaited before tool dispatch or delivery:

```ts
const order: string[] = [];
securityHook = async () => {
  order.push("security");
  await tick();
  order.push("security_done");
  return {
    outcome: "replace",
    replacement_code: "sandbox_security_policy_blocked",
    replacement_text: "Blocked by sandbox security policy."
  };
};
await runModelAttempt();
assert.deepEqual(order, ["security", "security_done", "replacement_send"]);
assert.equal(toolExecuted, false);
assert.equal(deliveredOriginal, false);
```

Cover every real call site, prior fire-and-forget behavior, post-model rewrite,
unknown block, all action/failure floors, correlation drift, host-only marker,
no original output, missing/inactive carrier, nested/concurrent carrier
isolation, and local run/session mismatch.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-model-barrier.spec.ts
```

Expected: FAIL because current `llm_output` is observation-only/fire-and-forget
and no final host replacement exists.

- [ ] **Step 3: Add only model-barrier hunks**

Extend the lifecycle helper and invoke the closed runner after the final
assistant projection. Replace the fire-and-forget acceptance path and patch all known
callers at their final-value boundaries. Read the active host turn context and
require its exact prompt/run/session identity before building the observation;
do not recover prompt content from history or plugin state. On replacement,
validate code/text,
attach the private host marker, suppress tool dispatch/original delivery, and
use the non-reentrant fixed replacement path. Keep ordinary `llm_output`
observation-only after the final gate.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-model-barrier.spec.ts \
  integrations/openclaw/general-security/tests/general-security-input-barrier.spec.ts
npm run test:integration:openclaw
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch \
  integrations/openclaw/general-security/tests/general-security-model-barrier.spec.ts
git commit -m "feat(openclaw): await final assistant security barrier"
```

## Binding constraints from the Master plan (Locked Action and Health Contract)

The closed action mapping and fixed replacement strings you must honor:
- `allow|alert` -> pass/continue.
- `ask` -> replace text `Security review required. This action was not completed.`
  (replacement_code `security_review_required`)
- `deny` -> replace text `Blocked by sandbox security policy.`
  (replacement_code `sandbox_security_policy_blocked`)
- required failure -> replace text
  `Security evaluation unavailable. This action was not completed.`
  (replacement_code `sandbox_security_evaluation_unavailable`)
- user/model/outbound failure floor -> `ask`. tool failure floor -> `deny`.
- audit failure changes only `audit`, never the selected host action.
- replacement provenance marker is the non-user-writable
  `openclaw-security-fixed-replacement.v1`.

Model-output failure floor is `ask` (this is a model barrier).

The three new patch hook names are exactly `before_model_output_delivery`,
`before_tool_execution`, `before_message_delivery`; the fourth existing barrier
is `before_agent_run`. Plugin ID is `agent-security-sandbox-general`.

Host turn carrier (from Master "Locked Host Turn Context"): normal turn uses one
inactive private capsule created by `withReplyDispatcher` before `params.run`,
whose `AsyncLocalStorage.run(...)` scope stays active through dispatcher
settlement and `waitForIdle()`. Model/tool/outbound call sites read the exact
host-owned tuple (schema `openclaw-security-turn-context.v1`, normalized current
prompt, `runId`, `sessionKey`). Use `run`, never `enterWith`. Detached, missing,
inactive, or mismatched reads fail closed. The plugin cannot reconstruct/retain
the raw prompt.

## Cross-phase RED discipline (Master)

Missing-module errors are NOT acceptable behavioral RED. Every test must import
an existing module boundary or a type-only export from an earlier green task;
RED must fail on the named missing behavior/assertion. The production patch must
never contain behavior written before its owning RED. Do not modify any Phase 5
production file, any Track 1 file outside `integrations/openclaw/general-security/`,
or GENERAL-001/002/003 semantics.
