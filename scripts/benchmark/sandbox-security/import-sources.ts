import {
  normalizeSandboxSecurityBenchmarkSourcesLock,
  type SandboxSecurityBenchmarkLicense,
  type SandboxSecurityBenchmarkSourcesLock
} from "./contracts.ts";

export interface SandboxSecurityReviewedSourceRecord {
  readonly source_id: string;
  readonly upstream_url: string;
  readonly revision: string;
  readonly admitted_scope: string;
  readonly license: SandboxSecurityBenchmarkLicense;
  readonly license_url: string;
  readonly license_evidence_sha256: string;
  readonly attribution: string;
  readonly redistribution_confirmed: true;
  readonly record_ref: string;
  readonly upstream_sha256: string;
}

interface SourceFamilyPolicy {
  readonly source_id: string;
  readonly upstream_url: string;
  readonly revision: string;
  readonly admitted_scope: string;
  readonly licenses: readonly Readonly<{
    readonly license: SandboxSecurityBenchmarkLicense;
    readonly attribution: string;
  }>[];
  readonly license_url: string;
  readonly license_evidence_sha256: string;
  readonly record_ref_valid: (value: string) => boolean;
}

const AGENTDOJO_RECORD_REF = /^v1\.(banking|slack|travel|workspace)\.InjectionTask([0-9]+)$/u;
const TOOLEMU_RECORD_REF = /^assets\.all-cases\.official_([0-9]+)$/u;
const DEEPSET_RECORD_REF = /^train:row-([0-9]{4})$/u;
const OASST_RECORD_REF =
  /^train:message-(?!0{8}-0{4}-0{4}-0{4}-0{12}$)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function boundedInteger(value: string, minimum: number, maximum: number): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum;
}

function agentDojoRecordRefValid(value: string): boolean {
  const match = AGENTDOJO_RECORD_REF.exec(value);
  if (match === null) return false;
  const limits: Readonly<Record<string, readonly [number, number]>> = {
    banking: [0, 8],
    slack: [1, 5],
    travel: [0, 6],
    workspace: [0, 5]
  };
  const limit = limits[match[1]!];
  return limit !== undefined && boundedInteger(match[2]!, limit[0], limit[1]);
}

function toolEmuRecordRefValid(value: string): boolean {
  const match = TOOLEMU_RECORD_REF.exec(value);
  return match !== null && boundedInteger(match[1]!, 0, 143);
}

function deepsetRecordRefValid(value: string): boolean {
  const match = DEEPSET_RECORD_REF.exec(value);
  if (match === null) return false;
  const row = Number(match[1]);
  return Number.isSafeInteger(row) && row >= 0 && row <= 545;
}

const SOURCE_POLICIES: readonly SourceFamilyPolicy[] = [
  {
    source_id: "agentdojo",
    upstream_url: "https://github.com/ethz-spylab/agentdojo",
    revision: "089ed468cf3ed0322acc66b0211f26d9d90dbf60",
    admitted_scope: "First-party tracked v1 task and injection artifacts only.",
    licenses: [{
      license: "MIT",
      attribution:
        "AgentDojo contributors; first-party tracked v1 task/injection artifact at pinned revision (MIT)."
    }],
    license_url:
      "https://github.com/ethz-spylab/agentdojo/blob/089ed468cf3ed0322acc66b0211f26d9d90dbf60/LICENSE",
    license_evidence_sha256:
      "4285a071f2d382338e52b4fb0a186d952984a34d43a33d8872e1a1d8cb43401e",
    record_ref_valid: agentDojoRecordRefValid
  },
  {
    source_id: "toolem",
    upstream_url: "https://github.com/ryoungj/ToolEmu",
    revision: "ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb",
    admitted_scope: "First-party official case artifacts only; no external downloads.",
    licenses: [{
      license: "Apache-2.0",
      attribution:
        "ToolEmu authors and contributors; first-party official case artifact at pinned revision (Apache-2.0)."
    }],
    license_url:
      "https://github.com/ryoungj/ToolEmu/blob/ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb/LICENSE",
    license_evidence_sha256:
      "be36ffc5b0eec4cfc8046e00372a9cf4cd48e73ba87b50315f5ee8a1775274b1",
    record_ref_valid: toolEmuRecordRefValid
  },
  {
    source_id: "deepset-prompt-injections",
    upstream_url:
      "https://huggingface.co/datasets/deepset/prompt-injections",
    revision: "4f61ecb038e9c3fb77e21034b22511b523772cdd",
    admitted_scope: "Revision-pinned rows with Apache-2.0 or CC-BY-4.0 metadata evidence.",
    licenses: [
      {
        license: "Apache-2.0",
        attribution:
          "deepset prompt-injections dataset contributors; selected row at pinned revision (Apache-2.0)."
      },
      {
        license: "CC-BY-4.0",
        attribution:
          "deepset prompt-injections dataset contributors; selected row at pinned revision (CC-BY-4.0)."
      }
    ],
    license_url:
      "https://huggingface.co/datasets/deepset/prompt-injections/blob/4f61ecb038e9c3fb77e21034b22511b523772cdd/README.md",
    license_evidence_sha256:
      "d90b4518dfe06154deeec938243d1ec9119bdfbfd2105aee9cf1567999764b94",
    record_ref_valid: deepsetRecordRefValid
  },
  {
    source_id: "oasst1",
    upstream_url: "https://huggingface.co/datasets/OpenAssistant/oasst1",
    revision: "fdf72ae0827c1cda404aff25b6603abec9e3399b",
    admitted_scope: "Selected human-authored reviewed English and Chinese messages only.",
    licenses: [{
      license: "Apache-2.0",
      attribution:
        "OpenAssistant OASST1 contributors; selected human-authored message at pinned revision (Apache-2.0)."
    }],
    license_url:
      "https://huggingface.co/datasets/OpenAssistant/oasst1/blob/fdf72ae0827c1cda404aff25b6603abec9e3399b/LICENSE",
    license_evidence_sha256:
      "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
    record_ref_valid: (value) => OASST_RECORD_REF.test(value)
  }
] as const;

const POLICY_BY_ID = new Map(
  SOURCE_POLICIES.map((policy) => [policy.source_id, policy] as const)
);
const SOURCE_RECORD_KEYS = [
  "source_id",
  "upstream_url",
  "revision",
  "admitted_scope",
  "license",
  "license_url",
  "license_evidence_sha256",
  "attribution",
  "redistribution_confirmed",
  "record_ref",
  "upstream_sha256"
] as const;
const IMPORT_INPUT_KEYS = ["reviewed_records"] as const;
const SHA256 = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40,64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SOURCE_ID = /^[a-z][a-z0-9_-]{1,63}$/u;
const MAX_RECORDS = 2048;
const MAX_TEXT_BYTES = 64 * 1024;
const RESERVED_RECORD_REFS = new Set([
  "all",
  "all-records",
  "dataset",
  "whole-dataset",
  "head"
]);
const INTERNAL_ADMISSION_ERRORS = new WeakSet<object>();

function admissionError(field: string): never {
  const error = new TypeError(`source admission field: ${field}`);
  Object.freeze(error);
  INTERNAL_ADMISSION_ERRORS.add(error);
  throw error;
}

function rethrowOrClose(error: unknown, field: string): never {
  if (
    (typeof error === "object" && error !== null) ||
    typeof error === "function"
  ) {
    if (INTERNAL_ADMISSION_ERRORS.has(error)) {
      throw error;
    }
  }
  admissionError(field);
}

function boundary<T>(action: () => T, field: string): T {
  try {
    return action();
  } catch (error) {
    return rethrowOrClose(error, field);
  }
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const record = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return false;
    }
  }
  return true;
}

function exactKeys(
  value: unknown,
  required: readonly string[]
): Record<string, unknown> {
  try {
    if (!isPlainDataRecord(value)) admissionError("record_shape");
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      keys.length !== required.length ||
      keys.some((key) => !required.includes(key)) ||
      required.some((key) => !Object.hasOwn(record, key))
    ) {
      admissionError("record_keys");
    }
    return record;
  } catch (error) {
    rethrowOrClose(error, "record_shape");
  }
}

function text(value: unknown, field: string, maxBytes = MAX_TEXT_BYTES): string {
  if (typeof value !== "string" || value.length === 0) admissionError(field);
  if (Buffer.byteLength(value, "utf8") > maxBytes) admissionError(field);
  return value;
}

function sha(value: unknown, field: string): string {
  const candidate = text(value, field, 64);
  if (!SHA256.test(candidate)) admissionError(field);
  return candidate;
}

function policyFor(record: Record<string, unknown>): SourceFamilyPolicy {
  const sourceId = text(record.source_id, "source_id", 64);
  if (!SOURCE_ID.test(sourceId)) admissionError("source_id");
  const policy = POLICY_BY_ID.get(sourceId);
  if (policy === undefined) admissionError("source_id");
  return policy;
}

function validateRecord(value: unknown): SandboxSecurityReviewedSourceRecord {
  const record = exactKeys(value, SOURCE_RECORD_KEYS);
  const policy = policyFor(record);

  if (record.upstream_url !== policy.upstream_url) admissionError("upstream_url");
  if (record.revision !== policy.revision || !REVISION.test(String(record.revision))) {
    admissionError("revision");
  }
  if (record.admitted_scope !== policy.admitted_scope) admissionError("admitted_scope");
  const licensePolicy = policy.licenses.find(
    (candidate) => candidate.license === record.license
  );
  if (licensePolicy === undefined) {
    admissionError("license");
  }
  if (record.license_url !== policy.license_url) admissionError("license_url");

  const attribution = text(record.attribution, "attribution", 4096);
  if (attribution !== licensePolicy.attribution) admissionError("attribution");
  if (record.redistribution_confirmed !== true) admissionError("redistribution_confirmed");

  const recordRef = text(record.record_ref, "record_ref", 128);
  if (
    !IDENTIFIER.test(recordRef) ||
    RESERVED_RECORD_REFS.has(recordRef.toLowerCase()) ||
    recordRef.includes("..") ||
    !policy.record_ref_valid(recordRef)
  ) {
    admissionError("record_ref");
  }

  const licenseEvidence = sha(
    record.license_evidence_sha256,
    "license_evidence_sha256"
  );
  if (licenseEvidence !== policy.license_evidence_sha256) {
    admissionError("license_evidence_sha256");
  }
  const upstreamHash = sha(record.upstream_sha256, "upstream_sha256");

  return Object.freeze({
    source_id: policy.source_id,
    upstream_url: policy.upstream_url,
    revision: policy.revision,
    admitted_scope: policy.admitted_scope,
    license: licensePolicy.license,
    license_url: policy.license_url,
    license_evidence_sha256: licenseEvidence,
    attribution,
    redistribution_confirmed: true as const,
    record_ref: recordRef,
    upstream_sha256: upstreamHash
  });
}

export function validateSandboxSecurityReviewedSourceRecord(
  value: unknown
): Readonly<SandboxSecurityReviewedSourceRecord> {
  return boundary(() => validateRecord(value), "record_shape");
}

type ReviewedRecordsInput = Readonly<{
  reviewed_records: readonly unknown[];
}>;

export function importSandboxSecurityReviewedRecords(
  input: ReviewedRecordsInput
): Readonly<SandboxSecurityBenchmarkSourcesLock> {
  return boundary(
    () => importSandboxSecurityReviewedRecordsInternal(input),
    "reviewed_records"
  );
}

function importSandboxSecurityReviewedRecordsInternal(
  input: ReviewedRecordsInput
): Readonly<SandboxSecurityBenchmarkSourcesLock> {
  const root = exactKeys(input, IMPORT_INPUT_KEYS);
  const reviewedRecords = root.reviewed_records;
  if (
    !Array.isArray(reviewedRecords) ||
    Object.getPrototypeOf(reviewedRecords) !== Array.prototype
  ) {
    admissionError("reviewed_records");
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(reviewedRecords, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value <= 0 ||
    lengthDescriptor.value > MAX_RECORDS
  ) {
    admissionError("reviewed_records");
  }
  const recordCount = lengthDescriptor.value;
  const arrayKeys = Reflect.ownKeys(reviewedRecords);
  if (
    arrayKeys.length !== recordCount + 1 ||
    !arrayKeys.includes("length")
  ) {
    admissionError("reviewed_records");
  }
  const reviewedRecordSnapshot = new Array<unknown>(recordCount);
  for (let index = 0; index < recordCount; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(reviewedRecords, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      admissionError("reviewed_records");
    }
    reviewedRecordSnapshot[index] = descriptor.value;
  }

  const groups = new Map<
    string,
    { readonly policy: SourceFamilyPolicy; readonly metadata: SandboxSecurityReviewedSourceRecord; readonly records: SandboxSecurityReviewedSourceRecord[] }
  >();
  const seenRecords = new Set<string>();

  for (let index = 0; index < reviewedRecordSnapshot.length; index += 1) {
    const candidate = reviewedRecordSnapshot[index];
    const record = validateRecord(candidate);
    const identity = `${record.source_id}:${record.record_ref}`;
    if (seenRecords.has(identity)) admissionError("duplicate_record");
    seenRecords.add(identity);

    const policy = POLICY_BY_ID.get(record.source_id);
    if (policy === undefined) admissionError("source_id");
    const existing = groups.get(record.source_id);
    if (existing === undefined) {
      groups.set(record.source_id, {
        policy,
        metadata: record,
        records: [record]
      });
      continue;
    }
    const metadataFields: readonly (keyof SandboxSecurityReviewedSourceRecord)[] = [
      "upstream_url",
      "revision",
      "admitted_scope",
      "license",
      "license_url",
      "license_evidence_sha256",
      "attribution",
      "redistribution_confirmed"
    ];
    for (const field of metadataFields) {
      if (existing.metadata[field] !== record[field]) {
        admissionError("source_metadata_conflict");
      }
    }
    existing.records.push(record);
  }

  const sources = SOURCE_POLICIES
    .filter((policy) => groups.has(policy.source_id))
    .map((policy) => {
      const group = groups.get(policy.source_id);
      if (group === undefined) admissionError("source_group");
      return {
        source_id: policy.source_id,
        upstream_url: policy.upstream_url,
        revision: policy.revision,
        admitted_scope: policy.admitted_scope,
        license: group.metadata.license,
        license_url: policy.license_url,
        license_evidence_sha256: group.metadata.license_evidence_sha256,
        attribution: group.metadata.attribution,
        redistribution_confirmed: true as const,
        records: group.records.map(({ record_ref, upstream_sha256 }) => ({
          record_ref,
          upstream_sha256
        }))
      };
    });

  if (sources.length === 0) admissionError("reviewed_records");
  try {
    return normalizeSandboxSecurityBenchmarkSourcesLock({
      schema_version: "sandbox-security-benchmark-sources.v1",
      sources
    });
  } catch {
    admissionError("lock_contract");
  }
}
