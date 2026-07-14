import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

type CanonicalJsonApi = {
  canonicalizeSandboxSecurityJson: (value: unknown) => string;
  sha256CanonicalJson: (value: unknown) => string;
  sandboxSecurityJsonCanonicalEqual: (left: unknown, right: unknown) => boolean;
};

const modulePath = resolve(import.meta.dirname, "..", "src", "security", "canonical-json.ts");
const inertFallback: CanonicalJsonApi = {
  canonicalizeSandboxSecurityJson: () => "__missing_canonical_json_module__",
  sha256CanonicalJson: () => "__missing_canonical_json_module__",
  sandboxSecurityJsonCanonicalEqual: () => false
};

let canonicalJson: CanonicalJsonApi;
if (!existsSync(modulePath)) {
  canonicalJson = inertFallback;
} else {
  const loaded = await import("../src/security/canonical-json.ts");
  if (
    typeof loaded.canonicalizeSandboxSecurityJson !== "function" ||
    typeof loaded.sha256CanonicalJson !== "function" ||
    typeof loaded.sandboxSecurityJsonCanonicalEqual !== "function"
  ) {
    throw new Error("canonical-json.ts does not expose the locked JCS API");
  }
  canonicalJson = loaded;
}

const {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson,
  sandboxSecurityJsonCanonicalEqual
} = canonicalJson;

test("REQ-SBX-GENERAL-001 JCS sorts object keys by UTF-16 code units", () => {
  const emoji = String.fromCodePoint(0x1f600);
  const privateUse = "\uE000";
  const input = {
    [privateUse]: 3,
    [emoji]: 1,
    a: 2
  };

  assert.equal(
    canonicalizeSandboxSecurityJson(input),
    `{"a":2,"${emoji}":1,"${privateUse}":3}`
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes vector b1 a-0 to a0 b1", () => {
  const input = { b: 1, a: -0 };

  assert.equal(canonicalizeSandboxSecurityJson(input), "{\"a\":0,\"b\":1}");
  assert.equal(
    sha256CanonicalJson(input),
    "f4c1d8bd90d7ccd720aa5a69a67185fb9caf4f35926a4eacf53a86d0e70bdf88"
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes emoji and U+E000 key order vector", () => {
  const emoji = String.fromCodePoint(0x1f600);
  const privateUse = "\uE000";
  const input = {
    [privateUse]: 3,
    [emoji]: 1,
    a: 2
  };

  assert.equal(
    sha256CanonicalJson(input),
    "1a2ca2e262b24634fdefdb54f29503c59e9a41d86d83c34bee7043a658f53e50"
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes control-char array vector", () => {
  const input = [String.fromCharCode(0x0f), "\n", "\u00E9"];

  assert.equal(
    canonicalizeSandboxSecurityJson(input),
    `["\\u000f","\\n","\u00E9"]`
  );
  assert.equal(
    sha256CanonicalJson(input),
    "7d550de21af7506682169e89f286fa0e9804b90ed455eda1aa188df70aa5fa88"
  );
});

test("REQ-SBX-GENERAL-001 JCS rejects non-finite numbers", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalizeSandboxSecurityJson(value));
  }
});

test("REQ-SBX-GENERAL-001 JCS rejects lone surrogates", () => {
  for (const value of ["\uD800", "\uDC00", { value: "\uD800" }, ["\uDC00"]]) {
    assert.throws(() => canonicalizeSandboxSecurityJson(value));
  }
});

test("REQ-SBX-GENERAL-001 JCS uses ECMAScript finite number emission", () => {
  assert.equal(
    canonicalizeSandboxSecurityJson({
      negative_zero: -0,
      small_exponent: 1e-7,
      fixed_boundary: 1e-6,
      large_exponent: 1e21
    }),
    "{\"fixed_boundary\":0.000001,\"large_exponent\":1e+21,\"negative_zero\":0,\"small_exponent\":1e-7}"
  );
});

test("REQ-SBX-GENERAL-001 JCS retains array order and drops insignificant whitespace", () => {
  const result = canonicalizeSandboxSecurityJson([3, { b: 2, a: 1 }, 1]);

  assert.equal(result, "[3,{\"a\":1,\"b\":2},1]");
  assert.equal(/\s/.test(result), false);
});

test("REQ-SBX-GENERAL-001 canonical equality is byte-stable across key presentation order", () => {
  assert.equal(
    sandboxSecurityJsonCanonicalEqual(
      { b: 2, a: [1, true, null] },
      { a: [1, true, null], b: 2 }
    ),
    true
  );
});

test("REQ-SBX-GENERAL-001 sha256CanonicalJson returns lowercase 64 hex", () => {
  assert.match(sha256CanonicalJson({ stable: true }), /^[a-f0-9]{64}$/);
});
