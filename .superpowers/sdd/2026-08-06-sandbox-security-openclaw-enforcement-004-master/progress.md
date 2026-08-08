# SDD ledger — plan: docs/superpowers/plans/2026-08-06-sandbox-security-openclaw-enforcement-004-master.md

Recovery map (git is authoritative; docs/progress.md + docs/sprint-current.md were stale at resume).
Branch: sandbox. Resume base for P4-T4: 18f45d4.

Completed before this ledger (verified via git log + committed P4 suites 61/61 green at 18f45d4):
- P1-T1..P1-T5, P2-T1..P2-T5, P3-T1..P3-T5: complete (committed, reviewed per docs/progress.md history).
- P4-T1 complete: e8f1c6b (+ 18edbb7 typecheck fix) test(openclaw): verify general security patch application.
- P4-T2 complete: 5b54b82 feat(openclaw): add awaited final barrier runner.
- P4-T3 complete: 18f45d4 feat(openclaw): enforce normalized user input.
  (6af8fae "pristine" = checkpoint bundling .superpowers/review/general-005-*.md + input-barrier spec; benign.)

Remaining: P4-T4, P4-T5, P4-T6, P4-T7, P4-T8, P5-T1, P5-T2, P5-T3, P5-T4.
After 004 terminal: switch docs/sprint-current.md to GENERAL-005 (doc-only), then execute GENERAL-005 P1..P5.
GENERAL-005 review gate already satisfied: spec+plan rereview-2 PASS (.superpowers/review/general-005-rereview-2.md).

## Task log

Task P4-T4: in_progress (base 18f45d4)
