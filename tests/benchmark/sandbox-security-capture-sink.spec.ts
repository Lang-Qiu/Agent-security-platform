import assert from "node:assert/strict";
import test from "node:test";

import {
  createSandboxSecurityCaptureSink,
  SANDBOX_SECURITY_CAPTURE_INPUT_COUNT,
  type SandboxSecurityCaptureAccumulator
} from "../../scripts/benchmark/sandbox-security/capture-sink.ts";
import type { SandboxSecurityCapturedProviderOutcome } from "../../engines/sandbox/src/security-production/benchmark-composition.ts";

const DIGEST =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function successInventory(): SandboxSecurityCapturedProviderOutcome {
  return Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "model_inventory",
    outcome: Object.freeze({
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: Object.freeze({
        model: "qwen3:8b",
        digest: DIGEST
      })
    })
  });
}

function successPrewarm(): SandboxSecurityCapturedProviderOutcome {
  return Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "chat",
    outcome: Object.freeze({
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: Object.freeze({
        model: "qwen3:8b",
        verified_ollama_digest: DIGEST,
        done: true,
        message: Object.freeze({
          role: "assistant",
          parsed: Object.freeze({
            schema_version: "sandbox-security-local-model.v1",
            status: "no_match",
            candidates: Object.freeze([])
          })
        })
      })
    })
  });
}

function failedInventory(): SandboxSecurityCapturedProviderOutcome {
  return Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "model_inventory",
    outcome: Object.freeze({
      status: "http_error",
      http_status: 500
    })
  });
}

function evaluationOllama(
  status: "response" | "not_called" | "http_error" = "response"
): SandboxSecurityCapturedProviderOutcome {
  if (status === "not_called") {
    return Object.freeze({
      capture_phase: "evaluation",
      provider: "ollama",
      operation: "chat",
      outcome: Object.freeze({ status: "not_called" })
    });
  }
  if (status === "http_error") {
    return Object.freeze({
      capture_phase: "evaluation",
      provider: "ollama",
      operation: "chat",
      outcome: Object.freeze({ status: "http_error", http_status: 503 })
    });
  }
  return Object.freeze({
    capture_phase: "evaluation",
    provider: "ollama",
    operation: "chat",
    outcome: Object.freeze({
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: Object.freeze({
        model: "qwen3:8b",
        verified_ollama_digest: DIGEST,
        done: true,
        message: Object.freeze({
          role: "assistant",
          parsed: Object.freeze({
            schema_version: "sandbox-security-local-model.v1",
            status: "matched",
            candidates: Object.freeze([])
          })
        })
      })
    })
  });
}

function evaluationJudge(): SandboxSecurityCapturedProviderOutcome {
  return Object.freeze({
    capture_phase: "evaluation",
    provider: "openai",
    operation: "responses",
    outcome: Object.freeze({
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: Object.freeze({
        model: "gpt-5.4-mini",
        status: "completed",
        parsed: Object.freeze({
          schema_version: "sandbox-security-judge.v1",
          obligation_results: Object.freeze([])
        })
      })
    })
  });
}

function readySink() {
  const sink = createSandboxSecurityCaptureSink();
  sink.record(successInventory());
  sink.record(successPrewarm());
  return sink;
}

function fullDrainSink() {
  const sink = readySink();
  for (let index = 0; index < SANDBOX_SECURITY_CAPTURE_INPUT_COUNT; index += 1) {
    sink.beginInput();
    sink.endInput();
  }
  return sink;
}

test("REQ-SBX-GENERAL-002 sink accepts exactly inventory then prewarm before first input", () => {
  const sink = createSandboxSecurityCaptureSink();
  sink.record(successInventory());
  sink.record(successPrewarm());
  for (let index = 0; index < SANDBOX_SECURITY_CAPTURE_INPUT_COUNT; index += 1) {
    sink.beginInput();
    sink.endInput();
  }
  sink.assertDrained();
  const snap = sink.snapshot();
  assert.equal(snap.state, "drained");
  assert.equal(snap.closed_input_count, 300);
  assert.equal(snap.inputs.length, 300);
});

test("REQ-SBX-GENERAL-002 sink writes explicit not_called for untouched slots", () => {
  const sink = readySink();
  sink.beginInput();
  sink.endInput();
  assert.deepEqual(sink.snapshot().inputs[0], {
    ollama: { status: "not_called" },
    judge: { status: "not_called" }
  });
});

test("REQ-SBX-GENERAL-002 sink records evaluation slots once while open", () => {
  const sink = readySink();
  sink.beginInput();
  sink.record(evaluationOllama());
  sink.record(evaluationJudge());
  sink.endInput();
  const unit = sink.snapshot().inputs[0]!;
  assert.equal(unit.ollama.status, "response");
  assert.equal(unit.judge.status, "response");
});

test("REQ-SBX-GENERAL-002 sink rejects duplicate wrong-phase and boundary records", () => {
  const invalidOps: Array<() => void> = [
    () => {
      const sink = createSandboxSecurityCaptureSink();
      sink.beginInput();
    },
    () => {
      const sink = createSandboxSecurityCaptureSink();
      sink.record(successPrewarm());
    },
    () => {
      const sink = createSandboxSecurityCaptureSink();
      sink.record(failedInventory());
    },
    () => {
      const sink = createSandboxSecurityCaptureSink();
      sink.record(successInventory());
      sink.record(successInventory());
    },
    () => {
      const sink = readySink();
      sink.record(successInventory());
    },
    () => {
      const sink = readySink();
      sink.record(evaluationOllama());
    },
    () => {
      const sink = readySink();
      sink.beginInput();
      sink.record(evaluationOllama());
      sink.record(evaluationOllama());
    },
    () => {
      const sink = readySink();
      sink.beginInput();
      sink.record(evaluationJudge());
      sink.record(evaluationJudge());
    },
    () => {
      const sink = readySink();
      sink.beginInput();
      sink.beginInput();
    },
    () => {
      const sink = readySink();
      sink.endInput();
    },
    () => {
      const sink = readySink();
      sink.assertDrained();
    },
    () => {
      const sink = createSandboxSecurityCaptureSink();
      sink.assertDrained();
    },
    () => {
      const sink = fullDrainSink();
      sink.beginInput();
    },
    () => {
      const sink = readySink();
      sink.beginInput();
      sink.record({
        capture_phase: "evaluation",
        provider: "ollama",
        operation: "chat",
        outcome: { status: "response", http_status: 200, content_type: "application/json", normalized_response: {} },
        fixture_id: "ssb-v1-0001"
      } as never);
    },
    () => {
      const sink = createSandboxSecurityCaptureSink();
      sink.record({
        capture_phase: "qualification",
        provider: "ollama",
        operation: "model_inventory",
        outcome: { status: "bogus" }
      } as never);
    }
  ];

  for (const operation of invalidOps) {
    assert.throws(operation, (error: unknown) => {
      assert.ok(error instanceof TypeError);
      return true;
    });
  }
});

test("REQ-SBX-GENERAL-002 sink freezes snapshot and omits oracle fields", () => {
  const sink = readySink();
  sink.beginInput();
  sink.record(evaluationOllama("http_error"));
  sink.endInput();
  const snap: SandboxSecurityCaptureAccumulator = sink.snapshot();
  assert.equal(Object.isFrozen(snap), true);
  assert.equal(Object.isFrozen(snap.inputs), true);
  assert.equal(Object.isFrozen(snap.inputs[0]), true);
  const serialized = JSON.stringify(snap);
  assert.doesNotMatch(
    serialized,
    /fixture_id|primary_category|ground_truth_severity|verdict_class|SANDBOX_SECURITY_JUDGE_API_KEY/
  );
});

test("REQ-SBX-GENERAL-002 sink fails permanently after malformed qualification", () => {
  const sink = createSandboxSecurityCaptureSink();
  assert.throws(() => sink.record(failedInventory()));
  assert.throws(() => sink.record(successInventory()));
  assert.throws(() => sink.beginInput());
  assert.throws(() => sink.assertDrained());
  assert.equal(sink.snapshot().state, "failed");
});

test("REQ-SBX-GENERAL-002 sink assertDrained requires exactly 300 closed inputs", () => {
  const sink = readySink();
  for (let index = 0; index < 299; index += 1) {
    sink.beginInput();
    sink.endInput();
  }
  assert.throws(() => sink.assertDrained());
  sink.beginInput();
  sink.endInput();
  sink.assertDrained();
  assert.throws(() => sink.assertDrained());
});
