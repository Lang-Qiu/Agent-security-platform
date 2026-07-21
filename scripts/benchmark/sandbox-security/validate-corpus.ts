import { createHash } from "node:crypto";
import {
  lstatSync,
  opendirSync,
  readFileSync
} from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";

import {
  hashSandboxSecurityBenchmarkCanonicalJson,
  hashSandboxSecurityBenchmarkTree,
  normalizeSandboxSecurityBenchmarkInputEnvelope,
  normalizeSandboxSecurityBenchmarkManifest,
  normalizeSandboxSecurityBenchmarkRequestIds,
  normalizeSandboxSecurityBenchmarkReviews,
  normalizeSandboxSecurityBenchmarkSourcesLock,
  normalizeSandboxSecurityBenchmarkTruthEnvelope,
  type SandboxSecurityBenchmarkInputEnvelope,
  type SandboxSecurityBenchmarkLanguage,
  type SandboxSecurityBenchmarkRequestIds,
  type SandboxSecurityBenchmarkReviewRecord,
  type SandboxSecurityBenchmarkReviews,
  type SandboxSecurityBenchmarkSourcesLock,
  type SandboxSecurityBenchmarkTruthEnvelope
} from "./contracts.ts";

const FIXTURE_COUNT = 300;
const RISK_COUNT = 180;
const SAFE_COUNT = 120;
const LANGUAGE_COUNT = 150;
const STAGE_COUNT = 100;
const CATEGORY_COUNT = 20;
const MIN_TRANSFORMED_RISK = 54;
const MIN_HIGH_OR_CRITICAL = 60;
const MIN_HIGH = 20;
const MIN_CRITICAL = 20;
const MIN_SAFE_MULTI_SOURCE_PER_STAGE = 10;
const MIN_SAFE_RETRIEVED = 10;
const MIN_SAFE_MEMORY = 10;
const MIN_RISK_SINGLE_SOURCE_PER_STAGE = 5;
const MAX_JSON_FILE_BYTES = 512 * 1024;
const MAX_ORACLE_TERMS = 1024;
const MAX_ORACLE_TERM_BYTES = 96 * 1024;
const MAX_ORACLE_SCAN_NODES = 200_000;
const MAX_ORACLE_SCAN_BYTES = 16 * 1024 * 1024;
const OPAQUE_REQUEST_ID = /^[a-f0-9]{32}$/u;
const FIXTURE_ID = /^ssb-v1-[0-9]{4}$/u;
const FIXTURE_ID_FRAGMENT = /ssb-v1-[0-9]{4}/u;
const BENIGN_CONTROL_ORDER_PROVENANCE =
  /^(?:retrieval|memory):\/\/benchmark\/benign-control\/(?:ssb-v1-)?[0-9]{1,4}(?:$|[/?#])/u;
const HAN_SCRIPT = /\p{Script=Han}/u;
const FORBIDDEN_PROVENANCE =
  /(?:T1-SC-|track[ _:-]?1|expected_action|report[ _:-]?fixture|development[ _:-]?fixture|dev[ _:-]?fixture|campaign)/iu;
const FORBIDDEN_REQUEST_KEYS = new Set([
  "action",
  "category",
  "derivation",
  "expected_action",
  "fixture",
  "fixture_id",
  "ground_truth_severity",
  "primary_category",
  "seed_record_ref",
  "severity",
  "transformation_kind",
  "transformed",
  "truth",
  "verdict_class"
]);
const CATEGORIES = [
  "prompt_injection",
  "jailbreak",
  "instruction_override",
  "privilege_escalation",
  "sensitive_data_exposure",
  "tool_hijacking",
  "unsafe_side_effect",
  "memory_poisoning",
  "trust_boundary_violation"
] as const;
const STAGES = ["user_input", "model_output", "tool_request"] as const;
const FORBIDDEN_REQUEST_VALUES = new Set([
  ...CATEGORIES,
  "allow",
  "block",
  "critical",
  "escalate",
  "high",
  "low",
  "medium",
  "risk",
  "safe"
]);

function truncatedSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

const ORDER_DERIVED_REQUEST_IDS = new Set(
  Array.from({ length: FIXTURE_COUNT + 1 }, (_, index) => index).flatMap(
    (ordinal) => [
      String(ordinal).padStart(32, "0"),
      ordinal.toString(16).padStart(32, "0"),
      truncatedSha256(String(ordinal)),
      truncatedSha256(`slot:${ordinal}`),
      truncatedSha256(`request:${ordinal}`)
    ]
  )
);

type Category = (typeof CATEGORIES)[number];
type Stage = (typeof STAGES)[number];

export interface SandboxSecurityBenchmarkCorpusValidationReport {
  readonly counts: Readonly<{
    readonly total: number;
    readonly risk: number;
    readonly safe: number;
    readonly zh: number;
    readonly en: number;
    readonly transformed_risk: number;
    readonly low: number;
    readonly medium: number;
    readonly high: number;
    readonly critical: number;
    readonly high_or_critical: number;
    readonly each_primary_risk_category: number;
    readonly each_stage: number;
    readonly safe_retrieved: number;
    readonly safe_memory: number;
    readonly safe_multisource_by_stage: Readonly<Record<Stage, number>>;
    readonly risk_single_source_by_stage: Readonly<Record<Stage, number>>;
    readonly by_primary_risk_category: Readonly<Record<Category, number>>;
    readonly by_stage: Readonly<Record<Stage, number>>;
  }>;
  readonly hashes: Readonly<{
    readonly sources_lock_sha256: string;
    readonly inputs_tree_sha256: string;
    readonly truth_tree_sha256: string;
    readonly reviews_tree_sha256: string;
    readonly request_ids_tree_sha256: string;
    readonly manifest_sha256: string;
  }>;
}

interface CorpusInput {
  readonly corpus_root: string;
  readonly sources_lock: Readonly<SandboxSecurityBenchmarkSourcesLock>;
}

interface MatrixState {
  risk: number;
  safe: number;
  zh: number;
  en: number;
  transformedRisk: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  readonly categories: Record<Category, number>;
  readonly stages: Record<Stage, number>;
  safeRetrieved: number;
  safeMemory: number;
  readonly safeMultisourceByStage: Record<Stage, number>;
  readonly riskSingleSourceByStage: Record<Stage, number>;
}

interface LockedRecord {
  readonly sourceId: string;
  readonly recordRef: string;
  readonly upstreamSha256: string;
}

interface OracleScanBudget {
  nodes: number;
  bytes: number;
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function fail(reason: string): never {
  throw new TypeError(`corpus_validation_failed:${reason}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function exactCorpusInput(value: CorpusInput): CorpusInput {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return fail("input_invalid");
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 2 ||
      !keys.includes("corpus_root") ||
      !keys.includes("sources_lock")
    ) {
      return fail("input_invalid");
    }
    for (const key of keys) {
      if (typeof key !== "string") return fail("input_invalid");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return fail("input_invalid");
      }
    }
    if (
      typeof value.corpus_root !== "string" ||
      value.corpus_root.length < 1 ||
      value.corpus_root.length > 4096
    ) {
      return fail("input_invalid");
    }
    return value;
  } catch {
    return fail("input_invalid");
  }
}

function parseJsonFile(
  path: string,
  reason: string,
  utf8Reason = `${reason}_utf8`
): unknown {
  let bytes: Buffer;
  try {
    const stat = lstatSync(path);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.size < 2 ||
      stat.size > MAX_JSON_FILE_BYTES
    ) {
      return fail(reason);
    }
    bytes = readFileSync(path);
    if (bytes.byteLength !== stat.size || bytes.byteLength > MAX_JSON_FILE_BYTES) {
      return fail(reason);
    }
  } catch {
    return fail(reason);
  }
  let text: string;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    return fail(utf8Reason);
  }
  try {
    return JSON.parse(text);
  } catch {
    return fail(reason);
  }
}

function readFlatJsonInventory(root: string, reason: string): string[] {
  try {
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return fail(reason);
    const directory = opendirSync(root);
    const names: string[] = [];
    try {
      while (true) {
        const entry = directory.readSync();
        if (entry === null) break;
        if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
          return fail(reason);
        }
        names.push(entry.name);
        if (names.length > FIXTURE_COUNT) return fail(reason);
      }
    } finally {
      directory.closeSync();
    }
    return names.sort();
  } catch {
    return fail(reason);
  }
}

function normalizeSourcesLock(
  value: unknown
): Readonly<SandboxSecurityBenchmarkSourcesLock> {
  try {
    return normalizeSandboxSecurityBenchmarkSourcesLock(value);
  } catch {
    return fail("sources_lock_invalid");
  }
}

function normalizeManifestFile(path: string) {
  try {
    return normalizeSandboxSecurityBenchmarkManifest(
      parseJsonFile(path, "manifest_invalid")
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "corpus_validation_failed:manifest_invalid_utf8"
    ) {
      throw error;
    }
    return fail("manifest_invalid");
  }
}

function normalizeInputFile(path: string): Readonly<SandboxSecurityBenchmarkInputEnvelope> {
  try {
    return normalizeSandboxSecurityBenchmarkInputEnvelope(
      parseJsonFile(path, "input_invalid")
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "corpus_validation_failed:input_invalid_utf8"
    ) {
      throw error;
    }
    return fail("input_invalid");
  }
}

function normalizeTruthFile(path: string): Readonly<SandboxSecurityBenchmarkTruthEnvelope> {
  try {
    return normalizeSandboxSecurityBenchmarkTruthEnvelope(
      parseJsonFile(path, "truth_invalid")
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "corpus_validation_failed:truth_invalid_utf8"
    ) {
      throw error;
    }
    return fail("truth_invalid");
  }
}

function normalizeReviewsFile(path: string): Readonly<SandboxSecurityBenchmarkReviews> {
  try {
    return normalizeSandboxSecurityBenchmarkReviews(
      parseJsonFile(path, "reviews_invalid")
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "corpus_validation_failed:reviews_invalid_utf8"
    ) {
      throw error;
    }
    return fail("reviews_invalid");
  }
}

function normalizeRequestIdsFile(
  path: string
): Readonly<SandboxSecurityBenchmarkRequestIds> {
  try {
    return normalizeSandboxSecurityBenchmarkRequestIds(
      parseJsonFile(path, "request_ids_invalid")
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "corpus_validation_failed:request_ids_invalid_utf8"
    ) {
      throw error;
    }
    return fail("request_ids_invalid");
  }
}

function assertSingletonInventory(
  root: string,
  expectedName: string,
  reason: string
): void {
  let names: string[];
  try {
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return fail(reason);
    const directory = opendirSync(root);
    names = [];
    try {
      while (true) {
        const entry = directory.readSync();
        if (entry === null) break;
        if (!entry.isFile() || entry.isSymbolicLink()) return fail(reason);
        names.push(entry.name);
        if (names.length > 1) return fail(reason);
      }
    } finally {
      directory.closeSync();
    }
  } catch {
    return fail(reason);
  }
  if (names.length !== 1 || names[0] !== expectedName) return fail(reason);
}

function assertExpectedFixtureIds(fixtureIds: readonly string[]): void {
  if (fixtureIds.length !== FIXTURE_COUNT) {
    return fail("matrix_total_expected_300");
  }
  for (let index = 0; index < FIXTURE_COUNT; index += 1) {
    const expected = `ssb-v1-${String(index + 1).padStart(4, "0")}`;
    if (fixtureIds[index] !== expected || !FIXTURE_ID.test(fixtureIds[index]!)) {
      return fail("fixture_order");
    }
  }
}

function assertFixtureInventory(
  fixtureIds: readonly string[],
  inputFiles: readonly string[],
  truthFiles: readonly string[]
): void {
  const expected = fixtureIds.map((fixtureId) => `${fixtureId}.json`).sort();
  if (
    inputFiles.length !== FIXTURE_COUNT ||
    truthFiles.length !== FIXTURE_COUNT ||
    expected.some((name, index) =>
      inputFiles[index] !== name || truthFiles[index] !== name
    )
  ) {
    return fail("fixture_pairing");
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildLockedIdentifierMatcher(terms: ReadonlySet<string>): RegExp {
  const values = [...terms];
  const bytes = values.reduce(
    (total, value) => total + Buffer.byteLength(value, "utf8"),
    0
  );
  if (values.length > MAX_ORACLE_TERMS || bytes > MAX_ORACLE_TERM_BYTES) {
    return fail("resource_budget");
  }
  values.sort((left, right) => right.length - left.length ||
    left.localeCompare(right, "en"));
  return new RegExp(values.map(escapeRegExp).join("|"), "u");
}

function assertRequestOracleBoundary(
  value: unknown,
  matcher: RegExp,
  budget: OracleScanBudget,
  seen = new WeakSet<object>()
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_ORACLE_SCAN_NODES) return fail("resource_budget");
  if (typeof value === "string") {
    budget.bytes += Buffer.byteLength(value, "utf8");
    if (budget.bytes > MAX_ORACLE_SCAN_BYTES) return fail("resource_budget");
    if (
      FIXTURE_ID_FRAGMENT.test(value) ||
      FORBIDDEN_REQUEST_VALUES.has(value.toLowerCase()) ||
      matcher.test(value)
    ) {
      return fail("input_oracle_boundary");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return fail("input_oracle_boundary");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        assertRequestOracleBoundary(item, matcher, budget, seen);
      }
      return;
    }
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_REQUEST_KEYS.has(normalizedKey)) {
        return fail("input_oracle_boundary");
      }
      if (
        normalizedKey === "provenance_ref" &&
        typeof item === "string" &&
        BENIGN_CONTROL_ORDER_PROVENANCE.test(item)
      ) {
        return fail("input_oracle_boundary");
      }
      assertRequestOracleBoundary(key, matcher, budget, seen);
      assertRequestOracleBoundary(item, matcher, budget, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function prebindInputProjection(
  input: Readonly<SandboxSecurityBenchmarkInputEnvelope>
): unknown {
  const { request_id: _requestId, ...submission } =
    input.evaluation_request.submission;
  return {
    ...input,
    evaluation_request: {
      ...input.evaluation_request,
      submission
    }
  };
}

function prebindTruthProjection(
  truth: Readonly<SandboxSecurityBenchmarkTruthEnvelope>
): unknown {
  const { fixture_sha256: _fixtureSha256, ...projection } = truth;
  return projection;
}

function assertOpaqueRequest(
  slotOrdinal: number,
  fixtureId: string,
  input: Readonly<SandboxSecurityBenchmarkInputEnvelope>,
  truth: Readonly<SandboxSecurityBenchmarkTruthEnvelope>,
  expectedRequestId: string,
  upstreamHashesByKey: ReadonlyMap<string, string>,
  matcher: RegExp,
  requestIds: Set<string>,
  scanBudget: OracleScanBudget
): void {
  const requestId = input.evaluation_request.submission.request_id;
  if (requestId !== expectedRequestId) return fail("request_id_slot_mismatch");
  if (!OPAQUE_REQUEST_ID.test(requestId) || requestIds.has(requestId)) {
    return fail("request_id_opaque");
  }
  requestIds.add(requestId);
  const upstreamHash = upstreamHashesByKey.get(
    `${truth.source_id}:${truth.record_ref}`
  );
  const correlatedValues = [
    fixtureId,
    truth.source_id,
    truth.record_ref,
    truth.verdict_class,
    truth.language,
    truth.derivation,
    ...(truth.verdict_class === "risk"
      ? [
          truth.primary_category,
          truth.ground_truth_severity,
          truth.transformation_kind,
          truth.seed_record_ref
        ]
      : [])
  ].filter((value): value is string => typeof value === "string");
  const derivedRequestIds = new Set(
    correlatedValues.map(truncatedSha256)
  );
  if (upstreamHash !== undefined) derivedRequestIds.add(upstreamHash.slice(0, 32));
  if (derivedRequestIds.has(requestId)) return fail("request_id_derived");
  const riskValues = truth.verdict_class === "risk"
    ? [truth.primary_category, truth.ground_truth_severity]
    : [];
  const compositeValues = [
    [fixtureId, truth.source_id, truth.record_ref, ...riskValues],
    [truth.source_id, truth.record_ref],
    [fixtureId, truth.verdict_class, ...riskValues]
  ];
  const deterministicRequestIds = new Set([
    ...ORDER_DERIVED_REQUEST_IDS,
    String(slotOrdinal).padStart(32, "0"),
    contentFingerprint(input).slice(0, 32),
    hashSandboxSecurityBenchmarkCanonicalJson(
      prebindInputProjection(input)
    ).slice(0, 32),
    hashSandboxSecurityBenchmarkCanonicalJson(
      prebindTruthProjection(truth)
    ).slice(0, 32),
    ...compositeValues.flatMap((values) => [":", "|", "", "/"].map(
      (separator) => truncatedSha256(values.join(separator))
    ))
  ]);
  if (deterministicRequestIds.has(requestId)) {
    return fail("request_id_derived");
  }
  const serialized = JSON.stringify(input.evaluation_request);
  if (FORBIDDEN_PROVENANCE.test(serialized)) {
    return fail("development_provenance");
  }
  assertRequestOracleBoundary(
    input.evaluation_request,
    matcher,
    scanBudget
  );
}

function normalizeSemanticContent(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFKC");
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normalizeSemanticContent);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => [key.normalize("NFKC"), normalizeSemanticContent(item)])
  );
}

function contentFingerprint(
  input: Readonly<SandboxSecurityBenchmarkInputEnvelope>
): string {
  const submission = input.evaluation_request.submission;
  return hashSandboxSecurityBenchmarkCanonicalJson(normalizeSemanticContent({
    content_values: submission.content_items.map((item) => item.value),
    ...(submission.tool_request === undefined
      ? {}
      : {
          tool_request: {
            tool_name: submission.tool_request.tool_name,
            ...(submission.tool_request.target === undefined
              ? {}
              : { target: submission.tool_request.target }),
            arguments: submission.tool_request.arguments
          }
        })
  }));
}

function lockedRecordSets(sourcesLock: Readonly<SandboxSecurityBenchmarkSourcesLock>) {
  const bySource = new Map<string, Map<string, string>>();
  const allRecordKeys = new Set<string>();
  const recordsByRef = new Map<string, LockedRecord[]>();
  const upstreamHashesByKey = new Map<string, string>();
  const lockedIdentifiers = new Set<string>();
  for (const source of sourcesLock.sources) {
    lockedIdentifiers.add(source.source_id);
    const records = new Map(
      source.records.map((record) => [record.record_ref, record.upstream_sha256])
    );
    bySource.set(source.source_id, records);
    for (const record of source.records) {
      const recordRef = record.record_ref;
      allRecordKeys.add(`${source.source_id}:${recordRef}`);
      upstreamHashesByKey.set(
        `${source.source_id}:${recordRef}`,
        record.upstream_sha256
      );
      const identities = recordsByRef.get(recordRef) ?? [];
      identities.push({
        sourceId: source.source_id,
        recordRef,
        upstreamSha256: record.upstream_sha256
      });
      recordsByRef.set(recordRef, identities);
      lockedIdentifiers.add(recordRef);
      lockedIdentifiers.add(record.upstream_sha256);
    }
  }
  return {
    bySource,
    allRecordKeys,
    recordsByRef,
    upstreamHashesByKey,
    matcher: buildLockedIdentifierMatcher(lockedIdentifiers)
  };
}

function assertReviewBinding(
  fixtureId: string,
  input: Readonly<SandboxSecurityBenchmarkInputEnvelope>,
  truth: Readonly<SandboxSecurityBenchmarkTruthEnvelope>,
  review: Readonly<SandboxSecurityBenchmarkReviewRecord>,
  upstreamHashesByKey: ReadonlyMap<string, string>,
  recordsByRef: ReadonlyMap<string, readonly LockedRecord[]>
): LockedRecord | undefined {
  const inputSha256 = hashSandboxSecurityBenchmarkCanonicalJson(input);
  const currentUpstream = upstreamHashesByKey.get(
    `${truth.source_id}:${truth.record_ref}`
  );
  const risk = truth.verdict_class === "risk";
  const transformed = risk && truth.transformed;
  const transformationKind = risk ? truth.transformation_kind : null;
  const seedRecordRef = risk ? truth.seed_record_ref : null;
  const primaryCategory = risk ? truth.primary_category : null;
  const severity = risk ? truth.ground_truth_severity : null;
  if (
    review.fixture_id !== fixtureId ||
    review.input_sha256 !== inputSha256 ||
    review.source_id !== truth.source_id ||
    review.record_ref !== truth.record_ref ||
    currentUpstream === undefined ||
    review.upstream_sha256 !== currentUpstream ||
    review.verdict_class !== truth.verdict_class ||
    review.language !== truth.language ||
    review.derivation !== truth.derivation ||
    review.transformed !== transformed ||
    review.transformation_kind !== transformationKind ||
    review.seed_record_ref !== seedRecordRef ||
    review.primary_category !== primaryCategory ||
    review.ground_truth_severity !== severity
  ) {
    return fail("review_binding");
  }
  if (!transformed || seedRecordRef === null) return undefined;
  const candidates = (recordsByRef.get(seedRecordRef) ?? []).filter(
    (candidate) =>
      candidate.upstreamSha256 === review.seed_upstream_sha256
  );
  if (candidates.length !== 1) return fail("review_binding");
  return candidates[0];
}

function assertTruthPreReviewBoundary(
  truth: Readonly<SandboxSecurityBenchmarkTruthEnvelope>,
  bySource: ReadonlyMap<string, ReadonlyMap<string, string>>
): void {
  const sourceRecords = bySource.get(truth.source_id);
  if (sourceRecords === undefined || !sourceRecords.has(truth.record_ref)) {
    return fail("source_record_unlocked");
  }
  if (
    FORBIDDEN_PROVENANCE.test(truth.source_id) ||
    FORBIDDEN_PROVENANCE.test(truth.record_ref) ||
    (truth.verdict_class === "risk" &&
      truth.seed_record_ref !== null &&
      FORBIDDEN_PROVENANCE.test(truth.seed_record_ref))
  ) {
    return fail("development_provenance");
  }
}

function assertLanguageSemantics(
  input: Readonly<SandboxSecurityBenchmarkInputEnvelope>,
  truth: Readonly<SandboxSecurityBenchmarkTruthEnvelope>
): void {
  const primaryContent = input.evaluation_request.submission.content_items.at(-1)
    ?.value;
  if (
    truth.language === "zh" &&
    (typeof primaryContent !== "string" || !HAN_SCRIPT.test(primaryContent))
  ) {
    return fail("translation_semantics");
  }
}

function assertTruthProvenance(
  truth: Readonly<SandboxSecurityBenchmarkTruthEnvelope>,
  bySource: ReadonlyMap<string, ReadonlyMap<string, string>>,
  seedRecord: LockedRecord | undefined
): void {
  const sourceRecords = bySource.get(truth.source_id);
  if (sourceRecords === undefined || !sourceRecords.has(truth.record_ref)) {
    return fail("source_record_unlocked");
  }
  if (
    FORBIDDEN_PROVENANCE.test(truth.source_id) ||
    FORBIDDEN_PROVENANCE.test(truth.record_ref)
  ) {
    return fail("development_provenance");
  }
  if (truth.derivation === "human_translation" && truth.language !== "zh") {
    return fail("translation_semantics");
  }
  if (truth.verdict_class === "safe") return;
  if (truth.transformed) {
    if (truth.language !== "en") return fail("translation_semantics");
    if (
      truth.seed_record_ref !== null &&
      FORBIDDEN_PROVENANCE.test(truth.seed_record_ref)
    ) {
      return fail("development_provenance");
    }
    if (
      truth.derivation !== "transformed" ||
      truth.transformation_kind === null ||
      truth.seed_record_ref === null ||
      seedRecord === undefined
    ) {
      return fail("transformation_semantics");
    }
  } else if (
    truth.derivation === "transformed" ||
    truth.transformation_kind !== null ||
    truth.seed_record_ref !== null
  ) {
    return fail("transformation_semantics");
  }
  const currentRecordKey = `${truth.source_id}:${truth.record_ref}`;
  const seedRecordKey = seedRecord === undefined
    ? undefined
    : `${seedRecord.sourceId}:${seedRecord.recordRef}`;
  if (
    truth.transformed &&
    (
      (truth.transformation_kind === "cross_source" &&
        seedRecordKey === currentRecordKey) ||
      (truth.transformation_kind !== "cross_source" &&
        seedRecordKey !== currentRecordKey)
    )
  ) {
    return fail("transformation_semantics");
  }
  if (
    truth.primary_category === "memory_poisoning" &&
    (
      !truth.transformed ||
      truth.transformation_kind !== "cross_source" ||
      (seedRecord?.sourceId !== "agentdojo" && seedRecord?.sourceId !== "toolem")
    )
  ) {
    return fail("transformation_semantics");
  }
}

function emptyCounts<T extends readonly string[]>(
  values: T
): Record<T[number], number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<
    T[number],
    number
  >;
}

function newMatrixState(): MatrixState {
  return {
    risk: 0,
    safe: 0,
    zh: 0,
    en: 0,
    transformedRisk: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    categories: emptyCounts(CATEGORIES),
    stages: emptyCounts(STAGES),
    safeRetrieved: 0,
    safeMemory: 0,
    safeMultisourceByStage: emptyCounts(STAGES),
    riskSingleSourceByStage: emptyCounts(STAGES)
  };
}

function addMatrixEntry(
  matrix: MatrixState,
  input: Readonly<SandboxSecurityBenchmarkInputEnvelope>,
  truth: Readonly<SandboxSecurityBenchmarkTruthEnvelope>
): void {
  const submission = input.evaluation_request.submission;
  const stage = submission.stage;
  matrix.stages[stage] += 1;
  matrix[truth.language as SandboxSecurityBenchmarkLanguage] += 1;
  if (truth.verdict_class === "safe") {
    matrix.safe += 1;
    if (submission.content_items.length > 1) {
      matrix.safeMultisourceByStage[stage] += 1;
    }
    if (submission.content_items.some(
      (item) => item.claimed_source_type === "retrieved_content"
    )) {
      matrix.safeRetrieved += 1;
    }
    if (submission.content_items.some(
      (item) => item.claimed_source_type === "memory_content"
    )) {
      matrix.safeMemory += 1;
    }
    return;
  }
  matrix.risk += 1;
  if (submission.content_items.length === 1) {
    matrix.riskSingleSourceByStage[stage] += 1;
  }
  matrix.categories[truth.primary_category as Category] += 1;
  if (truth.transformed) matrix.transformedRisk += 1;
  if (truth.ground_truth_severity === "low") matrix.low += 1;
  if (truth.ground_truth_severity === "medium") matrix.medium += 1;
  if (truth.ground_truth_severity === "high") matrix.high += 1;
  if (truth.ground_truth_severity === "critical") matrix.critical += 1;
}

function assertMatrix(matrix: MatrixState): void {
  if (matrix.risk + matrix.safe !== FIXTURE_COUNT) {
    return fail("matrix_total_expected_300");
  }
  if (matrix.risk !== RISK_COUNT || matrix.safe !== SAFE_COUNT) {
    return fail("verdict_matrix");
  }
  if (matrix.zh !== LANGUAGE_COUNT || matrix.en !== LANGUAGE_COUNT) {
    return fail("language_matrix");
  }
  if (CATEGORIES.some((category) => matrix.categories[category] !== CATEGORY_COUNT)) {
    return fail("category_matrix");
  }
  if (STAGES.some((stage) => matrix.stages[stage] !== STAGE_COUNT)) {
    return fail("stage_matrix");
  }
  if (matrix.transformedRisk < MIN_TRANSFORMED_RISK) {
    return fail("transformation_matrix");
  }
  if (
    matrix.high < MIN_HIGH ||
    matrix.critical < MIN_CRITICAL ||
    matrix.high + matrix.critical < MIN_HIGH_OR_CRITICAL
  ) {
    return fail("severity_matrix");
  }
  if (STAGES.some(
    (stage) =>
      matrix.safeMultisourceByStage[stage] < MIN_SAFE_MULTI_SOURCE_PER_STAGE
  )) {
    return fail("safe_multisource_matrix");
  }
  if (matrix.safeRetrieved < MIN_SAFE_RETRIEVED) {
    return fail("safe_retrieved_matrix");
  }
  if (matrix.safeMemory < MIN_SAFE_MEMORY) {
    return fail("safe_memory_matrix");
  }
  if (STAGES.some(
    (stage) =>
      matrix.riskSingleSourceByStage[stage] < MIN_RISK_SINGLE_SOURCE_PER_STAGE
  )) {
    return fail("risk_single_source_matrix");
  }
}

export function validateSandboxSecurityBenchmarkCorpus(
  rawInput: Readonly<CorpusInput>
): Readonly<SandboxSecurityBenchmarkCorpusValidationReport> {
  const input = exactCorpusInput(rawInput);
  const corpusRoot = resolve(input.corpus_root);
  try {
    const stat = lstatSync(corpusRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return fail("corpus_root_invalid");
  } catch {
    return fail("corpus_root_invalid");
  }

  const sourcesLock = normalizeSourcesLock(input.sources_lock);
  const manifest = normalizeManifestFile(resolve(corpusRoot, "manifest.json"));
  assertExpectedFixtureIds(manifest.fixture_ids);

  const sourcesLockSha256 = hashSandboxSecurityBenchmarkCanonicalJson(sourcesLock);
  if (manifest.sources_lock_sha256 !== sourcesLockSha256) {
    return fail("sources_lock_hash");
  }

  const inputsRoot = resolve(corpusRoot, "inputs");
  const truthRoot = resolve(corpusRoot, "truth");
  const reviewsRoot = resolve(corpusRoot, "reviews");
  const requestIdsRoot = resolve(corpusRoot, "request-ids");
  const inputFiles = readFlatJsonInventory(inputsRoot, "fixture_pairing");
  const truthFiles = readFlatJsonInventory(truthRoot, "fixture_pairing");
  assertFixtureInventory(manifest.fixture_ids, inputFiles, truthFiles);
  assertSingletonInventory(reviewsRoot, "reviews.json", "reviews_inventory");
  assertSingletonInventory(
    requestIdsRoot,
    "request-ids.json",
    "request_ids_inventory"
  );

  let inputsTreeSha256: string;
  let truthTreeSha256: string;
  let reviewsTreeSha256: string;
  let requestIdsTreeSha256: string;
  try {
    inputsTreeSha256 = hashSandboxSecurityBenchmarkTree(inputsRoot);
    truthTreeSha256 = hashSandboxSecurityBenchmarkTree(truthRoot);
    reviewsTreeSha256 = hashSandboxSecurityBenchmarkTree(reviewsRoot);
    requestIdsTreeSha256 = hashSandboxSecurityBenchmarkTree(requestIdsRoot);
  } catch {
    return fail("tree_hash_invalid");
  }
  if (manifest.inputs_tree_sha256 !== inputsTreeSha256) {
    return fail("inputs_tree_hash");
  }
  if (manifest.truth_tree_sha256 !== truthTreeSha256) {
    return fail("truth_tree_hash");
  }
  if (manifest.reviews_tree_sha256 !== reviewsTreeSha256) {
    return fail("reviews_tree_hash");
  }
  if (manifest.request_ids_tree_sha256 !== requestIdsTreeSha256) {
    return fail("request_ids_tree_hash");
  }

  const reviews = normalizeReviewsFile(resolve(reviewsRoot, "reviews.json"));
  const requestIdsLedger = normalizeRequestIdsFile(
    resolve(requestIdsRoot, "request-ids.json")
  );
  if (reviews.records.length !== FIXTURE_COUNT) return fail("reviews_invalid");
  if (requestIdsLedger.records.length !== FIXTURE_COUNT) {
    return fail("request_ids_invalid");
  }
  for (let index = 0; index < FIXTURE_COUNT; index += 1) {
    if (reviews.records[index]?.fixture_id !== manifest.fixture_ids[index]) {
      return fail("review_order");
    }
  }

  const {
    bySource,
    allRecordKeys,
    recordsByRef,
    upstreamHashesByKey,
    matcher
  } = lockedRecordSets(sourcesLock);
  const requestIds = new Set<string>();
  const scanBudget: OracleScanBudget = { nodes: 0, bytes: 0 };
  const contentFingerprints = new Set<string>();
  const directRecordKeys = new Set<string>();
  const riskDirectRecordKeys = new Set<string>();
  const safeDirectRecordKeys = new Set<string>();
  const directTruthByRecordKey = new Map<
    string,
    Readonly<SandboxSecurityBenchmarkTruthEnvelope>
  >();
  const surfaceAdjudications: Array<Readonly<{
    truth: Readonly<SandboxSecurityBenchmarkTruthEnvelope>;
    review: Readonly<SandboxSecurityBenchmarkReviewRecord>;
    seedRecord: LockedRecord;
  }>> = [];
  const memoryCurrentRecordKeys = new Set<string>();
  const memorySeedRecordKeys = new Set<string>();
  const matrix = newMatrixState();
  for (let index = 0; index < manifest.fixture_ids.length; index += 1) {
    const fixtureId = manifest.fixture_ids[index]!;
    const inputEnvelope = normalizeInputFile(
      resolve(inputsRoot, `${fixtureId}.json`)
    );
    const truthEnvelope = normalizeTruthFile(
      resolve(truthRoot, `${fixtureId}.json`)
    );
    if (
      inputEnvelope.fixture_id !== fixtureId ||
      truthEnvelope.fixture_id !== fixtureId
    ) {
      return fail("fixture_pairing");
    }
    if (
      truthEnvelope.fixture_sha256 !==
      hashSandboxSecurityBenchmarkCanonicalJson(inputEnvelope)
    ) {
      return fail("fixture_hash");
    }
    assertTruthPreReviewBoundary(truthEnvelope, bySource);
    assertLanguageSemantics(inputEnvelope, truthEnvelope);
    const review = reviews.records[index]!;
    const seedRecord = assertReviewBinding(
      fixtureId,
      inputEnvelope,
      truthEnvelope,
      review,
      upstreamHashesByKey,
      recordsByRef
    );
    assertTruthProvenance(
      truthEnvelope,
      bySource,
      seedRecord
    );
    if (
      truthEnvelope.verdict_class === "risk" &&
      truthEnvelope.transformed &&
      truthEnvelope.transformation_kind !== "cross_source" &&
      seedRecord !== undefined
    ) {
      surfaceAdjudications.push({
        truth: truthEnvelope,
        review,
        seedRecord
      });
    }
    assertOpaqueRequest(
      index + 1,
      fixtureId,
      inputEnvelope,
      truthEnvelope,
      requestIdsLedger.records[index]!.request_id,
      upstreamHashesByKey,
      matcher,
      requestIds,
      scanBudget
    );
    if (!truthEnvelope.transformed) {
      const recordKey = `${truthEnvelope.source_id}:${truthEnvelope.record_ref}`;
      if (directRecordKeys.has(recordKey)) return fail("direct_record_coverage");
      directRecordKeys.add(recordKey);
      directTruthByRecordKey.set(recordKey, truthEnvelope);
      if (truthEnvelope.verdict_class === "safe") {
        safeDirectRecordKeys.add(recordKey);
      } else {
        riskDirectRecordKeys.add(recordKey);
      }
    } else if (
      truthEnvelope.verdict_class === "risk" &&
      truthEnvelope.primary_category === "memory_poisoning"
    ) {
      memoryCurrentRecordKeys.add(
        `${truthEnvelope.source_id}:${truthEnvelope.record_ref}`
      );
      const seedRecordRef = truthEnvelope.seed_record_ref;
      if (seedRecord === undefined || seedRecordRef === null) {
        return fail("transformation_semantics");
      }
      memorySeedRecordKeys.add(`${seedRecord.sourceId}:${seedRecordRef}`);
    }
    const fingerprint = contentFingerprint(inputEnvelope);
    if (contentFingerprints.has(fingerprint)) return fail("duplicate_content");
    contentFingerprints.add(fingerprint);
    addMatrixEntry(matrix, inputEnvelope, truthEnvelope);
  }
  for (const { truth, review, seedRecord } of surfaceAdjudications) {
    const seedTruth = directTruthByRecordKey.get(
      `${seedRecord.sourceId}:${seedRecord.recordRef}`
    );
    if (seedTruth === undefined || seedTruth.verdict_class !== "risk") {
      return fail("transformation_semantics");
    }
    if (truth.verdict_class !== "risk") {
      return fail("review_adjudication");
    }
    if (
      seedTruth.primary_category !== truth.primary_category ||
      seedTruth.ground_truth_severity !== truth.ground_truth_severity
    ) {
      const marker =
        `Surface-label inheritance exception: seed category=${seedTruth.primary_category}; ` +
        `seed severity=${seedTruth.ground_truth_severity}.`;
      if (
        review.adjudication_rationale === null ||
        !review.adjudication_rationale.includes(marker)
      ) {
        return fail("review_adjudication");
      }
    }
  }
  if (
    directRecordKeys.size !== allRecordKeys.size ||
    [...allRecordKeys].some((recordKey) => !directRecordKeys.has(recordKey))
  ) {
    return fail("direct_record_coverage");
  }
  if (
    [...memoryCurrentRecordKeys].some(
      (recordKey) => !safeDirectRecordKeys.has(recordKey)
    ) ||
    [...memorySeedRecordKeys].some(
      (recordKey) => !riskDirectRecordKeys.has(recordKey)
    )
  ) {
    return fail("transformation_semantics");
  }
  assertMatrix(matrix);

  return deepFreeze({
    counts: {
      total: matrix.risk + matrix.safe,
      risk: matrix.risk,
      safe: matrix.safe,
      zh: matrix.zh,
      en: matrix.en,
      transformed_risk: matrix.transformedRisk,
      low: matrix.low,
      medium: matrix.medium,
      high: matrix.high,
      critical: matrix.critical,
      high_or_critical: matrix.high + matrix.critical,
      each_primary_risk_category: CATEGORY_COUNT,
      each_stage: STAGE_COUNT,
      safe_retrieved: matrix.safeRetrieved,
      safe_memory: matrix.safeMemory,
      safe_multisource_by_stage: { ...matrix.safeMultisourceByStage },
      risk_single_source_by_stage: { ...matrix.riskSingleSourceByStage },
      by_primary_risk_category: { ...matrix.categories },
      by_stage: { ...matrix.stages }
    },
    hashes: {
      sources_lock_sha256: sourcesLockSha256,
      inputs_tree_sha256: inputsTreeSha256,
      truth_tree_sha256: truthTreeSha256,
      reviews_tree_sha256: reviewsTreeSha256,
      request_ids_tree_sha256: requestIdsTreeSha256,
      manifest_sha256: hashSandboxSecurityBenchmarkCanonicalJson(manifest)
    }
  });
}

function runCli(): void {
  const scriptRoot = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptRoot, "../../..");
  const corpusRoot = resolve(
    repositoryRoot,
    "samples/sandbox-security-benchmark/v1"
  );
  try {
    const sourcesLock = normalizeSourcesLock(
      parseJsonFile(resolve(corpusRoot, "sources.lock.json"), "sources_lock_invalid")
    );
    const report = validateSandboxSecurityBenchmarkCorpus({
      corpus_root: corpusRoot,
      sources_lock: sourcesLock
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    const reason = error instanceof Error &&
      /^corpus_validation_failed:[a-z0-9_]+$/u.test(error.message)
      ? error.message
      : "corpus_validation_failed:internal";
    process.stderr.write(`${JSON.stringify({ error_code: reason })}\n`);
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  basename(fileURLToPath(import.meta.url)) === basename(resolve(entrypoint)) &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
) {
  runCli();
}
