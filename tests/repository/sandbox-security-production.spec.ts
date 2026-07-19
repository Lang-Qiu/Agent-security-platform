import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "../../frontend/node_modules/typescript/lib/typescript.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SECURITY_ROOT = resolve(REPO_ROOT, "engines/sandbox/src/security");
const PRODUCTION_ROOT = resolve(
  REPO_ROOT,
  "engines/sandbox/src/security-production"
);
const SECURITY_INDEX = join(SECURITY_ROOT, "index.ts");
const SANITIZED_BOUNDARY = join(SECURITY_ROOT, "sanitized-boundary.ts");
const DETERMINISTIC_SANITIZER = join(
  PRODUCTION_ROOT,
  "deterministic-sanitizer.ts"
);
const HTTP_TRANSPORT = join(PRODUCTION_ROOT, "http-transport.ts");
const PRODUCTION_CONFIG = join(PRODUCTION_ROOT, "production-config.ts");
const SANITIZER_HELPER =
  "deriveSandboxSecurityExternalTokenRegistry";
const SANITIZER_VERSION_EXPORT =
  "SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION";
const SANITIZER_FACTORY_EXPORT =
  "createSandboxSecurityDeterministicSanitizer";
const SANITIZER_VERSION_VALUE =
  "sandbox-security-deterministic-sanitizer.v1";

const TYPESCRIPT_EXTENSION = /\.(?:[cm]?ts|tsx)$/u;
const JAVASCRIPT_EXTENSION = /\.(?:[cm]?js|jsx)$/u;
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/u;
const FORBIDDEN_ORACLE_FIELD =
  /\b(?:fixture_id|verdict_class|ground_truth_severity|transformation_kind|seed_record_ref|expected_action)\b/iu;
const FORBIDDEN_ORACLE_IMPORT =
  /(?:^|[\\/])(?:samples|scripts|tests)(?:[\\/]|$)|(?:^|[\\/._-])(?:track\s*1|track1|campaign)(?:[\\/._-]|$)|sandbox-security-benchmark/iu;
const FORBIDDEN_ORACLE_LITERAL =
  /sandbox-security-benchmark|(?:^|[\\/.:#_-])(?:fixture(?:_id)?|source_id|dataset_source|record(?:_ref)?|seed_record)(?:$|[\\/.:#-])|(?:^|[\\/.:#-])source(?:$|[\\/.:#-])|(?:^|[\\/._-])(?:track\s*1|track1|campaign)(?:[\\/._-]|$)/iu;
const FORBIDDEN_BENCHMARK_ORACLE_LITERAL =
  /AgentDojo|ryoungj\/ToolEmu|ToolEmu|deepset\/prompt-injections|OpenAssistant\/oasst1|089ed468cf3ed0322acc66b0211f26d9d90dbf60|ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb|4f61ecb038e9c3fb77e21034b22511b523772cdd|fdf72ae0827c1cda404aff25b6603abec9e3399b/iu;
const NETWORK_MODULES = new Set([
  "node:http",
  "node:https",
  "node:http2",
  "node:net",
  "node:tls",
  "node:dgram",
  "node:dns"
]);
const ALLOWED_TRANSPORT_MODULES = new Set([
  "node:crypto",
  "node:http",
  "node:https",
  "node:util"
]);
const NETWORK_GLOBALS = new Set(["fetch", "WebSocket", "EventSource"]);
const DIRECT_GLOBAL_CAPABILITIES = new Set([
  ...NETWORK_GLOBALS,
  "eval",
  "Function",
  "process",
  "require"
]);

type SourceTree = "core" | "production";
type EdgeKind =
  | "static-import"
  | "export-from"
  | "export-star"
  | "export-namespace"
  | "import-equals"
  | "require"
  | "dynamic-import"
  | "process-get-builtin-module";

interface ScanRoots {
  readonly repositoryRoot: string;
  readonly securityRoot: string;
  readonly productionRoot: string;
  readonly securityIndex: string;
  readonly sanitizedBoundary: string;
  readonly deterministicSanitizer: string;
  readonly httpTransport: string;
  readonly productionConfig: string;
}

interface SourceRecord {
  readonly path: string;
  readonly text: string;
  readonly tree: SourceTree;
  readonly enforceSanitizerSourceOwner?: boolean;
}

interface ImportEdge {
  readonly sourcePath: string;
  readonly kind: EdgeKind;
  readonly moduleSpecifier: string | null;
  readonly resolvedPath: string | null;
  readonly importedNames: readonly string[];
  readonly hasImportAlias: boolean;
}

interface SourceAnalysis {
  readonly edges: readonly ImportEdge[];
  readonly violations: readonly string[];
}

const ROOTS: ScanRoots = {
  repositoryRoot: REPO_ROOT,
  securityRoot: SECURITY_ROOT,
  productionRoot: PRODUCTION_ROOT,
  securityIndex: SECURITY_INDEX,
  sanitizedBoundary: SANITIZED_BOUNDARY,
  deterministicSanitizer: DETERMINISTIC_SANITIZER,
  httpTransport: HTTP_TRANSPORT,
  productionConfig: PRODUCTION_CONFIG
};

function displayPath(path: string, roots: ScanRoots = ROOTS): string {
  const repositoryRelativePath = relative(roots.repositoryRoot, path);
  return repositoryRelativePath.startsWith("..")
    ? path
    : repositoryRelativePath.split(sep).join("/");
}

function isWithin(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

function listTypeScriptSources(
  root: string,
  tree: SourceTree,
  roots: ScanRoots = ROOTS
): Readonly<{ sources: readonly SourceRecord[]; violations: readonly string[] }> {
  if (!existsSync(root)) {
    return { sources: [], violations: [] };
  }
  if (lstatSync(root).isSymbolicLink()) {
    return {
      sources: [],
      violations: [
        `${displayPath(root, roots)}: symbolic links are forbidden for the ${tree} source root`
      ]
    };
  }

  const sources: SourceRecord[] = [];
  const violations: string[] = [];
  const visitDirectory = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        violations.push(
          `${displayPath(entryPath, roots)}: symbolic links are forbidden in the ${tree} source tree`
        );
        continue;
      }
      if (entry.isDirectory()) {
        visitDirectory(entryPath);
        continue;
      }
      if (entry.isFile() && TYPESCRIPT_EXTENSION.test(entry.name)) {
        sources.push({
          path: entryPath,
          text: readFileSync(entryPath, "utf8"),
          tree,
          ...(entryPath === roots.deterministicSanitizer
            ? { enforceSanitizerSourceOwner: true }
            : {})
        });
      }
    }
  };

  visitDirectory(root);
  return {
    sources: sources.sort((left, right) => left.path.localeCompare(right.path)),
    violations
  };
}

function moduleCandidates(sourcePath: string, moduleSpecifier: string): string[] {
  const unresolvedPath = resolve(dirname(sourcePath), moduleSpecifier);
  if (TYPESCRIPT_EXTENSION.test(unresolvedPath)) {
    return [unresolvedPath];
  }
  if (JAVASCRIPT_EXTENSION.test(unresolvedPath)) {
    return [unresolvedPath.replace(JAVASCRIPT_EXTENSION, ".ts")];
  }
  return [
    `${unresolvedPath}.ts`,
    `${unresolvedPath}.tsx`,
    `${unresolvedPath}.mts`,
    `${unresolvedPath}.cts`,
    join(unresolvedPath, "index.ts"),
    join(unresolvedPath, "index.tsx")
  ];
}

function edgeLabel(edge: ImportEdge, roots: ScanRoots): string {
  const target = edge.resolvedPath
    ? displayPath(edge.resolvedPath, roots)
    : "<unresolved>";
  return `${displayPath(edge.sourcePath, roots)} --${edge.kind}(${JSON.stringify(edge.moduleSpecifier)})--> ${target}`;
}

function resolveRelativeEdge(
  edge: Omit<ImportEdge, "resolvedPath">,
  roots: ScanRoots
): Readonly<{ edge: ImportEdge; violations: readonly string[] }> {
  const moduleSpecifier = edge.moduleSpecifier;
  const unresolvedEdge: ImportEdge = { ...edge, resolvedPath: null };
  if (moduleSpecifier === null) {
    return {
      edge: unresolvedEdge,
      violations: [`${edgeLabel(unresolvedEdge, roots)}: nonliteral module reference is forbidden`]
    };
  }
  if (moduleSpecifier.startsWith("file:")) {
    return {
      edge: unresolvedEdge,
      violations: [`${edgeLabel(unresolvedEdge, roots)}: file URL imports are forbidden`]
    };
  }
  if (isAbsolute(moduleSpecifier) || WINDOWS_ABSOLUTE_PATH.test(moduleSpecifier)) {
    return {
      edge: unresolvedEdge,
      violations: [`${edgeLabel(unresolvedEdge, roots)}: absolute imports are forbidden`]
    };
  }
  if (!moduleSpecifier.startsWith(".")) {
    return { edge: unresolvedEdge, violations: [] };
  }

  const candidate = moduleCandidates(edge.sourcePath, moduleSpecifier).find(
    (path) => {
      if (!existsSync(path)) {
        return false;
      }
      const status = lstatSync(path);
      return status.isFile() || status.isSymbolicLink();
    }
  );
  if (candidate === undefined) {
    return {
      edge: unresolvedEdge,
      violations: [`${edgeLabel(unresolvedEdge, roots)}: unresolved relative import`]
    };
  }

  const realCandidate = realpathSync(candidate);
  const resolvedEdge: ImportEdge = { ...edge, resolvedPath: realCandidate };
  if (!isWithin(roots.repositoryRoot, realCandidate)) {
    return {
      edge: resolvedEdge,
      violations: [`${edgeLabel(resolvedEdge, roots)}: relative import escapes the repository through a symlink`]
    };
  }
  return { edge: resolvedEdge, violations: [] };
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (true) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.CommaToken
    ) {
      current = current.right;
      continue;
    }
    return current;
  }
}

function expressionPath(expression: ts.Expression): readonly string[] | null {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) {
    return [current.text];
  }
  if (ts.isPropertyAccessExpression(current)) {
    const parentPath = expressionPath(current.expression);
    return parentPath ? [...parentPath, current.name.text] : null;
  }
  if (
    ts.isElementAccessExpression(current) &&
    current.argumentExpression !== undefined
  ) {
    const parentPath = expressionPath(current.expression);
    const propertyName = foldStaticString(current.argumentExpression);
    return parentPath && propertyName !== null
      ? [...parentPath, propertyName]
      : null;
  }
  return null;
}

function foldStaticString(
  expression: ts.Expression,
  immutableBindings?: ReadonlyMap<string, ts.Expression>,
  visitingBindings: Set<string> = new Set()
): string | null {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteralLike(current)) {
    return current.text;
  }
  if (ts.isNumericLiteral(current)) {
    return String(Number(current.text));
  }
  if (current.kind === ts.SyntaxKind.TrueKeyword) {
    return "true";
  }
  if (current.kind === ts.SyntaxKind.FalseKeyword) {
    return "false";
  }
  if (current.kind === ts.SyntaxKind.NullKeyword) {
    return "null";
  }
  if (ts.isTemplateExpression(current)) {
    let folded = current.head.text;
    for (const span of current.templateSpans) {
      const expressionValue = foldStaticString(
        span.expression,
        immutableBindings,
        visitingBindings
      );
      if (expressionValue === null) {
        return null;
      }
      folded += `${expressionValue}${span.literal.text}`;
    }
    return folded;
  }
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = foldStaticString(
      current.left,
      immutableBindings,
      visitingBindings
    );
    const right = foldStaticString(
      current.right,
      immutableBindings,
      visitingBindings
    );
    return left !== null && right !== null ? `${left}${right}` : null;
  }
  if (ts.isIdentifier(current) && immutableBindings !== undefined) {
    const initializer = immutableBindings.get(current.text);
    if (initializer === undefined || visitingBindings.has(current.text)) {
      return null;
    }
    visitingBindings.add(current.text);
    const folded = foldStaticString(
      initializer,
      immutableBindings,
      visitingBindings
    );
    visitingBindings.delete(current.text);
    return folded;
  }
  return null;
}

function expressionRootIdentifier(expression: ts.Expression): string | null {
  let current = unwrapExpression(expression);
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    current = unwrapExpression(current.expression);
  }
  return ts.isIdentifier(current) ? current.text : null;
}

function expressionRootIdentifierNode(
  expression: ts.Expression
): ts.Identifier | null {
  let current = unwrapExpression(expression);
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    current = unwrapExpression(current.expression);
  }
  return ts.isIdentifier(current) ? current : null;
}

function addBindingNames(name: ts.BindingName, bindings: Set<string>): void {
  if (ts.isIdentifier(name)) {
    bindings.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      addBindingNames(element.name, bindings);
    }
  }
}

function isFunctionScope(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function isLexicalScope(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node)
  );
}

function nearestScope(
  node: ts.Node,
  predicate: (candidate: ts.Node) => boolean
): ts.Node {
  let current: ts.Node | undefined = node;
  while (current !== undefined) {
    if (predicate(current)) {
      return current;
    }
    current = current.parent;
  }
  return node.getSourceFile();
}

function hasExportModifier(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some(
      (modifier) => modifier.kind === kind
    ) === true
  );
}

function isNonValueIdentifier(identifier: ts.Identifier): boolean {
  let ancestor: ts.Node | undefined = identifier.parent;
  while (ancestor !== undefined) {
    if (ts.isTypeNode(ancestor)) {
      return true;
    }
    ancestor = ancestor.parent;
  }

  const parent = identifier.parent;
  if (
    ts.isImportSpecifier(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isImportClause(parent) ||
    (ts.isModuleDeclaration(parent) && parent.name === identifier)
  ) {
    return true;
  }
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
    (ts.isPropertyAssignment(parent) &&
      parent.name === identifier &&
      !ts.isComputedPropertyName(parent.name)) ||
    ((ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
      parent.name === identifier)
  ) {
    return true;
  }
  if (
    (ts.isBindingElement(parent) &&
      (parent.name === identifier || parent.propertyName === identifier)) ||
    ((ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent)) &&
      parent.name === identifier)
  ) {
    return true;
  }
  return false;
}

function isAmbientContext(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current !== undefined) {
    if ((current.flags & ts.NodeFlags.Ambient) !== 0) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function importedNamesFor(statement: ts.ImportDeclaration): Readonly<{
  names: readonly string[];
  hasAlias: boolean;
}> {
  const clause = statement.importClause;
  if (clause === undefined) {
    return { names: [], hasAlias: false };
  }
  const names: string[] = [];
  let hasAlias = false;
  if (clause.name !== undefined) {
    names.push("default");
  }
  if (clause.namedBindings !== undefined) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      names.push("*");
    } else {
      for (const specifier of clause.namedBindings.elements) {
        names.push((specifier.propertyName ?? specifier.name).text);
        hasAlias ||=
          specifier.propertyName !== undefined &&
          specifier.propertyName.text !== specifier.name.text;
      }
    }
  }
  return { names, hasAlias };
}

function inspectSanitizerSourceOwner(
  sourceFile: ts.SourceFile,
  bindingsByScope: ReadonlyMap<ts.Node, ReadonlySet<string>>
): ReadonlySet<ts.StringLiteralLike> | null {
  const helperNames = new Set(["exactRecord", "denseArray", "protocolString"]);
  const helperDeclarations = new Map<string, ts.FunctionDeclaration>();
  for (const helperName of helperNames) {
    const declarations = sourceFile.statements.filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === helperName
    );
    if (declarations.length !== 1 || declarations[0]?.body === undefined) {
      return null;
    }
    helperDeclarations.set(helperName, declarations[0]);
  }

  const bindingNameContains = (name: ts.BindingName, expected: string): boolean => {
    if (ts.isIdentifier(name)) return name.text === expected;
    return name.elements.some(
      (element) =>
        !ts.isOmittedExpression(element) &&
        bindingNameContains(element.name, expected)
    );
  };
  const hasCompetingTopLevelBinding = (helperName: string): boolean =>
    sourceFile.statements.some((statement) => {
      if (statement === helperDeclarations.get(helperName)) return false;
      if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name?.text === helperName
      ) {
        return true;
      }
      if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.some((declaration) =>
          bindingNameContains(declaration.name, helperName)
        );
      }
      if (ts.isImportEqualsDeclaration(statement)) {
        return !statement.isTypeOnly && statement.name.text === helperName;
      }
      if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
        const clause = statement.importClause;
        if (!clause.isTypeOnly && clause.name?.text === helperName) return true;
        const bindings = clause.namedBindings;
        if (bindings === undefined || ts.isNamespaceImport(bindings)) {
          return bindings?.name.text === helperName;
        }
        return bindings.elements.some(
          (element) => !element.isTypeOnly && element.name.text === helperName
        );
      }
      return false;
    });
  if ([...helperNames].some(hasCompetingTopLevelBinding)) return null;

  let helperReassigned = false;
  const containsHelperReference = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && helperNames.has(node.text)) return true;
    let found = false;
    ts.forEachChild(node, (child) => {
      found ||= containsHelperReference(child);
    });
    return found;
  };
  const findHelperWrites = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      containsHelperReference(node.left)
    ) {
      helperReassigned = true;
      return;
    }
    if (
      (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer) &&
      containsHelperReference(node.initializer)
    ) {
      helperReassigned = true;
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      containsHelperReference(node.operand)
    ) {
      helperReassigned = true;
      return;
    }
    ts.forEachChild(node, findHelperWrites);
  };
  findHelperWrites(sourceFile);
  if (helperReassigned) return null;

  const validators = sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "validateSnapshot"
  );
  const validator = validators[0];
  if (
    validators.length !== 1 ||
    validator?.body === undefined ||
    validator.parameters.length !== 2 ||
    !ts.isIdentifier(validator.parameters[0].name) ||
    validator.parameters[0].name.text !== "snapshot" ||
    validator.parameters[0].initializer !== undefined ||
    validator.parameters[0].dotDotDotToken !== undefined ||
    validator.parameters[0].questionToken !== undefined ||
    !ts.isIdentifier(validator.parameters[1].name) ||
    validator.parameters[1].name.text !== "context" ||
    validator.parameters[1].initializer !== undefined ||
    validator.parameters[1].dotDotDotToken !== undefined ||
    validator.parameters[1].questionToken !== undefined
  ) {
    return null;
  }

  const directConstDeclaration = (
    block: ts.Block,
    name: string
  ): ts.VariableDeclaration | null => {
    const matches = block.statements.flatMap((statement) =>
      ts.isVariableStatement(statement) &&
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
        ? statement.declarationList.declarations.filter(
            (declaration) =>
              ts.isIdentifier(declaration.name) && declaration.name.text === name
          )
        : []
    );
    return matches.length === 1 ? matches[0] ?? null : null;
  };
  const outerDeclaration = directConstDeclaration(validator.body, "outer");
  const outerCall = outerDeclaration?.initializer;
  if (
    outerDeclaration === null ||
    outerCall === undefined ||
    !ts.isCallExpression(outerCall) ||
    outerCall.questionDotToken !== undefined ||
    (outerCall.typeArguments?.length ?? 0) !== 0 ||
    !ts.isIdentifier(outerCall.expression) ||
    outerCall.expression.text !== "exactRecord" ||
    outerCall.arguments.length !== 4 ||
    !ts.isIdentifier(outerCall.arguments[0]) ||
    outerCall.arguments[0].text !== "snapshot" ||
    expressionPath(outerCall.arguments[3])?.join(".") !== "context.signal"
  ) {
    return null;
  }

  const contentsDeclaration = directConstDeclaration(validator.body, "contents");
  const contentsCall = contentsDeclaration?.initializer;
  const contentsGet =
    contentsCall !== undefined &&
    ts.isCallExpression(contentsCall) &&
    contentsCall.arguments.length === 2
      ? contentsCall.arguments[0]
      : undefined;
  if (
    contentsDeclaration === null ||
    contentsCall === undefined ||
    !ts.isCallExpression(contentsCall) ||
    contentsCall.questionDotToken !== undefined ||
    (contentsCall.typeArguments?.length ?? 0) !== 0 ||
    !ts.isIdentifier(contentsCall.expression) ||
    contentsCall.expression.text !== "denseArray" ||
    contentsCall.arguments.length !== 2 ||
    contentsGet === undefined ||
    !ts.isCallExpression(contentsGet) ||
    contentsGet.questionDotToken !== undefined ||
    (contentsGet.typeArguments?.length ?? 0) !== 0 ||
    !ts.isPropertyAccessExpression(contentsGet.expression) ||
    !ts.isIdentifier(contentsGet.expression.expression) ||
    contentsGet.expression.expression.text !== "outer" ||
    contentsGet.expression.name.text !== "get" ||
    contentsGet.arguments.length !== 1 ||
    !ts.isStringLiteral(contentsGet.arguments[0]) ||
    contentsGet.arguments[0].text !== "contents" ||
    expressionPath(contentsCall.arguments[1])?.join(".") !== "context.signal"
  ) {
    return null;
  }

  const sourcesDeclaration = directConstDeclaration(validator.body, "sources");
  const mapCall = sourcesDeclaration?.initializer;
  const callback =
    mapCall !== undefined &&
    ts.isCallExpression(mapCall) &&
    mapCall.arguments.length === 1
      ? mapCall.arguments[0]
      : undefined;
  if (
    sourcesDeclaration === null ||
    mapCall === undefined ||
    !ts.isCallExpression(mapCall) ||
    mapCall.questionDotToken !== undefined ||
    (mapCall.typeArguments?.length ?? 0) !== 0 ||
    !ts.isPropertyAccessExpression(mapCall.expression) ||
    !ts.isIdentifier(mapCall.expression.expression) ||
    mapCall.expression.expression.text !== "contents" ||
    mapCall.expression.name.text !== "map" ||
    mapCall.arguments.length !== 1 ||
    callback === undefined ||
    !ts.isArrowFunction(callback) ||
    callback.parameters.length !== 1 ||
    !ts.isIdentifier(callback.parameters[0].name) ||
    callback.parameters[0].name.text !== "source" ||
    callback.parameters[0].initializer !== undefined ||
    callback.parameters[0].dotDotDotToken !== undefined ||
    callback.parameters[0].questionToken !== undefined ||
    !ts.isBlock(callback.body) ||
    validator.body.statements.indexOf(
      outerDeclaration.parent.parent as ts.VariableStatement
    ) >= validator.body.statements.indexOf(
      contentsDeclaration.parent.parent as ts.VariableStatement
    ) ||
    validator.body.statements.indexOf(
      contentsDeclaration.parent.parent as ts.VariableStatement
    ) >= validator.body.statements.indexOf(
      sourcesDeclaration.parent.parent as ts.VariableStatement
    )
  ) {
    return null;
  }

  const resolvedBindingScope = (identifier: ts.Identifier): ts.Node | null => {
    let current: ts.Node | undefined = identifier.parent;
    while (current !== undefined) {
      if (bindingsByScope.get(current)?.has(identifier.text) === true) {
        return current;
      }
      current = current.parent;
    }
    return null;
  };

  const isWithin = (node: ts.Node, ancestor: ts.Node): boolean => {
    let current: ts.Node | undefined = node;
    while (current !== undefined) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  };
  if (
    [...bindingsByScope].some(
      ([scope, bindings]) =>
        scope !== sourceFile &&
        isWithin(scope, validator) &&
        [...helperNames].some((helperName) => bindings.has(helperName))
    )
  ) {
    return null;
  }

  const protectedCallbackBindings = new Set(["source", "context"]);
  let hasCompetingCallbackBinding = false;
  const findCompetingCallbackBinding = (node: ts.Node): void => {
    if (hasCompetingCallbackBinding) return;
    if (
      ts.isVariableDeclaration(node) &&
      [...protectedCallbackBindings].some((name) =>
        bindingNameContains(node.name, name)
      )
    ) {
      hasCompetingCallbackBinding = true;
      return;
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      protectedCallbackBindings.has(node.name.text)
    ) {
      hasCompetingCallbackBinding = true;
      return;
    }
    if (
      isFunctionScope(node) &&
      node.parameters.some((parameter) =>
        [...protectedCallbackBindings].some((name) =>
          bindingNameContains(parameter.name, name)
        )
      )
    ) {
      hasCompetingCallbackBinding = true;
      return;
    }
    ts.forEachChild(node, findCompetingCallbackBinding);
  };
  findCompetingCallbackBinding(callback.body);
  if (hasCompetingCallbackBinding) return null;

  const protectedValidatorBindings = new Set(["snapshot", "context"]);
  let hasCompetingValidatorBinding = false;
  const findCompetingValidatorBinding = (node: ts.Node): void => {
    if (hasCompetingValidatorBinding) return;
    if (
      ts.isVariableDeclaration(node) &&
      [...protectedValidatorBindings].some((name) =>
        bindingNameContains(node.name, name)
      )
    ) {
      hasCompetingValidatorBinding = true;
      return;
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      protectedValidatorBindings.has(node.name.text)
    ) {
      hasCompetingValidatorBinding = true;
      return;
    }
    if (
      isFunctionScope(node) &&
      node !== validator &&
      node.parameters.some((parameter) =>
        [...protectedValidatorBindings].some((name) =>
          bindingNameContains(parameter.name, name)
        )
      )
    ) {
      hasCompetingValidatorBinding = true;
      return;
    }
    ts.forEachChild(node, findCompetingValidatorBinding);
  };
  findCompetingValidatorBinding(validator.body);
  if (hasCompetingValidatorBinding) return null;

  const referencesValidatorBinding = (node: ts.Node): boolean => {
    let found = false;
    const inspect = (candidate: ts.Node): void => {
      if (found) return;
      if (
        ts.isIdentifier(candidate) &&
        !isNonValueIdentifier(candidate) &&
        (candidate.text === "snapshot" || candidate.text === "context") &&
        resolvedBindingScope(candidate) === validator
      ) {
        found = true;
        return;
      }
      ts.forEachChild(candidate, inspect);
    };
    inspect(node);
    return found;
  };
  let hasValidatorParameterWrite = false;
  const findValidatorParameterWrite = (node: ts.Node): void => {
    if (hasValidatorParameterWrite) return;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      referencesValidatorBinding(node.left)
    ) {
      hasValidatorParameterWrite = true;
      return;
    }
    if (
      (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer) &&
      referencesValidatorBinding(node.initializer)
    ) {
      hasValidatorParameterWrite = true;
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      referencesValidatorBinding(node.operand)
    ) {
      hasValidatorParameterWrite = true;
      return;
    }
    ts.forEachChild(node, findValidatorParameterWrite);
  };
  findValidatorParameterWrite(validator.body);
  if (hasValidatorParameterWrite) return null;

  const recordDeclarations: ts.VariableDeclaration[] = [];
  const findRecord = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "record"
    ) {
      recordDeclarations.push(node);
    }
    ts.forEachChild(node, findRecord);
  };
  findRecord(callback.body);
  const recordDeclaration = recordDeclarations[0];
  const recordCall = recordDeclaration?.initializer;
  if (
    recordDeclarations.length !== 1 ||
    recordDeclaration === undefined ||
    !ts.isVariableDeclarationList(recordDeclaration.parent) ||
    (recordDeclaration.parent.flags & ts.NodeFlags.Const) === 0 ||
    recordCall === undefined ||
    !ts.isCallExpression(recordCall) ||
    recordCall.questionDotToken !== undefined ||
    (recordCall.typeArguments?.length ?? 0) !== 0 ||
    !ts.isIdentifier(recordCall.expression) ||
    recordCall.expression.text !== "exactRecord" ||
    recordCall.arguments.length !== 4 ||
    !ts.isIdentifier(recordCall.arguments[0]) ||
    recordCall.arguments[0].text !== "source" ||
    recordDeclaration.parent.parent.parent !== callback.body
  ) {
    return null;
  }
  const required = unwrapExpression(recordCall.arguments[1]);
  const optional = unwrapExpression(recordCall.arguments[2]);
  const signalPath = expressionPath(recordCall.arguments[3]);
  if (
    !ts.isArrayLiteralExpression(required) ||
    required.elements.length !== SANITIZER_RAW_SOURCE_KEYS.length ||
    !required.elements.every(
      (element, index) =>
        ts.isStringLiteral(element) &&
        element.text === SANITIZER_RAW_SOURCE_KEYS[index]
    ) ||
    !ts.isArrayLiteralExpression(optional) ||
    optional.elements.length !== 0 ||
    signalPath?.join(".") !== "context.signal"
  ) {
    return null;
  }

  let validUses = true;
  let sourceIdGet: ts.CallExpression | null = null;
  let sourceIdGetLiteral: ts.StringLiteral | null = null;
  const allowedCallbackModuleBindings = new Set([
    "exactRecord",
    "protocolString",
    "validateFrozenDenseByteMetadata",
    "SOURCE_HANDLE",
    "SOURCE_TYPES",
    "fail",
    "cloneJson"
  ]);
  const isApprovedContextUse = (identifier: ts.Identifier): boolean => {
    const parent = identifier.parent;
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === identifier &&
      parent.name.text === "signal"
    ) {
      const call = parent.parent;
      if (
        ts.isCallExpression(call) &&
        call.questionDotToken === undefined &&
        (call.typeArguments?.length ?? 0) === 0
      ) {
        if (call === recordCall && call.arguments[3] === parent) return true;
        if (
          call.arguments.length === 2 &&
          call.arguments[1] === parent &&
          ts.isIdentifier(call.expression) &&
          call.expression.text === "validateFrozenDenseByteMetadata"
        ) {
          return true;
        }
      }
      return false;
    }
    if (
      ts.isCallExpression(parent) &&
      parent.questionDotToken === undefined &&
      (parent.typeArguments?.length ?? 0) === 0 &&
      parent.arguments.length === 2 &&
      parent.arguments[1] === identifier &&
      ts.isIdentifier(parent.expression) &&
      (parent.expression.text === "protocolString" ||
        parent.expression.text === "cloneJson")
    ) {
      return true;
    }
    return false;
  };
  const inspectUses = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && !isNonValueIdentifier(node)) {
      const bindingScope = resolvedBindingScope(node);
      if (
        node.text === "arguments" ||
        (bindingScope === sourceFile &&
          !allowedCallbackModuleBindings.has(node.text)) ||
        (node.text === "context" &&
          (bindingScope !== validator || !isApprovedContextUse(node))) ||
        ((bindingScope === validator || bindingScope === validator.body) &&
          !(node.text === "context" && bindingScope === validator))
      ) {
        validUses = false;
      }
      if (
        node.text === "source" &&
        (bindingScope !== callback ||
          !(node.parent === recordCall && recordCall.arguments[0] === node))
      ) {
        validUses = false;
      }
      if (node.text === "record") {
        const access = node.parent;
        const call =
          ts.isPropertyAccessExpression(access) &&
          ts.isCallExpression(access.parent)
            ? access.parent
            : null;
        const key = call?.arguments[0];
        if (
          !ts.isPropertyAccessExpression(access) ||
          access.expression !== node ||
          access.name.text !== "get" ||
          call === null ||
          call.expression !== access ||
          call.arguments.length !== 1 ||
          key === undefined ||
          !ts.isStringLiteral(key) ||
          !SANITIZER_RAW_SOURCE_KEYS.includes(key.text as never)
        ) {
          validUses = false;
        } else if (key.text === "source_id") {
          if (sourceIdGet !== null) validUses = false;
          sourceIdGet = call;
          sourceIdGetLiteral = key;
        }
      }
    }
    ts.forEachChild(node, inspectUses);
  };
  inspectUses(callback.body);

  const validation = sourceIdGet?.parent;
  if (
    !validUses ||
    sourceIdGet === null ||
    sourceIdGetLiteral === null ||
    !ts.isCallExpression(validation) ||
    validation.questionDotToken !== undefined ||
    (validation.typeArguments?.length ?? 0) !== 0 ||
    validation.arguments.length !== 2 ||
    validation.arguments[0] !== sourceIdGet ||
    !ts.isIdentifier(validation.expression) ||
    validation.expression.text !== "protocolString" ||
    !ts.isIdentifier(validation.arguments[1]) ||
    validation.arguments[1].text !== "context" ||
    !ts.isExpressionStatement(validation.parent) ||
    validation.parent.expression !== validation ||
    validation.parent.parent !== callback.body
  ) {
    return null;
  }

  const recordStatement = recordDeclaration.parent.parent as ts.VariableStatement;
  const validationStatement = validation.parent;
  const recordIndex = callback.body.statements.indexOf(recordStatement);
  const validationIndex = callback.body.statements.indexOf(validationStatement);
  if (recordIndex < 0 || validationIndex <= recordIndex) return null;

  let returnBeforeValidation = false;
  const findCallbackReturn = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) {
      returnBeforeValidation = true;
      return;
    }
    if (node !== callback && ts.isFunctionLike(node)) return;
    ts.forEachChild(node, findCallbackReturn);
  };
  for (const statement of callback.body.statements.slice(0, validationIndex)) {
    findCallbackReturn(statement);
  }
  if (returnBeforeValidation) return null;

  const validatorReturns: ts.ReturnStatement[] = [];
  const findValidatorReturns = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) {
      validatorReturns.push(node);
      return;
    }
    if (node !== validator.body && ts.isFunctionLike(node)) return;
    ts.forEachChild(node, findValidatorReturns);
  };
  findValidatorReturns(validator.body);
  const validatorReturn = validatorReturns[0];
  const returnedValue =
    validatorReturn?.expression === undefined
      ? undefined
      : unwrapExpression(validatorReturn.expression);
  if (
    validatorReturns.length !== 1 ||
    validatorReturn === undefined ||
    validatorReturn.parent !== validator.body ||
    validator.body.statements.at(-1) !== validatorReturn ||
    returnedValue === undefined ||
    !ts.isObjectLiteralExpression(returnedValue)
  ) {
    return null;
  }
  const returnedSources = returnedValue.properties.filter((property) => {
    const name = property.name;
    return name !== undefined && ts.isIdentifier(name) && name.text === "sources";
  });
  if (
    returnedSources.length !== 1 ||
    !ts.isShorthandPropertyAssignment(returnedSources[0]) ||
    returnedValue.properties.at(-1) !== returnedSources[0]
  ) {
    return null;
  }
  const allowedSourcesIdentifiers = new Set<ts.Identifier>([
    sourcesDeclaration.name as ts.Identifier,
    returnedSources[0].name
  ]);
  let hasUnexpectedSourcesUse = false;
  const findSourcesUse = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node.text === "sources" &&
      !allowedSourcesIdentifiers.has(node)
    ) {
      hasUnexpectedSourcesUse = true;
      return;
    }
    ts.forEachChild(node, findSourcesUse);
  };
  findSourcesUse(validator.body);
  if (hasUnexpectedSourcesUse) return null;

  const originalSnapshotUses = returnedValue.properties.flatMap((property) => {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isIdentifier(property.name) ||
      property.name.text !== "original"
    ) {
      return [];
    }
    const value = unwrapExpression(property.initializer);
    return ts.isIdentifier(value) && value.text === "snapshot" ? [value] : [];
  });
  const allowedSnapshotUses = new Set<ts.Identifier>([
    outerCall.arguments[0] as ts.Identifier,
    ...originalSnapshotUses
  ]);
  const outerGetConsumers = new Map([
    ["request_id", "protocolString"],
    ["evaluation_mode", "protocolString"],
    ["canonical_request_sha256", "protocolString"],
    ["stage", "protocolString"],
    ["profile", "ownDataValue"],
    ["tool_request", "exactRecord"]
  ]);
  const isAllowedOuterUse = (identifier: ts.Identifier): boolean => {
    if (resolvedBindingScope(identifier) !== validator.body) return false;
    const access = identifier.parent;
    if (
      !ts.isPropertyAccessExpression(access) ||
      access.expression !== identifier
    ) {
      return false;
    }
    const call = access.parent;
    if (
      !ts.isCallExpression(call) ||
      call.expression !== access ||
      call.questionDotToken !== undefined ||
      (call.typeArguments?.length ?? 0) !== 0 ||
      call.arguments.length !== 1 ||
      !ts.isStringLiteral(call.arguments[0])
    ) {
      return false;
    }
    const key = call.arguments[0].text;
    if (access.name.text === "has") return key === "tool_request";
    if (access.name.text !== "get") return false;
    if (key === "contents") {
      return call === contentsGet && contentsCall.arguments[0] === call;
    }
    const consumer = call.parent;
    const expectedConsumer = outerGetConsumers.get(key);
    return (
      expectedConsumer !== undefined &&
      ts.isCallExpression(consumer) &&
      consumer.arguments.includes(call) &&
      ts.isIdentifier(consumer.expression) &&
      consumer.expression.text === expectedConsumer
    );
  };
  const isAllowedContentsUse = (identifier: ts.Identifier): boolean => {
    if (resolvedBindingScope(identifier) !== validator.body) return false;
    if (identifier === mapCall.expression.expression) return true;
    const access = identifier.parent;
    return (
      ts.isPropertyAccessExpression(access) &&
      access.expression === identifier &&
      access.name.text === "length"
    );
  };
  let hasUnexpectedRawBindingUse = false;
  const findUnexpectedRawBindingUse = (node: ts.Node): void => {
    if (hasUnexpectedRawBindingUse) return;
    if (ts.isIdentifier(node) && !isNonValueIdentifier(node)) {
      if (
        node.text === "snapshot" &&
        resolvedBindingScope(node) === validator &&
        !allowedSnapshotUses.has(node)
      ) {
        hasUnexpectedRawBindingUse = true;
        return;
      }
      if (
        node.text === "outer" &&
        !isAllowedOuterUse(node)
      ) {
        hasUnexpectedRawBindingUse = true;
        return;
      }
      if (
        node.text === "contents" &&
        !isAllowedContentsUse(node)
      ) {
        hasUnexpectedRawBindingUse = true;
        return;
      }
    }
    ts.forEachChild(node, findUnexpectedRawBindingUse);
  };
  findUnexpectedRawBindingUse(validator.body);
  if (hasUnexpectedRawBindingUse) return null;

  const isTypeOnlyIdentifier = (identifier: ts.Identifier): boolean => {
    let current: ts.Node | undefined = identifier.parent;
    while (current !== undefined) {
      if (
        ts.isTypeNode(current) ||
        ts.isInterfaceDeclaration(current) ||
        ts.isTypeAliasDeclaration(current) ||
        ts.isTypeParameterDeclaration(current) ||
        ts.isPropertySignature(current) ||
        ts.isMethodSignature(current)
      ) {
        return true;
      }
      if (ts.isImportSpecifier(current) || ts.isExportSpecifier(current)) {
        if (current.isTypeOnly) return true;
      }
      if (ts.isImportClause(current)) return current.isTypeOnly;
      current = current.parent;
    }
    return false;
  };
  let hasUnexpectedSourceIdIdentifier = false;
  const findSourceIdIdentifier = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node.text === "source_id" &&
      !isTypeOnlyIdentifier(node)
    ) {
      hasUnexpectedSourceIdIdentifier = true;
      return;
    }
    ts.forEachChild(node, findSourceIdIdentifier);
  };
  findSourceIdIdentifier(sourceFile);
  if (hasUnexpectedSourceIdIdentifier) return null;

  const literals: ts.StringLiteral[] = [];
  const findSourceIdLiterals = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) && node.text === "source_id") literals.push(node);
    ts.forEachChild(node, findSourceIdLiterals);
  };
  findSourceIdLiterals(sourceFile);
  const requiredLiteral = required.elements[1];
  return literals.length === 2 &&
    ts.isStringLiteral(requiredLiteral) &&
    literals.includes(requiredLiteral) &&
    literals.includes(sourceIdGetLiteral)
    ? new Set(literals)
    : null;
}

function analyzeSource(source: SourceRecord, roots: ScanRoots = ROOTS): SourceAnalysis {
  const sourceFile = ts.createSourceFile(
    source.path,
    source.text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const edges: ImportEdge[] = [];
  const violations: string[] = sourceFile.parseDiagnostics.map((diagnostic) => {
    const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    return `${displayPath(source.path, roots)}:${location.line + 1}:${location.character + 1}: TypeScript parse error ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
  });
  const bindingsByScope = new Map<ts.Node, Set<string>>();
  const immutableTopLevelBindings = new Map<string, ts.Expression>();
  const topLevelBindingInitializers = new Map<string, ts.Expression>();
  const bindingsFor = (scope: ts.Node): Set<string> => {
    const existing = bindingsByScope.get(scope);
    if (existing !== undefined) {
      return existing;
    }
    const bindings = new Set<string>();
    bindingsByScope.set(scope, bindings);
    return bindings;
  };
  const addIdentifierBinding = (scope: ts.Node, name: ts.Identifier): void => {
    bindingsFor(scope).add(name.text);
  };
  const collectBindings = (node: ts.Node): void => {
    if (node !== sourceFile && isAmbientContext(node)) {
      return;
    }
    if (
      ts.isImportDeclaration(node) &&
      node.importClause !== undefined &&
      !node.importClause.isTypeOnly
    ) {
      if (node.importClause.name !== undefined) {
        addIdentifierBinding(sourceFile, node.importClause.name);
      }
      const namedBindings = node.importClause.namedBindings;
      if (namedBindings !== undefined) {
        if (ts.isNamespaceImport(namedBindings)) {
          addIdentifierBinding(sourceFile, namedBindings.name);
        } else {
          for (const specifier of namedBindings.elements) {
            if (!specifier.isTypeOnly) {
              addIdentifierBinding(sourceFile, specifier.name);
            }
          }
        }
      }
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      addIdentifierBinding(sourceFile, node.name);
    }

    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name !== undefined &&
      !hasModifier(node, ts.SyntaxKind.DeclareKeyword)
    ) {
      addIdentifierBinding(nearestScope(node.parent, isLexicalScope), node.name);
    }
    if (
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name !== undefined
    ) {
      addIdentifierBinding(node, node.name);
    }
    if (isFunctionScope(node) && node.body !== undefined) {
      for (const parameter of node.parameters) {
        addBindingNames(parameter.name, bindingsFor(node));
      }
    }
    if (ts.isVariableDeclaration(node)) {
      if (ts.isVariableDeclarationList(node.parent)) {
        const variableStatement = node.parent.parent;
        if (
          ts.isVariableStatement(variableStatement) &&
          hasModifier(variableStatement, ts.SyntaxKind.DeclareKeyword)
        ) {
          ts.forEachChild(node, collectBindings);
          return;
        }
        const isBlockScoped =
          (node.parent.flags & ts.NodeFlags.BlockScoped) !== 0;
        const scope = isBlockScoped
          ? nearestScope(node.parent.parent, isLexicalScope)
          : nearestScope(
              node.parent.parent,
              (candidate) =>
                ts.isSourceFile(candidate) || isFunctionScope(candidate)
            );
        addBindingNames(node.name, bindingsFor(scope));
      } else if (ts.isCatchClause(node.parent)) {
        addBindingNames(node.name, bindingsFor(node.parent));
      }
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(sourceFile);

  let allowedSourceIdLiterals: ReadonlySet<ts.StringLiteralLike> = new Set();
  if (source.enforceSanitizerSourceOwner === true) {
    const inspected =
      source.path === roots.deterministicSanitizer
        ? inspectSanitizerSourceOwner(sourceFile, bindingsByScope)
        : null;
    if (inspected === null) {
      violations.push(
        `${displayPath(source.path, roots)}: sanitizer raw-source ownership is invalid`
      );
    } else {
      allowedSourceIdLiterals = inspected;
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer !== undefined
        ) {
          topLevelBindingInitializers.set(
            declaration.name.text,
            declaration.initializer
          );
          if (
            (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
          ) {
            immutableTopLevelBindings.set(
              declaration.name.text,
              declaration.initializer
            );
          }
        }
      }
    }
  }

  const isIdentifierShadowed = (identifier: ts.Identifier): boolean => {
    let current: ts.Node | undefined = identifier.parent;
    while (current !== undefined) {
      if (bindingsByScope.get(current)?.has(identifier.text) === true) {
        return true;
      }
      current = current.parent;
    }
    return false;
  };
  const expressionReferencesBinding = (
    expression: ts.Expression,
    bindingNames: ReadonlySet<string>
  ): boolean => {
    let referencesBinding = false;
    const inspect = (node: ts.Node): void => {
      if (referencesBinding) {
        return;
      }
      if (ts.isIdentifier(node) && bindingNames.has(node.text)) {
        if (!isNonValueIdentifier(node)) {
          referencesBinding = true;
          return;
        }
      }
      ts.forEachChild(node, inspect);
    };
    inspect(expression);
    return referencesBinding;
  };

  const addEdge = (
    kind: EdgeKind,
    moduleExpression: ts.Expression | undefined,
    importedNames: readonly string[] = [],
    hasImportAlias = false
  ): void => {
    const rawEdge = {
      sourcePath: source.path,
      kind,
      moduleSpecifier:
        moduleExpression !== undefined && ts.isStringLiteralLike(moduleExpression)
          ? moduleExpression.text
          : null,
      importedNames,
      hasImportAlias
    };
    const resolution = resolveRelativeEdge(rawEdge, roots);
    edges.push(resolution.edge);
    violations.push(...resolution.violations);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const imports = importedNamesFor(statement);
      addEdge(
        "static-import",
        statement.moduleSpecifier,
        imports.names,
        imports.hasAlias
      );
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      addEdge(
        statement.exportClause === undefined
          ? "export-star"
          : ts.isNamespaceExport(statement.exportClause)
            ? "export-namespace"
            : "export-from",
        statement.moduleSpecifier
      );
      continue;
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference)
    ) {
      addEdge("import-equals", statement.moduleReference.expression);
    }
  }

  const isApprovedSanitizerImportEdge = (edge: ImportEdge): boolean =>
    source.path === roots.deterministicSanitizer &&
    edge.kind === "static-import" &&
    edge.resolvedPath === roots.sanitizedBoundary &&
    edge.importedNames.length === 1 &&
    edge.importedNames[0] === SANITIZER_HELPER &&
    !edge.hasImportAlias;

  if (source.path === roots.deterministicSanitizer) {
    const reportDeterministicSanitizerExport = (node: ts.Node): void => {
      violations.push(
        `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: deterministic sanitizer export is forbidden outside ${SANITIZER_VERSION_EXPORT} and ${SANITIZER_FACTORY_EXPORT}`
      );
    };
    for (const statement of sourceFile.statements) {
      if (
        ts.isExportDeclaration(statement) ||
        ts.isExportAssignment(statement)
      ) {
        reportDeterministicSanitizerExport(statement);
        continue;
      }
      if (!hasExportModifier(statement)) {
        continue;
      }
      const versionInitializer =
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.length === 1
          ? statement.declarationList.declarations[0].initializer
          : undefined;
      const unwrappedVersionInitializer =
        versionInitializer === undefined
          ? undefined
          : unwrapExpression(versionInitializer);
      const isAllowedVersionExport =
        ts.isVariableStatement(statement) &&
        !hasModifier(statement, ts.SyntaxKind.DefaultKeyword) &&
        !hasModifier(statement, ts.SyntaxKind.DeclareKeyword) &&
        (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
        statement.declarationList.declarations.length === 1 &&
        ts.isIdentifier(statement.declarationList.declarations[0].name) &&
        statement.declarationList.declarations[0].name.text ===
          SANITIZER_VERSION_EXPORT &&
        unwrappedVersionInitializer !== undefined &&
        ts.isStringLiteral(unwrappedVersionInitializer) &&
        unwrappedVersionInitializer.text === SANITIZER_VERSION_VALUE;
      const isAllowedFactoryExport =
        ts.isFunctionDeclaration(statement) &&
        !hasModifier(statement, ts.SyntaxKind.DefaultKeyword) &&
        !hasModifier(statement, ts.SyntaxKind.DeclareKeyword) &&
        statement.name?.text === SANITIZER_FACTORY_EXPORT;
      if (!isAllowedVersionExport && !isAllowedFactoryExport) {
        reportDeterministicSanitizerExport(statement);
      }
    }
  }

  if (edges.some(isApprovedSanitizerImportEdge)) {
    const taintedBindings = new Set<string>([SANITIZER_HELPER]);
    let discoveredBinding = true;
    while (discoveredBinding) {
      discoveredBinding = false;
      for (const [name, initializer] of topLevelBindingInitializers) {
        if (
          !taintedBindings.has(name) &&
          expressionReferencesBinding(initializer, taintedBindings)
        ) {
          taintedBindings.add(name);
          discoveredBinding = true;
        }
      }
    }

    const reportSanitizerHelperExport = (node: ts.Node): void => {
      violations.push(
        `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: sanitizer helper must not be re-exported`
      );
    };
    for (const statement of sourceFile.statements) {
      if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier === undefined &&
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some((specifier) =>
          taintedBindings.has((specifier.propertyName ?? specifier.name).text)
        )
      ) {
        reportSanitizerHelperExport(statement);
      } else if (
        ts.isExportAssignment(statement) &&
        expressionReferencesBinding(statement.expression, taintedBindings)
      ) {
        reportSanitizerHelperExport(statement);
      } else if (
        ts.isVariableStatement(statement) &&
        hasExportModifier(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            declaration.initializer !== undefined &&
            expressionReferencesBinding(
              declaration.initializer,
              taintedBindings
            )
        )
      ) {
        reportSanitizerHelperExport(statement);
      }
    }
  }

  const globalCapabilityPath = (
    expression: ts.Expression
  ): readonly string[] | null => {
    const path = expressionPath(expression);
    const rootIdentifier = expressionRootIdentifierNode(expression);
    if (
      path === null ||
      rootIdentifier === null ||
      isIdentifierShadowed(rootIdentifier)
    ) {
      return null;
    }
    if (path[0] === "globalThis" || path[0] === "global") {
      return path.slice(1);
    }
    return DIRECT_GLOBAL_CAPABILITIES.has(path[0] ?? "") ? path : null;
  };

  const checkProductionCapabilityPath = (
    expression: ts.Expression,
    node: ts.Node,
    usage: "call" | "construct" | "reference"
  ): void => {
    if (source.tree !== "production") {
      return;
    }
    const rawPath = expressionPath(expression);
    const globalPath = globalCapabilityPath(expression);
    if (globalPath === null) {
      return;
    }
    const hasExplicitGlobalRoot =
      rawPath?.[0] === "globalThis" || rawPath?.[0] === "global";
    if (
      hasExplicitGlobalRoot &&
      (globalPath.length === 0 ||
        globalPath[0] === "globalThis" ||
        globalPath[0] === "global")
    ) {
      violations.push(
        `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: first-class global capability ${rawPath[0]} is forbidden`
      );
      return;
    }
    if (
      hasExplicitGlobalRoot &&
      !DIRECT_GLOBAL_CAPABILITIES.has(globalPath[0] ?? "")
    ) {
      violations.push(
        `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: unapproved direct global capability ${globalPath[0]} is forbidden`
      );
      return;
    }
    if (
      (globalPath[0] === "eval" || globalPath[0] === "Function") &&
      globalPath.length >= 1
    ) {
      violations.push(
        `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: dynamic code execution via ${globalPath[0]} is forbidden`
      );
    }
    if (
      NETWORK_GLOBALS.has(globalPath[0] ?? "") &&
      source.path !== roots.httpTransport
    ) {
      violations.push(
        `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: network capability ${globalPath[0]} is allowed only in http-transport.ts`
      );
    }
    if (globalPath[0] === "process") {
      if (globalPath[1] === "getBuiltinModule") {
        violations.push(
          `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: process.getBuiltinModule is forbidden`
        );
      } else if (globalPath[1] === "env") {
        if (source.path !== roots.productionConfig) {
          violations.push(
            `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: process.env is allowed only in production-config.ts`
          );
        }
      } else {
        violations.push(
          `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: process capability is forbidden outside process.env in production-config.ts`
        );
      }
    }
    if (globalPath[0] === "require") {
      if (globalPath.length > 1) {
        violations.push(
          `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: require member access is forbidden`
        );
      } else if (usage !== "call") {
        violations.push(
          `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: first-class global capability require is forbidden`
        );
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression);
      const path = globalCapabilityPath(expression);
      const isRequire = path?.length === 1 && path[0] === "require";
      if (isRequire) {
        addEdge(
          "require",
          node.arguments.length === 1 ? node.arguments[0] : undefined
        );
      } else if (expression.kind === ts.SyntaxKind.ImportKeyword) {
        addEdge(
          "dynamic-import",
          node.arguments.length === 1 ? node.arguments[0] : undefined
        );
        if (source.tree === "production") {
          violations.push(
            `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: dynamic import is forbidden`
          );
        }
      } else if (path?.[0] === "process" && path[1] === "getBuiltinModule") {
        addEdge(
          "process-get-builtin-module",
          node.arguments.length === 1 ? node.arguments[0] : undefined
        );
      }
      checkProductionCapabilityPath(expression, node, "call");
    }
    if (ts.isNewExpression(node)) {
      checkProductionCapabilityPath(node.expression, node, "construct");
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const parent = node.parent;
      const isNestedBase =
        (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
        parent.expression === node;
      const accessedProperty = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : node.argumentExpression === undefined
          ? null
          : foldStaticString(
              node.argumentExpression,
              immutableTopLevelBindings
            );
      if (source.tree === "production" && accessedProperty === "constructor") {
        violations.push(
          `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: constructor capability access is forbidden`
        );
      }
      if (
        source.tree === "production" &&
        ts.isElementAccessExpression(node) &&
        node.argumentExpression !== undefined &&
        foldStaticString(node.argumentExpression) === null &&
        [
          "globalThis",
          "global",
          ...DIRECT_GLOBAL_CAPABILITIES
        ].includes(expressionRootIdentifier(node) ?? "") &&
        expressionRootIdentifierNode(node) !== null &&
        !isIdentifierShadowed(expressionRootIdentifierNode(node)!)
      ) {
        const root = expressionRootIdentifier(node);
        violations.push(
          `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: ${root === "eval" || root === "Function" ? `dynamic code execution via ${root}` : `unresolved computed capability access rooted at ${root}`} is forbidden`
        );
      }
      const isInvocationTarget =
        (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
        parent.expression === node;
      if (!isNestedBase && !isInvocationTarget) {
        checkProductionCapabilityPath(node, node, "reference");
      }
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isPathComponent =
        ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
          (parent.expression === node || parent.name === node)) ||
        (ts.isCallExpression(parent) && parent.expression === node) ||
        (ts.isNewExpression(parent) && parent.expression === node) ||
        (ts.isBindingElement(parent) &&
          (parent.name === node || parent.propertyName === node));
      if (!isPathComponent && !isNonValueIdentifier(node)) {
        checkProductionCapabilityPath(node, node, "reference");
      }
    }
    if (
      source.tree === "production" &&
      ((ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
        ts.isTemplateExpression(node))
    ) {
      const foldedString = foldStaticString(node, immutableTopLevelBindings);
      if (
        foldedString !== null &&
        FORBIDDEN_BENCHMARK_ORACLE_LITERAL.test(foldedString)
      ) {
        violations.push(
          `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: benchmark source or revision literal ${JSON.stringify(foldedString)} is forbidden`
        );
      }
    }
    if (
      source.tree === "production" &&
      ts.isStringLiteralLike(node) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isExportDeclaration(node.parent) &&
      FORBIDDEN_BENCHMARK_ORACLE_LITERAL.test(node.text)
    ) {
      violations.push(
        `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: benchmark source or revision literal ${JSON.stringify(node.text)} is forbidden`
      );
    } else if (
      source.tree === "production" &&
      ts.isStringLiteralLike(node) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isExportDeclaration(node.parent) &&
      !allowedSourceIdLiterals.has(node) &&
      FORBIDDEN_ORACLE_LITERAL.test(node.text)
    ) {
      violations.push(
        `${displayPath(source.path, roots)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: oracle fixture/source/record literal ${JSON.stringify(node.text)} is forbidden`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (source.tree === "production" && FORBIDDEN_ORACLE_FIELD.test(source.text)) {
    violations.push(
      `${displayPath(source.path, roots)}: oracle field name ${source.text.match(FORBIDDEN_ORACLE_FIELD)?.[0]} is forbidden`
    );
  }

  for (const edge of edges) {
    const specifier = edge.moduleSpecifier;
    if (
      source.tree === "core" &&
      ((edge.resolvedPath !== null && isWithin(roots.productionRoot, edge.resolvedPath)) ||
        (specifier !== null && /security-production/iu.test(specifier)))
    ) {
      violations.push(
        `${edgeLabel(edge, roots)}: frozen security core must never import production`
      );
    }
    if (source.tree !== "production" || specifier === null) {
      continue;
    }
    if (FORBIDDEN_BENCHMARK_ORACLE_LITERAL.test(specifier)) {
      violations.push(
        `${edgeLabel(edge, roots)}: benchmark source or revision module reference is forbidden`
      );
    }
    if (edge.kind === "process-get-builtin-module") {
      continue;
    }
    if (FORBIDDEN_ORACLE_IMPORT.test(specifier)) {
      violations.push(`${edgeLabel(edge, roots)}: benchmark or Track 1 oracle import is forbidden`);
    }
    if (!specifier.startsWith(".") && !specifier.startsWith("file:") &&
        !isAbsolute(specifier) && !WINDOWS_ABSOLUTE_PATH.test(specifier)) {
      if (
        source.path !== roots.httpTransport ||
        !ALLOWED_TRANSPORT_MODULES.has(specifier)
      ) {
        const capability = NETWORK_MODULES.has(specifier)
          ? "network module"
          : "module alias";
        violations.push(
          `${edgeLabel(edge, roots)}: ${capability} ${specifier} is forbidden outside the closed http-transport.ts allowlist`
        );
      }
      continue;
    }
    if (edge.resolvedPath === null) {
      continue;
    }
    if (isWithin(roots.productionRoot, edge.resolvedPath)) {
      continue;
    }
    if (edge.resolvedPath === roots.securityIndex) {
      continue;
    }
    if (!isApprovedSanitizerImportEdge(edge)) {
      violations.push(
        `${edgeLabel(edge, roots)}: production may import the core only through security/index.ts; the sole deep-import exception is ${SANITIZER_HELPER} in deterministic-sanitizer.ts`
      );
    }
  }

  return { edges, violations };
}

function analyzeActualBoundary(): readonly string[] {
  const coreInventory = listTypeScriptSources(SECURITY_ROOT, "core");
  const productionInventory = listTypeScriptSources(PRODUCTION_ROOT, "production");
  return [
    ...coreInventory.violations,
    ...productionInventory.violations,
    ...coreInventory.sources.flatMap((source) => analyzeSource(source).violations),
    ...productionInventory.sources.flatMap((source) => analyzeSource(source).violations)
  ];
}

function analyzeProductionMutation(
  relativePath: string,
  text: string,
  roots: ScanRoots = ROOTS
): SourceAnalysis {
  return analyzeSource(
    {
      path: join(roots.productionRoot, relativePath),
      text,
      tree: "production"
    },
    roots
  );
}

const SANITIZER_RAW_SOURCE_KEYS = [
  "source_handle", "source_id", "source_type", "media_type",
  "authority_kind", "value", "provenance_ref", "original_utf8_bytes",
  "original_value_sha256", "comparison_value", "trust_class"
] as const;

interface SanitizerOwnerFixtureOptions {
  readonly beforeFunction?: string;
  readonly exactRecordHelper?: string;
  readonly denseArrayHelper?: string;
  readonly protocolStringHelper?: string;
  readonly functionName?: string;
  readonly snapshotParameter?: string;
  readonly contextParameter?: string;
  readonly callbackParameter?: string;
  readonly mapMethod?: string;
  readonly outerInitializer?: string;
  readonly contentsInitializer?: string;
  readonly sourceIdRequired?: string;
  readonly callbackBeforeRecord?: string;
  readonly callbackBeforeValidation?: string;
  readonly callbackAfterRecord?: string;
  readonly callbackBody?: string;
  readonly deadDecoyMap?: boolean;
  readonly recordCallee?: string;
  readonly validation?: string;
  readonly validatorBeforeOuter?: string;
  readonly validatorAfterOuter?: string;
  readonly validatorReturn?: string;
  readonly afterFunction?: string;
}

const SANITIZER_OWNER_EXACT_RECORD_HELPER = `
function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  signal: AbortSignal
): ReadonlyMap<string, unknown> {
  void value;
  void required;
  void optional;
  void signal;
  return new Map();
}`;

const SANITIZER_OWNER_PROTOCOL_STRING_HELPER = `
function protocolString(value: unknown, context: unknown): string {
  void context;
  return value as string;
}`;

const SANITIZER_OWNER_DENSE_ARRAY_HELPER = `
function denseArray(value: unknown, signal: AbortSignal): readonly unknown[] {
  void signal;
  return value as readonly unknown[];
}`;

function sanitizerOwnerFixture(
  options: SanitizerOwnerFixtureOptions = {}
): string {
  const requiredKeys = SANITIZER_RAW_SOURCE_KEYS.map((key) =>
    key === "source_id"
      ? (options.sourceIdRequired ?? JSON.stringify(key))
      : JSON.stringify(key)
  ).join(", ");
  const callbackBody = options.callbackBody ?? `
    ${options.callbackBeforeRecord ?? ""}
    const record = ${options.recordCallee ?? "exactRecord"}(source, [${requiredKeys}], [], context.signal);
    ${options.callbackBeforeValidation ?? ""}
    ${options.validation ?? 'protocolString(record.get("source_id"), context);'}
    ${options.callbackAfterRecord ?? ""}
    return {};`;
  const mapExpression = `contents.${options.mapMethod ?? "map"}((${options.callbackParameter ?? "source"}) => {${callbackBody}
  })`;
  return `${options.exactRecordHelper ?? SANITIZER_OWNER_EXACT_RECORD_HELPER}
${options.denseArrayHelper ?? SANITIZER_OWNER_DENSE_ARRAY_HELPER}
${options.protocolStringHelper ?? SANITIZER_OWNER_PROTOCOL_STRING_HELPER}
${options.beforeFunction ?? ""}
function ${options.functionName ?? "validateSnapshot"}(${options.snapshotParameter ?? "snapshot: unknown"}, ${options.contextParameter ?? "context: any"}): unknown {
  ${options.validatorBeforeOuter ?? ""}
  const outer = ${options.outerInitializer ?? 'exactRecord(snapshot, ["contents"], [], context.signal)'};
  ${options.validatorAfterOuter ?? ""}
  const contents = ${options.contentsInitializer ?? 'denseArray(outer.get("contents"), context.signal)'};
  const sources = ${options.deadDecoyMap === true ? `false ? ${mapExpression} : []` : mapExpression};
  ${options.validatorReturn ?? "return { sources };"}
}
${options.afterFunction ?? ""}`;
}

function analyzeSanitizerOwnerFixture(
  options: SanitizerOwnerFixtureOptions = {},
  relativePath = "deterministic-sanitizer.ts"
): SourceAnalysis {
  return analyzeSource({
    path: join(PRODUCTION_ROOT, relativePath),
    text: sanitizerOwnerFixture(options),
    tree: "production",
    enforceSanitizerSourceOwner: true
  });
}

function assertSanitizerOwnerViolation(analysis: SourceAnalysis): void {
  assert.ok(
    analysis.violations.some((violation) =>
      violation.includes("sanitizer raw-source ownership is invalid")
    ),
    `expected deterministic sanitizer owner violation, received:\n${analysis.violations.join("\n")}`
  );
}

test("REQ-SBX-GENERAL-002 production boundary has an isolated source root", () => {
  assert.equal(
    existsSync(PRODUCTION_ROOT),
    true,
    `missing exact production root: ${displayPath(PRODUCTION_ROOT)}`
  );
  assert.equal(
    existsSync(join(PRODUCTION_ROOT, ".gitkeep")),
    true,
    `missing exact production root marker: ${displayPath(join(PRODUCTION_ROOT, ".gitkeep"))}`
  );
});

test("REQ-SBX-GENERAL-002 actual core and production trees satisfy the permanent boundary gate", () => {
  const violations = analyzeActualBoundary();
  assert.deepEqual(violations, [], violations.join("\n"));
});

for (const mutation of [
  {
    name: "a nonliteral required source_id key",
    options: {
      beforeFunction: 'const SOURCE_ID_FIELD = "source_" + "id";',
      sourceIdRequired: "SOURCE_ID_FIELD"
    }
  },
  {
    name: "a missing validateSnapshot function",
    options: { functionName: "validateRawSnapshot" }
  },
  {
    name: "a wrong contents map shape",
    options: { mapMethod: "filter" }
  },
  {
    name: "a local protocolString shadow",
    options: { callbackBeforeRecord: "const protocolString = () => undefined;" }
  },
  {
    name: "a local exactRecord shadow",
    options: { callbackBeforeRecord: "const exactRecord = () => new Map();" }
  },
  {
    name: "an early callback return before source_id validation",
    options: { callbackBeforeValidation: "return {};" }
  },
  {
    name: "source_id validation in a dead callback block",
    options: {
      callbackBody: `
        if (false) {
          const record = exactRecord(source, [${SANITIZER_RAW_SOURCE_KEYS.map(JSON.stringify).join(", ")}], [], context.signal);
          protocolString(record.get("source_id"), context);
        }
        return {};`
    }
  },
  {
    name: "a conditionally dead decoy contents map",
    options: { deadDecoyMap: true }
  },
  {
    name: "a decoy outer record",
    options: { outerInitializer: "new Map([[\"contents\", []]])" }
  },
  {
    name: "contents not derived from outer.get",
    options: { contentsInitializer: "[]" }
  },
  {
    name: "a missing module denseArray helper",
    options: { denseArrayHelper: "" }
  },
  {
    name: "a local denseArray shadow",
    options: {
      validatorBeforeOuter:
        "const denseArray = (_value: unknown, _signal: AbortSignal) => [];"
    }
  },
  {
    name: "a reassigned denseArray helper",
    options: { beforeFunction: "denseArray = () => [];" }
  },
  {
    name: "a missing module exactRecord helper",
    options: { exactRecordHelper: "" }
  },
  {
    name: "a missing module protocolString helper",
    options: { protocolStringHelper: "" }
  },
  {
    name: "a non-module-bound exactRecord helper",
    options: {
      exactRecordHelper:
        "function exactRecordHolder() { function exactRecord() { return new Map(); } void exactRecord; }"
    }
  },
  {
    name: "a non-module-bound protocolString helper",
    options: {
      protocolStringHelper:
        "function protocolStringHolder() { function protocolString() { return \"\"; } void protocolString; }"
    }
  },
  {
    name: "a non-function exactRecord module identity",
    options: { exactRecordHelper: "const exactRecord = () => new Map();" }
  },
  {
    name: "a non-function protocolString module identity",
    options: { protocolStringHelper: "const protocolString = () => \"\";" }
  },
  {
    name: "a reassigned exactRecord helper",
    options: { beforeFunction: "exactRecord = () => new Map();" }
  },
  {
    name: "a reassigned protocolString helper",
    options: { beforeFunction: "protocolString = () => \"\";" }
  },
  {
    name: "an exactRecord for-of assignment target",
    options: { beforeFunction: "for (exactRecord of [exactRecord]) {}" }
  },
  {
    name: "a protocolString for-in assignment target",
    options: { beforeFunction: "for (protocolString in { replacement: true }) {}" }
  },
  {
    name: "a denseArray destructured for-of assignment target",
    options: { beforeFunction: "for ([denseArray] of [[denseArray]]) {}" }
  },
  {
    name: "an optional exactRecord call",
    options: { recordCallee: "exactRecord?." }
  },
  {
    name: "an optional protocolString call",
    options: { validation: 'protocolString?.(record.get("source_id"), context);' }
  },
  {
    name: "an exactRecord call with type arguments",
    options: { recordCallee: "exactRecord<unknown>" }
  },
  {
    name: "a protocolString call with type arguments",
    options: { validation: 'protocolString<string>(record.get("source_id"), context);' }
  },
  {
    name: "an extra source_id capture",
    options: { callbackAfterRecord: 'const captured = record.get("source_id"); void captured;' }
  },
  {
    name: "a direct source capture",
    options: { callbackAfterRecord: "void source;" }
  },
  {
    name: "a dynamic source access",
    options: { callbackAfterRecord: 'void source["value"];' }
  },
  {
    name: "a direct record capture",
    options: { callbackAfterRecord: "void record;" }
  },
  {
    name: "a dynamic record key",
    options: {
      callbackAfterRecord: 'const key = "value"; void record.get(key);'
    }
  },
  {
    name: "a local context shadow in the source callback",
    options: {
      callbackBeforeRecord:
        "const context = { signal: undefined as never };"
    }
  },
  {
    name: "a var redeclaration of the source callback parameter",
    options: { callbackBeforeRecord: "var source = {};" }
  },
  {
    name: "a module-local mutable raw channel into the source callback",
    options: {
      beforeFunction: "let rawChannel: unknown;",
      validatorBeforeOuter:
        "rawChannel = (snapshot as any).contents[0];",
      callbackAfterRecord:
        "return { value: rawChannel } as never;"
    }
  },
  {
    name: "a validator context raw channel into the source callback",
    options: {
      validatorBeforeOuter:
        "(context as any).raw = (snapshot as any).contents[0];",
      callbackAfterRecord:
        "return { value: (context as any).raw } as never;"
    }
  },
  {
    name: "a var redeclaration of the snapshot validator parameter",
    options: { validatorBeforeOuter: "var snapshot = {};" }
  },
  {
    name: "a var redeclaration of the context validator parameter",
    options: {
      validatorBeforeOuter:
        "var context = { signal: undefined as never };"
    }
  },
  {
    name: "a persisted default snapshot validator parameter",
    options: {
      beforeFunction: "let cachedSnapshot: unknown;",
      snapshotParameter: "snapshot: unknown = cachedSnapshot",
      validatorBeforeOuter: "cachedSnapshot = snapshot;"
    }
  },
  {
    name: "a reassigned snapshot validator parameter",
    options: { validatorBeforeOuter: "snapshot = {};" }
  },
  {
    name: "a context validator parameter loop assignment target",
    options: {
      validatorBeforeOuter: "for (context of [] as any[]) {}"
    }
  },
  {
    name: "a defaulted source callback parameter",
    options: { callbackParameter: "source = undefined" }
  },
  {
    name: "a rest source callback parameter",
    options: { callbackParameter: "...source" }
  },
  {
    name: "an optional source callback parameter",
    options: { callbackParameter: "source?: unknown" }
  },
  {
    name: "a mutation of the inspected outer record",
    options: {
      validatorAfterOuter: 'outer.set("contents", []);'
    }
  },
  {
    name: "an alias mutation of the inspected outer record",
    options: {
      validatorAfterOuter:
        'const outerAlias = outer; outerAlias.set("contents", []);'
    }
  },
  {
    name: "an outer snapshot capture from the source callback",
    options: { callbackAfterRecord: "return snapshot as never;" }
  },
  {
    name: "an outer record capture from the source callback",
    options: { callbackAfterRecord: "return outer as never;" }
  },
  {
    name: "an outer contents capture from the source callback",
    options: { callbackAfterRecord: "return contents as never;" }
  },
  {
    name: "an aliased outer snapshot capture from the source callback",
    options: {
      validatorBeforeOuter: "const rawAlias = snapshot;",
      callbackAfterRecord: "return rawAlias as never;"
    }
  },
  {
    name: "a lexical arguments capture from the source callback",
    options: { callbackAfterRecord: "return arguments[0] as never;" }
  },
  {
    name: "an unpaired source_id schema literal",
    options: { validation: 'protocolString(record.get("source_type"), context);' }
  },
  {
    name: "a third source_id literal",
    options: { afterFunction: 'void "source_id";' }
  },
  {
    name: "a validator return not bound to inspected sources",
    options: { validatorReturn: "return {};" }
  },
  {
    name: "a validator return with sources overridden by a later spread",
    options: {
      validatorReturn:
        "const replacement = { sources: [] }; return { sources, ...replacement };"
    }
  },
  {
    name: "a push into inspected sources before return",
    options: {
      validatorReturn:
        "sources.push(snapshot as never); return { sources };"
    }
  },
  {
    name: "a splice into inspected sources before return",
    options: {
      validatorReturn:
        "sources.splice(0, 1, snapshot as never); return { sources };"
    }
  },
  {
    name: "an alias of inspected sources before return",
    options: {
      validatorReturn:
        "const sourceAlias = sources; void sourceAlias; return { sources };"
    }
  },
  {
    name: "a value-level source_id property outside validation",
    options: {
      afterFunction:
        "function leak(raw: any): unknown { return raw.contents[0].source_id; }"
    }
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects sanitizer owner mutation with ${mutation.name}`, () => {
    assertSanitizerOwnerViolation(analyzeSanitizerOwnerFixture(mutation.options));
  });
}

test("REQ-SBX-GENERAL-002 repository gate rejects sanitizer source_id ownership in the wrong file", () => {
  assertSanitizerOwnerViolation(
    analyzeSanitizerOwnerFixture({}, "deterministic-sanitizer-copy.ts")
  );
});

for (const mutation of [
  {
    name: "unresolved relative import",
    source: 'import "./missing-production-module.ts";',
    expected: "unresolved relative import"
  },
  {
    name: "absolute import",
    source: `import ${JSON.stringify(SECURITY_INDEX)};`,
    expected: "absolute imports are forbidden"
  },
  {
    name: "file URL import",
    source: 'import "file:///tmp/security-index.ts";',
    expected: "file URL imports are forbidden"
  },
  {
    name: "module alias import",
    source: 'import "@sandbox/security";',
    expected: "module alias"
  },
  {
    name: "core deep import",
    source: 'import "../security/detector-contract.ts";',
    expected: "sole deep-import exception"
  },
  {
    name: "core deep export-from",
    source: 'export { RawLocalDetector } from "../security/detector-contract.ts";',
    expected: "sole deep-import exception"
  },
  {
    name: "core deep export-star",
    source: 'export * from "../security/detector-contract.ts";',
    expected: "sole deep-import exception"
  },
  {
    name: "core deep require",
    source: 'const contract = require("../security/detector-contract.ts"); void contract;',
    expected: "sole deep-import exception"
  },
  {
    name: "core deep import-equals",
    source: 'import Contract = require("../security/detector-contract.ts"); void Contract;',
    expected: "sole deep-import exception"
  },
  {
    name: "nonliteral require",
    source: 'const target = "../security/index.ts"; const security = require(target); void security;',
    expected: "nonliteral module reference"
  },
  {
    name: "sanitizer exception from the wrong module",
    source: `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts";`,
    expected: "sole deep-import exception"
  },
  {
    name: "sanitizer exception with another core symbol",
    relativePath: "deterministic-sanitizer.ts",
    source: `import { ${SANITIZER_HELPER}, validateSandboxSecuritySanitizedJudgePayload } from "../security/sanitized-boundary.ts";`,
    expected: "sole deep-import exception"
  },
  {
    name: "sanitizer exception imported under an alias",
    relativePath: "deterministic-sanitizer.ts",
    source: `import { ${SANITIZER_HELPER} as deriveRegistry } from "../security/sanitized-boundary.ts"; void deriveRegistry;`,
    expected: "sole deep-import exception"
  },
  {
    name: "dynamic import",
    source: 'export const load = () => import("../security/index.ts");',
    expected: "dynamic import is forbidden"
  },
  {
    name: "nonliteral dynamic import",
    source: 'const target = "../security/index.ts"; export const load = () => import(target);',
    expected: "dynamic import is forbidden"
  },
  {
    name: "process getBuiltinModule",
    source: 'process.getBuiltinModule("node:http");',
    expected: "process.getBuiltinModule is forbidden"
  },
  {
    name: "aliased process capability",
    source: "const runtimeProcess = process; void runtimeProcess;",
    expected: "process capability is forbidden"
  },
  {
    name: "direct eval",
    source: 'eval("globalThis.compromised = true");',
    expected: "dynamic code execution via eval"
  },
  {
    name: "indirect eval",
    source: '(0, globalThis["eval"])("globalThis.compromised = true");',
    expected: "dynamic code execution via eval"
  },
  {
    name: "Function constructor",
    source: 'new Function("return globalThis");',
    expected: "dynamic code execution via Function"
  },
  {
    name: "network builtin outside transport",
    source: 'import { request } from "node:https"; void request;',
    expected: "network module"
  },
  {
    name: "unapproved network builtin inside transport",
    relativePath: "http-transport.ts",
    source: 'import { connect } from "node:net"; void connect;',
    expected: "network module"
  },
  {
    name: "unapproved filesystem builtin inside transport",
    relativePath: "http-transport.ts",
    source: 'import { readFileSync } from "node:fs"; void readFileSync;',
    expected: "module alias"
  },
  {
    name: "global fetch outside transport",
    source: 'const send = fetch; void send;',
    expected: "network capability fetch"
  },
  {
    name: "process env outside config",
    source: "void globalThis.process[\"env\"].OPENAI_API_KEY;",
    expected: "process.env is allowed only"
  },
  {
    name: "benchmark sample import",
    source: 'import "../../../../samples/sandbox-security-benchmark/input.json";',
    expected: "benchmark or Track 1 oracle import"
  },
  {
    name: "benchmark script import",
    source: 'import "../../../../scripts/benchmark/capture-live.ts";',
    expected: "benchmark or Track 1 oracle import"
  },
  {
    name: "repository test import",
    source: 'import "../../../../tests/fixtures/oracle.ts";',
    expected: "benchmark or Track 1 oracle import"
  },
  {
    name: "Track 1 alias import",
    source: 'import "track1-oracle";',
    expected: "benchmark or Track 1 oracle import"
  },
  {
    name: "campaign alias import",
    source: 'import "campaign-fixtures";',
    expected: "benchmark or Track 1 oracle import"
  },
  {
    name: "oracle field",
    source: 'export const descriptor = { expected_action: "deny" };',
    expected: "oracle field name expected_action"
  },
  {
    name: "fixture literal",
    source: 'export const locator = "fixture-042";',
    expected: "oracle fixture/source/record literal"
  },
  {
    name: "source literal",
    source: 'export const locator = "source:public-corpus";',
    expected: "oracle fixture/source/record literal"
  },
  {
    name: "source ID literal",
    source: 'export const locator = "source_id";',
    expected: "oracle fixture/source/record literal"
  },
  {
    name: "dataset source literal",
    source: 'export const locator = "dataset_source";',
    expected: "oracle fixture/source/record literal"
  },
  {
    name: "source path locator literal",
    source: 'export const locator = "/source/public-corpus";',
    expected: "oracle fixture/source/record literal"
  },
  {
    name: "record literal",
    source: 'export const locator = "record/ref-9";',
    expected: "oracle fixture/source/record literal"
  },
  {
    name: "seed record literal",
    source: 'export const locator = "seed_record/ref-9";',
    expected: "oracle fixture/source/record literal"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects ${mutation.name}`, () => {
    const analysis = analyzeProductionMutation(
      "relativePath" in mutation ? mutation.relativePath : "mutation.ts",
      mutation.source
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes(mutation.expected) && violation.includes("security-production/")
      ),
      `expected located ${JSON.stringify(mutation.expected)} violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

for (const oracleField of [
  "fixture_id",
  "verdict_class",
  "ground_truth_severity",
  "transformation_kind",
  "seed_record_ref",
  "expected_action"
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects oracle field ${oracleField}`, () => {
    const analysis = analyzeProductionMutation(
      "oracle-field-mutation.ts",
      `export const descriptor = { ${oracleField}: "sentinel" };`
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes(`oracle field name ${oracleField}`) &&
          violation.includes("security-production/oracle-field-mutation.ts")
      ),
      analysis.violations.join("\n")
    );
  });
}

test("REQ-SBX-GENERAL-002 repository gate rejects core reverse dependency mutation", () => {
  const analysis = analyzeSource({
    path: join(SECURITY_ROOT, "reverse-dependency-mutation.ts"),
    text: 'export * from "../security-production/index.ts";',
    tree: "core"
  });
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("frozen security core must never import production") &&
        violation.includes("reverse-dependency-mutation.ts --export-star")
    ),
    analysis.violations.join("\n")
  );
});

test("REQ-SBX-GENERAL-002 repository gate rejects relative symlink escape", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "sandbox-security-production-"));
  const repositoryRoot = join(temporaryRoot, "repository");
  const productionRoot = join(repositoryRoot, "security-production");
  const securityRoot = join(repositoryRoot, "security");
  const outsideSource = join(temporaryRoot, "outside.ts");
  mkdirSync(productionRoot, { recursive: true });
  mkdirSync(securityRoot, { recursive: true });
  writeFileSync(outsideSource, "export const escaped = true;\n");
  symlinkSync(outsideSource, join(productionRoot, "escape.ts"));
  const roots: ScanRoots = {
    repositoryRoot,
    productionRoot,
    securityRoot,
    securityIndex: join(securityRoot, "index.ts"),
    sanitizedBoundary: join(securityRoot, "sanitized-boundary.ts"),
    deterministicSanitizer: join(productionRoot, "deterministic-sanitizer.ts"),
    httpTransport: join(productionRoot, "http-transport.ts"),
    productionConfig: join(productionRoot, "production-config.ts")
  };

  try {
    const analysis = analyzeProductionMutation(
      "mutation.ts",
      'import "./escape.ts";',
      roots
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes("symlink") && violation.includes("mutation.ts --static-import")
      ),
      analysis.violations.join("\n")
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-002 repository gate rejects a symbolic production source root", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "sandbox-security-production-root-"));
  const repositoryRoot = join(temporaryRoot, "repository");
  const productionRoot = join(repositoryRoot, "security-production");
  const securityRoot = join(repositoryRoot, "security");
  const outsideProductionRoot = join(temporaryRoot, "outside-production");
  mkdirSync(repositoryRoot, { recursive: true });
  mkdirSync(securityRoot, { recursive: true });
  mkdirSync(outsideProductionRoot, { recursive: true });
  writeFileSync(
    join(outsideProductionRoot, "outside.ts"),
    "export const outside = true;\n"
  );
  symlinkSync(outsideProductionRoot, productionRoot, "dir");
  const roots: ScanRoots = {
    repositoryRoot,
    productionRoot,
    securityRoot,
    securityIndex: join(securityRoot, "index.ts"),
    sanitizedBoundary: join(securityRoot, "sanitized-boundary.ts"),
    deterministicSanitizer: join(productionRoot, "deterministic-sanitizer.ts"),
    httpTransport: join(productionRoot, "http-transport.ts"),
    productionConfig: join(productionRoot, "production-config.ts")
  };

  try {
    const inventory = listTypeScriptSources(
      productionRoot,
      "production",
      roots
    );
    const violations = [
      ...inventory.violations,
      ...inventory.sources.flatMap(
        (source) => analyzeSource(source, roots).violations
      )
    ];
    assert.ok(
      violations.some(
        (violation) =>
          violation.includes("symbolic") &&
          violation.includes("security-production")
      ),
      `expected a located symbolic production root violation, received:\n${violations.join("\n")}`
    );
    assert.deepEqual(
      inventory.sources,
      [],
      "a symbolic production root must not be traversed"
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

for (const computedCapability of [
  {
    name: "computed eval concatenation",
    source: 'globalThis["ev" + "al"]("x");',
    expected: "eval"
  },
  {
    name: "computed process env concatenation",
    source:
      'void globalThis["pro" + "cess"]["env"].OPENAI_API_KEY;',
    expected: "process.env"
  },
  {
    name: "computed fetch concatenation",
    source: 'globalThis["fet" + "ch"]("https://example.invalid");',
    expected: "fetch"
  },
  {
    name: "unknown computed global capability",
    source:
      'const capability = "fetch"; globalThis[capability]("https://example.invalid");',
    expected: "computed capability"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects ${computedCapability.name}`, () => {
    const analysis = analyzeProductionMutation(
      "computed-capability-mutation.ts",
      computedCapability.source
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes(computedCapability.expected) &&
          violation.includes(
            "security-production/computed-capability-mutation.ts"
          )
      ),
      `expected fail-closed ${JSON.stringify(computedCapability.expected)} violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

for (const globalAliasBypass of [
  {
    name: "globalThis alias fetch",
    source:
      'const capabilityGlobal = globalThis; capabilityGlobal.fetch("https://example.invalid");',
    expected: "first-class global capability"
  },
  {
    name: "globalThis alias process env",
    source:
      "const capabilityGlobal = globalThis; void capabilityGlobal.process.env.OPENAI_API_KEY;",
    expected: "first-class global capability"
  },
  {
    name: "globalThis alias process getBuiltinModule",
    source:
      'const capabilityGlobal = globalThis; capabilityGlobal.process.getBuiltinModule("node:http");',
    expected: "first-class global capability"
  },
  {
    name: "globalThis self-reference alias fetch",
    source:
      'const capabilityGlobal = globalThis.globalThis; capabilityGlobal.fetch("https://example.invalid");',
    expected: "first-class global capability"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects ${globalAliasBypass.name}`, () => {
    const analysis = analyzeProductionMutation(
      "global-alias-capability-mutation.ts",
      globalAliasBypass.source
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes(globalAliasBypass.expected) &&
          violation.includes("security-production/global-alias-capability-mutation.ts")
      ),
      `expected fail-closed global alias violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

for (const firstClassGlobal of [
  {
    name: "globalThis passed as a value",
    source: "declare function consume(value: unknown): void; consume(globalThis);"
  },
  {
    name: "globalThis destructured as a value",
    source: "const { fetch: localFetch } = globalThis; void localFetch;"
  },
  {
    name: "global assigned as a value",
    source: "const capabilityGlobal = global; void capabilityGlobal;"
  },
  {
    name: "require assigned as a value",
    source: "const loadModule = require; void loadModule;"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects ${firstClassGlobal.name}`, () => {
    const analysis = analyzeProductionMutation(
      "first-class-global-mutation.ts",
      firstClassGlobal.source
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes("first-class global capability") &&
          violation.includes("security-production/first-class-global-mutation.ts")
      ),
      `expected first-class global capability violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

for (const shadowedCapability of [
  {
    name: "local function fetch",
    source: 'function fetch(): string { return "local"; } void fetch();'
  },
  {
    name: "Function parameter",
    source:
      "function invoke(Function: () => void): void { Function(); } void invoke(() => undefined);"
  },
  {
    name: "local require",
    source:
      'const require = (specifier: string): string => specifier; void require("local-value");'
  },
  {
    name: "local process",
    source:
      'const process = { env: { TOKEN: "local" }, getBuiltinModule: () => "local" }; void process.env.TOKEN; void process.getBuiltinModule();'
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate permits shadowed ${shadowedCapability.name}`, () => {
    const analysis = analyzeProductionMutation(
      "shadowed-capability.ts",
      shadowedCapability.source
    );
    assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
  });
}

test("REQ-SBX-GENERAL-002 repository gate permits capability-named import bindings", () => {
  const analysis = analyzeProductionMutation(
    "shadowed-import-capability.ts",
    'import { fetch, require, Function, process } from "../security/index.ts"; void fetch; void require; void Function; void process;'
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

for (const requireMemberBypass of [
  {
    name: "require call member",
    source: 'require.call(null, "node:http");'
  },
  {
    name: "require apply member",
    source: 'require.apply(null, ["node:http"]);'
  },
  {
    name: "require bind member",
    source: "const load = require.bind(null); void load;"
  },
  {
    name: "require constructor member",
    source: 'require.constructor("return process")();'
  },
  {
    name: "arbitrary require member",
    source: "void require.cache;"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects ${requireMemberBypass.name}`, () => {
    const analysis = analyzeProductionMutation(
      "require-member-mutation.ts",
      requireMemberBypass.source
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes("require member access") &&
          violation.includes("security-production/require-member-mutation.ts")
      ),
      `expected fail-closed require member violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

test("REQ-SBX-GENERAL-002 direct require remains subject to the module edge allowlist", () => {
  const analysis = analyzeProductionMutation(
    "http-transport.ts",
    'const http = require("node:http"); void http;'
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

test("REQ-SBX-GENERAL-002 repository gate rejects require with an unknown computed member", () => {
  const analysis = analyzeProductionMutation(
    "require-dynamic-member-mutation.ts",
    'const member = "call"; require[member](null, "node:http");'
  );
  assert.ok(
    analysis.violations.some((violation) =>
      violation.includes("computed capability access rooted at require")
    ),
    `expected dynamic require member violation, received:\n${analysis.violations.join("\n")}`
  );
});

for (const evalMemberBypass of [
  {
    name: "eval call member",
    source: 'eval.call(null, "globalThis.compromised = true");'
  },
  {
    name: "eval unknown computed member",
    source:
      'const member = "call"; eval[member](null, "globalThis.compromised = true");'
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects ${evalMemberBypass.name}`, () => {
    const analysis = analyzeProductionMutation(
      "eval-member-mutation.ts",
      evalMemberBypass.source
    );
    assert.ok(
      analysis.violations.some((violation) =>
        violation.includes("dynamic code execution via eval")
      ),
      `expected dynamic eval violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

for (const ambientCapability of [
  {
    name: "ambient fetch declaration",
    source:
      'declare function fetch(input: string): unknown;\nfetch("https://example.invalid");',
    expected: "network capability fetch"
  },
  {
    name: "ambient process declaration",
    source:
      'declare const process: { getBuiltinModule(name: string): unknown };\nprocess.getBuiltinModule("node:http");',
    expected: "process.getBuiltinModule is forbidden"
  },
  {
    name: "type-only fetch import",
    source:
      'import type { fetch } from "../security/index.ts";\nfetch("https://example.invalid");',
    expected: "network capability fetch"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate treats ${ambientCapability.name} as non-runtime shadow`, () => {
    const analysis = analyzeProductionMutation(
      "ambient-capability-mutation.ts",
      ambientCapability.source
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes(ambientCapability.expected) &&
          violation.includes("ambient-capability-mutation.ts:2:")
      ),
      `expected runtime capability violation on line 2, received:\n${analysis.violations.join("\n")}`
    );
  });
}

test("REQ-SBX-GENERAL-002 repository gate ignores ambient module declarations as runtime shadows", () => {
  const analysis = analyzeProductionMutation(
    "ambient-module-capability.ts",
    `declare module "ambient-capability" {
  function fetch(input: string): unknown;
}
fetch("https://example.invalid");`
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("network capability fetch") &&
        violation.includes("ambient-module-capability.ts:4:")
    ),
    `expected external fetch capability violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate ignores declare global module names", () => {
  const analysis = analyzeProductionMutation(
    "declare-global-module.ts",
    `declare global {
  interface CapabilityShape { fetch: string; }
}`
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

test("REQ-SBX-GENERAL-002 repository gate ignores capability names in non-value declarations and members", () => {
  const analysis = analyzeProductionMutation(
    "non-value-capability-names.ts",
    `interface CapabilityShape { fetch(): void; process: string; }
type CapabilityRecord = { fetch: string; process(): void };
const descriptor = { fetch: "label", process(): string { return "label"; } };
class CapabilityClass { fetch(): void {} process = "label"; }
void descriptor; void CapabilityClass;`
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

test("REQ-SBX-GENERAL-002 repository gate ignores imported property names when the runtime alias is safe", () => {
  const analysis = analyzeProductionMutation(
    "aliased-import-property-name.ts",
    'import { fetch as safeFetch } from "../security/index.ts"; void safeFetch;'
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

for (const realValueCapability of [
  {
    name: "shorthand property value",
    source: "export const descriptor = { fetch };"
  },
  {
    name: "computed property value",
    source: "export const descriptor = { [fetch]: true };"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate still rejects fetch in a ${realValueCapability.name}`, () => {
    const analysis = analyzeProductionMutation(
      "value-capability-mutation.ts",
      realValueCapability.source
    );
    assert.ok(
      analysis.violations.some((violation) =>
        violation.includes("network capability fetch")
      ),
      analysis.violations.join("\n")
    );
  });
}

for (const constructorReflection of [
  {
    name: "constructor chain",
    source: '({}).constructor.constructor("return globalThis")();'
  },
  {
    name: "computed constructor chain",
    source: '({})["con" + "structor"]["constructor"]("return globalThis")();'
  },
  {
    name: "function object constructor reference",
    source: "const localFunction = (): void => undefined; void localFunction.constructor;"
  },
  {
    name: "constructor used with new",
    source: "void new ({}).constructor();"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects ${constructorReflection.name}`, () => {
    const analysis = analyzeProductionMutation(
      "constructor-reflection-mutation.ts",
      constructorReflection.source
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes("constructor capability") &&
          violation.includes(
            "security-production/constructor-reflection-mutation.ts"
          )
      ),
      `expected constructor reflection violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

for (const benchmarkOracleLiteral of [
  "AgentDojo",
  "ryoungj/ToolEmu",
  "ToolEmu",
  "deepset/prompt-injections",
  "OpenAssistant/oasst1",
  "089ed468cf3ed0322acc66b0211f26d9d90dbf60",
  "ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb",
  "4f61ecb038e9c3fb77e21034b22511b523772cdd",
  "fdf72ae0827c1cda404aff25b6603abec9e3399b"
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects benchmark oracle literal ${benchmarkOracleLiteral}`, () => {
    const analysis = analyzeProductionMutation(
      "benchmark-oracle-mutation.ts",
      `export const source = ${JSON.stringify(benchmarkOracleLiteral)};`
    );
    assert.ok(
      analysis.violations.some(
        (violation) =>
          violation.includes("benchmark source or revision literal") &&
          violation.includes("security-production/benchmark-oracle-mutation.ts")
      ),
      `expected benchmark source/revision violation for ${benchmarkOracleLiteral}, received:\n${analysis.violations.join("\n")}`
    );
  });
}

test("REQ-SBX-GENERAL-002 repository gate rejects statically concatenated benchmark source", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-source-concatenation.ts",
    'export const source = "Agent" + "Dojo";'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision literal") &&
        violation.includes(
          "security-production/benchmark-source-concatenation.ts"
        )
    ),
    `expected folded AgentDojo benchmark violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate rejects statically concatenated benchmark revision", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-revision-concatenation.ts",
    'export const revision = "089ed468cf3ed0322acc" + "66b0211f26d9d90dbf60";'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision literal") &&
        violation.includes(
          "security-production/benchmark-revision-concatenation.ts"
        )
    ),
    `expected folded benchmark revision violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate rejects benchmark source in a template expression", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-source-template.ts",
    'export const source = `Agent${"Dojo"}`;'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision literal") &&
        violation.includes("security-production/benchmark-source-template.ts")
    ),
    `expected folded template benchmark violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate rejects a benchmark revision assembled with numeric template coercion", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-revision-number-template.ts",
    'export const revision = `${0}89ed468cf3ed0322acc66b0211f26d9d90dbf60`;'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision literal") &&
        violation.includes(
          "security-production/benchmark-revision-number-template.ts"
        )
    ),
    `expected numeric template coercion violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate folds boolean and null template coercion without general evaluation", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-source-primitive-template.ts",
    'export const source = `Agent${"Dojo"}${true}${null}`;'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision literal") &&
        violation.includes(
          "security-production/benchmark-source-primitive-template.ts"
        )
    ),
    `expected primitive template coercion violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate rejects benchmark source through immutable const identifiers", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-source-const-identifiers.ts",
    'const sourcePrefix = "Agent"; const sourceSuffix = "Dojo"; export const source = sourcePrefix + sourceSuffix;'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision literal") &&
        violation.includes(
          "security-production/benchmark-source-const-identifiers.ts"
        )
    ),
    `expected immutable const benchmark violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate rejects nested split benchmark revision through immutable const identifiers", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-revision-const-identifiers.ts",
    'const revisionPrefix = "089ed468cf3ed0322acc"; const revisionMiddle = "66b0211f26d9"; const revisionSuffix = "d90dbf60"; export const revision = revisionPrefix + (revisionMiddle + revisionSuffix);'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision literal") &&
        violation.includes(
          "security-production/benchmark-revision-const-identifiers.ts"
        )
    ),
    `expected nested immutable revision violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate does not evaluate mutable unknown or cyclic identifiers", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-unknown-identifiers.ts",
    'declare const unknownValue: string; let mutablePrefix = "Agent"; mutablePrefix += unknownValue; const first = second; const second = first; export const source = mutablePrefix + first;'
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

test("REQ-SBX-GENERAL-002 repository gate rejects benchmark source import edge", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-import-mutation.ts",
    'import "./AgentDojo.ts";'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision module reference") &&
        violation.includes(
          'benchmark-import-mutation.ts --static-import("./AgentDojo.ts")'
        )
    ),
    `expected located AgentDojo import-edge violation, received:\n${analysis.violations.join("\n")}`
  );
});

test("REQ-SBX-GENERAL-002 repository gate rejects benchmark source export-from edge", () => {
  const analysis = analyzeProductionMutation(
    "benchmark-export-mutation.ts",
    'export { detector } from "./ToolEmu.ts";'
  );
  assert.ok(
    analysis.violations.some(
      (violation) =>
        violation.includes("benchmark source or revision module reference") &&
        violation.includes(
          'benchmark-export-mutation.ts --export-from("./ToolEmu.ts")'
        )
    ),
    `expected located ToolEmu export-edge violation, received:\n${analysis.violations.join("\n")}`
  );
});

for (const sanitizerHelperLeak of [
  {
    name: "sanitizer helper local named export",
    source: `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts"; export { ${SANITIZER_HELPER} };`
  },
  {
    name: "sanitizer helper exported variable",
    source: `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts"; export const leaked = ${SANITIZER_HELPER};`
  },
  {
    name: "sanitizer helper default export",
    source: `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts"; export default ${SANITIZER_HELPER};`
  },
  {
    name: "sanitizer helper object alias export",
    source: `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts"; const helperAlias = { derive: ${SANITIZER_HELPER} }; export { helperAlias as leaked };`
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects ${sanitizerHelperLeak.name}`, () => {
    const analysis = analyzeProductionMutation(
      "deterministic-sanitizer.ts",
      sanitizerHelperLeak.source
    );
    assert.ok(
      analysis.violations.some((violation) =>
        violation.includes("sanitizer helper must not be re-exported")
      ),
      `expected sanitizer helper export violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

for (const mutableSanitizerLeak of [
  {
    name: "mutable helper alias export",
    source: `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts"; let leaked = ${SANITIZER_HELPER}; export { leaked };`,
    expected: "sanitizer helper must not be re-exported"
  },
  {
    name: "mutated holder export",
    source: `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts"; const holder = { derive: undefined as unknown }; holder.derive = ${SANITIZER_HELPER}; export { holder };`,
    expected: "deterministic sanitizer export"
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects sanitizer ${mutableSanitizerLeak.name}`, () => {
    const analysis = analyzeProductionMutation(
      "deterministic-sanitizer.ts",
      mutableSanitizerLeak.source
    );
    assert.ok(
      analysis.violations.some((violation) =>
        violation.includes(mutableSanitizerLeak.expected)
      ),
      `expected mutable sanitizer leak violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

test("REQ-SBX-GENERAL-002 repository gate rejects sanitizer helper delayed assignment through the version export", () => {
  const analysis = analyzeProductionMutation(
    "deterministic-sanitizer.ts",
    `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts";
let leaked: unknown;
leaked = ${SANITIZER_HELPER};
export const SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION = leaked;`
  );
  assert.ok(
    analysis.violations.some((violation) =>
      violation.includes("deterministic sanitizer export")
    ),
    `expected exact sanitizer version export violation, received:\n${analysis.violations.join("\n")}`
  );
});

for (const forbiddenSanitizerExport of [
  {
    name: "unapproved runtime const",
    source: "export const OTHER_SANITIZER_VERSION = 'v1';"
  },
  {
    name: "unapproved runtime function",
    source: "export function createOtherSanitizer(): unknown { return undefined; }"
  },
  {
    name: "default function",
    source:
      "export default function createSandboxSecurityDeterministicSanitizer(): unknown { return undefined; }"
  },
  {
    name: "export star",
    source: 'export * from "../security/index.ts";'
  }
] as const) {
  test(`REQ-SBX-GENERAL-002 repository gate rejects deterministic sanitizer ${forbiddenSanitizerExport.name} export`, () => {
    const analysis = analyzeProductionMutation(
      "deterministic-sanitizer.ts",
      forbiddenSanitizerExport.source
    );
    assert.ok(
      analysis.violations.some((violation) =>
        violation.includes("deterministic sanitizer export")
      ),
      `expected deterministic sanitizer export allowlist violation, received:\n${analysis.violations.join("\n")}`
    );
  });
}

test("REQ-SBX-GENERAL-002 repository gate permits sanitizer version and factory use of the helper", () => {
  const analysis = analyzeProductionMutation(
    "deterministic-sanitizer.ts",
    `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts";
export const SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION = "sandbox-security-deterministic-sanitizer.v1";
export function createSandboxSecurityDeterministicSanitizer(): unknown {
  return ${SANITIZER_HELPER}([]);
}`
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

test("REQ-SBX-GENERAL-002 repository gate permits wrapped exact sanitizer version and approved factory", () => {
  const analysis = analyzeProductionMutation(
    "deterministic-sanitizer.ts",
    `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts";
export const SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION = "sandbox-security-deterministic-sanitizer.v1" as const;
export function createSandboxSecurityDeterministicSanitizer(): unknown {
  return ${SANITIZER_HELPER}([]);
}`
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

test("REQ-SBX-GENERAL-002 repository gate permits approved production source vocabulary", () => {
  const analysis = analyzeProductionMutation(
    "rule-catalog.ts",
    `export const subjectStrategies = ["whole_source", "content_source"] as const;
export const operator = "cross_source_ordered_sequence" as const;`
  );
  assert.deepEqual(analysis.violations, [], analysis.violations.join("\n"));
});

test("REQ-SBX-GENERAL-002 repository gate permits only approved module capabilities", () => {
  const allowedSources = [
    analyzeProductionMutation(
      "rule-detector.ts",
      'import type { RawLocalDetector } from "../security/index.ts"; export type Detector = RawLocalDetector;'
    ),
    analyzeProductionMutation(
      "deterministic-sanitizer.ts",
      `import { ${SANITIZER_HELPER} } from "../security/sanitized-boundary.ts"; void ${SANITIZER_HELPER};`
    ),
    analyzeProductionMutation(
      "http-transport.ts",
      `import { timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { types } from "node:util";
void timingSafeEqual; void httpRequest; void httpsRequest; void types;`
    ),
    analyzeProductionMutation(
      "production-config.ts",
      "export const configured = process.env.OPENAI_API_KEY !== undefined;"
    ),
    analyzeProductionMutation(
      "benchmark-composition.ts",
      'export interface ContentFreeReplayInterface { readonly source_type: "content-free replay outcome"; }'
    )
  ];

  const violations = allowedSources.flatMap((analysis) => analysis.violations);
  assert.deepEqual(violations, [], violations.join("\n"));
});
