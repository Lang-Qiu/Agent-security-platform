# Track 1 Controlled Attack Replay Scripts

## Purpose

Each script under this directory is a thin, deterministic entrypoint that replays one Track 1 scenario fixture set. The scripts compile the fixed repository fixture files into normalized sandbox supervision results without calling a real model, executing any simulated tool, or accessing the network.

## Execution

```bash
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-001/replay.ts
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-002/replay.ts
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-003/replay.ts
```

## Output Contract

- **stdout:** A single JSON array containing exactly three `BaseResult<SandboxRunResultDetails>` objects. No pretty-printing, no trailing newline.
- **stderr:** Empty on success. On controlled failure, a single line `<error_code>: <message>\n`. On unexpected failure, `replay_result_invalid: Unexpected replay failure\n`.
- **Exit code:** `0` on success, `1` on any failure.

## Determinism Guarantee

Every run of the same script produces byte-for-byte identical stdout. All identifiers, hashes, timestamps, event sequences, and evidence references are derived from fixed inputs and a single replay epoch (`2026-06-28T00:00:00.000Z`).

## Controlled-Research Prohibitions

These scripts:
- Do not invoke a real model or LLM API.
- Do not execute `SimulatedToolExecutor` or call `.execute(`.
- Do not open network connections (`node:http`, `node:https`, `node:net`, `fetch`).
- Do not call external processes.
- Do not use `Date.now()`, `Math.random()`, or non-deterministic UUID generation.
- Do not accept CLI arguments, environment-based paths, model names, URLs, or output destinations.

All raw fixture content (prompts, retrieved text, memory content, tool argument values) is replaced with SHA-256 hashes and stable reference URIs in the output.
