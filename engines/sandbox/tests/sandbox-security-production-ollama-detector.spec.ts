import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import type {
  SandboxSecurityHttpRequest,
  SandboxSecurityHttpResponse,
  SandboxSecurityHttpTransport,
  SandboxSecurityPrivateClientRequest,
  SandboxSecurityPrivateIncomingResponse,
  SandboxSecurityPrivateRequestFactory,
  SandboxSecurityPrivateSocket
} from "../src/security-production/http-transport.ts";
import {
  createSandboxSecurityDefaultHttpTransport
} from "../src/security-production/http-transport.ts";
import type {
  RawLocalDetector as CoreRawLocalDetector,
  SandboxSecurityRawDetectorResult,
  SandboxSecurityRawDetectorSnapshot
} from "../src/security/index.ts";
import {
  createSandboxSecurityOllamaChatRequest,
  createSandboxSecurityOllamaPrewarmRequest
} from "../src/security-production/ollama-contract.ts";

interface SandboxSecurityOllamaQualification {
  readonly summary: Readonly<{
    readonly ollama_digest: string;
    readonly warmed_probe_latency_ms: number;
  }>;
}

type OllamaDetectorModule = {
  qualifySandboxSecurityOllama(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    expected_digest: string;
    signal: AbortSignal;
  }>): Promise<Readonly<SandboxSecurityOllamaQualification>>;
  qualifySandboxSecurityP6LiveCaptureOllama(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    expected_digest: string;
    signal: AbortSignal;
  }>): Promise<Readonly<SandboxSecurityOllamaQualification>>;
  createSandboxSecurityOllamaLocalDetector(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    qualification: Readonly<SandboxSecurityOllamaQualification>;
  }>): CoreRawLocalDetector;
};

const ollamaDetectorPath = new URL(
  "../src/security-production/ollama-local-detector.ts",
  import.meta.url
);

const inertOllamaDetectorModule: OllamaDetectorModule = {
  async qualifySandboxSecurityOllama() {
    return Object.freeze({
      summary: Object.freeze({
        ollama_digest: "",
        warmed_probe_latency_ms: Number.NaN
      })
    });
  },
  async qualifySandboxSecurityP6LiveCaptureOllama() {
    return Object.freeze({
      summary: Object.freeze({
        ollama_digest: "",
        warmed_probe_latency_ms: Number.NaN
      })
    });
  },
  createSandboxSecurityOllamaLocalDetector() {
    return Object.freeze({
      async detect() {
        return Object.freeze({
          candidates: Object.freeze([]),
          clearances: Object.freeze([])
        });
      }
    }) as unknown as CoreRawLocalDetector;
  }
};

const ollamaDetectorModule: OllamaDetectorModule = existsSync(ollamaDetectorPath)
  ? ((await import("../src/security-production/ollama-local-detector.ts")) as OllamaDetectorModule)
  : inertOllamaDetectorModule;

const {
  createSandboxSecurityOllamaLocalDetector,
  qualifySandboxSecurityOllama,
  qualifySandboxSecurityP6LiveCaptureOllama
} = ollamaDetectorModule;
const encoder = new TextEncoder();
const DIGEST = `sha256:${"a".repeat(64)}`;

function jsonResponse(
  value: unknown,
  overrides: Partial<SandboxSecurityHttpResponse> = {}
): Readonly<SandboxSecurityHttpResponse> {
  return {
    status: 200,
    content_type: "application/json",
    body: encoder.encode(JSON.stringify(value)),
    ...overrides
  };
}

function inventoryResponse(
  models: readonly unknown[] = [
    { name: "qwen3:8b", model: "qwen3:8b", digest: "a".repeat(64) }
  ],
  overrides: Partial<SandboxSecurityHttpResponse> = {}
): Readonly<SandboxSecurityHttpResponse> {
  return jsonResponse({ models }, overrides);
}

function ollamaEnvelope(
  parsed: Readonly<Record<string, unknown>> = {
    schema_version: "sandbox-security-local-model.v1",
    status: "no_match",
    candidates: []
  }
): Readonly<Record<string, unknown>> {
  return {
    model: "qwen3:8b",
    message: { role: "assistant", content: JSON.stringify(parsed) },
    done: true,
    done_reason: "stop"
  };
}

function prewarmResponse(
  overrides: Partial<SandboxSecurityHttpResponse> = {}
): Readonly<SandboxSecurityHttpResponse> {
  return jsonResponse(ollamaEnvelope(), {
    verified_ollama_digest: DIGEST,
    ...overrides
  });
}

function scriptedTransport(
  handler: (
    input: Readonly<SandboxSecurityHttpRequest>,
    call_index: number
  ) => Promise<Readonly<SandboxSecurityHttpResponse>> | Readonly<SandboxSecurityHttpResponse>
): Readonly<{
  transport: SandboxSecurityHttpTransport;
  calls: SandboxSecurityHttpRequest[];
}> {
  const calls: SandboxSecurityHttpRequest[] = [];
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      calls.push(input);
      return handler(input, calls.length - 1);
    }
  });
  return Object.freeze({ transport, calls });
}

function successfulQualificationTransport(): Readonly<{
  transport: SandboxSecurityHttpTransport;
  calls: SandboxSecurityHttpRequest[];
}> {
  return scriptedTransport((input) =>
    input.operation === "model_inventory"
      ? inventoryResponse()
      : prewarmResponse()
  );
}

async function assertQualificationInvalid(
  action: () => Promise<unknown>,
  forbidden: readonly string[] = []
): Promise<void> {
  let failure: unknown;
  try {
    await action();
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof TypeError, "expected fixed qualification TypeError");
  assert.equal(failure.message, "sandbox_security_ollama_qualification_invalid");
  const exposed = `${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`;
  for (const sentinel of forbidden) {
    assert.equal(exposed.includes(sentinel), false);
  }
}

function assertQualificationView(value: Readonly<SandboxSecurityOllamaQualification>): void {
  assert.deepEqual(Reflect.ownKeys(value), ["summary"]);
  assert.deepEqual(Reflect.ownKeys(value.summary), [
    "ollama_digest",
    "warmed_probe_latency_ms"
  ]);
  assert.equal(value.summary.ollama_digest, DIGEST);
  assert.equal(Number.isFinite(value.summary.warmed_probe_latency_ms), true);
  assert.equal(value.summary.warmed_probe_latency_ms >= 0, true);
  assert.equal(Object.isFrozen(value.summary), true);
  assert.equal(Object.isFrozen(value), true);
}

function assertFactoryInvalid(action: () => unknown): void {
  assert.throws(
    action,
    (error: unknown) =>
      error instanceof TypeError &&
      error.message === "sandbox_security_ollama_qualification_invalid"
  );
}

function snapshotWithTool(
  target: string | null = "build-host"
): SandboxSecurityRawDetectorSnapshot {
  return {
    request_id: "PRIVATE_REQUEST_SENTINEL",
    evaluation_mode: "enforcement",
    stage: "tool_request",
    profile: { private_profile: "PRIVATE_PROFILE_SENTINEL" },
    contents: [
      {
        source_handle: "PRIVATE_SOURCE_HANDLE_1",
        source_id: "PRIVATE_SOURCE_ID_1",
        source_type: "user_input",
        media_type: "text/plain",
        authority_kind: "integration_observation",
        trust_class: "user_supplied",
        value: "RAW_SOURCE_VALUE_SENTINEL_1",
        provenance_ref: "PRIVATE_PROVENANCE_1",
        original_utf8_bytes: [],
        original_value_sha256: "PRIVATE_SOURCE_DIGEST_1",
        comparison_value: "PRIVATE_COMPARISON_1"
      },
      {
        source_handle: "PRIVATE_SOURCE_HANDLE_2",
        source_id: "PRIVATE_SOURCE_ID_2",
        source_type: "retrieved_content",
        media_type: "text/plain",
        authority_kind: "integration_observation",
        trust_class: "untrusted_external",
        value: "RAW_SOURCE_VALUE_SENTINEL_2",
        provenance_ref: "PRIVATE_PROVENANCE_2",
        original_utf8_bytes: [],
        original_value_sha256: "PRIVATE_SOURCE_DIGEST_2",
        comparison_value: "PRIVATE_COMPARISON_2"
      }
    ],
    tool_request: {
      call_handle: "PRIVATE_CALL_HANDLE",
      call_id: "PRIVATE_CALL_ID",
      authority_kind: "integration_observation",
      tool_name: "shell",
      ...(target === null ? {} : { target }),
      arguments: { command: "status" },
      arguments_jcs_sha256: "PRIVATE_ARGUMENT_DIGEST",
      has_target: target !== null
    },
    canonical_request_sha256: "PRIVATE_REQUEST_DIGEST"
  } as unknown as SandboxSecurityRawDetectorSnapshot;
}

function snapshotWithoutTool(): SandboxSecurityRawDetectorSnapshot {
  const snapshot = snapshotWithTool();
  const { tool_request: _toolRequest, ...withoutTool } = snapshot;
  return {
    ...withoutTool,
    stage: "user_input"
  } as SandboxSecurityRawDetectorSnapshot;
}

function parsedLocalModel(
  status: "matched" | "no_match",
  candidates: readonly Readonly<Record<string, unknown>>[]
): Readonly<Record<string, unknown>> {
  return {
    schema_version: "sandbox-security-local-model.v1",
    status,
    candidates
  };
}

function localCandidate(
  category: string,
  confidence: "uncertain" | "probable" | "confident",
  subjectRefs: readonly Readonly<Record<string, unknown>>[],
  severity: "low" | "medium" | "high" | "critical" = "high"
): Readonly<Record<string, unknown>> {
  return {
    category,
    severity,
    confidence,
    subject_refs: subjectRefs
  };
}

function evaluationResponse(
  parsed: Readonly<Record<string, unknown>>,
  overrides: Partial<SandboxSecurityHttpResponse> = {}
): Readonly<SandboxSecurityHttpResponse> {
  return jsonResponse(ollamaEnvelope(parsed), {
    verified_ollama_digest: DIGEST,
    ...overrides
  });
}

async function qualifiedDetector(
  evaluation: (
    input: Readonly<SandboxSecurityHttpRequest>
  ) => Promise<Readonly<SandboxSecurityHttpResponse>> | Readonly<SandboxSecurityHttpResponse>
): Promise<Readonly<{
  detector: CoreRawLocalDetector;
  calls: SandboxSecurityHttpRequest[];
  transport: SandboxSecurityHttpTransport;
}>> {
  let prewarmed = false;
  const scripted = scriptedTransport((input) => {
    if (input.operation === "model_inventory") {
      return inventoryResponse();
    }
    if (!prewarmed) {
      prewarmed = true;
      return prewarmResponse();
    }
    return evaluation(input);
  });
  const qualification = await qualifySandboxSecurityOllama({
    transport: scripted.transport,
    expected_digest: DIGEST,
    signal: new AbortController().signal
  });
  const detector = createSandboxSecurityOllamaLocalDetector({
    transport: scripted.transport,
    qualification
  });
  scripted.calls.length = 0;
  return Object.freeze({
    detector,
    calls: scripted.calls,
    transport: scripted.transport
  });
}

function assertRecursivelyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertRecursivelyFrozen(descriptor.value);
    }
  }
}

async function assertDetectorInvalid(
  action: () => Promise<unknown>,
  forbidden: readonly string[] = []
): Promise<void> {
  let failure: unknown;
  try {
    await action();
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof TypeError, "expected fixed detector TypeError");
  assert.equal(failure.message, "sandbox_security_ollama_detector_invalid");
  const exposed = `${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`;
  for (const sentinel of forbidden) {
    assert.equal(exposed.includes(sentinel), false);
  }
}

class FakeWireSocket implements SandboxSecurityPrivateSocket {
  destroyed = false;

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeWireResponse extends EventEmitter {
  destroyed = false;
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly socket: FakeWireSocket;

  constructor(
    statusCode: number,
    headers: Readonly<Record<string, string>>,
    socket: FakeWireSocket
  ) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
    this.socket = socket;
  }

  destroy(): void {
    this.destroyed = true;
    this.socket.destroy();
  }
}

class FakeWireRequest extends EventEmitter {
  destroyed = false;
  readonly socket = new FakeWireSocket();
  private readonly onEnd: (body: Uint8Array | undefined) => void;

  constructor(onEnd: (body: Uint8Array | undefined) => void) {
    super();
    this.onEnd = onEnd;
  }

  end(body?: Uint8Array): void {
    this.onEnd(body);
  }

  destroy(): void {
    this.destroyed = true;
    this.socket.destroy();
  }
}

interface WirePlan {
  readonly body: Uint8Array;
  readonly status?: number;
}

interface WireRecord {
  readonly method: string;
  readonly path: string;
  readonly signal: AbortSignal;
  body: Uint8Array | undefined;
}

function defaultTransportHarness(plans: readonly WirePlan[]): Readonly<{
  factory: SandboxSecurityPrivateRequestFactory;
  records: WireRecord[];
}> {
  const records: WireRecord[] = [];
  let nextPlan = 0;
  const factory = Object.freeze({
    request(
      url: URL,
      options: Readonly<{
        method: "GET" | "POST";
        headers: Readonly<Record<string, string>>;
        signal: AbortSignal;
      }>,
      onResponse: (response: SandboxSecurityPrivateIncomingResponse) => void
    ): SandboxSecurityPrivateClientRequest {
      const plan = plans[nextPlan];
      nextPlan += 1;
      if (plan === undefined) {
        throw new Error("test_wire_plan_missing");
      }
      const record: WireRecord = {
        method: options.method,
        path: url.pathname,
        signal: options.signal,
        body: undefined
      };
      records.push(record);
      const request = new FakeWireRequest((body) => {
        record.body = body === undefined ? undefined : Uint8Array.from(body);
        const response = new FakeWireResponse(
          plan.status ?? 200,
          Object.freeze({ "content-type": "application/json" }),
          request.socket
        );
        queueMicrotask(() => {
          onResponse(response as unknown as SandboxSecurityPrivateIncomingResponse);
          response.emit("data", plan.body);
          response.emit("end");
        });
      });
      return request as unknown as SandboxSecurityPrivateClientRequest;
    }
  });
  return Object.freeze({ factory, records });
}

test("REQ-SBX-GENERAL-002 qualification accepts one local digest and prewarms with the caller signal", async () => {
  const controller = new AbortController();
  const calls: SandboxSecurityHttpRequest[] = [];
  const transport: SandboxSecurityHttpTransport = {
    async request(input) {
      calls.push(input);
      if (input.operation === "model_inventory") {
        return jsonResponse({
          models: [
            {
              name: "qwen3:8b",
              model: "qwen3:8b",
              digest: "a".repeat(64)
            }
          ]
        });
      }
      return jsonResponse(
        {
          model: "qwen3:8b",
          message: {
            role: "assistant",
            content: JSON.stringify({
              schema_version: "sandbox-security-local-model.v1",
              status: "no_match",
              candidates: []
            })
          },
          done: true,
          done_reason: "stop"
        },
        { verified_ollama_digest: DIGEST }
      );
    }
  };

  const qualification = await qualifySandboxSecurityOllama({
    transport,
    expected_digest: DIGEST,
    signal: controller.signal
  });

  assert.deepEqual(
    calls.map(({ operation, signal }) => ({ operation, signal })),
    [
      { operation: "model_inventory", signal: controller.signal },
      { operation: "chat", signal: controller.signal }
    ]
  );
  assert.deepEqual(calls[0], {
    provider: "ollama",
    operation: "model_inventory",
    signal: controller.signal,
    max_response_bytes: 65536
  });
  assert.deepEqual(calls[1], {
    provider: "ollama",
    operation: "chat",
    body: createSandboxSecurityOllamaPrewarmRequest().body,
    signal: controller.signal,
    max_response_bytes: 65536
  });
  assertQualificationView(qualification);
});

test("REQ-SBX-GENERAL-002 qualification rejects absent duplicate remote and malformed inventory before prewarm", async () => {
  const invalidCases: readonly Readonly<{
    name: string;
    response: Readonly<SandboxSecurityHttpResponse>;
  }>[] = [
    { name: "absent", response: inventoryResponse([]) },
    {
      name: "duplicate",
      response: inventoryResponse([
        { name: "qwen3:8b", model: "qwen3:8b", digest: "a".repeat(64) },
        { name: "qwen3:8b", model: "qwen3:8b", digest: "a".repeat(64) }
      ])
    },
    {
      name: "remote_model",
      response: inventoryResponse([
        {
          name: "qwen3:8b",
          model: "qwen3:8b",
          digest: "a".repeat(64),
          remote_model: "qwen3:8b"
        }
      ])
    },
    {
      name: "remote_host",
      response: inventoryResponse([
        {
          name: "qwen3:8b",
          model: "qwen3:8b",
          digest: "a".repeat(64),
          remote_host: "https://remote.invalid"
        }
      ])
    },
    {
      name: "name mismatch",
      response: inventoryResponse([
        { name: "qwen3:latest", model: "qwen3:8b", digest: "a".repeat(64) }
      ])
    },
    {
      name: "model mismatch",
      response: inventoryResponse([
        { name: "qwen3:8b", model: "qwen3:latest", digest: "a".repeat(64) }
      ])
    },
    {
      name: "wire digest grammar",
      response: inventoryResponse([
        { name: "qwen3:8b", model: "qwen3:8b", digest: "A".repeat(64) }
      ])
    },
    { name: "missing models", response: jsonResponse({}) },
    {
      name: "malformed JSON",
      response: {
        status: 200,
        content_type: "application/json",
        body: encoder.encode('{"models":[')
      }
    },
    {
      name: "fatal UTF-8",
      response: {
        status: 200,
        content_type: "application/json",
        body: new Uint8Array([0xff])
      }
    },
    {
      name: "oversize",
      response: {
        status: 200,
        content_type: "application/json",
        body: new Uint8Array(65537)
      }
    },
    {
      name: "non-200",
      response: inventoryResponse(undefined, { status: 204 })
    },
    {
      name: "wrong content type",
      response: inventoryResponse(undefined, { content_type: "text/plain" })
    },
    {
      name: "verified side channel",
      response: inventoryResponse(undefined, { verified_ollama_digest: DIGEST })
    }
  ];

  for (const invalidCase of invalidCases) {
    const { transport, calls } = scriptedTransport(() => invalidCase.response);
    await assertQualificationInvalid(
      () => qualifySandboxSecurityOllama({
        transport,
        expected_digest: DIGEST,
        signal: new AbortController().signal
      }),
      [invalidCase.name, "remote.invalid"]
    );
    assert.equal(calls.length, 1, `${invalidCase.name} must stop before prewarm`);
    assert.equal(calls[0]?.operation, "model_inventory");
  }
});

test("REQ-SBX-GENERAL-002 qualification rejects digest mismatch with zero prewarm calls", async () => {
  const { transport, calls } = scriptedTransport(() =>
    inventoryResponse([
      { name: "qwen3:8b", model: "qwen3:8b", digest: "b".repeat(64) }
    ])
  );

  await assertQualificationInvalid(() =>
    qualifySandboxSecurityOllama({
      transport,
      expected_digest: DIGEST,
      signal: new AbortController().signal
    })
  );

  assert.deepEqual(calls.map((call) => call.operation), ["model_inventory"]);
});

test("REQ-SBX-GENERAL-002 qualification accepts the exact 64 KiB inventory boundary and ignores unrelated remote records", async () => {
  const inventory = {
    models: [
      {
        name: "other:latest",
        model: "other:latest",
        digest: "b".repeat(64),
        remote_model: "other:latest",
        remote_host: "https://remote.invalid"
      },
      { name: "qwen3:8b", model: "qwen3:8b", digest: "a".repeat(64) }
    ]
  };
  const serialized = JSON.stringify(inventory);
  const boundaryBody = encoder.encode(serialized + " ".repeat(65536 - serialized.length));
  const { transport } = scriptedTransport((input) =>
    input.operation === "model_inventory"
      ? {
          status: 200,
          content_type: "application/json",
          body: boundaryBody
        }
      : prewarmResponse()
  );

  const qualification = await qualifySandboxSecurityOllama({
    transport,
    expected_digest: DIGEST,
    signal: new AbortController().signal
  });

  assertQualificationView(qualification);
});

test("REQ-SBX-GENERAL-002 qualification rejects response accessors without invoking them", async () => {
  let bodyReads = 0;
  const hostileResponse = {
    status: 200,
    content_type: "application/json",
    get body() {
      bodyReads += 1;
      return encoder.encode("{}");
    }
  } as unknown as SandboxSecurityHttpResponse;
  const { transport } = scriptedTransport(() => hostileResponse);

  await assertQualificationInvalid(() =>
    qualifySandboxSecurityOllama({
      transport,
      expected_digest: DIGEST,
      signal: new AbortController().signal
    })
  );

  assert.equal(bodyReads, 0);
});

test("REQ-SBX-GENERAL-002 qualification sends only the P2-T4 prewarm body and validates its response digest", async () => {
  const { transport, calls } = successfulQualificationTransport();

  await qualifySandboxSecurityOllama({
    transport,
    expected_digest: DIGEST,
    signal: new AbortController().signal
  });

  const prewarm = calls[1];
  assert.equal(prewarm?.operation, "chat");
  assert.deepEqual(
    prewarm?.operation === "chat" ? prewarm.body : undefined,
    createSandboxSecurityOllamaPrewarmRequest().body
  );

  const invalidCases: readonly Readonly<{
    name: string;
    response: Readonly<SandboxSecurityHttpResponse>;
  }>[] = [
    { name: "non-200", response: prewarmResponse({ status: 201 }) },
    {
      name: "wrong content type",
      response: prewarmResponse({ content_type: "application/json; charset=utf-8" })
    },
    {
      name: "missing verified digest",
      response: jsonResponse(ollamaEnvelope())
    },
    {
      name: "wrong verified digest",
      response: prewarmResponse({
        verified_ollama_digest: `sha256:${"b".repeat(64)}`
      })
    },
    {
      name: "invalid envelope",
      response: jsonResponse({ provider_prose: "RAW_PREWARM_SENTINEL" }, {
        verified_ollama_digest: DIGEST
      })
    },
    {
      name: "oversize",
      response: {
        status: 200,
        content_type: "application/json",
        body: new Uint8Array(65537),
        verified_ollama_digest: DIGEST
      }
    }
  ];

  for (const invalidCase of invalidCases) {
    const scripted = scriptedTransport((input) =>
      input.operation === "model_inventory"
        ? inventoryResponse()
        : invalidCase.response
    );
    await assertQualificationInvalid(
      () => qualifySandboxSecurityOllama({
        transport: scripted.transport,
        expected_digest: DIGEST,
        signal: new AbortController().signal
      }),
      ["RAW_PREWARM_SENTINEL", invalidCase.name]
    );
    assert.deepEqual(
      scripted.calls.map((call) => call.operation),
      ["model_inventory", "chat"]
    );
  }
});

test("REQ-SBX-GENERAL-002 qualification validates expected digest before transport and propagates transport failures", async () => {
  for (const invalidDigest of [
    "a".repeat(64),
    `SHA256:${"a".repeat(64)}`,
    `sha256:${"A".repeat(64)}`,
    `sha256:${"a".repeat(63)}`,
    ` sha256:${"a".repeat(64)}`
  ]) {
    const scripted = successfulQualificationTransport();
    await assertQualificationInvalid(() =>
      qualifySandboxSecurityOllama({
        transport: scripted.transport,
        expected_digest: invalidDigest,
        signal: new AbortController().signal
      })
    );
    assert.equal(scripted.calls.length, 0);
  }

  for (const failingOperation of ["model_inventory", "chat"] as const) {
    const transportFailure = new Error(`transport-${failingOperation}-sentinel`);
    const scripted = scriptedTransport((input) => {
      if (input.operation === failingOperation) {
        throw transportFailure;
      }
      return inventoryResponse();
    });
    await assert.rejects(
      () => qualifySandboxSecurityOllama({
        transport: scripted.transport,
        expected_digest: DIGEST,
        signal: new AbortController().signal
      }),
      (error: unknown) => error === transportFailure
    );
  }
});

test("REQ-SBX-GENERAL-002 qualification abort-first and stage races never publish proof", async () => {
  const preAborted = new AbortController();
  preAborted.abort(new Error("RAW_ABORT_REASON_SENTINEL"));
  const untouched = successfulQualificationTransport();
  await assertQualificationInvalid(
    () => qualifySandboxSecurityOllama({
      transport: untouched.transport,
      expected_digest: DIGEST,
      signal: preAborted.signal
    }),
    ["RAW_ABORT_REASON_SENTINEL"]
  );
  assert.equal(untouched.calls.length, 0);

  const inventoryRaceController = new AbortController();
  const inventoryRace = scriptedTransport((input) => {
    if (input.operation === "model_inventory") {
      inventoryRaceController.abort(new Error("RAW_INVENTORY_ABORT_SENTINEL"));
      return inventoryResponse();
    }
    return prewarmResponse();
  });
  await assertQualificationInvalid(
    () => qualifySandboxSecurityOllama({
      transport: inventoryRace.transport,
      expected_digest: DIGEST,
      signal: inventoryRaceController.signal
    }),
    ["RAW_INVENTORY_ABORT_SENTINEL"]
  );
  assert.deepEqual(inventoryRace.calls.map((call) => call.operation), [
    "model_inventory"
  ]);

  const prewarmRaceController = new AbortController();
  const prewarmRace = scriptedTransport((input) => {
    if (input.operation === "chat") {
      prewarmRaceController.abort(new Error("RAW_PREWARM_ABORT_SENTINEL"));
      return prewarmResponse();
    }
    return inventoryResponse();
  });
  await assertQualificationInvalid(
    () => qualifySandboxSecurityOllama({
      transport: prewarmRace.transport,
      expected_digest: DIGEST,
      signal: prewarmRaceController.signal
    }),
    ["RAW_PREWARM_ABORT_SENTINEL"]
  );
});

test("REQ-SBX-GENERAL-002 qualification latency measures only the monotonic prewarm interval", async () => {
  const totalStart = performance.now();
  const scripted = scriptedTransport((input) => {
    if (input.operation === "model_inventory") {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
      return inventoryResponse();
    }
    return prewarmResponse();
  });

  const qualification = await qualifySandboxSecurityOllama({
    transport: scripted.transport,
    expected_digest: DIGEST,
    signal: new AbortController().signal
  });
  const totalLatency = performance.now() - totalStart;

  assert.ok(totalLatency >= 70);
  assert.ok(
    totalLatency - qualification.summary.warmed_probe_latency_ms >= 60,
    "inventory time must not be counted as warmed probe latency"
  );
});

test("REQ-SBX-GENERAL-002 ordinary qualification rejects a validated prewarm latency over 1000 ms", { concurrency: false }, async () => {
  const performanceObject = globalThis.performance;
  const originalNow = Object.getOwnPropertyDescriptor(performanceObject, "now");
  let nowReads = 0;
  Object.defineProperty(performanceObject, "now", {
    configurable: true,
    value() {
      nowReads += 1;
      return nowReads === 1 ? 0 : 1001;
    }
  });

  try {
    const scripted = successfulQualificationTransport();
    await assertQualificationInvalid(() =>
      qualifySandboxSecurityOllama({
        transport: scripted.transport,
        expected_digest: DIGEST,
        signal: new AbortController().signal
      })
    );
  } finally {
    if (originalNow === undefined) {
      Reflect.deleteProperty(performanceObject, "now");
    } else {
      Object.defineProperty(performanceObject, "now", originalNow);
    }
  }
});

test("REQ-SBX-GENERAL-002 only the P6 live-capture adapter admits the approved 1001..20000 ms prewarm interval", { concurrency: false }, async () => {
  const performanceObject = globalThis.performance;
  const originalNow = Object.getOwnPropertyDescriptor(performanceObject, "now");
  let warmedProbeLatency = 1001;
  let nowReads = 0;
  Object.defineProperty(performanceObject, "now", {
    configurable: true,
    value() {
      nowReads += 1;
      return nowReads === 1 ? 0 : warmedProbeLatency;
    }
  });

  try {
    const callerRelaxedQualification = qualifySandboxSecurityOllama as unknown as (
      input: Readonly<{
        transport: SandboxSecurityHttpTransport;
        expected_digest: string;
        signal: AbortSignal;
      }>,
      warmedProbeLatencyLimitMs: number
    ) => Promise<Readonly<SandboxSecurityOllamaQualification>>;
    const ordinary = successfulQualificationTransport();
    await assertQualificationInvalid(() =>
      callerRelaxedQualification(
        {
          transport: ordinary.transport,
          expected_digest: DIGEST,
          signal: new AbortController().signal
        },
        20000
      )
    );

    if (typeof qualifySandboxSecurityP6LiveCaptureOllama !== "function") {
      assert.fail("missing P6-only live-capture qualification adapter");
    }
    nowReads = 0;
    const live = await qualifySandboxSecurityP6LiveCaptureOllama({
      transport: successfulQualificationTransport().transport,
      expected_digest: DIGEST,
      signal: new AbortController().signal
    });
    assert.equal(live.summary.warmed_probe_latency_ms, 1001);

    nowReads = 0;
    warmedProbeLatency = 20001;
    await assertQualificationInvalid(() =>
      qualifySandboxSecurityP6LiveCaptureOllama({
        transport: successfulQualificationTransport().transport,
        expected_digest: DIGEST,
        signal: new AbortController().signal
      })
    );
  } finally {
    if (originalNow === undefined) {
      Reflect.deleteProperty(performanceObject, "now");
    } else {
      Object.defineProperty(performanceObject, "now", originalNow);
    }
  }
});

test("REQ-SBX-GENERAL-002 qualification latency ends after complete P2-T4 prewarm parsing", { concurrency: false }, async () => {
  const performanceObject = globalThis.performance;
  const originalNow = Object.getOwnPropertyDescriptor(performanceObject, "now");
  const originalJsonParse = Object.getOwnPropertyDescriptor(JSON, "parse");
  assert.ok(originalJsonParse !== undefined && "value" in originalJsonParse);
  const parse = originalJsonParse.value as typeof JSON.parse;
  let nowReads = 0;
  let prewarmContentParsed = false;

  Object.defineProperty(JSON, "parse", {
    ...originalJsonParse,
    value(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) {
      const parsed = Reflect.apply(parse, JSON, [text, reviver]);
      if (
        text.includes('"schema_version":"sandbox-security-local-model.v1"') &&
        text.includes('"status":"no_match"')
      ) {
        prewarmContentParsed = true;
      }
      return parsed;
    }
  });
  Object.defineProperty(performanceObject, "now", {
    configurable: true,
    value() {
      nowReads += 1;
      if (nowReads === 1) {
        return 0;
      }
      return prewarmContentParsed ? 20 : 10;
    }
  });

  try {
    const scripted = successfulQualificationTransport();
    const qualification = await qualifySandboxSecurityOllama({
      transport: scripted.transport,
      expected_digest: DIGEST,
      signal: new AbortController().signal
    });

    assert.equal(prewarmContentParsed, true);
    assert.equal(qualification.summary.warmed_probe_latency_ms, 20);
  } finally {
    Object.defineProperty(JSON, "parse", originalJsonParse);
    if (originalNow === undefined) {
      Reflect.deleteProperty(performanceObject, "now");
    } else {
      Object.defineProperty(performanceObject, "now", originalNow);
    }
  }
});

test("REQ-SBX-GENERAL-002 qualification proof is exact-identity transport-bound and one-use", async () => {
  const scripted = successfulQualificationTransport();
  const other = successfulQualificationTransport();
  const proof = await qualifySandboxSecurityOllama({
    transport: scripted.transport,
    expected_digest: DIGEST,
    signal: new AbortController().signal
  });

  assertFactoryInvalid(() =>
    createSandboxSecurityOllamaLocalDetector({
      transport: other.transport,
      qualification: proof
    })
  );
  const detector = createSandboxSecurityOllamaLocalDetector({
    transport: scripted.transport,
    qualification: proof
  });
  assert.equal(typeof detector.detect, "function");
  assert.equal(Object.isFrozen(detector), true);
  assertFactoryInvalid(() =>
    createSandboxSecurityOllamaLocalDetector({
      transport: scripted.transport,
      qualification: proof
    })
  );
});

test("REQ-SBX-GENERAL-002 copied cloned proxied forged and cross-realm proof views are inert without consuming the original", async () => {
  const scripted = successfulQualificationTransport();
  const proof = await qualifySandboxSecurityOllama({
    transport: scripted.transport,
    expected_digest: DIGEST,
    signal: new AbortController().signal
  });
  const crossRealm = runInNewContext(
    `({ summary: { ollama_digest: "${DIGEST}", warmed_probe_latency_ms: 0 } })`
  ) as SandboxSecurityOllamaQualification;
  const invalidProofs: readonly SandboxSecurityOllamaQualification[] = [
    { ...proof },
    structuredClone(proof),
    new Proxy(proof, {}),
    Object.freeze({
      summary: Object.freeze({
        ollama_digest: DIGEST,
        warmed_probe_latency_ms: proof.summary.warmed_probe_latency_ms
      })
    }),
    crossRealm
  ];

  for (const invalidProof of invalidProofs) {
    assertFactoryInvalid(() =>
      createSandboxSecurityOllamaLocalDetector({
        transport: scripted.transport,
        qualification: invalidProof
      })
    );
  }

  assert.equal(
    typeof createSandboxSecurityOllamaLocalDetector({
      transport: scripted.transport,
      qualification: proof
    }).detect,
    "function"
  );
});

test("REQ-SBX-GENERAL-002 each qualification publishes a fresh construction generation", async () => {
  const scripted = successfulQualificationTransport();
  const first = await qualifySandboxSecurityOllama({
    transport: scripted.transport,
    expected_digest: DIGEST,
    signal: new AbortController().signal
  });
  const second = await qualifySandboxSecurityOllama({
    transport: scripted.transport,
    expected_digest: DIGEST,
    signal: new AbortController().signal
  });

  assert.notEqual(first, second);
  assert.notEqual(first.summary, second.summary);
  assert.equal(
    typeof createSandboxSecurityOllamaLocalDetector({
      transport: scripted.transport,
      qualification: second
    }).detect,
    "function"
  );
  assert.equal(
    typeof createSandboxSecurityOllamaLocalDetector({
      transport: scripted.transport,
      qualification: first
    }).detect,
    "function"
  );
});

test("REQ-SBX-GENERAL-002 detector sends one logical chat with the Engine signal and returns fresh frozen no_match", async () => {
  const snapshot = snapshotWithTool();
  const harness = await qualifiedDetector(() =>
    evaluationResponse(parsedLocalModel("no_match", []))
  );
  const controller = new AbortController();

  const first = await harness.detector.detect(snapshot, controller.signal);
  const second = await harness.detector.detect(snapshot, controller.signal);

  assert.deepEqual(first, { candidates: [], clearances: [] });
  assert.deepEqual(second, { candidates: [], clearances: [] });
  assert.notEqual(first, second);
  assert.notEqual(first.candidates, second.candidates);
  assert.notEqual(first.clearances, second.clearances);
  assertRecursivelyFrozen(first);
  assertRecursivelyFrozen(second);
  assert.equal(harness.calls.length, 2);
  for (const call of harness.calls) {
    assert.deepEqual(call, {
      provider: "ollama",
      operation: "chat",
      body: createSandboxSecurityOllamaChatRequest(snapshot).body,
      signal: controller.signal,
      max_response_bytes: 65536
    });
  }
});

test("REQ-SBX-GENERAL-002 detector maps all categories confidence labels and content ordinals in model order", async () => {
  const categories = [
    "prompt_injection",
    "jailbreak",
    "instruction_override",
    "privilege_escalation",
    "sensitive_data_exposure",
    "tool_hijacking",
    "unsafe_side_effect",
    "memory_poisoning",
    "trust_boundary_violation"
  ] as const;
  const labels = ["uncertain", "probable", "confident"] as const;
  const confidence = { uncertain: 0.6, probable: 0.8, confident: 0.9 } as const;
  const snapshot = snapshotWithTool();
  const parsedCandidates = categories.map((category, index) =>
    localCandidate(category, labels[index % labels.length]!, [
      {
        kind: "content_source",
        source_ordinal: (index % 2) + 1,
        component: "whole_source"
      }
    ], index % 2 === 0 ? "high" : "critical")
  );
  const harness = await qualifiedDetector(() =>
    evaluationResponse(parsedLocalModel("matched", parsedCandidates))
  );

  const result = await harness.detector.detect(
    snapshot,
    new AbortController().signal
  );

  assert.deepEqual(
    result.candidates,
    categories.map((category, index) => ({
      category,
      severity: index % 2 === 0 ? "high" : "critical",
      confidence: confidence[labels[index % labels.length]!],
      reason_code: `sandbox_security_${category}`,
      subject_refs: [
        {
          kind: "content_source",
          source_handle: snapshot.contents[index % 2]!.source_handle,
          locator: { kind: "whole_source" }
        }
      ]
    }))
  );
  assert.deepEqual(result.clearances, []);
  assertRecursivelyFrozen(result);
});

test("REQ-SBX-GENERAL-002 detector maps whole tool call name target and arguments to the current call handle", async () => {
  const snapshot = snapshotWithTool();
  const harness = await qualifiedDetector(() =>
    evaluationResponse(parsedLocalModel("matched", [
      localCandidate("tool_hijacking", "probable", [
        { kind: "tool_request", component: "whole_call" },
        { kind: "tool_request", component: "tool_name" },
        { kind: "tool_request", component: "target" },
        { kind: "tool_request", component: "arguments" }
      ])
    ]))
  );

  const result = await harness.detector.detect(
    snapshot,
    new AbortController().signal
  );

  assert.deepEqual(result, {
    candidates: [
      {
        category: "tool_hijacking",
        severity: "high",
        confidence: 0.8,
        reason_code: "sandbox_security_tool_hijacking",
        subject_refs: [
          {
            kind: "tool_request",
            call_handle: snapshot.tool_request!.call_handle,
            component: "whole_call"
          },
          {
            kind: "tool_request",
            call_handle: snapshot.tool_request!.call_handle,
            component: "tool_name"
          },
          {
            kind: "tool_request",
            call_handle: snapshot.tool_request!.call_handle,
            component: "target"
          },
          {
            kind: "tool_request",
            call_handle: snapshot.tool_request!.call_handle,
            component: "arguments",
            locator: { kind: "whole_arguments" }
          }
        ]
      }
    ],
    clearances: []
  });
  assertRecursivelyFrozen(result);
});

test("REQ-SBX-GENERAL-002 detector rejects out-of-snapshot content and unavailable tool projections", async () => {
  const cases: readonly Readonly<{
    name: string;
    snapshot: SandboxSecurityRawDetectorSnapshot;
    subject_ref: Readonly<Record<string, unknown>>;
  }>[] = [
    {
      name: "content ordinal",
      snapshot: snapshotWithTool(),
      subject_ref: {
        kind: "content_source",
        source_ordinal: 3,
        component: "whole_source"
      }
    },
    {
      name: "missing tool",
      snapshot: snapshotWithoutTool(),
      subject_ref: { kind: "tool_request", component: "whole_call" }
    },
    {
      name: "missing target",
      snapshot: snapshotWithTool(null),
      subject_ref: { kind: "tool_request", component: "target" }
    },
    {
      name: "unprojected empty target",
      snapshot: snapshotWithTool(""),
      subject_ref: { kind: "tool_request", component: "target" }
    }
  ];

  for (const invalidCase of cases) {
    const harness = await qualifiedDetector(() =>
      evaluationResponse(parsedLocalModel("matched", [
        localCandidate("tool_hijacking", "confident", [invalidCase.subject_ref])
      ]))
    );
    await assertDetectorInvalid(
      () => harness.detector.detect(
        invalidCase.snapshot,
        new AbortController().signal
      ),
      [invalidCase.name, "RAW_SOURCE_VALUE_SENTINEL"]
    );
  }
});

test("REQ-SBX-GENERAL-002 detector requires HTTP 200 JSON and the qualified digest on every chat", async () => {
  const invalidCases: readonly Readonly<{
    name: string;
    response: Readonly<SandboxSecurityHttpResponse>;
  }>[] = [
    {
      name: "non-200",
      response: evaluationResponse(parsedLocalModel("no_match", []), { status: 204 })
    },
    {
      name: "content type",
      response: evaluationResponse(parsedLocalModel("no_match", []), {
        content_type: "text/plain"
      })
    },
    {
      name: "missing digest",
      response: jsonResponse(ollamaEnvelope(parsedLocalModel("no_match", [])))
    },
    {
      name: "wrong digest",
      response: evaluationResponse(parsedLocalModel("no_match", []), {
        verified_ollama_digest: `sha256:${"b".repeat(64)}`
      })
    },
    {
      name: "invalid response",
      response: jsonResponse({ provider_prose: "RAW_PROVIDER_SENTINEL" }, {
        verified_ollama_digest: DIGEST
      })
    },
    {
      name: "oversize",
      response: {
        status: 200,
        content_type: "application/json",
        body: new Uint8Array(65537),
        verified_ollama_digest: DIGEST
      }
    }
  ];

  for (const invalidCase of invalidCases) {
    const harness = await qualifiedDetector(() => invalidCase.response);
    await assertDetectorInvalid(
      () => harness.detector.detect(
        snapshotWithTool(),
        new AbortController().signal
      ),
      ["RAW_PROVIDER_SENTINEL", invalidCase.name]
    );
    assert.equal(harness.calls.length, 1);
  }
});

test("REQ-SBX-GENERAL-002 detector propagates transport abort and error identities without retaining provider data", async () => {
  for (const transportFailure of [
    Object.assign(new Error("sandbox_security_transport_aborted"), {
      name: "sandbox_security_transport_aborted"
    }),
    new Error("RAW_TRANSPORT_ERROR_SENTINEL")
  ]) {
    const harness = await qualifiedDetector(() => {
      throw transportFailure;
    });
    await assert.rejects(
      () => harness.detector.detect(
        snapshotWithTool(),
        new AbortController().signal
      ),
      (error: unknown) => error === transportFailure
    );
    assert.equal(harness.calls.length, 1);
  }
});

test("REQ-SBX-GENERAL-002 detector result contains no model digest provider prose or source values", async () => {
  const snapshot = snapshotWithTool();
  const harness = await qualifiedDetector(() =>
    evaluationResponse(parsedLocalModel("matched", [
      localCandidate("prompt_injection", "uncertain", [
        { kind: "content_source", source_ordinal: 1, component: "whole_source" }
      ])
    ]))
  );

  const result: SandboxSecurityRawDetectorResult = await harness.detector.detect(
    snapshot,
    new AbortController().signal
  );
  const serialized = JSON.stringify(result);

  assert.doesNotMatch(
    serialized,
    /qwen3|sha256|RAW_SOURCE_VALUE|provider|prose|verified_ollama_digest/i
  );
  assert.match(serialized, /PRIVATE_SOURCE_HANDLE_1/);
});

test("REQ-SBX-GENERAL-002 default transport performs fixed GET to POST and blocks detector raw POST on digest drift", async () => {
  const inventoryA = encoder.encode(JSON.stringify({
    models: [
      { name: "qwen3:8b", model: "qwen3:8b", digest: "a".repeat(64) }
    ]
  }));
  const inventoryB = encoder.encode(JSON.stringify({
    models: [
      { name: "qwen3:8b", model: "qwen3:8b", digest: "b".repeat(64) }
    ]
  }));
  const validChat = encoder.encode(JSON.stringify(ollamaEnvelope(
    parsedLocalModel("no_match", [])
  )));
  const wire = defaultTransportHarness([
    { body: inventoryA },
    { body: inventoryA },
    { body: validChat },
    { body: inventoryB }
  ]);
  const transport = createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: DIGEST,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: wire.factory
  });
  const qualificationController = new AbortController();
  const qualification = await qualifySandboxSecurityOllama({
    transport,
    expected_digest: DIGEST,
    signal: qualificationController.signal
  });
  const detector = createSandboxSecurityOllamaLocalDetector({
    transport,
    qualification
  });
  const detectorController = new AbortController();

  await assert.rejects(
    () => detector.detect(snapshotWithTool(), detectorController.signal),
    { name: "sandbox_security_transport_digest_mismatch" }
  );

  assert.deepEqual(
    wire.records.map(({ method, path }) => ({ method, path })),
    [
      { method: "GET", path: "/api/tags" },
      { method: "GET", path: "/api/tags" },
      { method: "POST", path: "/api/chat" },
      { method: "GET", path: "/api/tags" }
    ]
  );
  assert.deepEqual(wire.records[2]?.body, createSandboxSecurityOllamaPrewarmRequest().body);
  assert.equal(wire.records[0]?.signal, qualificationController.signal);
  assert.equal(wire.records[1]?.signal, qualificationController.signal);
  assert.equal(wire.records[2]?.signal, qualificationController.signal);
  assert.equal(wire.records[3]?.signal, detectorController.signal);
  assert.equal(
    wire.records.some((record) =>
      record.body !== undefined &&
      new TextDecoder().decode(record.body).includes("RAW_SOURCE_VALUE_SENTINEL")
    ),
    false
  );
});

test("REQ-SBX-GENERAL-002 Ollama adapter has no network environment timer benchmark log or core-deep-import capability", () => {
  const source = readFileSync(ollamaDetectorPath, "utf8");

  assert.doesNotMatch(source, /node:(?:http|https|net|tls|dns|child_process)/);
  assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|process\.getBuiltinModule/);
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval)\s*\(|AbortSignal\.timeout/);
  assert.doesNotMatch(source, /benchmark|fixture_id|truth|capture_sink|replay_transport/i);
  assert.doesNotMatch(source, /\b(?:console\.|eval\s*\(|Function\s*\(|import\s*\()/);
  assert.doesNotMatch(source, /from\s+["']\.\.\/security\/(?!index\.ts["'])/);
  assert.doesNotMatch(source, /\/api\/pull|ollama\s+pull/i);
});
