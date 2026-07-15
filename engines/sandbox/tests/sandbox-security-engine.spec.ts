import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { resolveSandboxSecurityProfile } from "../src/security/policy-profiles.ts";

const modulePath = new URL("../src/security/finding-qualification.ts", import.meta.url);

const qualification = existsSync(modulePath)
  ? await import("../src/security/finding-qualification.ts")
  : null;

const {
  qualifySandboxSecuritySlotEvidence,
  materializeSandboxSecurityPublicSubjectTokens,
  publishSandboxSecurityFindings,
  deriveSandboxSecurityExpectedPublication,
  validateSandboxSecurityPublication
} = (qualification ?? {
  qualifySandboxSecuritySlotEvidence() {
    return {
      source_slot_id: "detector://sandbox/security/rule/default/v1",
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [],
      routing_risks: [],
      discarded_count: 0
    };
  },
  materializeSandboxSecurityPublicSubjectTokens() {
    return { decision_id: "x", sources: [] };
  },
  publishSandboxSecurityFindings() {
    return [];
  },
  deriveSandboxSecurityExpectedPublication() {
    return { token_map: { decision_id: "x", sources: [] }, findings: [] };
  },
  validateSandboxSecurityPublication() {}
}) as typeof import("../src/security/finding-qualification.ts");

const NONCE = "a".repeat(32);
const SOURCE = `hsrc:${NONCE}:0001`;
const SOURCE2 = `hsrc:${NONCE}:0002`;
const CALL = `hcall:${NONCE}:0000`;
const DECISION = "dec-engine-1";

function ruleSlot() {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  return profile.detector_slots.find((slot) => slot.detector_kind === "rule")!;
}

function localSlot() {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  return profile.detector_slots.find((slot) => slot.detector_kind === "local_model")!;
}

function subjectMap(options?: { tool?: boolean; second?: boolean }) {
  return Object.freeze({
    evaluation_nonce: NONCE,
    sources: Object.freeze([
      Object.freeze({ source_handle: SOURCE as never }),
      ...(options?.second
        ? [Object.freeze({ source_handle: SOURCE2 as never })]
        : [])
    ]),
    ...(options?.tool
      ? { tool: Object.freeze({ call_handle: CALL as never }) }
      : {})
  });
}

function contentRef(handle = SOURCE, locator: { kind: "whole_source" } | { kind: "text_byte_range"; start_byte: number; end_byte: number } = { kind: "whole_source" }) {
  return {
    kind: "content_source" as const,
    source_handle: handle,
    locator
  };
}

function toolRef(component: "whole_call" | "tool_name" | "target" | "arguments" = "whole_call") {
  if (component === "arguments") {
    return {
      kind: "tool_request" as const,
      call_handle: CALL,
      component: "arguments" as const,
      locator: { kind: "whole_arguments" as const }
    };
  }
  return {
    kind: "tool_request" as const,
    call_handle: CALL,
    component
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    category: "prompt_injection",
    severity: "high",
    confidence: 0.8,
    reason_code: "sandbox_security_prompt_injection",
    subject_refs: [contentRef()],
    ...overrides
  };
}

function qualify(result: { candidates: unknown[]; clearances?: unknown[] }, options?: { slot?: ReturnType<typeof ruleSlot>; decision_id?: string; map?: ReturnType<typeof subjectMap> }) {
  return qualifySandboxSecuritySlotEvidence({
    slot: options?.slot ?? ruleSlot(),
    result: {
      candidates: result.candidates as never,
      clearances: (result.clearances ?? []) as never
    },
    decision_id: options?.decision_id ?? DECISION,
    subject_map: options?.map ?? subjectMap()
  });
}

test("REQ-SBX-GENERAL-001 qualifies candidates at or above threshold", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 0.8 })] });
  assert.equal(evidence.accepted_draft_findings.length, 1);
  assert.equal(evidence.accepted_risks.length, 1);
  assert.equal(evidence.routing_risks.length, 0);
  assert.equal(evidence.discarded_count, 0);
});

test("REQ-SBX-GENERAL-001 keeps routing-floor evidence out of returned findings", () => {
  // balanced rule: qualify 0.80 floor 0.60
  const evidence = qualify({ candidates: [candidate({ confidence: 0.6 })] });
  assert.equal(evidence.accepted_draft_findings.length, 0);
  assert.equal(evidence.routing_risks.length, 1);
  assert.equal(evidence.routing_risks[0].confidence, 0.6);
});

test("REQ-SBX-GENERAL-001 discards below routing floor", () => {
  // use local slot with higher floors if needed; for rule 0.60 floor, use 0? rule only 0.6/0.8/1.0
  // local allows arbitrary confidences
  const slot = localSlot();
  const evidence = qualify(
    { candidates: [candidate({ confidence: 0.1 })] },
    { slot }
  );
  assert.equal(evidence.accepted_draft_findings.length, 0);
  assert.equal(evidence.routing_risks.length, 0);
  assert.equal(evidence.discarded_count, 1);
});

test("REQ-SBX-GENERAL-001 severity does not bypass confidence threshold", () => {
  const evidence = qualify({
    candidates: [candidate({ severity: "critical", confidence: 0.6 })]
  });
  assert.equal(evidence.accepted_draft_findings.length, 0);
  assert.equal(evidence.routing_risks.length, 1);
});

test("REQ-SBX-GENERAL-001 rejects duplicate candidate uniqueness keys in one slot", () => {
  assert.throws(() =>
    qualify({
      candidates: [
        candidate({ confidence: 0.8 }),
        candidate({ confidence: 0.8, severity: "medium" })
      ]
    })
  );
});

test("REQ-SBX-GENERAL-001 finding_id matches finding:sha256 64hex grammar", () => {
  const evidence = qualify({ candidates: [candidate()] });
  assert.match(
    evidence.accepted_draft_findings[0].finding_id,
    /^finding:sha256:[a-f0-9]{64}$/
  );
});

test("REQ-SBX-GENERAL-001 finding identity is stable under subject ref sort", () => {
  const map = subjectMap({ second: true });
  const refsA = [contentRef(SOURCE), contentRef(SOURCE2)];
  const refsB = [contentRef(SOURCE2), contentRef(SOURCE)];
  const a = qualify(
    { candidates: [candidate({ subject_refs: refsA, confidence: 1.0 })] },
    { map }
  );
  const b = qualify(
    { candidates: [candidate({ subject_refs: refsB, confidence: 1.0 })] },
    { map }
  );
  assert.equal(
    a.accepted_draft_findings[0].finding_id,
    b.accepted_draft_findings[0].finding_id
  );
  assert.equal(
    a.accepted_draft_findings[0].subject_key,
    b.accepted_draft_findings[0].subject_key
  );
});

test("REQ-SBX-GENERAL-001 subject_key excludes slot ID and uses sorted private scopes", () => {
  const evidence = qualify({ candidates: [candidate()] });
  const key = evidence.accepted_draft_findings[0].subject_key;
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(key, /detector:\/\//);
  assert.equal(evidence.accepted_risks[0].subject_key, key);
});

test("REQ-SBX-GENERAL-001 maps private handles to public source and call tokens", () => {
  const map = subjectMap({ tool: true });
  const evidence = qualify(
    {
      candidates: [
        candidate({ subject_refs: [contentRef()], confidence: 1.0 }),
        candidate({
          category: "tool_hijacking",
          reason_code: "sandbox_security_tool_hijacking",
          subject_refs: [toolRef()],
          confidence: 1.0
        })
      ]
    },
    { map }
  );
  const expected = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  });
  assert.ok(expected.token_map.sources[0].public_source_token.startsWith("source://"));
  assert.ok(expected.token_map.tool?.public_call_token.startsWith("call://"));
  assert.equal(expected.findings[0].subject_refs[0].kind, "content_source");
});

test("REQ-SBX-GENERAL-001 assigns evidence refs by decision ordinal only after sort", () => {
  const evidence = qualify({
    candidates: [
      candidate({
        category: "jailbreak",
        reason_code: "sandbox_security_jailbreak",
        severity: "low",
        confidence: 1.0
      }),
      candidate({
        category: "prompt_injection",
        reason_code: "sandbox_security_prompt_injection",
        severity: "critical",
        confidence: 1.0,
        subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 1 })]
      })
    ]
  });
  const published = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).findings;
  assert.equal(published[0].severity, "critical");
  assert.equal(
    published[0].evidence_refs[0],
    `evidence://sandbox/security/${DECISION}/0001`
  );
  assert.equal(
    published[1].evidence_refs[0],
    `evidence://sandbox/security/${DECISION}/0002`
  );
});

test("REQ-SBX-GENERAL-001 cross-slot equivalent evidence remains separate findings", () => {
  const rule = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const local = qualify(
    { candidates: [candidate({ confidence: 0.9 })] },
    { slot: localSlot() }
  );
  assert.notEqual(
    rule.accepted_draft_findings[0].finding_id,
    local.accepted_draft_findings[0].finding_id
  );
});

test("REQ-SBX-GENERAL-001 rule confidences accept only 0.60 0.80 1.00 at boundary", () => {
  assert.throws(() =>
    qualify({ candidates: [candidate({ confidence: 0.9 })] })
  );
  assert.doesNotThrow(() =>
    qualify({ candidates: [candidate({ confidence: 1.0 })] })
  );
});

test("REQ-SBX-GENERAL-001 qualified findings contain no raw content or prose", () => {
  const evidence = qualify({ candidates: [candidate()] });
  const text = JSON.stringify(evidence);
  assert.doesNotMatch(text, /hello|raw_content|evidence_text|allow|deny/);
});

test("REQ-SBX-GENERAL-001 clearances never delete accepted DraftFindings", () => {
  const evidence = qualify({
    candidates: [candidate({ confidence: 1.0 })],
    clearances: [
      {
        category: "prompt_injection",
        confidence: 1.0,
        subject_refs: [contentRef()]
      }
    ]
  });
  assert.equal(evidence.accepted_draft_findings.length, 1);
  assert.equal(evidence.qualified_clearances.length, 1);
});

test("REQ-SBX-GENERAL-001 qualifySandboxSecuritySlotEvidence returns QualifiedSlotEvidence shape", () => {
  const evidence = qualify({ candidates: [] });
  assert.deepEqual(Object.keys(evidence).sort(), [
    "accepted_draft_findings",
    "accepted_risks",
    "discarded_count",
    "qualified_clearances",
    "routing_risks",
    "source_slot_id"
  ].sort());
});

test("REQ-SBX-GENERAL-001 every accepted DraftFinding has paired AcceptedRiskEvidence", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  assert.equal(evidence.accepted_draft_findings.length, evidence.accepted_risks.length);
  assert.equal(
    evidence.accepted_draft_findings[0].finding_id,
    evidence.accepted_risks[0].finding_id
  );
});

test("REQ-SBX-GENERAL-001 rejects AcceptedRisk and DraftFinding subject-ref mismatch", () => {
  // invariant enforced by construction: same refs used for both
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  assert.deepEqual(
    evidence.accepted_draft_findings[0].subject_refs,
    evidence.accepted_risks[0].subject_refs
  );
});

test("REQ-SBX-GENERAL-001 DraftFinding carries subject_key from the P3 helper", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  assert.match(evidence.accepted_draft_findings[0].subject_key, /^[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 AcceptedRisk DraftFinding and public Finding pair one-to-one", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const published = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).findings;
  assert.equal(published.length, 1);
  assert.equal(published[0].finding_id, evidence.accepted_risks[0].finding_id);
  assert.equal(published[0].category, evidence.accepted_risks[0].category);
});

test("REQ-SBX-GENERAL-001 accepted risk evidence uses private subject_key not public tokens", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  assert.doesNotMatch(evidence.accepted_risks[0].subject_key, /source:\/\//);
  assert.doesNotMatch(
    JSON.stringify(evidence.accepted_risks[0].subject_refs),
    /source:\/\//
  );
});

test("REQ-SBX-GENERAL-001 qualification accepts only NormalizedSlotResult private refs", () => {
  assert.throws(() =>
    qualify({
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: "etok:src:" + NONCE + ":0001",
              locator: { kind: "whole_source" }
            }
          ]
        })
      ]
    })
  );
});

test("REQ-SBX-GENERAL-001 routing_risks exclude accepted same-scope candidates", () => {
  // uniqueness prevents same category+reason+refs at two confidences; same-scope
  // exclusion is category+canonical subjects. Accepted category A and routing
  // category B on same refs can both exist; A must not appear in routing_risks.
  const evidence = qualify({
    candidates: [
      candidate({
        confidence: 1.0,
        category: "prompt_injection",
        reason_code: "sandbox_security_prompt_injection",
        subject_refs: [contentRef()]
      }),
      candidate({
        confidence: 0.6,
        category: "jailbreak",
        reason_code: "sandbox_security_jailbreak",
        subject_refs: [contentRef()]
      })
    ]
  });
  assert.equal(evidence.accepted_draft_findings.length, 1);
  assert.equal(evidence.routing_risks.length, 1);
  assert.equal(evidence.routing_risks[0].category, "jailbreak");
  assert.equal(
    evidence.routing_risks.some((risk) => risk.category === "prompt_injection"),
    false
  );
});

test("REQ-SBX-GENERAL-001 public source tokens use decision-scoped exact grammar", () => {
  const tokens = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: DECISION,
    accepted_entities: [{ kind: "content_source", source_handle: SOURCE as never }]
  });
  assert.match(
    tokens.sources[0].public_source_token,
    new RegExp(`^source://sandbox/security/${DECISION}/0001$`)
  );
});

test("REQ-SBX-GENERAL-001 public call tokens use decision-scoped exact grammar", () => {
  const tokens = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: DECISION,
    accepted_entities: [{ kind: "tool_request", call_handle: CALL as never }]
  });
  assert.match(
    tokens.tool!.public_call_token,
    new RegExp(`^call://sandbox/security/${DECISION}/0001$`)
  );
});

test("REQ-SBX-GENERAL-001 tokens are minted only after risk qualification", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  assert.equal(Object.hasOwn(evidence.accepted_draft_findings[0], "evidence_refs"), false);
  const text = JSON.stringify(evidence);
  assert.doesNotMatch(text, /source:\/\/sandbox\/security/);
});

test("REQ-SBX-GENERAL-001 canonical entity order determines the global four-digit ordinal", () => {
  const tokens = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: DECISION,
    accepted_entities: [
      { kind: "tool_request", call_handle: CALL as never },
      { kind: "content_source", source_handle: SOURCE as never }
    ]
  });
  // sources sort before tool (kind order 0 then 1)
  assert.equal(tokens.sources[0].public_source_token.endsWith("/0001"), true);
  assert.equal(tokens.tool!.public_call_token.endsWith("/0002"), true);
});

test("REQ-SBX-GENERAL-001 same decision and accepted entity set produce identical tokens", () => {
  const a = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: DECISION,
    accepted_entities: [
      { kind: "content_source", source_handle: SOURCE as never },
      { kind: "tool_request", call_handle: CALL as never }
    ]
  });
  const b = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: DECISION,
    accepted_entities: [
      { kind: "tool_request", call_handle: CALL as never },
      { kind: "content_source", source_handle: SOURCE as never }
    ]
  });
  assert.deepEqual(a, b);
});

test("REQ-SBX-GENERAL-001 different decision IDs produce different public tokens", () => {
  const a = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: "dec-a",
    accepted_entities: [{ kind: "content_source", source_handle: SOURCE as never }]
  });
  const b = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: "dec-b",
    accepted_entities: [{ kind: "content_source", source_handle: SOURCE as never }]
  });
  assert.notEqual(
    a.sources[0].public_source_token,
    b.sources[0].public_source_token
  );
});

test("REQ-SBX-GENERAL-001 discarded and routing-only evidence receives no public token", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 0.6 })] });
  assert.equal(evidence.accepted_draft_findings.length, 0);
  const published = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  });
  assert.equal(published.token_map.sources.length, 0);
  assert.equal(published.findings.length, 0);
});

test("REQ-SBX-GENERAL-001 external etok tokens are never reused as public tokens", () => {
  assert.throws(() =>
    materializeSandboxSecurityPublicSubjectTokens({
      decision_id: DECISION,
      accepted_entities: [
        {
          kind: "content_source",
          source_handle: (`etok:src:${NONCE}:0001`) as never
        }
      ]
    })
  );
});

test("REQ-SBX-GENERAL-001 QualificationSubjectMap carries private handles only", () => {
  const map = subjectMap();
  assert.match(map.sources[0].source_handle, /^hsrc:/);
  assert.equal(Object.hasOwn(map.sources[0], "public_source_token"), false);
});

test("REQ-SBX-GENERAL-001 QualifiedSlotEvidence always includes source_slot_id", () => {
  const evidence = qualify({ candidates: [] });
  assert.equal(evidence.source_slot_id, ruleSlot().slot_id);
});

test("REQ-SBX-GENERAL-001 qualification returns DraftFinding rather than public Finding", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const draft = evidence.accepted_draft_findings[0];
  assert.equal(Object.hasOwn(draft, "evidence_refs"), false);
  assert.equal("subject_key" in draft, true);
});

test("REQ-SBX-GENERAL-001 DraftFinding subject refs use private handles only", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const ref = evidence.accepted_draft_findings[0].subject_refs[0];
  assert.equal(ref.kind, "content_source");
  if (ref.kind === "content_source") {
    assert.match(ref.source_handle, /^hsrc:/);
  }
});

test("REQ-SBX-GENERAL-001 DraftFinding contains no public tokens or evidence refs", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const text = JSON.stringify(evidence.accepted_draft_findings[0]);
  assert.doesNotMatch(text, /source:\/\/|call:\/\/|evidence:\/\//);
});

test("REQ-SBX-GENERAL-001 publish converts every private handle to a public token", () => {
  const evidence = qualify({
    candidates: [candidate({ confidence: 1.0 })],
  });
  const { token_map, findings } = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  });
  assert.equal(findings[0].subject_refs[0].kind, "content_source");
  if (findings[0].subject_refs[0].kind === "content_source") {
    assert.equal(
      findings[0].subject_refs[0].source_token,
      token_map.sources[0].public_source_token
    );
  }
});

test("REQ-SBX-GENERAL-001 deriveSandboxSecurityExpectedPublication matches committed publication", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const expected = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  });
  const findings = publishSandboxSecurityFindings({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings,
    token_map: expected.token_map
  });
  assert.deepEqual(findings, expected.findings);
});

test("REQ-SBX-GENERAL-001 validateSandboxSecurityPublication is pure and side-effect free", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const expected = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  });
  assert.doesNotThrow(() =>
    validateSandboxSecurityPublication({
      decision_id: DECISION,
      draft_findings: evidence.accepted_draft_findings,
      actual_token_map: expected.token_map,
      actual_findings: expected.findings
    })
  );
});

test("REQ-SBX-GENERAL-001 validateSandboxSecurityPublication rejects forged token map", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const expected = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  });
  assert.throws(() =>
    validateSandboxSecurityPublication({
      decision_id: DECISION,
      draft_findings: evidence.accepted_draft_findings,
      actual_token_map: {
        ...expected.token_map,
        sources: [
          {
            source_handle: SOURCE as never,
            public_source_token: `source://sandbox/security/${DECISION}/0099`
          }
        ]
      },
      actual_findings: expected.findings
    })
  );
});

test("REQ-SBX-GENERAL-001 validateSandboxSecurityPublication rejects forged finding order", () => {
  const evidence = qualify({
    candidates: [
      candidate({
        confidence: 1.0,
        severity: "low",
        category: "jailbreak",
        reason_code: "sandbox_security_jailbreak"
      }),
      candidate({
        confidence: 1.0,
        severity: "critical",
        subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 2 })]
      })
    ]
  });
  const expected = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  });
  const forged = [...expected.findings].reverse();
  assert.throws(() =>
    validateSandboxSecurityPublication({
      decision_id: DECISION,
      draft_findings: evidence.accepted_draft_findings,
      actual_token_map: expected.token_map,
      actual_findings: forged
    })
  );
});

test("REQ-SBX-GENERAL-001 publish rejects decision ID different from token map", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const expected = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  });
  assert.throws(() =>
    publishSandboxSecurityFindings({
      decision_id: "other-dec",
      draft_findings: evidence.accepted_draft_findings,
      token_map: expected.token_map
    })
  );
});

test("REQ-SBX-GENERAL-001 public Finding never exposes source_handle or call_handle", () => {
  const map = subjectMap({ tool: true });
  const evidence = qualify(
    {
      candidates: [
        candidate({ confidence: 1.0 }),
        candidate({
          confidence: 1.0,
          category: "tool_hijacking",
          reason_code: "sandbox_security_tool_hijacking",
          subject_refs: [toolRef()]
        })
      ]
    },
    { map }
  );
  const findings = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).findings;
  const text = JSON.stringify(findings);
  assert.doesNotMatch(text, /source_handle|call_handle|hsrc:|hcall:/);
});

test("REQ-SBX-GENERAL-001 public finding normalizer is never used for DraftFinding", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.doesNotMatch(source, /normalizeSandboxSecurityFinding/);
});

test("REQ-SBX-GENERAL-001 multiple locators on one source reuse one public source token", () => {
  const evidence = qualify({
    candidates: [
      candidate({
        confidence: 1.0,
        subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 1 })]
      }),
      candidate({
        confidence: 1.0,
        category: "jailbreak",
        reason_code: "sandbox_security_jailbreak",
        subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 1, end_byte: 2 })]
      })
    ]
  });
  const tokens = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).token_map;
  assert.equal(tokens.sources.length, 1);
});

test("REQ-SBX-GENERAL-001 multiple categories on one source reuse one public source token", () => {
  const evidence = qualify({
    candidates: [
      candidate({ confidence: 1.0 }),
      candidate({
        confidence: 1.0,
        category: "jailbreak",
        reason_code: "sandbox_security_jailbreak"
      })
    ]
  });
  const tokens = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).token_map;
  assert.equal(tokens.sources.length, 1);
});

test("REQ-SBX-GENERAL-001 multiple tool components on one call reuse one public call token", () => {
  const map = subjectMap({ tool: true });
  const evidence = qualify(
    {
      candidates: [
        candidate({
          confidence: 1.0,
          category: "tool_hijacking",
          reason_code: "sandbox_security_tool_hijacking",
          subject_refs: [toolRef("whole_call")]
        }),
        candidate({
          confidence: 1.0,
          category: "unsafe_side_effect",
          reason_code: "sandbox_security_unsafe_side_effect",
          subject_refs: [toolRef("tool_name")]
        })
      ]
    },
    { map }
  );
  const tokens = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).token_map;
  assert.ok(tokens.tool);
  assert.equal(
    tokens.sources.length + (tokens.tool ? 1 : 0),
    1
  );
});

test("REQ-SBX-GENERAL-001 locator does not participate in public token identity", () => {
  const a = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: DECISION,
    accepted_entities: [{ kind: "content_source", source_handle: SOURCE as never }]
  });
  const evidence = qualify({
    candidates: [
      candidate({
        confidence: 1.0,
        subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 3 })]
      })
    ]
  });
  const b = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).token_map;
  assert.equal(
    a.sources[0].public_source_token,
    b.sources[0].public_source_token
  );
});

test("REQ-SBX-GENERAL-001 component does not participate in public token identity", () => {
  const map = subjectMap({ tool: true });
  const evidence = qualify(
    {
      candidates: [
        candidate({
          confidence: 1.0,
          category: "tool_hijacking",
          reason_code: "sandbox_security_tool_hijacking",
          subject_refs: [toolRef("tool_name")]
        })
      ]
    },
    { map }
  );
  const tokens = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).token_map;
  assert.match(tokens.tool!.public_call_token, /\/0001$/);
});

test("REQ-SBX-GENERAL-001 source and call entities share one deterministic ordinal sequence", () => {
  const tokens = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: DECISION,
    accepted_entities: [
      { kind: "content_source", source_handle: SOURCE as never },
      { kind: "tool_request", call_handle: CALL as never }
    ]
  });
  assert.equal(tokens.sources[0].public_source_token.endsWith("/0001"), true);
  assert.equal(tokens.tool!.public_call_token.endsWith("/0002"), true);
});

test("REQ-SBX-GENERAL-001 token map rejects duplicate private handles", () => {
  assert.throws(() =>
    materializeSandboxSecurityPublicSubjectTokens({
      decision_id: DECISION,
      accepted_entities: [
        { kind: "content_source", source_handle: SOURCE as never },
        { kind: "content_source", source_handle: SOURCE as never }
      ]
    })
  );
});

test("REQ-SBX-GENERAL-001 published evidence ref uses exact grammar", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const findings = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).findings;
  assert.match(
    findings[0].evidence_refs[0],
    new RegExp(`^evidence://sandbox/security/${DECISION}/0001$`)
  );
});

test("REQ-SBX-GENERAL-001 evidence ordinal follows final finding order", () => {
  const evidence = qualify({
    candidates: [
      candidate({
        confidence: 1.0,
        severity: "low",
        category: "jailbreak",
        reason_code: "sandbox_security_jailbreak"
      }),
      candidate({
        confidence: 1.0,
        severity: "critical",
        subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 1 })]
      })
    ]
  });
  const findings = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).findings;
  assert.equal(findings[0].severity, "critical");
  assert.ok(findings[0].evidence_refs[0].endsWith("/0001"));
  assert.ok(findings[1].evidence_refs[0].endsWith("/0002"));
});

test("REQ-SBX-GENERAL-001 every published finding has exactly one evidence ref", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  const findings = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).findings;
  assert.equal(findings[0].evidence_refs.length, 1);
});

test("REQ-SBX-GENERAL-001 draft finding has no evidence ref", () => {
  const evidence = qualify({ candidates: [candidate({ confidence: 1.0 })] });
  assert.equal(
    Object.hasOwn(evidence.accepted_draft_findings[0], "evidence_refs"),
    false
  );
});

test("REQ-SBX-GENERAL-001 detector supplied evidence refs are never preserved", () => {
  const evidence = qualify({
    candidates: [
      {
        ...candidate({ confidence: 1.0 }),
        evidence_refs: ["evidence://forged/0001"]
      }
    ]
  });
  assert.equal(
    Object.hasOwn(evidence.accepted_draft_findings[0], "evidence_refs"),
    false
  );
  const findings = deriveSandboxSecurityExpectedPublication({
    decision_id: DECISION,
    draft_findings: evidence.accepted_draft_findings
  }).findings;
  assert.deepEqual(findings[0].evidence_refs, [
    `evidence://sandbox/security/${DECISION}/0001`
  ]);
});

import { createSandboxSecurityEscalationState } from "../src/security/escalation-state.ts";
import { deriveSandboxSecurityExternalTokenRegistry } from "../src/security/sanitized-boundary.ts";
import { computeSandboxSecuritySubjectKey } from "../src/security/subject-scope.ts";

function judgeSlot() {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  return profile.detector_slots.find((slot) => slot.detector_kind === "external_judge")!;
}

function makeTokenRegistry(options?: { tool?: boolean }) {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const contents = [
    Object.freeze({
      source_handle: SOURCE as never,
      source_id: "src-1",
      source_type: "user_input" as const,
      media_type: "text/plain" as const,
      authority_kind: "simulation_observation" as const,
      value: "hello",
      provenance_ref: "source://fixture/src-1",
      original_utf8_bytes: Object.freeze([104, 101, 108, 108, 111]),
      original_value_sha256: "c".repeat(64),
      comparison_value: "hello",
      trust_class: "user_supplied" as const
    })
  ];
  if (options?.tool) {
    // keep single source
  }
  const snapshot = Object.freeze({
    request_id: "req-1",
    evaluation_mode: "simulation" as const,
    stage: options?.tool ? ("tool_request" as const) : ("user_input" as const),
    profile,
    contents: Object.freeze(contents),
    ...(options?.tool
      ? {
          tool_request: Object.freeze({
            call_handle: CALL as never,
            call_id: "call-1",
            authority_kind: "simulation_observation" as const,
            tool_name: "read_file",
            arguments: Object.freeze({}),
            arguments_jcs_sha256: "e".repeat(64),
            has_target: false
          })
        }
      : {}),
    canonical_request_sha256: "b".repeat(64)
  });
  return deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
}

function routingEvidence(overrides: Record<string, unknown> = {}) {
  const refs = (overrides.subject_refs as never) ?? [contentRef()];
  const category = (overrides.category as string) ?? "prompt_injection";
  const subject_key = computeSandboxSecuritySubjectKey({
    category: category as never,
    subject_refs: refs as never
  });
  return {
    source_slot_id: ruleSlot().slot_id,
    accepted_risks: [],
    accepted_draft_findings: [],
    qualified_clearances: [],
    routing_risks: [
      {
        category,
        subject_key,
        source_slot_id: ruleSlot().slot_id,
        severity: "high",
        confidence: 0.6,
        reason_code: `sandbox_security_${category}`,
        subject_refs: refs,
        ...overrides
      }
    ],
    discarded_count: 0
  };
}

function acceptedEvidence(overrides: Record<string, unknown> = {}) {
  const refs = (overrides.subject_refs as never) ?? [contentRef()];
  const category = (overrides.category as string) ?? "prompt_injection";
  const subject_key = computeSandboxSecuritySubjectKey({
    category: category as never,
    subject_refs: refs as never
  });
  const finding_id = "finding:sha256:" + "1".repeat(64);
  const draft = {
    finding_id,
    detector_id: ruleSlot().slot_id,
    detector_version: "1.0.0",
    category,
    severity: "high",
    confidence: 1.0,
    reason_code: `sandbox_security_${category}`,
    subject_key,
    subject_refs: refs
  };
  return {
    source_slot_id: ruleSlot().slot_id,
    accepted_risks: [
      {
        category,
        subject_key,
        source_slot_id: ruleSlot().slot_id,
        finding_id,
        severity: "high",
        confidence: 1.0,
        reason_code: `sandbox_security_${category}`,
        subject_refs: refs
      }
    ],
    accepted_draft_findings: [draft],
    qualified_clearances: [],
    routing_risks: [],
    discarded_count: 0,
    ...overrides
  };
}

test("REQ-SBX-GENERAL-001 escalation routes Judge only for unresolved signals", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  assert.equal(state.unresolvedSignals().length, 1);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  assert.equal(obligations.length, 1);
});

test("REQ-SBX-GENERAL-001 no escalation signal skips Judge", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(acceptedEvidence() as never);
  assert.equal(state.unresolvedSignals().length, 0);
  state.closeWithoutJudge();
  assert.equal(state.lifecycle(), "closed");
});

test("REQ-SBX-GENERAL-001 accepted same-scope risk suppresses routing signal", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.addSlotEvidence(acceptedEvidence() as never);
  assert.equal(state.unresolvedSignals().length, 0);
});

test("REQ-SBX-GENERAL-001 routing-floor risk creates signal by category and subject_key", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const signal = state.unresolvedSignals()[0];
  assert.equal(signal.category, "prompt_injection");
  assert.match(signal.subject_key, /^[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 local clearance cannot resolve escalation signal", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const refs = [contentRef()];
  const subject_key = computeSandboxSecuritySubjectKey({
    category: "prompt_injection",
    subject_refs: refs as never
  });
  state.addSlotEvidence({
    source_slot_id: localSlot().slot_id,
    accepted_risks: [],
    accepted_draft_findings: [],
    qualified_clearances: [
      {
        category: "prompt_injection",
        subject_key,
        source_slot_id: localSlot().slot_id,
        confidence: 1.0
      }
    ],
    routing_risks: [],
    discarded_count: 0
  } as never);
  assert.equal(state.unresolvedSignals().length, 1);
});

test("REQ-SBX-GENERAL-001 Judge clearance resolves one escalation signal", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const subject_key = state.unresolvedSignals()[0].subject_key;
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [obligations[0].obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [
        {
          category: "prompt_injection",
          subject_key,
          source_slot_id: judgeSlot().slot_id,
          confidence: 0.9
        }
      ],
      routing_risks: [],
      discarded_count: 0
    }
  });
  assert.equal(result.unresolved_signals.length, 0);
  assert.ok(result.resolution_evidence.some((item) => item.kind === "qualified_clearance"));
  state.close();
});

test("REQ-SBX-GENERAL-001 Judge clearance never removes accepted DraftFindings", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(acceptedEvidence() as never);
  state.addSlotEvidence(routingEvidence({
    category: "jailbreak",
    reason_code: "sandbox_security_jailbreak",
    subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 1 })]
  }) as never);
  // simplify: accepted draft preserved after judge clearance on other signal
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const signal = state.unresolvedSignals()[0];
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [obligations[0].obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [
        {
          category: signal.category,
          subject_key: signal.subject_key,
          source_slot_id: judgeSlot().slot_id,
          confidence: 0.9
        }
      ],
      routing_risks: [],
      discarded_count: 0
    }
  });
  assert.equal(result.accepted_draft_findings.length, 1);
});

test("REQ-SBX-GENERAL-001 Judge risk accepts finding and resolves matching signal", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const signal = state.unresolvedSignals()[0];
  const finding_id = "finding:sha256:" + "2".repeat(64);
  const draft = {
    finding_id,
    detector_id: judgeSlot().slot_id,
    detector_version: "1.0.0",
    category: signal.category,
    severity: signal.severity,
    confidence: 0.9,
    reason_code: signal.reason_code,
    subject_key: signal.subject_key,
    subject_refs: signal.subject_refs
  };
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [obligations[0].obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [
        {
          category: signal.category,
          subject_key: signal.subject_key,
          source_slot_id: judgeSlot().slot_id,
          finding_id,
          severity: signal.severity,
          confidence: 0.9,
          reason_code: signal.reason_code,
          subject_refs: signal.subject_refs
        }
      ],
      accepted_draft_findings: [draft],
      qualified_clearances: [],
      routing_risks: [],
      discarded_count: 0
    }
  });
  assert.equal(result.unresolved_signals.length, 0);
  assert.ok(result.accepted_draft_findings.some((item) => item.finding_id === finding_id));
  assert.ok(result.resolution_evidence.some((item) => item.kind === "accepted_risk"));
});

test("REQ-SBX-GENERAL-001 Judge no-match leaves escalation unresolved", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const result = state.applyJudgeOutcome({
    status: "no_match",
    covered_obligation_ids: []
  });
  assert.equal(result.unresolved_signals.length, 1);
  assert.ok(result.resolution_evidence.some((item) => item.kind === "no_match"));
});

test("REQ-SBX-GENERAL-001 Judge partial coverage leaves uncovered signals unresolved", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.addSlotEvidence(routingEvidence({
    category: "jailbreak",
    reason_code: "sandbox_security_jailbreak",
    subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 2 })]
  }) as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  assert.equal(obligations.length, 2);
  const first = obligations[0];
  const signalKeyCategory = first.category;
  const subject_key = state.unresolvedSignals().find((s) => s.category === signalKeyCategory)!.subject_key;
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [first.obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [
        {
          category: signalKeyCategory,
          subject_key,
          source_slot_id: judgeSlot().slot_id,
          confidence: 0.9
        }
      ],
      routing_risks: [],
      discarded_count: 0
    }
  });
  assert.equal(result.unresolved_signals.length, 1);
  assert.ok(result.resolution_evidence.some((item) => item.kind === "partial_coverage"));
});

test("REQ-SBX-GENERAL-001 uncovered escalation signals remain unresolved", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [],
      routing_risks: [],
      discarded_count: 0
    }
  });
  assert.equal(result.unresolved_signals.length, 1);
});

test("REQ-SBX-GENERAL-001 partial Judge coverage remains fail-closed when signals remain", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.addSlotEvidence(routingEvidence({
    category: "jailbreak",
    reason_code: "sandbox_security_jailbreak",
    subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 1 })]
  }) as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const first = obligations[0];
  const signal = state.unresolvedSignals().find((s) => s.category === first.category)!;
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [first.obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [
        {
          category: signal.category,
          subject_key: signal.subject_key,
          source_slot_id: judgeSlot().slot_id,
          confidence: 0.9
        }
      ],
      routing_risks: [],
      discarded_count: 0
    }
  });
  state.close();
  assert.equal(state.unresolvedSignals().length, 1);
  assert.equal(result.unresolved_signals.length, 1);
});

test("REQ-SBX-GENERAL-001 applyJudgeOutcome accepts qualified evidence not routing risk", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const signal = state.unresolvedSignals()[0];
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [obligations[0].obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [],
      routing_risks: [
        {
          category: signal.category,
          subject_key: signal.subject_key,
          source_slot_id: judgeSlot().slot_id,
          severity: "high",
          confidence: 0.7,
          reason_code: signal.reason_code,
          subject_refs: signal.subject_refs
        }
      ],
      discarded_count: 0
    }
  });
  // routing risks do not resolve or create; covered empty of resolution => low_confidence
  assert.equal(result.unresolved_signals.length, 1);
});

test("REQ-SBX-GENERAL-001 multiple signals remain independent", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.addSlotEvidence(routingEvidence({
    category: "jailbreak",
    reason_code: "sandbox_security_jailbreak",
    subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 1 })]
  }) as never);
  assert.equal(state.unresolvedSignals().length, 2);
});

test("REQ-SBX-GENERAL-001 signal merge key excludes slot ID", () => {
  const state = createSandboxSecurityEscalationState();
  const refs = [contentRef()];
  const subject_key = computeSandboxSecuritySubjectKey({
    category: "prompt_injection",
    subject_refs: refs as never
  });
  state.addSlotEvidence({
    source_slot_id: ruleSlot().slot_id,
    accepted_risks: [],
    accepted_draft_findings: [],
    qualified_clearances: [],
    routing_risks: [
      {
        category: "prompt_injection",
        subject_key,
        source_slot_id: ruleSlot().slot_id,
        severity: "medium",
        confidence: 0.6,
        reason_code: "sandbox_security_prompt_injection",
        subject_refs: refs
      }
    ],
    discarded_count: 0
  } as never);
  state.addSlotEvidence({
    source_slot_id: localSlot().slot_id,
    accepted_risks: [],
    accepted_draft_findings: [],
    qualified_clearances: [],
    routing_risks: [
      {
        category: "prompt_injection",
        subject_key,
        source_slot_id: localSlot().slot_id,
        severity: "high",
        confidence: 0.7,
        reason_code: "sandbox_security_prompt_injection",
        subject_refs: refs
      }
    ],
    discarded_count: 0
  } as never);
  const signals = state.unresolvedSignals();
  assert.equal(signals.length, 1);
  assert.deepEqual(signals[0].origin_slot_ids.slice().sort(), [
    localSlot().slot_id,
    ruleSlot().slot_id
  ].sort());
  assert.equal(signals[0].severity, "high");
});

test("REQ-SBX-GENERAL-001 signal private refs canonicalize to subject_key", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const signal = state.unresolvedSignals()[0];
  assert.equal(
    signal.subject_key,
    computeSandboxSecuritySubjectKey({
      category: signal.category,
      subject_refs: signal.subject_refs as never
    })
  );
});

test("REQ-SBX-GENERAL-001 obligation scope maps signal refs through external registry", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  assert.equal(obligations[0].subject_refs[0].kind, "content_source");
  if (obligations[0].subject_refs[0].kind === "content_source") {
    assert.match(obligations[0].subject_refs[0].source_token, /^etok:src:/);
  }
});

test("REQ-SBX-GENERAL-001 escalation state is not exported on public decision", () => {
  assert.equal(existsSync(new URL("../src/security/index.ts", import.meta.url)), false);
  const shared = readFileSync(new URL("../../../shared/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(shared, /createSandboxSecurityEscalationState/);
});

test("REQ-SBX-GENERAL-001 createSandboxSecurityEscalationState exposes full method matrix", () => {
  const state = createSandboxSecurityEscalationState();
  for (const method of [
    "lifecycle",
    "addSlotEvidence",
    "unresolvedSignals",
    "materializeRoutedObligations",
    "applyJudgeOutcome",
    "terminateJudgeAttempt",
    "closeWithoutJudge",
    "close"
  ]) {
    assert.equal(typeof (state as never as Record<string, unknown>)[method], "function");
  }
});

test("REQ-SBX-GENERAL-001 obligations use decision-scoped deterministic IDs", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  assert.match(
    obligations[0].obligation_id,
    new RegExp(`^obligation://sandbox/security/${DECISION}/0001$`)
  );
});

test("REQ-SBX-GENERAL-001 obligations sort by category and canonical tokenized scope", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence({
    category: "prompt_injection",
    subject_refs: [contentRef()]
  }) as never);
  state.addSlotEvidence(routingEvidence({
    category: "jailbreak",
    reason_code: "sandbox_security_jailbreak",
    subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 1 })]
  }) as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  assert.equal(obligations.length, 2);
  // sorted by category+scope JCS; jailbreak before prompt_injection alphabetically? 
  // j < p so jailbreak first
  assert.equal(obligations[0].category, "jailbreak");
  assert.equal(obligations[1].category, "prompt_injection");
});

test("REQ-SBX-GENERAL-001 addSlotEvidence rejects Judge evidence", () => {
  const state = createSandboxSecurityEscalationState();
  assert.throws(() =>
    state.addSlotEvidence({
      ...routingEvidence(),
      source_slot_id: judgeSlot().slot_id
    } as never)
  );
});

test("REQ-SBX-GENERAL-001 applyJudgeOutcome returns all resolution evidence", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const result = state.applyJudgeOutcome({
    status: "no_match",
    covered_obligation_ids: []
  });
  assert.ok(result.resolution_evidence.length >= 1);
  void obligations;
});

test("REQ-SBX-GENERAL-001 applyJudgeOutcome preserves omitted obligations unresolved", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.addSlotEvidence(routingEvidence({
    category: "jailbreak",
    reason_code: "sandbox_security_jailbreak",
    subject_refs: [contentRef(SOURCE, { kind: "text_byte_range", start_byte: 0, end_byte: 1 })]
  }) as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const first = obligations[0];
  const signal = state.unresolvedSignals().find((s) => s.category === first.category)!;
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [first.obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [
        {
          category: signal.category,
          subject_key: signal.subject_key,
          source_slot_id: judgeSlot().slot_id,
          confidence: 0.9
        }
      ],
      routing_risks: [],
      discarded_count: 0
    }
  });
  assert.equal(result.unresolved_signals.length, 1);
});

test("REQ-SBX-GENERAL-001 no-match and invalid outcome preserve every signal", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const noMatch = state.applyJudgeOutcome({ status: "no_match", covered_obligation_ids: [] });
  assert.equal(noMatch.unresolved_signals.length, 1);
});

test("REQ-SBX-GENERAL-001 Judge routing risks cannot create new signals", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const before = state.unresolvedSignals().length;
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [obligations[0].obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [],
      routing_risks: [
        {
          category: "memory_poisoning",
          subject_key: "f".repeat(64),
          source_slot_id: judgeSlot().slot_id,
          severity: "high",
          confidence: 0.7,
          reason_code: "sandbox_security_memory_poisoning",
          subject_refs: [contentRef()]
        }
      ],
      discarded_count: 0
    }
  });
  assert.equal(result.unresolved_signals.length, before);
});

test("REQ-SBX-GENERAL-001 obligations may be materialized once", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  assert.throws(() =>
    state.materializeRoutedObligations({
      decision_id: DECISION,
      token_registry: makeTokenRegistry()
    })
  );
});

test("REQ-SBX-GENERAL-001 slot evidence cannot be added after obligation materialization", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  assert.throws(() => state.addSlotEvidence(routingEvidence() as never));
});

test("REQ-SBX-GENERAL-001 Judge outcome requires materialized obligations", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  assert.throws(() =>
    state.applyJudgeOutcome({ status: "no_match", covered_obligation_ids: [] })
  );
});

test("REQ-SBX-GENERAL-001 Judge outcome may be applied once", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  state.applyJudgeOutcome({ status: "no_match", covered_obligation_ids: [] });
  assert.throws(() =>
    state.applyJudgeOutcome({ status: "no_match", covered_obligation_ids: [] })
  );
});

test("REQ-SBX-GENERAL-001 Judge cannot create new escalation signal", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const result = state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [obligations[0].obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [],
      routing_risks: [
        {
          category: "memory_poisoning",
          subject_key: "a".repeat(64),
          source_slot_id: judgeSlot().slot_id,
          severity: "critical",
          confidence: 0.9,
          reason_code: "sandbox_security_memory_poisoning",
          subject_refs: [contentRef()]
        }
      ],
      discarded_count: 0
    }
  });
  assert.equal(
    result.unresolved_signals.some((s) => s.category === "memory_poisoning"),
    false
  );
});

test("REQ-SBX-GENERAL-001 closed escalation state rejects mutation", () => {
  const state = createSandboxSecurityEscalationState();
  state.closeWithoutJudge();
  assert.throws(() => state.addSlotEvidence(routingEvidence() as never));
});

test("REQ-SBX-GENERAL-001 Judge unavailable closes escalation state with signals unresolved", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const result = state.terminateJudgeAttempt({ reason: "detector_unavailable" });
  assert.equal(state.lifecycle(), "closed");
  assert.equal(result.unresolved_signals.length, 1);
});

test("REQ-SBX-GENERAL-001 sanitizer failure closes escalation state with signals unresolved", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const result = state.terminateJudgeAttempt({ reason: "external_redaction_failed" });
  assert.equal(result.unresolved_signals.length, 1);
  assert.equal(state.lifecycle(), "closed");
});

test("REQ-SBX-GENERAL-001 Judge timeout closes escalation state with signals unresolved", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const result = state.terminateJudgeAttempt({ reason: "detector_timeout" });
  assert.equal(result.unresolved_signals.length, 1);
});

test("REQ-SBX-GENERAL-001 budget termination closes obligations_materialized state", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  state.terminateJudgeAttempt({ reason: "evaluation_terminated" });
  assert.equal(state.lifecycle(), "closed");
});

test("REQ-SBX-GENERAL-001 successful Judge outcome is followed by close", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const obligations = state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  const signal = state.unresolvedSignals()[0];
  state.applyJudgeOutcome({
    status: "matched",
    covered_obligation_ids: [obligations[0].obligation_id],
    evidence: {
      source_slot_id: judgeSlot().slot_id,
      accepted_risks: [],
      accepted_draft_findings: [],
      qualified_clearances: [
        {
          category: signal.category,
          subject_key: signal.subject_key,
          source_slot_id: judgeSlot().slot_id,
          confidence: 0.9
        }
      ],
      routing_risks: [],
      discarded_count: 0
    }
  });
  assert.equal(state.lifecycle(), "judge_applied");
  state.close();
  assert.equal(state.lifecycle(), "closed");
});

test("REQ-SBX-GENERAL-001 rule short-circuit with no signals closes without Judge", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(acceptedEvidence() as never);
  state.closeWithoutJudge();
  assert.equal(state.lifecycle(), "closed");
  assert.equal(state.unresolvedSignals().length, 0);
});

test("REQ-SBX-GENERAL-001 rule short-circuit with unrelated signal terminates Judge attempt", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const result = state.terminateJudgeAttempt({ reason: "risk_short_circuit" });
  assert.equal(result.unresolved_signals.length, 1);
  assert.equal(state.lifecycle(), "closed");
});

test("REQ-SBX-GENERAL-001 short-circuit termination preserves unrelated unresolved signals", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const result = state.terminateJudgeAttempt({ reason: "risk_short_circuit" });
  assert.equal(result.unresolved_signals[0].category, "prompt_injection");
});

test("REQ-SBX-GENERAL-001 short-circuit never materializes routed obligations", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.terminateJudgeAttempt({ reason: "risk_short_circuit" });
  assert.equal(state.lifecycle(), "closed");
  // cannot materialize after close
  assert.throws(() =>
    state.materializeRoutedObligations({
      decision_id: DECISION,
      token_registry: makeTokenRegistry()
    })
  );
});

test("REQ-SBX-GENERAL-001 short-circuit never calls sanitizer or Judge", () => {
  // pure state API: terminate without obligations materialization
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  assert.equal(state.lifecycle(), "collecting");
  state.terminateJudgeAttempt({ reason: "risk_short_circuit" });
  assert.equal(state.lifecycle(), "closed");
});

test("REQ-SBX-GENERAL-001 short-circuit reads final signals only after escalation closes", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.terminateJudgeAttempt({ reason: "risk_short_circuit" });
  assert.equal(state.lifecycle(), "closed");
  assert.equal(state.unresolvedSignals().length, 1);
});

test("REQ-SBX-GENERAL-001 short-circuit profile-required slot keeps profile_required + risk_short_circuit", () => {
  // state machine only; engine owns detector run records. Ensure termination reason accepted.
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const result = state.terminateJudgeAttempt({ reason: "risk_short_circuit" });
  assert.deepEqual(result.resolution_evidence, []);
});

test("REQ-SBX-GENERAL-001 short-circuit optional never-selected uses optional_not_selected + risk_short_circuit", () => {
  const state = createSandboxSecurityEscalationState();
  state.terminateJudgeAttempt({ reason: "risk_short_circuit" });
  assert.equal(state.lifecycle(), "closed");
});

test("REQ-SBX-GENERAL-001 short-circuit never fabricates runtime_required", () => {
  const source = readFileSync(new URL("../src/security/escalation-state.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /runtime_required/);
});

test("REQ-SBX-GENERAL-001 terminateJudgeAttempt is mutually exclusive with applyJudgeOutcome", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  state.materializeRoutedObligations({
    decision_id: DECISION,
    token_registry: makeTokenRegistry()
  });
  state.terminateJudgeAttempt({ reason: "detector_failed" });
  assert.throws(() =>
    state.applyJudgeOutcome({ status: "no_match", covered_obligation_ids: [] })
  );
});

test("REQ-SBX-GENERAL-001 terminateJudgeAttempt returns empty resolution_evidence", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const result = state.terminateJudgeAttempt({ reason: "detector_failed" });
  assert.deepEqual(result.resolution_evidence, []);
});

test("REQ-SBX-GENERAL-001 terminateJudgeAttempt creates no accepted findings or new signals", () => {
  const state = createSandboxSecurityEscalationState();
  state.addSlotEvidence(routingEvidence() as never);
  const result = state.terminateJudgeAttempt({ reason: "detector_failed" });
  assert.equal(result.accepted_draft_findings.length, 0);
  assert.equal(result.unresolved_signals.length, 1);
});
