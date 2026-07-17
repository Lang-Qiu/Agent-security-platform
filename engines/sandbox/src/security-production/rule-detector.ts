import type {
  RawLocalDetector,
  SandboxSecurityCandidateSubjectRef,
  SandboxSecurityRawDetectorResult,
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecurityRiskCandidate
} from "../security/index.ts";
import {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG
} from "./rule-catalog.ts";

type Rule = (typeof SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG)[number];
type Condition = Rule["expression"]["conditions"][number];
type Comparison = Condition["comparison"];
type SourceType = SandboxSecurityRawDetectorSnapshot["contents"][number]["source_type"];

interface SourceProjection {
  readonly subject_record: object;
  readonly source_type: SourceType;
  readonly text_values: readonly string[];
  readonly json_keys: readonly string[];
}

interface ToolProjection {
  readonly subject_record: object;
  readonly tool_name: string;
  readonly target?: string;
  readonly argument_keys: readonly string[];
}

interface DetectorProjection {
  readonly stage: SandboxSecurityRawDetectorSnapshot["stage"];
  readonly sources: readonly SourceProjection[];
  readonly tool?: ToolProjection;
}

interface CrossSourceMatch {
  readonly matched: boolean;
  readonly sources: readonly SourceProjection[];
}

const SOURCE_TYPES: readonly SourceType[] = [
  "system_instruction",
  "developer_instruction",
  "user_input",
  "retrieved_content",
  "memory_content",
  "model_output"
];

const STAGES: readonly DetectorProjection["stage"][] = [
  "user_input",
  "model_output",
  "tool_request"
];

const TOKEN_CHARACTER = /[\p{L}\p{N}_]/u;

function invariant(): never {
  throw new TypeError("sandbox security production rule detector invariant");
}

function isRecord(value: unknown): value is object {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function dataProperty(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    invariant();
  }
  return descriptor.value;
}

function optionalDataProperty(record: object, key: string): unknown | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined) {
    return undefined;
  }
  if (!("value" in descriptor)) {
    invariant();
  }
  return descriptor.value;
}

function assertDenseStandardArray(value: unknown, maximum: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum
  ) {
    invariant();
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      invariant();
    }
  }
  return value;
}

function collectJsonProjection(
  value: unknown,
  textValues: string[],
  keys: string[],
  seen: WeakSet<object>
): void {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string") {
      textValues.push(value);
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invariant();
    }
    return;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) {
    invariant();
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const array = assertDenseStandardArray(value, 2048);
    for (const item of array) {
      collectJsonProjection(item, textValues, keys, seen);
    }
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    invariant();
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      invariant();
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      invariant();
    }
    keys.push(key);
    collectJsonProjection(descriptor.value, textValues, keys, seen);
  }
}

function sourceProjection(value: unknown): SourceProjection {
  if (!isRecord(value)) {
    invariant();
  }
  const sourceType = dataProperty(value, "source_type");
  const mediaType = dataProperty(value, "media_type");
  const sourceValue = dataProperty(value, "value");
  if (typeof sourceType !== "string" || !SOURCE_TYPES.includes(sourceType as SourceType)) {
    invariant();
  }

  const textValues: string[] = [];
  const jsonKeys: string[] = [];
  if (mediaType === "text/plain") {
    if (typeof sourceValue !== "string") {
      invariant();
    }
    textValues.push(sourceValue);
  } else if (mediaType === "application/json") {
    collectJsonProjection(sourceValue, textValues, jsonKeys, new WeakSet());
  } else {
    invariant();
  }

  return Object.freeze({
    subject_record: value,
    source_type: sourceType as SourceType,
    text_values: Object.freeze(textValues),
    json_keys: Object.freeze(jsonKeys)
  });
}

function toolProjection(value: unknown): ToolProjection {
  if (!isRecord(value)) {
    invariant();
  }
  const toolName = dataProperty(value, "tool_name");
  const argumentsValue = dataProperty(value, "arguments");
  const hasTarget = dataProperty(value, "has_target");
  const target = optionalDataProperty(value, "target");
  if (
    typeof toolName !== "string" ||
    typeof hasTarget !== "boolean" ||
    hasTarget !== (target !== undefined) ||
    (target !== undefined && typeof target !== "string")
  ) {
    invariant();
  }

  const argumentKeys: string[] = [];
  collectJsonProjection(argumentsValue, [], argumentKeys, new WeakSet());
  return Object.freeze({
    subject_record: value,
    tool_name: toolName,
    ...(target !== undefined ? { target } : {}),
    argument_keys: Object.freeze(argumentKeys)
  });
}

function buildProjection(snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>): DetectorProjection {
  if (!isRecord(snapshot)) {
    invariant();
  }
  const stage = dataProperty(snapshot, "stage");
  if (typeof stage !== "string" || !STAGES.includes(stage as DetectorProjection["stage"])) {
    invariant();
  }
  const contents = assertDenseStandardArray(dataProperty(snapshot, "contents"), 64);
  if (contents.length === 0) {
    invariant();
  }
  const sources = Object.freeze(contents.map(sourceProjection));
  const toolValue = optionalDataProperty(snapshot, "tool_request");
  if (stage === "tool_request" && toolValue === undefined) {
    invariant();
  }
  if (stage !== "tool_request" && toolValue !== undefined) {
    invariant();
  }
  return Object.freeze({
    stage: stage as DetectorProjection["stage"],
    sources,
    ...(toolValue !== undefined ? { tool: toolProjection(toolValue) } : {})
  });
}

function comparisonText(value: string, comparison: Comparison): string {
  const normalized = value.normalize("NFKC");
  if (comparison === "nfkc_exact") {
    return normalized;
  }
  if (comparison === "nfkc_casefold") {
    return normalized
      .replaceAll("\u00df", "ss")
      .replaceAll("\u1e9e", "ss")
      .replaceAll("\u03c2", "\u03c3")
      .toLowerCase()
      .toUpperCase()
      .toLowerCase();
  }
  return invariant();
}

function containsToken(text: string, token: string): boolean {
  let start = text.indexOf(token);
  while (start !== -1) {
    const before = start === 0 ? "" : text[start - 1] ?? "";
    const end = start + token.length;
    const after = end === text.length ? "" : text[end] ?? "";
    if (!TOKEN_CHARACTER.test(before) && !TOKEN_CHARACTER.test(after)) {
      return true;
    }
    start = text.indexOf(token, start + 1);
  }
  return false;
}

function containsOrderedSequence(text: string, sequence: readonly string[]): boolean {
  let offset = 0;
  for (const item of sequence) {
    const index = text.indexOf(item, offset);
    if (index === -1) {
      return false;
    }
    offset = index + item.length;
  }
  return true;
}

function anyEquivalent(
  actualValues: readonly string[],
  expectedValues: readonly string[],
  comparison: Comparison
): boolean {
  const expected = expectedValues.map((value) => comparisonText(value, comparison));
  return actualValues.some((actual) =>
    expected.includes(comparisonText(actual, comparison))
  );
}

function sourceConditionMatches(
  condition: Condition,
  source: SourceProjection
): boolean {
  switch (condition.operator) {
    case "text_contains_token":
      return source.text_values.some((value) => {
        const text = comparisonText(value, condition.comparison);
        return condition.tokens.some((token) =>
          containsToken(text, comparisonText(token, condition.comparison))
        );
      });
    case "text_contains_phrase":
      return source.text_values.some((value) => {
        const text = comparisonText(value, condition.comparison);
        return condition.phrases.some((phrase) =>
          text.includes(comparisonText(phrase, condition.comparison))
        );
      });
    case "text_ordered_sequence":
      return source.text_values.some((value) =>
        containsOrderedSequence(
          comparisonText(value, condition.comparison),
          condition.sequence.map((item) => comparisonText(item, condition.comparison))
        )
      );
    case "json_key_present":
      return anyEquivalent(source.json_keys, condition.keys, condition.comparison);
    case "json_string_contains":
      return source.text_values.some((value) => {
        const text = comparisonText(value, condition.comparison);
        return condition.values.some((item) =>
          text.includes(comparisonText(item, condition.comparison))
        );
      });
    case "tool_name_equals":
    case "target_scheme_equals":
    case "argument_key_present":
    case "cross_source_ordered_sequence":
      return invariant();
  }
}

function validScheme(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const first = value.charCodeAt(0);
  if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122))) {
    return false;
  }
  for (let index = 1; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const allowed =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 45 ||
      code === 46;
    if (!allowed) {
      return false;
    }
  }
  return true;
}

function targetScheme(target: string, comparison: Comparison): string | null {
  const normalized = comparisonText(target, comparison);
  const separator = normalized.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const scheme = normalized.slice(0, separator);
  return validScheme(scheme) ? scheme : null;
}

function toolConditionMatches(condition: Condition, tool: ToolProjection): boolean {
  switch (condition.operator) {
    case "tool_name_equals":
      return anyEquivalent([tool.tool_name], condition.names, condition.comparison);
    case "target_scheme_equals": {
      if (tool.target === undefined) {
        return false;
      }
      const scheme = targetScheme(tool.target, condition.comparison);
      return (
        scheme !== null &&
        condition.schemes.some(
          (item) => scheme === comparisonText(item, condition.comparison)
        )
      );
    }
    case "argument_key_present":
      return anyEquivalent(
        tool.argument_keys,
        condition.keys,
        condition.comparison
      );
    case "text_contains_token":
    case "text_contains_phrase":
    case "text_ordered_sequence":
    case "json_key_present":
    case "json_string_contains":
    case "cross_source_ordered_sequence":
      return invariant();
  }
}

function expressionMatches(
  rule: Rule,
  evaluate: (condition: Condition) => boolean
): boolean {
  const outcomes = rule.expression.conditions.map(evaluate);
  if (rule.expression.match === "all") {
    return outcomes.every(Boolean);
  }
  if (rule.expression.match === "any") {
    return outcomes.some(Boolean);
  }
  return invariant();
}

function crossSourceCondition(
  condition: Condition,
  sources: readonly SourceProjection[]
): CrossSourceMatch {
  if (condition.operator !== "cross_source_ordered_sequence") {
    return invariant();
  }
  const sequence = condition.sequence.map((item) =>
    comparisonText(item, condition.comparison)
  );
  const sourceTexts = sources.map((source) =>
    comparisonText(source.text_values.join("\n"), condition.comparison)
  );
  const matchedSources: SourceProjection[] = [];
  let sourceIndex = 0;
  let offset = 0;
  for (const item of sequence) {
    let found = false;
    while (sourceIndex < sources.length) {
      const index = sourceTexts[sourceIndex]!.indexOf(item, offset);
      if (index !== -1) {
        const source = sources[sourceIndex]!;
        if (matchedSources.at(-1) !== source) {
          matchedSources.push(source);
        }
        offset = index + item.length;
        found = true;
        break;
      }
      sourceIndex += 1;
      offset = 0;
    }
    if (!found) {
      return { matched: false, sources: Object.freeze([]) };
    }
  }
  return {
    matched: matchedSources.length >= 2,
    sources: Object.freeze(matchedSources)
  };
}

function crossSourceExpression(
  rule: Rule,
  sources: readonly SourceProjection[]
): CrossSourceMatch {
  const outcomes = rule.expression.conditions.map((condition) =>
    crossSourceCondition(condition, sources)
  );
  const matched =
    rule.expression.match === "all"
      ? outcomes.every((outcome) => outcome.matched)
      : rule.expression.match === "any"
        ? outcomes.some((outcome) => outcome.matched)
        : invariant();
  if (!matched) {
    return { matched: false, sources: Object.freeze([]) };
  }
  const selected =
    rule.expression.match === "all"
      ? outcomes
      : outcomes.filter((outcome) => outcome.matched);
  const unique = new Set<SourceProjection>();
  for (const outcome of selected) {
    for (const source of outcome.sources) {
      unique.add(source);
    }
  }
  return { matched: true, sources: Object.freeze([...unique].slice(0, 8)) };
}

function proveWholeSource(record: object): void {
  const bytes = dataProperty(record, "original_utf8_bytes");
  const array = assertDenseStandardArray(bytes, 512 * 1024);
  for (const byte of array) {
    if (
      typeof byte !== "number" ||
      !Number.isInteger(byte) ||
      byte < 0 ||
      byte > 255
    ) {
      invariant();
    }
  }
}

function contentSubject(source: SourceProjection): SandboxSecurityCandidateSubjectRef {
  proveWholeSource(source.subject_record);
  return Object.freeze({
    kind: "content_source",
    source_handle: dataProperty(source.subject_record, "source_handle") as string,
    locator: Object.freeze({ kind: "whole_source" })
  });
}

function toolSubject(
  tool: ToolProjection,
  strategy: Rule["subject_strategy"]
): SandboxSecurityCandidateSubjectRef {
  const callHandle = dataProperty(tool.subject_record, "call_handle") as string;
  if (strategy === "tool_name" || strategy === "target") {
    return Object.freeze({
      kind: "tool_request",
      call_handle: callHandle,
      component: strategy
    });
  }
  if (strategy === "whole_arguments") {
    return Object.freeze({
      kind: "tool_request",
      call_handle: callHandle,
      component: "arguments",
      locator: Object.freeze({ kind: "whole_arguments" })
    });
  }
  return invariant();
}

function candidate(
  rule: Rule,
  subjectRefs: readonly SandboxSecurityCandidateSubjectRef[]
): SandboxSecurityRiskCandidate {
  if (subjectRefs.length === 0 || subjectRefs.length > 8) {
    invariant();
  }
  return Object.freeze({
    category: rule.category,
    severity: rule.severity,
    confidence: rule.confidence,
    reason_code: rule.reason_code,
    subject_refs: Object.freeze([...subjectRefs]) as SandboxSecurityCandidateSubjectRef[]
  });
}

function evaluateRule(
  rule: Rule,
  projection: DetectorProjection
): SandboxSecurityRiskCandidate | null {
  if (!rule.supported_stages.includes(projection.stage)) {
    return null;
  }
  const sources = projection.sources.filter((source) =>
    rule.supported_source_types.includes(source.source_type)
  );
  if (sources.length === 0) {
    return null;
  }

  if (rule.subject_strategy === "whole_source") {
    const matched = sources.filter((source) =>
      expressionMatches(rule, (condition) => sourceConditionMatches(condition, source))
    );
    return matched.length === 0
      ? null
      : candidate(rule, matched.slice(0, 8).map(contentSubject));
  }
  if (rule.subject_strategy === "ordered_sources") {
    const outcome = crossSourceExpression(rule, sources);
    return outcome.matched
      ? candidate(rule, outcome.sources.map(contentSubject))
      : null;
  }
  if (projection.tool === undefined) {
    return invariant();
  }
  return expressionMatches(rule, (condition) =>
    toolConditionMatches(condition, projection.tool!)
  )
    ? candidate(rule, [toolSubject(projection.tool, rule.subject_strategy)])
    : null;
}

function freezeResult(
  candidates: readonly SandboxSecurityRiskCandidate[]
): SandboxSecurityRawDetectorResult {
  if (candidates.length > 32) {
    invariant();
  }
  return Object.freeze({
    candidates: Object.freeze([...candidates]) as SandboxSecurityRiskCandidate[],
    clearances: Object.freeze([]) as []
  });
}

export function createSandboxSecurityProductionRuleDetector(): RawLocalDetector {
  return Object.freeze({
    async detect(
      snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
      signal: AbortSignal
    ): Promise<SandboxSecurityRawDetectorResult> {
      signal.throwIfAborted();
      const projection = buildProjection(snapshot);
      const candidates: SandboxSecurityRiskCandidate[] = [];
      for (const rule of SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG) {
        const matched = evaluateRule(rule, projection);
        if (matched !== null) {
          candidates.push(matched);
        }
      }
      return freezeResult(candidates);
    }
  });
}
