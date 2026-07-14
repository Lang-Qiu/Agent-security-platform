import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "../../frontend/node_modules/typescript/lib/typescript.js";
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

const MASTER_C_RUNTIME = [
  "createSandboxSecurityEngine",
  "createSandboxSecurityCanonicalFingerprintService",
  "createSandboxSecurityMonitorDecisionAdapter",
  "createTrack1RuleMatchDetectorAdapter",
  "resolveSandboxSecurityProfile",
  "createSandboxSecurityDetectorRegistry"
] as const;

const MASTER_D_TYPES = [
  "SandboxSecurityEvaluationRequest",
  "SandboxSecurityAuthoritativeEvaluationContext",
  "AuthenticatedSourceObservation",
  "AuthenticatedToolObservation",
  "SandboxSecurityEngine",
  "SandboxSecurityRuntimePorts",
  "SandboxSecurityCanonicalFingerprintPort",
  "SandboxSecurityCanonicalFingerprintService",
  "SandboxSecurityDetectorRegistry",
  "SandboxSecurityDetectorRegistryInput",
  "RawLocalDetector",
  "SandboxSecuritySanitizer",
  "SanitizedExternalDetector",
  "SandboxSecurityRawDetectorSnapshot",
  "SandboxSecurityRiskCandidate",
  "SandboxSecurityCategoryClearance",
  "SandboxSecurityRawDetectorResult",
  "SandboxSecurityExternalDetectorResult",
  "SandboxSecurityExternalRiskCandidate",
  "SandboxSecurityExternalCategoryClearance",
  "SandboxSecuritySanitizedJudgePayload",
  "SandboxSecuritySanitizedJudgeObligation",
  "SandboxSecurityCandidateSubjectRef",
  "SandboxSecurityExternalCandidateSubjectRef",
  "SandboxSecurityPolicyProfileManifest",
  "SandboxSecurityDetectorSlotManifest",
  "SandboxSecurityDetectorSlotId",
  "SandboxSecurityTrustClass",
  "SandboxSecurityTrustRule",
  "SandboxSecurityActionByStage",
  "SandboxSecurityActionMatrix"
] as const;

const MASTER_A_TYPE_RUNTIME = [
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
  "SANDBOX_SECURITY_MAX_JSON_NODES"
] as const;

const MASTER_A_CONTRACT_RUNTIME = [
  "normalizeSandboxSecurityRequest",
  "normalizeSandboxSecurityFinding",
  "normalizeSandboxDetectorRun",
  "normalizeSandboxSecurityDecision"
] as const;

const MASTER_E_CONCRETE_IDENTIFIERS = [
  "normalizeSandboxSecurityEvaluationRequest",
  "NormalizedSandboxSecurityEvaluationRequest",
  "sandboxSecurityEvaluationRequestBrand",
  "prepareSandboxSecurityInput",
  "encodeSandboxSecurityCanonicalProjection",
  "SandboxSecurityPreparedInput",
  "SandboxSecurityAuthorityBoundContent",
  "SandboxSecurityNormalizedContent",
  "deriveSandboxSecurityTrustClass",
  "SandboxSecurityNormalizedToolRequest",
  "SandboxSecuritySourceHandle",
  "sandboxSecuritySourceHandleBrand",
  "SandboxSecurityCallHandle",
  "sandboxSecurityCallHandleBrand",
  "SandboxSecurityRawSubjectRegistry",
  "SandboxSecurityExternalTokenRegistry",
  "deriveSandboxSecurityExternalTokenRegistry",
  "validateSandboxSecuritySanitizedJudgePayload",
  "assertSanitizedJudgePayloadBounds",
  "normalizeSandboxSecurityRawDetectorResult",
  "normalizeSandboxSecurityExternalDetectorResult",
  "SandboxSecurityNormalizedSlotResult",
  "SandboxSecurityCanonicalPrivateSubjectScope",
  "canonicalizeSandboxSecurityPrivateSubjectScopes",
  "computeSandboxSecuritySubjectKey",
  "SandboxSecurityAcceptedRiskEvidence",
  "SandboxSecurityQualifiedSlotEvidence",
  "SandboxSecurityDraftFinding",
  "SandboxSecurityAcceptedSubjectEntity",
  "SandboxSecurityEscalationState",
  "SandboxSecurityEscalationLifecycle",
  "SandboxSecurityEvaluationEvidenceLedger",
  "SandboxSecuritySlotEvaluationRecord",
  "SandboxSecurityRoutedObligationRecord",
  "SandboxSecurityJudgeTerminationReason",
  "SandboxSecurityDecisionBearingEngineFailure",
  "SandboxSecurityDecisionBearingBudgetPhase",
  "SandboxSecurityAdapterUnsupportedError",
  "SandboxSecurityTerminalEngineErrorCode",
  "SandboxSecurityEngineFailureCode",
  "SandboxDetectorFailedRunErrorCode",
  "deriveSandboxSecurityExpectedPublication",
  "validateSandboxSecurityPublication",
  "validateSandboxSecurityDecisionSemantics",
  "SandboxSecurityEngineFailure",
  "SandboxSecurityEngineFailurePhase",
  "SandboxSecurityRunLedger",
  "createSandboxSecurityRunLedger",
  "SandboxSecurityRunLedgerLifecycle",
  "SandboxSecurityRunLedgerSlotSnapshot",
  "SandboxSecurityRunLedgerSnapshot",
  "SandboxSecurityNormalizedJudgeOutcome",
  "SandboxSecurityJudgeApplicationResult",
  "SandboxSecurityJudgeResolutionEvidence",
  "SandboxSecurityDeadlineController",
  "SandboxSecurityDetectorLease",
  "createSandboxSecurityDeadlineController",
  "resolveSandboxSecurityDetectorsForProfile",
  "SandboxSecurityResolvedDetectorRegistry",
  "materializeSandboxSecurityPublicSubjectTokens",
  "publishSandboxSecurityFindings",
  "SandboxSecurityPublicSubjectTokenMap"
] as const;

const FORBIDDEN_SHARED_ENGINE_EXPORTS = [
  ...MASTER_C_RUNTIME,
  ...MASTER_D_TYPES,
  ...MASTER_E_CONCRETE_IDENTIFIERS
] as const;

const REPRESENTATIVE_MASTER_E_PROBES = [
  "NormalizedSandboxSecurityEvaluationRequest",
  "SandboxSecurityPreparedInput",
  "SandboxSecurityEvaluationEvidenceLedger",
  "normalizeSandboxSecurityEvaluationRequest"
] as const;

const SANDBOX_SECURITY_TYPES_MODULE = "./types/sandbox-security.ts";
const SANDBOX_SECURITY_CONTRACTS_MODULE = "./contracts/sandbox-security.ts";

type ExportKind = "type" | "value";

type NamedExport = {
  exportedName: string;
  sourceName: string;
  kind: ExportKind;
  moduleSpecifier: string | null;
};

type ExportInventory = {
  named: NamedExport[];
  starModuleSpecifiers: string[];
  unsupported: string[];
};

type SandboxSecurityExportSources = {
  types: string;
  contracts: string;
  index: string;
};

type NamedImport = {
  importedName: string;
  kind: ExportKind;
  moduleSpecifier: string;
  specifierCount: number;
};

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true
  );
}

function enumerateDirectExports(fileName: string, source: string): ExportInventory {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const inventory: ExportInventory = {
    named: [],
    starModuleSpecifiers: [],
    unsupported: []
  };

  const addDeclaration = (name: string, kind: ExportKind) => {
    inventory.named.push({
      exportedName: name,
      sourceName: name,
      kind,
      moduleSpecifier: null
    });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      const moduleSpecifier = statement.moduleSpecifier;
      const moduleName =
        moduleSpecifier === undefined
          ? null
          : ts.isStringLiteral(moduleSpecifier)
            ? moduleSpecifier.text
            : null;

      if (moduleSpecifier !== undefined && moduleName === null) {
        inventory.unsupported.push("non-literal export module specifier");
      }

      if (statement.exportClause === undefined) {
        if (moduleName === null) {
          inventory.unsupported.push("export star without a literal module specifier");
        } else {
          inventory.starModuleSpecifiers.push(moduleName);
        }
        continue;
      }

      if (!ts.isNamedExports(statement.exportClause)) {
        if (moduleName !== null) {
          inventory.starModuleSpecifiers.push(moduleName);
        }
        inventory.unsupported.push("namespace export");
        continue;
      }

      for (const specifier of statement.exportClause.elements) {
        inventory.named.push({
          exportedName: specifier.name.text,
          sourceName: specifier.propertyName?.text ?? specifier.name.text,
          kind: statement.isTypeOnly || specifier.isTypeOnly ? "type" : "value",
          moduleSpecifier: moduleName
        });
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      inventory.unsupported.push("export assignment");
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      continue;
    }

    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      inventory.unsupported.push("default export");
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          inventory.unsupported.push("non-identifier exported variable binding");
          continue;
        }
        addDeclaration(declaration.name.text, "value");
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name === undefined) {
        inventory.unsupported.push("anonymous exported function");
      } else {
        addDeclaration(statement.name.text, "value");
      }
      continue;
    }

    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      addDeclaration(statement.name.text, "type");
      continue;
    }

    inventory.unsupported.push(`unsupported exported declaration kind ${statement.kind}`);
  }

  return inventory;
}

function enumerateNamedImports(fileName: string, source: string): NamedImport[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const imports: NamedImport[] = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.importClause === undefined ||
      statement.importClause.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    const specifiers = statement.importClause.namedBindings.elements;
    for (const specifier of specifiers) {
      imports.push({
        importedName: specifier.propertyName?.text ?? specifier.name.text,
        kind:
          statement.importClause.isTypeOnly || specifier.isTypeOnly
            ? "type"
            : "value",
        moduleSpecifier: statement.moduleSpecifier.text,
        specifierCount: specifiers.length
      });
    }
  }

  return imports;
}

function namesByKind(
  inventory: ExportInventory,
  kind: ExportKind,
  moduleSpecifier?: string
): string[] {
  return inventory.named
    .filter(
      (entry) =>
        entry.kind === kind &&
        (moduleSpecifier === undefined || entry.moduleSpecifier === moduleSpecifier)
    )
    .map((entry) => entry.exportedName);
}

function sortedNames(names: readonly string[]): string[] {
  return [...names].sort((left, right) => left.localeCompare(right));
}

function recordExactNames(
  violations: string[],
  label: string,
  actual: readonly string[],
  expected: readonly string[]
): void {
  const sortedActual = sortedNames(actual);
  const sortedExpected = sortedNames(expected);
  const matches =
    sortedActual.length === sortedExpected.length &&
    sortedActual.every((name, index) => name === sortedExpected[index]);

  if (!matches) {
    violations.push(
      `${label}: expected [${sortedExpected.join(", ")}], got [${sortedActual.join(", ")}]`
    );
  }
}

function evaluateSandboxSecurityExportGate(
  sources: SandboxSecurityExportSources
): string[] {
  const violations: string[] = [];
  const typesInventory = enumerateDirectExports(
    "shared/types/sandbox-security.ts",
    sources.types
  );
  const contractsInventory = enumerateDirectExports(
    "shared/contracts/sandbox-security.ts",
    sources.contracts
  );
  const indexInventory = enumerateDirectExports("shared/index.ts", sources.index);

  recordExactNames(
    violations,
    "sandbox security type-module values",
    namesByKind(typesInventory, "value"),
    MASTER_A_TYPE_RUNTIME
  );
  recordExactNames(
    violations,
    "sandbox security type-module types",
    namesByKind(typesInventory, "type"),
    MASTER_B_TYPES
  );
  recordExactNames(
    violations,
    "sandbox security contract-module values",
    namesByKind(contractsInventory, "value"),
    MASTER_A_CONTRACT_RUNTIME
  );
  recordExactNames(
    violations,
    "sandbox security contract-module types",
    namesByKind(contractsInventory, "type"),
    []
  );
  recordExactNames(
    violations,
    "shared index sandbox security type-module values",
    namesByKind(indexInventory, "value", SANDBOX_SECURITY_TYPES_MODULE),
    MASTER_A_TYPE_RUNTIME
  );
  recordExactNames(
    violations,
    "shared index sandbox security type-module types",
    namesByKind(indexInventory, "type", SANDBOX_SECURITY_TYPES_MODULE),
    MASTER_B_TYPES
  );
  recordExactNames(
    violations,
    "shared index sandbox security contract-module values",
    namesByKind(indexInventory, "value", SANDBOX_SECURITY_CONTRACTS_MODULE),
    MASTER_A_CONTRACT_RUNTIME
  );
  recordExactNames(
    violations,
    "shared index sandbox security contract-module types",
    namesByKind(indexInventory, "type", SANDBOX_SECURITY_CONTRACTS_MODULE),
    []
  );

  if (typesInventory.starModuleSpecifiers.length > 0) {
    violations.push("sandbox security type module must not use export star");
  }
  if (contractsInventory.starModuleSpecifiers.length > 0) {
    violations.push("sandbox security contract module must not use export star");
  }
  if (typesInventory.unsupported.length > 0) {
    violations.push(
      `sandbox security type module has unsupported exports: ${typesInventory.unsupported.join(", ")}`
    );
  }
  if (contractsInventory.unsupported.length > 0) {
    violations.push(
      `sandbox security contract module has unsupported exports: ${contractsInventory.unsupported.join(", ")}`
    );
  }

  const sandboxIndexRows = indexInventory.named.filter(
    (entry) =>
      entry.moduleSpecifier === SANDBOX_SECURITY_TYPES_MODULE ||
      entry.moduleSpecifier === SANDBOX_SECURITY_CONTRACTS_MODULE
  );
  const aliasedRows = sandboxIndexRows.filter(
    (entry) => entry.exportedName !== entry.sourceName
  );
  if (aliasedRows.length > 0) {
    violations.push("shared index must not alias sandbox security exports");
  }
  if (
    indexInventory.starModuleSpecifiers.includes(SANDBOX_SECURITY_TYPES_MODULE) ||
    indexInventory.starModuleSpecifiers.includes(SANDBOX_SECURITY_CONTRACTS_MODULE)
  ) {
    violations.push("shared index must not export star from sandbox security modules");
  }

  const indexNamedExports = new Set(
    indexInventory.named.map((entry) => entry.exportedName)
  );
  for (const identifier of FORBIDDEN_SHARED_ENGINE_EXPORTS) {
    if (indexNamedExports.has(identifier)) {
      violations.push(`shared index exports engine-only identifier ${identifier}`);
    }
  }

  return violations;
}

function collectSharedPackageExportNames(): Set<string> {
  const indexPath = join(REPO_ROOT, "shared/index.ts");
  const program = ts.createProgram({
    rootNames: [indexPath],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      allowImportingTsExtensions: true,
      skipLibCheck: true,
      types: []
    }
  });
  const sourceFile = program.getSourceFile(indexPath);
  assert.ok(sourceFile, "TypeScript program must load shared/index.ts");
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  assert.ok(moduleSymbol, "TypeScript checker must resolve shared/index.ts");

  return new Set(
    checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.getName())
  );
}


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

  const sharedPublicExports = collectSharedPackageExportNames();
  for (const identifier of FORBIDDEN_SHARED_ENGINE_EXPORTS) {
    assert.equal(
      sharedPublicExports.has(identifier),
      false,
      `shared package must not export engine-only identifier ${identifier}`
    );
  }
});

test("REQ-SBX-GENERAL-001 export gate rejects additional sandbox security exports", () => {
  const sources: SandboxSecurityExportSources = {
    types: readText("shared/types/sandbox-security.ts"),
    contracts: readText("shared/contracts/sandbox-security.ts"),
    index: readText("shared/index.ts")
  };
  const mutations: SandboxSecurityExportSources[] = [
    {
      ...sources,
      types: `${sources.types}\nexport const SandboxSecurityUnexpectedRuntime = true;\n`
    },
    {
      ...sources,
      types: `${sources.types}\nexport type SandboxSecurityUnexpectedType = string;\n`
    },
    {
      ...sources,
      contracts: `${sources.contracts}\nexport function normalizeUnexpectedSandboxSecurityContract(value: unknown) { return value; }\n`
    },
    {
      ...sources,
      index: `${sources.index}\nexport { SandboxSecurityUnexpectedRuntime } from "./types/sandbox-security.ts";\n`
    },
    {
      ...sources,
      index: `${sources.index}\nexport { createSandboxSecurityCanonicalFingerprintService } from "./types/sandbox.ts";\n`
    }
  ];

  const baselineViolations = evaluateSandboxSecurityExportGate(sources);
  assert.deepEqual(
    baselineViolations,
    [],
    `current sandbox security exports must satisfy the exact gate:\n${baselineViolations.join("\n")}`
  );
  assert.deepEqual(
    mutations.map(
      (mutation) => evaluateSandboxSecurityExportGate(mutation).length === 0
    ),
    [false, false, false, false, false]
  );
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
  const imports = enumerateNamedImports(
    "shared/tests/types/sandbox-security-public-types.ts",
    probe
  );
  const masterBTypeNames = new Set<string>(MASTER_B_TYPES);
  const publicTypeImports = imports.filter((entry) =>
    masterBTypeNames.has(entry.importedName)
  );
  assert.deepEqual(
    sortedNames(publicTypeImports.map((entry) => entry.importedName)),
    sortedNames(MASTER_B_TYPES),
    "public type probes must import every Master B type"
  );
  for (const entry of publicTypeImports) {
    assert.equal(entry.moduleSpecifier, "../../index.ts");
    assert.equal(entry.kind, "type");
  }
  for (const identifier of REPRESENTATIVE_MASTER_E_PROBES) {
    const negativeImports = imports.filter(
      (entry) => entry.importedName === identifier
    );
    assert.equal(
      negativeImports.length,
      1,
      `public type probes must contain one negative import for ${identifier}`
    );
    assert.equal(negativeImports[0]?.moduleSpecifier, "../../index.ts");
    assert.equal(
      negativeImports[0]?.specifierCount,
      1,
      `negative import for ${identifier} must contain a single symbol`
    );
  }
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
  const indexInventory = enumerateDirectExports(
    "shared/index.ts",
    readText("shared/index.ts")
  );
  assert.equal(
    indexInventory.named.some(
      (entry) =>
        entry.exportedName === "SandboxSecurityReasonCode" &&
        entry.kind === "type" &&
        entry.moduleSpecifier === SANDBOX_SECURITY_TYPES_MODULE
    ),
    true
  );
});

test("REQ-SBX-GENERAL-001 shared package exports all Master A runtime symbols", () => {
  for (const symbolName of MASTER_A_RUNTIME) {
    assert.equal(
      typeof Reflect.get(sharedPackage, symbolName) !== "undefined",
      true,
      `missing runtime export ${symbolName}`
    );
  }

  const typesInventory = enumerateDirectExports(
    "shared/types/sandbox-security.ts",
    readText("shared/types/sandbox-security.ts")
  );
  const contractsInventory = enumerateDirectExports(
    "shared/contracts/sandbox-security.ts",
    readText("shared/contracts/sandbox-security.ts")
  );
  assert.deepEqual(
    sortedNames(namesByKind(typesInventory, "value")),
    sortedNames(MASTER_A_TYPE_RUNTIME)
  );
  assert.deepEqual(
    sortedNames(namesByKind(contractsInventory, "value")),
    sortedNames(MASTER_A_CONTRACT_RUNTIME)
  );
});

test("REQ-SBX-GENERAL-001 shared package exports all Master B type symbols", () => {
  const typesInventory = enumerateDirectExports(
    "shared/types/sandbox-security.ts",
    readText("shared/types/sandbox-security.ts")
  );
  const indexInventory = enumerateDirectExports(
    "shared/index.ts",
    readText("shared/index.ts")
  );
  assert.deepEqual(
    sortedNames(namesByKind(typesInventory, "type")),
    sortedNames(MASTER_B_TYPES)
  );
  assert.deepEqual(
    sortedNames(
      namesByKind(indexInventory, "type", SANDBOX_SECURITY_TYPES_MODULE)
    ),
    sortedNames(MASTER_B_TYPES)
  );
});
