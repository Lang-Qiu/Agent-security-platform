import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SPEC_PATH =
  "docs/superpowers/specs/2026-07-16-sandbox-security-production-detectors-spec.md";
const SEVEN_DOMAIN_AMENDMENT_PATH =
  "docs/superpowers/specs/2026-08-02-sandbox-security-seven-domain-judge-screening-amendment.md";
const P6_JUDGE_LONG_TAIL_V8_AMENDMENT_PATH =
  "docs/superpowers/specs/2026-08-04-sandbox-security-p6-judge-long-tail-v8-amendment.md";
const P6_RETRY_AMENDMENT_PATH =
  "docs/superpowers/specs/2026-08-05-sandbox-security-p6-retry-amendment.md";

function readText(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function replaceRequired(
  text: string,
  matcher: RegExp,
  replacement: string
): string {
  const replaced = text.replace(matcher, replacement);
  assert.notEqual(replaced, text, `mutation did not match ${matcher.source}`);
  return replaced;
}

function extractSection(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing heading ${heading}`);
  const bodyStart = start + heading.length;
  const next = text.slice(bodyStart).search(/^## /m);
  return next === -1
    ? text.slice(bodyStart).trim()
    : text.slice(bodyStart, bodyStart + next).trim();
}

function assertGeneral002SpecReviewCorrections(text: string): void {
  const compact = text.replace(/\s+/g, " ");
  assert.match(text, /GET `\/api\/tags`/);
  assert.match(text, /`remote_model` and `remote_host`/);
  assert.match(compact, /bare 64-character lowercase hexadecimal digest/);
  assert.match(text, /module-private `WeakMap`/);
  assert.match(compact, /same transport object identity/);
  assert.match(compact, /cannot be serialized, copied, fabricated, or reused/);
  assert.match(compact, /every chat operation re-runs GET `\/api\/tags`/);
  assert.match(compact, /digest revalidation and chat share the Engine-provided signal/i);
  assert.match(text, /verified_ollama_digest/);
  assert.match(compact, /adapter copies only `verified_ollama_digest` into the content-free capture outcome/);
  assert.match(text, /capture_phase: "qualification" \| "evaluation"/);
  assert.match(text, /sandbox-security-ollama-prewarm.v1/);
  assert.match(text, /Routine status update: all scheduled checks completed\./);
  assert.match(
    compact,
    /ordered stream of anonymous two-slot input units in immutable manifest input order/
  );

  assert.match(compact, /public production composition constructs the default transport internally/);
  assert.match(compact, /authorization header is added only inside the default transport/);
  assert.match(compact, /`createSandboxSecurityProductionEngine` does not accept a transport/);
  assert.match(compact, /six approved Judge\/Ollama environment variables/);
  assert.doesNotMatch(compact, /five approved Judge\/Ollama environment variables/);
  assert.match(text, /- `SANDBOX_SECURITY_JUDGE_PROTOCOL`/);
  assert.doesNotMatch(text, /SANDBOX_SECURITY_JUDGE_PROTOCOL_ID/);

  assert.match(text, /`max_output_tokens: 4096`/);
  assert.match(text, /`text\.format` strict JSON Schema/);
  assert.match(compact, /exactly one completed assistant message/);
  assert.match(compact, /refusal, incomplete, error, or model mismatch/);
  assert.doesNotMatch(text, /\b(?:FIXED_PROMPT|JUDGE_SCHEMA_V1|SANITIZED_JSON)\b/);
  assert.match(text, /sandbox-security-openai-judge-prompt\.v2/);
  assert.match(text, /BEGIN_SANITIZED_PAYLOAD/);
  assert.match(text, /"additionalProperties": false/);

  assert.match(text, /sandbox-security-ollama-local-prompt\.v2/);
  assert.match(
    text,
    /Each candidate's subject_refs array must contain no duplicate references\./
  );
  assert.match(
    text,
    /e2632e29c2720f8f3c34436fe5daf6a7f251f5e912c3effeb21beccf56e4c196/
  );
  assert.match(text, /BEGIN_UNTRUSTED_SNAPSHOT/);
  assert.match(text, /num_predict: 2048/);
  assert.match(text, /num_ctx: 8192/);
  assert.match(compact, /`done_reason` to equal `stop`/);

  const sanitizer = extractSection(text, "## Deterministic Sanitizer");
  assert.doesNotMatch(
    extractSection(sanitizer, "The safe structural JSON-key catalog is exactly:"),
    /^(?:tool_name|value)$/m
  );
  const compactSanitizer = sanitizer.replace(/\s+/g, " ");
  assert.match(compactSanitizer, /`cookie`, `set_cookie`, and `proxy_authorization`/);
  assert.match(compactSanitizer, /unknown keys are replaced, not rejected/);
  assert.match(compactSanitizer, /core validator remains the sole authority/);
  assert.match(compactSanitizer, /`client_secret`, `x_auth_token`, and `private_token`/);
  assert.match(compactSanitizer, /canonical key segment equals `secret`, `token`, `cookie`, or `session`/);

  assert.match(text, /Node\.js permission model/);
  assert.match(compact, /`truth\/` is absent from every granted read path/);
  assert.match(compact, /capture and evaluator run in separate processes/i);
  assert.match(compact, /The local detector projection excludes `request_id`/);

  assert.match(text, /AgentDojo/);
  assert.match(text, /089ed468cf3ed0322acc66b0211f26d9d90dbf60/);
  assert.match(text, /ToolEmu/);
  assert.match(text, /ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb/);
  assert.match(text, /deepset\/prompt-injections/);
  assert.match(text, /4f61ecb038e9c3fb77e21034b22511b523772cdd/);
  assert.match(text, /OpenAssistant\/oasst1/);
  assert.match(text, /fdf72ae0827c1cda404aff25b6603abec9e3399b/);
  assert.match(text, /memory_poisoning/);
  assert.match(text, /AgentPoison.*not admissible/s);

  assert.doesNotMatch(text, /normalized_response: unknown/);
  assert.match(text, /status: "transport_error"/);
  assert.match(text, /status: "signal_termination"/);
  assert.doesNotMatch(text, /"caller_aborted"/);
  assert.match(compact, /waits for the current Engine signal to abort/);
  assert.match(text, /capture_manifest_sha256/);
  assert.match(text, /prompt_version/);
  assert.match(text, /rule_catalog_version/);

  assert.match(compact, /Detection success is exactly `decision\.verdict === "risk_detected"`/);
  assert.match(compact, /wrong category or severity does not change the frozen metric numerator/);
  assert.match(compact, /coverage denominator is exactly 300/);

  assert.match(compact, /destroy the active request, response, and socket/);
  assert.match(compact, /remove abort and stream listeners/);
  assert.match(compact, /settle exactly once/);

  assert.match(text, /createSandboxSecurityLiveCaptureEngine/);
  assert.match(text, /createSandboxSecurityHermeticReplayEngine/);
  assert.match(compact, /only `capture-live\.ts`, `replay-hermetic\.ts`, and repository tests/i);
  assert.match(compact, /production-to-core deep-import rule remains limited to the sanitizer helper/);

  assert.match(
    text,
    /export interface SandboxSecurityReplayTransport\s+extends SandboxSecurityHttpTransport/
  );
  assert.match(text, /export interface SandboxSecurityCaptureSink/);
  assert.match(text, /beginInput\(\): void;/);
  assert.match(text, /endInput\(\): void;/);
  assert.match(text, /assertDrained\(\): void;/);
  assert.match(
    compact,
    /No fixture ID, input ordinal, truth, category, severity, action, verdict, or metric is passed to these boundary methods\./
  );
  assert.match(
    compact,
    /The live capture runner calls `beginInput\(\)` immediately before each Engine evaluation and `endInput\(\)` in its `finally` path\./
  );
  assert.match(
    compact,
    /The replay runner calls `beginInput\(\)` immediately before each Engine evaluation and `endInput\(\)` in its `finally` path\./
  );
  assert.match(
    compact,
    /A per-input boundary fails unless every provider slot was either consumed by its matching request or explicitly recorded as `not_called`\./
  );
  assert.match(
    compact,
    /The capture sink begins in `qualification_inventory` and accepts exactly one `ollama` `model_inventory` qualification record before any input boundary\./
  );
  assert.match(
    compact,
    /It then enters `qualification_prewarm`, accepts exactly one `ollama` `chat` qualification record, and enters `ready` only when both qualification outcomes are successful\./
  );
  assert.match(
    compact,
    /`beginInput\(\)` rejects before `ready`, and `assertDrained\(\)` rejects incomplete or failed qualification\./
  );
  assert.match(
    compact,
    /The replay transport begins in `qualification_inventory`, where its only legal boundary-free request is `ollama` `model_inventory`\./
  );
  assert.match(
    compact,
    /It then enters `qualification_prewarm`, where its only legal boundary-free request is `ollama` `chat`\./
  );
  assert.match(
    compact,
    /Only after it consumes and validates both successful qualification outcomes may it enter `ready` and permit `beginInput\(\)`\./
  );
  assert.match(
    compact,
    /After `ready`, an outside-boundary request or a further qualification operation fails\./
  );
  assert.match(
    compact,
    /`assertDrained\(\)` requires successful qualification, no open input, exactly 300 closed input units, and no unconsumed expected outcome\./
  );
}

function assertSevenDomainJudgeScreeningContract(): void {
  const spec = readText(SPEC_PATH);
  const amendment = readText(SEVEN_DOMAIN_AMENDMENT_PATH);
  const detector = readText(
    "engines/sandbox/src/security-production/ollama-local-detector.ts"
  );
  const composition = readText(
    "engines/sandbox/src/security-production/composition.ts"
  );
  const benchmark = readText(
    "engines/sandbox/src/security-production/benchmark-composition.ts"
  );
  const compactAmendment = amendment.replace(/\s+/g, " ");

  assert.match(spec, /### Seven-Domain Judge Screening/);
  assert.match(spec, /seven_domain_v2/);
  assert.match(amendment, /IMPLEMENTED_PENDING_FRESH_LIVE_ACCEPTANCE/);
  assert.match(compactAmendment, /AgentDojo revision `089ed468cf3ed0322acc66b0211f26d9d90dbf60`/);
  assert.match(compactAmendment, /ToolEmu revision `ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb`/);
  assert.match(compactAmendment, /ordinary `local` mode;.*`seven_domain_v2` for `local_and_judge`/);
  assert.match(
    compactAmendment,
    /more than eight combined content\/tool subjects.*fail with the fixed local detector failure/i
  );
  assert.match(compactAmendment, /does not change:.*metric thresholds/);
  assert.match(compactAmendment, /P7 MUST replay the captured seven-obligation Judge request/);
  assert.match(compactAmendment, /exactly one Judge request/);
  assert.match(compactAmendment, /no retry, fallback, or alternate provider/i);
  assert.match(compactAmendment, /must not read.*benchmark.*body.*per-item label/i);
  assert.match(compactAmendment, /AgentDojo.*IgnorePreviousAttack/i);
  assert.match(compactAmendment, /ToolEmu.*underspecified instruction/i);

  assert.match(
    detector,
    /SEVEN_DOMAIN_SCREENING_CATEGORIES\s*=\s*Object\.freeze\(\[\s*"prompt_injection",\s*"jailbreak",\s*"instruction_override",\s*"privilege_escalation",\s*"sensitive_data_exposure",\s*"unsafe_side_effect",\s*"trust_boundary_violation"/s
  );
  assert.match(detector, /confidence:\s*0\.6/);
  assert.match(detector, /subjectCount === 0 \|\| subjectCount > 8/);
  assert.match(detector, /judgeScreeningMode === "seven_domain_v2"/);
  assert.doesNotMatch(detector, /judgeScreeningMode === "five_domain_v1"/);
  assert.match(
    composition,
    /normalized\.mode === "local_and_judge"\s*\? "seven_domain_v2"\s*:\s*"disabled"/s
  );
  assert.match(benchmark, /judge_screening_mode:\s*input\.judge_screening_mode/g);
}

test("REQ-SBX-GENERAL-002 Spec closes blocking review findings", () => {
  assertGeneral002SpecReviewCorrections(readText(SPEC_PATH));
});

test("REQ-SBX-GENERAL-002 seven-domain Judge screening policy is source-controlled and replay-bound", () => {
  assertSevenDomainJudgeScreeningContract();
});

test("REQ-SBX-GENERAL-002 P6 v8 Judge long-tail profile is exact and isolated from ordinary production", () => {
  const amendment = readText(P6_JUDGE_LONG_TAIL_V8_AMENDMENT_PATH);
  const profile = readText(
    "engines/sandbox/src/security-production/p6-live-capture-profile.ts"
  );
  const engine = readText("engines/sandbox/src/security/engine.ts");
  const compact = amendment.replace(/\s+/g, " ");

  assert.match(amendment, /p6_local_hardware_compatibility_v8/);
  assert.match(compact, /Judge readiness: `40000ms`/);
  assert.match(compact, /Ollama qualification and warmed prewarm: `40000ms`/);
  assert.match(compact, /Judge detector slot: `300000ms`/);
  assert.match(compact, /normal work budget: `360000ms`/);
  assert.match(compact, /Ordinary production and P7 hermetic replay retain the GENERAL-001 `5000ms`/);
  assert.match(compact, /Every invoked provider slot still requires a normalized response/);
  assert.match(profile, /p6_local_hardware_compatibility_v8/);
  assert.match(profile, /readiness_timeout_ms: 40000/);
  assert.match(profile, /qualification_timeout_ms: 40000/);
  assert.match(profile, /judge_detector_slot_timeout_ms: 300000/);
  assert.match(profile, /normal_work_budget_ms: 360000/);
  assert.match(engine, /const DEFAULT_NORMAL_WORK_BUDGET_MS = 5000/);
  assert.match(engine, /const P6_LIVE_CAPTURE_NORMAL_WORK_BUDGET_MS = 360000/);
  assert.match(engine, /const P6_LIVE_CAPTURE_JUDGE_SLOT_TIMEOUT_MS = 300000/);
});

test("REQ-SBX-GENERAL-002 P6 retry amendment is reflected in durable policy docs", () => {
  const amendment = readText(P6_RETRY_AMENDMENT_PATH);
  const architecture = readText("docs/architecture.md");
  const progress = readText("docs/progress.md");
  const sprint = readText("docs/sprint-current.md");
  const runbook = readText(
    "docs/superpowers/2026-07-26-p6-live-acceptance-operator-runbook.md"
  );
  const compactAmendment = amendment.replace(/\s+/g, " ");
  const compactArchitecture = architecture.replace(/\s+/g, " ");
  const compactProgress = progress.replace(/\s+/g, " ");
  const compactSprint = sprint.replace(/\s+/g, " ");
  const compactRunbook = runbook.replace(/\s+/g, " ");

  assert.match(compactAmendment, /exactly one retry/);
  assert.match(compactAmendment, /connection_failed/);
  assert.match(compactAmendment, /sandbox-security-benchmark-capture\.v2/);
  assert.match(compactAmendment, /final `response` outcome/);
  assert.match(compactAmendment, /v1 capture manifests.*reject/i);
  assert.match(
    compactArchitecture,
    /P6.*exactly one retry.*connection_failed.*v2.*fail.?closed/i
  );
  assert.match(compactProgress, /P6 Retry Amendment.*connection_failed/s);
  assert.match(compactSprint, /P6 retry amendment.*fresh.*300/i);
  assert.match(
    compactRunbook,
    /P6 retry amendment.*exactly one retry.*connection_failed.*readiness.*no retry/i
  );
  assert.doesNotMatch(
    compactRunbook,
    /active P6 policy is single.?attempt and no retry/i
  );
});

test("REQ-SBX-GENERAL-002 Spec review gate rejects weakened Ollama qualification", () => {
  const weakened = readText(SPEC_PATH)
    .replace("GET `/api/tags`", "GET `/api/models`")
    .replace("module-private `WeakMap`", "readonly object");
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec review gate rejects unsafe sanitizer keys", () => {
  const weakened = readText(SPEC_PATH).replace(
    "target\nurl",
    "target\ntool_name\nurl\nvalue"
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec review gate rejects truth-readable capture", () => {
  const weakened = replaceRequired(
    readText(SPEC_PATH),
    /`truth\/` is absent from every\s+granted\s+read\s+path/,
    "`truth/` is available but capture promises not to read it"
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec review gate rejects unbound source revisions", () => {
  const weakened = readText(SPEC_PATH).replace(
    "089ed468cf3ed0322acc66b0211f26d9d90dbf60",
    "main"
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec re-review gate rejects symbolic provider contracts", () => {
  const weakened = readText(SPEC_PATH).replace(
    "sandbox-security-openai-judge-prompt.v2",
    "FIXED_PROMPT"
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec re-review gate rejects immediate timeout replay", () => {
  const weakened = readText(SPEC_PATH).replace(
    "status: \"signal_termination\"",
    "status: \"caller_aborted\""
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec final review gate rejects unbound digest capture", () => {
  const weakened = readText(SPEC_PATH).replace(
    "verified_ollama_digest",
    "omitted_ollama_digest"
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec final review gate rejects flat replay FIFO", () => {
  const weakened = readText(SPEC_PATH)
    .replace(/  beginInput\(\): void;\n/g, "")
    .replace(/  endInput\(\): void;\n/g, "")
    .replace(/  assertDrained\(\): void;\n/g, "");
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec final review gate rejects premature replay input", () => {
  const weakened = replaceRequired(
    readText(SPEC_PATH),
    /Only after it consumes and validates both successful qualification\s+outcomes may it enter `ready` and permit `beginInput\(\)`\./,
    "The replay transport may permit `beginInput()` before qualification completes."
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec final review gate rejects replay requests outside ready inputs", () => {
  const weakened = replaceRequired(
    readText(SPEC_PATH),
    /After `ready`, an\s+outside-boundary request or a further qualification operation fails\./,
    "After `ready`, an outside-boundary request is allowed."
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec final review gate rejects unclosed not-called slots", () => {
  const weakened = replaceRequired(
    readText(SPEC_PATH),
    /either consumed by its matching request or explicitly\s+recorded as `not_called`\./,
    "either consumed by its matching request or ignored."
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 Spec final review gate rejects incomplete qualification drain", () => {
  const weakened = replaceRequired(
    readText(SPEC_PATH),
    /`assertDrained\(\)` requires successful qualification, no open input, exactly 300\s+closed input units, and no unconsumed expected outcome\./,
    "`assertDrained()` requires no open input."
  );
  assert.throws(() => assertGeneral002SpecReviewCorrections(weakened));
});

test("REQ-SBX-GENERAL-002 durable docs describe current production scope", () => {
  const readme = readText("README.md");
  const progress = readText("docs/progress.md");
  const compactReadme = readme.replace(/\s+/g, " ");
  const compactProgress = progress.replace(/^>\s*/gm, "").replace(/\s+/g, " ");
  assert.match(
    compactReadme,
    /Sandbox Security Production currently adds production detector composition, deterministic sanitization, selected Judge protocol adapters, and sealed benchmark tooling/
  );
  assert.doesNotMatch(readme, /Sandbox Security Core 当前仍未包含:/);
  assert.doesNotMatch(readme, /不开始 GENERAL-002/);
  assert.match(
    compactProgress,
    /superseded by the 2026-07-23 explicit protocol selection and operator adapter amendments/i
  );
  assert.match(
    compactProgress,
    /superseded by the next section's P6 local hardware compatibility profile/i
  );
});

test("REQ-SBX-GENERAL-002 Spec gate is permanently registered in test:repo", () => {
  const packageJson = JSON.parse(readText("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.match(
    packageJson.scripts?.["test:repo"] ?? "",
    /tests\/repository\/sandbox-security-production-spec\.spec\.ts/
  );
});
