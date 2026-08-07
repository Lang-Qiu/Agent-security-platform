# GENERAL-002 P6 Completeness Acceptance Design

## Context

The live P6 Judge run is an evidence-producing operation. A complete run can
produce 300 structurally valid, provider-complete decisions while still being
below the benchmark's model-quality thresholds. The current live gate treats
those two outcomes as one boolean and therefore stops before receipt, seal, and
hermetic replay can inspect the complete run.

The latest acceptance rule is: for every subsequent round, a complete 300-input
run with results is accepted into the remaining acceptance stages. Model-quality
metrics remain recorded for later analysis and are not used to block this live
evidence path.

## Decision

Keep the existing benchmark quality calculation and default quality-gated APIs
unchanged. Add a fixed internal live-completeness policy for the P6 stage
workers:

- The live evaluator accepts only a candidate package with all 300 structurally
  valid decision projections, valid provider attempt sequences whose final
  invoked outcomes are responses, and an empty infrastructure error list.
  The retained `decided` numerator is a quality-coverage metric; valid
  `indeterminate` projections may make it lower than 300 without making the
  complete structural run incomplete.
- The evaluator's quality result remains in `accepted_metrics.accepted`; it is
  not changed or relabeled when the live completeness policy accepts the run.
- The live sealer uses the same candidate, hash, truth-anchor, and privacy
  checks but does not require quality thresholds. It still requires the
  complete-run condition and preserves the original metrics and their hash in
  `seal.json`.
- The hermetic replay validates the complete-run metrics, all tree and receipt
  bindings, provider attempt sequences, network isolation, and evaluator
  determinism. It does not require the retained quality boolean to be true.
- The ordinary `sealSandboxSecurityAcceptedCapture` and default live-evidence
  validator remain quality-gated for existing callers and regression tests.

No caller-provided switch controls this policy. Only the fixed live worker and
the fixed hermetic replay entry point select it.

## Error handling

Incomplete decisions, provider failures, malformed attempts, infrastructure
errors, hash mismatches, receipt-chain mismatches, privacy violations, and
network capability evidence remain fail-closed. A quality-only shortfall is
retained as a metric and is the only condition newly allowed to continue.

## Test design

Focused tests will prove that:

1. the live evaluator accepts a complete 300-projection report with
   `accepted === false` and valid indeterminate outputs, and rejects an
   incomplete report or infrastructure failure;
2. the live sealer can publish a complete quality-failed report while the
   ordinary sealer still rejects it;
3. final evidence validation and hermetic replay accept the preserved false
   quality metric only in the explicit complete-run mode;
4. hashes, receipt bindings, attempt sequences, privacy gates, and existing
   quality-threshold tests remain enforced.

## Non-goals

- Changing detector prompts, provider retry policy, or benchmark truth labels.
- Making an incomplete or infrastructure-failed run acceptable.
- Removing or weakening the model-quality metrics.
- Adding a user-configurable acceptance bypass.
