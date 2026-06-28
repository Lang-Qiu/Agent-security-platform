# Track 1 Monitor Plugin Demo

## Command

```powershell
node --experimental-strip-types samples/track1/monitor-plugin/demo.ts
```

## Output Contract

- **Success (exit 0):** Writes one JSON array of 9 normalized `BaseResult<SandboxRunResultDetails>` objects to stdout. stderr is empty.
- **Failure (exit 1):** Writes a single `<error-code>: <safe-message>` line to stderr. stdout is empty.

## Behavior

- Deterministic — repeated runs produce byte-identical stdout.
- No CLI arguments, environment variables, or configuration files.
- Uses only simulated tools and fixture data. No real model, network, email, filesystem, or API calls.
- Raw prompt, model output, tool arguments, tool output, and exceptions are absent from all output.

## Detection Logic

Detection rules are not implemented. This demo exercises the monitoring boundary. REQ-008 will inject the first real detection provider.

## References

- REQ-T1-MONITOR-PLUGIN-007 design: `docs/superpowers/specs/2026-06-28-track1-monitor-plugin-design.md`
- REQ-008 provider boundary: detection logic and base-model filter (future)
