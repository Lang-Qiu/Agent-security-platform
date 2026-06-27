import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "../../..");
const contractPath = resolve(import.meta.dirname, "../src/simulated-tools/contract.ts");
const casesRoot = resolve(repoRoot, "samples/track1/cases");

interface ContractModule {
  SIMULATED_TOOL_NAMES: readonly string[];
  normalizeSimulatedToolRequest(value: unknown): Record<string, unknown> | null;
}

interface Track1Case {
  case_id: string;
  scenario_id: string;
  input: {
    proposed_tool_call: null | {
      tool_name: string;
      arguments: Record<string, unknown>;
    };
  };
}

async function importContractIfExists(): Promise<ContractModule | null> {
  if (!existsSync(contractPath)) {
    return null;
  }

  return import(pathToFileURL(contractPath).href) as Promise<ContractModule>;
}

function createRequest(tool_name: string, argumentsValue: Record<string, unknown>) {
  return {
    call_id: `call-${tool_name}`,
    session_id: "session-track1-contract",
    scenario_id: "T1-SC-002",
    case_id: "T1-SC-002-C001",
    tool_name,
    arguments: argumentsValue
  };
}

test("REQ-T1-MOCK-TOOLS-004 normalizes all four strict simulated-tool request variants", async () => {
  const contract = await importContractIfExists();

  assert.notEqual(contract, null, "simulated-tool contract should exist before requests can be normalized");
  assert.deepEqual(contract?.SIMULATED_TOOL_NAMES, ["send_email", "read_file", "write_file", "call_api"]);

  const requests = [
    createRequest("send_email", {
      recipient: "audit@local.invalid",
      subject: "Controlled audit",
      body: "Synthetic message"
    }),
    createRequest("read_file", {
      path: "sandbox://fixtures/public/readme.txt"
    }),
    createRequest("write_file", {
      path: "sandbox://fixtures/output/result.txt",
      content: "Synthetic output"
    }),
    createRequest("call_api", {
      endpoint: "mock://api.local/status",
      method: "POST",
      body: {
        operation: "status"
      }
    })
  ];

  for (const request of requests) {
    assert.deepEqual(contract?.normalizeSimulatedToolRequest(request), request);
  }
});

test("REQ-T1-MOCK-TOOLS-004 rejects malformed, unknown, and cross-scenario tool requests", async () => {
  const contract = await importContractIfExists();
  assert.notEqual(contract, null, "simulated-tool contract should exist before invalid requests can be rejected");

  const validRequest = createRequest("send_email", {
    recipient: "audit@local.invalid",
    subject: "Controlled audit",
    body: "Synthetic message"
  });

  const invalidRequests = [
    { ...validRequest, unexpected: true },
    { ...validRequest, call_id: "" },
    { ...validRequest, call_id: "../call" },
    { ...validRequest, session_id: "session with spaces" },
    { ...validRequest, scenario_id: "T1-SC-003" },
    { ...validRequest, tool_name: "shell_exec" },
    {
      ...validRequest,
      arguments: {
        ...validRequest.arguments,
        cc: "other@local.invalid"
      }
    },
    createRequest("call_api", {
      endpoint: "mock://api.local/status",
      method: "DELETE"
    }),
    createRequest("call_api", {
      endpoint: "mock://api.local/status",
      method: "POST",
      body: {
        nested: {
          unsupported: true
        }
      }
    })
  ];

  for (const invalidRequest of invalidRequests) {
    assert.equal(contract?.normalizeSimulatedToolRequest(invalidRequest), null);
  }
});

test("REQ-T1-MOCK-TOOLS-004 normalizes proposed tool calls from the Track 1 case set", async () => {
  const contract = await importContractIfExists();
  assert.notEqual(contract, null, "simulated-tool contract should exist before case fixtures can be consumed");

  let proposedToolCallCount = 0;
  for (const scenarioDirectory of readdirSync(casesRoot).filter((name) => name.startsWith("T1-SC-"))) {
    const directoryPath = resolve(casesRoot, scenarioDirectory);
    for (const file of readdirSync(directoryPath).filter((name) => name.endsWith(".json"))) {
      const fixture = JSON.parse(readFileSync(resolve(directoryPath, file), "utf8")) as Track1Case;
      if (fixture.input.proposed_tool_call === null) {
        continue;
      }

      proposedToolCallCount += 1;
      const request = {
        call_id: `call-${fixture.case_id}`,
        session_id: `session-${fixture.scenario_id}`,
        scenario_id: fixture.scenario_id,
        case_id: fixture.case_id,
        ...fixture.input.proposed_tool_call
      };

      assert.notEqual(
        contract?.normalizeSimulatedToolRequest(request),
        null,
        `${fixture.case_id} proposed tool call should satisfy the simulated-tool contract`
      );
    }
  }

  assert.equal(proposedToolCallCount, 6);
});
