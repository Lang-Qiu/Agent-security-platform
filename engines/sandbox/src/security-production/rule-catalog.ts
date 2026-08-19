import type {
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecurityRiskCandidate
} from "../security/index.ts";

export const SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION =
  "sandbox-security-rule-catalog.v1" as const;

type SandboxSecurityRiskCategory = SandboxSecurityRiskCandidate["category"];
type SandboxSecurityReasonCode = SandboxSecurityRiskCandidate["reason_code"];
type SandboxSecuritySeverity = SandboxSecurityRiskCandidate["severity"];
type SandboxSecurityStage = SandboxSecurityRawDetectorSnapshot["stage"];
type SandboxSecuritySourceType =
  SandboxSecurityRawDetectorSnapshot["contents"][number]["source_type"];

export type SandboxSecurityProductionRuleConfidence = 0.6 | 0.8 | 1;
export type SandboxSecurityProductionRuleComparison =
  | "nfkc_exact"
  | "nfkc_casefold";
export type SandboxSecurityProductionRuleSubjectStrategy =
  | "whole_source"
  | "whole_arguments"
  | "tool_name"
  | "target"
  | "ordered_sources";

export type SandboxSecurityProductionRuleOperator =
  | "text_contains_token"
  | "text_contains_phrase"
  | "text_ordered_sequence"
  | "json_key_present"
  | "json_string_contains"
  | "tool_name_equals"
  | "target_scheme_equals"
  | "argument_key_present"
  | "cross_source_ordered_sequence";

interface TextContainsTokenCondition {
  readonly operator: "text_contains_token";
  readonly tokens: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

interface TextContainsPhraseCondition {
  readonly operator: "text_contains_phrase";
  readonly phrases: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

interface TextOrderedSequenceCondition {
  readonly operator: "text_ordered_sequence";
  readonly sequence: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

interface JsonKeyPresentCondition {
  readonly operator: "json_key_present";
  readonly keys: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

interface JsonStringContainsCondition {
  readonly operator: "json_string_contains";
  readonly values: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

interface ToolNameEqualsCondition {
  readonly operator: "tool_name_equals";
  readonly names: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

interface TargetSchemeEqualsCondition {
  readonly operator: "target_scheme_equals";
  readonly schemes: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

interface ArgumentKeyPresentCondition {
  readonly operator: "argument_key_present";
  readonly keys: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

interface CrossSourceOrderedSequenceCondition {
  readonly operator: "cross_source_ordered_sequence";
  readonly sequence: readonly string[];
  readonly comparison: SandboxSecurityProductionRuleComparison;
}

export type SandboxSecurityProductionRuleCondition =
  | TextContainsTokenCondition
  | TextContainsPhraseCondition
  | TextOrderedSequenceCondition
  | JsonKeyPresentCondition
  | JsonStringContainsCondition
  | ToolNameEqualsCondition
  | TargetSchemeEqualsCondition
  | ArgumentKeyPresentCondition
  | CrossSourceOrderedSequenceCondition;

export interface SandboxSecurityProductionRuleExpression {
  readonly match: "all" | "any";
  readonly conditions: readonly SandboxSecurityProductionRuleCondition[];
}

export interface SandboxSecurityProductionRuleDescriptor {
  readonly rule_id: string;
  readonly category: SandboxSecurityRiskCategory;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly supported_stages: readonly SandboxSecurityStage[];
  readonly supported_source_types: readonly SandboxSecuritySourceType[];
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: SandboxSecurityProductionRuleConfidence;
  readonly subject_strategy: SandboxSecurityProductionRuleSubjectStrategy;
  readonly expression: SandboxSecurityProductionRuleExpression;
}

const STAGES: readonly SandboxSecurityStage[] = [
  "user_input",
  "model_output",
  "tool_request"
];

const SOURCE_TYPES: readonly SandboxSecuritySourceType[] = [
  "system_instruction",
  "developer_instruction",
  "user_input",
  "retrieved_content",
  "memory_content",
  "model_output"
];

const CATEGORIES: readonly SandboxSecurityRiskCategory[] = [
  "prompt_injection",
  "jailbreak",
  "instruction_override",
  "privilege_escalation",
  "sensitive_data_exposure",
  "tool_hijacking",
  "unsafe_side_effect",
  "memory_poisoning",
  "trust_boundary_violation"
];

const SEVERITIES: readonly SandboxSecuritySeverity[] = [
  "low",
  "medium",
  "high",
  "critical"
];

const OPERATORS: readonly SandboxSecurityProductionRuleOperator[] = [
  "text_contains_token",
  "text_contains_phrase",
  "text_ordered_sequence",
  "json_key_present",
  "json_string_contains",
  "tool_name_equals",
  "target_scheme_equals",
  "argument_key_present",
  "cross_source_ordered_sequence"
];

const SUBJECT_STRATEGIES: readonly SandboxSecurityProductionRuleSubjectStrategy[] = [
  "whole_source",
  "whole_arguments",
  "tool_name",
  "target",
  "ordered_sources"
];

const TOOL_FIELD_SUBJECT_STRATEGIES: readonly SandboxSecurityProductionRuleSubjectStrategy[] = [
  "whole_arguments",
  "tool_name",
  "target"
];

const COMPARISONS: readonly SandboxSecurityProductionRuleComparison[] = [
  "nfkc_exact",
  "nfkc_casefold"
];

const OPERATOR_SCHEMAS: Readonly<
  Record<
    SandboxSecurityProductionRuleOperator,
    Readonly<{
      readonly value_key: "tokens" | "phrases" | "sequence" | "keys" | "values" | "names" | "schemes";
      readonly subject_strategy: SandboxSecurityProductionRuleSubjectStrategy;
      readonly stages: readonly SandboxSecurityStage[];
    }>
  >
> = {
  text_contains_token: {
    value_key: "tokens",
    subject_strategy: "whole_source",
    stages: ["user_input", "model_output", "tool_request"]
  },
  text_contains_phrase: {
    value_key: "phrases",
    subject_strategy: "whole_source",
    stages: ["user_input", "model_output", "tool_request"]
  },
  text_ordered_sequence: {
    value_key: "sequence",
    subject_strategy: "whole_source",
    stages: ["user_input", "model_output", "tool_request"]
  },
  json_key_present: {
    value_key: "keys",
    subject_strategy: "whole_source",
    stages: ["user_input", "model_output", "tool_request"]
  },
  json_string_contains: {
    value_key: "values",
    subject_strategy: "whole_source",
    stages: ["user_input", "model_output", "tool_request"]
  },
  tool_name_equals: {
    value_key: "names",
    subject_strategy: "tool_name",
    stages: ["tool_request"]
  },
  target_scheme_equals: {
    value_key: "schemes",
    subject_strategy: "target",
    stages: ["tool_request"]
  },
  argument_key_present: {
    value_key: "keys",
    subject_strategy: "whole_arguments",
    stages: ["tool_request"]
  },
  cross_source_ordered_sequence: {
    value_key: "sequence",
    subject_strategy: "ordered_sources",
    stages: ["user_input", "model_output", "tool_request"]
  }
};

function invalid(message: string): never {
  throw new TypeError(`invalid sandbox security rule catalog: ${message}`);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function assertNewObject(value: object, seen: WeakSet<object>, label: string): void {
  if (seen.has(value)) {
    invalid(`${label} is cyclic or aliased`);
  }
  seen.add(value);
}

function assertPlainRecord(
  value: unknown,
  keys: readonly string[],
  seen: WeakSet<object>,
  label: string
): Record<string, unknown> {
  if (!isObject(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid(`${label} must be a plain record`);
  }
  assertNewObject(value, seen, label);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    invalid(`${label} has unknown or missing keys`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      invalid(`${label}.${key} is missing`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      invalid(`${label}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function assertDenseArray(
  value: unknown,
  min: number,
  max: number,
  seen: WeakSet<object>,
  label: string
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalid(`${label} must be a standard array`);
  }
  assertNewObject(value, seen, label);
  if (value.length < min || value.length > max) {
    invalid(`${label} length is outside the closed bound`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== value.length + 1 ||
    !ownKeys.includes("length") ||
    ownKeys.some(
      (key) =>
        key !== "length" &&
        (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)
    )
  ) {
    invalid(`${label} must be dense and have no extra properties`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      invalid(`${label}[${index}] must be an enumerable data property`);
    }
  }
  return value;
}

function assertSafeString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    invalid(`${label} must be a bounded string`);
  }
  if (
    value.trim() !== value ||
    /[\p{Cc}\p{Cs}\p{Cf}]/u.test(value) ||
    value.normalize("NFKC") !== value
  ) {
    invalid(`${label} contains unsafe or non-NFKC text`);
  }
  return value;
}

function cloneStringArray(
  value: unknown,
  seen: WeakSet<object>,
  label: string
): readonly string[] {
  const array = assertDenseArray(value, 1, 8, seen, label);
  return array.map((item, index) => assertSafeString(item, `${label}[${index}]`));
}

function assertEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    invalid(`${label} is outside its closed enum`);
  }
  return value as T;
}

function cloneEnumArray<T extends string>(
  value: unknown,
  values: readonly T[],
  min: number,
  max: number,
  seen: WeakSet<object>,
  label: string
): readonly T[] {
  const array = assertDenseArray(value, min, max, seen, label);
  const result = array.map((item, index) =>
    assertEnum(item, values, `${label}[${index}]`)
  );
  if (new Set(result).size !== result.length) {
    invalid(`${label} must not contain duplicates`);
  }
  return result;
}

function validateCondition(
  value: unknown,
  seen: WeakSet<object>,
  label: string
): SandboxSecurityProductionRuleCondition {
  if (!isObject(value)) {
    invalid(`${label} must be a condition record`);
  }
  const operatorDescriptor = Object.getOwnPropertyDescriptor(value, "operator");
  if (
    operatorDescriptor === undefined ||
    !operatorDescriptor.enumerable ||
    !("value" in operatorDescriptor)
  ) {
    invalid(`${label}.operator must be an enumerable data property`);
  }
  const operator = assertEnum(
    operatorDescriptor.value,
    OPERATORS,
    `${label}.operator`
  );
  const schema = OPERATOR_SCHEMAS[operator];
  const record = assertPlainRecord(
    value,
    ["operator", schema.value_key, "comparison"],
    seen,
    label
  );
  const comparison = assertEnum(
    record.comparison,
    COMPARISONS,
    `${label}.comparison`
  );
  const values = cloneStringArray(record[schema.value_key], seen, `${label}.${schema.value_key}`);
  switch (operator) {
    case "text_contains_token":
      return { operator, tokens: values, comparison };
    case "text_contains_phrase":
      return { operator, phrases: values, comparison };
    case "text_ordered_sequence":
      return { operator, sequence: values, comparison };
    case "json_key_present":
      return { operator, keys: values, comparison };
    case "json_string_contains":
      return { operator, values, comparison };
    case "tool_name_equals":
      return { operator, names: values, comparison };
    case "target_scheme_equals":
      return { operator, schemes: values, comparison };
    case "argument_key_present":
      return { operator, keys: values, comparison };
    case "cross_source_ordered_sequence":
      return { operator, sequence: values, comparison };
  }
}

function stageSupportsSource(
  stage: SandboxSecurityStage,
  sourceType: SandboxSecuritySourceType
): boolean {
  if (stage === "user_input") {
    return sourceType !== "model_output";
  }
  return true;
}

function validateDescriptor(
  value: unknown,
  seen: WeakSet<object>,
  label: string
): SandboxSecurityProductionRuleDescriptor {
  const record = assertPlainRecord(
    value,
    [
      "rule_id",
      "category",
      "reason_code",
      "supported_stages",
      "supported_source_types",
      "severity",
      "confidence",
      "subject_strategy",
      "expression"
    ],
    seen,
    label
  );
  const ruleId = assertSafeString(record.rule_id, `${label}.rule_id`);
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(ruleId)) {
    invalid(`${label}.rule_id is not stable`);
  }
  const category = assertEnum(record.category, CATEGORIES, `${label}.category`);
  const reasonCode = assertSafeString(record.reason_code, `${label}.reason_code`);
  if (reasonCode !== `sandbox_security_${category}`) {
    invalid(`${label}.reason_code does not match category`);
  }
  const supportedStages = cloneEnumArray(
    record.supported_stages,
    STAGES,
    1,
    STAGES.length,
    seen,
    `${label}.supported_stages`
  );
  const supportedSourceTypes = cloneEnumArray(
    record.supported_source_types,
    SOURCE_TYPES,
    1,
    SOURCE_TYPES.length,
    seen,
    `${label}.supported_source_types`
  );
  for (const stage of supportedStages) {
    for (const sourceType of supportedSourceTypes) {
      if (!stageSupportsSource(stage, sourceType)) {
        invalid(`${label} has an unsupported stage/source combination`);
      }
    }
  }
  const severity = assertEnum(record.severity, SEVERITIES, `${label}.severity`);
  if (record.confidence !== 0.6 && record.confidence !== 0.8 && record.confidence !== 1) {
    invalid(`${label}.confidence is not fixed`);
  }
  const confidence = record.confidence as SandboxSecurityProductionRuleConfidence;
  const subjectStrategy = assertEnum(
    record.subject_strategy,
    SUBJECT_STRATEGIES,
    `${label}.subject_strategy`
  );
  if (
    TOOL_FIELD_SUBJECT_STRATEGIES.includes(subjectStrategy) &&
    (supportedStages.length !== 1 ||
      supportedStages[0] !== "tool_request" ||
      supportedSourceTypes.length !== 1 ||
      supportedSourceTypes[0] !== "model_output")
  ) {
    invalid(`${label} has inconsistent tool-field applicability`);
  }
  const expressionRecord = assertPlainRecord(
    record.expression,
    ["match", "conditions"],
    seen,
    `${label}.expression`
  );
  const match = assertEnum(expressionRecord.match, ["all", "any"] as const, `${label}.expression.match`);
  const conditionValues = assertDenseArray(
    expressionRecord.conditions,
    1,
    8,
    seen,
    `${label}.expression.conditions`
  );
  const conditions = conditionValues.map((item, index) =>
    validateCondition(item, seen, `${label}.expression.conditions[${index}]`)
  );
  for (const [index, item] of conditions.entries()) {
    const schema = OPERATOR_SCHEMAS[item.operator];
    if (!supportedStages.every((stage) => schema.stages.includes(stage))) {
      invalid(`${label}.expression.conditions[${index}] is unsupported at its stages`);
    }
    if (schema.subject_strategy !== subjectStrategy) {
      invalid(`${label}.subject_strategy does not own its operator`);
    }
  }
  return {
    rule_id: ruleId,
    category,
    reason_code: reasonCode as SandboxSecurityReasonCode,
    supported_stages: supportedStages,
    supported_source_types: supportedSourceTypes,
    severity,
    confidence,
    subject_strategy: subjectStrategy,
    expression: { match, conditions }
  };
}

function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (!isObject(value) || seen.has(value)) {
    return value;
  }
  seen.add(value);
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return value;
}

export function validateSandboxSecurityProductionRuleCatalog(
  value: unknown
): readonly SandboxSecurityProductionRuleDescriptor[] {
  const seen = new WeakSet<object>();
  const catalog = assertDenseArray(value, 1, 64, seen, "catalog");
  const descriptors = catalog.map((item, index) =>
    validateDescriptor(item, seen, `catalog[${index}]`)
  );
  const ruleIds = descriptors.map((item) => item.rule_id);
  if (new Set(ruleIds).size !== ruleIds.length) {
    invalid("rule_id values must be unique");
  }
  return descriptors;
}

const descriptorData: readonly SandboxSecurityProductionRuleDescriptor[] = [
  {
    rule_id: "sandbox_security_prompt_injection_token_v1",
    category: "prompt_injection",
    reason_code: "sandbox_security_prompt_injection",
    supported_stages: ["user_input"],
    supported_source_types: ["user_input", "retrieved_content", "memory_content"],
    severity: "high",
    confidence: 0.8,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [
        { operator: "text_contains_token", tokens: ["ignore"], comparison: "nfkc_casefold" },
        { operator: "text_contains_token", tokens: ["previous"], comparison: "nfkc_casefold" },
        { operator: "text_contains_token", tokens: ["instructions"], comparison: "nfkc_casefold" }
      ]
    }
  },
  {
    rule_id: "sandbox_security_jailbreak_phrase_v1",
    category: "jailbreak",
    reason_code: "sandbox_security_jailbreak",
    supported_stages: ["user_input"],
    supported_source_types: ["user_input", "retrieved_content", "memory_content"],
    severity: "high",
    confidence: 0.8,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [
        { operator: "text_contains_phrase", phrases: ["developer mode"], comparison: "nfkc_casefold" },
        { operator: "text_contains_phrase", phrases: ["bypass safety restrictions"], comparison: "nfkc_casefold" }
      ]
    }
  },
  {
    rule_id: "sandbox_security_instruction_override_sequence_v1",
    category: "instruction_override",
    reason_code: "sandbox_security_instruction_override",
    supported_stages: ["user_input"],
    supported_source_types: ["user_input", "retrieved_content", "memory_content"],
    severity: "medium",
    confidence: 0.8,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [
        { operator: "text_ordered_sequence", sequence: ["ignore", "instructions"], comparison: "nfkc_casefold" }
      ]
    }
  },
  {
    rule_id: "sandbox_security_prompt_injection_chinese_v1",
    category: "prompt_injection",
    reason_code: "sandbox_security_prompt_injection",
    supported_stages: ["user_input"],
    supported_source_types: ["user_input", "retrieved_content", "memory_content"],
    severity: "high",
    confidence: 0.8,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [
        {
          operator: "text_contains_phrase",
          phrases: ["忽略之前的指令", "忽略上面的指令", "忽略系统指令", "忽略先前的指令"],
          comparison: "nfkc_exact"
        },
        {
          operator: "text_contains_phrase",
          phrases: ["执行我的新指令", "遵循我的新指令", "按照我接下来的指令执行", "只听从我的指令"],
          comparison: "nfkc_exact"
        }
      ]
    }
  },
  {
    rule_id: "sandbox_security_jailbreak_chinese_v1",
    category: "jailbreak",
    reason_code: "sandbox_security_jailbreak",
    supported_stages: ["user_input"],
    supported_source_types: ["user_input", "retrieved_content", "memory_content"],
    severity: "high",
    confidence: 0.8,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [
        {
          operator: "text_contains_phrase",
          phrases: ["进入开发者模式", "进入无审查模式", "进入越狱模式", "开启开发者模式"],
          comparison: "nfkc_exact"
        },
        {
          operator: "text_contains_phrase",
          phrases: ["绕过安全限制", "关闭安全限制", "绕过所有安全策略", "跳过安全审查"],
          comparison: "nfkc_exact"
        }
      ]
    }
  },
  {
    rule_id: "sandbox_security_sensitive_data_chinese_v1",
    category: "sensitive_data_exposure",
    reason_code: "sandbox_security_sensitive_data_exposure",
    supported_stages: ["user_input"],
    supported_source_types: ["user_input", "retrieved_content", "memory_content"],
    severity: "high",
    confidence: 0.8,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [
        {
          operator: "text_contains_phrase",
          phrases: ["显示", "泄露", "输出", "打印", "告诉我"],
          comparison: "nfkc_exact"
        },
        {
          operator: "text_contains_phrase",
          phrases: ["系统提示词", "系统指令", "API密钥", "API 密钥", "访问密钥", "管理员密码"],
          comparison: "nfkc_exact"
        }
      ]
    }
  },
  {
    rule_id: "sandbox_security_privilege_escalation_chinese_v1",
    category: "privilege_escalation",
    reason_code: "sandbox_security_privilege_escalation",
    supported_stages: ["user_input"],
    supported_source_types: ["user_input", "retrieved_content", "memory_content"],
    severity: "high",
    confidence: 0.8,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [
        {
          operator: "text_contains_phrase",
          phrases: ["系统管理员", "超级用户", "管理员权限", "root权限", "最高权限"],
          comparison: "nfkc_exact"
        },
        {
          operator: "text_contains_phrase",
          phrases: ["忽略权限检查", "绕过权限验证", "跳过安全策略", "不要进行权限校验"],
          comparison: "nfkc_exact"
        }
      ]
    }
  },
  {
    rule_id: "sandbox_security_sensitive_data_json_key_v1",
    category: "sensitive_data_exposure",
    reason_code: "sandbox_security_sensitive_data_exposure",
    supported_stages: ["model_output"],
    supported_source_types: ["retrieved_content", "memory_content", "model_output"],
    severity: "critical",
    confidence: 0.6,
    subject_strategy: "whole_source",
    expression: {
      match: "any",
      conditions: [
        { operator: "json_key_present", keys: ["api_key", "password"], comparison: "nfkc_exact" }
      ]
    }
  },
  {
    rule_id: "sandbox_security_memory_poisoning_text_v1",
    category: "memory_poisoning",
    reason_code: "sandbox_security_memory_poisoning",
    supported_stages: ["user_input"],
    supported_source_types: ["memory_content"],
    severity: "high",
    confidence: 0.6,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [
        { operator: "json_string_contains", values: ["persist this instruction"], comparison: "nfkc_casefold" }
      ]
    }
  },
  {
    rule_id: "sandbox_security_unsafe_side_effect_tool_v1",
    category: "unsafe_side_effect",
    reason_code: "sandbox_security_unsafe_side_effect",
    supported_stages: ["tool_request"],
    supported_source_types: ["model_output"],
    severity: "critical",
    confidence: 0.6,
    subject_strategy: "tool_name",
    expression: {
      match: "all",
      conditions: [
        { operator: "tool_name_equals", names: ["delete_file"], comparison: "nfkc_exact" }
      ]
    }
  },
  {
    rule_id: "sandbox_security_trust_boundary_target_v1",
    category: "trust_boundary_violation",
    reason_code: "sandbox_security_trust_boundary_violation",
    supported_stages: ["tool_request"],
    supported_source_types: ["model_output"],
    severity: "high",
    confidence: 0.6,
    subject_strategy: "target",
    expression: {
      match: "any",
      conditions: [
        { operator: "target_scheme_equals", schemes: ["file"], comparison: "nfkc_casefold" }
      ]
    }
  },
  {
    rule_id: "sandbox_security_privilege_escalation_argument_v1",
    category: "privilege_escalation",
    reason_code: "sandbox_security_privilege_escalation",
    supported_stages: ["tool_request"],
    supported_source_types: ["model_output"],
    severity: "critical",
    confidence: 0.6,
    subject_strategy: "whole_arguments",
    expression: {
      match: "all",
      conditions: [
        { operator: "argument_key_present", keys: ["sudo"], comparison: "nfkc_exact" }
      ]
    }
  },
  {
    rule_id: "sandbox_security_tool_hijacking_cross_source_v1",
    category: "tool_hijacking",
    reason_code: "sandbox_security_tool_hijacking",
    supported_stages: ["tool_request"],
    supported_source_types: ["user_input", "retrieved_content"],
    severity: "high",
    confidence: 0.6,
    subject_strategy: "ordered_sources",
    expression: {
      match: "all",
      conditions: [
        { operator: "cross_source_ordered_sequence", sequence: ["use", "tool"], comparison: "nfkc_casefold" }
      ]
    }
  }
];

export const SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG: readonly SandboxSecurityProductionRuleDescriptor[] =
  deepFreeze(validateSandboxSecurityProductionRuleCatalog(descriptorData));
