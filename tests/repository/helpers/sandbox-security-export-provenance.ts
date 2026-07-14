import { readdirSync, statSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";

import ts from "../../../frontend/node_modules/typescript/lib/typescript.js";

export type SandboxSecurityModuleReferenceKind =
  | "import"
  | "export"
  | "import-equals"
  | "import-type"
  | "dynamic-import"
  | "require";

export type SandboxSecurityModuleReference = {
  sourcePath: string;
  kind: SandboxSecurityModuleReferenceKind;
  moduleSpecifier: string | null;
  resolvedPath: string | null;
  engineDependency: boolean;
  violation: string | null;
};

export type SandboxSecurityExportProvenance = {
  exportedName: string;
  originPaths: string[];
  canonicalSandboxOriginPaths: string[];
  engineOriginPaths: string[];
  directCanonicalExport: boolean;
};

export type SandboxSecurityExportProvenanceAnalysis = {
  rootNames: string[];
  diagnostics: string[];
  moduleReferences: SandboxSecurityModuleReference[];
  exports: SandboxSecurityExportProvenance[];
  violations: string[];
};

export type SandboxSecurityExportProvenanceOptions = {
  repositoryRoot: string;
  overlay?: ReadonlyMap<string, string>;
  canonicalTypeExportNames: ReadonlySet<string>;
  canonicalValueExportNames: ReadonlySet<string>;
};

type OverlayCompilerHost = ts.CompilerHost & {
  canonicalPath(fileName: string): string;
};

type ParsedSharedConfig = {
  options: ts.CompilerOptions | null;
  diagnostics: ts.Diagnostic[];
};

type ModuleReferenceUse = {
  node: ts.Node;
  kind: SandboxSecurityModuleReferenceKind;
  literal: ts.StringLiteralLike | null;
};

const GENERATED_DIRECTORY_NAMES = new Set([
  ".cache",
  ".generated",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules"
]);

const ENGINE_PACKAGE_PATTERN =
  /^@agent-security-platform\/engines(?:\/|$)/;

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const pathFromParent = relative(parentPath, candidatePath);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith(`..${sep}`) &&
      pathFromParent !== ".." &&
      !isAbsolute(pathFromParent))
  );
}

function normalizeOverlay(
  repositoryRoot: string,
  overlay: ReadonlyMap<string, string>
): { sources: Map<string, string>; invalidPaths: string[] } {
  const sources = new Map<string, string>();
  const invalidPaths: string[] = [];

  for (const [fileName, source] of overlay) {
    if (!isAbsolute(fileName)) {
      invalidPaths.push(fileName);
    }
    sources.set(resolve(repositoryRoot, fileName), source);
  }

  return { sources, invalidPaths };
}

function collectOverlayDirectories(
  overlay: ReadonlyMap<string, string>
): Set<string> {
  const directories = new Set<string>();

  for (const fileName of overlay.keys()) {
    let currentDirectory = dirname(fileName);
    while (!directories.has(currentDirectory)) {
      directories.add(currentDirectory);
      const parentDirectory = dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        break;
      }
      currentDirectory = parentDirectory;
    }
  }

  return directories;
}

function createOverlayCompilerHost(
  repositoryRoot: string,
  options: ts.CompilerOptions,
  overlay: ReadonlyMap<string, string>
): OverlayCompilerHost {
  const defaultHost = ts.createCompilerHost(options, true);
  const overlayDirectories = collectOverlayDirectories(overlay);
  const canonicalPath = (fileName: string): string => {
    const absolutePath = resolve(repositoryRoot, fileName);
    if (overlay.has(absolutePath) || overlayDirectories.has(absolutePath)) {
      return absolutePath;
    }
    return resolve(defaultHost.realpath?.(absolutePath) ?? absolutePath);
  };

  return {
    ...defaultHost,
    fileExists(fileName) {
      const absolutePath = resolve(repositoryRoot, fileName);
      return overlay.has(absolutePath) || defaultHost.fileExists(fileName);
    },
    readFile(fileName) {
      const absolutePath = resolve(repositoryRoot, fileName);
      return overlay.get(absolutePath) ?? defaultHost.readFile(fileName);
    },
    getSourceFile(
      fileName,
      languageVersionOrOptions,
      onError,
      shouldCreateNewSourceFile
    ) {
      const absolutePath = resolve(repositoryRoot, fileName);
      const source = overlay.get(absolutePath);
      if (source === undefined) {
        return defaultHost.getSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreateNewSourceFile
        );
      }
      return ts.createSourceFile(
        absolutePath,
        source,
        languageVersionOrOptions,
        true
      );
    },
    directoryExists(directoryName) {
      const absolutePath = resolve(repositoryRoot, directoryName);
      return (
        overlayDirectories.has(absolutePath) ||
        defaultHost.directoryExists?.(directoryName) === true
      );
    },
    getDirectories(directoryName) {
      const absolutePath = resolve(repositoryRoot, directoryName);
      const directories = new Set(
        defaultHost.getDirectories?.(directoryName) ?? []
      );
      for (const overlayDirectory of overlayDirectories) {
        if (dirname(overlayDirectory) === absolutePath) {
          directories.add(basename(overlayDirectory));
        }
      }
      return [...directories];
    },
    realpath(fileName) {
      return canonicalPath(fileName);
    },
    canonicalPath
  };
}

function parseSharedConfig(
  repositoryRoot: string,
  overlay: ReadonlyMap<string, string>
): ParsedSharedConfig {
  const configPath = resolve(repositoryRoot, "shared/tsconfig.json");
  const parseHost: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    fileExists(fileName) {
      return overlay.has(resolve(repositoryRoot, fileName)) || ts.sys.fileExists(fileName);
    },
    readFile(fileName) {
      return overlay.get(resolve(repositoryRoot, fileName)) ?? ts.sys.readFile(fileName);
    },
    readDirectory(rootDir, extensions, excludes, includes, depth) {
      return ts.sys.readDirectory(rootDir, extensions, excludes, includes, depth);
    },
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath
  };
  const configResult = ts.readConfigFile(configPath, parseHost.readFile);
  if (configResult.error !== undefined) {
    return { options: null, diagnostics: [configResult.error] };
  }
  const parsed = ts.parseJsonConfigFileContent(
    configResult.config,
    parseHost,
    resolve(repositoryRoot, "shared"),
    undefined,
    configPath
  );

  return {
    options: { ...parsed.options, noEmit: true },
    diagnostics: [...parsed.errors]
  };
}

function isSharedProductionTypeScriptPath(
  sharedRoot: string,
  fileName: string
): boolean {
  const sharedRelativePath = relative(sharedRoot, resolve(fileName));
  if (
    sharedRelativePath === "" ||
    sharedRelativePath === ".." ||
    sharedRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(sharedRelativePath) ||
    !sharedRelativePath.endsWith(".ts")
  ) {
    return false;
  }
  const segments = sharedRelativePath.split(sep);
  return (
    segments[0] !== "tests" &&
    segments.every((segment) => !GENERATED_DIRECTORY_NAMES.has(segment))
  );
}

function collectSharedProductionRoots(
  repositoryRoot: string,
  overlay: ReadonlyMap<string, string>
): string[] {
  const sharedRoot = resolve(repositoryRoot, "shared");
  const roots = new Set<string>();
  const visitedDirectories = new Set<string>();

  const walk = (directoryPath: string): void => {
    const canonicalDirectoryPath = ts.sys.realpath?.(directoryPath) ?? directoryPath;
    if (visitedDirectories.has(canonicalDirectoryPath)) {
      return;
    }
    visitedDirectories.add(canonicalDirectoryPath);

    for (const entry of readdirSync(directoryPath)) {
      if (GENERATED_DIRECTORY_NAMES.has(entry)) {
        continue;
      }
      const entryPath = join(directoryPath, entry);
      const entryStat = statSync(entryPath);
      if (entryStat.isDirectory()) {
        if (relative(sharedRoot, entryPath).split(sep)[0] !== "tests") {
          walk(entryPath);
        }
        continue;
      }
      if (isSharedProductionTypeScriptPath(sharedRoot, entryPath)) {
        roots.add(resolve(entryPath));
      }
    }
  };

  walk(sharedRoot);
  for (const fileName of overlay.keys()) {
    if (isSharedProductionTypeScriptPath(sharedRoot, fileName)) {
      roots.add(resolve(fileName));
    }
  }

  return [...roots].sort((left, right) => left.localeCompare(right));
}

function formatDiagnostic(
  diagnostic: ts.Diagnostic,
  canonicalPath: (fileName: string) => string
): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file === undefined || diagnostic.start === undefined) {
    return `TS${diagnostic.code}: ${message}`;
  }
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${canonicalPath(diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${message}`;
}

function literalFromImportType(
  node: ts.ImportTypeNode
): ts.StringLiteralLike | null {
  if (
    !ts.isLiteralTypeNode(node.argument) ||
    (!ts.isStringLiteral(node.argument.literal) &&
      !ts.isNoSubstitutionTemplateLiteral(node.argument.literal))
  ) {
    return null;
  }
  return node.argument.literal;
}

function literalFromCall(
  node: ts.CallExpression
): ts.StringLiteralLike | null {
  const argument = node.arguments[0];
  if (
    argument === undefined ||
    (!ts.isStringLiteral(argument) &&
      !ts.isNoSubstitutionTemplateLiteral(argument))
  ) {
    return null;
  }
  return argument;
}

function unwrapTransparentExpression(expression: ts.Expression): ts.Expression {
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

function isRequireCall(node: ts.CallExpression): boolean {
  const expression = unwrapTransparentExpression(node.expression);
  return ts.isIdentifier(expression) && expression.text === "require";
}

function collectModuleReferenceUses(sourceFile: ts.SourceFile): ModuleReferenceUse[] {
  const references: ModuleReferenceUse[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      references.push({
        node,
        kind: "import",
        literal:
          ts.isStringLiteral(node.moduleSpecifier) ||
          ts.isNoSubstitutionTemplateLiteral(node.moduleSpecifier)
            ? node.moduleSpecifier
            : null
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      references.push({
        node,
        kind: "export",
        literal:
          ts.isStringLiteral(node.moduleSpecifier) ||
          ts.isNoSubstitutionTemplateLiteral(node.moduleSpecifier)
            ? node.moduleSpecifier
            : null
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression;
      references.push({
        node,
        kind: "import-equals",
        literal:
          expression !== undefined &&
          (ts.isStringLiteral(expression) ||
            ts.isNoSubstitutionTemplateLiteral(expression))
            ? expression
            : null
      });
    } else if (ts.isImportTypeNode(node)) {
      references.push({ node, kind: "import-type", literal: literalFromImportType(node) });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      references.push({ node, kind: "dynamic-import", literal: literalFromCall(node) });
    } else if (
      ts.isCallExpression(node) &&
      isRequireCall(node)
    ) {
      references.push({ node, kind: "require", literal: literalFromCall(node) });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

function isEngineLikeUnresolvedRelativePath(
  sourcePath: string,
  moduleSpecifier: string,
  engineRoot: string
): boolean {
  if (!moduleSpecifier.startsWith(".")) {
    return false;
  }
  return isPathInside(engineRoot, resolve(dirname(sourcePath), moduleSpecifier));
}

function findModuleReferenceOwner(
  node: ts.Node,
  moduleReferenceByNode: ReadonlyMap<ts.Node, SandboxSecurityModuleReference>
): SandboxSecurityModuleReference | null {
  let current: ts.Node | undefined = node;
  while (current !== undefined && !ts.isSourceFile(current)) {
    const reference = moduleReferenceByNode.get(current);
    if (reference !== undefined) {
      return reference;
    }
    current = current.parent;
  }
  return null;
}

function owningBindingDeclaration(declaration: ts.Declaration): ts.Node | null {
  if (!ts.isBindingElement(declaration)) {
    return null;
  }
  let current: ts.Node | undefined = declaration.parent;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isVariableDeclaration(current) || ts.isParameter(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isAccessChainQualifier(node: ts.Node): boolean {
  let current = node;
  let parent = current.parent;

  while (parent !== undefined) {
    if (ts.isPropertyAccessExpression(parent)) {
      if (parent.expression === current) {
        return true;
      }
      if (parent.name === current) {
        current = parent;
        parent = current.parent;
        continue;
      }
    }
    if (ts.isQualifiedName(parent)) {
      if (parent.left === current) {
        return true;
      }
      if (parent.right === current) {
        current = parent;
        parent = current.parent;
        continue;
      }
    }
    break;
  }

  return false;
}

function isExternalDeclarationPath(
  repositoryRoot: string,
  declarationPath: string
): boolean {
  return (
    !isPathInside(repositoryRoot, declarationPath) ||
    declarationPath.includes(`${sep}node_modules${sep}`)
  );
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function analyzeSandboxSecurityExportProvenance(
  input: SandboxSecurityExportProvenanceOptions
): SandboxSecurityExportProvenanceAnalysis {
  const repositoryRoot = resolve(input.repositoryRoot);
  const normalizedOverlay = normalizeOverlay(
    repositoryRoot,
    input.overlay ?? new Map()
  );
  const parsedConfig = parseSharedConfig(repositoryRoot, normalizedOverlay.sources);
  const preliminaryDiagnostics = [...parsedConfig.diagnostics];
  const preliminaryViolations = normalizedOverlay.invalidPaths.map(
    (fileName) => `virtual overlay path must be absolute: ${fileName}`
  );

  if (parsedConfig.options === null) {
    const canonicalPath = (fileName: string): string => resolve(fileName);
    const diagnostics = preliminaryDiagnostics.map((diagnostic) =>
      formatDiagnostic(diagnostic, canonicalPath)
    );
    return {
      rootNames: [],
      diagnostics,
      moduleReferences: [],
      exports: [],
      violations: uniqueSorted([
        ...preliminaryViolations,
        ...diagnostics.map((diagnostic) => `TypeScript diagnostic: ${diagnostic}`)
      ])
    };
  }

  const host = createOverlayCompilerHost(
    repositoryRoot,
    parsedConfig.options,
    normalizedOverlay.sources
  );
  const rootNames = collectSharedProductionRoots(
    repositoryRoot,
    normalizedOverlay.sources
  );
  const program = ts.createProgram({
    rootNames,
    options: parsedConfig.options,
    host
  });
  const checker = program.getTypeChecker();
  const programDiagnostics = [
    ...preliminaryDiagnostics,
    ...ts.getPreEmitDiagnostics(program)
  ];
  const diagnostics = programDiagnostics.map((diagnostic) =>
    formatDiagnostic(diagnostic, host.canonicalPath)
  );
  const violations = [
    ...preliminaryViolations,
    ...diagnostics.map((diagnostic) => `TypeScript diagnostic: ${diagnostic}`)
  ];
  const engineRoot = host.canonicalPath(resolve(repositoryRoot, "engines"));
  const canonicalSandboxPaths = new Set([
    host.canonicalPath(
      resolve(repositoryRoot, "shared/types/sandbox-security.ts")
    ),
    host.canonicalPath(
      resolve(repositoryRoot, "shared/contracts/sandbox-security.ts")
    )
  ]);
  const moduleResolutionCache = ts.createModuleResolutionCache(
    repositoryRoot,
    host.getCanonicalFileName,
    parsedConfig.options
  );
  const moduleReferences: SandboxSecurityModuleReference[] = [];
  const moduleReferenceByNode = new Map<
    ts.Node,
    SandboxSecurityModuleReference
  >();

  for (const rootName of rootNames) {
    const sourceFile = program.getSourceFile(rootName);
    if (sourceFile === undefined) {
      violations.push(`TypeScript Program did not load shared root ${rootName}`);
      continue;
    }
    const sourcePath = host.canonicalPath(sourceFile.fileName);
    for (const referenceUse of collectModuleReferenceUses(sourceFile)) {
      const moduleSpecifier = referenceUse.literal?.text ?? null;
      let resolvedPath: string | null = null;
      if (referenceUse.literal !== null) {
        const resolutionMode = program.getModeForUsageLocation(
          sourceFile,
          referenceUse.literal
        );
        const resolution = ts.resolveModuleName(
          referenceUse.literal.text,
          sourceFile.fileName,
          parsedConfig.options,
          host,
          moduleResolutionCache,
          undefined,
          resolutionMode
        );
        if (resolution.resolvedModule !== undefined) {
          resolvedPath = host.canonicalPath(
            resolution.resolvedModule.resolvedFileName
          );
        }
      }

      const explicitEnginePackage =
        moduleSpecifier !== null && ENGINE_PACKAGE_PATTERN.test(moduleSpecifier);
      const engineDependency =
        (resolvedPath !== null && isPathInside(engineRoot, resolvedPath)) ||
        explicitEnginePackage ||
        (resolvedPath === null &&
          moduleSpecifier !== null &&
          isEngineLikeUnresolvedRelativePath(
            sourcePath,
            moduleSpecifier,
            engineRoot
          ));
      let violation: string | null = null;
      if (referenceUse.literal === null) {
        violation = `${sourcePath} contains non-literal ${referenceUse.kind}`;
      } else if (engineDependency) {
        violation = `${sourcePath} ${referenceUse.kind} references engine module ${moduleSpecifier}`;
      }

      const reference: SandboxSecurityModuleReference = {
        sourcePath,
        kind: referenceUse.kind,
        moduleSpecifier,
        resolvedPath,
        engineDependency,
        violation
      };
      moduleReferences.push(reference);
      moduleReferenceByNode.set(referenceUse.node, reference);
      if (violation !== null) {
        violations.push(violation);
      }
    }
  }

  const sourceFileByCanonicalPath = new Map<string, ts.SourceFile>();
  for (const sourceFile of program.getSourceFiles()) {
    sourceFileByCanonicalPath.set(
      host.canonicalPath(sourceFile.fileName),
      sourceFile
    );
  }

  const moduleSymbolForReference = (
    reference: SandboxSecurityModuleReference | null
  ): ts.Symbol | null => {
    if (reference?.resolvedPath === null || reference === null) {
      return null;
    }
    const sourceFile = sourceFileByCanonicalPath.get(reference.resolvedPath);
    if (sourceFile === undefined) {
      return null;
    }
    return checker.getSymbolAtLocation(sourceFile) ?? null;
  };

  const symbolDependencyCache = new Map<ts.Symbol, readonly ts.Symbol[]>();
  const symbolReferencePathCache = new Map<ts.Symbol, readonly string[]>();
  const directSymbolDependencies = (symbol: ts.Symbol): readonly ts.Symbol[] => {
    const cached = symbolDependencyCache.get(symbol);
    if (cached !== undefined) {
      return cached;
    }
    const dependencies = new Set<ts.Symbol>();
    const referencedPaths = new Set<string>();
    symbolDependencyCache.set(symbol, []);
    symbolReferencePathCache.set(symbol, []);

    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      const immediateAlias = checker.getImmediateAliasedSymbol(symbol);
      if (immediateAlias !== undefined && immediateAlias !== symbol) {
        dependencies.add(immediateAlias);
      }
      const finalAlias = checker.getAliasedSymbol(symbol);
      if (finalAlias !== symbol) {
        dependencies.add(finalAlias);
      }
    }

    if ((symbol.flags & ts.SymbolFlags.Module) !== 0) {
      for (const moduleExport of checker.getExportsOfModule(symbol)) {
        if (moduleExport !== symbol) {
          dependencies.add(moduleExport);
        }
      }
    }

    for (const declaration of symbol.declarations ?? []) {
      const declarationPath = host.canonicalPath(
        declaration.getSourceFile().fileName
      );
      if (
        isExternalDeclarationPath(repositoryRoot, declarationPath) ||
        isPathInside(engineRoot, declarationPath)
      ) {
        continue;
      }

      if (
        ts.isNamespaceExport(declaration) ||
        ts.isNamespaceImport(declaration) ||
        ts.isImportEqualsDeclaration(declaration)
      ) {
        const enclosingReference = findModuleReferenceOwner(
          declaration,
          moduleReferenceByNode
        );
        const enclosingModuleSymbol = moduleSymbolForReference(enclosingReference);
        if (enclosingModuleSymbol !== null && enclosingModuleSymbol !== symbol) {
          dependencies.add(enclosingModuleSymbol);
        }
      }

      if (ts.isSourceFile(declaration)) {
        continue;
      }

      const roots: ts.Node[] = [declaration];
      const bindingOwner = owningBindingDeclaration(declaration);
      if (bindingOwner !== null) {
        roots.push(bindingOwner);
      }
      const visitedNodes = new Set<ts.Node>();
      const visit = (node: ts.Node): void => {
        if (visitedNodes.has(node)) {
          return;
        }
        visitedNodes.add(node);

        if (
          (ts.isIdentifier(node) || ts.isQualifiedName(node)) &&
          !isAccessChainQualifier(node)
        ) {
          const referencedSymbol = checker.getSymbolAtLocation(node);
          if (referencedSymbol !== undefined && referencedSymbol !== symbol) {
            dependencies.add(referencedSymbol);
          }
        }

        const reference = moduleReferenceByNode.get(node);
        if (reference !== undefined && reference.resolvedPath !== null) {
          referencedPaths.add(reference.resolvedPath);
        }
        const referencedModuleSymbol = moduleSymbolForReference(reference ?? null);
        if (referencedModuleSymbol !== null && referencedModuleSymbol !== symbol) {
          dependencies.add(referencedModuleSymbol);
        }

        ts.forEachChild(node, visit);
      };
      for (const root of roots) {
        visit(root);
      }
    }

    const collected = [...dependencies];
    symbolDependencyCache.set(symbol, collected);
    symbolReferencePathCache.set(symbol, uniqueSorted(referencedPaths));
    return collected;
  };

  const indexPath = host.canonicalPath(resolve(repositoryRoot, "shared/index.ts"));
  const indexSourceFile = sourceFileByCanonicalPath.get(indexPath);
  const directCanonicalExports = new Set<string>();
  if (indexSourceFile !== undefined) {
    for (const statement of indexSourceFile.statements) {
      if (
        !ts.isExportDeclaration(statement) ||
        statement.moduleSpecifier === undefined ||
        (!ts.isStringLiteral(statement.moduleSpecifier) &&
          !ts.isNoSubstitutionTemplateLiteral(statement.moduleSpecifier)) ||
        statement.exportClause === undefined ||
        !ts.isNamedExports(statement.exportClause)
      ) {
        continue;
      }
      const moduleReference = moduleReferenceByNode.get(statement);
      if (
        moduleReference?.resolvedPath === null ||
        moduleReference === undefined ||
        !canonicalSandboxPaths.has(moduleReference.resolvedPath)
      ) {
        continue;
      }
      for (const specifier of statement.exportClause.elements) {
        const exportedName = specifier.name.text;
        const sourceName = specifier.propertyName?.text ?? exportedName;
        const kind = statement.isTypeOnly || specifier.isTypeOnly ? "type" : "value";
        const allowed =
          kind === "type"
            ? input.canonicalTypeExportNames.has(exportedName)
            : input.canonicalValueExportNames.has(exportedName);
        if (allowed && exportedName === sourceName) {
          directCanonicalExports.add(exportedName);
        }
      }
    }
  }

  const exportProvenance: SandboxSecurityExportProvenance[] = [];
  const indexModuleSymbol =
    indexSourceFile === undefined
      ? undefined
      : checker.getSymbolAtLocation(indexSourceFile);
  if (indexModuleSymbol === undefined) {
    violations.push("TypeScript checker must resolve shared/index.ts module symbol");
  } else {
    for (const exportedSymbol of checker.getExportsOfModule(indexModuleSymbol)) {
      const queue: ts.Symbol[] = [exportedSymbol];
      const visitedSymbols = new Set<ts.Symbol>();
      const originPaths = new Set<string>();

      while (queue.length > 0) {
        const currentSymbol = queue.shift();
        if (currentSymbol === undefined || visitedSymbols.has(currentSymbol)) {
          continue;
        }
        visitedSymbols.add(currentSymbol);
        for (const declaration of currentSymbol.declarations ?? []) {
          originPaths.add(
            host.canonicalPath(declaration.getSourceFile().fileName)
          );
        }
        const dependencies = directSymbolDependencies(currentSymbol);
        for (const referencedPath of
          symbolReferencePathCache.get(currentSymbol) ?? []) {
          originPaths.add(referencedPath);
        }
        for (const dependency of dependencies) {
          if (!visitedSymbols.has(dependency)) {
            queue.push(dependency);
          }
        }
      }

      const canonicalSandboxOriginPaths = uniqueSorted(
        [...originPaths].filter((originPath) =>
          canonicalSandboxPaths.has(originPath)
        )
      );
      const engineOriginPaths = uniqueSorted(
        [...originPaths].filter((originPath) =>
          isPathInside(engineRoot, originPath)
        )
      );
      const exportedName = exportedSymbol.getName();
      const directCanonicalExport = directCanonicalExports.has(exportedName);
      exportProvenance.push({
        exportedName,
        originPaths: uniqueSorted(originPaths),
        canonicalSandboxOriginPaths,
        engineOriginPaths,
        directCanonicalExport
      });

      if (engineOriginPaths.length > 0) {
        violations.push(
          `shared package export ${exportedName} originates in engines/**: ${engineOriginPaths.join(", ")}`
        );
      }
      if (
        canonicalSandboxOriginPaths.length > 0 &&
        !directCanonicalExport
      ) {
        violations.push(
          `shared package export ${exportedName} reaches canonical sandbox security declarations without a direct same-name A/B export row`
        );
      }
    }
  }

  return {
    rootNames,
    diagnostics: uniqueSorted(diagnostics),
    moduleReferences: moduleReferences.sort((left, right) => {
      const sourceOrder = left.sourcePath.localeCompare(right.sourcePath);
      if (sourceOrder !== 0) {
        return sourceOrder;
      }
      const kindOrder = left.kind.localeCompare(right.kind);
      if (kindOrder !== 0) {
        return kindOrder;
      }
      return (left.moduleSpecifier ?? "").localeCompare(
        right.moduleSpecifier ?? ""
      );
    }),
    exports: exportProvenance.sort((left, right) =>
      left.exportedName.localeCompare(right.exportedName)
    ),
    violations: uniqueSorted(violations)
  };
}
