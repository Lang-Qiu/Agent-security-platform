# Spec: REQ-T1-DEMO-010 Review Demo Content

## Document Status

- Requirement: `REQ-T1-DEMO-010`
- Slice: review-demo content only
- Status: approved in conversation; pending written-spec review
- Date: `2026-07-04`
- Target worktree: `track1-requirements-spec`
- Workflow: `Design -> Test (RED) -> Implement (GREEN) -> Document -> Stop and report`

## Objective

Create a durable Chinese content catalog for the offline evaluator experience
of Lingjian AgentScope. The catalog will explain the product, guide a five
minute review, introduce the three controlled Track 1 scenarios, identify the
evidence surfaces, and state the safety and evidence boundaries.

This slice creates content and its repository validation only. It does not add
a review route, change the campaign API, package an executable, or claim that
fixture evidence is a credentialed cloud-model acceptance baseline.

## Current Context

The `track1-requirements-spec` worktree contains:

- a real build, deployment, health-check, plugin-load, and campaign
  orchestration path;
- the Phase 6 report and evidence pipeline;
- a deterministic fixture evidence pack under
  `artifacts/track1/fixture-evidence/`;
- existing shared campaign and supervision contracts;
- existing frontend-only mock factories for controlled development data.

The fixture evidence pack is suitable as structured test data, but it is not
accepted competition evidence:

- its report explicitly identifies Phase 7 credentialed execution as pending;
- its five PNG files are identical blank capture fixtures;
- its PDF is a minimal binary test fixture;
- no accepted baseline exists under
  `docs/track1/evidence/openclaw-baseline/`.

The review content must therefore describe verified capabilities and controlled
evaluation data without presenting placeholder binary artifacts as real review
evidence.

## Considered Approaches

### 1. Reuse the fixture evidence pack directly

This is the fastest option, but the placeholder screenshots and PDF are not
review-quality. It would also make the evaluator experience depend on
implementation-oriented report text.

Decision: rejected.

### 2. Hard-code a review narrative inside React components

This would make the first UI implementation quick, but it would mix editorial
content with rendering behavior, duplicate scenario labels across components,
and make later replacement with an accepted baseline harder.

Decision: rejected.

### 3. Separate a machine-readable content catalog from evidence data

Store stable Chinese review copy and navigation metadata in a versioned sample
file. Keep metrics, actions, campaign state, and evidence hashes outside the
content catalog so a future UI reads them from normalized evidence.

Decision: selected.

## Content Model

Create one versioned JSON document:

```text
samples/track1/review-demo/content.zh-CN.json
```

The exact top-level fields are:

```text
schema_version
locale
product
source_notice
review_tour
capabilities
scenarios
metric_bindings
evidence_surfaces
safety_boundary
frequently_asked_questions
```

### Product

The product section contains:

- name: `灵鉴 AgentScope`;
- positioning: intelligent-agent full-chain security inspection and behavior
  supervision platform;
- tagline: `看见 Agent，守住边界。`;
- a concise evaluator-facing summary.

It must not include team member names, school identity, credentials, provider
URLs, or mutable test counts.

### Source Notice

The source notice must remain visible whenever this catalog is used:

```text
受控评审数据 · 非实时云模型验收结果
```

It explains that:

- the review data is deterministic and reproducible;
- all tool effects are simulated;
- the infrastructure path and fixture evidence are separate proof layers;
- accepted cloud-model baseline results may replace the evidence data later;
- the content catalog itself does not certify a campaign result.

### Five-Minute Review Tour

The tour contains exactly five ordered steps:

1. Product objective and safe research boundary.
2. Runtime readiness: build, deployment, health checks, plugin and hook load.
3. Campaign overview: three agents, nine controlled cases, and normalized
   supervision.
4. Scenario investigation: prompt injection, tool-call hijacking, and
   context/memory poisoning.
5. Evidence verification: report, campaign JSON, screenshot set, and
   SHA-256 manifest.

Each step contains a title, evaluator question, presenter guidance, target
surface, and recommended duration. Total recommended duration must be 300
seconds.

### Capabilities

The catalog presents the following stable capabilities:

- Agent asset and attack-surface awareness;
- Skills static security inspection;
- OpenClaw native monitoring plugin;
- pre-tool policy decision and confirmation barrier;
- controlled sandbox and simulated business tools;
- campaign-level multi-agent supervision;
- normalized, content-minimized evidence;
- deterministic report and manifest pipeline.

The content describes capabilities, not pass rates or benchmark claims.

### Scenarios

The catalog contains exactly these scenarios in contract order:

1. `T1-SC-001`: prompt injection and jailbreak;
2. `T1-SC-002`: tool-call hijacking;
3. `T1-SC-003`: context and memory poisoning.

Every scenario contains:

- a Chinese display name;
- the evaluator question;
- the controlled attack objective;
- the control mechanism to inspect;
- the expected evidence surfaces;
- residual-risk wording;
- its canonical `agent_id`.

Expected and actual policy actions are not duplicated in the content catalog.
They must be read from the immutable case manifest and normalized campaign
evidence by a later UI.

### Metric Bindings

The catalog defines labels and display order only for:

- `agent_count`;
- `case_count`;
- `attempt_count`;
- `retry_count`;
- `deny_count`;
- `ask_count`;
- `allow_count`;
- `blocked_count`;
- `intercepted_tool_count`;
- `executed_simulated_tool_count`;
- `real_side_effect_count`.

No metric value is stored in the content catalog. A future UI must bind values
from a normalized report or campaign projection.

### Evidence Surfaces

The catalog identifies, but does not embed:

- campaign overview;
- scenario and session investigation;
- `security-risk-analysis.md`;
- `security-risk-analysis.pdf`;
- `campaign.json`;
- five screenshots;
- `manifest.json`.

Fixture screenshots and PDF must be described as pipeline fixtures until
replaced by validated review-quality artifacts.

### Safety Boundary

The catalog states:

- no third-party or unauthorized target;
- no real email delivery;
- no host filesystem write;
- no arbitrary external API side effect;
- no raw model input/output, tool arguments/results, memory values,
  credentials, or chain-of-thought in review data;
- all demonstrations use controlled fixtures and simulated tools;
- credentialed acceptance remains a separate explicit gate.

### Frequently Asked Questions

The catalog answers at least:

1. Is this fixture data or a live cloud-model result?
2. Which parts of the infrastructure path have been exercised?
3. Why are tool effects simulated?
4. How are policy actions and metrics derived?
5. How can an evaluator verify artifact integrity?
6. How will accepted baseline data replace the fixture data?

## Data Ownership and Future Use

The content catalog is presentation metadata owned by the Track 1 sample
surface. It must not redefine shared API DTOs.

A future review-mode UI may import the catalog, but it must continue to obtain
campaign, session, action, metric, and evidence values through existing
normalized contracts or a separately validated baseline loader. The UI must
show the source notice and must not silently fall back from real evidence to
fixture data.

## Files

This slice will modify only:

- Create: `samples/track1/review-demo/content.zh-CN.json`
- Create: `docs/track1/review-demo-content.md`
- Create: `tests/repository/track1-review-demo-content.spec.ts`
- Modify: `package.json`
- Modify: `docs/progress.md`

The current fixture artifacts, frontend components, backend APIs, shared
contracts, executable packaging, and accepted baseline directory are out of
scope.

## TDD Strategy

The repository test must be written and shown failing before the JSON content
or durable review document is created.

The RED test will require:

- exact schema version and locale;
- exact closed top-level key set;
- exactly five ordered review steps totaling 300 seconds;
- exactly three scenarios in canonical order with matching agent IDs;
- unique capability, metric, evidence, and FAQ identifiers;
- metric bindings without embedded values;
- the permanent controlled-data source notice;
- explicit safety-boundary statements;
- no credential, provider URL, raw-content field, chain-of-thought, or mutable
  pass-rate claim;
- no claim that fixture screenshots or PDF are accepted real evidence;
- registration in the root repository test command.

GREEN is the smallest content file and documentation required to satisfy those
tests.

## Documentation

`docs/track1/review-demo-content.md` is the human-readable evaluator narrative
and editorial guide. It links to canonical requirement, architecture, API, and
scenario documents rather than copying their full contracts.

After GREEN:

- update `docs/progress.md` with the actual RED and GREEN commands;
- inspect `README.md`, `docs/architecture.md`, and `docs/api-contract.md`;
- change them only if this content-only slice alters their source-of-truth
  statements.

## Acceptance Criteria

The slice is complete when:

1. the content repository test first fails for the intended missing-content
   reason;
2. the versioned JSON content and human-readable guide satisfy the test;
3. the root repository test command includes the new gate;
4. no production UI, API, shared contract, or runtime behavior changes;
5. the content clearly distinguishes controlled fixture data from accepted
   credentialed evidence;
6. relevant tests pass;
7. documentation records the result;
8. work stops and reports without starting review-mode UI implementation.

## Non-Goals

- Electron or executable packaging;
- a new frontend route or component;
- changing `mock-only` or `api-preferred` service behavior;
- embedding the fixture evidence pack into production;
- generating review-quality screenshots or PDF;
- running a credentialed model campaign;
- promoting an accepted baseline;
- changing engine, platform, or shared-contract boundaries.
