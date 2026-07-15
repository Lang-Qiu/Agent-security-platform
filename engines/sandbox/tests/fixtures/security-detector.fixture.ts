import type {
  RawLocalDetector,
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecuritySanitizedJudgeObligation,
  SandboxSecuritySanitizedJudgePayload,
  SandboxSecuritySanitizer,
  SanitizedExternalDetector
} from "../../src/security/detector-contract.ts";
import { deriveSandboxSecurityExternalTokenRegistry } from "../../src/security/sanitized-boundary.ts";

export type ContentFreeEvidence = {
  readonly source_handles: readonly string[];
  readonly call_handle?: string;
  readonly source_tokens: readonly string[];
  readonly call_token?: string;
  readonly tool_name_token?: string;
};

export function createRecordingRawLocalDetector(): RawLocalDetector & {
  lastSnapshot?: Readonly<SandboxSecurityRawDetectorSnapshot>;
  evidence: ContentFreeEvidence;
} {
  const detector = {
    evidence: {
      source_handles: [] as string[],
      source_tokens: [] as string[]
    } as ContentFreeEvidence & {
      source_handles: string[];
      source_tokens: string[];
      call_handle?: string;
    },
    lastSnapshot: undefined as Readonly<SandboxSecurityRawDetectorSnapshot> | undefined,
    async detect(snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>) {
      detector.lastSnapshot = snapshot;
      detector.evidence = {
        source_handles: snapshot.contents.map((content) => content.source_handle),
        call_handle: snapshot.tool_request?.call_handle,
        source_tokens: []
      };
      return { candidates: [], clearances: [] };
    }
  };
  return detector;
}

export function createRecordingSanitizer(): SandboxSecuritySanitizer & {
  lastObligations?: readonly SandboxSecuritySanitizedJudgeObligation[];
  evidence: ContentFreeEvidence;
} {
  const sanitizer = {
    evidence: {
      source_handles: [] as string[],
      source_tokens: [] as string[]
    } as ContentFreeEvidence & {
      source_handles: string[];
      source_tokens: string[];
      call_handle?: string;
      call_token?: string;
      tool_name_token?: string;
    },
    lastObligations: undefined as
      | readonly SandboxSecuritySanitizedJudgeObligation[]
      | undefined,
    async sanitize(
      snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
      routed_obligations: readonly SandboxSecuritySanitizedJudgeObligation[]
    ): Promise<SandboxSecuritySanitizedJudgePayload> {
      sanitizer.lastObligations = routed_obligations;
      const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot);
      const sources = snapshot.contents.map((content, index) => ({
        source_token: registry.source_tokens[index].source_token,
        source_type: content.source_type,
        media_type: content.media_type,
        sanitized_value: "[redacted]"
      }));
      const tool_request = snapshot.tool_request && registry.call_token
        ? {
            call_token: registry.call_token.call_token,
            tool_name_token: registry.call_token.tool_name_token,
            ...(snapshot.tool_request.has_target
              ? { sanitized_target: "[target]" }
              : {}),
            sanitized_arguments: {}
          }
        : undefined;
      sanitizer.evidence = {
        source_handles: snapshot.contents.map((c) => c.source_handle),
        call_handle: snapshot.tool_request?.call_handle,
        source_tokens: sources.map((s) => s.source_token),
        call_token: tool_request?.call_token,
        tool_name_token: tool_request?.tool_name_token
      };
      return {
        schema_version: "sandbox-security-sanitized-judge.v1",
        request_token: registry.request_token,
        stage: snapshot.stage,
        policy_profile_id: snapshot.profile.profile_id,
        sources,
        ...(tool_request ? { tool_request } : {}),
        routed_obligations
      };
    }
  };
  return sanitizer;
}

export function createRecordingExternalDetector(): SanitizedExternalDetector & {
  lastPayload?: Readonly<SandboxSecuritySanitizedJudgePayload>;
  evidence: ContentFreeEvidence;
} {
  const detector = {
    evidence: {
      source_handles: [] as string[],
      source_tokens: [] as string[]
    } as ContentFreeEvidence & {
      source_tokens: string[];
      call_token?: string;
      tool_name_token?: string;
    },
    lastPayload: undefined as Readonly<SandboxSecuritySanitizedJudgePayload> | undefined,
    async detect(payload: Readonly<SandboxSecuritySanitizedJudgePayload>) {
      detector.lastPayload = payload;
      detector.evidence = {
        source_handles: [],
        source_tokens: payload.sources.map((source) => source.source_token),
        call_token: payload.tool_request?.call_token,
        tool_name_token: payload.tool_request?.tool_name_token
      };
      return { candidates: [], clearances: [] };
    }
  };
  return detector;
}

export function createFrozenRawSubjectRegistry(input?: {
  readonly evaluation_nonce?: string;
  readonly source_handle?: string;
  readonly call_handle?: string;
  readonly has_target?: boolean;
  readonly media_type?: "text/plain" | "application/json";
  readonly value?: string | Record<string, unknown>;
}) {
  const nonce = input?.evaluation_nonce ?? "a".repeat(32);
  const source_handle = input?.source_handle ?? `hsrc:${nonce}:0001`;
  const call_handle = input?.call_handle ?? `hcall:${nonce}:0000`;
  const media_type = input?.media_type ?? "text/plain";
  const value = input?.value ?? "hello";
  const original_utf8_bytes = Object.freeze(
    Array.from(
      Buffer.from(
        typeof value === "string" ? value : JSON.stringify(value),
        "utf8"
      )
    )
  );
  return Object.freeze({
    evaluation_nonce: nonce,
    content_subjects: Object.freeze([
      Object.freeze({
        source_handle: source_handle as never,
        media_type,
        original_utf8_bytes,
        value: value as never
      })
    ]),
    tool_subject: Object.freeze({
      call_handle: call_handle as never,
      has_target: input?.has_target ?? true,
      arguments: Object.freeze({ path: "/tmp/x" })
    })
  });
}

