// P4-T3: shell-free fixed OpenClaw CLI command port. Spawns exactly
// `openclaw agent --agent <id> --session-key <key> --message-file <path>
// --json` with shell: false, drains stdout/stderr transiently, validates the
// wire protocol shape, and returns a safe result with no raw model or
// provider content.

import { createHash } from "node:crypto";
import type { Track1CompiledPrompt } from "./case-prompt.ts";
import { normalizeTrack1ModelInputEnvelope } from "../../integrations/openclaw/src/campaign-context.ts";
import { TRACK1_CAMPAIGN_AGENT_IDS } from "../../shared/types/campaign-supervision.ts";
import type {
  Track1CampaignAgentId,
  Track1SessionId
} from "../../shared/types/campaign-supervision.ts";

export class Track1InvocationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1InvocationError";
    this.code = code;
  }
}

function fail(code: string): never {
  throw new Track1InvocationError(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// -- public types -------------------------------------------------------------

export interface OpenClawAgentInvocation {
  agent_id: Track1CampaignAgentId;
  session_id: Track1SessionId;
  session_key: string;
  attempt_id: string;
  prompt: Track1CompiledPrompt;
}

export interface SafeOpenClawInvocationResult {
  exit_code: 0;
  agent_id: Track1CampaignAgentId;
  session_key_sha256: string;
  protocol_valid: true;
}

export interface ProcessHandle {
  onStdout(listener: (chunk: Uint8Array) => void): void;
  onStderr(listener: (chunk: Uint8Array) => void): void;
  onExit(listener: (result: { code: number | null; signal: string | null }) => void): void;
  kill(): void;
}

export interface ProcessPort {
  spawn(
    executable: string,
    args: readonly string[],
    options: Readonly<{
      shell: false;
      env: Readonly<Record<string, string>>;
      stdio: readonly ["ignore", "pipe", "pipe"];
    }>
  ): ProcessHandle;
}

export interface EphemeralMessagePort {
  withFile<T>(
    path: string,
    bytes: Uint8Array,
    run: () => Promise<T>
  ): Promise<T>;
}

const SESSION_KEY_PATTERN = /^session-key:[0-9a-f]{32}$/;
const SESSION_ID_PATTERN = /^session:[0-9a-f]{32}$/;
const ATTEMPT_ID_PATTERN = /^attempt:t1-sc-\d{3}-c\d{3}:[12]$/;
const MAX_PROMPT_BYTES = 256_000;

const ALLOWED_ENV_KEYS = [
  "OPENCLAW_CONFIG_PATH",
  "OPENCLAW_GATEWAY_PASSWORD",
  "OPENCLAW_ALLOW_INSECURE_PRIVATE_WS",
  "TRACK1_INGEST_TOKEN",
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "PATHEXT",
  "SystemRoot",
  "ComSpec"
] as const;

const MAX_OUTPUT_BYTES = 1024 * 1024;
const INVOCATION_TIMEOUT_MS = 120_000;

function validateInvocation(input: unknown): OpenClawAgentInvocation {
  if (
    !isPlainObject(input) ||
    !hasExactKeys(input, [
      "agent_id",
      "session_id",
      "session_key",
      "attempt_id",
      "prompt"
    ])
  ) {
    fail("track1_invocation_invalid");
  }

  const {
    agent_id,
    session_id,
    session_key,
    attempt_id,
    prompt
  } = input as Record<string, unknown>;

  if (!TRACK1_CAMPAIGN_AGENT_IDS.includes(agent_id as Track1CampaignAgentId)) {
    fail("track1_invocation_invalid");
  }
  if (!isNonEmptyString(session_id) || !SESSION_ID_PATTERN.test(session_id)) {
    fail("track1_invocation_invalid");
  }
  if (!isNonEmptyString(session_key) || !SESSION_KEY_PATTERN.test(session_key)) {
    fail("track1_invocation_invalid");
  }
  if (!isNonEmptyString(attempt_id) || !ATTEMPT_ID_PATTERN.test(attempt_id)) {
    fail("track1_invocation_invalid");
  }
  if (!isPlainObject(prompt)) fail("track1_invocation_invalid");
  const relativeTmpfsPath = prompt.relative_tmpfs_path;
  if (
    !isNonEmptyString(relativeTmpfsPath) ||
    !relativeTmpfsPath.startsWith("/run/track1/messages/") ||
    relativeTmpfsPath.includes("..")
  ) {
    fail("track1_invocation_invalid");
  }
  const utf8 = prompt.utf8;
  if (!(utf8 instanceof Uint8Array)) fail("track1_invocation_invalid");
  if (
    utf8.byteLength > MAX_PROMPT_BYTES ||
    !isNonEmptyString(prompt.content_sha256) ||
    createHash("sha256").update(utf8).digest("hex") !== prompt.content_sha256
  ) {
    fail("track1_invocation_invalid");
  }

  const expectedAttemptSegment = attempt_id
    .replace(/^attempt:/, "")
    .replace(/:/g, "-");
  if (relativeTmpfsPath !== `/run/track1/messages/attempt-${expectedAttemptSegment}.json`) {
    fail("track1_invocation_invalid");
  }

  let envelope;
  try {
    envelope = normalizeTrack1ModelInputEnvelope(
      JSON.parse(Buffer.from(utf8).toString("utf8"))
    );
  } catch {
    fail("track1_invocation_invalid");
  }
  if (
    envelope.agent_id !== agent_id ||
    envelope.session_id !== session_id ||
    envelope.attempt_id !== attempt_id ||
    envelope.case_id !== prompt.case_id ||
    envelope.scenario_id !== prompt.scenario_id
  ) {
    fail("track1_invocation_invalid");
  }

  return {
    agent_id: agent_id as Track1CampaignAgentId,
    session_id: session_id as Track1SessionId,
    session_key: session_key as string,
    attempt_id: attempt_id as string,
    prompt: prompt as unknown as Track1CompiledPrompt
  };
}

function buildEnv(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const value = environment[key];
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

function hashSessionKey(sessionKey: string): string {
  return createHash("sha256").update(sessionKey, "utf8").digest("hex");
}

interface ParsedCliProtocol {
  agent_id: string;
  session_key_sha256: string;
}

function toRuntimeAgentId(agentId: Track1CampaignAgentId): string {
  return agentId.replaceAll(":", "-");
}

// OpenClaw's own CLI rejects session ids containing ":" (its
// SAFE_SESSION_ID_RE only allows [a-z0-9._-]), but Track1SessionId is always
// "session:<32 hex>". Transform at the CLI boundary only — every other
// Track1 surface (ingest, envelope, evidence) keeps the colon form.
function toRuntimeSessionId(sessionId: Track1SessionId): string {
  return sessionId.replace(/^session:/, "session-");
}

function validateCliResponse(
  raw: string,
  invocation: OpenClawAgentInvocation
): ParsedCliProtocol {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("track1_invocation_protocol_invalid");
  }
  if (!isPlainObject(parsed)) fail("track1_invocation_protocol_invalid");
  // Fail closed on unexpected top-level keys so protocol drift cannot be
  // silently accepted as a successful agent invocation.
  if (
    !hasExactKeys(parsed, ["runId", "status", "summary", "result"]) ||
    !isNonEmptyString(parsed.runId) ||
    parsed.status !== "ok" ||
    parsed.summary !== "completed" ||
    !isPlainObject(parsed.result)
  ) {
    fail("track1_invocation_protocol_invalid");
  }

  const result = parsed.result;
  if (!hasExactKeys(result, ["payloads", "meta"]) || !isPlainObject(result.meta)) {
    fail("track1_invocation_protocol_invalid");
  }
  const meta = result.meta;
  if (
    meta.transport === "embedded" ||
    "fallbackFrom" in meta ||
    "fallbackReason" in meta
  ) {
    fail("track1_invocation_protocol_invalid");
  }
  if (!isPlainObject(meta.agentMeta)) {
    fail("track1_invocation_protocol_invalid");
  }
  const agentMeta = meta.agentMeta;
  const expectedSessionId = toRuntimeSessionId(invocation.session_id);
  const expectedSuffix = `/${toRuntimeAgentId(invocation.agent_id)}/sessions/${expectedSessionId}.jsonl`;
  const sessionFile = agentMeta.sessionFile;
  const sessionId = agentMeta.sessionId;
  if (
    !isNonEmptyString(sessionId) ||
    (sessionId !== expectedSessionId && sessionId !== invocation.session_id)
  ) {
    fail("track1_invocation_protocol_invalid");
  }
  if (
    !isNonEmptyString(sessionFile) ||
    !sessionFile.endsWith(expectedSuffix)
  ) {
    fail("track1_invocation_protocol_invalid");
  }
  return {
    agent_id: invocation.agent_id,
    session_key_sha256: hashSessionKey(invocation.session_key)
  };
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const ownKeys = Object.getOwnPropertyNames(value);
  if (ownKeys.length !== expected.length) return false;
  const expectedSet = new Set(expected);
  return ownKeys.every((key) => expectedSet.has(key));
}

// -- public API -----------------------------------------------------------------

export async function invokeOpenClawAgent(
  input: unknown,
  environment: Readonly<Record<string, string | undefined>>,
  processPort: ProcessPort,
  messagePort: EphemeralMessagePort
): Promise<SafeOpenClawInvocationResult> {
  const invocation = validateInvocation(input);
  const prompt = invocation.prompt;

  const args = [
    "agent",
    "--agent",
    toRuntimeAgentId(invocation.agent_id),
    "--session-id",
    toRuntimeSessionId(invocation.session_id),
    "--session-key",
    invocation.session_key,
    "--message",
    Buffer.from(prompt.utf8).toString("utf8"),
    "--json"
  ] as const;

  const env = buildEnv(environment);

  const runInvocation = async (): Promise<SafeOpenClawInvocationResult> => {
    const handle = processPort.spawn("openclaw", args, {
      shell: false,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let capturedBytes = 0;
    const stdoutChunks: Buffer[] = [];
    let oversized = false;

    handle.onStdout((chunk) => {
      capturedBytes += chunk.byteLength;
      if (capturedBytes > MAX_OUTPUT_BYTES) {
        oversized = true;
        handle.kill();
        return;
      }
      stdoutChunks.push(Buffer.from(chunk));
    });
    handle.onStderr((chunk) => {
      capturedBytes += chunk.byteLength;
      if (capturedBytes > MAX_OUTPUT_BYTES) {
        oversized = true;
        handle.kill();
      }
    });

    const exitResult = await new Promise<{ code: number | null; signal: string | null }>(
      (resolve, reject) => {
        const timeoutId = setTimeout(() => {
          handle.kill();
          reject(new Track1InvocationError("track1_invocation_timeout"));
        }, INVOCATION_TIMEOUT_MS);
        handle.onExit((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        });
      }
    );

    if (oversized) fail("track1_invocation_output_too_large");
    if (exitResult.signal !== null) fail("track1_invocation_signal");
    if (exitResult.code !== 0) fail("track1_invocation_nonzero_exit");

    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const protocol = validateCliResponse(stdout, invocation);
    return Object.freeze({
      exit_code: 0 as const,
      agent_id: invocation.agent_id,
      session_key_sha256: protocol.session_key_sha256,
      protocol_valid: true as const
    });
  };

  return messagePort.withFile(prompt.relative_tmpfs_path, prompt.utf8, runInvocation);
}
