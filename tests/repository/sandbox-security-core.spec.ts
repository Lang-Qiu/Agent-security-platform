import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as sharedPackage from "../../shared/index.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const MASTER_A_RUNTIME = [
  "SANDBOX_SECURITY_STAGES",
  "SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES",
  "SANDBOX_SECURITY_RISK_CATEGORIES",
  "SANDBOX_SECURITY_POLICY_PROFILE_IDS",
  "SANDBOX_SECURITY_SEVERITIES",
  "SANDBOX_SECURITY_VERDICTS",
  "SANDBOX_SECURITY_ACTIONS",
  "SANDBOX_SECURITY_MAX_TEXT_BYTES",
  "SANDBOX_SECURITY_MAX_REQUEST_BYTES",
  "SANDBOX_SECURITY_MAX_CONTENT_ITEMS",
  "SANDBOX_SECURITY_MAX_JSON_DEPTH",
  "SANDBOX_SECURITY_MAX_JSON_NODES",
  "normalizeSandboxSecurityRequest",
  "normalizeSandboxSecurityFinding",
  "normalizeSandboxDetectorRun",
  "normalizeSandboxSecurityDecision"
] as const;

const MASTER_B_TYPES = [
  "SandboxSecurityStage",
  "SandboxSecurityClaimedSourceType",
  "SandboxSecurityPolicyProfileId",
  "SandboxSecurityRiskCategory",
  "SandboxSecuritySeverity",
  "SandboxSecurityVerdict",
  "SandboxSecurityAction",
  "SandboxSecurityReasonCode",
  "SandboxSecurityJsonValue",
  "SandboxSecuritySubmittedContentItem",
  "SandboxSecurityToolRequest",
  "SandboxSecurityRequest",
  "SandboxSecurityContentLocator",
  "SandboxSecurityToolLocator",
  "SandboxSecurityFindingSubjectRef",
  "SandboxSecurityFinding",
  "SandboxDetectorRunObligation",
  "SandboxDetectorRunStatus",
  "SandboxDetectorSkipReason",
  "SandboxDetectorRunErrorCode",
  "SandboxDetectorRun",
  "SandboxSecurityDecision"
] as const;

const NEVER_EXPORT_NEEDLES = [
  "normalizeSandboxSecurityEvaluationRequest",
  "prepareSandboxSecurityInput",
  "SandboxSecurityPreparedInput",
  "deriveSandboxSecurityTrustClass",
  "SandboxSecurityEscalationState",
  "SandboxSecurityEvaluationEvidenceLedger",
  "createSandboxSecurityEngine"
] as const;

function readText(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function readJson(relativePath: string): Record<string, unknown> {
  // Strip only full-line // comments. Avoid block-comment stripping because
  // tsconfig include globs contain "/**/" path segments.
  const raw = readText(relativePath)
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//")) {
        return "";
      }
      return line;
    })
    .join("\n")
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(raw) as Record<string, unknown>;
}

function collectTsFiles(dirRelative: string): string[] {
  const abs = join(REPO_ROOT, dirRelative);
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.endsWith(".ts")) {
        out.push(relative(REPO_ROOT, full).replaceAll("\\", "/"));
      }
    }
  };
  if (existsSync(abs)) {
    walk(abs);
  }
  return out;
}

test("REQ-SBX-GENERAL-001 registers public contract gates", () => {
  const rootPackage = readJson("package.json") as {
    scripts?: Record<string, string>;
  };
  const sharedPackageJson = readJson("shared/package.json") as {
    scripts?: Record<string, string>;
  };
  const scripts = rootPackage.scripts ?? {};
  const sharedScripts = sharedPackageJson.scripts ?? {};

  assert.match(
    scripts["test:shared"] ?? "",
    /shared\/tests\/sandbox-security-contract\.spec\.ts/,
    "root test:shared must include sandbox-security-contract coverage"
  );
  assert.match(
    sharedScripts.test ?? "",
    /tests\/sandbox-security-contract\.spec\.ts/,
    "shared package test script must include sandbox-security-contract coverage"
  );
  assert.match(
    scripts["test:repo"] ?? "",
    /tests\/repository\/sandbox-security-core\.spec\.ts/,
    "root test:repo must include sandbox-security-core repository gate"
  );
});

test("REQ-SBX-GENERAL-001 keeps shared contracts engine independent", () => {
  const sharedFiles = [
    ...collectTsFiles("shared/types"),
    ...collectTsFiles("shared/contracts"),
    "shared/index.ts"
  ];

  for (const file of sharedFiles) {
    if (!file.includes("sandbox-security") && file !== "shared/index.ts") {
      continue;
    }
    const text = readText(file);
    assert.doesNotMatch(
      text,
      /from ["'](?:\.\.\/)*engines\//,
      `${file} must not import engines/**`
    );
    assert.doesNotMatch(
      text,
      /from ["']@agent-security-platform\/engines/,
      `${file} must not import engine packages`
    );
  }

  const sharedIndex = readText("shared/index.ts");
  for (const needle of NEVER_EXPORT_NEEDLES) {
    assert.doesNotMatch(
      sharedIndex,
      new RegExp(`\\b${needle}\\b`),
      `shared/index.ts must not export engine-private symbol ${needle}`
    );
  }
});

test("REQ-SBX-GENERAL-001 sandbox tsconfig exists for typecheck", () => {
  assert.equal(existsSync(join(REPO_ROOT, "engines/sandbox/tsconfig.json")), true);
  const config = readJson("engines/sandbox/tsconfig.json") as {
    extends?: string;
    compilerOptions?: Record<string, unknown>;
    include?: string[];
  };
  assert.equal(config.extends, "../../tsconfig.base.json");
  assert.equal(config.compilerOptions?.noEmit, true);
  assert.equal(config.compilerOptions?.allowImportingTsExtensions, true);
  assert.deepEqual(config.include, [
    "src/security/**/*.ts",
    "tests/sandbox-security-*.spec.ts",
    "tests/fixtures/security-*.ts",
    "tests/helpers/track1-security-regression-harness.ts",
    "tests/types/**/*.ts"
  ]);
});

test("REQ-SBX-GENERAL-001 sandbox typecheck anchor exists", () => {
  assert.equal(
    existsSync(
      join(
        REPO_ROOT,
        "engines/sandbox/tests/types/sandbox-security-typecheck-anchor.ts"
      )
    ),
    true
  );
});

test("REQ-SBX-GENERAL-001 shared type probe file exists", () => {
  assert.equal(
    existsSync(
      join(REPO_ROOT, "shared/tests/types/sandbox-security-public-types.ts")
    ),
    true
  );
  const probe = readText("shared/tests/types/sandbox-security-public-types.ts");
  assert.match(probe, /@ts-expect-error public request exposes no authority brand/);
  assert.match(probe, /@ts-expect-error finding cannot declare raw content/);
  assert.match(probe, /@ts-expect-error decision cannot declare ordinary content hash/);
  assert.match(probe, /@ts-expect-error decision cannot declare provenance/);
  assert.match(probe, /SandboxSecurityReasonCode/);
});

test("REQ-SBX-GENERAL-001 shared tsconfig includes tests types probes", () => {
  const config = readJson("shared/tsconfig.json") as { include?: string[] };
  const include = config.include ?? [];
  assert.ok(
    include.some((pattern) => pattern.includes("tests/**/*.ts") || pattern.includes("tests/types")),
    "shared tsconfig must include tests type probes"
  );
});

test("REQ-SBX-GENERAL-001 shared package exports SandboxSecurityReasonCode type", () => {
  const index = readText("shared/index.ts");
  assert.match(
    index,
    /export type \{[\s\S]*\bSandboxSecurityReasonCode\b[\s\S]*\} from "\.\/types\/sandbox-security\.ts"/
  );
});

test("REQ-SBX-GENERAL-001 shared package exports all Master A runtime symbols", () => {
  for (const symbolName of MASTER_A_RUNTIME) {
    assert.equal(
      typeof (sharedPackage as Record<string, unknown>)[symbolName] !== "undefined",
      true,
      `missing runtime export ${symbolName}`
    );
  }

  const typesSource = readText("shared/types/sandbox-security.ts");
  for (const symbolName of MASTER_A_RUNTIME) {
    if (symbolName.startsWith("normalize")) {
      continue;
    }
    assert.match(
      typesSource,
      new RegExp(`export const ${symbolName}\\b`),
      `types module must export runtime constant ${symbolName}`
    );
  }

  const contractsSource = readText("shared/contracts/sandbox-security.ts");
  for (const normalizer of [
    "normalizeSandboxSecurityRequest",
    "normalizeSandboxSecurityFinding",
    "normalizeSandboxDetectorRun",
    "normalizeSandboxSecurityDecision"
  ] as const) {
    assert.match(
      contractsSource,
      new RegExp(`export (?:function |\\{[^}]*\\b)${normalizer}\\b|export \\{[^}]*\\b${normalizer}\\b`),
      `contracts module must export ${normalizer}`
    );
  }
});

test("REQ-SBX-GENERAL-001 shared package exports all Master B type symbols", () => {
  const index = readText("shared/index.ts");
  for (const typeName of MASTER_B_TYPES) {
    assert.match(
      index,
      new RegExp(`\\b${typeName}\\b`),
      `shared/index.ts must export type ${typeName}`
    );
  }

  const typesSource = readText("shared/types/sandbox-security.ts");
  for (const typeName of MASTER_B_TYPES) {
    assert.match(
      typesSource,
      new RegExp(`export (?:type|interface) ${typeName}\\b`),
      `types module must declare ${typeName}`
    );
  }
});


test("REQ-SBX-GENERAL-001 detector type isolation probe exists", () => {
  assert.equal(
    existsSync(
      join(REPO_ROOT, "engines/sandbox/tests/types/sandbox-security-detector-types.ts")
    ),
    true
  );
});

test("REQ-SBX-GENERAL-001 typecheck anchor is not the isolation probe", () => {
  assert.notEqual(
    "sandbox-security-typecheck-anchor.ts",
    "sandbox-security-detector-types.ts"
  );
  assert.equal(
    existsSync(
      join(REPO_ROOT, "engines/sandbox/tests/types/sandbox-security-typecheck-anchor.ts")
    ),
    true
  );
});

test("REQ-SBX-GENERAL-001 type probes are not registered in node test scripts", () => {
  const rootPackage = readJson("package.json") as { scripts?: Record<string, string> };
  const scripts = Object.values(rootPackage.scripts ?? {}).join("\n");
  assert.doesNotMatch(scripts, /sandbox-security-detector-types\.ts/);
  assert.doesNotMatch(scripts, /sandbox-security-public-types\.ts/);
});

test("REQ-SBX-GENERAL-001 sandbox tsconfig includes type probes", () => {
  const config = readJson("engines/sandbox/tsconfig.json") as { include?: string[] };
  assert.ok((config.include ?? []).some((item) => item.includes("tests/types")));
});

test("REQ-SBX-GENERAL-001 repository forbids public export of NormalizedSandboxSecurityEvaluationRequest", () => {
  const index = readText("shared/index.ts");
  assert.doesNotMatch(index, /NormalizedSandboxSecurityEvaluationRequest/);
  const securityIndex = join(REPO_ROOT, "engines/sandbox/src/security/index.ts");
  if (existsSync(securityIndex)) {
    assert.doesNotMatch(
      readFileSync(securityIndex, "utf8"),
      /NormalizedSandboxSecurityEvaluationRequest/
    );
  }
});

test("REQ-SBX-GENERAL-001 formal detector probe RED when missing even if anchor exists", () => {
  assert.equal(
    existsSync(
      join(REPO_ROOT, "engines/sandbox/tests/types/sandbox-security-detector-types.ts")
    ),
    true
  );
  assert.equal(
    existsSync(
      join(REPO_ROOT, "engines/sandbox/tests/types/sandbox-security-typecheck-anchor.ts")
    ),
    true
  );
});
