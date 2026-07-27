import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  verify as verifySignature
} from "node:crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ACCEPT_LIVE_MODULE = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/accept-live.ts"
);
const ACCEPTANCE_PROTOCOL = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/p6-acceptance-protocol.ts"
);
const ACCEPTANCE_PUBLIC_KEY = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/p6-acceptance-public-key.pem"
);
const REVIEWED_ACCEPTANCE_PUBLIC_KEY_SHA256 =
  "iYOT_n1bJ1BvgBl55AsKllz75jaklqgW-KGpQ51DXyg";
const RUN_ID = "0123456789abcdef0123456789abcdef";
const SHA256 = /^[0-9a-f]{64}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;

function captureBinding(): Record<string, unknown> {
  return {
    fixture_count: 300,
    judge_binding: {
      judge_binding_sha256: "9".repeat(64),
      judge_resolved_model_sha256: "8".repeat(64),
      judge_resolved_model_id: "reviewed-model/v1",
      judge_requested_model_sha256: "7".repeat(64),
      judge_requested_model_id: "reviewed-model/v1",
      judge_endpoint_url_sha256: "6".repeat(64),
      judge_base_url_sha256: "5".repeat(64),
      judge_endpoint_policy_id: "operator_https_fqdn_v1",
      judge_protocol_id: "openai_responses_v1"
    },
    execution_profile: {
      normal_work_budget_ms: 40000,
      judge_detector_slot_timeout_ms: 20000,
      local_detector_slot_timeout_ms: 20000,
      qualification_timeout_ms: 20000,
      readiness_timeout_ms: 20000,
      execution_profile_id: "p6_local_hardware_compatibility_v1"
    },
    cassette_tree_sha256: "f".repeat(64),
    decisions_tree_sha256: "e".repeat(64),
    candidate_tree_sha256: "d".repeat(64),
    candidate_package_sha256: "c".repeat(64),
    code_tree_sha256: "b".repeat(64),
    inputs_tree_sha256: "a".repeat(64)
  };
}

function evaluationBinding(): Record<string, unknown> {
  return {
    fixture_count: 300,
    accepted_metrics_sha256: "a".repeat(64),
    truth_tree_sha256: "9".repeat(64),
    cassette_tree_sha256: "8".repeat(64),
    decisions_tree_sha256: "7".repeat(64),
    inputs_tree_sha256: "6".repeat(64),
    candidate_tree_sha256: "5".repeat(64),
    candidate_package_sha256: "4".repeat(64),
    benchmark_manifest_sha256: "3".repeat(64),
    evaluation_report_sha256: "2".repeat(64),
    capture_receipt_sha256: "1".repeat(64)
  };
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function generatePrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey
    .export({
      format: "pem",
      type: "pkcs8"
    })
    .toString();
}

function writeGeneratedPrivateKey(path: string, mode = 0o600): void {
  writeFileSync(path, generatePrivateKeyPem(), { mode });
  chmodSync(path, mode);
}

interface MutableFsExports {
  openSync: typeof import("node:fs").openSync;
  readFileSync: typeof import("node:fs").readFileSync;
  readSync: typeof import("node:fs").readSync;
}

interface MutableCryptoExports {
  createPrivateKey: typeof import("node:crypto").createPrivateKey;
}

const mutableFs = createRequire(import.meta.url)("node:fs") as MutableFsExports;
const mutableCrypto = createRequire(import.meta.url)(
  "node:crypto"
) as MutableCryptoExports;

type AcceptanceProtocolModule = typeof import(
  "../../scripts/benchmark/sandbox-security/p6-acceptance-protocol.ts"
);

interface IsolatedAcceptanceProtocol {
  readonly root: string;
  readonly privateKeyPath: string;
  readonly publicKeyPath: string;
  readonly publicKeyFingerprint: string;
  readonly protocol: AcceptanceProtocolModule;
}

async function createIsolatedAcceptanceProtocol(): Promise<IsolatedAcceptanceProtocol> {
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-protocol-"));
  const copiedProtocol = join(root, "p6-acceptance-protocol.ts");
  const publicKeyPath = join(root, "p6-acceptance-public-key.pem");
  const privateKeyPath = join(root, "p6-acceptance-private-key.pem");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const publicKeyFingerprint = createHash("sha256")
    .update(publicKeyDer)
    .digest("base64url");

  copyFileSync(ACCEPTANCE_PROTOCOL, copiedProtocol);
  const protocolSource = readFileSync(copiedProtocol, "utf8");
  assert.equal(
    protocolSource.split(REVIEWED_ACCEPTANCE_PUBLIC_KEY_SHA256).length - 1,
    1
  );
  writeFileSync(
    copiedProtocol,
    protocolSource.replace(
      REVIEWED_ACCEPTANCE_PUBLIC_KEY_SHA256,
      publicKeyFingerprint
    )
  );
  writeFileSync(
    publicKeyPath,
    publicKey.export({ format: "pem", type: "spki" })
  );
  writeFileSync(
    privateKeyPath,
    privateKey.export({ format: "pem", type: "pkcs8" }),
    { mode: 0o600 }
  );
  chmodSync(privateKeyPath, 0o600);

  const protocol = await import(
    `${pathToFileURL(copiedProtocol).href}?isolated-acceptance-protocol`
  );
  return Object.freeze({
    root,
    privateKeyPath,
    publicKeyPath,
    publicKeyFingerprint,
    protocol
  });
}

const isolatedAcceptance = await createIsolatedAcceptanceProtocol();
const ACCEPTANCE_PRIVATE_KEY = isolatedAcceptance.privateKeyPath;

async function loadIsolatedAcceptanceProtocol(): Promise<AcceptanceProtocolModule> {
  return isolatedAcceptance.protocol;
}

after(() => {
  rmSync(isolatedAcceptance.root, { recursive: true, force: true });
});

test("REQ-SBX-GENERAL-002 P6 receipt deterministic tests do not depend on the live local private key", () => {
  const testSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const livePrivateKeyFilename = [
    ".p6-acceptance",
    "-private-key.pem"
  ].join("");

  assert.equal(testSource.includes(livePrivateKeyFilename), false);
});

test("REQ-SBX-GENERAL-002 production acceptance has one in-process receipt orchestrator", async () => {
  assert.equal(existsSync(ACCEPT_LIVE_MODULE), true);
  const module = await import(
    "../../scripts/benchmark/sandbox-security/accept-live.ts"
  );
  assert.equal(typeof module.runSandboxSecurityAcceptedLiveCapture, "function");
  assert.equal(typeof module.main, "function");
});

test("REQ-SBX-GENERAL-002 P6 receipt has exact keys and a canonical binding hash", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );
  const binding = captureBinding();
  const receipt = protocol.createSandboxSecurityP6AcceptanceReceipt({
    issuer: "capture",
    run_id: RUN_ID,
    issued_binding: binding,
    private_key: privateKey
  });
  const canonicalBinding = canonicalJson(binding);

  assert.deepEqual(Object.keys(receipt), [
    "schema_version",
    "issuer",
    "run_id",
    "issued_binding",
    "issued_binding_sha256",
    "acceptance_public_key_sha256",
    "signature_base64url"
  ]);
  assert.equal(
    receipt.schema_version,
    "sandbox-security-p6-acceptance-receipt.v1"
  );
  assert.equal(
    receipt.issued_binding_sha256,
    createHash("sha256").update(canonicalBinding, "utf8").digest("hex")
  );
  assert.match(receipt.issued_binding_sha256, SHA256);
  assert.match(receipt.acceptance_public_key_sha256, BASE64URL);
  assert.match(receipt.signature_base64url, BASE64URL);
  assert.equal(receipt.acceptance_public_key_sha256.includes("="), false);
  assert.equal(receipt.signature_base64url.includes("="), false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.issued_binding), true);
  assert.deepEqual(
    protocol.verifySandboxSecurityP6AcceptanceReceipt(receipt),
    receipt
  );
  assert.throws(
    () =>
      protocol.verifySandboxSecurityP6AcceptanceReceipt({
        ...receipt,
        unexpected: true
      }),
    /receipt_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt snapshots top-level binding descriptors once", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );
  const binding = captureBinding();
  const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  let bindingDescriptorReads = 0;
  Object.getOwnPropertyDescriptor = ((target: object, key: PropertyKey) => {
    if (target === binding) bindingDescriptorReads += 1;
    return originalGetOwnPropertyDescriptor(target, key);
  }) as typeof Object.getOwnPropertyDescriptor;
  try {
    protocol.createSandboxSecurityP6AcceptanceReceipt({
      issuer: "capture",
      run_id: "1013456789abcdef0123456789abcdef",
      issued_binding: binding,
      private_key: privateKey
    });
  } finally {
    Object.getOwnPropertyDescriptor = originalGetOwnPropertyDescriptor;
  }

  assert.equal(bindingDescriptorReads, Reflect.ownKeys(binding).length);
});

test("REQ-SBX-GENERAL-002 P6 receipt fixes the canonical binding limit at 4096 UTF-8 bytes", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();

  assert.equal(
    protocol.SANDBOX_SECURITY_P6_ACCEPTANCE_MAX_BINDING_BYTES,
    4096
  );
  assert.equal(
    Buffer.byteLength(canonicalJson(captureBinding()), "utf8") < 4096,
    true
  );
  assert.equal(
    Buffer.byteLength(canonicalJson(evaluationBinding()), "utf8") < 4096,
    true
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt pins the reviewed acceptance trust root", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-trust-root-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const copiedProtocol = join(root, "p6-acceptance-protocol.ts");
  const substitutedPublicKey = join(root, "p6-acceptance-public-key.pem");
  const { publicKey } = generateKeyPairSync("ed25519");
  copyFileSync(ACCEPTANCE_PROTOCOL, copiedProtocol);
  writeFileSync(
    substitutedPublicKey,
    publicKey.export({ format: "pem", type: "spki" })
  );

  await assert.rejects(
    import(`${pathToFileURL(copiedProtocol).href}?substituted-trust-root`),
    /acceptance_public_key_fingerprint_mismatch/u
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt exposes the reviewed production SPKI fingerprint", async () => {
  const protocol = await import(
    "../../scripts/benchmark/sandbox-security/p6-acceptance-protocol.ts"
  );
  const publicKey = createPublicKey(readFileSync(ACCEPTANCE_PUBLIC_KEY));
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });

  assert.equal(
    createHash("sha256").update(publicKeyDer).digest("base64url"),
    REVIEWED_ACCEPTANCE_PUBLIC_KEY_SHA256
  );
  assert.equal(
    protocol.SANDBOX_SECURITY_P6_ACCEPTANCE_PUBLIC_KEY_SHA256,
    REVIEWED_ACCEPTANCE_PUBLIC_KEY_SHA256
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt uses the exact domain-separated signing bytes", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const publicKey = createPublicKey(
    readFileSync(isolatedAcceptance.publicKeyPath)
  );
  const receipt = protocol.createSandboxSecurityP6AcceptanceReceipt({
    issuer: "capture",
    run_id: "7123456789abcdef0123456789abcdef",
    issued_binding: captureBinding(),
    private_key: protocol.loadSandboxSecurityP6AcceptancePrivateKey(
      ACCEPTANCE_PRIVATE_KEY
    )
  });
  const signingBytes = Buffer.from(
    `sandbox-security-p6-receipt.v1\n${receipt.schema_version}\n${receipt.issuer}\n${receipt.run_id}\n${receipt.issued_binding_sha256}`,
    "utf8"
  );

  assert.equal(
    protocol.SANDBOX_SECURITY_P6_ACCEPTANCE_PUBLIC_KEY_SHA256,
    isolatedAcceptance.publicKeyFingerprint
  );
  assert.equal(
    verifySignature(
      null,
      signingBytes,
      publicKey,
      Buffer.from(receipt.signature_base64url, "base64url")
    ),
    true
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt separates capture and evaluation issuer domains", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );
  const binding = captureBinding();
  const captureReceipt = protocol.createSandboxSecurityP6AcceptanceReceipt({
    issuer: "capture",
    run_id: RUN_ID,
    issued_binding: binding,
    private_key: privateKey
  });
  const evaluationReceipt = protocol.createSandboxSecurityP6AcceptanceReceipt({
    issuer: "evaluation",
    run_id: RUN_ID,
    issued_binding: evaluationBinding(),
    private_key: privateKey
  });

  assert.equal(
    protocol.verifySandboxSecurityP6AcceptanceReceipt(captureReceipt).issuer,
    "capture"
  );
  assert.equal(
    protocol.verifySandboxSecurityP6AcceptanceReceipt(evaluationReceipt).issuer,
    "evaluation"
  );
  assert.notEqual(
    captureReceipt.signature_base64url,
    evaluationReceipt.signature_base64url
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt enforces issuer-specific exact binding keys", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );
  const capture = captureBinding();
  const evaluation = evaluationBinding();
  const { code_tree_sha256: omittedCaptureHash, ...incompleteCapture } = capture;
  const {
    capture_receipt_sha256: omittedCaptureReceiptHash,
    ...incompleteEvaluation
  } = evaluation;
  void omittedCaptureHash;
  void omittedCaptureReceiptHash;

  assert.throws(
    () =>
      protocol.createSandboxSecurityP6AcceptanceReceipt({
        issuer: "capture",
        run_id: "8123456789abcdef0123456789abcdef",
        issued_binding: incompleteCapture,
        private_key: privateKey
      }),
    /issued_binding_invalid/u
  );
  assert.throws(
    () =>
      protocol.createSandboxSecurityP6AcceptanceReceipt({
        issuer: "evaluation",
        run_id: "9123456789abcdef0123456789abcdef",
        issued_binding: incompleteEvaluation,
        private_key: privateKey
      }),
    /issued_binding_invalid/u
  );
  assert.throws(
    () =>
      protocol.createSandboxSecurityP6AcceptanceReceipt({
        issuer: "capture",
        run_id: "a123456789abcdef0123456789abcdef",
        issued_binding: evaluation,
        private_key: privateKey
      }),
    /issued_binding_invalid/u
  );
  assert.throws(
    () =>
      protocol.createSandboxSecurityP6AcceptanceReceipt({
        issuer: "evaluation",
        run_id: "b123456789abcdef0123456789abcdef",
        issued_binding: capture,
        private_key: privateKey
      }),
    /issued_binding_invalid/u
  );
  assert.throws(
    () =>
      protocol.createSandboxSecurityP6AcceptanceReceipt({
        issuer: "capture",
        run_id: "c123456789abcdef0123456789abcdef",
        issued_binding: { ...capture, unexpected: true },
        private_key: privateKey
      }),
    /issued_binding_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt validates binding hashes counts and object anchors", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );

  for (const issuedBinding of [
    { ...captureBinding(), inputs_tree_sha256: "A".repeat(64) },
    { ...captureBinding(), fixture_count: 299 },
    { ...captureBinding(), execution_profile: [] },
    { ...captureBinding(), judge_binding: [] },
    { ...evaluationBinding(), accepted_metrics_sha256: "x".repeat(64) },
    { ...evaluationBinding(), fixture_count: 301 }
  ]) {
    assert.throws(
      () =>
        protocol.createSandboxSecurityP6AcceptanceReceipt({
          issuer: Object.hasOwn(issuedBinding, "capture_receipt_sha256")
            ? "evaluation"
            : "capture",
          run_id: "d123456789abcdef0123456789abcdef",
          issued_binding: issuedBinding,
          private_key: privateKey
        }),
      /issued_binding_invalid/u
    );
  }
});

test("REQ-SBX-GENERAL-002 P6 receipt enforces exact execution profile and Judge binding schemas", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );
  const valid = captureBinding();
  const executionProfile = valid.execution_profile as Record<string, unknown>;
  const judgeBinding = valid.judge_binding as Record<string, unknown>;

  for (const issuedBinding of [
    { ...valid, execution_profile: {} },
    {
      ...valid,
      execution_profile: { ...executionProfile, unexpected: true }
    },
    {
      ...valid,
      execution_profile: {
        ...executionProfile,
        readiness_timeout_ms: 19999
      }
    },
    { ...valid, judge_binding: {} },
    { ...valid, judge_binding: { ...judgeBinding, unexpected: true } },
    {
      ...valid,
      judge_binding: { ...judgeBinding, judge_protocol_id: "unknown_v1" }
    },
    {
      ...valid,
      judge_binding: {
        ...judgeBinding,
        judge_endpoint_policy_id: "localhost_v1"
      }
    },
    {
      ...valid,
      judge_binding: {
        ...judgeBinding,
        judge_binding_sha256: "A".repeat(64)
      }
    },
    {
      ...valid,
      judge_binding: {
        ...judgeBinding,
        judge_requested_model_id: "invalid model"
      }
    },
    {
      ...valid,
      judge_binding: {
        ...judgeBinding,
        judge_resolved_model_id: "x".repeat(129)
      }
    }
  ]) {
    assert.throws(
      () =>
        protocol.createSandboxSecurityP6AcceptanceReceipt({
          issuer: "capture",
          run_id: "f123456789abcdef0123456789abcdef",
          issued_binding: issuedBinding,
          private_key: privateKey
        }),
      /issued_binding_invalid/u
    );
  }
});

test("REQ-SBX-GENERAL-002 P6 receipt rejects binding and signature tampering", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const receipt = protocol.createSandboxSecurityP6AcceptanceReceipt({
    issuer: "evaluation",
    run_id: "1123456789abcdef0123456789abcdef",
    issued_binding: evaluationBinding(),
    private_key: protocol.loadSandboxSecurityP6AcceptancePrivateKey(
      ACCEPTANCE_PRIVATE_KEY
    )
  });
  const firstSignatureCharacter = receipt.signature_base64url[0];
  assert.notEqual(firstSignatureCharacter, undefined);
  const changedSignatureCharacter =
    firstSignatureCharacter === "A" ? "B" : "A";

  assert.throws(
    () =>
      protocol.verifySandboxSecurityP6AcceptanceReceipt({
        ...receipt,
        issued_binding: {
          ...receipt.issued_binding,
          candidate_package_sha256: "0".repeat(64)
        }
      }),
    /issued_binding_hash_mismatch/u
  );
  assert.throws(
    () =>
      protocol.verifySandboxSecurityP6AcceptanceReceipt({
        ...receipt,
        signature_base64url: `${changedSignatureCharacter}${receipt.signature_base64url.slice(
          1
        )}`
      }),
    /signature_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt rejects unknown public keys and wrong issuers", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const receipt = protocol.createSandboxSecurityP6AcceptanceReceipt({
    issuer: "capture",
    run_id: "2123456789abcdef0123456789abcdef",
    issued_binding: captureBinding(),
    private_key: protocol.loadSandboxSecurityP6AcceptancePrivateKey(
      ACCEPTANCE_PRIVATE_KEY
    )
  });

  assert.throws(
    () =>
      protocol.verifySandboxSecurityP6AcceptanceReceipt({
        ...receipt,
        acceptance_public_key_sha256: "A".repeat(43)
      }),
    /acceptance_public_key_unknown/u
  );
  assert.throws(
    () =>
      protocol.verifySandboxSecurityP6AcceptanceReceipt({
        ...receipt,
        issuer: "evaluation"
      }),
    /issued_binding_invalid/u
  );
  assert.throws(
    () =>
      protocol.verifySandboxSecurityP6AcceptanceReceipt({
        ...receipt,
        issuer: "prepare"
      }),
    /issuer_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt rejects noncanonical base64url encodings", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const receipt = protocol.createSandboxSecurityP6AcceptanceReceipt({
    issuer: "capture",
    run_id: "3123456789abcdef0123456789abcdef",
    issued_binding: captureBinding(),
    private_key: protocol.loadSandboxSecurityP6AcceptancePrivateKey(
      ACCEPTANCE_PRIVATE_KEY
    )
  });

  assert.throws(
    () =>
      protocol.verifySandboxSecurityP6AcceptanceReceipt({
        ...receipt,
        signature_base64url: `${receipt.signature_base64url}=`
      }),
    /signature_encoding_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 P6 receipt rejects accessors without invoking getters", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );
  let inputGetterCalls = 0;
  const input = {
    issuer: "capture",
    run_id: "4123456789abcdef0123456789abcdef",
    private_key: privateKey
  } as Record<string, unknown>;
  Object.defineProperty(input, "issued_binding", {
    enumerable: true,
    get() {
      inputGetterCalls += 1;
      return captureBinding();
    }
  });

  assert.throws(
    () => protocol.createSandboxSecurityP6AcceptanceReceipt(input),
    /receipt_input_invalid/u
  );
  assert.equal(inputGetterCalls, 0);

  let bindingGetterCalls = 0;
  const binding = captureBinding();
  Object.defineProperty(binding, "candidate_package_sha256", {
    enumerable: true,
    get() {
      bindingGetterCalls += 1;
      return "a".repeat(64);
    }
  });
  assert.throws(
    () =>
      protocol.createSandboxSecurityP6AcceptanceReceipt({
        issuer: "capture",
        run_id: "5123456789abcdef0123456789abcdef",
        issued_binding: binding,
        private_key: privateKey
      }),
    /issued_binding_invalid/u
  );
  assert.equal(bindingGetterCalls, 0);

  let unknownGetterCalls = 0;
  const bindingWithUnknownAccessor = captureBinding();
  Object.defineProperty(bindingWithUnknownAccessor, "unexpected", {
    enumerable: true,
    get() {
      unknownGetterCalls += 1;
      return true;
    }
  });
  assert.throws(
    () =>
      protocol.createSandboxSecurityP6AcceptanceReceipt({
        issuer: "capture",
        run_id: "e123456789abcdef0123456789abcdef",
        issued_binding: bindingWithUnknownAccessor,
        private_key: privateKey
      }),
    /issued_binding_invalid/u
  );
  assert.equal(unknownGetterCalls, 0);
});

test("REQ-SBX-GENERAL-002 P6 receipt rejects proxy symbol non-enumerable and malformed Unicode bindings", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );
  let proxyTrapCalls = 0;
  const proxyBinding = new Proxy(captureBinding(), {
    ownKeys(target) {
      proxyTrapCalls += 1;
      return Reflect.ownKeys(target);
    }
  });
  const symbolBinding = captureBinding();
  Object.defineProperty(symbolBinding, Symbol("unexpected"), {
    enumerable: true,
    value: true
  });
  const nonEnumerableBinding = captureBinding();
  Object.defineProperty(nonEnumerableBinding, "unexpected", {
    enumerable: false,
    value: true
  });
  const malformedUnicodeBinding = captureBinding();
  malformedUnicodeBinding.judge_binding = {
    ...(malformedUnicodeBinding.judge_binding as Record<string, unknown>),
    judge_requested_model_id: "reviewed-model\ud800"
  };

  for (const issuedBinding of [
    proxyBinding,
    symbolBinding,
    nonEnumerableBinding,
    malformedUnicodeBinding
  ]) {
    assert.throws(
      () =>
        protocol.createSandboxSecurityP6AcceptanceReceipt({
          issuer: "capture",
          run_id: "2013456789abcdef0123456789abcdef",
          issued_binding: issuedBinding,
          private_key: privateKey
        }),
      /issued_binding_invalid/u
    );
  }
  assert.equal(proxyTrapCalls, 0);
});

test("REQ-SBX-GENERAL-002 P6 receipt consumption rejects replayed clones", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const receipt = protocol.createSandboxSecurityP6AcceptanceReceipt({
    issuer: "capture",
    run_id: "6123456789abcdef0123456789abcdef",
    issued_binding: captureBinding(),
    private_key: protocol.loadSandboxSecurityP6AcceptancePrivateKey(
      ACCEPTANCE_PRIVATE_KEY
    )
  });

  assert.equal(
    protocol.consumeSandboxSecurityP6AcceptanceReceipt(receipt).issuer,
    "capture"
  );
  assert.throws(
    () =>
      protocol.consumeSandboxSecurityP6AcceptanceReceipt({
        ...receipt,
        issued_binding: { ...receipt.issued_binding }
      }),
    /receipt_replayed/u
  );
});

test("REQ-SBX-GENERAL-002 acceptance private key loads only the matching isolated key", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const privateKey = protocol.loadSandboxSecurityP6AcceptancePrivateKey(
    ACCEPTANCE_PRIVATE_KEY
  );

  assert.equal(privateKey.type, "private");
  assert.equal(privateKey.asymmetricKeyType, "ed25519");
});

test("REQ-SBX-GENERAL-002 acceptance private key zeroizes raw bytes after successful loading", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const originalCreatePrivateKey = mutableCrypto.createPrivateKey;
  let retainedInput: Buffer | undefined;
  mutableCrypto.createPrivateKey = ((...args: unknown[]) => {
    if (Buffer.isBuffer(args[0])) retainedInput = args[0];
    return Reflect.apply(originalCreatePrivateKey, mutableCrypto, args);
  }) as typeof originalCreatePrivateKey;
  syncBuiltinESMExports();
  try {
    protocol.loadSandboxSecurityP6AcceptancePrivateKey(ACCEPTANCE_PRIVATE_KEY);
  } finally {
    mutableCrypto.createPrivateKey = originalCreatePrivateKey;
    syncBuiltinESMExports();
  }

  assert.ok(retainedInput);
  assert.equal(retainedInput.every((byte) => byte === 0), true);
});

test("REQ-SBX-GENERAL-002 acceptance private key zeroizes raw bytes after invalid-key rejection", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-invalid-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  writeFileSync(privateKeyPath, "invalid private key", { mode: 0o600 });
  chmodSync(privateKeyPath, 0o600);

  const originalCreatePrivateKey = mutableCrypto.createPrivateKey;
  let retainedInput: Buffer | undefined;
  mutableCrypto.createPrivateKey = ((...args: unknown[]) => {
    if (Buffer.isBuffer(args[0])) retainedInput = args[0];
    return Reflect.apply(originalCreatePrivateKey, mutableCrypto, args);
  }) as typeof originalCreatePrivateKey;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
      /acceptance_private_key_invalid/u
    );
  } finally {
    mutableCrypto.createPrivateKey = originalCreatePrivateKey;
    syncBuiltinESMExports();
  }

  assert.ok(retainedInput);
  assert.equal(retainedInput.every((byte) => byte === 0), true);
});

test("REQ-SBX-GENERAL-002 acceptance private key rejects a private/public mismatch", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-mismatch-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  writeGeneratedPrivateKey(privateKeyPath);

  assert.throws(
    () =>
      protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
    /acceptance_private_key_public_mismatch/u
  );
});

test("REQ-SBX-GENERAL-002 acceptance private key rejects non-0600 mode", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-mode-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  writeGeneratedPrivateKey(privateKeyPath, 0o640);

  assert.throws(
    () =>
      protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
    /acceptance_private_key_mode_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 acceptance private key rejects symlinks and hardlinks", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-links-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  const symlinkPath = join(root, "private-symlink.pem");
  const hardlinkPath = join(root, "private-hardlink.pem");
  writeGeneratedPrivateKey(privateKeyPath);
  symlinkSync(privateKeyPath, symlinkPath);

  assert.throws(
    () => protocol.loadSandboxSecurityP6AcceptancePrivateKey(symlinkPath),
    /acceptance_private_key_symlink/u
  );

  linkSync(privateKeyPath, hardlinkPath);
  assert.throws(
    () => protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
    /acceptance_private_key_link_count_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 acceptance private key rejects replacement between lstat and open", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-replace-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  const replacementKeyPath = join(root, "replacement.pem");
  writeGeneratedPrivateKey(privateKeyPath);
  writeGeneratedPrivateKey(replacementKeyPath);

  const originalOpenSync = mutableFs.openSync;
  let replacementCount = 0;
  mutableFs.openSync = ((...args: unknown[]) => {
    if (args[0] === privateKeyPath) {
      replacementCount += 1;
      renameSync(replacementKeyPath, privateKeyPath);
    }
    return Reflect.apply(originalOpenSync, mutableFs, args) as number;
  }) as typeof originalOpenSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () =>
        protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
      /acceptance_private_key_binding_changed/u
    );
  } finally {
    mutableFs.openSync = originalOpenSync;
    syncBuiltinESMExports();
  }
  assert.equal(replacementCount, 1);
});

test("REQ-SBX-GENERAL-002 acceptance private key opens read-only, no-follow, and nonblocking", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const originalOpenSync = mutableFs.openSync;
  let observedFlags: number | undefined;
  mutableFs.openSync = ((...args: unknown[]) => {
    if (args[0] === ACCEPTANCE_PRIVATE_KEY) {
      observedFlags = args[1] as number;
    }
    return Reflect.apply(originalOpenSync, mutableFs, args) as number;
  }) as typeof originalOpenSync;
  syncBuiltinESMExports();
  try {
    protocol.loadSandboxSecurityP6AcceptancePrivateKey(ACCEPTANCE_PRIVATE_KEY);
  } finally {
    mutableFs.openSync = originalOpenSync;
    syncBuiltinESMExports();
  }

  assert.equal(
    observedFlags,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
});

test("REQ-SBX-GENERAL-002 acceptance private key does not use readFileSync for descriptor key material", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const originalReadFileSync = mutableFs.readFileSync;
  let descriptorReadCount = 0;
  mutableFs.readFileSync = ((...args: unknown[]) => {
    if (typeof args[0] === "number") descriptorReadCount += 1;
    return Reflect.apply(originalReadFileSync, mutableFs, args) as Buffer;
  }) as typeof originalReadFileSync;
  syncBuiltinESMExports();
  try {
    protocol.loadSandboxSecurityP6AcceptancePrivateKey(ACCEPTANCE_PRIVATE_KEY);
  } finally {
    mutableFs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
  }

  assert.equal(descriptorReadCount, 0);
});

test("REQ-SBX-GENERAL-002 acceptance private key bounds descriptor reads to the validated size plus one", async () => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const validatedSize = Number(
    statSync(ACCEPTANCE_PRIVATE_KEY, { bigint: true }).size
  );
  const originalReadSync = mutableFs.readSync;
  const requestedLengths: number[] = [];
  const bufferLengths: number[] = [];
  mutableFs.readSync = ((...args: unknown[]) => {
    if (typeof args[0] === "number") {
      assert.equal(Buffer.isBuffer(args[1]), true);
      requestedLengths.push(args[3] as number);
      bufferLengths.push((args[1] as Buffer).length);
    }
    return Reflect.apply(originalReadSync, mutableFs, args) as number;
  }) as typeof originalReadSync;
  syncBuiltinESMExports();
  try {
    protocol.loadSandboxSecurityP6AcceptancePrivateKey(ACCEPTANCE_PRIVATE_KEY);
  } finally {
    mutableFs.readSync = originalReadSync;
    syncBuiltinESMExports();
  }

  assert.ok(requestedLengths.length > 0);
  assert.equal(
    requestedLengths.every((length) => length <= validatedSize + 1),
    true
  );
  assert.equal(
    bufferLengths.every((length) => length <= validatedSize + 1),
    true
  );
});

test("REQ-SBX-GENERAL-002 acceptance private key rejects growth during descriptor reads", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-grow-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  copyFileSync(ACCEPTANCE_PRIVATE_KEY, privateKeyPath);
  chmodSync(privateKeyPath, 0o600);
  const originalSize = statSync(privateKeyPath, { bigint: true }).size;

  const originalReadSync = mutableFs.readSync;
  let mutationCount = 0;
  mutableFs.readSync = ((...args: unknown[]) => {
    if (typeof args[0] === "number" && mutationCount === 0) {
      mutationCount += 1;
      truncateSync(privateKeyPath, Number(originalSize) + 1);
    }
    return Reflect.apply(originalReadSync, mutableFs, args) as number;
  }) as typeof originalReadSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
      /acceptance_private_key_binding_changed/u
    );
  } finally {
    mutableFs.readSync = originalReadSync;
    syncBuiltinESMExports();
  }
  assert.equal(mutationCount, 1);
});


test("REQ-SBX-GENERAL-002 acceptance private key zeroizes the full bounded buffer after growth rejection", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-grow-zero-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  copyFileSync(ACCEPTANCE_PRIVATE_KEY, privateKeyPath);
  chmodSync(privateKeyPath, 0o600);
  const originalSize = statSync(privateKeyPath, { bigint: true }).size;

  const originalReadSync = mutableFs.readSync;
  let retainedBuffer: Buffer | undefined;
  let mutationCount = 0;
  mutableFs.readSync = ((...args: unknown[]) => {
    if (typeof args[0] === "number") {
      assert.equal(Buffer.isBuffer(args[1]), true);
      retainedBuffer = args[1] as Buffer;
      if (mutationCount === 0) {
        mutationCount += 1;
        truncateSync(privateKeyPath, Number(originalSize) + 1);
      }
    }
    return Reflect.apply(originalReadSync, mutableFs, args) as number;
  }) as typeof originalReadSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
      /acceptance_private_key_binding_changed/u
    );
  } finally {
    mutableFs.readSync = originalReadSync;
    syncBuiltinESMExports();
  }

  assert.equal(mutationCount, 1);
  assert.ok(retainedBuffer);
  assert.equal(retainedBuffer.length, Number(originalSize) + 1);
  assert.equal(retainedBuffer.every((byte) => byte === 0), true);
});

test("REQ-SBX-GENERAL-002 acceptance private key rejects shrinkage during descriptor reads", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-shrink-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  copyFileSync(ACCEPTANCE_PRIVATE_KEY, privateKeyPath);
  chmodSync(privateKeyPath, 0o600);
  const originalSize = statSync(privateKeyPath, { bigint: true }).size;

  const originalReadSync = mutableFs.readSync;
  let mutationCount = 0;
  mutableFs.readSync = ((...args: unknown[]) => {
    if (typeof args[0] === "number" && mutationCount === 0) {
      mutationCount += 1;
      truncateSync(privateKeyPath, Number(originalSize) - 1);
    }
    return Reflect.apply(originalReadSync, mutableFs, args) as number;
  }) as typeof originalReadSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
      /acceptance_private_key_binding_changed/u
    );
  } finally {
    mutableFs.readSync = originalReadSync;
    syncBuiltinESMExports();
  }
  assert.equal(mutationCount, 1);
});

test("REQ-SBX-GENERAL-002 acceptance private key rejects same-size mutation during descriptor read", async (context) => {
  const protocol = await loadIsolatedAcceptanceProtocol();
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-p6-key-mutate-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const privateKeyPath = join(root, "private.pem");
  const originalPem = generatePrivateKeyPem();
  const replacementPem = generatePrivateKeyPem();
  assert.equal(Buffer.byteLength(originalPem), Buffer.byteLength(replacementPem));
  writeFileSync(privateKeyPath, originalPem, { mode: 0o600 });
  chmodSync(privateKeyPath, 0o600);
  const fixedTime = new Date("2026-01-01T00:00:00.000Z");
  utimesSync(privateKeyPath, fixedTime, fixedTime);
  const pathStat = statSync(privateKeyPath, { bigint: true });

  const originalReadFileSync = mutableFs.readFileSync;
  const originalReadSync = mutableFs.readSync;
  let mutationCount = 0;
  const mutatePrivateKey = (): void => {
    if (mutationCount !== 0) return;
    mutationCount += 1;
    writeFileSync(privateKeyPath, replacementPem, { mode: 0o600 });
    chmodSync(privateKeyPath, 0o600);
    utimesSync(privateKeyPath, fixedTime, fixedTime);
    assert.equal(
      statSync(privateKeyPath, { bigint: true }).mtimeNs,
      pathStat.mtimeNs
    );
  };
  mutableFs.readFileSync = ((...args: unknown[]) => {
    const bytes = Reflect.apply(originalReadFileSync, mutableFs, args) as Buffer;
    if (typeof args[0] === "number") mutatePrivateKey();
    return bytes;
  }) as typeof originalReadFileSync;
  mutableFs.readSync = ((...args: unknown[]) => {
    const bytesRead = Reflect.apply(originalReadSync, mutableFs, args) as number;
    if (typeof args[0] === "number") mutatePrivateKey();
    return bytesRead;
  }) as typeof originalReadSync;
  syncBuiltinESMExports();
  try {
    assert.throws(
      () =>
        protocol.loadSandboxSecurityP6AcceptancePrivateKey(privateKeyPath),
      /acceptance_private_key_binding_changed/u
    );
  } finally {
    mutableFs.readFileSync = originalReadFileSync;
    mutableFs.readSync = originalReadSync;
    syncBuiltinESMExports();
  }
  assert.equal(mutationCount, 1);
});

type SandboxSecurityStageProtocolFunction = (input: unknown) => unknown;

const stageProtocolModule: Readonly<Record<string, unknown>> = await import(
  "../../scripts/benchmark/sandbox-security/stage-protocol.ts"
).catch(() => Object.freeze({}));

function requireSandboxSecurityStageProtocolExport(
  name: string
): SandboxSecurityStageProtocolFunction {
  const candidate = stageProtocolModule[name];
  assert.equal(
    typeof candidate,
    "function",
    `stage_protocol_export_missing:${name}`
  );
  return candidate as SandboxSecurityStageProtocolFunction;
}

function stageFrame(frame: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(frame)}\n`;
}

test("REQ-SBX-GENERAL-002 stage stdout parser accepts exactly one bounded newline-terminated frame", () => {
  const parseStageResult = requireSandboxSecurityStageProtocolExport(
    "parseSandboxSecurityStageResult"
  );
  const validFrame = stageFrame({
    status: "capture_complete",
    issued_binding: captureBinding()
  });
  const parsed = parseStageResult({
    exit_code: 0,
    stdout: validFrame,
    stderr: ""
  }) as Readonly<{ status: string; frame: Readonly<Record<string, unknown>> }>;
  assert.equal(parsed.status, "capture_complete");
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.frame), true);

  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: '{"status":"capture_complete"}\nextra\n',
        stderr: ""
      }),
    /stage_stdout_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: `${validFrame}${validFrame}`,
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: `\n${validFrame}`,
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: `${validFrame}\n`,
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: validFrame.slice(0, -1),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: `${validFrame.slice(0, -1)}\r\n`,
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: stageFrame({
          status: "capture_complete",
          padding: "x".repeat(4200)
        }),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({ exit_code: 0, stdout: "not json\n", stderr: "" }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
  assert.throws(
    () => parseStageResult({ exit_code: 0, stdout: "[1,2]\n", stderr: "" }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: stageFrame({ status: "unknown_status" }),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_status_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: '{"status":"capture_complete","__proto__":{"polluted":true}}\n',
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_stdout_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 stage stderr and exit codes fail closed without invoking accessors", () => {
  const parseStageResult = requireSandboxSecurityStageProtocolExport(
    "parseSandboxSecurityStageResult"
  );
  const validFrame = stageFrame({
    status: "capture_complete",
    issued_binding: captureBinding()
  });
  assert.throws(
    () => parseStageResult({ exit_code: 1, stdout: validFrame, stderr: "" }),
    /sandbox_security_stage_reject:stage_exit_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({ exit_code: "0", stdout: validFrame, stderr: "" }),
    /sandbox_security_stage_reject:stage_exit_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: validFrame,
        stderr: "warning\n"
      }),
    /sandbox_security_stage_reject:stage_stderr_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({ exit_code: 0, stdout: validFrame, stderr: " " }),
    /sandbox_security_stage_reject:stage_stderr_invalid/u
  );
  assert.throws(
    () =>
      parseStageResult({
        exit_code: 0,
        stdout: validFrame,
        stderr: "",
        extra: true
      }),
    /sandbox_security_stage_reject:input_invalid/u
  );

  let getterCalls = 0;
  const accessorInput: Record<string, unknown> = {
    exit_code: 0,
    stderr: ""
  };
  Object.defineProperty(accessorInput, "stdout", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return validFrame;
    }
  });
  assert.throws(
    () => parseStageResult(accessorInput),
    /sandbox_security_stage_reject:input_invalid/u
  );
  assert.equal(getterCalls, 0);
});

test("REQ-SBX-GENERAL-002 stage summary parsers enforce exact keys for each stage stdout status", () => {
  const parsePrepare = requireSandboxSecurityStageProtocolExport(
    "parseSandboxSecurityPrepareStageSummary"
  );
  const parseCapture = requireSandboxSecurityStageProtocolExport(
    "parseSandboxSecurityCaptureStageSummary"
  );
  const parseEvaluate = requireSandboxSecurityStageProtocolExport(
    "parseSandboxSecurityEvaluateStageSummary"
  );
  const parseSeal = requireSandboxSecurityStageProtocolExport(
    "parseSandboxSecuritySealStageSummary"
  );

  const prepareSummary = parsePrepare({
    exit_code: 0,
    stdout: stageFrame({
      status: "prepare_complete",
      bundle_descriptor_sha256: "1".repeat(64),
      inputs_tree_sha256: "2".repeat(64),
      code_tree_sha256: "3".repeat(64),
      fixture_count: 300
    }),
    stderr: ""
  }) as Readonly<Record<string, unknown>>;
  assert.equal(prepareSummary.status, "prepare_complete");
  assert.equal(prepareSummary.fixture_count, 300);
  assert.equal(Object.isFrozen(prepareSummary), true);

  assert.throws(
    () =>
      parsePrepare({
        exit_code: 0,
        stdout: stageFrame({
          status: "prepare_complete",
          bundle_descriptor_sha256: "1".repeat(64),
          inputs_tree_sha256: "2".repeat(64),
          code_tree_sha256: "3".repeat(64),
          fixture_count: 299
        }),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_summary_invalid/u
  );
  assert.throws(
    () =>
      parsePrepare({
        exit_code: 0,
        stdout: stageFrame({
          status: "prepare_complete",
          bundle_descriptor_sha256: "1".repeat(64),
          inputs_tree_sha256: "2".repeat(64),
          code_tree_sha256: "3".repeat(64),
          fixture_count: 300,
          extra_field: true
        }),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_summary_invalid/u
  );

  const captureSummary = parseCapture({
    exit_code: 0,
    stdout: stageFrame({
      status: "capture_complete",
      issued_binding: captureBinding()
    }),
    stderr: ""
  }) as Readonly<Record<string, unknown>>;
  assert.equal(captureSummary.status, "capture_complete");
  assert.equal(Object.isFrozen(captureSummary.issued_binding), true);

  assert.throws(
    () =>
      parseCapture({
        exit_code: 0,
        stdout: stageFrame({
          status: "prepare_complete",
          bundle_descriptor_sha256: "1".repeat(64),
          inputs_tree_sha256: "2".repeat(64),
          code_tree_sha256: "3".repeat(64),
          fixture_count: 300
        }),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_status_invalid/u
  );
  assert.throws(
    () =>
      parseCapture({
        exit_code: 0,
        stdout: stageFrame({
          status: "capture_complete",
          issued_binding: captureBinding(),
          stray: 1
        }),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_summary_invalid/u
  );
  assert.throws(
    () =>
      parseCapture({
        exit_code: 0,
        stdout: stageFrame({
          status: "capture_complete",
          issued_binding: "not-an-object"
        }),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_summary_invalid/u
  );

  const evaluateSummary = parseEvaluate({
    exit_code: 0,
    stdout: stageFrame({
      status: "evaluation_accepted",
      issued_binding: evaluationBinding()
    }),
    stderr: ""
  }) as Readonly<Record<string, unknown>>;
  assert.equal(evaluateSummary.status, "evaluation_accepted");

  const sealSummary = parseSeal({
    exit_code: 0,
    stdout: stageFrame({
      status: "seal_complete",
      seal_sha256: "4".repeat(64),
      capture_manifest_sha256: "5".repeat(64),
      replay_tree_sha256: "6".repeat(64),
      replay_count: 300
    }),
    stderr: ""
  }) as Readonly<Record<string, unknown>>;
  assert.equal(sealSummary.status, "seal_complete");
  assert.equal(sealSummary.replay_count, 300);

  assert.throws(
    () =>
      parseSeal({
        exit_code: 0,
        stdout: stageFrame({
          status: "seal_complete",
          seal_sha256: "not-hex",
          capture_manifest_sha256: "5".repeat(64),
          replay_tree_sha256: "6".repeat(64),
          replay_count: 300
        }),
        stderr: ""
      }),
    /sandbox_security_stage_reject:stage_summary_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 P6 live Judge binding profile fails closed until reviewed and pins the channel", async () => {
  const module = (await import(
    "../../scripts/benchmark/sandbox-security/p6-live-judge-binding.ts"
  )) as unknown as Readonly<{
    SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE: Readonly<
      Record<string, unknown>
    >;
    verifySandboxSecurityP6LiveJudgeBinding: (
      runtime: Readonly<Record<string, string>>,
      profile?: Readonly<Record<string, unknown>>
    ) => Readonly<{
      judge_requested_model_id: string;
      judge_resolved_model_id: string;
    }>;
  }>;

  const runtime = {
    judge_protocol_id: "openai_chat_completions_json_v1",
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url: "https://judge.example.test/v1",
    judge_endpoint_url: "https://judge.example.test/v1/chat/completions",
    judge_requested_model: "gpt-5.4-mini",
    judge_resolved_model: "gpt-5.4-mini-2026"
  };

  // An explicitly unreviewed profile fails closed regardless of runtime values.
  const unreviewedProfile = {
    ...module.SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE,
    reviewed: false
  };
  assert.throws(
    () =>
      module.verifySandboxSecurityP6LiveJudgeBinding(runtime, unreviewedProfile),
    /sandbox_security_p6_judge_binding_reject:profile_not_reviewed/u
  );

  const sha256 = (value: string): string =>
    createHash("sha256").update(value, "utf8").digest("hex");
  const reviewedProfile = Object.freeze({
    profile_id: "p6_live_judge_binding_v1",
    judge_protocol_id: "openai_chat_completions_json_v1",
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url_sha256: sha256(runtime.judge_base_url),
    judge_endpoint_url_sha256: sha256(runtime.judge_endpoint_url),
    judge_requested_model_id: "reviewed-requested",
    judge_requested_model_sha256: sha256(runtime.judge_requested_model),
    judge_resolved_model_id: "reviewed-resolved",
    judge_resolved_model_sha256: sha256(runtime.judge_resolved_model),
    reviewed: true
  });
  const reviewedIds = module.verifySandboxSecurityP6LiveJudgeBinding(
    runtime,
    reviewedProfile
  );
  assert.deepEqual(reviewedIds, {
    judge_requested_model_id: "reviewed-requested",
    judge_resolved_model_id: "reviewed-resolved"
  });

  assert.throws(
    () =>
      module.verifySandboxSecurityP6LiveJudgeBinding(
        { ...runtime, judge_resolved_model: "different-model" },
        reviewedProfile
      ),
    /sandbox_security_p6_judge_binding_reject:judge_channel_mismatch/u
  );
  assert.throws(
    () =>
      module.verifySandboxSecurityP6LiveJudgeBinding(
        { ...runtime, judge_protocol_id: "openai_responses_v1" },
        reviewedProfile
      ),
    /sandbox_security_p6_judge_binding_reject:judge_channel_mismatch/u
  );
});

test("REQ-SBX-GENERAL-002 acceptance authority rejects a malformed input record before launching workers", async () => {
  const module = await import(
    "../../scripts/benchmark/sandbox-security/accept-live.ts"
  );
  await assert.rejects(
    () =>
      (
        module.runSandboxSecurityAcceptedLiveCapture as unknown as (
          input: Readonly<Record<string, unknown>>
        ) => Promise<unknown>
      )({
        corpus_root: "/tmp/corpus",
        capture_parent_root: "/tmp/parent"
        // Missing output_root, credential_env_file, acceptance_private_key_path.
      }),
    /sandbox_security_accept_live_reject:input_invalid/u
  );
});

test("REQ-SBX-GENERAL-002 acceptance authority rejects a present live variable in its own environment", async () => {
  const module = await import(
    "../../scripts/benchmark/sandbox-security/accept-live.ts"
  );
  const key = "SANDBOX_SECURITY_ENABLE_JUDGE";
  const previous = process.env[key];
  process.env[key] = "1";
  try {
    await assert.rejects(
      () =>
        module.runSandboxSecurityAcceptedLiveCapture({
          corpus_root: "/tmp/corpus",
          capture_parent_root: "/tmp/parent",
          output_root: "/tmp/out",
          credential_env_file: "/tmp/env",
          acceptance_private_key_path: "/tmp/key.pem"
        }),
      /sandbox_security_stage_reject:live_environment_present/u
    );
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
