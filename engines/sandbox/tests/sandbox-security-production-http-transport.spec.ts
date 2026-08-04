import assert from "node:assert/strict";
import { EventEmitter, getEventListeners } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const transportPath = new URL(
  "../src/security-production/http-transport.ts",
  import.meta.url
);

type JudgeProtocolId =
  | "openai_responses_v1"
  | "openai_chat_completions_json_v1";

type HttpRequestInput =
  | Readonly<{
      provider: "ollama";
      operation: "model_inventory" | "chat";
      body?: Uint8Array;
      signal: AbortSignal;
      max_response_bytes: 65536;
    }>
  | Readonly<{
      provider: "openai";
      operation: "responses" | "chat_completions";
      body: Uint8Array;
      signal: AbortSignal;
      max_response_bytes: 65536;
    }>;

type TransportModule = {
  equalSandboxSecurityNormalizedDigest?: (left: string, right: string) => boolean;
  createSandboxSecurityDefaultHttpTransport(input: Readonly<{
    expected_ollama_digest: string | null;
    judge_protocol_id: JudgeProtocolId | null;
    judge_api_key: string | null;
    judge_endpoint_url: string | null;
    request_factory?: unknown;
  }>): Readonly<{
    request(input: HttpRequestInput): Promise<unknown>;
  }>;
};

const inertTransportModule: TransportModule = {
  createSandboxSecurityDefaultHttpTransport() {
    return Object.freeze({
      async request(): Promise<unknown> {
        return Object.freeze({
          status: 200,
          content_type: "application/json",
          body: new Uint8Array()
        });
      }
    });
  }
};

const transportModule: TransportModule = existsSync(transportPath)
  ? ((await import("../src/security-production/http-transport.ts")) as TransportModule)
  : inertTransportModule;

const equalSandboxSecurityNormalizedDigest =
  transportModule.equalSandboxSecurityNormalizedDigest ?? (() => false);

test("REQ-SBX-GENERAL-002 normalized digest comparator accepts identical digests", () => {
  const digest = `sha256:${"a".repeat(64)}`;

  assert.equal(equalSandboxSecurityNormalizedDigest(digest, digest), true);
});

test("REQ-SBX-GENERAL-002 normalized digest comparator rejects mismatches and malformed digests", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const invalidComparisons = [
    ["first mismatch", `sha256:b${"a".repeat(63)}`],
    ["middle mismatch", `sha256:${"a".repeat(32)}b${"a".repeat(31)}`],
    ["last mismatch", `sha256:${"a".repeat(63)}b`],
    ["prefix", digest.slice(0, -1)],
    ["case", `sha256:${"A".repeat(64)}`],
    ["length", `${digest}0`],
    ["nonhex", `sha256:g${"a".repeat(63)}`],
    ["whitespace", ` ${digest} `]
  ] as const;

  for (const [scenario, candidate] of invalidComparisons) {
    assert.equal(
      equalSandboxSecurityNormalizedDigest(candidate, digest),
      false,
      scenario
    );
    assert.equal(
      equalSandboxSecurityNormalizedDigest(digest, candidate),
      false,
      `${scenario} reversed`
    );
  }
});

test("REQ-SBX-GENERAL-002 transport delegates digest equality to node crypto timingSafeEqual", () => {
  const source = readFileSync(transportPath, "utf8");

  assert.match(
    source,
    /import\s+\{\s*timingSafeEqual\s*\}\s+from\s+"node:crypto";/
  );
  assert.match(source, /timingSafeEqual\s*\(/);
  assert.doesNotMatch(source, /left\.length\s*\^\s*right\.length/);
  assert.doesNotMatch(source, /charCodeAt\s*\(/);
});

type Listener = (...arguments_: readonly unknown[]) => void;

class TinyEmitter {
  readonly listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  once(event: string, listener: Listener): this {
    const onceListener: Listener = (...arguments_) => {
      this.removeListener(event, onceListener);
      listener(...arguments_);
    };
    Object.defineProperty(onceListener, "listener", { value: listener });
    return this.on(event, onceListener);
  }

  removeListener(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event);
    if (listeners !== undefined) {
      for (const candidate of listeners) {
        if (
          candidate === listener ||
          (candidate as Listener & { readonly listener?: Listener }).listener === listener
        ) {
          listeners.delete(candidate);
        }
      }
    }
    return this;
  }

  emit(event: string, ...arguments_: readonly unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...arguments_);
    }
  }

  listenerCount(event?: string): number {
    if (event !== undefined) {
      return this.listeners.get(event)?.size ?? 0;
    }
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

class FakeResponse extends TinyEmitter {
  readonly socket = {
    destroyed: false,
    destroy_calls: 0,
    destroy: () => {
      this.socket.destroyed = true;
      this.socket.destroy_calls += 1;
    }
  };

  destroyed = false;
  destroy_calls = 0;

  readonly statusCode: number | undefined;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;

  constructor(
    statusCode: number | null = 200,
    headers: Readonly<Record<string, string | readonly string[] | undefined>> =
      Object.freeze({ "content-type": "application/json; charset=utf-8" })
  ) {
    super();
    this.statusCode = statusCode === null ? undefined : statusCode;
    this.headers = headers;
  }

  destroy(): this {
    this.destroyed = true;
    this.destroy_calls += 1;
    return this;
  }
}

class FakeRequest extends TinyEmitter {
  destroyed = false;

  readonly socket = {
    destroyed: false,
    destroy_calls: 0,
    destroy: () => {
      this.socket.destroyed = true;
      this.socket.destroy_calls += 1;
    }
  };

  private readonly onEnd: ((body: Uint8Array | undefined) => void) | undefined;
  destroy_calls = 0;

  constructor(onEnd?: (body: Uint8Array | undefined) => void) {
    super();
    this.onEnd = onEnd;
  }

  end(body?: Uint8Array): this {
    this.onEnd?.(body);
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    this.destroy_calls += 1;
    return this;
  }
}

class NodeEmitterRequest extends EventEmitter {
  readonly socket: {
    destroyed: boolean;
    destroy_calls: number;
    destroy(): void;
  };
  destroyed = false;
  destroy_calls = 0;
  end_calls = 0;
  sent_body: Uint8Array | undefined;
  private readonly cascadeSocket: boolean;

  constructor(
    socket = {
      destroyed: false,
      destroy_calls: 0,
      destroy(): void {
        this.destroyed = true;
        this.destroy_calls += 1;
      }
    },
    cascadeSocket = false
  ) {
    super();
    this.socket = socket;
    this.cascadeSocket = cascadeSocket;
  }

  end(body?: Uint8Array): this {
    this.end_calls += 1;
    this.sent_body = body === undefined ? undefined : Uint8Array.from(body);
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    this.destroy_calls += 1;
    if (this.cascadeSocket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    return this;
  }
}

class NodeEmitterResponse extends EventEmitter {
  statusCode: number | undefined = 200;
  headers: Readonly<Record<string, string | readonly string[] | undefined>> =
    Object.freeze({ "content-type": "application/json; charset=utf-8" });
  readonly socket: {
    destroyed: boolean;
    destroy_calls: number;
    destroy(): void;
  };
  destroyed = false;
  destroy_calls = 0;
  private readonly cascadeSocket: boolean;

  constructor(
    socket = {
      destroyed: false,
      destroy_calls: 0,
      destroy(): void {
        this.destroyed = true;
        this.destroy_calls += 1;
      }
    },
    cascadeSocket = false
  ) {
    super();
    this.socket = socket;
    this.cascadeSocket = cascadeSocket;
  }

  destroy(): this {
    this.destroyed = true;
    this.destroy_calls += 1;
    if (this.cascadeSocket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    return this;
  }
}

interface RecordedRequest {
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly authorization: string | undefined;
  readonly content_type: string | undefined;
  readonly signal: AbortSignal | undefined;
  readonly username: string;
  readonly password: string;
  readonly search: string;
  readonly hash: string;
  readonly body: Uint8Array | undefined;
}

interface PlannedResponse {
  readonly status?: number | null;
  readonly content_type?: string | readonly string[] | null;
  readonly chunks?: readonly unknown[];
}

function jsonBytes(value: unknown): Uint8Array {
  return new Uint8Array(Buffer.from(JSON.stringify(value), "utf8"));
}

function createScriptedRequestFactory(plans: readonly PlannedResponse[]): Readonly<{
  readonly recorded: RecordedRequest[];
  readonly requests: FakeRequest[];
  readonly responses: FakeResponse[];
  readonly factory: Readonly<{
    request(
      url: URL,
      options: Readonly<Record<string, unknown>>,
      onResponse: (response: FakeResponse) => void
    ): FakeRequest;
  }>;
}> {
  const recorded: RecordedRequest[] = [];
  const requests: FakeRequest[] = [];
  const responses: FakeResponse[] = [];
  let nextPlan = 0;
  const factory = Object.freeze({
    request(
      url: URL,
      options: Readonly<Record<string, unknown>>,
      onResponse: (response: FakeResponse) => void
    ): FakeRequest {
      const headers = options.headers as Record<string, unknown> | undefined;
      const request = new FakeRequest((body) => {
        const plan = plans[nextPlan] ?? {};
        nextPlan += 1;
        const response = new FakeResponse(
          plan.status === undefined ? 200 : plan.status,
          Object.freeze(
            plan.content_type === null
              ? {}
              : { "content-type": plan.content_type ?? "application/json; charset=utf-8" }
          )
        );
        responses.push(response);
        queueMicrotask(() => {
          onResponse(response);
          for (const chunk of plan.chunks ?? [jsonBytes({})]) {
            response.emit("data", chunk);
          }
          response.emit("end");
        });
      });
      recorded.push({
        method: String(options.method),
        origin: url.origin,
        path: url.pathname,
        authorization: typeof headers?.authorization === "string" ? headers.authorization : undefined,
        content_type: typeof headers?.["content-type"] === "string" ? headers["content-type"] : undefined,
        signal: options.signal instanceof AbortSignal ? options.signal : undefined,
        username: url.username,
        password: url.password,
        search: url.search,
        hash: url.hash,
        body: undefined
      });
      const record = recorded[recorded.length - 1];
      if (record === undefined) {
        throw new Error("test_request_record_missing");
      }
      Object.defineProperty(request, "end", {
        configurable: true,
        value(body: Uint8Array | undefined): FakeRequest {
          Object.assign(record, { body: body === undefined ? undefined : Uint8Array.from(body) });
          return FakeRequest.prototype.end.call(this, body);
        }
      });
      requests.push(request);
      return request;
    }
  });
  return Object.freeze({ recorded, requests, responses, factory });
}

function createControlledRequestFactory(): Readonly<{
  readonly request: FakeRequest;
  readonly factory: Readonly<{
    request(
      url: URL,
      options: Readonly<Record<string, unknown>>,
      onResponse: (response: FakeResponse) => void
    ): FakeRequest;
  }>;
  respond(response: FakeResponse): void;
}> {
  const request = new FakeRequest();
  let responseListener: ((response: FakeResponse) => void) | undefined;
  return Object.freeze({
    request,
    factory: Object.freeze({
      request(
        _url: URL,
        _options: Readonly<Record<string, unknown>>,
        onResponse: (response: FakeResponse) => void
      ): FakeRequest {
        responseListener = onResponse;
        return request;
      }
    }),
    respond(response: FakeResponse): void {
      if (responseListener === undefined) {
        throw new Error("test_response_listener_missing");
      }
      responseListener(response);
    }
  });
}

function createNodeEmitterRequestFactory(
  request = new NodeEmitterRequest()
): Readonly<{
  readonly request: NodeEmitterRequest;
  readonly factory: Readonly<{
    request(
      url: URL,
      options: Readonly<Record<string, unknown>>,
      onResponse: (response: NodeEmitterResponse) => void
    ): NodeEmitterRequest;
  }>;
  respond(response: NodeEmitterResponse): void;
}> {
  let responseListener: ((response: NodeEmitterResponse) => void) | undefined;
  return Object.freeze({
    request,
    factory: Object.freeze({
      request(
        _url: URL,
        _options: Readonly<Record<string, unknown>>,
        onResponse: (response: NodeEmitterResponse) => void
      ): NodeEmitterRequest {
        responseListener = onResponse;
        return request;
      }
    }),
    respond(response: NodeEmitterResponse): void {
      if (responseListener === undefined) {
        throw new Error("test_response_listener_missing");
      }
      responseListener(response);
    }
  });
}

function ollamaInventoryRequest(signal: AbortSignal): HttpRequestInput {
  return {
    provider: "ollama",
    operation: "model_inventory",
    signal,
    max_response_bytes: 65536
  };
}

function ollamaChatRequest(
  signal: AbortSignal,
  body: Uint8Array = new Uint8Array([1, 2, 3])
): HttpRequestInput {
  return {
    provider: "ollama",
    operation: "chat",
    body,
    signal,
    max_response_bytes: 65536
  };
}

function openAiResponsesRequest(
  signal: AbortSignal,
  body: Uint8Array = new Uint8Array([4, 5, 6])
): HttpRequestInput {
  return {
    provider: "openai",
    operation: "responses",
    body,
    signal,
    max_response_bytes: 65536
  };
}

function openAiChatCompletionsRequest(
  signal: AbortSignal,
  body: Uint8Array = new Uint8Array([7, 8, 9])
): HttpRequestInput {
  return {
    provider: "openai",
    operation: "chat_completions",
    body,
    signal,
    max_response_bytes: 65536
  };
}

test("REQ-SBX-GENERAL-002 transport normalizes exact plain factory configuration synchronously", () => {
  const configAccessorSentinel = "never-leak-config-accessor-sentinel";
  const factoryAccessorSentinel = "never-leak-factory-accessor-sentinel";
  const unknownValueSentinel = "never-leak-unknown-config-value";
  const invalidKeySentinel = "never-leak-invalid-openai-key";
  let configAccessorReads = 0;
  let factoryAccessorReads = 0;
  let factoryCalls = 0;
  const safeFactory = Object.freeze({
    request(): FakeRequest {
      factoryCalls += 1;
      return new FakeRequest();
    }
  });
  const validConfig = {
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: safeFactory
  };
  const accessorConfig: Record<string, unknown> = {
    expected_ollama_digest: null,
    request_factory: safeFactory
  };
  Object.defineProperty(accessorConfig, "judge_api_key", {
    enumerable: true,
    get() {
      configAccessorReads += 1;
      throw new Error(configAccessorSentinel);
    }
  });
  const accessorFactory = {};
  Object.defineProperty(accessorFactory, "request", {
    enumerable: true,
    get() {
      factoryAccessorReads += 1;
      throw new Error(factoryAccessorSentinel);
    }
  });
  const inheritedConfig = Object.assign(
    Object.create({ expected_ollama_digest: null }),
    { judge_api_key: null,
    judge_endpoint_url: null, request_factory: safeFactory }
  );
  const inheritedFactory = Object.create({
    request(): FakeRequest {
      factoryCalls += 1;
      return new FakeRequest();
    }
  });
  const invalidCases: readonly Readonly<{
    name: string;
    input: unknown;
    sentinels?: readonly string[];
  }>[] = [
    {
      name: "unknown key",
      input: { ...validConfig, unknown: unknownValueSentinel },
      sentinels: [unknownValueSentinel]
    },
    { name: "null config", input: null },
    {
      name: "missing expected digest",
      input: { judge_api_key: null,
    judge_endpoint_url: null, request_factory: safeFactory }
    },
    {
      name: "missing OpenAI key",
      input: { expected_ollama_digest: null, request_factory: safeFactory }
    },
    { name: "inherited config key", input: inheritedConfig },
    {
      name: "accessor config key",
      input: accessorConfig,
      sentinels: [configAccessorSentinel]
    },
    {
      name: "symbol config key",
      input: { ...validConfig, [Symbol("forged")]: true }
    },
    {
      name: "transparent config proxy",
      input: new Proxy(validConfig, {})
    },
    {
      name: "invalid digest type",
      input: { ...validConfig, expected_ollama_digest: 7 }
    },
    {
      name: "invalid OpenAI key type",
      input: {
        ...validConfig,
        judge_api_key: { secret: invalidKeySentinel }
      },
      sentinels: [invalidKeySentinel]
    },
    {
      name: "undefined request factory",
      input: { ...validConfig, request_factory: undefined }
    },
    {
      name: "null request factory",
      input: { ...validConfig, request_factory: null }
    },
    {
      name: "missing request method",
      input: { ...validConfig, request_factory: {} }
    },
    {
      name: "non-callable request method",
      input: { ...validConfig, request_factory: { request: true } }
    },
    {
      name: "inherited request method",
      input: { ...validConfig, request_factory: inheritedFactory }
    },
    {
      name: "accessor request method",
      input: { ...validConfig, request_factory: accessorFactory },
      sentinels: [factoryAccessorSentinel]
    },
    {
      name: "transparent request factory proxy",
      input: { ...validConfig, request_factory: new Proxy(safeFactory, {}) }
    }
  ];

  assert.doesNotThrow(() => {
    transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null
    });
  });

  for (const invalidCase of invalidCases) {
    let failure: unknown;
    try {
      transportModule.createSandboxSecurityDefaultHttpTransport(
        invalidCase.input as never
      );
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof Error, `${invalidCase.name} must throw synchronously`);
    assert.equal(failure.name, "sandbox_security_transport_invalid");
    assert.equal(failure.message, "sandbox_security_transport_invalid");
    const exposed = `${failure.name}\n${failure.message}\n${failure.stack ?? ""}\n${JSON.stringify(failure)}`;
    for (const sentinel of invalidCase.sentinels ?? []) {
      assert.equal(exposed.includes(sentinel), false, `${invalidCase.name} leaked its sentinel`);
    }
    assert.equal(factoryCalls, 0, `${invalidCase.name} reached the request factory`);
  }
  assert.equal(configAccessorReads, 0);
  assert.equal(factoryAccessorReads, 0);
});

test("REQ-SBX-GENERAL-002 transport synchronously rejects every partial Judge configuration tuple", () => {
  const privateKey = "never-leak-partial-judge-key";
  let factoryCalls = 0;
  const requestFactory = Object.freeze({
    request(): FakeRequest {
      factoryCalls += 1;
      return new FakeRequest();
    }
  });
  const partialTuples = [
    {
      name: "key only",
      protocolId: null,
      apiKey: privateKey,
      endpointUrl: null
    },
    {
      name: "protocol and endpoint without key",
      protocolId: "openai_responses_v1",
      apiKey: null,
      endpointUrl: "https://doro.lol/v1/responses"
    },
    {
      name: "endpoint only",
      protocolId: null,
      apiKey: null,
      endpointUrl: "https://doro.lol/v1/responses"
    },
    {
      name: "key and endpoint without protocol",
      protocolId: null,
      apiKey: privateKey,
      endpointUrl: "https://doro.lol/v1/responses"
    },
    {
      name: "protocol only",
      protocolId: "openai_responses_v1",
      apiKey: null,
      endpointUrl: null
    },
    {
      name: "protocol and key without endpoint",
      protocolId: "openai_responses_v1",
      apiKey: privateKey,
      endpointUrl: null
    }
  ] as const;

  for (const partialTuple of partialTuples) {
    assert.throws(
      () =>
        transportModule.createSandboxSecurityDefaultHttpTransport({
          expected_ollama_digest: null,
          judge_protocol_id: partialTuple.protocolId,
          judge_api_key: partialTuple.apiKey,
          judge_endpoint_url: partialTuple.endpointUrl,
          request_factory: requestFactory
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, "sandbox_security_transport_invalid");
        assert.equal(error.message, "sandbox_security_transport_invalid");
        assert.equal(
          `${error.stack ?? ""}${JSON.stringify(error)}`.includes(privateKey),
          false
        );
        return true;
      },
      partialTuple.name
    );
  }
  assert.equal(factoryCalls, 0);
});

test("REQ-SBX-GENERAL-002 transport maps Ollama inventory to its fixed GET wire endpoint", async () => {
  const recordedRequests: RecordedRequest[] = [];
  const fakeRequestFactory = {
    request(url: URL, options: Readonly<Record<string, unknown>>, onResponse: (response: FakeResponse) => void) {
      recordedRequests.push({
        method: String(options.method),
        origin: url.origin,
        path: url.pathname,
        authorization:
          typeof (options.headers as Record<string, unknown> | undefined)?.authorization === "string"
            ? ((options.headers as Record<string, unknown>).authorization as string)
            : undefined,
        content_type: undefined,
        signal: undefined,
        username: url.username,
        password: url.password,
        search: url.search,
        hash: url.hash,
        body: undefined
      });
      const request = new FakeRequest();
      queueMicrotask(() => {
        const response = new FakeResponse();
        onResponse(response);
        response.emit("data", new Uint8Array([123, 125]));
        response.emit("end");
      });
      return request;
    }
  };
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: fakeRequestFactory
  });

  await transport.request(ollamaInventoryRequest(new AbortController().signal));

  assert.deepEqual(
    recordedRequests[0] === undefined
      ? undefined
      : {
          method: recordedRequests[0].method,
          origin: recordedRequests[0].origin,
          path: recordedRequests[0].path,
          authorization: recordedRequests[0].authorization
        },
    {
    method: "GET",
    origin: "http://127.0.0.1:11434",
    path: "/api/tags",
    authorization: undefined
    }
  );
});

test("REQ-SBX-GENERAL-002 transport explicitly closes each provider connection", async () => {
  const headers: Array<Readonly<Record<string, unknown>>> = [];
  const factory = {
    request(
      _url: URL,
      options: Readonly<Record<string, unknown>>,
      onResponse: (response: FakeResponse) => void
    ): FakeRequest {
      headers.push(options.headers as Readonly<Record<string, unknown>>);
      const request = new FakeRequest();
      queueMicrotask(() => {
        const response = new FakeResponse();
        onResponse(response);
        response.emit("data", jsonBytes({ status: "completed" }));
        response.emit("end");
      });
      return request;
    }
  };
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_chat_completions_json_v1",
    judge_api_key: "private-openai-key",
    judge_endpoint_url: "https://judge.example.test/v1/chat/completions",
    request_factory: factory
  });

  await transport.request(
    openAiChatCompletionsRequest(
      new AbortController().signal,
      jsonBytes({ model: "deepseek-v4-flash", stream: false })
    )
  );

  assert.equal(headers[0]?.connection, "close");
});

test("REQ-SBX-GENERAL-002 transport revalidates Ollama inventory before its fixed chat POST", async () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const controller = new AbortController();
  const harness = createScriptedRequestFactory([
    {
      chunks: [
        jsonBytes({
          models: [
            {
              name: "qwen3:8b",
              model: "qwen3:8b",
              digest: "a".repeat(64)
            }
          ]
        })
      ]
    },
    { chunks: [jsonBytes({ message: { content: "ignored by transport" } })] }
  ]);
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: digest,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: harness.factory
  });
  const body = new Uint8Array([123, 34, 120, 34, 58, 49, 125]);
  const expectedBody = Array.from(body);

  const pending = transport.request(ollamaChatRequest(controller.signal, body));
  body.fill(0);
  const response = await pending;

  assert.deepEqual(
    harness.recorded.map((record) => ({
      method: record.method,
      origin: record.origin,
      path: record.path,
      authorization: record.authorization,
      content_type: record.content_type,
      signal: record.signal,
      body: record.body === undefined ? undefined : Array.from(record.body),
      username: record.username,
      password: record.password,
      search: record.search,
      hash: record.hash
    })),
    [
      {
        method: "GET",
        origin: "http://127.0.0.1:11434",
        path: "/api/tags",
        authorization: undefined,
        content_type: undefined,
        signal: controller.signal,
        body: undefined,
        username: "",
        password: "",
        search: "",
        hash: ""
      },
      {
        method: "POST",
        origin: "http://127.0.0.1:11434",
        path: "/api/chat",
        authorization: undefined,
        content_type: "application/json",
        signal: controller.signal,
        body: expectedBody,
        username: "",
        password: "",
        search: "",
        hash: ""
      }
    ]
  );
  assert.deepEqual(response, {
    status: 200,
    content_type: "application/json",
    body: jsonBytes({ message: { content: "ignored by transport" } }),
    verified_ollama_digest: digest
  });
});

test("REQ-SBX-GENERAL-002 transport blocks Ollama chat before raw bytes on digest drift", async () => {
  const secretBody = jsonBytes({ raw_snapshot: "never-send-this-provider-body" });
  const harness = createScriptedRequestFactory([
    {
      chunks: [
        jsonBytes({
          models: [
            {
              name: "qwen3:8b",
              model: "qwen3:8b",
              digest: "b".repeat(64)
            }
          ]
        })
      ]
    }
  ]);
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: `sha256:${"a".repeat(64)}`,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: harness.factory
  });

  let failure: unknown;
  try {
    await transport.request(ollamaChatRequest(new AbortController().signal, secretBody));
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof Error);
  assert.equal(failure.name, "sandbox_security_transport_digest_mismatch");
  assert.equal(harness.recorded.length, 1);
  assert.equal(harness.recorded[0]?.path, "/api/tags");
  assert.equal(JSON.stringify(failure).includes("never-send-this-provider-body"), false);
  assert.equal(failure.stack?.includes("never-send-this-provider-body"), false);
});

for (const inventoryStatus of [201, 204, 299] as const) {
  test(`REQ-SBX-GENERAL-002 transport rejects Ollama inventory status ${inventoryStatus} before raw chat bytes`, async () => {
    const digestHex = "e".repeat(64);
    const rawChatSentinel = `RAW_INVENTORY_STATUS_${inventoryStatus}_CHAT_SENTINEL`;
    const rawChatBody = jsonBytes({ raw_snapshot: rawChatSentinel });
    const harness = createScriptedRequestFactory([
      {
        status: inventoryStatus,
        chunks: [jsonBytes({
          models: [{
            name: "qwen3:8b",
            model: "qwen3:8b",
            digest: digestHex
          }]
        })]
      },
      { chunks: [jsonBytes({ message: { content: "must-not-be-reached" } })] }
    ]);
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: `sha256:${digestHex}`,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: harness.factory
    });
    let failure: unknown;
    try {
      await transport.request(
        ollamaChatRequest(new AbortController().signal, rawChatBody)
      );
    } catch (error) {
      failure = error;
    }

    const sentBodies = harness.recorded
      .flatMap((record) => record.body === undefined ? [] : [record.body])
      .map((body) => new TextDecoder().decode(body));
    assert.deepEqual(
      {
        failure_name: failure instanceof Error ? failure.name : null,
        failure_message: failure instanceof Error ? failure.message : null,
        wire: harness.recorded.map((record) => ({
          method: record.method,
          path: record.path
        })),
        raw_sentinel_sent: sentBodies.some((body) => body.includes(rawChatSentinel))
      },
      {
        failure_name: "sandbox_security_transport_invalid",
        failure_message: "sandbox_security_transport_invalid",
        wire: [{ method: "GET", path: "/api/tags" }],
        raw_sentinel_sent: false
      }
    );
  });
}

test("REQ-SBX-GENERAL-002 Responses transport rejects Chat operation before its adapter-derived endpoint is used", async () => {
  const controller = new AbortController();
  const apiKey = "private-openai-key";
  const body = jsonBytes({ model: "gpt-5.4-mini", store: false });
  const harness = createScriptedRequestFactory([
    { chunks: [jsonBytes({ status: "completed" })] }
  ]);
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_responses_v1",
    judge_api_key: apiKey,
    judge_endpoint_url: "https://us.doro.lol/v1/responses",
    request_factory: harness.factory
  });

  await assert.rejects(
    transport.request(openAiChatCompletionsRequest(controller.signal, body)),
    { name: "sandbox_security_transport_invalid" }
  );
  assert.equal(harness.recorded.length, 0);

  const response = await transport.request(openAiResponsesRequest(controller.signal, body));

  assert.deepEqual(harness.recorded.map((record) => ({
    method: record.method,
    origin: record.origin,
    path: record.path,
    authorization: record.authorization,
    content_type: record.content_type,
    signal: record.signal,
    body: record.body === undefined ? undefined : Array.from(record.body),
    username: record.username,
    password: record.password,
    search: record.search,
    hash: record.hash
  })), [
    {
      method: "POST",
      origin: "https://us.doro.lol",
      path: "/v1/responses",
      authorization: `Bearer ${apiKey}`,
      content_type: "application/json",
      signal: controller.signal,
      body: Array.from(body),
      username: "",
      password: "",
      search: "",
      hash: ""
    }
  ]);
  assert.deepEqual(response, {
    status: 200,
    content_type: "application/json",
    body: jsonBytes({ status: "completed" })
  });

  let substitutedEndpointFactoryCalls = 0;
  for (const [protocolId, endpointUrl] of [
    [
      "openai_responses_v1",
      "https://us.doro.lol/v1/chat/completions"
    ],
    [
      "openai_chat_completions_json_v1",
      "https://us.doro.lol/v1/responses"
    ]
  ] as const) {
    assert.throws(
      () =>
        transportModule.createSandboxSecurityDefaultHttpTransport({
          expected_ollama_digest: null,
          judge_protocol_id: protocolId,
          judge_api_key: apiKey,
          judge_endpoint_url: endpointUrl,
          request_factory: {
            request(): FakeRequest {
              substitutedEndpointFactoryCalls += 1;
              return new FakeRequest();
            }
          }
        }),
      { name: "sandbox_security_transport_invalid" }
    );
  }
  assert.equal(substitutedEndpointFactoryCalls, 0);
});

test("REQ-SBX-GENERAL-002 Chat transport rejects Responses operation and posts only to its adapter-derived endpoint", async () => {
  const controller = new AbortController();
  const apiKey = "private-openai-key";
  const body = jsonBytes({ model: "gpt-5.4-mini", stream: false });
  const harness = createScriptedRequestFactory([
    { chunks: [jsonBytes({ object: "chat.completion" })] }
  ]);
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_chat_completions_json_v1",
    judge_api_key: apiKey,
    judge_endpoint_url: "https://judge.example.test/v1/chat/completions",
    request_factory: harness.factory
  });

  await assert.rejects(
    transport.request(openAiResponsesRequest(controller.signal, body)),
    { name: "sandbox_security_transport_invalid" }
  );
  assert.equal(harness.recorded.length, 0);

  const response = await transport.request(
    openAiChatCompletionsRequest(controller.signal, body)
  );

  assert.deepEqual(
    harness.recorded.map((record) => ({
      method: record.method,
      origin: record.origin,
      path: record.path,
      authorization: record.authorization,
      content_type: record.content_type,
      signal: record.signal,
      body: record.body === undefined ? undefined : Array.from(record.body)
    })),
    [
      {
        method: "POST",
        origin: "https://judge.example.test",
        path: "/v1/chat/completions",
        authorization: `Bearer ${apiKey}`,
        content_type: "application/json",
        signal: controller.signal,
        body: Array.from(body)
      }
    ]
  );
  assert.deepEqual(response, {
    status: 200,
    content_type: "application/json",
    body: jsonBytes({ object: "chat.completion" })
  });
});

test("REQ-SBX-GENERAL-002 Judge transport rejects exact credential reflection in successful responses", async () => {
  const credential = "ctrlfree-judge-secret-token-zz9";
  const scenarios = [
    {
      name: "responses_model",
      protocol_id: "openai_responses_v1" as const,
      endpoint_url: "https://us.doro.lol/v1/responses",
      request: (signal: AbortSignal) =>
        openAiResponsesRequest(signal, jsonBytes({ model: "gpt-5.4-mini", store: false })),
      chunks: [jsonBytes({ model: credential, status: "completed" })]
    },
    {
      name: "chat_assistant_content",
      protocol_id: "openai_chat_completions_json_v1" as const,
      endpoint_url: "https://judge.example.test/v1/chat/completions",
      request: (signal: AbortSignal) =>
        openAiChatCompletionsRequest(
          signal,
          jsonBytes({ model: "gpt-5.4-mini", stream: false })
        ),
      chunks: [
        jsonBytes({
          object: "chat.completion",
          choices: [{ message: { role: "assistant", content: credential } }]
        })
      ]
    },
    {
      name: "responses_metadata_split_chunks",
      protocol_id: "openai_responses_v1" as const,
      endpoint_url: "https://us.doro.lol/v1/responses",
      request: (signal: AbortSignal) =>
        openAiResponsesRequest(signal, jsonBytes({ model: "gpt-5.4-mini", store: false })),
      chunks: (() => {
        const body = jsonBytes({
          status: "completed",
          metadata: { trace: credential }
        });
        const splitAt = Math.max(1, Math.floor(body.length / 2));
        return [body.slice(0, splitAt), body.slice(splitAt)];
      })()
    }
  ] as const;

  for (const scenario of scenarios) {
    const controller = new AbortController();
    const harness = createScriptedRequestFactory([
      { status: 200, chunks: scenario.chunks }
    ]);
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: scenario.protocol_id,
      judge_api_key: credential,
      judge_endpoint_url: scenario.endpoint_url,
      request_factory: harness.factory
    });

    let failure: unknown;
    try {
      await transport.request(scenario.request(controller.signal));
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof Error, scenario.name);
    assert.equal(failure.name, "sandbox_security_transport_credential_reflection");
    assert.equal(
      failure.message,
      "sandbox_security_transport_credential_reflection"
    );
    assert.equal(harness.recorded.length, 1, scenario.name);
    assert.equal(harness.responses[0]?.destroy_calls, 1, scenario.name);
    assert.equal(harness.requests[0]?.destroy_calls, 1, scenario.name);
    assert.equal(harness.responses[0]?.socket.destroy_calls, 1, scenario.name);
    const exposed = `${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`;
    assert.equal(exposed.includes(credential), false, scenario.name);
  }
});

test("REQ-SBX-GENERAL-002 Judge transport rejects JSON Unicode-escaped credential reflection", async () => {
  const credential = "ctrlfree-judge-secret-token-zz9";
  const escapedCredential = Array.from(credential, (character) =>
    `\\u${character.codePointAt(0)!.toString(16).padStart(4, "0")}`
  ).join("");
  const body = new TextEncoder().encode(
    `{"model":"${escapedCredential}","status":"completed"}`
  );
  assert.equal(new TextDecoder().decode(body).includes(credential), false);
  const harness = createScriptedRequestFactory([
    { status: 200, chunks: [body] }
  ]);
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_responses_v1",
    judge_api_key: credential,
    judge_endpoint_url: "https://us.doro.lol/v1/responses",
    request_factory: harness.factory
  });

  let failure: unknown;
  try {
    await transport.request(
      openAiResponsesRequest(
        new AbortController().signal,
        jsonBytes({ model: "gpt-5.4-mini", store: false })
      )
    );
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof Error);
  assert.equal(failure.name, "sandbox_security_transport_credential_reflection");
  assert.equal(
    failure.message,
    "sandbox_security_transport_credential_reflection"
  );
  assert.equal(harness.responses[0]?.destroy_calls, 1);
  assert.equal(harness.requests[0]?.destroy_calls, 1);
  const exposed = `${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`;
  assert.equal(exposed.includes(credential), false);
});

test("REQ-SBX-GENERAL-002 Judge transport rejects credential reflection in HTTP error responses", async () => {
  const credential = "ctrlfree-judge-secret-token-zz9";
  for (const status of [401, 500] as const) {
    const controller = new AbortController();
    const body = jsonBytes({ error: { message: credential } });
    const harness = createScriptedRequestFactory([
      { status, chunks: [body] }
    ]);
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: "openai_responses_v1",
      judge_api_key: credential,
      judge_endpoint_url: "https://us.doro.lol/v1/responses",
      request_factory: harness.factory
    });

    let failure: unknown;
    try {
      await transport.request(
        openAiResponsesRequest(
          controller.signal,
          jsonBytes({ model: "gpt-5.4-mini", store: false })
        )
      );
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof Error, `status_${status}`);
    assert.equal(failure.name, "sandbox_security_transport_credential_reflection");
    assert.equal(
      failure.message,
      "sandbox_security_transport_credential_reflection"
    );
    assert.equal(harness.responses[0]?.destroy_calls, 1, `status_${status}`);
    assert.equal(harness.requests[0]?.destroy_calls, 1, `status_${status}`);
    const exposed = `${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`;
    assert.equal(exposed.includes(credential), false, `status_${status}`);
  }
});

test("REQ-SBX-GENERAL-002 Judge transport scans a non-JSON error body before media-type rejection", async () => {
  const credential = "ctrlfree-judge-secret-token-zz9";
  const body = new TextEncoder().encode(`provider error: ${credential}`);
  const harness = createScriptedRequestFactory([
    {
      status: 500,
      content_type: "text/plain",
      chunks: [body]
    }
  ]);
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_responses_v1",
    judge_api_key: credential,
    judge_endpoint_url: "https://us.doro.lol/v1/responses",
    request_factory: harness.factory
  });

  let failure: unknown;
  try {
    await transport.request(
      openAiResponsesRequest(
        new AbortController().signal,
        jsonBytes({ model: "gpt-5.4-mini", store: false })
      )
    );
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof Error);
  assert.equal(failure.name, "sandbox_security_transport_credential_reflection");
  assert.equal(
    failure.message,
    "sandbox_security_transport_credential_reflection"
  );
  assert.equal(harness.responses[0]?.destroy_calls, 1);
  assert.equal(harness.requests[0]?.destroy_calls, 1);
  const exposed = `${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`;
  assert.equal(exposed.includes(credential), false);
});

test("REQ-SBX-GENERAL-002 Judge transport accepts a full-size body without credential reflection", async () => {
  const credential = "ctrlfree-judge-secret-token-zz9";
  const controller = new AbortController();
  const safeBody = new Uint8Array(65536);
  safeBody.fill(0x61); // 'a'
  // Ensure the credential sequence is absent.
  const harness = createScriptedRequestFactory([
    { status: 200, chunks: [safeBody] }
  ]);
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_responses_v1",
    judge_api_key: credential,
    judge_endpoint_url: "https://us.doro.lol/v1/responses",
    request_factory: harness.factory
  });

  const response = await transport.request(
    openAiResponsesRequest(
      controller.signal,
      jsonBytes({ model: "gpt-5.4-mini", store: false })
    )
  );

  assert.deepEqual(response, {
    status: 200,
    content_type: "application/json",
    body: safeBody
  });
  assert.equal(harness.recorded.length, 1);
});


test("REQ-SBX-GENERAL-002 transport caps every POST request body at 64 KiB before factory use", async () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const exactBody = new Uint8Array(65536);
  const oversizedBody = new Uint8Array(65537);
  const scenarios = [
    {
      name: "Ollama chat",
      createTransport(requestFactory: unknown) {
        return transportModule.createSandboxSecurityDefaultHttpTransport({
          expected_ollama_digest: digest,
          judge_protocol_id: null,
          judge_api_key: null,
          judge_endpoint_url: null,
          request_factory: requestFactory
        });
      },
      createRequest(body: Uint8Array) {
        return ollamaChatRequest(new AbortController().signal, body);
      },
      plans: [
        {
          chunks: [
            jsonBytes({
              models: [
                {
                  name: "qwen3:8b",
                  model: "qwen3:8b",
                  digest: "a".repeat(64)
                }
              ]
            })
          ]
        },
        { chunks: [jsonBytes({})] }
      ],
      expectedFactoryCalls: 2
    },
    {
      name: "OpenAI Responses",
      createTransport(requestFactory: unknown) {
        return transportModule.createSandboxSecurityDefaultHttpTransport({
          expected_ollama_digest: null,
          judge_protocol_id: "openai_responses_v1",
          judge_api_key: "private-openai-key",
          judge_endpoint_url: "https://doro.lol/v1/responses",
          request_factory: requestFactory
        });
      },
      createRequest(body: Uint8Array) {
        return openAiResponsesRequest(new AbortController().signal, body);
      },
      plans: [{ chunks: [jsonBytes({})] }],
      expectedFactoryCalls: 1
    },
    {
      name: "OpenAI Chat Completions",
      createTransport(requestFactory: unknown) {
        return transportModule.createSandboxSecurityDefaultHttpTransport({
          expected_ollama_digest: null,
          judge_protocol_id: "openai_chat_completions_json_v1",
          judge_api_key: "private-openai-key",
          judge_endpoint_url:
            "https://judge.example.test/v1/chat/completions",
          request_factory: requestFactory
        });
      },
      createRequest(body: Uint8Array) {
        return openAiChatCompletionsRequest(
          new AbortController().signal,
          body
        );
      },
      plans: [{ chunks: [jsonBytes({})] }],
      expectedFactoryCalls: 1
    }
  ] as const;

  for (const scenario of scenarios) {
    const rejectedHarness = createScriptedRequestFactory(scenario.plans);
    const rejectedTransport = scenario.createTransport(rejectedHarness.factory);
    let pendingRejection: Promise<unknown> | undefined;

    assert.doesNotThrow(() => {
      pendingRejection = rejectedTransport.request(
        scenario.createRequest(oversizedBody)
      );
    }, `${scenario.name} preserves the async request API`);
    assert.ok(pendingRejection !== undefined);
    await assert.rejects(pendingRejection, {
      name: "sandbox_security_transport_invalid",
      message: "sandbox_security_transport_invalid"
    });
    assert.equal(
      rejectedHarness.recorded.length,
      0,
      `${scenario.name} reached the request factory`
    );

    const acceptedHarness = createScriptedRequestFactory(scenario.plans);
    const acceptedTransport = scenario.createTransport(acceptedHarness.factory);
    await acceptedTransport.request(scenario.createRequest(exactBody));

    assert.equal(
      acceptedHarness.recorded.length,
      scenario.expectedFactoryCalls,
      `${scenario.name} rejected the exact limit`
    );
    assert.equal(
      acceptedHarness.recorded.at(-1)?.body?.byteLength,
      65536,
      `${scenario.name} changed the exact-limit body length`
    );
  }
});

test("REQ-SBX-GENERAL-002 transport bounds native request body length before allocating its copy", () => {
  const source = readFileSync(transportPath, "utf8");
  const boundedCopy = source.indexOf(
    "function copyUint8ArrayInternalBytesAtMost("
  );
  const nativeLengthRead = source.indexOf(
    "const byteLength = Reflect.apply(",
    boundedCopy
  );
  const limitCheck = source.indexOf(
    "if (byteLength > maxByteLength)",
    nativeLengthRead
  );
  const allocation = source.indexOf(
    "const copy = new Uint8Array(byteLength);",
    limitCheck
  );
  const normalizedRequestCopy = source.indexOf(
    "const normalizedBody = copyUint8ArrayInternalBytesAtMost(",
    allocation
  );
  const requestLimit = source.indexOf(
    "MAX_REQUEST_BODY_BYTES",
    normalizedRequestCopy
  );

  assert.ok(boundedCopy >= 0);
  assert.ok(nativeLengthRead > boundedCopy);
  assert.ok(limitCheck > nativeLengthRead);
  assert.ok(allocation > limitCheck);
  assert.ok(normalizedRequestCopy > allocation);
  assert.ok(requestLimit > normalizedRequestCopy);
  assert.equal(
    source.includes(
      "if (normalizedBody.byteLength > MAX_REQUEST_BODY_BYTES)"
    ),
    false
  );
});

test("REQ-SBX-GENERAL-002 transport copies request bodies from Uint8Array internal bytes without hostile iterators", async () => {
  class HostileRequestBody extends Uint8Array {
    override get byteLength(): number {
      throw new Error("never-use-hostile-request-byte-length");
    }

    override [Symbol.iterator](): ArrayIterator<number> {
      return new Uint8Array([9, 8])[Symbol.iterator]();
    }
  }

  const controller = new AbortController();
  const body = new HostileRequestBody([1, 2, 3]);
  const harness = createScriptedRequestFactory([
    { chunks: [jsonBytes({ status: "completed" })] }
  ]);
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_responses_v1",
    judge_api_key: "private-openai-key",
    judge_endpoint_url: "https://doro.lol/v1/responses",
    request_factory: harness.factory
  });
  const pending = transport.request(openAiResponsesRequest(controller.signal, body));
  Uint8Array.prototype.fill.call(body, 7);
  await pending;

  assert.deepEqual(
    harness.recorded[0]?.body === undefined
      ? undefined
      : Array.from(harness.recorded[0].body),
    [1, 2, 3]
  );

  const trapSentinel = "never-leak-request-body-proxy-trap";
  const proxyBody = new Proxy(new Uint8Array([4, 5, 6]), {
    get() {
      throw new Error(trapSentinel);
    }
  });
  let factoryCalls = 0;
  const proxyTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_responses_v1",
    judge_api_key: "private-openai-key",
    judge_endpoint_url: "https://doro.lol/v1/responses",
    request_factory: {
      request(): FakeRequest {
        factoryCalls += 1;
        return new FakeRequest();
      }
    }
  });
  let failure: unknown;
  try {
    await proxyTransport.request(
      openAiResponsesRequest(new AbortController().signal, proxyBody)
    );
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof Error);
  assert.equal(failure.name, "sandbox_security_transport_invalid");
  assert.equal(failure.message, "sandbox_security_transport_invalid");
  assert.equal(`${failure.stack ?? ""}${JSON.stringify(failure)}`.includes(trapSentinel), false);
  assert.equal(factoryCalls, 0);
});

test("REQ-SBX-GENERAL-002 transport normalizes only exact plain closed-union request records before network use", async () => {
  const signal = new AbortController().signal;
  let accessorReads = 0;
  const accessorRequest: Record<string, unknown> = {
    operation: "model_inventory",
    signal,
    max_response_bytes: 65536
  };
  Object.defineProperty(accessorRequest, "provider", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return "ollama";
    }
  });
  const symbolRequest = {
    provider: "ollama",
    operation: "model_inventory",
    signal,
    max_response_bytes: 65536,
    [Symbol("forged")]: true
  };
  const inheritedRequest = Object.assign(Object.create({ provider: "ollama" }), {
    operation: "model_inventory",
    signal,
    max_response_bytes: 65536
  });
  const nullPrototypeRequest = Object.assign(Object.create(null), {
    provider: "ollama",
    operation: "model_inventory",
    signal,
    max_response_bytes: 65536
  });
  const invalidRequests: readonly unknown[] = [
    { ...ollamaInventoryRequest(signal), endpoint: "https://attacker.invalid" },
    inheritedRequest,
    nullPrototypeRequest,
    accessorRequest,
    symbolRequest,
    { ...ollamaInventoryRequest(signal), body: new Uint8Array() },
    { provider: "ollama", operation: "chat", signal, max_response_bytes: 65536 },
    { provider: "openai", operation: "responses", signal, max_response_bytes: 65536 },
    { provider: "ollama", operation: "responses", body: new Uint8Array(), signal, max_response_bytes: 65536 },
    { provider: "unknown", operation: "model_inventory", signal, max_response_bytes: 65536 },
    { provider: "ollama", operation: "model_inventory", signal: {}, max_response_bytes: 65536 },
    { provider: "ollama", operation: "model_inventory", signal, max_response_bytes: 65535 }
  ];

  for (const invalidRequest of invalidRequests) {
    const harness = createScriptedRequestFactory([{ chunks: [jsonBytes({})] }]);
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: harness.factory
    });

    await assert.rejects(
      transport.request(invalidRequest as HttpRequestInput),
      { name: "sandbox_security_transport_invalid" }
    );
    assert.equal(harness.recorded.length, 0);
  }
  assert.equal(accessorReads, 0);
});

test("REQ-SBX-GENERAL-002 transport rejects forged and proxy AbortSignals with fixed safe errors before network use", async () => {
  const trapSentinel = "never-leak-abort-signal-proxy-trap";
  const forgedSignal = Object.create(AbortSignal.prototype) as AbortSignal;
  const proxySignal = new Proxy(new AbortController().signal, {
    get() {
      throw new Error(trapSentinel);
    }
  });

  for (const signal of [forgedSignal, proxySignal]) {
    let factoryCalls = 0;
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: {
        request(): FakeRequest {
          factoryCalls += 1;
          return new FakeRequest();
        }
      }
    });
    let failure: unknown;
    try {
      await transport.request(ollamaInventoryRequest(signal));
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof Error);
    assert.equal(failure.name, "sandbox_security_transport_invalid");
    assert.equal(failure.message, "sandbox_security_transport_invalid");
    const exposed = `${failure.name}\n${failure.message}\n${failure.stack ?? ""}\n${JSON.stringify(failure)}`;
    assert.equal(exposed.includes(trapSentinel), false);
    assert.equal(factoryCalls, 0);
  }
});

test("REQ-SBX-GENERAL-002 transport validates the 4096 UTF-8 byte Judge key boundary synchronously", () => {
  const keyMarker = "never-leak-transport-key-boundary-";
  const exactKey = `${keyMarker}${"k".repeat(4094 - keyMarker.length)}é`;
  const oversizedKey = `${exactKey}k`;
  let factoryCalls = 0;
  const requestFactory = Object.freeze({
    request(): FakeRequest {
      factoryCalls += 1;
      return new FakeRequest();
    }
  });

  assert.equal(new TextEncoder().encode(exactKey).byteLength, 4096);
  assert.equal(new TextEncoder().encode(oversizedKey).byteLength, 4097);
  assert.doesNotThrow(() =>
    transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: "openai_responses_v1",
      judge_api_key: exactKey,
      judge_endpoint_url: "https://doro.lol/v1/responses",
      request_factory: requestFactory
    })
  );

  for (const [scenario, apiKey] of [
    ["over 4096 UTF-8 bytes", oversizedKey],
    ["empty", ""],
    ["untrimmed", " private-key"],
    ["control character", "private-key\r\nx-forged: sentinel"]
  ] as const) {
    assert.throws(
      () =>
        transportModule.createSandboxSecurityDefaultHttpTransport({
          expected_ollama_digest: null,
          judge_protocol_id: "openai_responses_v1",
          judge_api_key: apiKey,
          judge_endpoint_url: "https://doro.lol/v1/responses",
          request_factory: requestFactory
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, "sandbox_security_transport_invalid");
        assert.equal(error.message, "sandbox_security_transport_invalid");
        assert.equal(
          `${error.stack ?? ""}${JSON.stringify(error)}`.includes(keyMarker),
          false
        );
        return true;
      },
      scenario
    );
  }
  assert.equal(factoryCalls, 0);
});

test("REQ-SBX-GENERAL-002 transport normalizes and requires a single application JSON response content type", async () => {
  const acceptedHarness = createScriptedRequestFactory([
    {
      content_type: "Application/JSON ; Charset=UTF-8",
      chunks: [jsonBytes({ accepted: true })]
    }
  ]);
  const acceptedTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: acceptedHarness.factory
  });

  assert.deepEqual(
    await acceptedTransport.request(ollamaInventoryRequest(new AbortController().signal)),
    {
      status: 200,
      content_type: "application/json",
      body: jsonBytes({ accepted: true })
    }
  );

  const providerBodySentinel = "never-leak-wrong-content-type-body";
  for (const invalidContentType of [
    null,
    "text/plain",
    ["application/json", "text/plain"]
  ] as const) {
    const harness = createScriptedRequestFactory([
      {
        content_type: invalidContentType,
        chunks: [jsonBytes({ provider_text: providerBodySentinel })]
      }
    ]);
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: harness.factory
    });
    let failure: unknown;
    try {
      await transport.request(ollamaInventoryRequest(new AbortController().signal));
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof Error);
    assert.equal(failure.name, "sandbox_security_transport_invalid");
    const exposed = `${failure.name}\n${failure.message}\n${failure.stack ?? ""}\n${JSON.stringify(failure)}`;
    assert.equal(exposed.includes(providerBodySentinel), false);
  }
});

test("REQ-SBX-GENERAL-002 transport exposes non-2xx status and body but rejects redirects and invalid statuses", async () => {
  const httpErrorBody = jsonBytes({ provider_error: "bounded-and-visible-to-adapter" });
  const errorHarness = createScriptedRequestFactory([
    { status: 429, chunks: [httpErrorBody] }
  ]);
  const errorTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: errorHarness.factory
  });
  assert.deepEqual(
    await errorTransport.request(ollamaInventoryRequest(new AbortController().signal)),
    {
      status: 429,
      content_type: "application/json",
      body: httpErrorBody
    }
  );

  const digest = `sha256:${"c".repeat(64)}`;
  const chatHarness = createScriptedRequestFactory([
    {
      chunks: [jsonBytes({
        models: [{ name: "qwen3:8b", model: "qwen3:8b", digest: "c".repeat(64) }]
      })]
    },
    { status: 500, chunks: [httpErrorBody] }
  ]);
  const chatTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: digest,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: chatHarness.factory
  });
  const chatResponse = await chatTransport.request(
    ollamaChatRequest(new AbortController().signal)
  ) as Record<string, unknown>;
  assert.deepEqual(chatResponse, {
    status: 500,
    content_type: "application/json",
    body: httpErrorBody
  });
  assert.equal(Object.hasOwn(chatResponse, "verified_ollama_digest"), false);

  const redirectBodySentinel = "never-leak-redirect-provider-body";
  for (const invalidStatus of [301, 307, null, 199, 600, 200.5, Number.NaN] as const) {
    const harness = createScriptedRequestFactory([
      {
        status: invalidStatus,
        chunks: [jsonBytes({ provider_text: redirectBodySentinel })]
      }
    ]);
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: harness.factory
    });
    let failure: unknown;
    try {
      await transport.request(ollamaInventoryRequest(new AbortController().signal));
    } catch (error) {
      failure = error;
    }

    assert.ok(
      failure instanceof Error,
      `expected invalid status ${String(invalidStatus)} to reject`
    );
    assert.equal(failure.name, "sandbox_security_transport_invalid");
    const exposed = `${failure.name}\n${failure.message}\n${failure.stack ?? ""}\n${JSON.stringify(failure)}`;
    assert.equal(exposed.includes(redirectBodySentinel), false);
  }
});

test("REQ-SBX-GENERAL-002 transport enforces the incremental 64 KiB cap and releases every terminal resource once", async () => {
  const assertReleased = (
    harness: ReturnType<typeof createScriptedRequestFactory>,
    signal: AbortSignal
  ): void => {
    const request = harness.requests[0];
    const response = harness.responses[0];
    assert.ok(request !== undefined);
    assert.ok(response !== undefined);
    assert.equal(getEventListeners(signal, "abort").length, 0);
    assert.equal(request.listenerCount(), 0);
    assert.equal(response.listenerCount(), 0);
    assert.equal(request.destroyed, true);
    assert.equal(request.destroy_calls, 1);
    assert.equal(request.socket.destroyed, true);
    assert.equal(request.socket.destroy_calls, 1);
    assert.equal(response.destroyed, true);
    assert.equal(response.destroy_calls, 1);
    assert.equal(response.socket.destroyed, true);
    assert.equal(response.socket.destroy_calls, 1);
  };

  const exactChunk = new Uint8Array(65536).fill(17);
  const successController = new AbortController();
  const successHarness = createScriptedRequestFactory([{ chunks: [exactChunk] }]);
  const successTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: successHarness.factory
  });
  const successResponse = await successTransport.request(
    ollamaInventoryRequest(successController.signal)
  ) as Readonly<{ status: number; content_type: string; body: Uint8Array }>;
  exactChunk.fill(99);

  assert.equal(successResponse.body.byteLength, 65536);
  assert.equal(successResponse.body[0], 17);
  assert.equal(successResponse.body[65535], 17);
  assert.notEqual(successResponse.body, exactChunk);
  assert.equal(Object.getPrototypeOf(successResponse), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(successResponse), ["status", "content_type", "body"]);
  assert.equal(Object.isFrozen(successResponse), true);
  assertReleased(successHarness, successController.signal);

  const oversizedController = new AbortController();
  const oversizedHarness = createScriptedRequestFactory([
    { chunks: [new Uint8Array(32768), new Uint8Array(32769)] }
  ]);
  const oversizedTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: oversizedHarness.factory
  });
  await assert.rejects(
    oversizedTransport.request(ollamaInventoryRequest(oversizedController.signal)),
    { name: "sandbox_security_transport_response_too_large" }
  );
  assertReleased(oversizedHarness, oversizedController.signal);

  const invalidChunkSentinel = "never-leak-invalid-provider-chunk";
  const invalidController = new AbortController();
  const invalidHarness = createScriptedRequestFactory([
    { chunks: [invalidChunkSentinel] }
  ]);
  const invalidTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: invalidHarness.factory
  });
  let failure: unknown;
  try {
    await invalidTransport.request(ollamaInventoryRequest(invalidController.signal));
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof Error);
  assert.equal(failure.name, "sandbox_security_transport_invalid");
  assert.equal(`${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`.includes(invalidChunkSentinel), false);
  assertReleased(invalidHarness, invalidController.signal);

  class HostileChunk extends Uint8Array {
    override get byteLength(): number {
      throw new Error(invalidChunkSentinel);
    }
  }
  const hostileController = new AbortController();
  const hostileHarness = createControlledRequestFactory();
  const hostileResponse = new FakeResponse();
  const hostileTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: hostileHarness.factory
  });
  const hostilePending = hostileTransport.request(
    ollamaInventoryRequest(hostileController.signal)
  );
  hostileHarness.respond(hostileResponse);
  let escapedProviderError: unknown;
  try {
    hostileResponse.emit("data", new HostileChunk([1, 2, 3]));
  } catch (error) {
    escapedProviderError = error;
    hostileController.abort();
  }
  hostileResponse.emit("end");
  const hostileResult = await hostilePending;

  assert.equal(escapedProviderError, undefined);
  assert.deepEqual(hostileResult, {
    status: 200,
    content_type: "application/json",
    body: new Uint8Array([1, 2, 3])
  });
  assert.equal(JSON.stringify(hostileResult).includes(invalidChunkSentinel), false);
  assert.equal(hostileHarness.request.listenerCount(), 0);
  assert.equal(hostileResponse.listenerCount(), 0);
  assert.equal(hostileHarness.request.destroy_calls, 1);
  assert.equal(hostileHarness.request.socket.destroy_calls, 1);
  assert.equal(hostileResponse.destroy_calls, 1);
  assert.equal(hostileResponse.socket.destroy_calls, 1);
});

test("REQ-SBX-GENERAL-002 transport counts TypedArray internal bytes instead of overridable chunk surfaces", async () => {
  class CapBypassChunk extends Uint8Array {
    override get byteLength(): number {
      return 0;
    }

    override [Symbol.iterator](): ArrayIterator<number> {
      return Uint8Array.prototype[Symbol.iterator].call(this);
    }
  }

  const controller = new AbortController();
  const harness = createControlledRequestFactory();
  const response = new FakeResponse();
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: harness.factory
  });
  const pending = transport.request(ollamaInventoryRequest(controller.signal));
  harness.respond(response);
  response.emit("data", new CapBypassChunk(65537));
  response.emit("end");

  await assert.rejects(pending, {
    name: "sandbox_security_transport_response_too_large"
  });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(harness.request.listenerCount(), 0);
  assert.equal(response.listenerCount(), 0);
  assert.equal(harness.request.destroy_calls, 1);
  assert.equal(harness.request.socket.destroy_calls, 1);
  assert.equal(response.destroy_calls, 1);
  assert.equal(response.socket.destroy_calls, 1);
});

test("REQ-SBX-GENERAL-002 transport safely closes request and response error or premature-close terminals", async () => {
  const providerErrorSentinel = "never-leak-provider-stream-error";

  for (const event of ["error", "close"] as const) {
    const controller = new AbortController();
    const harness = createControlledRequestFactory();
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: harness.factory
    });
    const pending = transport.request(ollamaInventoryRequest(controller.signal));
    harness.request.emit(event, new Error(providerErrorSentinel));
    let failure: unknown;
    try {
      await pending;
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof Error);
    assert.equal(failure.name, "sandbox_security_transport_connection_failed");
    assert.equal(`${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`.includes(providerErrorSentinel), false);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.equal(harness.request.listenerCount(), 0);
    assert.equal(harness.request.destroy_calls, 1);
    assert.equal(harness.request.socket.destroy_calls, 1);
  }

  for (const event of ["error", "close"] as const) {
    const controller = new AbortController();
    const harness = createControlledRequestFactory();
    const response = new FakeResponse();
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: harness.factory
    });
    const pending = transport.request(ollamaInventoryRequest(controller.signal));
    harness.respond(response);
    response.emit("data", jsonBytes({ provider_text: providerErrorSentinel }));
    response.emit(event, new Error(providerErrorSentinel));
    let failure: unknown;
    try {
      await pending;
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof Error);
    assert.equal(failure.name, "sandbox_security_transport_connection_failed");
    assert.equal(`${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`.includes(providerErrorSentinel), false);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.equal(harness.request.listenerCount(), 0);
    assert.equal(response.listenerCount(), 0);
    assert.equal(harness.request.destroy_calls, 1);
    assert.equal(harness.request.socket.destroy_calls, 1);
    assert.equal(response.destroy_calls, 1);
    assert.equal(response.socket.destroy_calls, 1);
  }

  const cleanupSentinel = "never-leak-cleanup-socket-getter";
  const cleanupController = new AbortController();
  const cleanupHarness = createControlledRequestFactory();
  const cleanupResponse = new FakeResponse();
  Object.defineProperty(cleanupResponse, "socket", {
    configurable: true,
    get() {
      throw new Error(cleanupSentinel);
    }
  });
  const cleanupTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: cleanupHarness.factory
  });
  const cleanupPending = cleanupTransport.request(
    ollamaInventoryRequest(cleanupController.signal)
  );
  cleanupHarness.respond(cleanupResponse);
  const cleanupBody = jsonBytes({ released: true });
  cleanupResponse.emit("data", cleanupBody);
  cleanupResponse.emit("end");
  const cleanupOutcome = await Promise.race([
    cleanupPending.then(
      (value) => ({ status: "resolved" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, value: error })
    ),
    new Promise<Readonly<{ status: "pending"; value: null }>>((resolve) => {
      setImmediate(() => resolve({ status: "pending", value: null }));
    })
  ]);

  assert.deepEqual(cleanupOutcome, {
    status: "resolved",
    value: {
      status: 200,
      content_type: "application/json",
      body: cleanupBody
    }
  });
  assert.equal(cleanupHarness.request.listenerCount(), 0);
  assert.equal(cleanupResponse.listenerCount(), 0);
  assert.equal(cleanupHarness.request.destroy_calls, 1);
  assert.equal(cleanupHarness.request.socket.destroy_calls, 1);
  assert.equal(cleanupResponse.destroy_calls, 1);
  assert.equal(JSON.stringify(cleanupOutcome).includes(cleanupSentinel), false);
});

test("REQ-SBX-GENERAL-002 transport settles abort error and close races once and releases late resources", async () => {
  let preAbortedFactoryCalls = 0;
  const preAbortedController = new AbortController();
  preAbortedController.abort(new Error("never-leak-abort-reason"));
  const preAbortedTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: {
      request(): FakeRequest {
        preAbortedFactoryCalls += 1;
        return new FakeRequest();
      }
    }
  });
  await assert.rejects(
    preAbortedTransport.request(ollamaInventoryRequest(preAbortedController.signal)),
    { name: "sandbox_security_transport_aborted" }
  );
  assert.equal(preAbortedFactoryCalls, 0);

  const abortController = new AbortController();
  const abortHarness = createControlledRequestFactory();
  const activeResponse = new FakeResponse();
  const lateResponse = new FakeResponse();
  const abortTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: abortHarness.factory
  });
  const abortSettlements: string[] = [];
  const abortPending = abortTransport.request(ollamaInventoryRequest(abortController.signal));
  void abortPending.then(
    () => abortSettlements.push("resolved"),
    () => abortSettlements.push("rejected")
  );
  abortHarness.respond(activeResponse);
  abortController.abort(new Error("never-leak-abort-race-reason"));
  abortHarness.request.emit("error", new Error("never-leak-request-race-error"));
  activeResponse.emit("error", new Error("never-leak-response-race-error"));
  activeResponse.emit("close");
  activeResponse.emit("end");
  abortHarness.respond(lateResponse);

  await assert.rejects(abortPending, { name: "sandbox_security_transport_aborted" });
  await Promise.resolve();
  assert.deepEqual(abortSettlements, ["rejected"]);
  assert.equal(getEventListeners(abortController.signal, "abort").length, 0);
  assert.equal(abortHarness.request.listenerCount(), 0);
  assert.equal(activeResponse.listenerCount(), 0);
  assert.equal(lateResponse.listenerCount(), 0);
  assert.equal(abortHarness.request.destroy_calls, 1);
  assert.equal(abortHarness.request.socket.destroy_calls, 1);
  assert.equal(activeResponse.destroy_calls, 1);
  assert.equal(activeResponse.socket.destroy_calls, 1);
  assert.equal(lateResponse.destroy_calls, 1);
  assert.equal(lateResponse.socket.destroy_calls, 1);

  const errorController = new AbortController();
  const errorHarness = createControlledRequestFactory();
  const errorTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: errorHarness.factory
  });
  const errorPending = errorTransport.request(ollamaInventoryRequest(errorController.signal));
  errorHarness.request.emit("error", new Error("provider-first-error"));
  errorController.abort();
  errorHarness.request.emit("close");
  await assert.rejects(errorPending, {
    name: "sandbox_security_transport_connection_failed"
  });
  assert.equal(errorHarness.request.destroy_calls, 1);
  assert.equal(errorHarness.request.socket.destroy_calls, 1);
  assert.equal(errorHarness.request.listenerCount(), 0);
  assert.equal(getEventListeners(errorController.signal, "abort").length, 0);
});

test("REQ-SBX-GENERAL-002 transport rejects duplicate active responses and releases both exactly once", async () => {
  const controller = new AbortController();
  const harness = createControlledRequestFactory();
  const firstResponse = new FakeResponse();
  const duplicateResponse = new FakeResponse();
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: harness.factory
  });
  const pending = transport.request(ollamaInventoryRequest(controller.signal));
  harness.respond(firstResponse);
  harness.respond(duplicateResponse);

  const outcome = await Promise.race([
    pending.then(
      () => ({ status: "resolved" as const, name: null }),
      (error: unknown) => ({
        status: "rejected" as const,
        name: error instanceof Error ? error.name : null
      })
    ),
    new Promise<Readonly<{ status: "pending"; name: null }>>((resolve) => {
      setImmediate(() => resolve({ status: "pending", name: null }));
    })
  ]);
  if (outcome.status === "pending") {
    controller.abort();
  }
  await pending.catch(() => undefined);

  assert.deepEqual(outcome, {
    status: "rejected",
    name: "sandbox_security_transport_invalid"
  });
  assert.equal(harness.request.listenerCount(), 0);
  assert.equal(firstResponse.listenerCount(), 0);
  assert.equal(duplicateResponse.listenerCount(), 0);
  assert.equal(harness.request.destroy_calls, 1);
  assert.equal(harness.request.socket.destroy_calls, 1);
  assert.equal(firstResponse.destroy_calls, 1);
  assert.equal(firstResponse.socket.destroy_calls, 1);
  assert.equal(duplicateResponse.destroy_calls, 1);
  assert.equal(duplicateResponse.socket.destroy_calls, 1);
});

test("REQ-SBX-GENERAL-002 transport rolls back getter and listener-registration reentrancy before send", async () => {
  for (const abortingGetter of ["statusCode", "headers"] as const) {
    const controller = new AbortController();
    const harness = createNodeEmitterRequestFactory();
    const response = new NodeEmitterResponse();
    if (abortingGetter === "statusCode") {
      Object.defineProperty(response, "statusCode", {
        configurable: true,
        get() {
          controller.abort();
          return 200;
        }
      });
    } else {
      Object.defineProperty(response, "headers", {
        configurable: true,
        get() {
          controller.abort();
          return Object.freeze({ "content-type": "application/json" });
        }
      });
    }
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: null,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: harness.factory
    });
    const settlements: string[] = [];
    const pending = transport.request(ollamaInventoryRequest(controller.signal));
    void pending.then(
      () => settlements.push("resolved"),
      () => settlements.push("rejected")
    );
    harness.respond(response);

    await assert.rejects(pending, {
      name: "sandbox_security_transport_aborted"
    });
    await Promise.resolve();
    assert.deepEqual(settlements, ["rejected"]);
    for (const event of ["data", "error", "close", "end"] as const) {
      assert.equal(response.listenerCount(event), 0, `${abortingGetter}:${event}`);
    }
    assert.equal(harness.request.listenerCount("error"), 0);
    assert.equal(harness.request.listenerCount("close"), 0);
    assert.equal(harness.request.destroy_calls, 1);
    assert.equal(harness.request.socket.destroy_calls, 1);
    assert.equal(response.destroy_calls, 1);
    assert.equal(response.socket.destroy_calls, 1);
  }

  const responseController = new AbortController();
  const responseHarness = createNodeEmitterRequestFactory();
  const registeringResponse = new NodeEmitterResponse();
  registeringResponse.once("newListener", (event: string | symbol) => {
    if (event === "data") {
      responseController.abort();
    }
  });
  const responseTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: responseHarness.factory
  });
  const responsePending = responseTransport.request(
    ollamaInventoryRequest(responseController.signal)
  );
  responseHarness.respond(registeringResponse);

  await assert.rejects(responsePending, {
    name: "sandbox_security_transport_aborted"
  });
  for (const event of ["data", "error", "close", "end"] as const) {
    assert.equal(registeringResponse.listenerCount(event), 0, `registration:${event}`);
  }
  assert.equal(responseHarness.request.listenerCount("error"), 0);
  assert.equal(responseHarness.request.listenerCount("close"), 0);
  assert.equal(responseHarness.request.destroy_calls, 1);
  assert.equal(responseHarness.request.socket.destroy_calls, 1);
  assert.equal(registeringResponse.destroy_calls, 1);
  assert.equal(registeringResponse.socket.destroy_calls, 1);

  const requestController = new AbortController();
  const registeringRequest = new NodeEmitterRequest();
  registeringRequest.once("newListener", (event: string | symbol) => {
    if (event === "error") {
      requestController.abort();
    }
  });
  const requestHarness = createNodeEmitterRequestFactory(registeringRequest);
  const requestBody = jsonBytes({ raw: "never-send-after-registration-abort" });
  const requestTransport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: "openai_responses_v1",
    judge_api_key: "private-openai-key",
    judge_endpoint_url: "https://doro.lol/v1/responses",
    request_factory: requestHarness.factory
  });
  const requestSettlements: string[] = [];
  const requestPending = requestTransport.request(
    openAiResponsesRequest(requestController.signal, requestBody)
  );
  void requestPending.then(
    () => requestSettlements.push("resolved"),
    () => requestSettlements.push("rejected")
  );

  await assert.rejects(requestPending, {
    name: "sandbox_security_transport_aborted"
  });
  await Promise.resolve();
  assert.deepEqual(requestSettlements, ["rejected"]);
  assert.equal(registeringRequest.end_calls, 0);
  assert.equal(registeringRequest.sent_body, undefined);
  assert.equal(registeringRequest.listenerCount("error"), 0);
  assert.equal(registeringRequest.listenerCount("close"), 0);
  assert.equal(registeringRequest.destroy_calls, 1);
  assert.equal(registeringRequest.socket.destroy_calls, 1);
});

test("REQ-SBX-GENERAL-002 transport destroys a shared cascading socket exactly once", async () => {
  const sharedSocket = {
    destroyed: false,
    destroy_calls: 0,
    destroy(): void {
      this.destroyed = true;
      this.destroy_calls += 1;
    }
  };
  const request = new NodeEmitterRequest(sharedSocket, true);
  const response = new NodeEmitterResponse(sharedSocket, true);
  const harness = createNodeEmitterRequestFactory(request);
  const controller = new AbortController();
  const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
    expected_ollama_digest: null,
    judge_protocol_id: null,
    judge_api_key: null,
    judge_endpoint_url: null,
    request_factory: harness.factory
  });
  const pending = transport.request(ollamaInventoryRequest(controller.signal));
  harness.respond(response);
  const body = jsonBytes({ shared_socket: true });
  response.emit("data", body);
  response.emit("end");

  assert.deepEqual(await pending, {
    status: 200,
    content_type: "application/json",
    body
  });
  assert.equal(request.listenerCount("error"), 0);
  assert.equal(request.listenerCount("close"), 0);
  for (const event of ["data", "error", "close", "end"] as const) {
    assert.equal(response.listenerCount(event), 0);
  }
  assert.equal(request.destroy_calls, 1);
  assert.equal(response.destroy_calls, 1);
  assert.equal(sharedSocket.destroyed, true);
  assert.equal(sharedSocket.destroy_calls, 1);
});

test("REQ-SBX-GENERAL-002 transport rejects every invalid Ollama inventory before sending chat body bytes", async () => {
  const digestHex = "d".repeat(64);
  const expectedDigest = `sha256:${digestHex}`;
  const requestBodySentinel = "never-send-chat-for-invalid-inventory";
  const requestBody = jsonBytes({ raw_snapshot: requestBodySentinel });
  const cases: readonly Readonly<{
    name: string;
    expected_digest: string | null;
    chunks: readonly Uint8Array[];
  }>[] = [
    {
      name: "duplicate local and remote identity",
      expected_digest: expectedDigest,
      chunks: [jsonBytes({
        models: [
          { name: "qwen3:8b", model: "qwen3:8b", digest: digestHex },
          {
            name: "qwen3:8b",
            model: "qwen3:8b",
            digest: digestHex,
            remote_model: "qwen3:8b",
            remote_host: "https://remote.invalid"
          }
        ]
      })]
    },
    {
      name: "duplicate local identity",
      expected_digest: expectedDigest,
      chunks: [jsonBytes({
        models: [
          { name: "qwen3:8b", model: "qwen3:8b", digest: digestHex },
          { name: "qwen3:8b", model: "qwen3:8b", digest: digestHex }
        ]
      })]
    },
    {
      name: "remote identity",
      expected_digest: expectedDigest,
      chunks: [jsonBytes({
        models: [{
          name: "qwen3:8b",
          model: "qwen3:8b",
          digest: digestHex,
          remote_model: "qwen3:8b",
          remote_host: "https://remote.invalid"
        }]
      })]
    },
    {
      name: "missing model",
      expected_digest: expectedDigest,
      chunks: [jsonBytes({ models: [] })]
    },
    {
      name: "invalid wire digest",
      expected_digest: expectedDigest,
      chunks: [jsonBytes({
        models: [{ name: "qwen3:8b", model: "qwen3:8b", digest: "D".repeat(64) }]
      })]
    },
    {
      name: "missing configured digest",
      expected_digest: null,
      chunks: [jsonBytes({
        models: [{ name: "qwen3:8b", model: "qwen3:8b", digest: digestHex }]
      })]
    },
    {
      name: "invalid UTF-8 JSON",
      expected_digest: expectedDigest,
      chunks: [new Uint8Array([0xff, 0xfe, 0xfd])]
    }
  ];

  for (const invalidCase of cases) {
    const harness = createScriptedRequestFactory([{ chunks: invalidCase.chunks }]);
    const transport = transportModule.createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: invalidCase.expected_digest,
      judge_protocol_id: null,
      judge_api_key: null,
    judge_endpoint_url: null,
      request_factory: harness.factory
    });
    let failure: unknown;
    try {
      await transport.request(
        ollamaChatRequest(new AbortController().signal, requestBody)
      );
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof Error, `${invalidCase.name} must reject`);
    assert.equal(failure.name, "sandbox_security_transport_invalid");
    assert.equal(harness.recorded.length, 1, `${invalidCase.name} must not send chat`);
    assert.equal(harness.recorded[0]?.path, "/api/tags");
    const exposed = `${failure.name}${failure.message}${failure.stack ?? ""}${JSON.stringify(failure)}`;
    assert.equal(exposed.includes(requestBodySentinel), false);
  }
});
