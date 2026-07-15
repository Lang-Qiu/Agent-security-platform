import {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson
} from "./canonical-json.ts";
import type {
  SandboxSecurityCandidateSubjectRef
} from "./detector-contract.ts";
import type {
  SandboxSecurityNormalizedSlotResult
} from "./detector-output-boundary.ts";
import type {
  SandboxSecurityCallHandle,
  SandboxSecuritySourceHandle
} from "./input-boundary.ts";
import type {
  SandboxSecurityDetectorSlotId,
  SandboxSecurityDetectorSlotManifest
} from "./policy-profiles.ts";
import {
  canonicalizeSandboxSecurityPrivateSubjectScopes,
  computeSandboxSecuritySubjectKey
} from "./subject-scope.ts";
import type {
  SandboxSecurityFinding,
  SandboxSecurityFindingSubjectRef,
  SandboxSecurityReasonCode,
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity
} from "../../../../shared/types/sandbox-security.ts";
import {
  SANDBOX_SECURITY_SEVERITIES
} from "../../../../shared/types/sandbox-security.ts";

export interface SandboxSecurityAcceptedRiskEvidence {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly finding_id: string;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
}

export interface SandboxSecurityQualifiedClearance {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly confidence: number;
}

export interface SandboxSecurityRoutingRiskEvidence {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
}

export interface SandboxSecurityDraftFinding {
  readonly finding_id: string;
  readonly detector_id: SandboxSecurityDetectorSlotId;
  readonly detector_version: string;
  readonly category: SandboxSecurityRiskCategory;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_key: string;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
}

export interface SandboxSecurityQualifiedSlotEvidence {
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly accepted_risks: readonly SandboxSecurityAcceptedRiskEvidence[];
  readonly accepted_draft_findings: readonly SandboxSecurityDraftFinding[];
  readonly qualified_clearances: readonly SandboxSecurityQualifiedClearance[];
  readonly routing_risks: readonly SandboxSecurityRoutingRiskEvidence[];
  readonly discarded_count: number;
}

export interface SandboxSecurityQualificationSubjectMap {
  readonly evaluation_nonce: string;
  readonly sources: readonly {
    readonly source_handle: SandboxSecuritySourceHandle;
  }[];
  readonly tool?: Readonly<{
    readonly call_handle: SandboxSecurityCallHandle;
  }>;
}

export interface SandboxSecurityPublicSubjectTokenMap {
  readonly decision_id: string;
  readonly sources: readonly {
    readonly source_handle: SandboxSecuritySourceHandle;
    readonly public_source_token: string;
  }[];
  readonly tool?: Readonly<{
    readonly call_handle: SandboxSecurityCallHandle;
    readonly public_call_token: string;
  }>;
}

export type SandboxSecurityAcceptedSubjectEntity =
  | {
      readonly kind: "content_source";
      readonly source_handle: SandboxSecuritySourceHandle;
    }
  | {
      readonly kind: "tool_request";
      readonly call_handle: SandboxSecurityCallHandle;
    };

const RULE_CONFIDENCES = new Set([0.6, 0.8, 1.0]);
const SEVERITY_RANK: Record<SandboxSecuritySeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function assertPrivateRefs(
  refs: readonly SandboxSecurityCandidateSubjectRef[],
  subject_map: Readonly<SandboxSecurityQualificationSubjectMap>
): readonly SandboxSecurityCandidateSubjectRef[] {
  const sourceHandles = new Set(
    subject_map.sources.map((item) => item.source_handle)
  );
  const callHandle = subject_map.tool?.call_handle;
  const canonical = canonicalizeSandboxSecurityPrivateSubjectScopes(refs);
  for (const scope of canonical) {
    if (scope.kind === "content_source") {
      if (!sourceHandles.has(scope.source_handle)) {
        throw new Error("sandbox_security_qualification_invalid:source_handle");
      }
      if (
        scope.source_handle.startsWith("etok:") ||
        scope.source_handle.startsWith("source://")
      ) {
        throw new Error("sandbox_security_qualification_invalid:public_token");
      }
    } else {
      if (!callHandle || scope.call_handle !== callHandle) {
        throw new Error("sandbox_security_qualification_invalid:call_handle");
      }
      if (
        scope.call_handle.startsWith("etok:") ||
        scope.call_handle.startsWith("call://")
      ) {
        throw new Error("sandbox_security_qualification_invalid:public_token");
      }
    }
  }
  return refs;
}

function uniquenessKey(input: {
  readonly slot_id: string;
  readonly category: string;
  readonly reason_code: string;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
}): string {
  const scopes = canonicalizeSandboxSecurityPrivateSubjectScopes(
    input.subject_refs
  );
  return canonicalizeSandboxSecurityJson({
    slot_id: input.slot_id,
    category: input.category,
    reason_code: input.reason_code,
    subjects: scopes
  });
}

function findingId(input: {
  readonly decision_id: string;
  readonly uniqueness_key: string;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
}): string {
  const digest = sha256CanonicalJson({
    decision_id: input.decision_id,
    uniqueness_key: input.uniqueness_key,
    severity: input.severity,
    confidence: input.confidence
  });
  return `finding:sha256:${digest}`;
}

function subjectKeyFor(
  category: SandboxSecurityRiskCategory,
  subject_refs: readonly SandboxSecurityCandidateSubjectRef[]
): string {
  return computeSandboxSecuritySubjectKey({ category, subject_refs });
}

export function qualifySandboxSecuritySlotEvidence(input: {
  slot: Readonly<SandboxSecurityDetectorSlotManifest>;
  result: Readonly<SandboxSecurityNormalizedSlotResult>;
  decision_id: string;
  subject_map: Readonly<SandboxSecurityQualificationSubjectMap>;
}): SandboxSecurityQualifiedSlotEvidence {
  const {
    slot,
    result,
    decision_id,
    subject_map
  } = input;
  const qualification_threshold = slot.qualification_threshold;
  const routing_floor = slot.routing_floor;
  const seenCandidateKeys = new Set<string>();
  const accepted_risks: SandboxSecurityAcceptedRiskEvidence[] = [];
  const accepted_draft_findings: SandboxSecurityDraftFinding[] = [];
  const qualified_clearances: SandboxSecurityQualifiedClearance[] = [];
  const routing_risks: SandboxSecurityRoutingRiskEvidence[] = [];
  let discarded_count = 0;
  const acceptedScopeKeys = new Set<string>();

  for (const candidate of result.candidates) {
    const refs = assertPrivateRefs(candidate.subject_refs, subject_map);
    if (
      slot.detector_kind === "rule" &&
      !RULE_CONFIDENCES.has(candidate.confidence)
    ) {
      throw new Error("sandbox_security_qualification_invalid:rule_confidence");
    }
    const key = uniquenessKey({
      slot_id: slot.slot_id,
      category: candidate.category,
      reason_code: candidate.reason_code,
      subject_refs: refs
    });
    if (seenCandidateKeys.has(key)) {
      throw new Error("sandbox_security_qualification_invalid:duplicate_candidate");
    }
    seenCandidateKeys.add(key);

    const subject_key = subjectKeyFor(candidate.category, refs);
    if (candidate.confidence >= qualification_threshold) {
      const finding_id = findingId({
        decision_id,
        uniqueness_key: key,
        severity: candidate.severity,
        confidence: candidate.confidence
      });
      const draft: SandboxSecurityDraftFinding = {
        finding_id,
        detector_id: slot.slot_id,
        detector_version: slot.detector_version,
        category: candidate.category,
        severity: candidate.severity,
        confidence: candidate.confidence,
        reason_code: candidate.reason_code,
        subject_key,
        subject_refs: refs
      };
      const risk: SandboxSecurityAcceptedRiskEvidence = {
        category: candidate.category,
        subject_key,
        source_slot_id: slot.slot_id,
        finding_id,
        severity: candidate.severity,
        confidence: candidate.confidence,
        reason_code: candidate.reason_code,
        subject_refs: refs
      };
      accepted_draft_findings.push(draft);
      accepted_risks.push(risk);
      acceptedScopeKeys.add(
        canonicalizeSandboxSecurityJson({
          category: candidate.category,
          subjects: canonicalizeSandboxSecurityPrivateSubjectScopes(refs)
        })
      );
      continue;
    }
    if (candidate.confidence >= routing_floor) {
      routing_risks.push({
        category: candidate.category,
        subject_key,
        source_slot_id: slot.slot_id,
        severity: candidate.severity,
        confidence: candidate.confidence,
        reason_code: candidate.reason_code,
        subject_refs: refs
      });
      continue;
    }
    discarded_count += 1;
  }

  // routing risks must exclude accepted same-scope candidates
  const filteredRouting = routing_risks.filter((risk) => {
    const scope = canonicalizeSandboxSecurityJson({
      category: risk.category,
      subjects: canonicalizeSandboxSecurityPrivateSubjectScopes(risk.subject_refs)
    });
    return !acceptedScopeKeys.has(scope);
  });

  for (const clearance of result.clearances) {
    const refs = assertPrivateRefs(clearance.subject_refs, subject_map);
    const subject_key = subjectKeyFor(clearance.category, refs);
    if (clearance.confidence >= qualification_threshold) {
      qualified_clearances.push({
        category: clearance.category,
        subject_key,
        source_slot_id: slot.slot_id,
        confidence: clearance.confidence
      });
      continue;
    }
    // clearance below qualification never becomes routing signal; below floor discarded
    if (clearance.confidence < routing_floor) {
      discarded_count += 1;
    }
  }

  return deepFreeze({
    source_slot_id: slot.slot_id,
    accepted_risks,
    accepted_draft_findings,
    qualified_clearances,
    routing_risks: filteredRouting,
    discarded_count
  });
}

function entitySortKey(entity: SandboxSecurityAcceptedSubjectEntity): string {
  if (entity.kind === "content_source") {
    return `0:${entity.source_handle}`;
  }
  return `1:${entity.call_handle}`;
}

export function materializeSandboxSecurityPublicSubjectTokens(input: {
  readonly decision_id: string;
  readonly accepted_entities: readonly SandboxSecurityAcceptedSubjectEntity[];
}): Readonly<SandboxSecurityPublicSubjectTokenMap> {
  const seen = new Set<string>();
  const entities = [...input.accepted_entities];
  for (const entity of entities) {
    if (entity.kind === "content_source") {
      if (
        entity.source_handle.startsWith("etok:") ||
        entity.source_handle.startsWith("source://")
      ) {
        throw new Error("sandbox_security_publication_invalid:etok");
      }
      const key = `source:${entity.source_handle}`;
      if (seen.has(key)) {
        throw new Error("sandbox_security_publication_invalid:duplicate_handle");
      }
      seen.add(key);
    } else {
      if (
        entity.call_handle.startsWith("etok:") ||
        entity.call_handle.startsWith("call://")
      ) {
        throw new Error("sandbox_security_publication_invalid:etok");
      }
      const key = `call:${entity.call_handle}`;
      if (seen.has(key)) {
        throw new Error("sandbox_security_publication_invalid:duplicate_handle");
      }
      seen.add(key);
    }
  }

  entities.sort((left, right) =>
    entitySortKey(left).localeCompare(entitySortKey(right))
  );

  const sources: {
    source_handle: SandboxSecuritySourceHandle;
    public_source_token: string;
  }[] = [];
  let tool:
    | {
        call_handle: SandboxSecurityCallHandle;
        public_call_token: string;
      }
    | undefined;
  let ordinal = 1;
  for (const entity of entities) {
    const label = String(ordinal).padStart(4, "0");
    if (entity.kind === "content_source") {
      sources.push({
        source_handle: entity.source_handle,
        public_source_token: `source://sandbox/security/${input.decision_id}/${label}`
      });
    } else {
      tool = {
        call_handle: entity.call_handle,
        public_call_token: `call://sandbox/security/${input.decision_id}/${label}`
      };
    }
    ordinal += 1;
  }

  return deepFreeze({
    decision_id: input.decision_id,
    sources,
    ...(tool ? { tool } : {})
  });
}

function mapPrivateRefToPublic(
  ref: SandboxSecurityCandidateSubjectRef,
  token_map: Readonly<SandboxSecurityPublicSubjectTokenMap>
): SandboxSecurityFindingSubjectRef {
  if (ref.kind === "content_source") {
    const entry = token_map.sources.find(
      (item) => item.source_handle === ref.source_handle
    );
    if (!entry) {
      throw new Error("sandbox_security_publication_invalid:missing_source_token");
    }
    return {
      kind: "content_source",
      source_token: entry.public_source_token,
      locator: ref.locator
    };
  }
  if (!token_map.tool || token_map.tool.call_handle !== ref.call_handle) {
    throw new Error("sandbox_security_publication_invalid:missing_call_token");
  }
  if (ref.component === "arguments") {
    return {
      kind: "tool_request",
      call_token: token_map.tool.public_call_token,
      component: "arguments",
      locator: ref.locator
    };
  }
  return {
    kind: "tool_request",
    call_token: token_map.tool.public_call_token,
    component: ref.component
  };
}

function publicSubjectSortKey(ref: SandboxSecurityFindingSubjectRef): string {
  return canonicalizeSandboxSecurityJson(ref);
}

function compareFindings(left: SandboxSecurityFinding, right: SandboxSecurityFinding): number {
  const severityDelta =
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severityDelta !== 0) return severityDelta;
  const category = left.category.localeCompare(right.category);
  if (category !== 0) return category;
  const detector = left.detector_id.localeCompare(right.detector_id);
  if (detector !== 0) return detector;
  const reason = left.reason_code.localeCompare(right.reason_code);
  if (reason !== 0) return reason;
  const leftSubjects = left.subject_refs
    .map(publicSubjectSortKey)
    .sort()
    .join("|");
  const rightSubjects = right.subject_refs
    .map(publicSubjectSortKey)
    .sort()
    .join("|");
  const subjects = leftSubjects.localeCompare(rightSubjects);
  if (subjects !== 0) return subjects;
  return left.finding_id.localeCompare(right.finding_id);
}

function entitiesFromDrafts(
  draft_findings: readonly SandboxSecurityDraftFinding[]
): SandboxSecurityAcceptedSubjectEntity[] {
  const map = new Map<string, SandboxSecurityAcceptedSubjectEntity>();
  for (const draft of draft_findings) {
    for (const ref of draft.subject_refs) {
      if (ref.kind === "content_source") {
        const key = `source:${ref.source_handle}`;
        if (!map.has(key)) {
          map.set(key, {
            kind: "content_source",
            source_handle: ref.source_handle as SandboxSecuritySourceHandle
          });
        }
      } else {
        const key = `call:${ref.call_handle}`;
        if (!map.has(key)) {
          map.set(key, {
            kind: "tool_request",
            call_handle: ref.call_handle as SandboxSecurityCallHandle
          });
        }
      }
    }
  }
  return [...map.values()];
}

export function publishSandboxSecurityFindings(input: {
  readonly draft_findings: readonly SandboxSecurityDraftFinding[];
  readonly token_map: Readonly<SandboxSecurityPublicSubjectTokenMap>;
  readonly decision_id: string;
}): readonly SandboxSecurityFinding[] {
  if (input.decision_id !== input.token_map.decision_id) {
    throw new Error("sandbox_security_publication_invalid:decision_id");
  }

  // verify complete coverage of accepted entities
  const expectedEntities = entitiesFromDrafts(input.draft_findings);
  const materialized = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: input.decision_id,
    accepted_entities: expectedEntities
  });
  if (
    canonicalizeSandboxSecurityJson(materialized) !==
    canonicalizeSandboxSecurityJson(input.token_map)
  ) {
    throw new Error("sandbox_security_publication_invalid:token_map");
  }

  const findings: SandboxSecurityFinding[] = input.draft_findings.map((draft) => ({
    finding_id: draft.finding_id,
    detector_id: draft.detector_id,
    detector_version: draft.detector_version,
    category: draft.category,
    severity: draft.severity,
    confidence: draft.confidence,
    reason_code: draft.reason_code,
    subject_refs: draft.subject_refs.map((ref) =>
      mapPrivateRefToPublic(ref, input.token_map)
    ),
    evidence_refs: []
  }));

  findings.sort(compareFindings);
  for (let index = 0; index < findings.length; index += 1) {
    const ordinal = String(index + 1).padStart(4, "0");
    findings[index] = {
      ...findings[index],
      evidence_refs: [
        `evidence://sandbox/security/${input.decision_id}/${ordinal}`
      ]
    };
  }

  return deepFreeze(findings);
}

export function deriveSandboxSecurityExpectedPublication(input: {
  readonly decision_id: string;
  readonly draft_findings: readonly SandboxSecurityDraftFinding[];
}): Readonly<{
  token_map: SandboxSecurityPublicSubjectTokenMap;
  findings: readonly SandboxSecurityFinding[];
}> {
  const token_map = materializeSandboxSecurityPublicSubjectTokens({
    decision_id: input.decision_id,
    accepted_entities: entitiesFromDrafts(input.draft_findings)
  });
  const findings = publishSandboxSecurityFindings({
    decision_id: input.decision_id,
    draft_findings: input.draft_findings,
    token_map
  });
  return deepFreeze({ token_map, findings });
}

export function validateSandboxSecurityPublication(input: {
  readonly decision_id: string;
  readonly draft_findings: readonly SandboxSecurityDraftFinding[];
  readonly actual_token_map: Readonly<SandboxSecurityPublicSubjectTokenMap>;
  readonly actual_findings: readonly SandboxSecurityFinding[];
}): void {
  const expected = deriveSandboxSecurityExpectedPublication({
    decision_id: input.decision_id,
    draft_findings: input.draft_findings
  });
  if (
    canonicalizeSandboxSecurityJson(expected.token_map) !==
    canonicalizeSandboxSecurityJson(input.actual_token_map)
  ) {
    throw new Error("sandbox_security_publication_invalid:token_map");
  }
  if (
    canonicalizeSandboxSecurityJson(expected.findings) !==
    canonicalizeSandboxSecurityJson(input.actual_findings)
  ) {
    throw new Error("sandbox_security_publication_invalid:findings");
  }
}
