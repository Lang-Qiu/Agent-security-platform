import {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson
} from "./canonical-json.ts";
import {
  isSandboxSecurityCallHandle,
  isSandboxSecuritySourceHandle,
  type SandboxSecurityCallHandle,
  type SandboxSecuritySourceHandle
} from "./input-boundary.ts";
import type {
  SandboxSecurityCandidateSubjectRef
} from "./detector-contract.ts";
import type {
  SandboxSecurityContentLocator,
  SandboxSecurityRiskCategory,
  SandboxSecurityToolLocator
} from "../../../../shared/types/sandbox-security.ts";

export type SandboxSecurityCanonicalPrivateSubjectScope =
  | {
      readonly kind: "content_source";
      readonly source_handle: SandboxSecuritySourceHandle;
      readonly locator: SandboxSecurityContentLocator;
    }
  | {
      readonly kind: "tool_request";
      readonly call_handle: SandboxSecurityCallHandle;
      readonly component: "whole_call" | "tool_name" | "target";
    }
  | {
      readonly kind: "tool_request";
      readonly call_handle: SandboxSecurityCallHandle;
      readonly component: "arguments";
      readonly locator: SandboxSecurityToolLocator;
    };

function scopeIdentity(
  scope: SandboxSecurityCanonicalPrivateSubjectScope
): string {
  return canonicalizeSandboxSecurityJson(scope);
}

export function canonicalizeSandboxSecurityPrivateSubjectScopes(
  refs: readonly SandboxSecurityCandidateSubjectRef[]
): readonly SandboxSecurityCanonicalPrivateSubjectScope[] {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new Error("empty subject refs");
  }
  const out: SandboxSecurityCanonicalPrivateSubjectScope[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    let scope: SandboxSecurityCanonicalPrivateSubjectScope;
    if (ref.kind === "content_source") {
      if (!isSandboxSecuritySourceHandle(ref.source_handle)) {
        throw new Error("invalid source handle");
      }
      scope = {
        kind: "content_source",
        source_handle: ref.source_handle,
        locator: ref.locator
      };
    } else if (ref.component === "arguments") {
      if (!isSandboxSecurityCallHandle(ref.call_handle)) {
        throw new Error("invalid call handle");
      }
      scope = {
        kind: "tool_request",
        call_handle: ref.call_handle,
        component: "arguments",
        locator: ref.locator
      };
    } else {
      if (!isSandboxSecurityCallHandle(ref.call_handle)) {
        throw new Error("invalid call handle");
      }
      scope = {
        kind: "tool_request",
        call_handle: ref.call_handle,
        component: ref.component
      };
    }
    const identity = scopeIdentity(scope);
    if (seen.has(identity)) {
      throw new Error("duplicate subject scope");
    }
    seen.add(identity);
    out.push(scope);
  }
  // stable order by identity for hashing, preserve exact locator/component values
  return out
    .slice()
    .sort((left, right) => scopeIdentity(left).localeCompare(scopeIdentity(right)));
}

export function computeSandboxSecuritySubjectKey(input: {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
}): string {
  const scopes = canonicalizeSandboxSecurityPrivateSubjectScopes(
    input.subject_refs
  );
  return sha256CanonicalJson({
    category: input.category,
    scopes
  });
}
