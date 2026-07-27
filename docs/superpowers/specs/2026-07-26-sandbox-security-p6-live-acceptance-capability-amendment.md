# GENERAL-002 P6 Live Acceptance Capability Amendment

## Status

This is an approved in-place amendment to `REQ-SBX-GENERAL-002`. It is made
under the operator's standing authorization to resolve GENERAL-002 blockers and
continue through closure. It replaces only the single-process P6 acceptance
orchestration introduced before live evidence was sealed.

No accepted P6 `capture.json`, replay tree, or `seal.json` exists. The fixed
corpus, truth, production behavior, P6 timing profile, metric thresholds, Judge
protocol selection, and mandatory P7 hermetic replay remain unchanged.

This document is a design-only TDD exception. Implementation remains RED-first.

## Problem Statement

The previous `accept-live.ts` entrypoint called bundle preparation, credentialed
capture, truth-aware evaluation, and truth-blind sealing in one parent process.
In-memory WeakMap receipts prevented direct public API fabrication, but did not
provide an adequate capability boundary:

- one process could retain provider credentials, production imports, corpus
  truth paths, evaluator code, and seal publication authority;
- a prepared-bundle getter could return different objects across validation,
  launch, receipt issuance, and materialization;
- path validation and later path reads admitted file and directory TOCTOU;
- a successful child could emit extra stdout or stderr around a valid summary;
- requested or resolved model fields were bounded identifiers but were not
  explicitly rejected as credential or serialized-body channels; and
- the final seal retained only publicly recomputable hashes, so the one-use
  receipt chain was not durably verifiable after process exit.

These are acceptance-integrity defects. Live execution remains prohibited until
their RED regressions and the remediation below are GREEN and independently
approved.

## Approved Architecture

P6 live acceptance is a fixed four-stage process pipeline. No stage may accept a
caller-supplied implementation, command, environment map, transport, evaluator,
signer, serializer, or timing policy.

### Stage 1: Uncredentialed Acceptance Authority

`accept-live.ts` is the sole operator entrypoint and receipt-signing authority.
It:

- requires the six live variables to be absent from its own environment;
- accepts one mode-`600`, regular, non-symlink credential env-file path that is
  forwarded only as a Node `--env-file` argument to the capture authority;
- accepts one mode-`600`, regular, non-symlink local Ed25519 private-key path,
  whose public key must equal the source-controlled acceptance public key;
- snapshots its exact input record once using data-property descriptors;
- resolves and binds corpus, capture-parent, output, env-file, and private-key
  paths once;
- rejects equality or containment in either direction among corpus,
  capture-parent, and output roots after `realpath` normalization;
- creates one fresh mode-`700` acceptance workspace below capture-parent;
- starts only the source-controlled stage entrypoints in the fixed order; and
- never imports production composition, capture runtime, evaluator, sealer, or
  provider configuration modules.

The authority receives only bounded, content-free stage summaries. It never
reads the corpus, candidate decisions, provider outcomes, truth labels,
evaluation metrics, credentials, request bodies, or response bodies. After each
successful fixed stage, it signs that stage's exact binding and passes the
signed receipt to the next stage. The private key is never inherited by a
worker.

### Stage 2: Credentialed Capture Authority

The capture authority is the only process that receives the closed six-variable
live environment. It:

- reads the prepared input-only bundle and fixed code mirror;
- imports the production live-capture graph;
- cannot read corpus truth, source lock, reviews, request IDs, evaluator, or
  sealer code through its Node permission allowlist;
- may write only its pre-created candidate staging file and capture summary;
- validates Judge readiness and Ollama qualification with the approved
  `20000ms` limits, then runs all 300 inputs with `20000ms` local/Judge slots and
  the `40000ms` work budget;
- snapshots every prepared-bundle field once before validation;
- emits one exact capture summary after candidate materialization and exits
  before evaluation starts.

The acceptance authority's signed capture receipt binds the acceptance run ID,
inputs tree, code tree,
candidate package, candidate tree, decisions tree, cassette tree, fixture count,
P6 execution profile, and the exact content-free Judge binding.

### Stage 3: Truth-Aware Evaluator Authority

The evaluator starts with all six live variables absent. It:

- imports evaluator and benchmark contracts only, never production or network;
- verifies the capture receipt signature and all bound candidate hashes;
- reads an fd-bound immutable snapshot of corpus manifest and truth;
- computes the frozen aggregate metrics and writes one exclusive report;
- emits one exact accepted-evaluation summary only when every threshold passes
  and no infrastructure code is present; and
- exits before sealing starts.

The acceptance authority verifies that summary against the signed capture
receipt and signs the accepted-evaluation receipt. That receipt binds the
complete capture receipt hash,
evaluation report hash, candidate/corpus anchors, truth tree hash, accepted
metrics hash, fixture count, and acceptance run ID. It contains no per-fixture
truth, decision, raw content, provider prose, or credential.

### Stage 4: Truth-Blind Sealer Authority

The sealer starts with all six live variables absent. Its Node permission
allowlist excludes `truth/`. It:

- verifies both Ed25519 receipt signatures and their shared run ID;
- revalidates every candidate, report, manifest, and receipt binding from
  fd-bound snapshots;
- copies the accepted content-free cassette into exactly 300 replay envelopes;
- atomically publishes `capture.json`, `replay/`, then `seal.json`; and
- persists the canonical signed receipt chain in `seal.json`.

The sealer cannot issue or replace either receipt. A failed signature, changed
binding, stale path, extra artifact, or failed threshold produces no final
evidence.

## Signed Receipt Contract

Both receipts use the same externally provisioned Ed25519 acceptance key. The
tracked trust root is
`scripts/benchmark/sandbox-security/p6-acceptance-public-key.pem`; its matching
private key is local-only, mode `600`, ignored by Git, read only by
`accept-live.ts`, and never serialized, inherited, logged, copied into a bundle,
or retained in evidence. Public-key fingerprints and signatures use canonical
base64url without padding.

Each receipt has exact keys:

```text
schema_version
issuer
run_id
issued_binding
issued_binding_sha256
acceptance_public_key_sha256
signature_base64url
```

`issued_binding` is an exact normalized record specific to the issuer. The
signature covers the domain-separated canonical bytes:

```text
sandbox-security-p6-receipt.v1\n<schema_version>\n<issuer>\n<run_id>\n<issued_binding_sha256>
```

The verifier recomputes `issued_binding_sha256`, requires the fixed public-key
fingerprint, verifies with the source-controlled Ed25519 public key, and rejects
unknown keys, fields, encodings, issuer, schema, or domain separation. The
evaluation receipt includes the canonical capture receipt hash. The seal
includes both complete receipts and their canonical hashes, making the
authority transition durably and offline verifiable without retaining the
private key.

This is an execution-chain integrity proof rooted in the reviewed repository
public key. GENERAL-002 does not claim protection against root/kernel compromise,
private-key theft, or an attacker who can replace both source and trusted
repository history.

## Filesystem Snapshot And Path Rules

All security-relevant JSON and code files are read through a common snapshot
primitive:

1. require an absolute path below its already bound real root;
2. reject a symlink with `lstat`;
3. open with read-only and no-follow semantics;
4. require one regular file with `nlink === 1` and a bounded size;
5. bind `dev`, `ino`, `size`, and nanosecond mtime from `fstat`;
6. read all bytes from that descriptor only;
7. repeat `fstat` and reject any binding change; and
8. parse and normalize only the captured bytes.

Directory inventories are captured once, sorted, and exact. Every entry is
opened relative to the bound real root and rechecked before a tree hash is
accepted. Candidate, corpus, report, receipt, and output publication paths may
not be replaced between stages. Stage files use exclusive create, mode `600`,
fsync-before-rename, and exact parent directory bindings.

The acceptance authority rejects these relationships in either direction:

- corpus root versus capture-parent root;
- corpus root versus final output root; and
- capture-parent root versus final output root.

Equality, lexical containment, realpath containment, symlink roots, non-directory
roots, and output publication through an existing path all fail closed.

## Process I/O Contract

On success each stage must produce:

- exit code `0`;
- empty stderr; and
- exactly one newline-terminated stdout JSON object with exact keys and one
  fixed `status` value.

Leading/trailing lines, blank lines, logs, warnings, malformed UTF-8, oversized
output, unknown keys, duplicate summaries, or nonempty stderr fail the run.
Failure stderr is discarded and replaced by one bounded source-controlled error
code. No stage output may contain environment values, URLs with query data,
headers, request/response bodies, benchmark content, truth, or provider prose.

## Model Identifier Channel Rules

Ordinary production retains runtime requested-model selection. Controlled P6
adds one source-controlled live Judge binding profile containing the selected
protocol, endpoint policy, canonical base/endpoint hashes, requested-model hash,
and resolved-model hash. Changing any value requires a reviewed profile change
and a fresh capture.

Requested and resolved model identifiers retain their approved protocol syntax
and length limits. P6 requires their canonical SHA-256 values to match the live
binding profile before either value can enter evidence. In addition, capture
rejects a model identifier when it:

- equals or contains any configured credential value of eight or more bytes;
- is a base64, base64url, hexadecimal, percent-encoded, or JSON-string encoding
  of a configured credential;
- decodes to a configured credential or a serialized request/response fragment;
- contains ASCII control, whitespace, query, fragment, user-info, header, bearer,
  JSON delimiter, or line-break syntax; or
- changes after readiness within one capture.

Artifacts copy only the profile's reviewed stable model IDs and the six-field
Judge binding hash; they do not copy an unchecked provider field.

## Timing Boundary

This amendment does not change timing. Controlled P6 uses:

- readiness timeout: `20000ms`;
- Ollama qualification timeout: `20000ms`;
- local detector slot: `20000ms`;
- Judge detector slot: `20000ms`; and
- normal work budget: `40000ms`.

Ordinary production and P7 retain `5000ms` and `100/1000/4000ms`.

## Required RED Coverage

Before implementation, tests must demonstrate that the current code accepts or
cannot rule out each defect:

1. acceptance-authority import/capability co-location;
2. repeated input and prepared-bundle getters;
3. forward and reverse root overlap after realpath normalization;
4. file and directory replacement between validation and read/publication;
5. replay of capture or evaluation receipts;
6. extra or duplicate successful stdout and any successful stderr;
7. credential/body encodings in requested or resolved model identifiers;
8. a seal without a valid two-stage signed receipt chain; and
9. evaluator production imports or sealer truth-read permission.

Each regression must fail for the named behavior before the smallest owning
implementation change is made. Focused GREEN is followed by benchmark,
production, repository, TypeScript, and diff gates.

## Acceptance

P6 live execution may resume only when:

- all required RED cases are GREEN;
- the acceptance authority and three workers have disjoint static import and runtime
  permission graphs;
- signed receipt verification remains valid after process exit and is retained
  in the final seal;
- the exact `20s/40s` P6 profile is bound in both receipts and the seal;
- specification and quality/security reviewers report every original finding
  RESOLVED and final conclusion APPROVED; and
- a fresh real 300-input capture passes thresholds, final evidence validation,
  and sensitive-data scanning.

P7 remains blocked until that evidence exists.
