# P6 Live Acceptance — Operator Runbook

> Deterministic implementation status (2026-07-26): the fixed four-worker P6
> acceptance pipeline is implemented and all deterministic gates are GREEN. The
> three committed live-evidence acceptance tests remain intentionally RED because
> real `capture.json`, 300 replay envelopes, and `seal.json` do not yet exist.
> This runbook is the operator handoff to produce that real evidence. Never
> fabricate capture evidence.

## What the pipeline is

`accept-live.ts` is the sole operator entrypoint and Ed25519 receipt-signing
authority. It is uncredentialed: it imports no production, capture-runtime,
evaluator, or sealer code, and the six live variables must be **absent** from its
own environment. It launches four fixed capability-separated workers in order and
signs the capture and evaluation receipts:

1. `prepare-live-worker.ts` — uncredentialed; builds the input-only capture
   bundle and the exact serializable descriptor.
2. `capture-live-worker.ts` — the only worker that receives the closed
   six-variable live environment (via Node `--env-file`); reconstructs and
   revalidates the bundle, launches the Node `--permission` capture child, and
   emits the content-free capture binding.
3. `evaluate-live-worker.ts` — uncredentialed; verifies and consumes the signed
   capture receipt, joins candidate decisions with corpus truth, and emits the
   accepted evaluation binding.
4. `seal-live-worker.ts` — uncredentialed, no truth-read permission; verifies and
   consumes both signed receipts, publishes `capture.json`, `replay/`, and
   `seal.json`, and persists the canonical receipt chain in `receipt-chain.json`.

## Prerequisites the operator must provide

1. **Local Ollama** serving the pinned `qwen3:8b` digest on loopback (no
   auto-pull).
2. **A reachable Judge endpoint** over a canonical safe HTTPS FQDN.
3. **A mode-`600` credential env file** containing exactly the six variables:
   `SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST`, `SANDBOX_SECURITY_JUDGE_PROTOCOL`,
   `SANDBOX_SECURITY_JUDGE_BASE_URL`, `SANDBOX_SECURITY_JUDGE_MODEL`,
   `SANDBOX_SECURITY_JUDGE_API_KEY`, `SANDBOX_SECURITY_ENABLE_JUDGE`.
4. **A mode-`600` local Ed25519 private key** whose public key equals the tracked
   `p6-acceptance-public-key.pem`. The provisioned local key is
   `.p6-acceptance-private-key.pem` (Git-ignored).
5. **A reviewed `p6-live-judge-binding.ts` profile.** The committed profile is
   intentionally `reviewed: false` with zeroed hashes and therefore fails closed.
   Before the run, replace the base/endpoint/requested/resolved SHA-256 values
   and stable IDs with the reviewed live-channel values and set `reviewed: true`.
6. A **fresh capture-parent directory** and the **intended output root**, disjoint
   from each other and from the corpus root (no containment in either direction,
   no symlink aliases).

## The controlled live command

Run with all six ambient variables unset (credentials reach only the capture
worker through `--env-file`), the local mode-`600` credential env file, and the
local mode-`600` acceptance key:

```bash
env -u SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST \
    -u SANDBOX_SECURITY_JUDGE_PROTOCOL \
    -u SANDBOX_SECURITY_JUDGE_BASE_URL \
    -u SANDBOX_SECURITY_JUDGE_MODEL \
    -u SANDBOX_SECURITY_JUDGE_API_KEY \
    -u SANDBOX_SECURITY_ENABLE_JUDGE \
  node --experimental-strip-types \
    scripts/benchmark/sandbox-security/accept-live.ts \
    --capture-parent-root=<fresh-dir> \
    --output-root=<evidence-dir> \
    --credential-env-file=<mode-600-env-file> \
    --acceptance-key=<mode-600-key> \
    [--corpus-root=samples/sandbox-security-benchmark/v1]
```

Never print environment values or worker bodies. Expected on success: Judge
readiness, five warmed Ollama probes, 300 evaluations, accepted metrics, a signed
seal, and empty successful worker stderr within the `20s`/`40s` P6 profile budget.

## After a successful run — validate real evidence

```bash
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
npm run test:engine:sandbox:production
npm run test:repo
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
git diff --check
```

The three previously-RED live-evidence acceptance tests must turn GREEN only from
the real `capture.json`, 300 `replay/*.json`, and `seal.json`. Then record P6
VERIFIED with aggregate metrics, content-free hashes, timing, the public-key
fingerprint, review conclusions, and counts, and advance to P7-T1.
