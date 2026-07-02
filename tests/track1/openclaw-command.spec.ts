import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  invokeOpenClawAgent,
  type OpenClawAgentInvocation,
  type ProcessHandle,
  type ProcessPort,
  type EphemeralMessagePort
} from "../../scripts/track1/openclaw-command.ts";
import type { Track1CompiledPrompt } from "../../scripts/track1/case-prompt.ts";
import { makeValidTrack1Environment } from "./fixtures/openclaw-runner.fixture.ts";

// -- test fixtures -----------------------------------------------------------

function makeCompiledPrompt(attemptId: string): Track1CompiledPrompt {
  const utf8 = Buffer.from(
    JSON.stringify({
      schema_version: "track1-openclaw-model-input.v1",
      attempt_id: attemptId,
      user_prompt: "Test prompt for controlled research session."
    }),
    "utf8"
  );
  return {
    case_id: "T1-SC-001-C001",
    scenario_id: "T1-SC-001",
    relative_tmpfs_path: `/run/track1/messages/${attemptId.replace(/:/g, "-")}.json`,
    content_sha256: createHash("sha256").update(utf8).digest("hex"),
    utf8
  };
}

function makeValidInvocation(): OpenClawAgentInvocation {
  return {
    agent_id: "agent:track1:prompt-injection",
    session_key: "session-key:0123456789abcdef0123456789abcdef",
    attempt_id: "attempt:t1-sc-001-c001:1",
    prompt: makeCompiledPrompt("attempt:t1-sc-001-c001:1")
  };
}

const VALID_CLI_JSON = JSON.stringify({
  payloads: [{ text: "Test reply", mediaUrl: null }],
  meta: { durationMs: 1200 }
});

interface RecordedSpawn {
  executable: string;
  args: string[];
  shell: boolean;
  env: Record<string, string>;
  stdio: readonly [string, string, string];
  timeout?: number;
}

function makeRecordingProcessPort(options?: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  signalCode?: string | null;
  delay?: number;
}): ProcessPort & { calls: RecordedSpawn[] } {
  const calls: RecordedSpawn[] = [];
  return {
    calls,
    async spawn(executable, args, spawnOptions) {
      calls.push({
        executable,
        args: [...args],
        shell: spawnOptions.shell,
        env: { ...spawnOptions.env },
        stdio: spawnOptions.stdio,
        timeout: spawnOptions.timeout
      });
      if (options?.delay) {
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      }
      return {
        stdout: options?.stdout ?? VALID_CLI_JSON,
        stderr: options?.stderr ?? "",
        exitCode: options?.exitCode ?? 0,
        signalCode: options?.signalCode ?? null
      };
    }
  };
}

interface RecordedFileWrite {
  path: string;
  bytes: Uint8Array;
}

function makeRecordingEphemeralMessagePort(): EphemeralMessagePort & {
  writes: RecordedFileWrite[];
} {
  const writes: RecordedFileWrite[] = [];
  return {
    writes,
    async withFile(path, bytes, run) {
      writes.push({ path, bytes: new Uint8Array(bytes) });
      return await run();
    }
  };
}

function makeCliJsonContaining(sentinel: string): string {
  return JSON.stringify({
    payloads: [{ text: `Response with ${sentinel}`, mediaUrl: null }],
    meta: { durationMs: 1500 }
  });
}

// -- Step 1: exact command RED -----------------------------------------------

test("REQ-T1-DEMO-010 OpenClaw port uses a fixed shell-free command", async () => {
  const processPort = makeRecordingProcessPort({ stdout: VALID_CLI_JSON });
  const messagePort = makeRecordingEphemeralMessagePort();
  const result = await invokeOpenClawAgent(
    makeValidInvocation(),
    makeValidTrack1Environment(),
    processPort,
    messagePort
  );

  assert.equal(processPort.calls.length, 1);
  const call = processPort.calls[0];
  assert.equal(call.executable, "openclaw");
  assert.deepEqual(call.args, [
    "agent",
    "--agent",
    "agent:track1:prompt-injection",
    "--session-key",
    "session-key:0123456789abcdef0123456789abcdef",
    "--message",
    Buffer.from(makeValidInvocation().prompt.utf8).toString("utf8"),
    "--json"
  ]);
  assert.equal(call.shell, false);
  assert.equal(typeof call.timeout, "number");
  assert.deepEqual(call.stdio, ["ignore", "pipe", "pipe"]);

  assert.deepEqual(Object.keys(result).sort(), [
    "agent_id",
    "exit_code",
    "protocol_valid",
    "session_key_sha256"
  ]);
  assert.equal(result.exit_code, 0);
  assert.equal(result.protocol_valid, true);
  assert.equal(result.agent_id, "agent:track1:prompt-injection");
});

test("REQ-T1-DEMO-010 OpenClaw port writes prompt to tmpfs for audit trail", async () => {
  const processPort = makeRecordingProcessPort({ stdout: VALID_CLI_JSON });
  const messagePort = makeRecordingEphemeralMessagePort();
  await invokeOpenClawAgent(
    makeValidInvocation(),
    makeValidTrack1Environment(),
    processPort,
    messagePort
  );

  assert.equal(messagePort.writes.length, 1);
  assert.equal(
    messagePort.writes[0].path,
    "/run/track1/messages/attempt-t1-sc-001-c001-1.json"
  );
  assert.deepEqual(
    Buffer.from(messagePort.writes[0].bytes),
    Buffer.from(makeValidInvocation().prompt.utf8)
  );
});

// -- Step 2: injection/content RED -------------------------------------------

test("REQ-T1-DEMO-010 OpenClaw port rejects caller-controlled command surfaces", async () => {
  const base = makeValidInvocation();
  for (const mutation of [
    { agent_id: "agent:track1:x;whoami" },
    { agent_id: "agent:track1:x --local" },
    { session_key: "x --local" },
    { session_key: "session-key:GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG" },
    { attempt_id: "attempt:../../secrets:1" },
    { attempt_id: "attempt:t1-sc-001-c001:3" }
  ]) {
    await assert.rejects(
      () =>
        invokeOpenClawAgent(
          { ...base, ...mutation } as OpenClawAgentInvocation,
          makeValidTrack1Environment(),
          makeRecordingProcessPort(),
          makeRecordingEphemeralMessagePort()
        ),
      /track1_invocation_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 OpenClaw port discards raw stdout and stderr", async () => {
  const sentinel = "MODEL_OUTPUT_SENTINEL_36ac";
  const port = makeRecordingProcessPort({
    stdout: makeCliJsonContaining(sentinel),
    stderr: `provider failed ${sentinel}`
  });
  const result = await invokeOpenClawAgent(
    makeValidInvocation(),
    makeValidTrack1Environment(),
    port,
    makeRecordingEphemeralMessagePort()
  );
  assert.equal(JSON.stringify(result).includes(sentinel), false);
  assert.equal(JSON.stringify(result).includes("provider"), false);
});

test("REQ-T1-DEMO-010 OpenClaw port rejects non-zero exit code", async () => {
  const port = makeRecordingProcessPort({ exitCode: 1, stdout: VALID_CLI_JSON });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        makeValidTrack1Environment(),
        port,
        makeRecordingEphemeralMessagePort()
      ),
    /track1_invocation_nonzero/
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects signal termination", async () => {
  const port = makeRecordingProcessPort({
    exitCode: null,
    signalCode: "SIGTERM",
    stdout: ""
  });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        makeValidTrack1Environment(),
        port,
        makeRecordingEphemeralMessagePort()
      ),
    /track1_invocation_signal/
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects oversized stdout", async () => {
  const oversized = "x".repeat(520_000);
  const port = makeRecordingProcessPort({ stdout: oversized });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        makeValidTrack1Environment(),
        port,
        makeRecordingEphemeralMessagePort()
      ),
    /track1_invocation_oversized/
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects malformed JSON", async () => {
  const port = makeRecordingProcessPort({ stdout: "{invalid json" });
  await assert.rejects(
    () =>
      invokeOpenClawAgent(
        makeValidInvocation(),
        makeValidTrack1Environment(),
        port,
        makeRecordingEphemeralMessagePort()
      ),
    /track1_invocation_malformed_json/
  );
});

test("REQ-T1-DEMO-010 OpenClaw port rejects protocol mismatch", async () => {
  for (const stdout of [
    JSON.stringify({ payloads: [] }),
    JSON.stringify({ meta: {} }),
    JSON.stringify({ payloads: [], meta: {}, extra: "field" }),
    JSON.stringify({ payloads: "not-array", meta: {} }),
    JSON.stringify({ payloads: [], meta: "not-object" })
  ]) {
    const port = makeRecordingProcessPort({ stdout });
    await assert.rejects(
      () =>
        invokeOpenClawAgent(
          makeValidInvocation(),
          makeValidTrack1Environment(),
          port,
          makeRecordingEphemeralMessagePort()
        ),
      /track1_invocation_protocol_mismatch/
    );
  }
});

test("REQ-T1-DEMO-010 OpenClaw port passes allowlisted environment only", async () => {
  const port = makeRecordingProcessPort({ stdout: VALID_CLI_JSON });
  const fullEnv = {
    ...makeValidTrack1Environment(),
    DANGEROUS_VAR: "should-not-appear",
    ANOTHER_VAR: "also-filtered"
  };
  await invokeOpenClawAgent(
    makeValidInvocation(),
    fullEnv,
    port,
    makeRecordingEphemeralMessagePort()
  );

  const passedEnv = port.calls[0].env;
  assert.equal("DANGEROUS_VAR" in passedEnv, false);
  assert.equal("ANOTHER_VAR" in passedEnv, false);
  assert.equal(passedEnv.OPENCLAW_MODEL_BASE_URL, fullEnv.OPENCLAW_MODEL_BASE_URL);
  assert.equal(passedEnv.OPENCLAW_MODEL_API_KEY, fullEnv.OPENCLAW_MODEL_API_KEY);
});
