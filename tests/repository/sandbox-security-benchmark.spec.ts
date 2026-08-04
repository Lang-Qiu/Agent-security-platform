import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BENCHMARK_ROOT = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security"
);
const PRODUCTION_ROOT = resolve(
  REPO_ROOT,
  "engines/sandbox/src/security-production"
);
const CORPUS_ROOT = resolve(
  REPO_ROOT,
  "samples/sandbox-security-benchmark/v1"
);

const PUBLIC_BENCHMARK_ENTRIES = Object.freeze([
  "accept-live.ts",
  "capture-candidate.ts",
  "capture-live-worker.ts",
  "capture-live.ts",
  "capture-sink.ts",
  "candidate-progress.ts",
  "contracts.ts",
  "evaluate-live-worker.ts",
  "evaluate.ts",
  "fs-snapshot.ts",
  "import-sources.ts",
  "p6-acceptance-protocol.ts",
  "p6-acceptance-public-key.pem",
  "p6-live-judge-binding.ts",
  "prepare-capture-bundle.ts",
  "prepare-live-worker.ts",
  "replay-hermetic.ts",
  "replay-transport.ts",
  "seal-live-worker.ts",
  "seal.ts",
  "stage-protocol.ts",
  "tsconfig.json",
  "validate-corpus.ts"
] as const);

const CORPUS_ENTRIES = Object.freeze([
  "ATTRIBUTION.md",
  "inputs",
  "manifest.json",
  "request-ids",
  "reviews",
  "sources.lock.json",
  "truth"
] as const);

const PRODUCTION_ORACLE_IMPORT =
  /(?:samples\/sandbox-security-benchmark|scripts\/benchmark\/sandbox-security|(?:^|["'])\.\.?\/.*(?:replay-hermetic|replay-transport|evaluate)\.ts)/u;
const PRODUCTION_ORACLE_FIELD =
  /\b(?:fixture_id|verdict_class|ground_truth_severity|transformation_kind|seed_record_ref|expected_action)\b/u;
const NETWORK_IMPORT =
  /from\s+["']node:(?:http|https|http2|net|tls|dgram|dns)["']/u;

function readPackage(): Readonly<{
  scripts: Readonly<Record<string, string>>;
}> {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, "package.json"), "utf8")
  ) as Readonly<{ scripts: Readonly<Record<string, string>> }>;
}

function sourceEntries(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      assert.equal(
        entry.isSymbolicLink(),
        false,
        `${root}/${entry.name} must not be a symbolic link`
      );
      return entry.name;
    });
}

function sourceFiles(root: string): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `${path} is a symbolic link`);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && /\.ts$/u.test(entry.name)) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files.sort();
}

test("REQ-SBX-GENERAL-002 package registers benchmark gates without live qualification in test:all", () => {
  const scripts = readPackage().scripts;
  const repository = scripts["test:repo"] ?? "";
  const all = scripts["test:all"] ?? "";
  const production = scripts["test:engine:sandbox:production"] ?? "";

  assert.match(repository, /tests\/repository\/sandbox-security-benchmark\.spec\.ts/u);
  assert.match(production, /sandbox-security-production-/u);
  assert.match(
    scripts["test:repo:sandbox-security-production"] ?? "",
    /sandbox-security-production\.spec\.ts.*sandbox-security-benchmark\.spec\.ts/u
  );
  assert.match(
    scripts["typecheck:benchmark:sandbox-security"] ?? "",
    /scripts\/benchmark\/sandbox-security\/tsconfig\.json/u
  );
  assert.match(
    scripts["benchmark:sandbox-security:validate"] ?? "",
    /validate-corpus\.ts/u
  );
  assert.match(
    scripts["benchmark:sandbox-security:replay"] ?? "",
    /unshare\s+--net/u
  );
  assert.match(
    scripts["benchmark:sandbox-security:replay"] ?? "",
    /replay-hermetic\.ts/u
  );
  assert.match(
    scripts["benchmark:sandbox-security:qualify:live"] ?? "",
    /\.env\.sandbox-security\.local/u
  );
  assert.match(all, /test:engine:sandbox:production/u);
  assert.match(all, /typecheck:benchmark:sandbox-security/u);
  assert.match(all, /benchmark:sandbox-security:validate/u);
  assert.match(all, /benchmark:sandbox-security:replay/u);
  assert.doesNotMatch(all, /qualify:live|prepare-capture-bundle/u);
});

test("REQ-SBX-GENERAL-002 production source has no benchmark oracle or extra capability edge", () => {
  assert.ok(existsSync(PRODUCTION_ROOT));
  for (const path of sourceFiles(PRODUCTION_ROOT)) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(
      text,
      PRODUCTION_ORACLE_IMPORT,
      `${path} imports benchmark or replay implementation`
    );
    assert.doesNotMatch(
      text,
      PRODUCTION_ORACLE_FIELD,
      `${path} contains a benchmark truth field`
    );
    if (!path.endsWith("/http-transport.ts")) {
      assert.doesNotMatch(
        text,
        NETWORK_IMPORT,
        `${path} owns a network import outside http-transport.ts`
      );
    }
    if (!path.endsWith("/production-config.ts")) {
      assert.doesNotMatch(
        text,
        /process\.env/u,
        `${path} reads process.env outside production-config.ts`
      );
    }
  }
});

test("REQ-SBX-GENERAL-002 benchmark and corpus roots retain exact public layout", () => {
  const benchmarkEntries = sourceEntries(BENCHMARK_ROOT);
  assert.deepEqual(
    benchmarkEntries.filter((entry) => entry !== ".p6-acceptance-private-key.pem"),
    [...PUBLIC_BENCHMARK_ENTRIES].sort()
  );
  assert.deepEqual(sourceEntries(CORPUS_ROOT), [...CORPUS_ENTRIES].sort());
});

test("REQ-SBX-GENERAL-002 hermetic replay command closes credentials and network", async () => {
  const replay = readFileSync(
    join(BENCHMARK_ROOT, "replay-hermetic.ts"),
    "utf8"
  );
  const transport = readFileSync(
    join(BENCHMARK_ROOT, "replay-transport.ts"),
    "utf8"
  );
  assert.match(replay, /--permission/u);
  assert.match(replay, /--allow-fs-read=/u);
  assert.match(replay, /--allow-fs-write=/u);
  assert.match(replay, /["']--net["']/u);
  assert.match(replay, /SANDBOX_SECURITY_JUDGE_API_KEY:\s*undefined/u);
  assert.match(replay, /SANDBOX_SECURITY_JUDGE_BASE_URL:\s*undefined/u);
  assert.match(replay, /SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST:\s*undefined/u);
  assert.match(replay, /openai_key_present:\s*false/u);
  assert.match(transport, /assertDrained/u);
  assert.match(transport, /waitForTermination/u);
  assert.match(replay, /evaluate\.ts/u);
  assert.match(replay, /--child=engine/u);
  assert.match(replay, /--child=evaluator/u);
  assert.match(replay, /assertHermeticChildPermissionBoundary/u);
  assert.match(replay, /anonymous-inputs/u);
  assert.doesNotMatch(
    replay,
    /const\s+inputRoot\s*=\s*join\(CORPUS_ROOT,\s*["']inputs["']\)/u
  );
  assert.doesNotMatch(replay, /\.p6-acceptance-private-key\.pem/u);
  assert.match(replay, /inputs_tree_sha256/u);
  assert.match(replay, /hashSandboxSecurityBenchmarkTree/u);
  assert.match(replay, /childError/u);
  assert.doesNotMatch(replay, /process\.env\s*\)/u);
});

test("REQ-SBX-GENERAL-002 hermetic replay binds the real capture manifest schema", () => {
  const replay = readFileSync(
    join(BENCHMARK_ROOT, "replay-hermetic.ts"),
    "utf8"
  );
  assert.doesNotMatch(replay, /manifest\.fixture_count/u);
  assert.match(replay, /accepted\.capture\.inputs\.length/u);
});

test("REQ-SBX-GENERAL-002 durable docs name the production factory and hermetic replay command", () => {
  for (const path of ["README.md", "docs/architecture.md", "docs/api-contract.md"]) {
    const text = readFileSync(join(REPO_ROOT, path), "utf8");
    assert.match(text, /createSandboxSecurityProductionEngine/u, path);
    assert.match(text, /benchmark:sandbox-security:replay/u, path);
  }
});

test("REQ-SBX-GENERAL-002 durable docs separate live qualification from ordinary test:all", () => {
  const text = [
    readFileSync(join(REPO_ROOT, "README.md"), "utf8"),
    readFileSync(join(REPO_ROOT, "docs/architecture.md"), "utf8"),
    readFileSync(join(REPO_ROOT, "docs/api-contract.md"), "utf8"),
    readFileSync(join(REPO_ROOT, "docs/sprint-current.md"), "utf8"),
    readFileSync(join(REPO_ROOT, "docs/progress.md"), "utf8")
  ].join("\n");
  assert.match(text, /benchmark:sandbox-security:qualify:live/u);
  assert.match(text, /test:all/u);
  assert.match(text, /(?:never|not|excluded|排除).{0,80}test:all/isu);
});

test("REQ-SBX-GENERAL-002 durable docs record the pending P6 boundary and reviewed P7 status", () => {
  const text = [
    readFileSync(join(REPO_ROOT, "docs/sprint-current.md"), "utf8"),
    readFileSync(join(REPO_ROOT, "docs/progress.md"), "utf8")
  ].join("\n");
  assert.match(text, /P7-T2/u);
  assert.match(text, /P0\/P1[^\n]*(?:none|无|0)/iu);
  assert.match(
    text,
    /durable documentation contains no raw provider payload[\s\S]{0,120}(?:benchmark truth|oracle output)/iu
  );
  assert.match(text, /P6 formal acceptance[^\n]*(?:absent|missing|未)/iu);
  assert.match(text, /GENERAL-002[^\n]*not[^\n]*VERIFIED/iu);
});
