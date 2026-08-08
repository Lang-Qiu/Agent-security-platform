import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Resolved at runtime so the `.mjs` script is not a statically analyzable
// specifier. The script is plain ESM with no declaration file, and adding one
// would create a file outside this requirement's ownership map.
const PATCH_SCRIPT_HREF = new URL(
  "../scripts/apply-general-security-patch.mjs",
  import.meta.url
).href;

const patchModule = (await import(PATCH_SCRIPT_HREF).catch(() => ({}))) as Record<
  string,
  unknown
>;

type RecordValue = Record<string, unknown>;
type Fixture = {
  root: string;
  packageRoot: string;
  manifestPath: string;
  patchPath: string;
};

const A_BEFORE = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
const A_AFTER = "const a = 1;\nconst b = 2;\nconst security = true;\nconst c = 3;\n";
const B_BEFORE = 'export const version = "1.0.0";\n';
const B_AFTER = 'export const version = "1.0.0";\nexport const patched = true;\n';

const PATCH_TEXT = [
  "diff --git a/dist/a.js b/dist/a.js",
  "--- a/dist/a.js",
  "+++ b/dist/a.js",
  "@@ -1,3 +1,4 @@",
  " const a = 1;",
  " const b = 2;",
  "+const security = true;",
  " const c = 3;",
  "diff --git a/dist/b.js b/dist/b.js",
  "--- a/dist/b.js",
  "+++ b/dist/b.js",
  "@@ -1 +1,2 @@",
  ' export const version = "1.0.0";',
  "+export const patched = true;",
  ""
].join("\n");

function applyVerifiedPatch(): Function {
  const fn = patchModule.applyVerifiedPatch;
  assert.equal(
    typeof fn,
    "function",
    "applyVerifiedPatch must be exported from apply-general-security-patch.mjs"
  );
  return fn as Function;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "g4-patch-"));
  return root;
}

function writeManifest(
  root: string,
  overrides: RecordValue = {},
  fileOverrides: Array<RecordValue> | null = null
): string {
  const manifest: RecordValue = {
    schema_version: "openclaw-security-patch-manifest.v1",
    package_name: "synthetic-fixture",
    package_version: "1.0.0",
    npm_integrity: `sha512-${"A".repeat(86)}==`,
    tarball_sha256: sha256("synthetic-tarball"),
    patch_tool: "git",
    patch_tool_version: "2.0.0",
    patch_sha256: sha256(PATCH_TEXT),
    files:
      fileOverrides ?? [
        {
          path: "dist/a.js",
          sha256_before: sha256(A_BEFORE),
          sha256_after: sha256(A_AFTER)
        },
        {
          path: "dist/b.js",
          sha256_before: sha256(B_BEFORE),
          sha256_after: sha256(B_AFTER)
        }
      ],
    ...overrides
  };
  const manifestPath = path.join(root, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

function makeFixture(options: {
  manifestOverrides?: RecordValue;
  fileOverrides?: Array<RecordValue> | null;
  patchText?: string;
  applied?: boolean;
} = {}): Fixture {
  const root = makeRoot();
  const packageRoot = path.join(root, "package");
  mkdirSync(path.join(packageRoot, "dist"), { recursive: true });
  writeFileSync(
    path.join(packageRoot, "dist", "a.js"),
    options.applied === true ? A_AFTER : A_BEFORE,
    "utf8"
  );
  writeFileSync(
    path.join(packageRoot, "dist", "b.js"),
    options.applied === true ? B_AFTER : B_BEFORE,
    "utf8"
  );
  writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: "synthetic-fixture", version: "1.0.0" }),
    "utf8"
  );

  const patchPath = path.join(root, "fixture.patch");
  writeFileSync(patchPath, options.patchText ?? PATCH_TEXT, "utf8");

  const manifestPath = writeManifest(
    root,
    {
      ...(options.patchText === undefined
        ? {}
        : { patch_sha256: sha256(options.patchText) }),
      ...(options.manifestOverrides ?? {})
    },
    options.fileOverrides ?? null
  );

  return { root, packageRoot, manifestPath, patchPath };
}

function invoke(fixture: Fixture, extra: RecordValue = {}): RecordValue {
  return applyVerifiedPatch()({
    packageRoot: fixture.packageRoot,
    manifestPath: fixture.manifestPath,
    patchPath: fixture.patchPath,
    ...extra
  }) as RecordValue;
}

function readTree(packageRoot: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        result[rel] = readFileSync(full, "utf8");
      }
    }
  };
  walk(packageRoot, "");
  return result;
}

function cleanup(fixture: Fixture): void {
  rmSync(fixture.root, { recursive: true, force: true });
}

function assertNoDisposableSiblings(fixture: Fixture): void {
  const siblings = readdirSync(fixture.root);
  const unexpected = siblings.filter(
    (name) =>
      name !== "package" && name !== "manifest.json" && name !== "fixture.patch"
  );
  assert.deepEqual(
    unexpected,
    [],
    `disposable copies must be deleted, found ${unexpected.join(",")}`
  );
}

test("REQ-SBX-GENERAL-004 P4-T1 applies a verified synthetic patch and reports applied", () => {
  const fixture = makeFixture();
  try {
    const result = invoke(fixture);
    assert.equal(result.status, "applied");
    assert.deepEqual(
      Object.keys(result).sort(),
      ["status"],
      "the mechanism must return only a closed status"
    );

    const tree = readTree(fixture.packageRoot);
    assert.equal(tree["dist/a.js"], A_AFTER);
    assert.equal(tree["dist/b.js"], B_AFTER);
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 reports already_applied and is idempotent", () => {
  const fixture = makeFixture();
  try {
    assert.equal(invoke(fixture).status, "applied");
    const second = invoke(fixture);
    assert.equal(second.status, "already_applied");
    const third = invoke(fixture);
    assert.equal(third.status, "already_applied");

    const tree = readTree(fixture.packageRoot);
    assert.equal(tree["dist/a.js"], A_AFTER);
    assert.equal(tree["dist/b.js"], B_AFTER);
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }

  const preApplied = makeFixture({ applied: true });
  try {
    assert.equal(invoke(preApplied).status, "already_applied");
  } finally {
    cleanup(preApplied);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a changed pre-hash and leaves the tree untouched", () => {
  const fixture = makeFixture();
  try {
    writeFileSync(
      path.join(fixture.packageRoot, "dist", "a.js"),
      "const a = 999;\n",
      "utf8"
    );
    const before = readTree(fixture.packageRoot);
    assert.throws(() => invoke(fixture));
    assert.deepEqual(readTree(fixture.packageRoot), before);
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a patch whose digest does not match the manifest", () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.patchPath, `${PATCH_TEXT}\n# tampered\n`, "utf8");
    const before = readTree(fixture.packageRoot);
    assert.throws(() => invoke(fixture));
    assert.deepEqual(readTree(fixture.packageRoot), before);
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects path traversal and absolute manifest paths", () => {
  for (const badPath of [
    "../escape.js",
    "dist/../../escape.js",
    "/etc/passwd",
    "dist/./a.js",
    "dist\\a.js",
    ""
  ]) {
    const fixture = makeFixture({
      fileOverrides: [
        {
          path: badPath,
          sha256_before: sha256(A_BEFORE),
          sha256_after: sha256(A_AFTER)
        }
      ]
    });
    try {
      const before = readTree(fixture.packageRoot);
      assert.throws(() => invoke(fixture), `must reject path ${badPath}`);
      assert.deepEqual(readTree(fixture.packageRoot), before);
      assertNoDisposableSiblings(fixture);
    } finally {
      cleanup(fixture);
    }
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects duplicate manifest file entries", () => {
  const fixture = makeFixture({
    fileOverrides: [
      {
        path: "dist/a.js",
        sha256_before: sha256(A_BEFORE),
        sha256_after: sha256(A_AFTER)
      },
      {
        path: "dist/a.js",
        sha256_before: sha256(A_BEFORE),
        sha256_after: sha256(A_AFTER)
      }
    ]
  });
  try {
    assert.throws(() => invoke(fixture));
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a symlinked package root or patched file", () => {
  const linkRootFixture = makeFixture();
  try {
    const linked = path.join(linkRootFixture.root, "linked-package");
    symlinkSync(linkRootFixture.packageRoot, linked, "dir");
    assert.throws(() =>
      applyVerifiedPatch()({
        packageRoot: linked,
        manifestPath: linkRootFixture.manifestPath,
        patchPath: linkRootFixture.patchPath
      })
    );
  } finally {
    cleanup(linkRootFixture);
  }

  const linkFileFixture = makeFixture();
  try {
    const target = path.join(linkFileFixture.root, "outside-a.js");
    writeFileSync(target, A_BEFORE, "utf8");
    const inside = path.join(linkFileFixture.packageRoot, "dist", "a.js");
    rmSync(inside);
    symlinkSync(target, inside, "file");
    assert.equal(lstatSync(inside).isSymbolicLink(), true);
    assert.throws(() => invoke(linkFileFixture));
    assert.equal(readFileSync(target, "utf8"), A_BEFORE);
  } finally {
    cleanup(linkFileFixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a patch targeting a file absent from the manifest", () => {
  const extraPatch = [
    PATCH_TEXT.trimEnd(),
    "diff --git a/dist/c.js b/dist/c.js",
    "--- a/dist/c.js",
    "+++ b/dist/c.js",
    "@@ -1 +1,2 @@",
    " const c = 0;",
    "+const extra = true;",
    ""
  ].join("\n");

  const fixture = makeFixture({ patchText: extraPatch });
  try {
    writeFileSync(
      path.join(fixture.packageRoot, "dist", "c.js"),
      "const c = 0;\n",
      "utf8"
    );
    const before = readTree(fixture.packageRoot);
    assert.throws(() => invoke(fixture));
    assert.deepEqual(readTree(fixture.packageRoot), before);
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a manifest file the patch never touches", () => {
  const fixture = makeFixture({
    fileOverrides: [
      {
        path: "dist/a.js",
        sha256_before: sha256(A_BEFORE),
        sha256_after: sha256(A_AFTER)
      },
      {
        path: "dist/b.js",
        sha256_before: sha256(B_BEFORE),
        sha256_after: sha256(B_AFTER)
      },
      {
        path: "package.json",
        sha256_before: sha256(
          JSON.stringify({ name: "synthetic-fixture", version: "1.0.0" })
        ),
        sha256_after: sha256("{}")
      }
    ]
  });
  try {
    const before = readTree(fixture.packageRoot);
    assert.throws(() => invoke(fixture));
    assert.deepEqual(readTree(fixture.packageRoot), before);
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a mismatched post-hash without mutating the package", () => {
  const fixture = makeFixture({
    fileOverrides: [
      {
        path: "dist/a.js",
        sha256_before: sha256(A_BEFORE),
        sha256_after: sha256("wrong result\n")
      },
      {
        path: "dist/b.js",
        sha256_before: sha256(B_BEFORE),
        sha256_after: sha256(B_AFTER)
      }
    ]
  });
  try {
    const before = readTree(fixture.packageRoot);
    assert.throws(() => invoke(fixture));
    assert.deepEqual(readTree(fixture.packageRoot), before);
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a wrong patch-tool schema", () => {
  for (const overrides of [
    { patch_tool: "patch" },
    { patch_tool_version: "not-a-version" },
    { schema_version: "openclaw-security-patch-manifest.v2" },
    { extra_key: true }
  ]) {
    const fixture = makeFixture({ manifestOverrides: overrides });
    try {
      assert.throws(
        () => invoke(fixture),
        `must reject manifest override ${JSON.stringify(overrides)}`
      );
      assertNoDisposableSiblings(fixture);
    } finally {
      cleanup(fixture);
    }
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a manifest that is not valid UTF-8 JSON", () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.manifestPath, Buffer.from([0xff, 0xfe, 0x00, 0x7b]));
    assert.throws(() => invoke(fixture));
  } finally {
    cleanup(fixture);
  }

  const broken = makeFixture();
  try {
    writeFileSync(broken.manifestPath, "{ not json", "utf8");
    assert.throws(() => invoke(broken));
  } finally {
    cleanup(broken);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects a missing patched file and never leaves a partial tree", () => {
  const fixture = makeFixture();
  try {
    rmSync(path.join(fixture.packageRoot, "dist", "b.js"));
    const before = readTree(fixture.packageRoot);
    assert.throws(() => invoke(fixture));
    assert.deepEqual(readTree(fixture.packageRoot), before);
    assertNoDisposableSiblings(fixture);
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 enforces optional expected identity", () => {
  const fixture = makeFixture();
  try {
    const ok = invoke(fixture, {
      expectedIdentity: {
        package_name: "synthetic-fixture",
        package_version: "1.0.0",
        npm_integrity: `sha512-${"A".repeat(86)}==`,
        tarball_sha256: sha256("synthetic-tarball")
      }
    });
    assert.equal(ok.status, "applied");
  } finally {
    cleanup(fixture);
  }

  for (const identity of [
    {
      package_name: "openclaw",
      package_version: "1.0.0",
      npm_integrity: `sha512-${"A".repeat(86)}==`,
      tarball_sha256: sha256("synthetic-tarball")
    },
    {
      package_name: "synthetic-fixture",
      package_version: "2026.6.34",
      npm_integrity: `sha512-${"A".repeat(86)}==`,
      tarball_sha256: sha256("synthetic-tarball")
    },
    {
      package_name: "synthetic-fixture",
      package_version: "1.0.0",
      npm_integrity: `sha512-${"B".repeat(86)}==`,
      tarball_sha256: sha256("synthetic-tarball")
    },
    {
      package_name: "synthetic-fixture",
      package_version: "1.0.0",
      npm_integrity: `sha512-${"A".repeat(86)}==`,
      tarball_sha256: sha256("other-tarball")
    },
    { package_name: "synthetic-fixture", package_version: "1.0.0" }
  ]) {
    const drifted = makeFixture();
    try {
      const before = readTree(drifted.packageRoot);
      assert.throws(() => invoke(drifted, { expectedIdentity: identity }));
      assert.deepEqual(readTree(drifted.packageRoot), before);
    } finally {
      cleanup(drifted);
    }
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 rejects invalid call inputs", () => {
  const fixture = makeFixture();
  try {
    for (const bad of [
      null,
      undefined,
      "string",
      {},
      { packageRoot: fixture.packageRoot },
      {
        packageRoot: fixture.packageRoot,
        manifestPath: fixture.manifestPath,
        patchPath: fixture.patchPath,
        unexpected: true
      },
      {
        packageRoot: path.join(fixture.root, "missing"),
        manifestPath: fixture.manifestPath,
        patchPath: fixture.patchPath
      }
    ]) {
      assert.throws(
        () => applyVerifiedPatch()(bad),
        `must reject input ${JSON.stringify(bad)}`
      );
    }
  } finally {
    cleanup(fixture);
  }
});

test("REQ-SBX-GENERAL-004 P4-T1 contains no OpenClaw production identity", () => {
  const scriptPath = new URL(
    "../scripts/apply-general-security-patch.mjs",
    import.meta.url
  );
  const source = readFileSync(scriptPath, "utf8");
  const productionBoundary = source.indexOf(
    "export function applyOpenClawGeneralSecurityPatch"
  );
  assert.notEqual(
    productionBoundary,
    -1,
    "the production wrapper must follow the generic mechanism"
  );
  const genericSource = source.slice(0, productionBoundary);
  for (const marker of [
    "2026.6.34",
    "before_model_output_delivery",
    "before_tool_execution",
    "before_message_delivery",
    "d0edcbc937428ce1cb5729e444ea615651c9a8895807653ac2c4ed4e05122fa5"
  ]) {
    assert.equal(
      genericSource.includes(marker),
      false,
      `P4-T1 mechanism must stay generic and not contain ${marker}`
    );
  }
});
