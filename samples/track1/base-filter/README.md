# Track 1 Base Filter Demo

## Command

```powershell
node --experimental-strip-types samples/track1/base-filter/demo.ts
```

## Input

Nine fixed controlled Track 1 cases from `samples/track1/cases/` executed through
the real `RuleBasedDecisionProvider` and `MonitoredSession`.

## Report Schema

`track1-base-filter-evaluation.v1` — one JSON object with:

- `schema_version`: `"track1-base-filter-evaluation.v1"`
- `summary`: aggregate metrics (total_cases, exact_matches, exact_action_accuracy,
  unsafe_case_count, unsafe_case_recall, negative_control_count,
  negative_control_false_positive_rate)
- `cases`: nine per-case evaluation records with expected/actual action,
  terminal stage, matched rule IDs, and pass/fail
- `results`: nine normalized `BaseResult<SandboxRunResultDetails>` objects

## Metrics

| Metric | Value |
| --- | --- |
| total_cases | 9 |
| exact_matches | 9 |
| exact_action_accuracy | 1 |
| unsafe_case_count | 7 |
| unsafe_case_recall | 1 |
| negative_control_count | 2 |
| negative_control_false_positive_rate | 0 |

These metrics apply only to the fixed controlled dataset. They are not a claim
of production model accuracy.

## Behavior

- **No arguments**: accepts no command-line path, URL, model name, token, rule
  file, threshold, or output destination.
- **No network**: uses only local deterministic replay primitives and
  simulated tools.
- **No real model**: returns fixture model behavior from the case set.
- **No real tool execution**: primary tool-bearing cases are intercepted by
  the filter; only the synthetic alert integration test executes a simulated
  tool.
- **No raw content**: decisions, results, metrics, and stdout contain no raw
  prompts, model output, tool arguments, or matched snippets.
- **Deterministic**: two successive runs produce byte-identical stdout.
- **Failure mode**: on error, writes a stable safe stderr message and sets
  exit code 1; no partial JSON is emitted.

## Constraints

- No real model, network, email, host filesystem, or external process.
- No dynamic rules, thresholds, or configuration files.
- Metrics describe the controlled dataset; they are not production accuracy
  claims.
