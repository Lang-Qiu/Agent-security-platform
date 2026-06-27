import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../src/simulated-tools/index.ts");
const statePath = resolve(import.meta.dirname, "../src/simulated-tools/state.ts");
const executorPath = resolve(import.meta.dirname, "../src/simulated-tools/executor.ts");

interface StateSnapshot {
  outbox: Array<{
    message_id: string;
    recipient: string;
    subject: string;
    body: string;
  }>;
  files: Record<string, string>;
  api_routes: Array<{
    endpoint: string;
    method: "GET" | "POST";
    status_code: number;
    body: Record<string, string>;
  }>;
}

interface SimulatedToolState {
  snapshot(): StateSnapshot;
}

interface SimulatedToolExecutor {
  execute(request: Record<string, unknown>): Record<string, any>;
}

interface SimulatedToolsModule {
  InMemorySimulatedToolState: new (initial?: {
    files?: Record<string, string>;
    api_routes?: StateSnapshot["api_routes"];
  }) => SimulatedToolState;
  SimulatedToolExecutor: new (state: SimulatedToolState) => SimulatedToolExecutor;
  normalizeSimulatedToolRequest(value: unknown): Record<string, unknown> | null;
}

async function importModuleIfExists(): Promise<SimulatedToolsModule | null> {
  if (!existsSync(modulePath)) {
    return null;
  }

  return import(pathToFileURL(modulePath).href) as Promise<SimulatedToolsModule>;
}

function request(
  tool_name: string,
  argumentsValue: Record<string, unknown>,
  callId = `call-${tool_name}`
): Record<string, unknown> {
  return {
    call_id: callId,
    session_id: "session-track1-tools",
    scenario_id: "T1-SC-002",
    case_id: "T1-SC-002-C001",
    tool_name,
    arguments: argumentsValue
  };
}

function normalize(
  module: SimulatedToolsModule,
  value: Record<string, unknown>
): Record<string, unknown> {
  const normalized = module.normalizeSimulatedToolRequest(value);
  assert.notEqual(normalized, null, "test request should satisfy the simulated-tool contract");
  return normalized;
}

test("REQ-T1-MOCK-TOOLS-004 appends simulated email only for local.invalid recipients", async () => {
  const module = await importModuleIfExists();
  assert.notEqual(module, null, "simulated-tool executor should exist before email behavior can run");
  if (!module) {
    return;
  }

  const state = new module.InMemorySimulatedToolState();
  const executor = new module.SimulatedToolExecutor(state);
  const accepted = executor.execute(
    normalize(
      module,
      request(
        "send_email",
        {
          recipient: "audit@local.invalid",
          subject: "Controlled audit",
          body: "Synthetic message"
        },
        "call-email-001"
      )
    )
  );

  assert.deepEqual(accepted, {
    call_id: "call-email-001",
    session_id: "session-track1-tools",
    scenario_id: "T1-SC-002",
    case_id: "T1-SC-002-C001",
    tool_name: "send_email",
    status: "simulated_success",
    summary: "Simulated email appended to the local outbox",
    output: {
      message_id: "sim-email-call-email-001",
      recipient: "audit@local.invalid",
      subject: "Controlled audit"
    },
    evidence: {
      evidence_ref: "simulated-tool://call-email-001",
      simulated: true,
      target_ref: "audit@local.invalid",
      state_change: "outbox_append"
    }
  });
  assert.equal(state.snapshot().outbox.length, 1);
  assert.equal(state.snapshot().outbox[0]?.body, "Synthetic message");

  const beforeRejectedCall = state.snapshot();
  const rejected = executor.execute(
    normalize(
      module,
      request("send_email", {
        recipient: "person@example.com",
        subject: "Must stay local",
        body: "Synthetic message"
      })
    )
  );

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejection_code, "target_not_allowed");
  assert.equal(rejected.evidence.state_change, "none");
  assert.deepEqual(state.snapshot(), beforeRejectedCall);
});

test("REQ-T1-MOCK-TOOLS-004 reads and writes only virtual sandbox fixture paths", async () => {
  const module = await importModuleIfExists();
  assert.notEqual(module, null, "simulated-tool executor should exist before file behavior can run");
  if (!module) {
    return;
  }

  const state = new module.InMemorySimulatedToolState({
    files: {
      "sandbox://fixtures/public/readme.txt": "Controlled fixture"
    }
  });
  const executor = new module.SimulatedToolExecutor(state);

  const readResult = executor.execute(
    normalize(
      module,
      request("read_file", {
        path: "sandbox://fixtures/public/readme.txt"
      })
    )
  );
  assert.equal(readResult.status, "simulated_success");
  assert.equal(readResult.output.content, "Controlled fixture");
  assert.equal(readResult.evidence.state_change, "none");

  const writeResult = executor.execute(
    normalize(
      module,
      request(
        "write_file",
        {
          path: "sandbox://fixtures/output/result.txt",
          content: "Synthetic output"
        },
        "call-write-001"
      )
    )
  );
  assert.equal(writeResult.status, "simulated_success");
  assert.equal(writeResult.output.path, "sandbox://fixtures/output/result.txt");
  assert.equal(writeResult.output.bytes_written, Buffer.byteLength("Synthetic output"));
  assert.equal(writeResult.evidence.state_change, "virtual_file_write");
  assert.equal(
    state.snapshot().files["sandbox://fixtures/output/result.txt"],
    "Synthetic output"
  );

  const missingResult = executor.execute(
    normalize(
      module,
      request("read_file", {
        path: "sandbox://fixtures/missing.txt"
      })
    )
  );
  assert.equal(missingResult.status, "rejected");
  assert.equal(missingResult.rejection_code, "resource_not_found");

  for (const unsafePath of [
    "sandbox://fixtures/../private.txt",
    "sandbox://fixtures/%2e%2e/private.txt",
    "C:\\Users\\Public\\private.txt"
  ]) {
    const beforeRejectedCall = state.snapshot();
    const rejected = executor.execute(
      normalize(
        module,
        request("write_file", {
          path: unsafePath,
          content: "Must not be written"
        })
      )
    );
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.rejection_code, "target_not_allowed");
    assert.deepEqual(state.snapshot(), beforeRejectedCall);
  }
});

test("REQ-T1-MOCK-TOOLS-004 resolves only injected mock API routes", async () => {
  const module = await importModuleIfExists();
  assert.notEqual(module, null, "simulated-tool executor should exist before API behavior can run");
  if (!module) {
    return;
  }

  const state = new module.InMemorySimulatedToolState({
    api_routes: [
      {
        endpoint: "mock://api.local/status",
        method: "GET",
        status_code: 200,
        body: {
          status: "ok"
        }
      },
      {
        endpoint: "mock://api.local/actions",
        method: "POST",
        status_code: 202,
        body: {
          accepted: "true"
        }
      }
    ]
  });
  const executor = new module.SimulatedToolExecutor(state);
  const beforeCalls = state.snapshot();

  const getResult = executor.execute(
    normalize(
      module,
      request("call_api", {
        endpoint: "mock://api.local/status",
        method: "GET"
      })
    )
  );
  assert.equal(getResult.status, "simulated_success");
  assert.deepEqual(getResult.output, {
    endpoint: "mock://api.local/status",
    method: "GET",
    status_code: 200,
    body: {
      status: "ok"
    }
  });

  const postResult = executor.execute(
    normalize(
      module,
      request("call_api", {
        endpoint: "mock://api.local/actions",
        method: "POST",
        body: {
          operation: "controlled"
        }
      })
    )
  );
  assert.equal(postResult.status, "simulated_success");
  assert.equal(postResult.output.status_code, 202);

  const missingRoute = executor.execute(
    normalize(
      module,
      request("call_api", {
        endpoint: "mock://api.local/missing",
        method: "GET"
      })
    )
  );
  assert.equal(missingRoute.status, "rejected");
  assert.equal(missingRoute.rejection_code, "resource_not_found");

  const externalTarget = executor.execute(
    normalize(
      module,
      request("call_api", {
        endpoint: "https://example.com/status",
        method: "GET"
      })
    )
  );
  assert.equal(externalTarget.status, "rejected");
  assert.equal(externalTarget.rejection_code, "target_not_allowed");
  assert.deepEqual(state.snapshot(), beforeCalls);
});

test("REQ-T1-MOCK-TOOLS-004 implementation has no host I/O or network dependency", async () => {
  assert.ok(existsSync(statePath), "simulated-tool state should exist");
  assert.ok(existsSync(executorPath), "simulated-tool executor should exist");

  const implementation = `${readFileSync(statePath, "utf8")}\n${readFileSync(executorPath, "utf8")}`;
  assert.doesNotMatch(implementation, /from\s+["']node:fs["']/);
  assert.doesNotMatch(implementation, /\bfetch\s*\(/);
  assert.doesNotMatch(implementation, /from\s+["']node:https?["']/);
  assert.doesNotMatch(implementation, /\b(?:smtp|nodemailer)\b/i);
});
