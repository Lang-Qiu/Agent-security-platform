import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "../../frontend/node_modules/typescript/lib/typescript.js";
import * as sharedPackage from "../../shared/index.ts";
import { analyzeSandboxSecurityExportProvenance } from "./helpers/sandbox-security-export-provenance.ts";

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

const SANDBOX_SECURITY_TYPES_PATH = resolve(
  REPO_ROOT,
  "shared/types/sandbox-security.ts"
);
const SANDBOX_SECURITY_CONTRACTS_PATH = resolve(
  REPO_ROOT,
  "shared/contracts/sandbox-security.ts"
);
const ENGINES_PATH = resolve(REPO_ROOT, "engines");

type ExportKind = "type" | "value";

type ModuleReference = {
  moduleSpecifier: string;
  resolvedPath: string | null;
};

type NamedExport = {
  exportedName: string;
  sourceName: string;
  kind: ExportKind;
  moduleSpecifier: string | null;
  resolvedModulePath: string | null;
};

type ExportInventory = {
  named: NamedExport[];
  starModules: ModuleReference[];
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

type VirtualExportFixture = {
  name: string;
  fixturePath: string;
  sources: SandboxSecurityExportSources;
  overlay: Map<string, string>;
};

function analyzeSharedExportProvenance(
  overlay: ReadonlyMap<string, string> = new Map()
) {
  return analyzeSandboxSecurityExportProvenance({
    repositoryRoot: REPO_ROOT,
    overlay,
    canonicalTypeExportNames: new Set<string>(MASTER_B_TYPES),
    canonicalValueExportNames: new Set<string>(MASTER_A_RUNTIME)
  });
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) === true
  );
}

function resolveModuleSpecifierPath(
  fileName: string,
  moduleSpecifier: string
): string | null {
  if (!moduleSpecifier.startsWith(".")) {
    return null;
  }

  return resolve(dirname(resolve(REPO_ROOT, fileName)), moduleSpecifier);
}

function moduleReference(
  fileName: string,
  moduleSpecifier: string
): ModuleReference {
  return {
    moduleSpecifier,
    resolvedPath: resolveModuleSpecifierPath(fileName, moduleSpecifier)
  };
}

function isEngineSourcePath(sourcePath: string): boolean {
  return (
    sourcePath === ENGINES_PATH || sourcePath.startsWith(`${ENGINES_PATH}${sep}`)
  );
}

function isEngineModule(reference: ModuleReference): boolean {
  return (
    (reference.resolvedPath !== null &&
      isEngineSourcePath(reference.resolvedPath)) ||
    /^@agent-security-platform\/engines(?:\/|$)/.test(reference.moduleSpecifier)
  );
}

function isCanonicalSandboxModule(reference: ModuleReference): boolean {
  return (
    reference.resolvedPath === SANDBOX_SECURITY_TYPES_PATH ||
    reference.resolvedPath === SANDBOX_SECURITY_CONTRACTS_PATH
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
    starModules: [],
    unsupported: []
  };

  const addDeclaration = (name: string, kind: ExportKind) => {
    inventory.named.push({
      exportedName: name,
      sourceName: name,
      kind,
      moduleSpecifier: null,
      resolvedModulePath: null
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
      const reference =
        moduleName === null ? null : moduleReference(fileName, moduleName);

      if (moduleSpecifier !== undefined && moduleName === null) {
        inventory.unsupported.push("non-literal export module specifier");
      }

      if (statement.exportClause === undefined) {
        if (moduleName === null) {
          inventory.unsupported.push("export star without a literal module specifier");
        } else {
          inventory.starModules.push(moduleReference(fileName, moduleName));
        }
        continue;
      }

      if (!ts.isNamedExports(statement.exportClause)) {
        if (reference !== null) {
          inventory.starModules.push(reference);
        }
        inventory.unsupported.push("namespace export");
        continue;
      }

      for (const specifier of statement.exportClause.elements) {
        inventory.named.push({
          exportedName: specifier.name.text,
          sourceName: specifier.propertyName?.text ?? specifier.name.text,
          kind: statement.isTypeOnly || specifier.isTypeOnly ? "type" : "value",
          moduleSpecifier: moduleName,
          resolvedModulePath: reference?.resolvedPath ?? null
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

function enumerateImportModules(fileName: string, source: string): ModuleReference[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const imports: ModuleReference[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      imports.push(moduleReference(fileName, statement.moduleSpecifier.text));
    }
  }

  return imports;
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
  resolvedModulePath?: string
): string[] {
  return inventory.named
    .filter(
      (entry) =>
        entry.kind === kind &&
        (resolvedModulePath === undefined ||
          entry.resolvedModulePath === resolvedModulePath)
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
  const indexImports = enumerateImportModules("shared/index.ts", sources.index);

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
    namesByKind(indexInventory, "value", SANDBOX_SECURITY_TYPES_PATH),
    MASTER_A_TYPE_RUNTIME
  );
  recordExactNames(
    violations,
    "shared index sandbox security type-module types",
    namesByKind(indexInventory, "type", SANDBOX_SECURITY_TYPES_PATH),
    MASTER_B_TYPES
  );
  recordExactNames(
    violations,
    "shared index sandbox security contract-module values",
    namesByKind(indexInventory, "value", SANDBOX_SECURITY_CONTRACTS_PATH),
    MASTER_A_CONTRACT_RUNTIME
  );
  recordExactNames(
    violations,
    "shared index sandbox security contract-module types",
    namesByKind(indexInventory, "type", SANDBOX_SECURITY_CONTRACTS_PATH),
    []
  );

  if (typesInventory.starModules.length > 0) {
    violations.push("sandbox security type module must not use export star");
  }
  if (contractsInventory.starModules.length > 0) {
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
      entry.resolvedModulePath === SANDBOX_SECURITY_TYPES_PATH ||
      entry.resolvedModulePath === SANDBOX_SECURITY_CONTRACTS_PATH
  );
  const aliasedRows = sandboxIndexRows.filter(
    (entry) => entry.exportedName !== entry.sourceName
  );
  if (aliasedRows.length > 0) {
    violations.push("shared index must not alias sandbox security exports");
  }
  if (
    indexInventory.starModules.some(isCanonicalSandboxModule)
  ) {
    violations.push("shared index must not export star from sandbox security modules");
  }

  if (indexImports.some(isCanonicalSandboxModule)) {
    violations.push(
      "shared index must directly re-export sandbox security types and contracts"
    );
  }

  const indexReexportModules = [...indexInventory.starModules];
  for (const entry of indexInventory.named) {
    if (entry.moduleSpecifier !== null) {
      indexReexportModules.push({
        moduleSpecifier: entry.moduleSpecifier,
        resolvedPath: entry.resolvedModulePath
      });
    }
  }
  if (
    indexImports.some(isEngineModule) ||
    indexReexportModules.some(isEngineModule)
  ) {
    violations.push("shared index must not import or re-export engines/**");
  }

  const forbiddenSharedNames = new Set<string>(FORBIDDEN_SHARED_ENGINE_EXPORTS);
  for (const entry of indexInventory.named) {
    for (const identifier of new Set([entry.sourceName, entry.exportedName])) {
      if (forbiddenSharedNames.has(identifier)) {
        violations.push(`shared index exports engine-only identifier ${identifier}`);
      }
    }
  }

  return violations;
}

function createVirtualExportFixture(
  name: string,
  sharedFileName: string,
  sharedSource: string,
  indexExport: string,
  additionalOverlay: ReadonlyMap<string, string> = new Map()
): VirtualExportFixture {
  const sources: SandboxSecurityExportSources = {
    types: readText("shared/types/sandbox-security.ts"),
    contracts: readText("shared/contracts/sandbox-security.ts"),
    index: `${readText("shared/index.ts")}\n${indexExport}\n`
  };
  const overlay = new Map<string, string>(additionalOverlay);
  overlay.set(resolve(REPO_ROOT, "shared/index.ts"), sources.index);
  const fixturePath = resolve(REPO_ROOT, "shared", sharedFileName);
  overlay.set(fixturePath, sharedSource);

  return { name, fixturePath, sources, overlay };
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

const VIRTUAL_ENGINE_FIXTURE_PATH = resolve(
  REPO_ROOT,
  "engines/sandbox/src/base-filter/export-provenance-fixture.ts"
);
const VIRTUAL_ENGINE_FIXTURE_SOURCE = `
export interface SandboxSecurityEvaluationRequest {
  readonly request_id: string;
}

export interface SandboxSecurityEngine {
  evaluate(): void;
}

export function createSandboxSecurityEngine(): SandboxSecurityEngine {
  return { evaluate() {} };
}

export type NormalizedSandboxSecurityEvaluationRequest =
  SandboxSecurityEvaluationRequest & { readonly normalized: true };

export const EngineProbe = "engine-probe";
`;
const VIRTUAL_ENGINE_OVERLAY = new Map<string, string>([
  [VIRTUAL_ENGINE_FIXTURE_PATH, VIRTUAL_ENGINE_FIXTURE_SOURCE]
]);
const VIRTUAL_IMPORT_EQUALS_OVERLAY = new Map<string, string>(
  VIRTUAL_ENGINE_OVERLAY
);
VIRTUAL_IMPORT_EQUALS_OVERLAY.set(
  resolve(REPO_ROOT, "shared/package.json"),
  '{"type":"commonjs"}\n'
);
VIRTUAL_IMPORT_EQUALS_OVERLAY.set(
  resolve(REPO_ROOT, "engines/sandbox/package.json"),
  '{"type":"commonjs"}\n'
);
const VIRTUAL_ENGINE_SPECIFIER =
  "../engines/sandbox/src/base-filter/export-provenance-fixture.ts";

const TRANSITIVE_EXPORT_FIXTURES = [
  createVirtualExportFixture(
    "Master D type relay renamed",
    "provenance-d-type-relay.ts",
    `
import type { SandboxSecurityEvaluationRequest } from "${VIRTUAL_ENGINE_SPECIFIER}";
export type HistoricalEvaluationRequest = SandboxSecurityEvaluationRequest;
`,
    'export type { HistoricalEvaluationRequest } from "./provenance-d-type-relay.ts";',
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "Master D interface heritage relay",
    "provenance-d-heritage-relay.ts",
    `
import type { SandboxSecurityEngine } from "${VIRTUAL_ENGINE_SPECIFIER}";
export interface HistoricalEngine { readonly local_marker: true; }
export interface HistoricalEngine extends SandboxSecurityEngine {}
`,
    'export type { HistoricalEngine } from "./provenance-d-heritage-relay.ts";',
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "Master C runtime alias and wrapper relay",
    "provenance-c-runtime-relay.ts",
    `
import { createSandboxSecurityEngine } from "${VIRTUAL_ENGINE_SPECIFIER}";
export const createHistoricalEngine = createSandboxSecurityEngine;
export function createHistoricalWrappedEngine() {
  return createSandboxSecurityEngine();
}
`,
    `export {
  createHistoricalEngine,
  createHistoricalWrappedEngine
} from "./provenance-c-runtime-relay.ts";`,
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "Master E type relay renamed",
    "provenance-e-type-relay.ts",
    `
import type { NormalizedSandboxSecurityEvaluationRequest } from "${VIRTUAL_ENGINE_SPECIFIER}";
export type HistoricalNormalizedRequest =
  NormalizedSandboxSecurityEvaluationRequest;
`,
    'export type { HistoricalNormalizedRequest } from "./provenance-e-type-relay.ts";',
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "canonical Master A runtime relay renamed",
    "provenance-canonical-runtime-relay.ts",
    `
import { SANDBOX_SECURITY_STAGES } from "./types/sandbox-security.ts";
export const HistoricalSecurityStages = SANDBOX_SECURITY_STAGES;
`,
    `export {
  HistoricalSecurityStages
} from "./provenance-canonical-runtime-relay.ts";`
  ),
  createVirtualExportFixture(
    "canonical Master B relay renamed",
    "provenance-canonical-renamed-relay.ts",
    `
import type { SandboxSecurityStage } from "./types/sandbox-security.ts";
export type HistoricalStage = SandboxSecurityStage;
`,
    'export type { HistoricalStage } from "./provenance-canonical-renamed-relay.ts";'
  ),
  createVirtualExportFixture(
    "canonical Master B same-name relay",
    "provenance-canonical-same-name-relay.ts",
    `
import type {
  SandboxSecurityStage as CanonicalSandboxSecurityStage
} from "./types/sandbox-security.ts";
export type SandboxSecurityStage = CanonicalSandboxSecurityStage;
`,
    `export type {
  SandboxSecurityStage as HistoricalSameNameStage
} from "./provenance-canonical-same-name-relay.ts";`
  ),
  createVirtualExportFixture(
    "normalized engine import path",
    "provenance-normalized-engine-import.ts",
    `
import type { EngineProbe } from "../engines/sandbox/src/base-filter/../base-filter/export-provenance-fixture.ts";
export const HistoricalNormalizedImportValue = 1;
`,
    `export {
  HistoricalNormalizedImportValue
} from "./provenance-normalized-engine-import.ts";`,
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "engine export star",
    "provenance-engine-export-star.ts",
    `export * from "${VIRTUAL_ENGINE_SPECIFIER}";`,
    `export {
  EngineProbe as HistoricalStarEngineProbe
} from "./provenance-engine-export-star.ts";`,
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "engine namespace export",
    "provenance-engine-namespace.ts",
    `export * as HistoricalEngineNamespace from "${VIRTUAL_ENGINE_SPECIFIER}";`,
    `export {
  HistoricalEngineNamespace
} from "./provenance-engine-namespace.ts";`,
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "engine ImportTypeNode reference",
    "provenance-engine-import-type.ts",
    `
export type HistoricalImportType =
  import("${VIRTUAL_ENGINE_SPECIFIER}").SandboxSecurityEvaluationRequest;
`,
    'export type { HistoricalImportType } from "./provenance-engine-import-type.ts";',
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "engine TypeQuery reference",
    "provenance-engine-type-query.ts",
    `
import { createSandboxSecurityEngine } from "${VIRTUAL_ENGINE_SPECIFIER}";
export type HistoricalEngineFactory = typeof createSandboxSecurityEngine;
`,
    'export type { HistoricalEngineFactory } from "./provenance-engine-type-query.ts";',
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "engine binding initializer reference",
    "provenance-engine-binding.ts",
    `
import { EngineProbe } from "${VIRTUAL_ENGINE_SPECIFIER}";
const { value: HistoricalBoundProbe } = { value: EngineProbe };
export { HistoricalBoundProbe };
`,
    'export { HistoricalBoundProbe } from "./provenance-engine-binding.ts";',
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "engine import-equals reference",
    "provenance-engine-import-equals.ts",
    `
import Engine = require("${VIRTUAL_ENGINE_SPECIFIER}");
export const HistoricalImportEqualsProbe = Engine.EngineProbe;
`,
    `export {
  HistoricalImportEqualsProbe
} from "./provenance-engine-import-equals.ts";`,
    VIRTUAL_IMPORT_EQUALS_OVERLAY
  ),
  createVirtualExportFixture(
    "literal engine require",
    "provenance-engine-require.ts",
    `
export function loadRequiredEngine() {
  return require("${VIRTUAL_ENGINE_SPECIFIER}");
}
`,
    'export { loadRequiredEngine } from "./provenance-engine-require.ts";',
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "parenthesized literal engine require",
    "provenance-engine-parenthesized-require.ts",
    `
export function loadParenthesizedRequiredEngine() {
  return (require)("${VIRTUAL_ENGINE_SPECIFIER}");
}
`,
    `export {
  loadParenthesizedRequiredEngine
} from "./provenance-engine-parenthesized-require.ts";`,
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "literal engine dynamic import",
    "provenance-engine-dynamic-import.ts",
    `
export async function loadHistoricalEngine() {
  return import("${VIRTUAL_ENGINE_SPECIFIER}");
}
`,
    'export { loadHistoricalEngine } from "./provenance-engine-dynamic-import.ts";',
    VIRTUAL_ENGINE_OVERLAY
  ),
  createVirtualExportFixture(
    "unresolved engine-like require",
    "provenance-unresolved-engine-require.ts",
    `
export function loadMissingEngine() {
  return require("../engines/sandbox/src/base-filter/missing-provenance-fixture.ts");
}
`,
    'export { loadMissingEngine } from "./provenance-unresolved-engine-require.ts";'
  ),
  createVirtualExportFixture(
    "explicit engine package require",
    "provenance-engine-package-require.ts",
    `
export function loadEnginePackage() {
  return require("@agent-security-platform/engines/sandbox");
}
`,
    'export { loadEnginePackage } from "./provenance-engine-package-require.ts";'
  ),
  createVirtualExportFixture(
    "nonliteral dynamic import",
    "provenance-nonliteral-dynamic-import.ts",
    `
const engineModulePath = "${VIRTUAL_ENGINE_SPECIFIER}";
export function loadComputedEngine() {
  return import(engineModulePath);
}
`,
    'export { loadComputedEngine } from "./provenance-nonliteral-dynamic-import.ts";'
  )
] as const;

const EXPECTED_ENGINE_ORIGIN_EXPORTS = new Map<string, readonly string[]>([
  ["Master D type relay renamed", ["HistoricalEvaluationRequest"]],
  ["Master D interface heritage relay", ["HistoricalEngine"]],
  [
    "Master C runtime alias and wrapper relay",
    ["createHistoricalEngine", "createHistoricalWrappedEngine"]
  ],
  ["Master E type relay renamed", ["HistoricalNormalizedRequest"]],
  ["engine export star", ["HistoricalStarEngineProbe"]],
  ["engine namespace export", ["HistoricalEngineNamespace"]],
  ["engine ImportTypeNode reference", ["HistoricalImportType"]],
  ["engine TypeQuery reference", ["HistoricalEngineFactory"]],
  ["engine binding initializer reference", ["HistoricalBoundProbe"]],
  ["engine import-equals reference", ["HistoricalImportEqualsProbe"]],
  ["literal engine require", ["loadRequiredEngine"]],
  [
    "parenthesized literal engine require",
    ["loadParenthesizedRequiredEngine"]
  ],
  ["literal engine dynamic import", ["loadHistoricalEngine"]]
]);

const EXPECTED_CANONICAL_ORIGIN_EXPORTS = new Map<string, readonly string[]>([
  ["canonical Master A runtime relay renamed", ["HistoricalSecurityStages"]],
  ["canonical Master B relay renamed", ["HistoricalStage"]],
  ["canonical Master B same-name relay", ["HistoricalSameNameStage"]]
]);

const ENGINE_MODULE_REFERENCE_FIXTURES = new Set([
  "Master D type relay renamed",
  "Master D interface heritage relay",
  "Master C runtime alias and wrapper relay",
  "Master E type relay renamed",
  "normalized engine import path",
  "engine export star",
  "engine namespace export",
  "engine ImportTypeNode reference",
  "engine TypeQuery reference",
  "engine binding initializer reference",
  "engine import-equals reference",
  "literal engine require",
  "parenthesized literal engine require",
  "literal engine dynamic import"
]);

const UNRESOLVED_ENGINE_MODULE_REFERENCE_FIXTURES = new Map([
  [
    "unresolved engine-like require",
    "../engines/sandbox/src/base-filter/missing-provenance-fixture.ts"
  ],
  [
    "explicit engine package require",
    "@agent-security-platform/engines/sandbox"
  ]
]);

const VIRTUAL_MIXED_HISTORICAL_MODULE_PATH = resolve(
  REPO_ROOT,
  "shared/provenance-mixed-historical.ts"
);
const UNRELATED_HISTORICAL_EXPORT_FIXTURE = createVirtualExportFixture(
  "unrelated historical-style export",
  "provenance-unrelated-namespace.ts",
  `
import * as Mixed from "./provenance-mixed-historical.ts";
export const HistoricalSharedFixture = Mixed.HistoricalSharedValue;
`,
  `export {
  HistoricalSharedFixture
  } from "./provenance-unrelated-namespace.ts";`,
  new Map([
    [
      VIRTUAL_MIXED_HISTORICAL_MODULE_PATH,
      `
export const HistoricalSharedValue = "historical";
export type { SandboxSecurityStage } from "./types/sandbox-security.ts";
`
    ]
  ])
);

const COMBINED_TRANSITIVE_EXPORT_OVERLAY = (() => {
  const indexPath = resolve(REPO_ROOT, "shared/index.ts");
  const baselineIndex = readText("shared/index.ts");
  const overlay = new Map<string, string>();
  let combinedIndex = baselineIndex;

  for (const fixture of TRANSITIVE_EXPORT_FIXTURES) {
    combinedIndex += fixture.sources.index.slice(baselineIndex.length);
    for (const [fileName, source] of fixture.overlay) {
      if (fileName !== indexPath) {
        overlay.set(fileName, source);
      }
    }
  }
  overlay.set(indexPath, combinedIndex);
  return overlay;
})();

let currentSharedExportAnalysis:
  | ReturnType<typeof analyzeSharedExportProvenance>
  | undefined;
let transitiveExportAnalysis:
  | ReturnType<typeof analyzeSharedExportProvenance>
  | undefined;
let positiveVirtualExportAnalysis:
  | ReturnType<typeof analyzeSharedExportProvenance>
  | undefined;

function analyzeCurrentSharedExports() {
  currentSharedExportAnalysis ??= analyzeSharedExportProvenance();
  return currentSharedExportAnalysis;
}

function analyzeCombinedTransitiveExports() {
  transitiveExportAnalysis ??= analyzeSharedExportProvenance(
    COMBINED_TRANSITIVE_EXPORT_OVERLAY
  );
  return transitiveExportAnalysis;
}

function analyzePositiveVirtualExports() {
  positiveVirtualExportAnalysis ??= analyzeSharedExportProvenance(
    UNRELATED_HISTORICAL_EXPORT_FIXTURE.overlay
  );
  return positiveVirtualExportAnalysis;
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
  const analysis = analyzeCurrentSharedExports();
  assert.deepEqual(
    analysis.diagnostics,
    [],
    `shared export provenance Program must typecheck:\n${analysis.diagnostics.join("\n")}`
  );
  assert.deepEqual(
    analysis.violations,
    [],
    `shared export provenance violations:\n${analysis.violations.join("\n")}`
  );
  assert.equal(
    analysis.rootNames.includes(resolve(REPO_ROOT, "shared/types/task.ts")),
    true,
    "provenance Program roots must include unrelated shared production files"
  );
  assert.equal(
    analysis.rootNames.some((fileName) =>
      fileName.startsWith(resolve(REPO_ROOT, "shared/tests"))
    ),
    false,
    "provenance Program roots must exclude shared tests"
  );

  const sharedPublicExportNames = new Set(
    analysis.exports.map((entry) => entry.exportedName)
  );
  const allowedSandboxSecurityNames = new Set<string>([
    ...MASTER_A_RUNTIME,
    ...MASTER_B_TYPES
  ]);

  for (const identifier of FORBIDDEN_SHARED_ENGINE_EXPORTS) {
    assert.equal(
      sharedPublicExportNames.has(identifier),
      false,
      `shared package must not export engine-only identifier ${identifier}`
    );
  }

  for (const entry of analysis.exports) {
    assert.deepEqual(
      entry.engineOriginPaths,
      [],
      `shared package export ${entry.exportedName} must not originate in engines/**`
    );
    if (entry.canonicalSandboxOriginPaths.length > 0) {
      assert.equal(
        allowedSandboxSecurityNames.has(entry.exportedName),
        true,
        `canonical sandbox security export ${entry.exportedName} must be in Master A/B`
      );
      assert.equal(
        entry.directCanonicalExport,
        true,
        `canonical sandbox security export ${entry.exportedName} must use a direct same-name row`
      );
    }
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
      index: `${sources.index}\nexport { createSandboxSecurityCanonicalFingerprintService as createSharedFingerprintHelper } from "../engines/sandbox/src/security/canonical-fingerprint.ts";\n`
    },
    {
      ...sources,
      index: `${sources.index}\nimport type { SandboxSecurityStage as InternalStage } from "./types/sandbox-security.ts";\nexport type { InternalStage as LeakedStage };\n`
    },
    {
      ...sources,
      index: `${sources.index}\nexport * as Internals from ".././engines/sandbox/src/security/canonical-fingerprint.ts";\n`
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
    [false, false, false, false, false, false, false]
  );
});

for (const fixture of TRANSITIVE_EXPORT_FIXTURES) {
  test(`REQ-SBX-GENERAL-001 export provenance rejects ${fixture.name}`, () => {
    const analysis = analyzeCombinedTransitiveExports();
    assert.deepEqual(
      analysis.diagnostics,
      [],
      `${fixture.name} fixture must be a valid TypeScript program`
    );
    assert.equal(
      analysis.rootNames.includes(fixture.fixturePath),
      true,
      `${fixture.name} fixture must be a shared production Program root`
    );

    for (const exportedName of
      EXPECTED_ENGINE_ORIGIN_EXPORTS.get(fixture.name) ?? []) {
      const exported = analysis.exports.find(
        (entry) => entry.exportedName === exportedName
      );
      assert.ok(exported, `${fixture.name} must export ${exportedName}`);
      assert.deepEqual(
        exported.engineOriginPaths,
        [VIRTUAL_ENGINE_FIXTURE_PATH],
        `${fixture.name} must trace ${exportedName} to its engine declaration`
      );
    }

    for (const exportedName of
      EXPECTED_CANONICAL_ORIGIN_EXPORTS.get(fixture.name) ?? []) {
      const exported = analysis.exports.find(
        (entry) => entry.exportedName === exportedName
      );
      assert.ok(exported, `${fixture.name} must export ${exportedName}`);
      assert.deepEqual(
        exported.canonicalSandboxOriginPaths,
        [SANDBOX_SECURITY_TYPES_PATH],
        `${fixture.name} must trace ${exportedName} to the canonical type module`
      );
      assert.equal(
        exported.directCanonicalExport,
        false,
        `${fixture.name} must not qualify a relay as a direct A/B row`
      );
    }

    if (ENGINE_MODULE_REFERENCE_FIXTURES.has(fixture.name)) {
      assert.equal(
        analysis.moduleReferences.some(
          (reference) =>
            reference.sourcePath === fixture.fixturePath &&
            reference.resolvedPath === VIRTUAL_ENGINE_FIXTURE_PATH &&
            reference.engineDependency
        ),
        true,
        `${fixture.name} must resolve and record its engine module reference`
      );
    }

    const unresolvedEngineSpecifier =
      UNRESOLVED_ENGINE_MODULE_REFERENCE_FIXTURES.get(fixture.name);
    if (unresolvedEngineSpecifier !== undefined) {
      assert.equal(
        analysis.moduleReferences.some(
          (reference) =>
            reference.sourcePath === fixture.fixturePath &&
            reference.moduleSpecifier === unresolvedEngineSpecifier &&
            reference.resolvedPath === null &&
            reference.engineDependency
        ),
        true,
        `${fixture.name} must fail closed on its unresolved engine reference`
      );
    }

    if (fixture.name === "nonliteral dynamic import") {
      assert.equal(
        analysis.moduleReferences.some(
          (reference) =>
            reference.sourcePath === fixture.fixturePath &&
            reference.kind === "dynamic-import" &&
            reference.moduleSpecifier === null &&
            reference.resolvedPath === null &&
            reference.violation !== null
        ),
        true,
        "nonliteral dynamic import must fail closed before module resolution"
      );
    }

    if (fixture.name === "normalized engine import path") {
      const exported = analysis.exports.find(
        (entry) => entry.exportedName === "HistoricalNormalizedImportValue"
      );
      assert.ok(exported);
      assert.deepEqual(exported.engineOriginPaths, []);
      assert.deepEqual(exported.canonicalSandboxOriginPaths, []);
    }

    assert.notDeepEqual(
      analysis.violations,
      [],
      `${fixture.name} must not bypass the shared export gate`
    );
  });
}

test("REQ-SBX-GENERAL-001 export provenance permits direct canonical A/B rows", () => {
  const analysis = analyzePositiveVirtualExports();

  assert.deepEqual(analysis.diagnostics, []);
  for (const exportedName of [
    "SANDBOX_SECURITY_STAGES",
    "SandboxSecurityStage",
    "normalizeSandboxSecurityRequest"
  ]) {
    const exported = analysis.exports.find(
      (entry) => entry.exportedName === exportedName
    );
    assert.ok(exported, `direct canonical fixture must export ${exportedName}`);
    assert.equal(exported.canonicalSandboxOriginPaths.length > 0, true);
    assert.equal(exported.directCanonicalExport, true);
  }
  assert.deepEqual(analysis.violations, []);
});

test("REQ-SBX-GENERAL-001 export provenance permits unrelated historical exports", () => {
  const analysis = analyzePositiveVirtualExports();
  assert.deepEqual(analysis.diagnostics, []);
  const exported = analysis.exports.find(
    (entry) => entry.exportedName === "HistoricalSharedFixture"
  );
  assert.ok(exported);
  assert.deepEqual(exported.engineOriginPaths, []);
  assert.deepEqual(exported.canonicalSandboxOriginPaths, []);
  assert.equal(exported.directCanonicalExport, false);
  assert.deepEqual(analysis.violations, []);
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
        entry.resolvedModulePath === SANDBOX_SECURITY_TYPES_PATH
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
      namesByKind(indexInventory, "type", SANDBOX_SECURITY_TYPES_PATH)
    ),
    sortedNames(MASTER_B_TYPES)
  );
});
