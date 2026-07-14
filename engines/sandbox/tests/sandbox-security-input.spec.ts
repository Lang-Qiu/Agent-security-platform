import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

type Canonicalize = (value: unknown) => string;
type Sha256Canonical = (value: unknown) => string;
type CanonicalEqual = (left: unknown, right: unknown) => boolean;

interface CanonicalJsonModule {
  canonicalizeSandboxSecurityJson: Canonicalize;
  sha256CanonicalJson: Sha256Canonical;
  sandboxSecurityJsonCanonicalEqual: CanonicalEqual;
}

async function loadCanonicalJsonModule(): Promise<CanonicalJsonModule> {
  try {
    return (await import("../src/security/canonical-json.ts")) as CanonicalJsonModule;
  } catch {
    // Guarded loader: non-canonical sentinel fallback for valid RED when module absent.
    return {
      canonicalizeSandboxSecurityJson: () => '{"__noncanonical__":true}',
      sha256CanonicalJson: () => "0".repeat(64),
      sandboxSecurityJsonCanonicalEqual: () => false
    };
  }
}

const {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson,
  sandboxSecurityJsonCanonicalEqual
} = await loadCanonicalJsonModule();

function sha256Utf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

test("REQ-SBX-GENERAL-001 JCS sorts object keys by UTF-16 code units", () => {
  const canonical = canonicalizeSandboxSecurityJson({
    b: 1,
    a: 2,
    ["\uD83D\uDE00"]: 3,
    ["\uE000"]: 4
  });
  assert.equal(canonical, '{"a":2,"b":1,"\uD83D\uDE00":3,"\uE000":4}');
});

test("REQ-SBX-GENERAL-001 JCS freezes vector b1 a-0 to a0 b1", () => {
  const input = { b: 1, a: -0 };
  const canonical = canonicalizeSandboxSecurityJson(input);
  assert.equal(canonical, '{"a":0,"b":1}');
  assert.equal(
    sha256CanonicalJson(input),
    "f4c1d8bd90d7ccd720aa5a69a67185fb9caf4f35926a4eacf53a86d0e70bdf88"
  );
  assert.equal(
    sha256Utf8(canonical),
    "f4c1d8bd90d7ccd720aa5a69a67185fb9caf4f35926a4eacf53a86d0e70bdf88"
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes emoji and U+E000 key order vector", () => {
  const input = {
    ["\uE000"]: 3,
    ["\uD83D\uDE00"]: 1,
    a: 2
  };
  const canonical = canonicalizeSandboxSecurityJson(input);
  assert.equal(canonical, '{"a":2,"\uD83D\uDE00":1,"\uE000":3}');
  assert.equal(
    sha256CanonicalJson(input),
    "1a2ca2e262b24634fdefdb54f29503c59e9a41d86d83c34bee7043a658f53e50"
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes control-char array vector", () => {
  const input = ["\u000f", "\n", "é"];
  const canonical = canonicalizeSandboxSecurityJson(input);
  assert.equal(canonical, '["\\u000f","\\n","é"]');
  assert.equal(
    sha256CanonicalJson(input),
    "7d550de21af7506682169e89f286fa0e9804b90ed455eda1aa188df70aa5fa88"
  );
});

test("REQ-SBX-GENERAL-001 JCS rejects non-finite numbers", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalizeSandboxSecurityJson(value));
    assert.throws(() => canonicalizeSandboxSecurityJson({ value }));
    assert.throws(() => canonicalizeSandboxSecurityJson([value]));
  }
});

test("REQ-SBX-GENERAL-001 JCS rejects lone surrogates", () => {
  const high = "\uD800";
  const low = "\uDC00";
  for (const value of [high, low, `ok${high}`, `${low}ok`]) {
    assert.throws(() => canonicalizeSandboxSecurityJson(value));
    assert.throws(() => canonicalizeSandboxSecurityJson({ key: value }));
    assert.throws(() => canonicalizeSandboxSecurityJson({ [value]: 1 }));
  }
});

test("REQ-SBX-GENERAL-001 JCS retains array order and drops insignificant whitespace", () => {
  const canonical = canonicalizeSandboxSecurityJson({
    items: [3, 1, 2],
    nested: { z: true, a: false }
  });
  assert.equal(canonical, '{"items":[3,1,2],"nested":{"a":false,"z":true}}');
  assert.doesNotMatch(canonical, /\s/);
});

test("REQ-SBX-GENERAL-001 canonical equality is byte-stable across key presentation order", () => {
  assert.equal(
    sandboxSecurityJsonCanonicalEqual({ b: 1, a: 0 }, { a: 0, b: 1 }),
    true
  );
  assert.equal(
    sandboxSecurityJsonCanonicalEqual({ a: 1 }, { a: 2 }),
    false
  );
});

test("REQ-SBX-GENERAL-001 sha256CanonicalJson returns lowercase 64 hex", () => {
  const digest = sha256CanonicalJson({ a: 1 });
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, digest.toLowerCase());
});
