import {
  TRACK1_BASE_FILTER_RULES
} from "../../base-filter/rule-catalog.ts";
import {
  evaluateTrack1FilterRules
} from "../../base-filter/evaluator.ts";
import type {
  Track1FilterCategory,
  Track1FilterContextEnvelope,
  Track1FilterRule
} from "../../base-filter/contract.ts";
import type {
  SimulatedToolRequest
} from "../../simulated-tools/contract.ts";
import {
  SandboxSecurityAdapterUnsupportedError,
  type RawLocalDetector,
  type SandboxSecurityCandidateSubjectRef,
  type SandboxSecurityRawDetectorResult,
  type SandboxSecurityRawDetectorSnapshot,
  type SandboxSecurityRiskCandidate
} from "../detector-contract.ts";
import type {
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity
} from "../../../../../shared/types/sandbox-security.ts";

const CATEGORY_MAP: Record<Track1FilterCategory, SandboxSecurityRiskCategory> = {
  jailbreak: "jailbreak",
  prompt_injection: "prompt_injection",
  sensitive_data: "sensitive_data_exposure",
  tool_hijacking: "tool_hijacking",
  protected_resource: "unsafe_side_effect",
  memory_poisoning: "memory_poisoning",
  sensitive_capability: "unsafe_side_effect"
};

const SEVERITY_FROM_ACTION: Record<"alert" | "ask" | "deny", SandboxSecuritySeverity> = {
  alert: "low",
  ask: "medium",
  deny: "high"
};

function unsupported(): never {
  throw new SandboxSecurityAdapterUnsupportedError();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isPlainRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function requireMatchingTarget(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
  expectedTarget: string
): void {
  if (
    snapshot.tool_request?.has_target !== true ||
    snapshot.tool_request.target !== expectedTarget
  ) {
    unsupported();
  }
}

function mapCategory(category: Track1FilterCategory): SandboxSecurityRiskCategory {
  return CATEGORY_MAP[category];
}

function reasonFor(category: SandboxSecurityRiskCategory): `sandbox_security_${SandboxSecurityRiskCategory}` {
  return `sandbox_security_${category}`;
}

function textOf(content: SandboxSecurityRawDetectorSnapshot["contents"][number]): string {
  if (content.media_type === "text/plain") {
    return String(content.value);
  }
  return JSON.stringify(content.value);
}

function buildContext(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): {
  context: Track1FilterContextEnvelope;
  model_output: string;
  sourcesByType: Map<string, typeof snapshot.contents>;
} {
  const sourcesByType = new Map<string, Array<(typeof snapshot.contents)[number]>>();
  for (const content of snapshot.contents) {
    const list = sourcesByType.get(content.source_type) ?? [];
    list.push(content);
    sourcesByType.set(content.source_type, list);
  }

  const user = sourcesByType.get("user_input") ?? [];
  const retrieved = sourcesByType.get("retrieved_content") ?? [];
  const memory = sourcesByType.get("memory_content") ?? [];
  const model = sourcesByType.get("model_output") ?? [];

  const context: Track1FilterContextEnvelope = {
    schema_version: "track1-filter-context.v1",
    user_prompt: user[0] ? textOf(user[0]) : "",
    retrieved_content: retrieved.map((item) => textOf(item)),
    memory_entries: memory.map((item, index) => ({
      memory_id: `memory_${index + 1}`,
      content: textOf(item)
    }))
  };
  const model_output = model[0] ? textOf(model[0]) : "";
  return { context, model_output, sourcesByType };
}

function toolFromSnapshot(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): SimulatedToolRequest | undefined {
  if (!snapshot.tool_request) return undefined;
  const tool_name = snapshot.tool_request.tool_name;
  if (!isPlainRecord(snapshot.tool_request.arguments)) {
    unsupported();
  }
  const args = snapshot.tool_request.arguments;
  if (tool_name === "send_email") {
    if (
      !hasExactKeys(args, ["recipient", "subject", "body"]) ||
      !isNonEmptyString(args.recipient) ||
      !isNonEmptyString(args.subject) ||
      !isNonEmptyString(args.body)
    ) {
      unsupported();
    }
    requireMatchingTarget(snapshot, args.recipient);
    return {
      tool_name: "send_email",
      arguments: {
        recipient: args.recipient,
        subject: args.subject,
        body: args.body
      }
    } as SimulatedToolRequest;
  }
  if (tool_name === "read_file") {
    if (!hasExactKeys(args, ["path"]) || !isNonEmptyString(args.path)) {
      unsupported();
    }
    requireMatchingTarget(snapshot, args.path);
    return {
      tool_name: "read_file",
      arguments: {
        path: args.path
      }
    } as SimulatedToolRequest;
  }
  if (tool_name === "write_file") {
    if (
      !hasExactKeys(args, ["path", "content"]) ||
      !isNonEmptyString(args.path) ||
      typeof args.content !== "string"
    ) {
      unsupported();
    }
    requireMatchingTarget(snapshot, args.path);
    return {
      tool_name: "write_file",
      arguments: {
        path: args.path,
        content: args.content
      }
    } as SimulatedToolRequest;
  }
  if (tool_name !== "call_api") {
    unsupported();
  }
  const hasBody = Object.hasOwn(args, "body");
  if (
    !hasExactKeys(args, hasBody ? ["endpoint", "method", "body"] : ["endpoint", "method"]) ||
    !isNonEmptyString(args.endpoint) ||
    (args.method !== "GET" && args.method !== "POST") ||
    (hasBody && !isStringRecord(args.body))
  ) {
    unsupported();
  }
  requireMatchingTarget(snapshot, args.endpoint);
  return {
    tool_name: "call_api",
    arguments: {
      endpoint: args.endpoint,
      method: args.method,
      ...(hasBody ? { body: { ...(args.body as Record<string, string>) } } : {})
    }
  } as SimulatedToolRequest;
}

function subjectsForRule(
  rule: Track1FilterRule,
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
  sourcesByType: Map<string, readonly (typeof snapshot.contents)[number][]>
): SandboxSecurityCandidateSubjectRef[] {
  const refs: SandboxSecurityCandidateSubjectRef[] = [];
  const seen = new Set<string>();

  const push = (ref: SandboxSecurityCandidateSubjectRef, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  for (const condition of rule.conditions) {
    switch (condition.source) {
      case "user_prompt": {
        const items = sourcesByType.get("user_input") ?? [];
        if (items.length === 0) unsupported();
        for (const item of items) {
          push(
            {
              kind: "content_source",
              source_handle: item.source_handle,
              locator: { kind: "whole_source" }
            },
            `content:${item.source_handle}`
          );
        }
        break;
      }
      case "retrieved_content": {
        const items = sourcesByType.get("retrieved_content") ?? [];
        if (items.length === 0) unsupported();
        for (const item of items) {
          push(
            {
              kind: "content_source",
              source_handle: item.source_handle,
              locator: { kind: "whole_source" }
            },
            `content:${item.source_handle}`
          );
        }
        break;
      }
      case "memory_content": {
        const items = sourcesByType.get("memory_content") ?? [];
        if (items.length === 0) unsupported();
        for (const item of items) {
          push(
            {
              kind: "content_source",
              source_handle: item.source_handle,
              locator: { kind: "whole_source" }
            },
            `content:${item.source_handle}`
          );
        }
        break;
      }
      case "model_output": {
        const items = sourcesByType.get("model_output") ?? [];
        if (items.length === 0) unsupported();
        for (const item of items) {
          push(
            {
              kind: "content_source",
              source_handle: item.source_handle,
              locator: { kind: "whole_source" }
            },
            `content:${item.source_handle}`
          );
        }
        break;
      }
      case "tool_name": {
        if (!snapshot.tool_request) unsupported();
        push(
          {
            kind: "tool_request",
            call_handle: snapshot.tool_request.call_handle,
            component: "tool_name"
          },
          `tool:name:${snapshot.tool_request.call_handle}`
        );
        break;
      }
      case "tool_target": {
        if (!snapshot.tool_request) unsupported();
        if (!snapshot.tool_request.has_target || snapshot.tool_request.target === undefined) {
          unsupported();
        }
        push(
          {
            kind: "tool_request",
            call_handle: snapshot.tool_request.call_handle,
            component: "target"
          },
          `tool:target:${snapshot.tool_request.call_handle}`
        );
        break;
      }
      case "tool_arguments": {
        if (!snapshot.tool_request) unsupported();
        push(
          {
            kind: "tool_request",
            call_handle: snapshot.tool_request.call_handle,
            component: "arguments",
            locator: { kind: "whole_arguments" }
          },
          `tool:args:${snapshot.tool_request.call_handle}`
        );
        break;
      }
      default:
        unsupported();
    }
  }

  if (refs.length > 8) unsupported();
  return refs;
}

export function createTrack1RuleMatchDetectorAdapter(): RawLocalDetector {
  return {
    async detect(snapshot, _signal) {
      if (snapshot.stage === "user_input") {
        unsupported();
      }
      if (snapshot.stage !== "model_output" && snapshot.stage !== "tool_request") {
        unsupported();
      }

      const { context, model_output, sourcesByType } = buildContext(snapshot);
      const tool_request =
        snapshot.stage === "tool_request"
          ? toolFromSnapshot(snapshot)
          : undefined;
      if (snapshot.stage === "tool_request" && !tool_request) {
        unsupported();
      }

      // Match catalog only; never invoke legacy final provider decide path.
      const evaluation = evaluateTrack1FilterRules(
        {
          stage: snapshot.stage,
          context,
          model_output,
          ...(tool_request ? { tool_request } : {})
        },
        TRACK1_BASE_FILTER_RULES
      );

      if (evaluation.matches.length === 0) {
        const empty: SandboxSecurityRawDetectorResult = {
          candidates: [],
          clearances: []
        };
        return empty;
      }

      const candidates: SandboxSecurityRiskCandidate[] = [];
      for (const match of evaluation.matches) {
        const rule = TRACK1_BASE_FILTER_RULES.find(
          (item) => item.rule_id === match.rule_id
        );
        if (!rule) continue;
        const category = mapCategory(match.category);
        const subject_refs = subjectsForRule(rule, snapshot, sourcesByType as never);
        candidates.push({
          category,
          severity: SEVERITY_FROM_ACTION[match.action],
          confidence: 0.8,
          reason_code: reasonFor(category),
          subject_refs
        });
      }

      // If matching produced candidates but every subject mapping failed, we
      // would have thrown unsupported already.
      if (candidates.length === 0) {
        return { candidates: [], clearances: [] };
      }

      // Guard confidence contract.
      for (const candidate of candidates) {
        if (candidate.confidence !== 0.8) {
          unsupported();
        }
      }

      return { candidates, clearances: [] };
    }
  };
}
