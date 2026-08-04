# P6 Candidate Progress Persistence Design

## Status

Approved design for `REQ-SBX-GENERAL-002`. This amendment covers durable
per-sample candidate progress during the permission-limited P6 live capture.

## Goal

After each successful sample evaluation, retain a content-free JSON decision in
`capture-bundle/capture-output/.candidate-package.json`. A fail-closed capture
must leave the last atomically committed progress available for diagnosis
without making that partial result usable as a candidate, receipt, seal, or P7
input.

## Constraints

- The existing formal candidate staging schema remains complete-run-only.
- A partial file must never be accepted by
  `materializeSandboxSecurityCandidatePackage`.
- The permission-limited capture child must not receive directory write or
  rename permission.
- No retry, fallback, resume, scheduler, provider, or Judge policy changes.
- The progress file contains no fixture body, truth, category labels from
  truth, raw requests, raw provider responses, credentials, or provider prose.
- Existing candidate, cassette, receipt, seal, evidence-root, and P7 contracts
  remain unchanged after a successful run.

## Alternatives

### In-place child rewrite

The child could truncate and rewrite the bound staging file after each sample.
This preserves the current permission list but does not provide path-level
atomicity: a process or host failure during the write can leave a truncated or
partially serialized JSON document.

### Child-owned temporary rename

The child could receive a temporary sibling path and rename permission. This
would provide atomic replacement, but it would expand the child filesystem
authority beyond the current single-file write boundary and replace the
bound staging inode. It also complicates the existing output identity checks.

### Parent-owned atomic persistence (selected)

The child emits a strict, content-free output frame over its existing stdout
pipe after each completed evaluation. The parent capture worker validates the
frame, writes the new cumulative progress document to a temporary file in the
same output directory, fsyncs it, and atomically renames it over the staging
path. The child retains its current fixed code and permission boundary and
never writes the progress file itself.

## Contracts

### Progress document

The running document uses a separate schema:

`sandbox-security-benchmark-candidate-progress.v1`

While running, its exact shape is:

```json
{
  "schema_version": "sandbox-security-benchmark-candidate-progress.v1",
  "status": "running",
  "fixture_count": 300,
  "completed_count": 127,
  "decisions": [
    {
      "schema_version": "sandbox-security-benchmark-decision-projection.v1",
      "fixture_id": "ssb-v1-0001",
      "decision_projection_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "projection": {
        "schema_version": "sandbox-security-decision.v1",
        "verdict": "no_detected_risk",
        "action": "allow",
        "risk_level": "info",
        "finding_count": 0,
        "detector_run_count": 0,
        "evidence_ref_count": 0
      }
    }
  ]
}
```

`decisions` is ordered by the frozen input order. `completed_count` must equal
the array length. The normalizer rejects unknown keys, duplicate fixture IDs,
out-of-order fixture IDs, invalid hashes, and any raw or oracle fields.

After a child failure, the parent atomically changes the same document to
`status: "failed"` and adds a bounded `failure_code`; all previously committed
fields, including the completed `decisions` array, remain unchanged. The error
code is content-free.

### Child output frames

The child emits one strict progress frame for each successful evaluation. The
frame carries the one-based input ordinal, fixture ID, and the exact formal
content-free decision projection envelope. It does not carry the input
envelope or provider response bodies.

After the parent has atomically persisted the cumulative document, it sends a
content-free acknowledgement over the child's private stdin pipe. The child
does not begin the next evaluation until that acknowledgement matches the
frame ordinal. The same handshake is used for the final formal staging frame;
the parent closes the pipe after acknowledging it.

At successful completion, the child emits a final frame containing the
complete formal candidate staging serialization and its SHA-256. The parent
does not promote this frame until the child exits successfully and the final
serialization agrees with the durable progress sequence.

The existing compact `capture_complete` summary remains the process result;
the staging serialization is transported as a dedicated validated field in
that same internal stdout protocol. It is not added to the public receipt or
stage summary.

## Data Flow

```text
engine.evaluate(sample N)
  -> content-free decision projection
  -> child stdout progress frame
  -> parent frame normalizer
  -> cumulative progress document
  -> same-directory temp file
  -> fsync(temp)
  -> rename(temp, .candidate-package.json)
  -> parent persistence acknowledgement
  -> next child evaluation

all samples complete
  -> child final formal staging frame
  -> parent hash/order validation
  -> atomic replacement of progress document
  -> existing candidate materialization
```

The parent starts with an atomically written zero-count progress document. If
readiness or the first evaluation fails, the file remains valid and contains
zero decisions. If a later evaluation fails, the last completed decision is
durable. A malformed or unexpected child frame fails closed and leaves the
last valid document intact.

## Atomic Write Rules

The parent writes a temporary file beside the staging path with exclusive
creation and mode `0600`, writes the complete UTF-8 JSON plus a trailing
newline, calls `fsync` on the temporary file, closes it, and renames it over
`.candidate-package.json`. The temporary file is removed on a failed write.
The output directory and target are revalidated as real, non-symlink paths;
the final materializer revalidates the resulting staging file before
promotion.

The child does not open, truncate, or rename the staging path in production
stream mode. The direct library/test mode may continue to use its existing
file writer where needed for isolated tests, but production persistence is
parent-owned. The parent only acknowledges a frame after the corresponding
atomic replacement has completed; this acknowledgement is an internal
content-free protocol and is not part of any public stage summary.

## Failure and Promotion Semantics

- A successful input frame is durable before the next input begins.
- A failed in-flight evaluation produces no decision record.
- A child exit with a non-zero code leaves the failed progress document in
  `capture-output` and does not create `candidate/`.
- A complete formal staging document is promoted only after all fixture IDs,
  decision count, staging hash, and child exit status agree.
- `capture_complete` is terminal: a progress frame received after it fails
  closed, and a complete frame received before all progress frames is rejected.
- Candidate materialization publishes the complete candidate directory before
  removing formal staging, so a failed publication rename leaves the staging
  path available for the parent to mark `failed`.
- The materializer continues to reject the progress schema and all incomplete
  decision arrays.
- No progress document is read by evaluator, sealer, receipt generation, or
  hermetic P7 replay.

## Testing Strategy

RED-first coverage will verify:

1. A three-sample capture emits ordered decision frames after each successful
   evaluation.
2. The progress normalizer rejects unknown, raw, truth, and out-of-order
   fields.
3. The parent atomically persists cumulative JSON and preserves the last
   completed decision after a synthetic child failure.
4. A malformed frame fails closed without promoting `candidate/`.
5. A complete run replaces the progress schema with the unchanged formal
   staging schema and existing candidate hashes/materialization remain valid.
6. The child permission and import-boundary tests do not gain directory write
   or truth read access.

## Proposed Files

- Add `scripts/benchmark/sandbox-security/candidate-progress.ts`.
- Modify `scripts/benchmark/sandbox-security/capture-live.ts`.
- Modify `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts`.
- Modify `scripts/benchmark/sandbox-security/capture-candidate.ts` only for
  shared staging validation helpers if required by the strict frame consumer.
- Modify `tests/benchmark/sandbox-security-capture-live.spec.ts`.
- Add `tests/benchmark/sandbox-security-candidate-progress.spec.ts`.
- Modify `tests/benchmark/sandbox-security-isolation.spec.ts`.
- Modify `tests/repository/sandbox-security-benchmark.spec.ts`.
- Update `docs/architecture.md` and `docs/progress.md` after implementation.

## Acceptance Criteria

- After each completed input, the staging path contains a complete,
  parseable, content-free cumulative JSON document.
- A fail-closed run preserves every atomically committed completed decision
  and does not materialize a candidate.
- A successful run produces the same formal candidate package and hashes as
  before this change.
- No retry, fallback, resume, receipt, seal, evidence-root, or P7 behavior is
  introduced or changed.
