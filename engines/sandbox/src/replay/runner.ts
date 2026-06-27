import type { BaseResult } from "../../../../shared/types/result.ts";
import type { SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import { normalizeBaseResult } from "../../../../shared/contracts/result.ts";
import {
  TRACK1_SCENARIO_IDS,
  Track1ReplayError
} from "./contract.ts";
import type {
  Track1ReplayEntrypointPorts,
  Track1ScenarioId
} from "./contract.ts";
import { compileTrack1ReplayCase } from "./compiler.ts";
import { loadTrack1ReplayScenario } from "./loader.ts";

// -- scenario compilation ------------------------------------------------

export function runTrack1ScenarioReplay(
  scenarioId: Track1ScenarioId
): BaseResult<SandboxRunResultDetails>[] {
  const bundle = loadTrack1ReplayScenario(scenarioId);
  const { scenario, cases } = bundle;

  const results: BaseResult<SandboxRunResultDetails>[] = [];

  // Compile all cases (already sorted by case_id from loader)
  for (const fixture of cases) {
    const result = compileTrack1ReplayCase(scenario, fixture);
    results.push(result as BaseResult<SandboxRunResultDetails>);
  }

  // Ensure exactly 3 unique expected case IDs
  const caseIds = results.map(
    (r) =>
      ((r.metadata as Record<string, unknown>)?.replay as Record<string, unknown>)
        ?.case_id as string
  );
  const uniqueCaseIds = new Set(caseIds);

  if (uniqueCaseIds.size !== 3) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${scenarioId}: expected 3 unique case IDs, got ${uniqueCaseIds.size}`
    );
  }

  // Verify every result still passes normalizeBaseResult
  for (const result of results) {
    const recheck = normalizeBaseResult(result);
    if (!recheck) {
      throw new Track1ReplayError(
        "replay_result_invalid",
        `${scenarioId}: compiled result failed re-normalization`
      );
    }
  }

  // Compute scenario-wide event-type union and check required events
  const allEventTypes = new Set<string>();
  for (const result of results) {
    const details = result.details as SandboxRunResultDetails;
    if (details.events) {
      for (const event of details.events) {
        allEventTypes.add(event.event_type);
      }
    }
  }

  const requiredEvents = scenario.attack_script_requirements.required_events;
  for (const required of requiredEvents) {
    if (!allEventTypes.has(required)) {
      throw new Track1ReplayError(
        "manifest_mismatch",
        `${scenarioId}: required event "${required}" not found in scenario union`
      );
    }
  }

  return results;
}

// -- serialization -------------------------------------------------------

export function serializeTrack1ScenarioReplay(
  scenarioId: Track1ScenarioId
): string {
  const results = runTrack1ScenarioReplay(scenarioId);
  return JSON.stringify(results);
}

// -- atomic CLI entrypoint -----------------------------------------------

const nodeEntrypointPorts: Track1ReplayEntrypointPorts = {
  run: runTrack1ScenarioReplay,
  writeStdout: (value: string) => process.stdout.write(value),
  writeStderr: (value: string) => process.stderr.write(value),
  setExitCode: (value: number) => {
    process.exitCode = value;
  }
};

export function executeTrack1ReplayEntrypoint(
  scenarioId: Track1ScenarioId,
  ports?: Track1ReplayEntrypointPorts
): void {
  const p = ports ?? nodeEntrypointPorts;

  try {
    const results = p.run(scenarioId);
    const serialized = JSON.stringify(results);
    p.writeStdout(serialized);
  } catch (err: unknown) {
    if (err instanceof Track1ReplayError) {
      p.writeStderr(`${err.code}: ${err.message}\n`);
      p.setExitCode(1);
    } else {
      p.writeStderr("replay_result_invalid: Unexpected replay failure\n");
      p.setExitCode(1);
    }
  }
}
