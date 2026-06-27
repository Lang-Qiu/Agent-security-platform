import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

// -- helper: read text file ----------------------------------------------

function readTextFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

// -- helper: scan all replay source files ---------------------------------

function getReplaySourceFiles(): string[] {
  const replayDir = resolve(REPO_ROOT, "engines", "sandbox", "src", "replay");
  const files: string[] = [];

  try {
    const entries = readdirSync(replayDir, { recursive: true });
    for (const entry of entries) {
      if (typeof entry === "string" && entry.endsWith(".ts")) {
        files.push(resolve(replayDir, entry));
      }
    }
  } catch {
    // directory doesn't exist
  }

  return files;
}

function getAttackScriptFiles(): string[] {
  const scriptsDir = resolve(REPO_ROOT, "samples", "track1", "attack-scripts");
  const files: string[] = [];

  try {
    const entries = readdirSync(scriptsDir, { recursive: true });
    for (const entry of entries) {
      if (typeof entry === "string" && entry.endsWith(".ts")) {
        files.push(resolve(scriptsDir, entry));
      }
    }
  } catch {
    // directory doesn't exist
  }

  return files;
}

function readAllReplaySource(): string {
  const files = [...getReplaySourceFiles(), ...getAttackScriptFiles()];
  return files.map((f) => readFileSync(f, "utf8")).join("\n");
}

// -- gate tests ----------------------------------------------------------

test("REQ-T1-ATTACK-REPLAY-006: gate - manifest entrypoint paths exist", () => {
  const manifest = JSON.parse(
    readTextFile("samples/track1/scenarios/track1-scenarios.v1.json")
  );

  for (const scenario of manifest.scenarios) {
    const entrypoint = scenario.attack_script_requirements.entrypoint;
    const fullPath = resolve(REPO_ROOT, entrypoint);
    assert.ok(
      existsSync(fullPath),
      `entrypoint must exist: ${entrypoint}`
    );
  }
});

test("REQ-T1-ATTACK-REPLAY-006: gate - each script imports sandbox replay and binds matching ID", () => {
  const manifest = JSON.parse(
    readTextFile("samples/track1/scenarios/track1-scenarios.v1.json")
  );

  for (const scenario of manifest.scenarios) {
    const entrypoint = scenario.attack_script_requirements.entrypoint;
    const content = readTextFile(entrypoint);
    const scenarioId = scenario.scenario_id;

    assert.ok(
      content.includes("engines/sandbox/src/replay/index.ts"),
      `${scenarioId}: must import sandbox replay module`
    );
    assert.ok(
      content.includes(`executeTrack1ReplayEntrypoint("${scenarioId}")`),
      `${scenarioId}: must bind matching scenario ID`
    );
  }
});

test("REQ-T1-ATTACK-REPLAY-006: gate - replay source has no network/process imports", () => {
  const source = readAllReplaySource();

  const forbiddenImports = [
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "node:child_process"
  ];

  for (const forbidden of forbiddenImports) {
    assert.ok(
      !source.includes(`"${forbidden}"`) && !source.includes(`'${forbidden}'`),
      `replay source must not import ${forbidden}`
    );
  }
});

test("REQ-T1-ATTACK-REPLAY-006: gate - replay source has no forbidden runtime patterns", () => {
  const source = readAllReplaySource();

  const forbiddenPatterns = [
    "Date.now",
    "Math.random",
    "randomUUID",
    "fetch(",
    "new SimulatedToolExecutor",
    ".execute("
  ];

  for (const pattern of forbiddenPatterns) {
    assert.ok(
      !source.includes(pattern),
      `replay source must not contain ${pattern}`
    );
  }
});

test("REQ-T1-ATTACK-REPLAY-006: gate - replay code has no output-file API", () => {
  const source = readAllReplaySource();

  const outputApis = [
    "writeFileSync",
    "writeFile",
    "createWriteStream",
    "fs.write"
  ];

  for (const api of outputApis) {
    assert.ok(
      !source.includes(api),
      `replay source must not contain ${api}`
    );
  }
});

test("REQ-T1-ATTACK-REPLAY-006: gate - scripts contain no argument parsing", () => {
  for (const scriptFile of getAttackScriptFiles()) {
    const content = readFileSync(scriptFile, "utf8");
    assert.ok(
      !content.includes("process.argv"),
      `${scriptFile}: must not parse CLI arguments`
    );
    assert.ok(
      !content.includes("process.env"),
      `${scriptFile}: must not read environment variables`
    );
  }
});

test("REQ-T1-ATTACK-REPLAY-006: gate - serialized output omits all raw fixture content", async () => {
  // Dynamically import replay to produce output
  const replay = await import(
    "../../engines/sandbox/src/replay/runner.ts"
  );

  const { loadTrack1ReplayScenario } = await import(
    "../../engines/sandbox/src/replay/loader.ts"
  );

  const TRACK1_SCENARIO_IDS = ["T1-SC-001", "T1-SC-002", "T1-SC-003"] as const;

  for (const scenarioId of TRACK1_SCENARIO_IDS) {
    const serialized = replay.serializeTrack1ScenarioReplay(scenarioId);
    const bundle = loadTrack1ReplayScenario(scenarioId);

    for (const fixture of bundle.cases) {
      // No raw prompt
      assert.ok(
        !serialized.includes(fixture.input.user_prompt),
        `${fixture.case_id}: serialized output must not contain raw prompt`
      );

      // No raw retrieved content
      for (const content of fixture.input.retrieved_content) {
        assert.ok(
          !serialized.includes(content),
          `${fixture.case_id}: serialized output must not contain retrieved content`
        );
      }

      // No raw memory content
      for (const entry of fixture.input.memory_entries) {
        assert.ok(
          !serialized.includes(entry.content),
          `${fixture.case_id}: serialized output must not contain memory content`
        );
      }

      // No raw tool argument values
      if (fixture.input.proposed_tool_call) {
        const argValues = Object.values(
          fixture.input.proposed_tool_call.arguments
        );
        for (const val of argValues) {
          if (typeof val === "string" && val.length > 3) {
            assert.ok(
              !serialized.includes(val),
              `${fixture.case_id}: serialized output must not contain tool arg: ${val}`
            );
          }
        }
      }
    }
  }
});
