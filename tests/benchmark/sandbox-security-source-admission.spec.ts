import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const IMPORTER_URL = new URL(
  "../../scripts/benchmark/sandbox-security/import-sources.ts",
  import.meta.url
);
const LOCK_URL = new URL(
  "../../samples/sandbox-security-benchmark/v1/sources.lock.json",
  import.meta.url
);
const ATTRIBUTION_URL = new URL(
  "../../samples/sandbox-security-benchmark/v1/ATTRIBUTION.md",
  import.meta.url
);

type Validator = (value: unknown) => Readonly<Record<string, unknown>>;
type Importer = (input: Readonly<{ reviewed_records: readonly unknown[] }>) =>
  Readonly<Record<string, unknown>>;

let validateReviewedSourceRecord: Validator = () => {
  throw new TypeError("source admission field: importer unavailable");
};
let importReviewedRecords: Importer = () => {
  throw new TypeError("source admission field: importer unavailable");
};

if (existsSync(IMPORTER_URL)) {
  const importer = await import(
    "../../scripts/benchmark/sandbox-security/import-sources.ts"
  );
  validateReviewedSourceRecord =
    importer.validateSandboxSecurityReviewedSourceRecord as Validator;
  importReviewedRecords =
    importer.importSandboxSecurityReviewedRecords as Importer;
}

const A = "a".repeat(64);
const B = "b".repeat(64);
const LICENSE_EVIDENCE = {
  agentdojo: "4285a071f2d382338e52b4fb0a186d952984a34d43a33d8872e1a1d8cb43401e",
  toolem: "be36ffc5b0eec4cfc8046e00372a9cf4cd48e73ba87b50315f5ee8a1775274b1",
  deepset: "d90b4518dfe06154deeec938243d1ec9119bdfbfd2105aee9cf1567999764b94",
  oasst1: "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4"
} as const;
const DEEPSET_CC_BY_ATTRIBUTION =
  "deepset prompt-injections dataset contributors; selected row at pinned revision (CC-BY-4.0).";

const SOURCES = {
  agentdojo: {
    source_id: "agentdojo",
    upstream_url: "https://github.com/ethz-spylab/agentdojo",
    revision: "089ed468cf3ed0322acc66b0211f26d9d90dbf60",
    admitted_scope: "First-party tracked v1 task and injection artifacts only.",
    license: "MIT",
    license_url:
      "https://github.com/ethz-spylab/agentdojo/blob/089ed468cf3ed0322acc66b0211f26d9d90dbf60/LICENSE",
    license_evidence_sha256: LICENSE_EVIDENCE.agentdojo,
    attribution: "AgentDojo contributors; first-party tracked v1 task/injection artifact at pinned revision (MIT).",
    redistribution_confirmed: true,
    record_ref: "v1.banking.InjectionTask0",
    upstream_sha256: B
  },
  toolem: {
    source_id: "toolem",
    upstream_url: "https://github.com/ryoungj/ToolEmu",
    revision: "ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb",
    admitted_scope: "First-party official case artifacts only; no external downloads.",
    license: "Apache-2.0",
    license_url:
      "https://github.com/ryoungj/ToolEmu/blob/ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb/LICENSE",
    license_evidence_sha256: LICENSE_EVIDENCE.toolem,
    attribution: "ToolEmu authors and contributors; first-party official case artifact at pinned revision (Apache-2.0).",
    redistribution_confirmed: true,
    record_ref: "assets.all-cases.official_0",
    upstream_sha256: B
  },
  deepset: {
    source_id: "deepset-prompt-injections",
    upstream_url:
      "https://huggingface.co/datasets/deepset/prompt-injections",
    revision: "4f61ecb038e9c3fb77e21034b22511b523772cdd",
    admitted_scope: "Revision-pinned rows with Apache-2.0 or CC-BY-4.0 metadata evidence.",
    license: "Apache-2.0",
    license_url:
      "https://huggingface.co/datasets/deepset/prompt-injections/blob/4f61ecb038e9c3fb77e21034b22511b523772cdd/README.md",
    license_evidence_sha256: LICENSE_EVIDENCE.deepset,
    attribution: "deepset prompt-injections dataset contributors; selected row at pinned revision (Apache-2.0).",
    redistribution_confirmed: true,
    record_ref: "train:row-0000",
    upstream_sha256: B
  },
  oasst1: {
    source_id: "oasst1",
    upstream_url: "https://huggingface.co/datasets/OpenAssistant/oasst1",
    revision: "fdf72ae0827c1cda404aff25b6603abec9e3399b",
    admitted_scope: "Selected human-authored reviewed English and Chinese messages only.",
    license: "Apache-2.0",
    license_url:
      "https://huggingface.co/datasets/OpenAssistant/oasst1/blob/fdf72ae0827c1cda404aff25b6603abec9e3399b/LICENSE",
    license_evidence_sha256: LICENSE_EVIDENCE.oasst1,
    attribution: "OpenAssistant OASST1 contributors; selected human-authored message at pinned revision (Apache-2.0).",
    redistribution_confirmed: true,
    record_ref: "train:message-6ab24d72-0181-4594-a9cd-deaf170242fb",
    upstream_sha256: B
  }
} as const;

function agentDojoRecord(): Record<string, unknown> {
  return { ...SOURCES.agentdojo };
}

function assertDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value, seen);
    }
  }
}

test("REQ-SBX-GENERAL-002 source admission accepts only the four pinned source families", () => {
  for (const candidate of Object.values(SOURCES)) {
    const admitted = validateReviewedSourceRecord({ ...candidate });
    assert.equal(admitted.source_id, candidate.source_id);
    assertDeeplyFrozen(admitted);
  }

  for (const candidate of [
    { ...agentDojoRecord(), revision: "HEAD" },
    { ...agentDojoRecord(), revision: "0".repeat(40) },
    { ...agentDojoRecord(), upstream_url: "http://github.com/ethz-spylab/agentdojo" },
    { ...agentDojoRecord(), upstream_url: "https://example.com/ethz-spylab/agentdojo" },
    { ...agentDojoRecord(), source_id: "agentdojo-fork" }
  ]) {
    assert.throws(() => validateReviewedSourceRecord(candidate), /source admission field/u);
  }
});

test("REQ-SBX-GENERAL-002 source admission enforces compatible record-level licence evidence", () => {
  for (const license of [
    "CC-BY-NC-4.0",
    "research-only",
    "mixed",
    "GPL-3.0",
    "CC-BY-SA-4.0",
    "unknown"
  ]) {
    assert.throws(
      () => validateReviewedSourceRecord({ ...agentDojoRecord(), license }),
      /source admission field/u
    );
  }

  assert.throws(
    () => validateReviewedSourceRecord({ ...agentDojoRecord(), license: "Apache-2.0" }),
    /source admission field/u
  );
  assert.throws(
    () => validateReviewedSourceRecord({ ...SOURCES.toolem, license: "MIT" }),
    /source admission field/u
  );
  assert.throws(
    () => validateReviewedSourceRecord({ ...SOURCES.oasst1, license: "CC-BY-4.0" }),
    /source admission field/u
  );

  for (const field of ["license_evidence_sha256", "upstream_sha256"] as const) {
    assert.throws(
      () => validateReviewedSourceRecord({ ...agentDojoRecord(), [field]: "not-a-sha" }),
      new RegExp(`source admission field: ${field}`, "u")
    );
  }

  const candidates = Object.values(SOURCES);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const wrongEvidence = candidates[(index + 1) % candidates.length]!
      .license_evidence_sha256;
    assert.throws(
      () => validateReviewedSourceRecord({
        ...candidate,
        license_evidence_sha256: wrongEvidence
      }),
      /source admission field: license_evidence_sha256/u
    );
  }
});

test("REQ-SBX-GENERAL-002 source admission requires family-specific bounded record locators", () => {
  for (const candidate of [
    { ...SOURCES.agentdojo, record_ref: "v1.banking.InjectionTask8" },
    { ...SOURCES.agentdojo, record_ref: "v1.slack.InjectionTask1" },
    { ...SOURCES.agentdojo, record_ref: "v1.slack.InjectionTask5" },
    { ...SOURCES.agentdojo, record_ref: "v1.travel.InjectionTask0" },
    { ...SOURCES.agentdojo, record_ref: "v1.travel.InjectionTask6" },
    { ...SOURCES.agentdojo, record_ref: "v1.workspace.InjectionTask0" },
    { ...SOURCES.agentdojo, record_ref: "v1.workspace.InjectionTask5" },
    { ...SOURCES.toolem, record_ref: "assets.all-cases.official_143" },
    { ...SOURCES.deepset, record_ref: "train:row-0545" }
  ]) {
    assert.equal(
      validateReviewedSourceRecord(candidate).record_ref,
      candidate.record_ref
    );
  }

  const invalidCandidates = [
    { ...SOURCES.agentdojo, record_ref: SOURCES.toolem.record_ref },
    { ...SOURCES.agentdojo, record_ref: "v1.banking.InjectionTask9" },
    { ...SOURCES.agentdojo, record_ref: "v1.slack.InjectionTask0" },
    { ...SOURCES.agentdojo, record_ref: "v1.travel.InjectionTask7" },
    { ...SOURCES.agentdojo, record_ref: "v1.workspace.InjectionTask6" },
    { ...SOURCES.toolem, record_ref: SOURCES.agentdojo.record_ref },
    { ...SOURCES.toolem, record_ref: "assets.all-cases.official_144" },
    { ...SOURCES.toolem, record_ref: "assets.all-cases.official_00" },
    { ...SOURCES.deepset, record_ref: SOURCES.oasst1.record_ref },
    { ...SOURCES.deepset, record_ref: "train:row-0546" },
    { ...SOURCES.deepset, record_ref: "test:row-0001" },
    { ...SOURCES.oasst1, record_ref: SOURCES.deepset.record_ref },
    { ...SOURCES.oasst1, record_ref: "train:message-not-a-uuid" },
    { ...SOURCES.oasst1, record_ref: "train:message-00000000-0000-0000-0000-000000000000" }
  ];

  for (const candidate of invalidCandidates) {
    assert.throws(
      () => validateReviewedSourceRecord(candidate),
      /source admission field: record_ref/u
    );
  }
});

test("REQ-SBX-GENERAL-002 source admission requires exact licence-specific attribution", () => {
  for (const candidate of Object.values(SOURCES)) {
    const prefix = candidate.attribution.split(";")[0]!;
    assert.throws(
      () => validateReviewedSourceRecord({ ...candidate, attribution: prefix }),
      /source admission field: attribution/u
    );
    assert.throws(
      () => validateReviewedSourceRecord({
        ...candidate,
        attribution: `${candidate.attribution} garbage suffix`
      }),
      /source admission field: attribution/u
    );
  }

  assert.equal(
    validateReviewedSourceRecord({
      ...SOURCES.deepset,
      license: "CC-BY-4.0",
      attribution: DEEPSET_CC_BY_ATTRIBUTION
    }).license,
    "CC-BY-4.0"
  );
  assert.throws(
    () => validateReviewedSourceRecord({
      ...SOURCES.deepset,
      license: "CC-BY-4.0"
    }),
    /source admission field: attribution/u
  );
});

test("REQ-SBX-GENERAL-002 source admission requires reviewed scope redistribution and attribution", () => {
  for (const [field, value] of [
    ["admitted_scope", ""],
    ["license_url", "https://example.com/LICENSE"],
    ["attribution", ""],
    ["redistribution_confirmed", false],
    ["record_ref", "../../whole-dataset"],
    ["record_ref", "all-records"]
  ] as const) {
    assert.throws(
      () => validateReviewedSourceRecord({ ...agentDojoRecord(), [field]: value }),
      new RegExp(`source admission field: ${field}`, "u")
    );
  }
});

test("REQ-SBX-GENERAL-002 source admission rejects excluded datasets and aliases", () => {
  for (const [source_id, upstream_url] of [
    ["bipia", "https://github.com/microsoft/BIPIA"],
    ["agentpoison", "https://github.com/AI-secure/AgentPoison"],
    ["injecagent", "https://github.com/uiuc-kang-lab/InjecAgent"]
  ]) {
    assert.throws(
      () => validateReviewedSourceRecord({ ...agentDojoRecord(), source_id, upstream_url }),
      /source admission field/u
    );
  }
});

test("REQ-SBX-GENERAL-002 reviewed records reject unknown inherited accessor and symbol data", () => {
  assert.throws(
    () => validateReviewedSourceRecord({ ...agentDojoRecord(), unexpected: true }),
    /source admission field/u
  );

  const inherited = Object.create({ attribution: SOURCES.agentdojo.attribution });
  Object.assign(inherited, agentDojoRecord());
  delete inherited.attribution;
  assert.throws(() => validateReviewedSourceRecord(inherited), /source admission field/u);

  const accessor = agentDojoRecord();
  Object.defineProperty(accessor, "attribution", {
    enumerable: true,
    get: () => SOURCES.agentdojo.attribution
  });
  assert.throws(() => validateReviewedSourceRecord(accessor), /source admission field/u);

  const symbol = agentDojoRecord();
  Object.defineProperty(symbol, Symbol("hidden"), { enumerable: true, value: true });
  assert.throws(() => validateReviewedSourceRecord(symbol), /source admission field/u);
});

test("REQ-SBX-GENERAL-002 source admission converts hostile proxy traps into a closed admission error", () => {
  const hostile = new Proxy(agentDojoRecord(), {
    ownKeys: () => {
      throw new Error("proxy trap");
    }
  });
  assert.throws(() => validateReviewedSourceRecord(hostile), /source admission field/u);
  assert.throws(
    () => importReviewedRecords({ reviewed_records: [hostile] }),
    /source admission field/u
  );

  const hostileArray = new Proxy([agentDojoRecord()], {
    ownKeys: () => {
      throw new Error("array proxy trap");
    }
  });
  assert.throws(
    () => importReviewedRecords({ reviewed_records: hostileArray }),
    /source admission field/u
  );
});

test("REQ-SBX-GENERAL-002 source admission canonicalizes foreign admission-looking proxy errors", () => {
  const hostile = new Proxy(agentDojoRecord(), {
    ownKeys: () => {
      throw new TypeError("source admission field: leaked-secret");
    }
  });

  assert.throws(
    () => validateReviewedSourceRecord(hostile),
    (error: unknown) => {
      assert.equal(error instanceof TypeError, true);
      assert.equal(
        (error as TypeError).message,
        "source admission field: record_shape"
      );
      assert.doesNotMatch((error as TypeError).message, /leaked-secret/u);
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-002 importer ignores hostile iterator injection and admits only indexed records", () => {
  const injectedRecord = {
    ...agentDojoRecord(),
    record_ref: "v1.banking.InjectionTask1",
    upstream_sha256: A
  };
  let iteratorInvoked = false;
  let injectedRecordYielded = false;
  const hostileArray = new Proxy([agentDojoRecord()], {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        return function* hostileIterator() {
          iteratorInvoked = true;
          yield target[0]!;
          injectedRecordYielded = true;
          yield injectedRecord;
        };
      }
      return Reflect.get(target, property, receiver);
    }
  });

  const lock = importReviewedRecords({ reviewed_records: hostileArray });
  const sources = lock.sources as readonly { records: readonly unknown[] }[];
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.records.length, 1);
  assert.equal(iteratorInvoked, false);
  assert.equal(injectedRecordYielded, false);
});

test("REQ-SBX-GENERAL-002 source admission snapshots hostile proxy values before validation", () => {
  let licenseReads = 0;
  const hostile = new Proxy(agentDojoRecord(), {
    get(target, property, receiver) {
      if (property === "license") {
        licenseReads += 1;
        return licenseReads === 1 ? "MIT" : "GPL-3.0";
      }
      return Reflect.get(target, property, receiver);
    }
  });
  const admitted = validateReviewedSourceRecord(hostile);
  assert.equal(admitted.license, "MIT");
});

test("REQ-SBX-GENERAL-002 importer groups reviewed records and rejects source or record conflicts", () => {
  const duplicateSourceRecords = [
    agentDojoRecord(),
    { ...agentDojoRecord(), record_ref: "v1.banking.InjectionTask1", upstream_sha256: A }
  ];
  const lock = importReviewedRecords({ reviewed_records: duplicateSourceRecords });
  assert.equal(lock.schema_version, "sandbox-security-benchmark-sources.v1");
  const sources = lock.sources as readonly { records: readonly unknown[] }[];
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.records.length, 2);
  assertDeeplyFrozen(lock);

  assert.throws(
    () => importReviewedRecords({ reviewed_records: [agentDojoRecord(), agentDojoRecord()] }),
    /source admission field: duplicate_record/u
  );
  assert.throws(
    () => importReviewedRecords({ reviewed_records: [
      { ...SOURCES.deepset },
      {
        ...SOURCES.deepset,
        license: "CC-BY-4.0",
        attribution: DEEPSET_CC_BY_ATTRIBUTION,
        record_ref: "train:row-0001",
        upstream_sha256: A
      }
    ] }),
    /source admission field: source_metadata_conflict/u
  );
});

test("REQ-SBX-GENERAL-002 importer accepts only an exact dense caller-supplied reviewed_records envelope", () => {
  assert.throws(() => importReviewedRecords({ reviewed_records: [] }), /source admission field/u);
  assert.throws(
    () => importReviewedRecords({ reviewed_records: [agentDojoRecord()], upstream_url: "https://example.com" } as never),
    /source admission field/u
  );

  const sparse = new Array(1);
  assert.throws(
    () => importReviewedRecords({ reviewed_records: sparse }),
    /source admission field/u
  );

  const input = { reviewed_records: [agentDojoRecord()] };
  const lock = importReviewedRecords(input);
  input.reviewed_records[0]!.attribution = "mutated after admission";
  assert.equal(
    (lock.sources as readonly { attribution: string }[])[0]?.attribution,
    SOURCES.agentdojo.attribution
  );
});

test("REQ-SBX-GENERAL-002 source importer has no download credential or automatic lock-write capability", () => {
  assert.equal(existsSync(IMPORTER_URL), true);
  const source = readFileSync(IMPORTER_URL, "utf8");
  assert.doesNotMatch(source, /node:(?:https?|child_process|net|tls|undici)/u);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|spawn|execFile|fork)\s*\(/u);
  assert.doesNotMatch(source, /\bprocess\.env\b|OPENAI_API_KEY|authorization/iu);
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|createWriteStream|rename|copyFile|mkdir)Sync?\b/u);
  assert.doesNotMatch(source, /sources\.lock\.json/u);
});

test("REQ-SBX-GENERAL-002 committed source lock and attribution cover every reviewed record one-to-one", () => {
  assert.equal(existsSync(LOCK_URL), true, "source admission field: committed lock");
  assert.equal(existsSync(ATTRIBUTION_URL), true, "source admission field: attribution");
  if (!existsSync(LOCK_URL) || !existsSync(ATTRIBUTION_URL)) return;

  const raw = JSON.parse(readFileSync(LOCK_URL, "utf8")) as unknown;
  const normalized = importReviewedRecords({
    reviewed_records: flattenLockToReviewedRecords(raw)
  });
  assert.deepEqual(normalized, raw);

  const lock = normalized as {
    sources: readonly {
      source_id: string;
      records: readonly { record_ref: string }[];
    }[];
  };
  const attribution = readFileSync(ATTRIBUTION_URL, "utf8");
  assert.deepEqual(lock.sources.map((source) => source.source_id), [
    "agentdojo",
    "toolem",
    "deepset-prompt-injections",
    "oasst1"
  ]);
  assert.equal(lock.sources.every((source) => source.records.length > 0), true);
  assert.ok(
    lock.sources.reduce((total, source) => total + source.records.length, 0) >= 246,
    "the lock must support 126 direct risk, 54 transformed risk, and 120 safe fixtures without placeholder records"
  );
  for (const source of lock.sources) {
    assert.match(attribution, new RegExp(`\\b${source.source_id}\\b`, "u"));
    for (const record of source.records) {
      assert.match(attribution, new RegExp(`\\b${escapeRegExp(record.record_ref)}\\b`, "u"));
    }
  }
});

test("REQ-SBX-GENERAL-002 P5-T2 corrective admits matrix-capable ToolEmu replacements with pinned hashes", () => {
  assert.equal(existsSync(LOCK_URL), true, "source admission field: committed lock");
  if (!existsSync(LOCK_URL)) return;

  const raw = JSON.parse(readFileSync(LOCK_URL, "utf8")) as {
    sources: readonly {
      source_id: string;
      records: readonly { record_ref: string; upstream_sha256: string }[];
    }[];
  };
  const normalized = importReviewedRecords({
    reviewed_records: flattenLockToReviewedRecords(raw)
  }) as typeof raw;
  assert.deepEqual(normalized, raw);

  const familyCounts = Object.fromEntries(
    normalized.sources.map((source) => [source.source_id, source.records.length])
  );
  assert.deepEqual(familyCounts, {
    agentdojo: 27,
    toolem: 60,
    "deepset-prompt-injections": 39,
    oasst1: 120
  });
  assert.equal(
    normalized.sources.reduce((total, source) => total + source.records.length, 0),
    246
  );

  const toolem = normalized.sources.find((source) => source.source_id === "toolem");
  assert.notEqual(toolem, undefined);
  const byRef = new Map(
    toolem!.records.map((record) => [record.record_ref, record.upstream_sha256])
  );

  const requiredReplacements = {
    "assets.all-cases.official_60":
      "9ff0a6316746580e313efc402a13ea71211d89962215968bf55ef70969d0defc",
    "assets.all-cases.official_111":
      "c4cf4d3e0b5af65c8378cbb01e2ff83533017a0fdf69748193c7a8c41cabe040",
    "assets.all-cases.official_75":
      "2c9665eb2e6fd42cf2d7c85da60a0fe6af224c4d6a5dc941b1a309710d02218c",
    "assets.all-cases.official_110":
      "b92f5e977c1727fff19667508008b1ff9fe58a9a9a8a1254287e07389d9b415b",
    "assets.all-cases.official_112":
      "1304dd657af9972cc657afb9b770d7144c04dc6df1613f8f9f99b97c1bf507f4",
    "assets.all-cases.official_79":
      "4b0e7c99ebbcafd2b4933775af93b940069da4615ab8e2ca6935d82c4520aae9",
    "assets.all-cases.official_80":
      "d7dfcd2ebbe9f299348fff824d119c93928ce6c63a6b7b5963e1647ea859e4dd",
    "assets.all-cases.official_62":
      "99cb1c44651b788041e6dd0b82c8d721ab9d963edd513dae4c9368a36be63612",
    "assets.all-cases.official_120":
      "3061cc67b0e4f59e4d85fc0f8de82de797cf00d131c208ab3270c6fec86bdcf3",
    "assets.all-cases.official_71":
      "3a39fc2edc871f0658d8f141d747d6a98de0c49a42e8a61119e3de19ad8e443d",
    "assets.all-cases.official_73":
      "8531cdd575b57ae58f64c3e2245736e2149d09ca85d93c9cccaff7084b6d4b15",
    "assets.all-cases.official_81":
      "cde5191864cce94c503241315cfb3cd842f11711acd899c2364f684ef5958e12",
    "assets.all-cases.official_83":
      "2748c6cd3f8da72ea8636e6c091ac7eb9165e784a02b9237093186f94946984b",
    "assets.all-cases.official_84":
      "8599315f5b346eb718210e61a65fae13d77c860e0f16fd8292256b51c612f954",
    "assets.all-cases.official_70":
      "22e28d4d2b21a0f3b9e78c6a2f5897059c250d43cb92e40547808494081e42e4"
  } as const;

  const rejectedReplacements = [
    "assets.all-cases.official_37",
    "assets.all-cases.official_19",
    "assets.all-cases.official_9",
    "assets.all-cases.official_35",
    "assets.all-cases.official_31",
    "assets.all-cases.official_46",
    "assets.all-cases.official_38",
    "assets.all-cases.official_36",
    "assets.all-cases.official_56",
    "assets.all-cases.official_8",
    "assets.all-cases.official_53",
    "assets.all-cases.official_11",
    "assets.all-cases.official_52",
    "assets.all-cases.official_23",
    "assets.all-cases.official_5"
  ] as const;

  for (const [recordRef, upstreamSha256] of Object.entries(requiredReplacements)) {
    assert.equal(
      byRef.get(recordRef),
      upstreamSha256,
      `source admission field: missing or mis-hashed corrective ToolEmu record ${recordRef}`
    );
  }

  for (const recordRef of rejectedReplacements) {
    assert.equal(
      byRef.has(recordRef),
      false,
      `source admission field: replaced weak ToolEmu record must leave the lock: ${recordRef}`
    );
  }

  const attribution = readFileSync(ATTRIBUTION_URL, "utf8");
  for (const recordRef of Object.keys(requiredReplacements)) {
    assert.match(
      attribution,
      new RegExp(`\\b${escapeRegExp(recordRef)}\\b`, "u"),
      `source admission field: attribution missing corrective record ${recordRef}`
    );
  }
  for (const recordRef of rejectedReplacements) {
    assert.doesNotMatch(
      attribution,
      new RegExp(`\\b${escapeRegExp(recordRef)}\\b`, "u"),
      `source admission field: attribution must drop replaced record ${recordRef}`
    );
  }
});

test("REQ-SBX-GENERAL-002 attribution declares an independently reproducible OASST1 hash projection", () => {
  const attribution = readFileSync(ATTRIBUTION_URL, "utf8");
  assert.match(
    attribution,
    /OASST1 record projection: \{created_date, lang, message_id, role, text\}/u
  );
  assert.match(attribution, /Object\.keys\(value\)\.sort\(\)/u);
  assert.match(attribution, /UTF-8 JSON bytes without spaces or a terminating newline/u);
  assert.match(attribution, /role\s*===\s*["']prompter["']/u);
  assert.match(attribution, /lang\s*in\s*\{\s*["']en["']\s*,\s*["']zh["']\s*\}/u);
  assert.match(attribution, /review_result\s*===\s*true/u);
  assert.match(attribution, /deleted\s*===\s*false/u);
  assert.match(attribution, /synthetic\s*===\s*false/u);
  assert.match(attribution, /non-empty\s+text/u);
  assert.match(attribution, /offsets?\s+0,\s*1000,\s*\.\.\.,\s*84000/u);
  assert.match(attribution, /length\s*100/u);
  assert.match(attribution, /60\s+English\s+and\s+60\s+Chinese/u);
  assert.match(attribution, /pinned.*2023-04-12_oasst_all\.messages\.jsonl\.gz/isu);
});

function flattenLockToReviewedRecords(value: unknown): unknown[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.sources)) return [];
  const records: unknown[] = [];
  for (const sourceValue of root.sources) {
    if (sourceValue === null || typeof sourceValue !== "object" || Array.isArray(sourceValue)) continue;
    const source = sourceValue as Record<string, unknown>;
    if (!Array.isArray(source.records)) continue;
    const { records: sourceRecords, ...metadata } = source;
    for (const recordValue of sourceRecords) {
      if (recordValue === null || typeof recordValue !== "object" || Array.isArray(recordValue)) continue;
      records.push({ ...metadata, ...(recordValue as Record<string, unknown>) });
    }
  }
  return records;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
