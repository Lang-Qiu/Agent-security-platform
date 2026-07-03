import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  invokeOpenClawAgent,
  Track1InvocationError
} from "../../scripts/track1/openclaw-command.ts";
import type {
  EphemeralMessagePort,
  ProcessHandle,
  ProcessPort
} from "../../scripts/track1/openclaw-command.ts";
import { compileTrack1CasePrompt } from "../../scripts/track1/case-prompt.ts";

const VALID_ENVIRONMENT = Object.freeze({
  OPENCLAW_MODEL_BASE_URL: "https://model.example.test/v1",
  OPENCLAW_MODEL_API_KEY: "test-only-key",
  OPENCLAW_MODEL_ID: "provider/model-safe",
  PATH: "/usr/bin"
});

function makeCompiledPrompt(attemptId: string) {
  return compileTrack1CasePrompt({
    manifest_entry: {
      agent_id: "agent:track1:prompt-injection",
      scenario_id: "T1-SC-001",
      case_id: "T1-SC-001-C001",
      case_sha256: sha256HexOfCanonicalCase()
    },
    canonical_case_bytes: readCanonicalCaseBytes(),
    campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
    agent_id: "agent:track1:prompt-injection",
    attempt_id: attemptId,
    attempt_index: Number(attemptId.slice(-1)) as 1 | 2,
    session_id: "session:0123456789abcdef0123456789abcdef"
  });
}

function readCanonicalCaseBytes(): Uint8Array {
  return readFileSync(
    new URL(
      "../../samples/track1/cases/T1-SC-001/T1-SC-001-C001.json",
      import.meta.url
    )
  );
}

function sha256HexOfCanonicalCase(): string {
  return createHash("sha256").update(readCanonicalCaseBytes()).digest("hex");
}

function makeValidInvocation() {
  return {
    agent_id: "agent:track1:prompt-injection" as const,
    session_key: "session-key:0123456789abcdef0123456789abcdef",
    attempt_id: "attempt:t1-sc-001-c001:1",
    prompt: makeCompiledPrompt("attempt:t1-sc-001-c001:1")
  };
}

function sessionKeySha256(sessionKey: string): string {
  return createHash("sha256").update(sessionKey, "utf8").digest("hex");
}

function makeCliJsonContaining(sentinel: string): string {
  return JSON.stringify({
    agent_id: "agent:track1:prompt-injection",
    session_key_sha256: sessionKeySha256(
      "session-key:0123456789abcdef0123456789abcdef"
    ),
    _debug: sentinel
  });
}

interface RecordingProcessPortOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: string | null;
  neverExit?: boolean;
}

function makeRecordingProcessPort(
  options: RecordingProcessPortOptions = {}
): ProcessPort & { calls: Array<{ executable: string; args: string[]; shell: boolean; env: Record<string, string> }> } {
  const calls: Array<{ executable: string; args: string[]; shell: boolean; env: Record<string, string> }> = [];
  return {
    calls,
    spawn(executable, args, spawnOptions) {
      calls.push({
        executable,
        args: [...args],
        shell: spawnOptions.shell,
        env: { ...spawnOptions.env }
      });
      const stdoutListeners: Array<(chunk: Uint8Array) => void> = [];
      const exitListeners: Array<
        (result: { code: number | null; signal: string | null }) => void
      > = [];
      const handle: ProcessHandle = {
        onStdout(listener) {
          stdoutListeners.push(listener);
        },
        onStderr() {
          // stderr is drained but unused by these tests
        },
        onExit(listener) {
          exitListeners.push(listener);
          if (options.neverExit) return;
          queueMicrotask(() => {
            for (const stdoutListener of stdoutListeners) {
              stdoutListener(
                Buffer.from(
                  options.stdout ??
                    makeCliJsonContaining("default"),
                  "utf8"
                )
              );
            }
            for (const exitListener of exitListeners) {
              exitListener({
                code: options.exitCode ?? 0,
                signal: options.signal ?? null
              });
            }
          });
        },
        kill() {
          // no-op for the recording port
        }
      };
      return handle;
    }
  };
}

function makeRecordingEphemeralMessagePort(): EphemeralMessagePort & {
  writes: Array<{ path: string; bytes: Uint8Array }>;
} {
  const writes: Array<{ path: string; bytes: Uint8Array }> = [];
  return {
    writes,
    async withFile(path, bytes, run) {
      writes.push({ path, bytes });
      return run();
    }
  };
}

const VALID_SAFE_CLI_JSON = JSON.stringify({
  agent_id: "agent:track1:prompt-injection",
  session_key_sha256: sessionKeySha256(
    "session-key:0123456789abcdef0123456789abcdef"
  )
});

test("REQ-T1-DEMO-010 OpenClaw port uses a fixed shell-free command", async () => {
  const processPort = makeRecordingProcessPort({ stdout: VALID_SAFE_CLI_JSON });
  const result = await invokeOpenClawAgent(
    {
      agent_id: "agent:track1:prompt-injection",
      session_key: "session-key:0123456789abcdef0123456789abcdef",
      attempt_id: "attempt:t1-sc-001-c001:1",
      prompt: makeCompiledPrompt("attempt:t1-sc-001-c001:1")
    },
    VALID_ENVIRONMENT,
    processPort,
    makeRecordingEphemeralMessagePort()
  );

  assert.deepEqual(
    { ...processPort.calls[0], env: undefined },
    {
      executable: "openclaw",
      args: [
        "agent",
        "--agent",
        "agent:track1:prompt-injection",
        "--session-key",
        "session-key:0123456789abcdef0123456789abcdef",
        "--message-file",
        "/run/track1/messages/attempt-t1-sc-001-c001-1.json",
        "--json"
      ],
      shell: false,
      env: undefined
    }
  );
  assert.deepEqual(Object.keys(result).sort(), [
    "agent_id",
    "exit_code",
    "protocol_valid",
    "session_key_sha256"
  ]);
});

test("REQ-T1-DEMO-010 OpenClaw port rejects caller-controlled command surfaces", async () => {
  for (const mutation of [
    { agent_id: "agent:track1:x;whoami" },
    { session_key: "x --local" },
    { attempt_id: "attempt:t1-sc-001-c001:2" }
  ]) {
    await assert.rejects(
      () =>
        invokeOpenClawAgent(
          { ...makeValidInvocation(), ...mutation },
          VALID_ENVIRONMENT,
          makeRecordingProcessPort(),
          makeRecordingEphemeralMessagePort()
        ),
      Track1InvocationError
    );
  }
});

test("REQ-T1-DEMO-010 OpenClaw port discards raw stdout and stderr", async () => {
  const sentinel = "MODEL_OUTPUT_SENTINEL_36ac";
  const port = makeRecordingProcessPort({
    stdout: makeCliJsonContaining(sentinel),
    stderr: `provider failed ${sentinel}`
  });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        VALID_ENVIRONMENT,
        port,
        makeRecordingEphemeralMessagePort()
      ),
    (error: unknown) => {
      assert.equal(String(error).includes(sentinel), false);
      return true;
    }
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects a non-zero exit code", async () => {
  const port = makeRecordingProcessPort({ exitCode: 1 });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        VALID_ENVIRONMENT,
        port,
        makeRecordingEphemeralMessagePort()
      ),
    Track1InvocationError
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects a signal termination", async () => {
  const port = makeRecordingProcessPort({ exitCode: null, signal: "SIGKILL" });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        VALID_ENVIRONMENT,
        port,
        makeRecordingEphemeralMessagePort()
      ),
    Track1InvocationError
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects malformed JSON output", async () => {
  const port = makeRecordingProcessPort({ stdout: "not json" });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        VALID_ENVIRONMENT,
        port,
        makeRecordingEphemeralMessagePort()
      ),
    Track1InvocationError
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects wrong agent/session protocol metadata", async () => {
  const wrongAgent = JSON.stringify({
    agent_id: "agent:track1:tool-hijack",
    session_key_sha256: sessionKeySha256(
      "session-key:0123456789abcdef0123456789abcdef"
    )
  });
  const port = makeRecordingProcessPort({ stdout: wrongAgent });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        VALID_ENVIRONMENT,
        port,
        makeRecordingEphemeralMessagePort()
      ),
    Track1InvocationError
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects extra protocol keys", async () => {
  const withExtra = JSON.stringify({
    agent_id: "agent:track1:prompt-injection",
    session_key_sha256: sessionKeySha256(
      "session-key:0123456789abcdef0123456789abcdef"
    ),
    extra: "field"
  });
  const port = makeRecordingProcessPort({ stdout: withExtra });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        VALID_ENVIRONMENT,
        port,
        makeRecordingEphemeralMessagePort()
      ),
    Track1InvocationError
  );
});

test("REQ-T1-DEMO-010 OpenClaw port only allows whitelisted environment variables", async () => {
  const port = makeRecordingProcessPort({ stdout: VALID_SAFE_CLI_JSON });
  await invokeOpenClawAgent(
    makeValidInvocation(),
    { ...VALID_ENVIRONMENT, SECRET_UNRELATED: "leak-me" },
    port,
    makeRecordingEphemeralMessagePort()
  );
  assert.equal("SECRET_UNRELATED" in port.calls[0].env, false);
});

test("REQ-T1-DEMO-010 OpenClaw port writes the compiled prompt to the ephemeral message port", async () => {
  const port = makeRecordingProcessPort({ stdout: VALID_SAFE_CLI_JSON });
  const messagePort = makeRecordingEphemeralMessagePort();
  const invocation = makeValidInvocation();
  await invokeOpenClawAgent(invocation, VALID_ENVIRONMENT, port, messagePort);
  assert.equal(messagePort.writes.length, 1);
  assert.equal(
    messagePort.writes[0].path,
    "/run/track1/messages/attempt-t1-sc-001-c001-1.json"
  );
  assert.deepEqual(messagePort.writes[0].bytes, invocation.prompt.utf8);
});
