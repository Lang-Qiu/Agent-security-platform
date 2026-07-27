import { timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { types as utilTypes } from "node:util";
import {
  SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID,
  SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID,
  normalizeSandboxSecurityJudgeEndpoint,
  type SandboxSecurityJudgeProtocolId
} from "./judge-protocol-adapter.ts";

export type SandboxSecurityHttpRequest =
  | Readonly<{
      provider: "ollama";
      operation: "model_inventory";
      signal: AbortSignal;
      max_response_bytes: 65536;
    }>
  | Readonly<{
      provider: "ollama";
      operation: "chat";
      body: Uint8Array;
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

export interface SandboxSecurityHttpResponse {
  readonly status: number;
  readonly content_type: string | null;
  readonly body: Uint8Array;
  readonly verified_ollama_digest?: string;
}

export interface SandboxSecurityPrivateSocket {
  readonly destroyed?: boolean;
  destroy(error?: Error): void;
}

export interface SandboxSecurityPrivateIncomingResponse {
  readonly statusCode?: number;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly socket?: SandboxSecurityPrivateSocket;
  on(event: "data", listener: (chunk: unknown) => void): this;
  once(event: "end" | "error" | "close", listener: (error?: unknown) => void): this;
  removeListener(event: "data" | "end" | "error" | "close", listener: (...arguments_: readonly unknown[]) => void): this;
  destroy(error?: Error): void;
}

export interface SandboxSecurityPrivateClientRequest {
  readonly socket?: SandboxSecurityPrivateSocket;
  once(event: "error" | "close", listener: (error?: unknown) => void): this;
  removeListener(event: "error" | "close", listener: (...arguments_: readonly unknown[]) => void): this;
  end(body?: Uint8Array): void;
  destroy(error?: Error): void;
}

export interface SandboxSecurityPrivateRequestFactory {
  request(
    url: URL,
    options: Readonly<{
      method: "GET" | "POST";
      headers: Readonly<Record<string, string>>;
      signal: AbortSignal;
    }>,
    on_response: (response: SandboxSecurityPrivateIncomingResponse) => void
  ): SandboxSecurityPrivateClientRequest;
}

export interface SandboxSecurityHttpTransport {
  request(input: Readonly<SandboxSecurityHttpRequest>): Promise<Readonly<SandboxSecurityHttpResponse>>;
}

const MAX_RESPONSE_BYTES = 65536;
const MAX_REQUEST_BODY_BYTES = 65536;
export const SANDBOX_SECURITY_JUDGE_API_KEY_MAX_UTF8_BYTES = 4096;
const OLLAMA_INVENTORY_URL = "http://127.0.0.1:11434/api/tags";
const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  "byteLength"
)?.get;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
const ABORT_SIGNAL_ABORTED_GETTER = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted"
)?.get;
const EVENT_TARGET_ADD_EVENT_LISTENER = EventTarget.prototype.addEventListener;
const EVENT_TARGET_REMOVE_EVENT_LISTENER = EventTarget.prototype.removeEventListener;

function namedTransportError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function invalid(): never {
  throw namedTransportError("sandbox_security_transport_invalid");
}

function judgeOperationForProtocol(
  protocolId: SandboxSecurityJudgeProtocolId
): "responses" | "chat_completions" {
  if (protocolId === SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID) {
    return "responses";
  }
  if (
    protocolId ===
    SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID
  ) {
    return "chat_completions";
  }
  return invalid();
}

function normalizeJudgeEndpointForTransport(
  protocolId: SandboxSecurityJudgeProtocolId,
  endpointUrl: string
): string {
  try {
    return normalizeSandboxSecurityJudgeEndpoint(protocolId, endpointUrl)
      .endpoint_url;
  } catch {
    return invalid();
  }
}

function validJudgeApiKey(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= SANDBOX_SECURITY_JUDGE_API_KEY_MAX_UTF8_BYTES &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    new TextEncoder().encode(value).byteLength <=
      SANDBOX_SECURITY_JUDGE_API_KEY_MAX_UTF8_BYTES
  );
}

function containsExactByteSequence(
  haystack: Uint8Array,
  needle: Uint8Array
): boolean {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }
  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

function containsDecodedJsonByteSequence(
  body: Uint8Array,
  needle: Uint8Array
): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(body)
    ) as unknown;
  } catch {
    return false;
  }

  const pending: unknown[] = [parsed];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "string") {
      if (containsExactByteSequence(new TextEncoder().encode(value), needle)) {
        return true;
      }
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      if (containsExactByteSequence(new TextEncoder().encode(key), needle)) {
        return true;
      }
      pending.push(child);
    }
  }
  return false;
}

function containsCredentialReflection(
  body: Uint8Array,
  credential: Uint8Array
): boolean {
  return (
    containsExactByteSequence(body, credential) ||
    containsDecodedJsonByteSequence(body, credential)
  );
}


function copyUint8ArrayInternalBytesAtMost(
  value: unknown,
  maxByteLength: number
): Uint8Array {
  try {
    if (
      !(value instanceof Uint8Array) ||
      TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined
    ) {
      return invalid();
    }
    const byteLength = Reflect.apply(
      TYPED_ARRAY_BYTE_LENGTH_GETTER,
      value,
      []
    ) as number;
    if (byteLength > maxByteLength) {
      return invalid();
    }
    const copy = new Uint8Array(byteLength);
    Reflect.apply(UINT8_ARRAY_SET, copy, [value]);
    return copy;
  } catch {
    return invalid();
  }
}

function copyUint8ArrayInternalBytes(value: unknown): Uint8Array {
  return copyUint8ArrayInternalBytesAtMost(value, Number.MAX_SAFE_INTEGER);
}

function nativeAbortSignalAborted(value: unknown): boolean {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    ABORT_SIGNAL_ABORTED_GETTER === undefined
  ) {
    return invalid();
  }
  try {
    const aborted = Reflect.apply(ABORT_SIGNAL_ABORTED_GETTER, value, []);
    return typeof aborted === "boolean" ? aborted : invalid();
  } catch {
    return invalid();
  }
}

function isNativeAbortSignal(value: unknown): value is AbortSignal {
  try {
    nativeAbortSignalAborted(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeContentType(value: string | readonly string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase();
  return normalized === "" || normalized === undefined ? null : normalized;
}

const defaultRequestFactory: SandboxSecurityPrivateRequestFactory = Object.freeze({
  request(
    url: URL,
    options: Readonly<{
      method: "GET" | "POST";
      headers: Readonly<Record<string, string>>;
      signal: AbortSignal;
    }>,
    onResponse: (response: SandboxSecurityPrivateIncomingResponse) => void
  ) {
    const request = url.protocol === "http:" ? httpRequest : httpsRequest;
    return request(url, {
      method: options.method,
      headers: { ...options.headers },
      signal: options.signal
    }, onResponse as never) as unknown as SandboxSecurityPrivateClientRequest;
  }
});

function requestWire(
  factory: SandboxSecurityPrivateRequestFactory,
  input: Readonly<{
    url: string;
    method: "GET" | "POST";
    headers: Readonly<Record<string, string>>;
    body?: Uint8Array;
    signal: AbortSignal;
    credential_bytes?: Uint8Array | null;
  }>
): Promise<Readonly<SandboxSecurityHttpResponse>> {
  const { signal } = input;
  if (nativeAbortSignalAborted(signal)) {
    return Promise.reject(namedTransportError("sandbox_security_transport_aborted"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let activeRequest: SandboxSecurityPrivateClientRequest | undefined;
    let activeResponse: SandboxSecurityPrivateIncomingResponse | undefined;
    const destroyed = new Set<object>();
    let onResponseData: ((...arguments_: readonly unknown[]) => void) | undefined;
    let onResponseEnd: ((...arguments_: readonly unknown[]) => void) | undefined;
    let onResponseError: ((...arguments_: readonly unknown[]) => void) | undefined;
    let onResponseClose: ((...arguments_: readonly unknown[]) => void) | undefined;

    const onRequestError = (): void => {
      finish("reject", namedTransportError("sandbox_security_transport_connection_failed"));
    };
    const onRequestClose = (): void => {
      finish("reject", namedTransportError("sandbox_security_transport_connection_failed"));
    };
    const onAbort = (): void => {
      finish("reject", namedTransportError("sandbox_security_transport_aborted"));
    };

    const ignoreCleanupError = (cleanupAction: () => void): void => {
      try {
        cleanupAction();
      } catch {
        // Provider-owned cleanup hooks cannot replace or prevent the safe terminal result.
      }
    };

    const removeListeners = (): void => {
      ignoreCleanupError(() => {
        Reflect.apply(EVENT_TARGET_REMOVE_EVENT_LISTENER, signal, ["abort", onAbort]);
      });
      if (activeRequest !== undefined) {
        ignoreCleanupError(() => activeRequest?.removeListener("error", onRequestError));
        ignoreCleanupError(() => activeRequest?.removeListener("close", onRequestClose));
      }
      if (activeResponse !== undefined) {
        if (onResponseData !== undefined) {
          ignoreCleanupError(() => activeResponse?.removeListener("data", onResponseData!));
        }
        if (onResponseEnd !== undefined) {
          ignoreCleanupError(() => activeResponse?.removeListener("end", onResponseEnd!));
        }
        if (onResponseError !== undefined) {
          ignoreCleanupError(() => activeResponse?.removeListener("error", onResponseError!));
        }
        if (onResponseClose !== undefined) {
          ignoreCleanupError(() => activeResponse?.removeListener("close", onResponseClose!));
        }
      }
    };

    const destroyOnce = (resource: unknown): void => {
      if ((typeof resource !== "object" && typeof resource !== "function") || resource === null) {
        return;
      }
      if (destroyed.has(resource)) {
        return;
      }
      destroyed.add(resource);
      try {
        (resource as { destroy(): void }).destroy();
      } catch {
        // Destruction is terminal cleanup; never expose a provider-owned error.
      }
    };

    const destroyResources = (
      request: SandboxSecurityPrivateClientRequest | undefined,
      response: SandboxSecurityPrivateIncomingResponse | undefined
    ): void => {
      const sockets = new Set<SandboxSecurityPrivateSocket>();
      if (request !== undefined) {
        ignoreCleanupError(() => {
          const socket = request.socket;
          if (socket !== undefined) {
            sockets.add(socket);
          }
        });
      }
      if (response !== undefined) {
        ignoreCleanupError(() => {
          const socket = response.socket;
          if (socket !== undefined) {
            sockets.add(socket);
          }
        });
      }
      if (request !== undefined) {
        destroyOnce(request);
      }
      if (response !== undefined) {
        destroyOnce(response);
      }
      for (const socket of sockets) {
        if (destroyed.has(socket)) {
          continue;
        }
        let socketDestroyed = false;
        ignoreCleanupError(() => {
          socketDestroyed = socket.destroyed === true;
        });
        if (socketDestroyed) {
          destroyed.add(socket);
        } else {
          destroyOnce(socket);
        }
      }
    };

    const destroyRequest = (request: SandboxSecurityPrivateClientRequest): void => {
      destroyResources(request, undefined);
    };

    const destroyResponse = (response: SandboxSecurityPrivateIncomingResponse): void => {
      destroyResources(undefined, response);
    };

    const cleanup = (): void => {
      removeListeners();
      destroyResources(activeRequest, activeResponse);
    };

    const rollbackAfterTerminal = (): boolean => {
      if (!settled) {
        return false;
      }
      ignoreCleanupError(cleanup);
      return true;
    };

    const finish = (
      action: "resolve" | "reject",
      value: Readonly<SandboxSecurityHttpResponse> | Error
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      ignoreCleanupError(cleanup);
      if (action === "resolve") {
        resolve(value as Readonly<SandboxSecurityHttpResponse>);
      } else {
        reject(value as Error);
      }
    };
    try {
      Reflect.apply(EVENT_TARGET_ADD_EVENT_LISTENER, signal, [
        "abort",
        onAbort,
        { once: true }
      ]);
      if (nativeAbortSignalAborted(signal)) {
        onAbort();
        return;
      }
    } catch {
      finish("reject", namedTransportError("sandbox_security_transport_invalid"));
      return;
    }

    try {
      const request = factory.request(
        new URL(input.url),
        Object.freeze({
          method: input.method,
          headers: Object.freeze({ ...input.headers }),
          signal
        }),
        (response) => {
          if (settled) {
            destroyResponse(response);
            return;
          }
          if (activeResponse !== undefined) {
            destroyResponse(response);
            finish("reject", namedTransportError("sandbox_security_transport_invalid"));
            return;
          }
          activeResponse = response;
          let status: number;
          let contentType: string | null;
          try {
            const wireStatus = response.statusCode;
            if (rollbackAfterTerminal()) {
              return;
            }
            if (
              wireStatus === undefined ||
              !Number.isInteger(wireStatus) ||
              wireStatus < 200 ||
              wireStatus > 599 ||
              (wireStatus >= 300 && wireStatus < 400)
            ) {
              finish("reject", namedTransportError("sandbox_security_transport_invalid"));
              return;
            }
            status = wireStatus;
            const headers = response.headers;
            if (rollbackAfterTerminal()) {
              return;
            }
            const wireContentType = headers["content-type"];
            if (rollbackAfterTerminal()) {
              return;
            }
            contentType = normalizeContentType(wireContentType);
          } catch {
            finish("reject", namedTransportError("sandbox_security_transport_invalid"));
            rollbackAfterTerminal();
            return;
          }
          if (
            contentType !== "application/json" &&
            (input.credential_bytes === undefined || input.credential_bytes === null)
          ) {
            finish("reject", namedTransportError("sandbox_security_transport_invalid"));
            return;
          }
          const body: number[] = [];
          let responseBytes = 0;
          onResponseData = (chunk: unknown): void => {
            try {
              if (
                !(chunk instanceof Uint8Array) ||
                TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined
              ) {
                finish("reject", namedTransportError("sandbox_security_transport_invalid"));
                return;
              }
              const chunkBytes = Reflect.apply(
                TYPED_ARRAY_BYTE_LENGTH_GETTER,
                chunk,
                []
              ) as number;
              responseBytes += chunkBytes;
              if (responseBytes > MAX_RESPONSE_BYTES) {
                finish("reject", namedTransportError("sandbox_security_transport_response_too_large"));
                return;
              }
              const copy = new Uint8Array(chunkBytes);
              Reflect.apply(UINT8_ARRAY_SET, copy, [chunk]);
              for (let index = 0; index < copy.length; index += 1) {
                body.push(copy[index] as number);
              }
            } catch {
              finish("reject", namedTransportError("sandbox_security_transport_invalid"));
            }
          };
          onResponseError = (): void => {
            finish("reject", namedTransportError("sandbox_security_transport_connection_failed"));
          };
          onResponseClose = (): void => {
            finish("reject", namedTransportError("sandbox_security_transport_connection_failed"));
          };
          onResponseEnd = (): void => {
            try {
              const bodyBytes = Uint8Array.from(body);
              const credentialBytes = input.credential_bytes;
              if (
                credentialBytes !== undefined &&
                credentialBytes !== null &&
                containsCredentialReflection(bodyBytes, credentialBytes)
              ) {
                finish(
                  "reject",
                  namedTransportError(
                    "sandbox_security_transport_credential_reflection"
                  )
                );
                return;
              }
              if (contentType !== "application/json") {
                finish(
                  "reject",
                  namedTransportError("sandbox_security_transport_invalid")
                );
                return;
              }
              finish(
                "resolve",
                Object.freeze({
                  status,
                  content_type: contentType,
                  body: bodyBytes
                })
              );
            } catch {
              finish("reject", namedTransportError("sandbox_security_transport_invalid"));
            }
          };
          if (rollbackAfterTerminal()) {
            return;
          }
          try {
            response.on("data", onResponseData);
            if (rollbackAfterTerminal()) {
              return;
            }
            response.once("error", onResponseError);
            if (rollbackAfterTerminal()) {
              return;
            }
            response.once("close", onResponseClose);
            if (rollbackAfterTerminal()) {
              return;
            }
            response.once("end", onResponseEnd);
            rollbackAfterTerminal();
          } catch {
            finish("reject", namedTransportError("sandbox_security_transport_connection_failed"));
            rollbackAfterTerminal();
          }
        }
      );
      activeRequest = request;
      if (settled) {
        destroyRequest(request);
        return;
      }
      request.once("error", onRequestError);
      if (rollbackAfterTerminal()) {
        return;
      }
      request.once("close", onRequestClose);
      if (rollbackAfterTerminal()) {
        return;
      }
      request.end(
        input.body === undefined
          ? undefined
          : copyUint8ArrayInternalBytes(input.body)
      );
    } catch {
      finish("reject", namedTransportError("sandbox_security_transport_connection_failed"));
    }
  });
}

export function equalSandboxSecurityNormalizedDigest(
  left: string,
  right: string
): boolean {
  if (!SHA256_DIGEST.test(left) || !SHA256_DIGEST.test(right)) {
    return false;
  }
  return timingSafeEqual(
    new TextEncoder().encode(left),
    new TextEncoder().encode(right)
  );
}

function revalidatedOllamaDigest(
  response: Readonly<SandboxSecurityHttpResponse>,
  expectedDigest: string | null
): string {
  if (
    expectedDigest === null ||
    !SHA256_DIGEST.test(expectedDigest) ||
    response.status !== 200 ||
    response.content_type !== "application/json"
  ) {
    return invalid();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
  } catch {
    return invalid();
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as { models?: unknown }).models)
  ) {
    return invalid();
  }

  const matchingModels = (parsed as { models: unknown[] }).models.filter((candidate) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      return false;
    }
    const model = candidate as Record<string, unknown>;
    return model.name === "qwen3:8b" && model.model === "qwen3:8b";
  });
  if (matchingModels.length !== 1) {
    return invalid();
  }
  const matchingModel = matchingModels[0] as Record<string, unknown>;
  if (
    Object.hasOwn(matchingModel, "remote_model") ||
    Object.hasOwn(matchingModel, "remote_host")
  ) {
    return invalid();
  }
  const wireDigest = matchingModel.digest;
  if (typeof wireDigest !== "string" || !/^[a-f0-9]{64}$/.test(wireDigest)) {
    return invalid();
  }
  const normalizedDigest = `sha256:${wireDigest}`;
  if (!equalSandboxSecurityNormalizedDigest(normalizedDigest, expectedDigest)) {
    throw namedTransportError("sandbox_security_transport_digest_mismatch");
  }
  return normalizedDigest;
}

function plainDataValues(value: unknown): ReadonlyMap<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    utilTypes.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return invalid();
  }
  const values = new Map<string, unknown>();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      return invalid();
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return invalid();
    }
    values.set(key, descriptor.value);
  }
  return values;
}

function assertExactKeys(
  values: ReadonlyMap<string, unknown>,
  expected: readonly string[]
): void {
  if (
    values.size !== expected.length ||
    expected.some((key) => !values.has(key))
  ) {
    invalid();
  }
}

function normalizeRequestFactory(
  value: unknown
): SandboxSecurityPrivateRequestFactory {
  try {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null ||
      utilTypes.isProxy(value)
    ) {
      return invalid();
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, "request");
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "function"
    ) {
      return invalid();
    }
    return value as SandboxSecurityPrivateRequestFactory;
  } catch {
    return invalid();
  }
}

function normalizeTransportConfiguration(
  value: unknown
): Readonly<{
  factory: SandboxSecurityPrivateRequestFactory;
  expected_ollama_digest: string | null;
  judge_protocol_id: SandboxSecurityJudgeProtocolId | null;
  judge_api_key: string | null;
  judge_endpoint_url: string | null;
}> {
  try {
    const values = plainDataValues(value);
    const hasRequestFactory = values.has("request_factory");
    assertExactKeys(
      values,
      hasRequestFactory
          ? [
              "expected_ollama_digest",
              "judge_protocol_id",
              "judge_api_key",
              "judge_endpoint_url",
              "request_factory"
            ]
        : [
            "expected_ollama_digest",
            "judge_protocol_id",
            "judge_api_key",
            "judge_endpoint_url"
          ]
    );
    const expectedOllamaDigest = values.get("expected_ollama_digest");
    const judgeProtocolId = values.get("judge_protocol_id");
    const judgeApiKey = values.get("judge_api_key");
    const judgeEndpointUrl = values.get("judge_endpoint_url");
    if (
      (typeof expectedOllamaDigest !== "string" && expectedOllamaDigest !== null) ||
      (typeof judgeProtocolId !== "string" && judgeProtocolId !== null) ||
      (typeof judgeApiKey !== "string" && judgeApiKey !== null) ||
      (typeof judgeEndpointUrl !== "string" && judgeEndpointUrl !== null) ||
      (judgeProtocolId === null) !== (judgeApiKey === null) ||
      (judgeProtocolId === null) !== (judgeEndpointUrl === null) ||
      (typeof judgeApiKey === "string" && !validJudgeApiKey(judgeApiKey))
    ) {
      return invalid();
    }
    const normalizedJudgeEndpointUrl =
      judgeProtocolId === null || judgeEndpointUrl === null
        ? null
        : normalizeJudgeEndpointForTransport(
            judgeProtocolId as SandboxSecurityJudgeProtocolId,
            judgeEndpointUrl
          );
    return Object.freeze({
      factory: hasRequestFactory
        ? normalizeRequestFactory(values.get("request_factory"))
        : defaultRequestFactory,
      expected_ollama_digest: expectedOllamaDigest,
      judge_protocol_id:
        judgeProtocolId as SandboxSecurityJudgeProtocolId | null,
      judge_api_key: judgeApiKey,
      judge_endpoint_url: normalizedJudgeEndpointUrl
    });
  } catch {
    return invalid();
  }
}

function normalizeHttpRequest(value: unknown): Readonly<SandboxSecurityHttpRequest> {
  try {
    const values = plainDataValues(value);
    const provider = values.get("provider");
    const operation = values.get("operation");
    const signal = values.get("signal");
    if (!isNativeAbortSignal(signal) || values.get("max_response_bytes") !== MAX_RESPONSE_BYTES) {
      return invalid();
    }
    if (provider === "ollama" && operation === "model_inventory") {
      assertExactKeys(values, ["provider", "operation", "signal", "max_response_bytes"]);
      return Object.freeze({
        provider,
        operation,
        signal,
        max_response_bytes: MAX_RESPONSE_BYTES
      });
    }
    if (
      (provider === "ollama" && operation === "chat") ||
      (provider === "openai" &&
        (operation === "responses" || operation === "chat_completions"))
    ) {
      assertExactKeys(values, ["provider", "operation", "body", "signal", "max_response_bytes"]);
      const body = values.get("body");
      const normalizedBody = copyUint8ArrayInternalBytesAtMost(
        body,
        MAX_REQUEST_BODY_BYTES
      );
      const normalized = {
        provider,
        operation,
        body: normalizedBody,
        signal,
        max_response_bytes: MAX_RESPONSE_BYTES
      };
      return Object.freeze(normalized) as Readonly<SandboxSecurityHttpRequest>;
    }
    return invalid();
  } catch {
    return invalid();
  }
}

export function createSandboxSecurityDefaultHttpTransport(input: Readonly<{
  expected_ollama_digest: string | null;
  judge_protocol_id: SandboxSecurityJudgeProtocolId | null;
  judge_api_key: string | null;
  judge_endpoint_url: string | null;
  request_factory?: SandboxSecurityPrivateRequestFactory;
}>): SandboxSecurityHttpTransport {
  const {
    factory,
    expected_ollama_digest: expectedOllamaDigest,
    judge_protocol_id: judgeProtocolId,
    judge_api_key: configuredJudgeApiKey,
    judge_endpoint_url: judgeEndpointUrl
  } = normalizeTransportConfiguration(input);

  let judgeCredentialBytes: Uint8Array | null = null;
  let judgeAuthorization: string | null = null;
  if (typeof configuredJudgeApiKey === "string") {
    judgeCredentialBytes = new TextEncoder().encode(configuredJudgeApiKey);
    judgeAuthorization = `Bearer ${configuredJudgeApiKey}`;
  }

  return Object.freeze({
    async request(
      request: Readonly<SandboxSecurityHttpRequest>
    ): Promise<Readonly<SandboxSecurityHttpResponse>> {
      const normalizedRequest = normalizeHttpRequest(request);
      if (normalizedRequest.provider === "ollama" && normalizedRequest.operation === "model_inventory") {
        return requestWire(factory, {
          url: OLLAMA_INVENTORY_URL,
          method: "GET",
          headers: Object.freeze({}),
          signal: normalizedRequest.signal
        });
      }
      if (normalizedRequest.provider === "ollama" && normalizedRequest.operation === "chat") {
        const inventory = await requestWire(factory, {
          url: OLLAMA_INVENTORY_URL,
          method: "GET",
          headers: Object.freeze({}),
          signal: normalizedRequest.signal
        });
        const verifiedOllamaDigest = revalidatedOllamaDigest(
          inventory,
          expectedOllamaDigest
        );
        const response = await requestWire(factory, {
          url: OLLAMA_CHAT_URL,
          method: "POST",
          headers: Object.freeze({ "content-type": "application/json" }),
          body: copyUint8ArrayInternalBytes(normalizedRequest.body),
          signal: normalizedRequest.signal
        });
        if (response.status < 200 || response.status >= 300) {
          return response;
        }
        return Object.freeze({
          ...response,
          verified_ollama_digest: verifiedOllamaDigest
        });
      }
      if (normalizedRequest.provider === "openai") {
        if (
          judgeCredentialBytes === null ||
          judgeAuthorization === null ||
          judgeProtocolId === null ||
          typeof judgeEndpointUrl !== "string" ||
          normalizedRequest.operation !==
            judgeOperationForProtocol(judgeProtocolId)
        ) {
          return invalid();
        }
        const normalizedJudgeEndpointUrl = normalizeJudgeEndpointForTransport(
          judgeProtocolId,
          judgeEndpointUrl
        );
        return requestWire(factory, {
          url: normalizedJudgeEndpointUrl,
          method: "POST",
          headers: Object.freeze({
            "content-type": "application/json",
            authorization: judgeAuthorization
          }),
          body: copyUint8ArrayInternalBytes(normalizedRequest.body),
          signal: normalizedRequest.signal,
          credential_bytes: judgeCredentialBytes
        });
      }
      return invalid();
    }
  });
}
