// P4-T3: shell-free fixed OpenClaw command port. The executable, flag order,
// and all argument grammars are exact. No shell, interpolation, arbitrary
// option, --local, fallback, or caller-provided executable is possible.

import { createHash } from "node:crypto";
import type { Track1CampaignAgentId } from "../../shared/types/campaign-supervision.ts";
import type { Track1CompiledPrompt } from "./case-prompt.ts";

// -- public types ------------------------------------------------------------

export interface OpenClawAgentInvocation {
  agent_id: Track1CampaignAgentId;
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
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signalCode: string | null;
}

export interface ProcessPort {
  spawn(
    executable: string,
    args: readonly string[],
    options: Readonly<{
      shell: false;
      env: Readonly<Record<string, string>>;
      stdio: readonly ["ignore", "pipe", "pipe"];
      timeout?: number;
    }>
  ): Promise<ProcessHandle>;
}

export interface EphemeralMessagePort {
  withFile<T>(
    path: string,
    bytes: Uint8Array,
    run: () => Promise<T>
  ): Promise<T>;
}

// -- error taxonomy ----------------------------------------------------------

type Track1InvocationErrorCode =
  | "track1_invocation_invalid"
  | "track1_invocation_timeout"
  | "track1_invocation_signal"
  | "track1_invocation_nonzero"
  | "track1_invocation_oversized"
  | "track1_invocation_malformed_json"
  | "track1_invocation_protocol_mismatch";

class Track1InvocationError extends Error {
  readonly code: Track1InvocationErrorCode;

  constructor(code: Track1InvocationErrorCode) {
    super(code);
    this.name = "Track1InvocationError";
    this.code = code;
  }
}

// -- validation --------------------------------------------------------------

const AGENT_ID_PATTERN = /^agent:track1:[a-z][a-z0-9-]{0,62}$/;
const SESSION_KEY_PATTERN = /^session-key:[0-9a-f]{32}$/;
const ATTEMPT_ID_PATTERN = /^attempt:t1-sc-\d{3}-c\d{3}:[12]$/;

const OPENCLAW_INVOCATION_TIMEOUT_MS = 180_000;
const MAX_STDOUT_BYTES = 512_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateAgentId(value: unknown): Track1CampaignAgentId {
  if (!isNonEmptyString(value) || !AGENT_ID_PATTERN.test(value)) {
    throw new Track1InvocationError("track1_invocation_invalid");
  }
  return value as Track1CampaignAgentId;
}

function validateSessionKey(value: unknown): string {
  if (!isNonEmptyString(value) || !SESSION_KEY_PATTERN.test(value)) {
    throw new Track1InvocationError("track1_invocation_invalid");
  }
  return value;
}

function validateAttemptId(value: unknown): string {
  if (!isNonEmptyString(value) || !ATTEMPT_ID_PATTERN.test(value)) {
    throw new Track1InvocationError("track1_invocation_invalid");
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

const INVOCATION_KEYS = ["agent_id", "session_key", "attempt_id", "prompt"] as const;

function validateInvocation(value: unknown): OpenClawAgentInvocation {
  if (!isPlainObject(value) || !hasExactKeys(value, INVOCATION_KEYS)) {
    throw new Track1InvocationError("track1_invocation_invalid");
  }

  const agent_id = validateAgentId(value.agent_id);
  const session_key = validateSessionKey(value.session_key);
  const attempt_id = validateAttemptId(value.attempt_id);

  if (
    !isPlainObject(value.prompt) ||
    !(value.prompt.utf8 instanceof Uint8Array) ||
    !isNonEmptyString(value.prompt.case_id) ||
    !isNonEmptyString(value.prompt.scenario_id) ||
    !isNonEmptyString(value.prompt.relative_tmpfs_path) ||
    !isNonEmptyString(value.prompt.content_sha256)
  ) {
    throw new Track1InvocationError("track1_invocation_invalid");
  }

  return { agent_id, session_key, attempt_id, prompt: value.prompt as Track1CompiledPrompt };
}

// -- environment allowlist ---------------------------------------------------

const ALLOWED_ENV_KEYS = [
  "OPENCLAW_MODEL_BASE_URL",
  "OPENCLAW_MODEL_API_KEY",
  "OPENCLAW_MODEL_ID",
  "TRACK1_INGEST_TOKEN",
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR"
] as const;

function buildAllowlistEnv(
  baseEnv: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const value = baseEnv[key];
    if (typeof value === "string" && value.length > 0) {
      result[key] = value;
    }
  }
  return result;
}

// -- protocol validation -----------------------------------------------------

const CLI_RESPONSE_KEYS = ["payloads", "meta"] as const;

function validateCliResponse(
  rawStdout: string,
  expectedAgentId: Track1CampaignAgentId,
  expectedSessionKey: string
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStdout);
  } catch {
    throw new Track1InvocationError("track1_invocation_malformed_json");
  }

  if (!isPlainObject(parsed) || !hasExactKeys(parsed, CLI_RESPONSE_KEYS)) {
    throw new Track1InvocationError("track1_invocation_protocol_mismatch");
  }

  if (!Array.isArray(parsed.payloads)) {
    throw new Track1InvocationError("track1_invocation_protocol_mismatch");
  }

  if (!isPlainObject(parsed.meta)) {
    throw new Track1InvocationError("track1_invocation_protocol_mismatch");
  }
}

// -- invocation --------------------------------------------------------------

export async function invokeOpenClawAgent(
  invocation: unknown,
  environment: Readonly<Record<string, string | undefined>>,
  processPort: ProcessPort,
  ephemeralMessagePort: EphemeralMessagePort
): Promise<SafeOpenClawInvocationResult> {
  const validated = validateInvocation(invocation);

  const messageJson = Buffer.from(validated.prompt.utf8).toString("utf8");

  const allowlistEnv = buildAllowlistEnv(environment);

  const args = [
    "agent",
    "--agent",
    validated.agent_id,
    "--session-key",
    validated.session_key,
    "--message",
    messageJson,
    "--json"
  ] as const;

  const result = await ephemeralMessagePort.withFile(
    validated.prompt.relative_tmpfs_path,
    validated.prompt.utf8,
    async () => {
      return processPort.spawn("openclaw", args, {
        shell: false,
        env: allowlistEnv,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: OPENCLAW_INVOCATION_TIMEOUT_MS
      });
    }
  );

  if (result.signalCode !== null) {
    throw new Track1InvocationError("track1_invocation_signal");
  }

  if (result.exitCode !== 0) {
    throw new Track1InvocationError("track1_invocation_nonzero");
  }

  if (Buffer.byteLength(result.stdout, "utf8") > MAX_STDOUT_BYTES) {
    throw new Track1InvocationError("track1_invocation_oversized");
  }

  validateCliResponse(result.stdout, validated.agent_id, validated.session_key);

  const session_key_sha256 = createHash("sha256")
    .update(validated.session_key, "utf8")
    .digest("hex");

  return Object.freeze({
    exit_code: 0,
    agent_id: validated.agent_id,
    session_key_sha256,
    protocol_valid: true
  });
}
