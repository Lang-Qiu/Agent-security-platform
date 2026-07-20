import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "../../../frontend/node_modules/typescript/lib/typescript.js";

import {
  createSandboxSecurityDeterministicSanitizer
} from "../src/security-production/deterministic-sanitizer.ts";
import {
  createSandboxSecurityProductionRuleDetector
} from "../src/security-production/rule-detector.ts";
import type {
  RawLocalDetector,
  SandboxSecurityEngine,
  SandboxSecurityRuntimePorts,
  SandboxSecuritySanitizer
} from "../src/security/index.ts";

const INDEX_URL = new URL(
  "../src/security-production/index.ts",
  import.meta.url
);
const INDEX_PATH = fileURLToPath(INDEX_URL);
const EXPECTED_EXPORTS = [
  "createSandboxSecurityDeterministicSanitizer",
  "createSandboxSecurityProductionEngine",
  "createSandboxSecurityProductionRuleDetector"
] as const;

type PublicProductionIndex = typeof import(
  "../src/security-production/index.ts"
);

type RuntimePublicProductionIndex = Readonly<{
  createSandboxSecurityDeterministicSanitizer: () => SandboxSecuritySanitizer;
  createSandboxSecurityProductionEngine(input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: "rule_only" | "local" | "local_and_judge";
  }>): Promise<SandboxSecurityEngine>;
  createSandboxSecurityProductionRuleDetector: () => RawLocalDetector;
}>;

const GUARDED_MISSING_INDEX: RuntimePublicProductionIndex = Object.freeze({
  createSandboxSecurityDeterministicSanitizer: () => Object.freeze({}) as never,
  createSandboxSecurityProductionEngine: async () => Object.freeze({}) as never,
  createSandboxSecurityProductionRuleDetector: () => Object.freeze({}) as never
});

let productionModule: Readonly<Record<string, unknown>> =
  GUARDED_MISSING_INDEX;
try {
  productionModule = await import(INDEX_URL.href);
} catch (error: unknown) {
  const details = error as { code?: unknown; url?: unknown };
  if (
    details.code !== "ERR_MODULE_NOT_FOUND" ||
    String(details.url ?? "") !== INDEX_URL.href
  ) {
    throw error;
  }
}

const productionIndex =
  productionModule as unknown as RuntimePublicProductionIndex;

function readProductionIndexSource(): string {
  try {
    return readFileSync(INDEX_PATH, "utf8");
  } catch (error: unknown) {
    const details = error as { code?: unknown; path?: unknown };
    if (details.code === "ENOENT" && details.path === INDEX_PATH) {
      return "export const guardedMissingProductionIndex = undefined;\n";
    }
    throw error;
  }
}

function runtimePorts(): SandboxSecurityRuntimePorts {
  return {
    now: () => "2026-07-20T00:00:00.000Z",
    nextDecisionId: () => "production-index-decision-0001",
    monotonicNowMs: () => 0,
    scheduleTimeout: () => () => undefined
  };
}

function compileOnlyPublicSurface(
  publicIndex: PublicProductionIndex,
  runtime: SandboxSecurityRuntimePorts
): void {
  const ruleFactory: () => RawLocalDetector =
    publicIndex.createSandboxSecurityProductionRuleDetector;
  const sanitizerFactory: () => SandboxSecuritySanitizer =
    publicIndex.createSandboxSecurityDeterministicSanitizer;
  const engineFactory: (input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: "rule_only" | "local" | "local_and_judge";
  }>) => Promise<SandboxSecurityEngine> =
    publicIndex.createSandboxSecurityProductionEngine;
  const engine: Promise<SandboxSecurityEngine> = engineFactory({
    runtime,
    mode: "rule_only"
  });

  // @ts-expect-error public production Engine requires runtime
  publicIndex.createSandboxSecurityProductionEngine({ mode: "rule_only" });
  // @ts-expect-error public production Engine requires mode
  publicIndex.createSandboxSecurityProductionEngine({ runtime });
  // @ts-expect-error public production Engine rejects unknown modes
  publicIndex.createSandboxSecurityProductionEngine({ runtime, mode: "remote" });
  publicIndex.createSandboxSecurityProductionEngine(
    { runtime, mode: "rule_only" },
    // @ts-expect-error public production Engine rejects extra positional options
    {}
  );
  publicIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only",
    // @ts-expect-error public production Engine rejects transport control
    transport: undefined
  });
  publicIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only",
    // @ts-expect-error public production Engine rejects environment control
    environment: undefined
  });
  publicIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only",
    // @ts-expect-error public production Engine rejects credential control
    credential: undefined
  });
  publicIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only",
    // @ts-expect-error public production Engine rejects endpoint control
    endpoint: undefined
  });
  publicIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only",
    // @ts-expect-error public production Engine rejects model control
    model: undefined
  });
  publicIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only",
    // @ts-expect-error public production Engine rejects prompt control
    prompt: undefined
  });
  publicIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only",
    // @ts-expect-error public production Engine rejects schema control
    schema: undefined
  });
  publicIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only",
    // @ts-expect-error public production Engine rejects benchmark control
    benchmark: undefined
  });

  // @ts-expect-error public index exposes no core Engine factory
  void publicIndex.createSandboxSecurityEngine;
  // @ts-expect-error public index exposes no internal composition factory
  void publicIndex.createSandboxSecurityProductionComposition;
  // @ts-expect-error public index exposes no internal WithPorts helper
  void publicIndex.createSandboxSecurityProductionCompositionWithPorts;
  // @ts-expect-error public index exposes no configuration factory
  void publicIndex.createSandboxSecurityProductionConfig;
  // @ts-expect-error public index exposes no provider transport factory
  void publicIndex.createSandboxSecurityDefaultHttpTransport;
  // @ts-expect-error public index exposes no qualification constructor
  void publicIndex.qualifySandboxSecurityOllama;
  // @ts-expect-error public index exposes no replay normalizer
  void publicIndex.normalizeSandboxSecurityReplayOutcome;
  // @ts-expect-error public index exposes no benchmark composition factory
  void publicIndex.createSandboxSecurityLiveCaptureEngine;

  void ruleFactory;
  void sanitizerFactory;
  void engine;
}

void compileOnlyPublicSurface;

// @ts-expect-error public index re-exports no core type
type CoreTypeLeakProbe = import("../src/security-production/index.ts").SandboxSecurityEngine;
// @ts-expect-error public index exports no helper type
type HelperTypeLeakProbe = import("../src/security-production/index.ts").SandboxSecurityProductionCompositionPorts;
// @ts-expect-error public index exports no provider contract
type ProviderTypeLeakProbe = import("../src/security-production/index.ts").SandboxSecurityHttpTransport;
// @ts-expect-error public index exports no qualification proof
type QualificationTypeLeakProbe = import("../src/security-production/index.ts").SandboxSecurityOllamaQualification;
// @ts-expect-error public index exports no replay type
type ReplayTypeLeakProbe = import("../src/security-production/index.ts").SandboxSecurityReplayTransportOutcome;
// @ts-expect-error public index exports no benchmark seam type
type BenchmarkTypeLeakProbe = import("../src/security-production/index.ts").SandboxSecurityCaptureSink;

test("REQ-SBX-GENERAL-002 production index exports exactly three function values", () => {
  assert.deepEqual(Object.keys(productionModule).sort(), [...EXPECTED_EXPORTS]);
  for (const name of EXPECTED_EXPORTS) {
    assert.equal(typeof productionModule[name], "function", name);
  }
});

test("REQ-SBX-GENERAL-002 production index transparently re-exports the public detector factories", () => {
  assert.equal(
    productionIndex.createSandboxSecurityProductionRuleDetector,
    createSandboxSecurityProductionRuleDetector
  );
  assert.equal(
    productionIndex.createSandboxSecurityDeterministicSanitizer,
    createSandboxSecurityDeterministicSanitizer
  );
});

test("REQ-SBX-GENERAL-002 public production Engine accepts only runtime and mode", async () => {
  const runtime = runtimePorts();
  const engine = await productionIndex.createSandboxSecurityProductionEngine({
    runtime,
    mode: "rule_only"
  });
  assert.equal(typeof engine.evaluate, "function");

  for (const control of [
    "transport",
    "environment",
    "credential",
    "endpoint",
    "model",
    "prompt",
    "schema",
    "benchmark"
  ] as const) {
    await assert.rejects(
      productionIndex.createSandboxSecurityProductionEngine({
        runtime,
        mode: "rule_only",
        [control]: Object.freeze({})
      } as never),
      { name: "sandbox_security_production_composition_invalid" },
      control
    );
  }
});

function assertSealedProductionIndexSource(source: string): void {
  const sourceFile = ts.createSourceFile(
    INDEX_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const topLevelStatements = sourceFile.statements.map((statement) => {
    if (ts.isExportDeclaration(statement)) {
      return "re-export";
    }
    if (ts.isImportDeclaration(statement)) {
      return "import";
    }
    if (ts.isFunctionDeclaration(statement)) {
      return "function";
    }
    return ts.SyntaxKind[statement.kind];
  });
  assert.deepEqual(
    topLevelStatements,
    ["re-export", "re-export", "import", "import", "function"],
    "unexpected production index top-level statement"
  );

  function assertNoDynamicImport(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      assert.fail("production index dynamic import is forbidden");
    }
    ts.forEachChild(node, assertNoDynamicImport);
  }
  assertNoDynamicImport(sourceFile);

  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const reExports = sourceFile.statements.filter(ts.isExportDeclaration);
  const moduleEdges = sourceFile.statements
    .filter(
      (statement): statement is ts.ImportDeclaration | ts.ExportDeclaration =>
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
    )
    .map((statement) => {
      assert.ok(
        statement.moduleSpecifier !== undefined &&
          ts.isStringLiteral(statement.moduleSpecifier)
      );
      return statement.moduleSpecifier.text;
    })
    .sort();

  assert.deepEqual(moduleEdges, [
    "../security/index.ts",
    "./composition.ts",
    "./deterministic-sanitizer.ts",
    "./rule-detector.ts"
  ]);

  const coreImport = imports.find(
    (statement) => statement.moduleSpecifier.getText(sourceFile) ===
      '"../security/index.ts"'
  );
  assert.ok(coreImport?.importClause?.isTypeOnly);
  assert.ok(
    coreImport.importClause.namedBindings !== undefined &&
      ts.isNamedImports(coreImport.importClause.namedBindings)
  );
  assert.deepEqual(
    coreImport.importClause.namedBindings.elements
      .map((element) => element.name.text)
      .sort(),
    ["SandboxSecurityEngine", "SandboxSecurityRuntimePorts"]
  );

  const compositionImport = imports.find(
    (statement) => statement.moduleSpecifier.getText(sourceFile) ===
      '"./composition.ts"'
  );
  assert.equal(compositionImport?.importClause?.isTypeOnly, false);
  assert.ok(
    compositionImport?.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(compositionImport.importClause.namedBindings)
  );
  assert.deepEqual(
    compositionImport.importClause.namedBindings.elements.map(
      (element) => element.name.text
    ),
    ["createSandboxSecurityProductionComposition"]
  );

  assert.equal(reExports.length, 2);
  for (const statement of reExports) {
    assert.equal(statement.isTypeOnly, false);
    assert.ok(
      statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause)
    );
    assert.equal(statement.exportClause.elements.length, 1);
    const element = statement.exportClause.elements[0]!;
    assert.equal(element.isTypeOnly, false);
    assert.equal(element.propertyName, undefined);
  }

  const exportedNames: string[] = reExports.flatMap((statement) => {
    assert.ok(
      statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause)
    );
    return statement.exportClause.elements.map((element) => element.name.text);
  });
  const engineDeclaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "createSandboxSecurityProductionEngine"
  );
  assert.ok(engineDeclaration);
  exportedNames.push(engineDeclaration.name!.text);
  assert.deepEqual(exportedNames.sort(), [...EXPECTED_EXPORTS]);

  for (const statement of sourceFile.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      );
    if (exported) {
      assert.equal(statement, engineDeclaration, "unexpected exported declaration");
    }
  }

  assert.ok(
    engineDeclaration.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
    )
  );
  assert.equal(engineDeclaration.parameters.length, 1);
  const parameter = engineDeclaration.parameters[0]!;
  assert.equal(parameter.name.getText(sourceFile), "input");
  assert.match(
    parameter.type?.getText(sourceFile) ?? "",
    /^Readonly<\{\s*runtime:\s*SandboxSecurityRuntimePorts;\s*mode:\s*"rule_only"\s*\|\s*"local"\s*\|\s*"local_and_judge";?\s*\}>$/s
  );
  assert.match(
    engineDeclaration.type?.getText(sourceFile) ?? "",
    /^Promise<SandboxSecurityEngine>$/
  );
  assert.equal(engineDeclaration.body?.statements.length, 1);
  const returnStatement = engineDeclaration.body?.statements[0];
  assert.ok(returnStatement !== undefined && ts.isReturnStatement(returnStatement));
  assert.equal(
    returnStatement.expression?.getText(sourceFile),
    "createSandboxSecurityProductionComposition(input)"
  );

  assert.doesNotMatch(source, /benchmark-composition(?:\.ts)?/i);
  assert.doesNotMatch(
    source,
    /\b(?:transport|environment|credential|endpoint|model|prompt|schema|benchmark)\b/i
  );
  assert.doesNotMatch(
    source,
    /\b(?:provider|qualification|proof|replay)\b/i
  );
}

test("REQ-SBX-GENERAL-002 production index source has the exact sealed import graph and wrapper", () => {
  assertSealedProductionIndexSource(readProductionIndexSource());
});

test("REQ-SBX-GENERAL-002 production index source rejects unexported top-level side effects", () => {
  const mutatedSource = `${readProductionIndexSource()}\nvoid createSandboxSecurityProductionComposition;\n`;

  assert.throws(
    () => assertSealedProductionIndexSource(mutatedSource),
    /unexpected production index top-level statement/
  );
});

test("REQ-SBX-GENERAL-002 production index source rejects dynamic imports anywhere", () => {
  const source = readProductionIndexSource();
  const mutatedSource = source.replace(
    "}>): Promise<SandboxSecurityEngine>",
    '}> = (void import("./rule-catalog.ts"), {} as never)): Promise<SandboxSecurityEngine>'
  );
  assert.notEqual(mutatedSource, source);

  assert.throws(
    () => assertSealedProductionIndexSource(mutatedSource),
    /production index dynamic import/
  );
});
