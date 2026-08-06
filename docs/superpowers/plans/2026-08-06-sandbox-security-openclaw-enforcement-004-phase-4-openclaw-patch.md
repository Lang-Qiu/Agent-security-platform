# Phase 4 OpenClaw 2026.6.34 Patch and Final Barrier Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Apply a minimal, digest-verified patch to the real OpenClaw 2026.6.34
runtime so all four final user/model/tool/outbound values are awaited and
enforced before their side effects.

**Architecture:** A generic verified-patch mechanism is developed first
against synthetic fixtures and contains no OpenClaw behavior. Each real host
barrier then gets its own RED before its patch hunk is added: the existing
`before_agent_run` path plus three new final barriers. Only after all four
behavior suites are green is the production manifest sealed with the complete
patch digest and thirteen post-patch hashes; a final probe runs the nested pinned
CLI without relying on a global OpenClaw installation.

**Tech Stack:** OpenClaw 2026.6.34 dist chunks, unified patch, Node
`crypto`/`fs`/`child_process`, git apply, OpenClaw plugin SDK, and `node:test`.

---

## Entry Gate

- [ ] Confirm Phase 3 fake-host plugin is green, committed, and reviewed.
- [ ] Verify the official package artifact in a dedicated temporary directory:

```bash
GENERAL004_PACK_DIR="$(mktemp -d)"
npm pack openclaw@2026.6.34 --pack-destination "$GENERAL004_PACK_DIR"
sha256sum "$GENERAL004_PACK_DIR/openclaw-2026.6.34.tgz"
```

Expected SHA-256:
`d0edcbc937428ce1cb5729e444ea615651c9a8895807653ac2c4ed4e05122fa5`.

- [ ] Confirm the existing Track 1 package/image is not used as the patch
  source and preserve unrelated worktree changes.

## Locked Upstream Patch Files

The official 2026.6.34 tarball has these exact pre-patch hashes. Every Phase 4
behavior test works on a disposable copy of this tarball, never the Track 1
package tree:

| File | SHA-256 before patch |
| --- | --- |
| `dist/plugin-sdk/hook-types-H9SC6W-p.d.ts` | `f5b4912cb205b79e8ba5620554329c80dd070fd996ae0979260b66c16d349091` |
| `dist/command-registration-BBago94k.js` | `6672f28552a828daa2375c62758b1756725970fc45b2232d66596a59b5e22546` |
| `dist/hook-runner-global-D_43rcnU.js` | `d2ade7ea51fff02574643574acfed5a7bbbe6b01fd5df5797c9ebaddd2674bda` |
| `dist/lifecycle-hook-helpers-Dowa8zK4.js` | `a66e4b85966d1f9bbbb7b6123bb915a5cdeec433c0fae6f0bbd893b57958c085` |
| `dist/selection-DopzNY3I.js` | `a5698c5523e87ad454cf89e4a5c940689403f7b6eac6f3d14c7205f1e3071ed6` |
| `dist/cli-runner-B0eKIePw.js` | `b78b9a928c7a2945c34b76184b2c9562317dcc19618b2b1df8e10db1bdfe593e` |
| `dist/run-attempt-6K7vbtby.js` | `808acfb32c37e6122d6ed54eda5fbc3c56683eade263b490a5b922c980696a38` |
| `dist/agent-tools.before-tool-call-59sE70R-.js` | `2f8ba157e5660c32b85826eb3269a59b8add55062e31ed3d6d1528dd1017ad4b` |
| `dist/tool-split-BKKaUdyz.js` | `f6cb11210b69687a26ac079b48b341190c586450f2c46280284ff317ad805843` |
| `dist/dispatch-BSYjC-fp.js` | `8001214385bc1cf4d883e53d877b6e6aabf9692bbf5759f9c35872bd83150f61` |
| `dist/agent-runner.runtime-BUWW8f6n.js` | `9df987c2c8efdeaa875aead6d486a5f5f4d835a805e5c835f490ef3c4aa1d2e0` |
| `dist/deliver-CJEsHkyF.js` | `3229fb60029f129b767fe9ca91be9f530f41395727f1bcffdfa23a4073b6857d` |
| `dist/delivery-CExBlTq2.js` | `abcd09249ed4a1c7c079924c3c537e334dc7944597dc7b03f370b5e03ed3f89a` |

The production manifest and post-patch hashes do not exist until P4-T7. P4-T2
through P4-T6 extend one production patch only after their owning RED. During
those tasks, tests generate an ephemeral manifest over the current partial
patch and disposable upstream copy; no partial production manifest is
committed.

### Task P4-T1: Verified Patch Application Mechanism on Synthetic Fixtures

**Files:**
- Create: `integrations/openclaw/general-security/scripts/apply-general-security-patch.mjs`
- Create: `integrations/openclaw/general-security/tests/general-security-patch-application.spec.ts`
- Modify: `integrations/openclaw/general-security/package.json`

- [ ] **Step 1: Write the failing synthetic application test**

The test creates a temporary fake package with two files, a unified patch, and
a test-generated manifest containing real pre/post/patch hashes. It never
contains OpenClaw dist bytes or future barrier behavior:

```ts
assert.equal(applyVerifiedPatch(validFixture()).status, "applied");
assert.equal(applyVerifiedPatch(alreadyAppliedFixture()).status, "already_applied");
assert.throws(() => applyVerifiedPatch(changedPreHashFixture()));
assert.throws(() => applyVerifiedPatch(changedPatchFixture()));
assert.throws(() => applyVerifiedPatch(pathTraversalFixture()));
assert.deepEqual(readFixtureAfterFailedApply(), originalFixtureBytes);
```

Cover duplicate file entries, symlink package roots/files, path traversal,
missing/extra patched files, wrong patch-tool schema, pre/post mismatch,
invalid UTF-8 manifest JSON, and failure without a partial target tree.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-patch-application.spec.ts
```

Expected: FAIL because the verified-patch function/script is absent. No
OpenClaw behavior or production patch file exists yet.

- [ ] **Step 3: Implement only the generic verified application mechanism**

Export a testable `applyVerifiedPatch({ packageRoot, manifestPath, patchPath,
expectedIdentity? })`. Resolve real non-symlink paths, exact-normalize the
manifest, validate unique relative file paths and every pre-hash, verify patch
SHA before use, run `git apply --check` and `git apply --whitespace=nowarn` on a
disposable sibling copy, validate every post-hash/no extra patch target, then
replace/return the verified copy. Return only `applied|already_applied` and
delete the disposable copy in `finally`.

`expectedIdentity` is optional only for synthetic tests. The production CLI
wrapper will require the exact OpenClaw identity in P4-T7. Do not create the
production patch, manifest, hook names, or barrier logic in this task.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-patch-application.spec.ts
pnpm --dir integrations/openclaw/general-security run build
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/scripts/apply-general-security-patch.mjs \
  integrations/openclaw/general-security/tests/general-security-patch-application.spec.ts \
  integrations/openclaw/general-security/package.json
git commit -m "test(openclaw): verify general security patch application"
```

### Task P4-T2: Four-Barrier Hook Catalog and Closed Runner

**Files:**
- Create: `integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch`
- Create: `integrations/openclaw/general-security/tests/general-security-hook-runner.spec.ts`
- Modify through patch: `dist/plugin-sdk/hook-types-H9SC6W-p.d.ts`
- Modify through patch: `dist/command-registration-BBago94k.js`
- Modify through patch: `dist/hook-runner-global-D_43rcnU.js`

- [ ] **Step 1: Write failing tests against unpatched and disposable patched copies**

The unpatched declaration and runtime catalogs lack the three new names. The
real `registerTypedHook` path imports `isPluginHookName()` from
`dist/command-registration-BBago94k.js` and ignores unknown names, so a
declaration-only change is invalid. The existing
`runBeforeAgentRun` also does not yet implement the closed general-security
envelope/filter contract. Assert all four runner methods are awaited,
exact-normalize the private envelope against host-owned correlation, and return
only its nested barrier:

```ts
assert.deepEqual(
  await runner.runBeforeAgentRun(inputEvent, ctx),
  inputEnvelope.barrier
);
assert.deepEqual(
  await runner.runBeforeModelOutputDelivery(modelEvent, ctx),
  modelEnvelope.barrier
);
assert.deepEqual(
  await runner.runBeforeToolExecution(toolEvent, ctx),
  toolEnvelope.barrier
);
assert.deepEqual(
  await runner.runBeforeMessageDelivery(messageEvent, ctx),
  messageEnvelope.barrier
);
```

Each fixture has exact keys `schema_version`, `correlation`, `health`, and
`barrier`; correlation has exact keys `runId`, `sessionKey`, and `callId`, with
`null` required when the point has no call ID. Cover missing/duplicate plugin,
wrong plugin ID, bare barrier return, malformed or extra envelope/nested keys,
wrong schema version, wrong fixed code/text pair, timeout at exactly 10000 ms,
throw, run/session/call correlation drift, audit degraded with enforcement
healthy, enforcement failed, and no bypass. For every transport, envelope,
correlation, or enforcement-health failure, assert the runner returns the exact
fixed `sandbox_security_evaluation_unavailable` barrier and never `pass`.
Assert the runner result exposes neither correlation/health nor a replacement
provenance marker.

Against a disposable copy of the real package, load the native registry/API,
register one handler for each of the three new names, and assert all three are
retained exactly once with no `unknown typed hook ... ignored` diagnostic.
Mutating/removing any name from the runtime `PLUGIN_HOOK_NAMES` or
`CONVERSATION_HOOK_NAMES` must make this test fail even when the `.d.ts` still
contains it. Assert `dist/registry-BiuJAn1Z.js` remains byte-identical: it
already consumes the patched runtime predicate and requires no behavior hunk.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-hook-runner.spec.ts
```

Expected: FAIL on the absent new names/methods and on the existing input runner
not enforcing the exact general-security plugin/envelope contract.

- [ ] **Step 3: Add only catalog/runner hunks to the production patch**

Add the three new names to the declaration's `PluginHookName` and to the real
runtime `PLUGIN_HOOK_NAMES` and `CONVERSATION_HOOK_NAMES` in
`dist/command-registration-BBago94k.js`. Add the exact private
envelope/correlation/health types to the patched SDK declaration while keeping
each runner's public return type limited to
`OpenClawSecurityBarrierResult`. Do not patch the registry: prove its existing
`isPluginHookName()` admission path accepts the new catalog entries. Adapt the existing
`runBeforeAgentRun` and add the three new final runner methods so each filters
to plugin ID
`agent-security-sandbox-general`, requires exactly one registration, awaits it
for the fixed deadline, exact-normalizes only
`OpenClawSecurityHookEnvelope`, compares its run/session/call correlation with
the runner's normalized host event/context, requires
`health.enforcement === "healthy"`, and returns only the nested exact
`OpenClawSecurityBarrierResult`. `health.audit === "degraded"` is accepted and
does not alter the barrier. A bare barrier, correlation mismatch, failed
enforcement health, timeout, throw, or malformed envelope deterministically
returns the fixed unavailable barrier; none can become `pass`.

The runner never creates the private provenance marker. Each owning host call
site in P4-T3 through P4-T6 creates it only after validating the exact closed
replacement code/text pair. Preserve all unrelated upstream/Track 1 runner
semantics.

- [ ] **Step 4: Run GREEN with an ephemeral current-patch manifest**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-hook-runner.spec.ts
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-patch-application.spec.ts
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch \
  integrations/openclaw/general-security/tests/general-security-hook-runner.spec.ts
git commit -m "feat(openclaw): add awaited final barrier runner"
```

### Task P4-T3: Real Awaited User-Input Barrier

**Files:**
- Create: `integrations/openclaw/general-security/tests/general-security-input-barrier.spec.ts`
- Modify through patch: `dist/lifecycle-hook-helpers-Dowa8zK4.js`
- Modify through patch: `dist/dispatch-BSYjC-fp.js`
- Modify through patch: `dist/selection-DopzNY3I.js`
- Modify through patch: `dist/cli-runner-B0eKIePw.js`
- Modify: `integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch`

- [ ] **Step 1: Write the real-host input RED**

Inventory the official tarball and assert the final agent-acceptance
`before_agent_run` call sites are exactly the known selection and CLI-runner
paths above. The test must fail if an additional acceptance caller is present.
Drive each real call site and prove the security gate receives the exact current
prompt after ordinary input normalization, is awaited, and completes before
model invocation:

```ts
assert.deepEqual(order, ["ordinary_normalize", "security", "security_done"]);
assert.equal(modelInvocations, 0);
assert.equal(deliveredOriginalPrompt, false);
assert.equal(hostReplacement.provenance,
  "openclaw-security-fixed-replacement.v1");
```

Cover `allow|alert` invoking the model only after the await; `ask|deny`; Engine
throw/timeout/invalid/slot-unavailable; missing/drifted run/session identity;
malformed/unsupported prompt; audit degraded; fixed code/text validation; and
no model call after any replace/failure. Assert only the host creates the marker
and plugin/ordinary rewrite input cannot supply or mutate it.

Add real-turn carrier REDs. `withReplyDispatcher` must create a private pending
`openclaw-security-turn-context.v1` capsule before `params.run`, keep its
`AsyncLocalStorage.run(...)` scope active through `settleReplyDispatcher()` and
`waitForIdle()`, and expose the exact activated prompt/run/session tuple to
downstream model, tool, and outbound probes even after the embedded or CLI
runner returns. The selection and CLI acceptance sites activate that pending
capsule with `promptForModel` or `params.prompt` plus the exact `params.runId`
and `params.sessionKey`; they do not own its lifetime. Prove two concurrent
turns in the same session cannot cross, nested dispatcher scopes restore the
outer context, and missing, detached, inactive, or post-settlement reads fail.
Assert `AsyncLocalStorage.enterWith`, a global Map, transcript/history recovery,
and a capsule whose prompt remains readable after dispatcher `finally` are
forbidden.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-input-barrier.spec.ts
```

Expected: FAIL because the upstream input path does not yet consume the closed
runner result/host-only replacement envelope at the required final boundary.

- [ ] **Step 3: Add only input-barrier hunks**

At both known acceptance paths, call the closed `runBeforeAgentRun` after final
ordinary input normalization and before any model invocation. Pass exact
`runId`/`sessionKey` and current prompt. On `replace`, validate the code/text
pair again, create the private host marker, discard the original prompt, and
return the fixed replacement without invoking the model or re-entering an
ordinary rewrite/security hook. Missing identity or required failure uses the
user-input `ask` floor.

In `lifecycle-hook-helpers-Dowa8zK4.js`, add the dedicated host-only
`AsyncLocalStorage` carrier with pending-capsule, one-time activation, strict
reader, and invalidation helpers. In `dispatch-BSYjC-fp.js`, make
`withReplyDispatcher` own the scope: create an inactive capsule with no prompt,
run both `params.run()` and the `finally` settlement/idle wait inside
`AsyncLocalStorage.run(...)`, then clear the prompt and mark the capsule inactive
only after settlement completes or fails. The selection and CLI acceptance
sites validate and activate the current pending capsule with their exact
normalized prompt, `runId`, and `sessionKey` immediately before the closed
`before_agent_run` call; they must not create or end the scope. Do not expose
the carrier through the plugin SDK or persist it.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-input-barrier.spec.ts \
  integrations/openclaw/general-security/tests/general-security-hook-runner.spec.ts
npm run test:integration:openclaw
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch \
  integrations/openclaw/general-security/tests/general-security-input-barrier.spec.ts
git commit -m "feat(openclaw): enforce normalized user input"
```

### Task P4-T4: Awaited Final Assistant Projection Barrier

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

### Task P4-T5: Final Tool Parameter Barrier

**Files:**
- Create: `integrations/openclaw/general-security/tests/general-security-tool-barrier.spec.ts`
- Modify through patch: `dist/agent-tools.before-tool-call-59sE70R-.js`
- Modify through patch: `dist/tool-split-BKKaUdyz.js`
- Modify: `integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch`

- [ ] **Step 1: Write failing final-parameter tests**

```ts
assert.deepEqual(order, ["ordinary", "finalize", "security", "execute"]);
assert.equal(securityObservation.tool.arguments.secret, "final");
assert.equal(securityObservation.prompt, exactCurrentTurnPrompt);
assert.equal(securityObservation.correlation.runId, exactCurrentTurnRunId);
assert.equal(securityObservation.correlation.sessionKey,
  exactCurrentTurnSessionKey);
```

Cover wrapped/unwrapped paths, multi-call same-session concurrency, missing or
inactive turn context, drifted IDs, wrong-turn prompt, omitted target, every
action/failure, no execute after replace, host-only marker, and no original
parameter log/result.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-tool-barrier.spec.ts
```

Expected: FAIL because current `before_tool_call` precedes final parameter
finalization and has no closed final security result.

- [ ] **Step 3: Add only tool-barrier hunks**

Run the closed tool security method immediately after final parameter rewriting
and before recording/execution at both wrapped and unwrapped paths. Build it
from the active host turn's exact prompt/run/session tuple, the already-gated
matching assistant projection, and the final tool call ID/name/arguments; a
missing or mismatched tuple is a correlation failure. On replace,
validate code/text, attach the host marker, discard original parameters, and
return the closed blocked result. Missing identity/failure uses the tool `deny`
floor. A static/runtime marker rejects double barriers.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-tool-barrier.spec.ts
npm run test:integration:openclaw
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch \
  integrations/openclaw/general-security/tests/general-security-tool-barrier.spec.ts
git commit -m "feat(openclaw): enforce final tool requests"
```

### Task P4-T6: Final Outbound Message Barrier and Replacement Path

**Files:**
- Create: `integrations/openclaw/general-security/tests/general-security-message-barrier.spec.ts`
- Modify through patch: `dist/hook-runner-global-D_43rcnU.js`
- Modify through patch: `dist/dispatch-BSYjC-fp.js`
- Modify through patch: `dist/agent-runner.runtime-BUWW8f6n.js`
- Modify through patch: `dist/deliver-CJEsHkyF.js`
- Modify through patch: `dist/delivery-CExBlTq2.js`
- Verify existing patch threading: `dist/lifecycle-hook-helpers-Dowa8zK4.js`
- Verify existing patch threading: `dist/selection-DopzNY3I.js`
- Verify existing patch threading: `dist/cli-runner-B0eKIePw.js`
- Modify: `integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch`

- [ ] **Step 1: Write failing tests for all known outbound call sites**

Assert ordinary rewrite, final payload, the exact current prompt from the same
turn carrier, run/session correlation, no original delivery after
replace/failure, fixed replacement only, no second rewrite, and no re-entry:

```ts
assert.deepEqual(order, ["ordinary_rewrite", "security", "replacement_send"]);
assert.equal(deliveredOriginal, false);
assert.equal(deliveredReplacement,
  "Security review required. This action was not completed.");
assert.equal(replacementMarker,
  "openclaw-security-fixed-replacement.v1");
assert.deepEqual(securityObservation, {
  prompt: exactCurrentTurnPrompt,
  runId: exactCurrentTurnRunId,
  sessionKey: exactCurrentTurnSessionKey,
  outbound: finalPostRewritePayload
});
```

The source inventory must fail if a new `runMessageSending` acceptance caller
appears outside the reviewed dispatch/deliver/delivery paths. Drive each of the
three real callers in `dispatch-BSYjC-fp.js`, `deliver-CJEsHkyF.js`, and
`delivery-CExBlTq2.js`. Prove a normal delivery scheduled after the embedded or
CLI runner returns but before dispatcher idle still receives the exact tuple.
Drive a queued follow-up through
`agent-runner.runtime-BUWW8f6n.js` -> `routeReply` -> `deliver` and prove it
receives its own exact tuple. Also prove same-session concurrency cannot
exchange prompts or run IDs, nested turns restore the outer capsule, and the
prompt is cleared after dispatcher/follow-up `finally`. For every caller,
missing/inactive context, mismatched run/session, a detached send without a new
follow-up capsule, or attempted recovery from history or session-only data must
return the fixed unavailable replacement and deliver no original. Assert every
composed delivery path invokes the security barrier exactly once and each real
caller observes the final post-ordinary-rewrite payload. A source-inventory
assertion locks the complete carrier and caller files to the thirteen-file
manifest.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-message-barrier.spec.ts
```

Expected: FAIL because final outbound delivery has no closed security call or
host-only replacement envelope.

- [ ] **Step 3: Add only outbound-barrier hunks**

Run ordinary modifications first, construct the final payload projection, and
read the strict host turn carrier immediately before the security invocation.
Require its exact current prompt, `runId`, and `sessionKey`; combine them only
with the final post-rewrite payload and await the closed message security
method. Normal routed delivery remains inside the P4-T3 dispatcher scope through
settlement/idle. `dispatch-BSYjC-fp.js` cross-checks the capsule against local
`runState.runId` and finalized session identity; `deliver-CJEsHkyF.js`
cross-checks `replyPayloadSendingHook.runId` and `.sessionKey`; and
`delivery-CExBlTq2.js` cross-checks `sessionKeyForInternalHooks`, taking prompt
and run ID only from the capsule.

For detached queued work, `agent-runner.runtime-BUWW8f6n.js` must create a new
pending capsule around the complete `runQueuedFollowup`, including
`sendFollowupPayloads` and `routeReply`; the queued run's selection/CLI
acceptance activates that capsule from the same exact accepted prompt/run/session
inputs. It invalidates and clears the prompt only in the outer follow-up
`finally`. No `bot-CS65Z7r1.js` patch and no unlisted history, transcript,
`BodyForAgent`, session-keyed map, or upstream lookup is permitted. On
replace, validate the closed code/text pair, attach the private host marker,
bypass ordinary rewrites, discard the original, and send once without
re-entering `message_sending` or the security barrier. Keep `message_sent`
observation-only and never log original/replacement content. Missing or
mismatched carrier state takes the outbound `ask` failure floor and never
continues the original.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-message-barrier.spec.ts
npm run test:integration:openclaw
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch \
  integrations/openclaw/general-security/tests/general-security-message-barrier.spec.ts
git commit -m "feat(openclaw): enforce final outbound messages"
```

### Task P4-T7: Seal the Production Patch Manifest and Identity

**Files:**
- Create: `integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.manifest.json`
- Create: `integrations/openclaw/general-security/tests/general-security-patch-integrity.spec.ts`
- Modify: `integrations/openclaw/general-security/scripts/apply-general-security-patch.mjs`
- Modify: `integrations/openclaw/general-security/package.json`

- [ ] **Step 1: Write the failing production-integrity test**

Against the now behavior-complete patch, assert exact OpenClaw version, npm
integrity, tarball SHA, patch-tool version, patch SHA, the thirteen unique
pre/post entries, no path traversal/Track 1 path, and idempotent application:

```ts
assert.equal(runProductionPatch(copy).status, "applied");
assert.equal(runProductionPatch(copy).status, "already_applied");
assert.throws(() => runProductionPatch(withChangedPreHash(copy)));
assert.throws(() => runProductionPatch(withChangedPatch(copy)));
assert.throws(() => runProductionPatch(withChangedPostFile(copy)));
```

Also apply the final patch and run all four behavior suites against the result.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-patch-integrity.spec.ts
```

Expected: FAIL because the production manifest and fixed-identity CLI wrapper
do not exist. All P4-T2 through P4-T6 behavior suites are already green.

- [ ] **Step 3: Generate and lock the complete production identity**

Generate `patch_sha256` and every real post-patch SHA-256 from a disposable
official tarball copy after applying the behavior-complete patch. The manifest
uses schema `openclaw-security-patch-manifest.v1`, package `openclaw`, version
`2026.6.34`, the approved npm integrity, tarball SHA
`d0edcbc937428ce1cb5729e444ea615651c9a8895807653ac2c4ed4e05122fa5`,
the actual patch-tool version, and exactly the thirteen locked file entries.

Add the production wrapper that always supplies this manifest/patch and the
exact expected identity to the already-tested generic mechanism. It refuses a
different package root/version/integrity/tarball/patch/file hash and never edits
the Track 1 parent package. This task changes no barrier behavior.

- [ ] **Step 4: Run GREEN for identity and every behavior suite**

```bash
pnpm --dir integrations/openclaw/general-security run test:patch
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-input-barrier.spec.ts \
  integrations/openclaw/general-security/tests/general-security-model-barrier.spec.ts \
  integrations/openclaw/general-security/tests/general-security-tool-barrier.spec.ts \
  integrations/openclaw/general-security/tests/general-security-message-barrier.spec.ts
pnpm --dir integrations/openclaw/general-security run build
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.manifest.json \
  integrations/openclaw/general-security/scripts/apply-general-security-patch.mjs \
  integrations/openclaw/general-security/tests/general-security-patch-integrity.spec.ts \
  integrations/openclaw/general-security/package.json
git commit -m "build(openclaw): seal general security patch identity"
```

### Task P4-T8: Real Patched Runtime Probe and Cardinality Gate

**Files:**
- Create: `integrations/openclaw/general-security/src/general-security/runtime-probe.ts`
- Create: `integrations/openclaw/general-security/tests/general-security-runtime-probe.spec.ts`
- Create: `tests/integration/openclaw-sandbox-security.runtime.spec.ts`
- Modify: `integrations/openclaw/general-security/src/index.ts`
- Modify: `integrations/openclaw/general-security/package.json`

- [ ] **Step 1: Write failing nested-CLI/runtime tests**

Assert exact package version, plugin ID, all four barriers, registration count
one, all four real ordering/correlation probes true, and empty diagnostics.
Mutate version, patch hash, one barrier, plugin cardinality, IDs, final rewrite,
Engine failure, and audit token. Clear `PATH` in a test and prove the probe still
uses the nested pinned CLI rather than a global executable.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-runtime-probe.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
```

Expected: FAIL because no real patched runtime probe/nested-CLI resolver exists.

- [ ] **Step 3: Implement the static/dynamic probe with an exact nested CLI**

Resolve `integrations/openclaw/general-security/node_modules/openclaw/package.json`
from the standalone package root, exact-normalize its `bin.openclaw` relative
path, reject symlinks/path escape/version drift, and invoke it with:

```ts
execFileSync(process.execPath, [
  nestedOpenClawCliPath,
  "plugins",
  "inspect",
  "agent-security-sandbox-general",
  "--runtime",
  "--json"
], { cwd: standalonePackageRoot, timeout: 30000, env: closedProbeEnvironment });
```

Do not call `execFileSync("openclaw", ...)` or inherit a global PATH. Strictly
normalize JSON, verify the sealed manifest, start a local fake backend audit
endpoint, and drive deterministic local user-input, model-output, tool, and
message barriers. Record opaque labels only. Reject any Track 1 manifest,
missing/duplicate barrier/plugin, invalid digest, ordering/correlation failure,
or diagnostic.

- [ ] **Step 4: Run GREEN**

```bash
pnpm --dir integrations/openclaw/general-security run test:patch
node --experimental-strip-types --test \
  integrations/openclaw/general-security/tests/general-security-runtime-probe.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
npm run typecheck:integration:openclaw:security
git diff --check
```

- [ ] **Step 5: Commit and stop Phase 4**

```bash
git add integrations/openclaw/general-security/src/general-security/runtime-probe.ts \
  integrations/openclaw/general-security/src/index.ts \
  integrations/openclaw/general-security/package.json \
  integrations/openclaw/general-security/tests/general-security-runtime-probe.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
git commit -m "test(openclaw): verify four final barrier paths"
```

## Phase 4 Exit Gate

- [ ] Eight focused task commits exist; the production patch contains no
  behavior written before its owning RED.
- [ ] The final manifest verifies the complete patch digest and all thirteen real
  upstream pre/post hashes.
- [ ] The native runtime registry retains all three new typed hooks exactly once
  and emits no unknown-hook diagnostic; its unpatched registry consumer still
  uses the patched runtime catalog.
- [ ] Real `before_agent_run` observes the normalized current prompt, is
  awaited, and prevents every model invocation after replace/failure.
- [ ] Model output is awaited at every known final acceptance path.
- [ ] Tool security runs after final parameters at wrapped/unwrapped paths.
- [ ] Outbound security runs after ordinary rewrites and the fixed replacement
  is host-authored, immutable, and non-reentrant; every real path receives the
  same turn's exact prompt/run/session carrier and final payload.
- [ ] Missing/duplicate/drifted plugin/barrier/correlation fails closed while
  audit degradation alone does not change the host action.
- [ ] The runtime probe resolves only nested OpenClaw `2026.6.34` and exercises
  all four real barriers without global PATH dependence.
- [ ] Track 1 package/tests remain green and review has no unresolved Critical
  or Important finding.

Proceed only to Phase 5. Do not update durable architecture/API docs yet.
