# Spec: Track 1 Simulated Business Tools

## Objective

`REQ-T1-MOCK-TOOLS-004` provides deterministic, non-networked implementations of the four business tools referenced by the Track 1 scenario and case-set contracts:

- `send_email`
- `read_file`
- `write_file`
- `call_api`

The tools let later replay, monitoring, sandbox-policy, UI, and report requirements exercise observable business actions without sending email, touching host files, or calling a network. Success means every existing Track 1 case can name a real executable simulation boundary while all side effects remain inside explicitly injected in-memory state.

## Assumptions

1. This requirement delivers both the tool contract and a minimal executable in-memory implementation; a types-only contract would not yet satisfy the contest's simulated-tool outcome.
2. The contract remains private to `engines/sandbox` for now. It is not promoted to `shared/` until a later requirement proves that backend or frontend consumers need it.
3. Tool safety rejection and sandbox policy decisions are different concepts. This requirement may reject an invalid or non-local target, but it does not emit `allow`, `deny`, `ask`, or `alert`; those decisions belong to `REQ-T1-SANDBOX-CONTRACT-005`.
4. State persists only within one explicitly created executor/state instance so tests can prove read-after-write and outbox behavior. There is no database, disk persistence, or cross-process state.
5. Requests and results use snake_case because they are fixture-facing serialized boundaries.

## Contract

The request is a discriminated union keyed by `tool_name`.

```typescript
export type SimulatedToolRequest =
  | {
      call_id: string;
      session_id: string;
      scenario_id: string;
      case_id: string;
      tool_name: "send_email";
      arguments: { recipient: string; subject: string; body: string };
    }
  | {
      call_id: string;
      session_id: string;
      scenario_id: string;
      case_id: string;
      tool_name: "read_file";
      arguments: { path: string };
    }
  | {
      call_id: string;
      session_id: string;
      scenario_id: string;
      case_id: string;
      tool_name: "write_file";
      arguments: { path: string; content: string };
    }
  | {
      call_id: string;
      session_id: string;
      scenario_id: string;
      case_id: string;
      tool_name: "call_api";
      arguments: {
        endpoint: string;
        method: "GET" | "POST";
        body?: Record<string, unknown>;
      };
    };
```

Runtime input normalization must reject unknown fields, missing context IDs, unsupported tool names, and invalid argument shapes before execution.

The result is also discriminated by `tool_name` and uses one consistent outer envelope:

```typescript
export interface SimulatedToolResult<TOutput> {
  call_id: string;
  session_id: string;
  scenario_id: string;
  case_id: string;
  tool_name: SimulatedToolName;
  status: "simulated_success" | "rejected";
  summary: string;
  output?: TOutput;
  rejection_code?: "target_not_allowed" | "resource_not_found";
  evidence: {
    evidence_ref: string;
    simulated: true;
    target_ref: string;
    state_change: "none" | "outbox_append" | "virtual_file_write";
  };
}
```

Expected safety boundaries:

- `send_email` accepts only recipients under the reserved `local.invalid` domain and appends to an in-memory outbox.
- `read_file` and `write_file` accept only normalized `sandbox://fixtures/` paths without traversal segments.
- `call_api` accepts only `mock://api.local/` endpoints and resolves responses from an injected route map.
- Rejected operations leave state unchanged.
- No implementation imports host filesystem, SMTP, HTTP-client, or network libraries.

## Tech Stack

- Node.js `>=22.19.0`
- TypeScript with Node's type-stripping test runner
- Existing `engines/sandbox` ownership boundary
- No new runtime or test dependency

## Commands

Run from the repository root:

```powershell
node --experimental-strip-types --test engines/sandbox/tests/simulated-tools.spec.ts
npm.cmd run test:engine:sandbox
npm.cmd run test:repo
npm.cmd run test
```

The repository currently has one unrelated backend baseline failure in the asset-scan expectation test; requirement completion must report it rather than changing it.

## Project Structure

```text
engines/sandbox/
  src/simulated-tools/
    contract.ts       # discriminated request/result types and runtime normalizer
    state.ts          # injected in-memory outbox, virtual files, and mock API routes
    executor.ts       # safe dispatch and deterministic tool behavior
    index.ts          # engine-private exports
  tests/
    simulated-tools.spec.ts
  README.md

docs/
  sprint-current.md
  architecture.md
  progress.md
```

No backend, frontend, public REST API, or shared contract file is changed by this requirement.

## Code Style

- Source identifiers are English.
- Serialized fields and fixture-facing values use `snake_case`.
- Tool variants use discriminated unions rather than optional argument bags.
- Runtime validation occurs once at the untrusted request boundary.
- Expected safety rejection is returned as structured data; unexpected programmer errors are not disguised as successful tool results.

## Testing Strategy

Follow strict RED -> GREEN increments:

1. Contract tests fail before the request normalizer and discriminated types exist.
2. Email tests prove reserved-domain enforcement, outbox append, and no delivery side effect.
3. File tests prove virtual read/write, read-after-write, path allowlisting, and traversal rejection.
4. API tests prove route-map lookup, GET/POST behavior, unknown-route rejection, and no network access.
5. Cross-tool tests prove all four tool names from the scenario manifest are implemented and rejected calls do not mutate state.
6. Root configuration tests prove `test:engine:sandbox` is included in the full test gate.

## Boundaries

Always:

- Use only injected in-memory state.
- Preserve `call_id`, scenario ID, case ID, and session ID for later evidence correlation.
- Return deterministic evidence references.
- Reject targets outside the controlled schemes before state access.
- Keep the executor independent from backend task orchestration.

Ask first:

- Promoting the tool contract into `shared/`.
- Adding a public API endpoint or changing `SandboxRunResultDetails`.
- Adding persistence, external services, or a new dependency.
- Introducing policy decisions or sandbox event contracts in this requirement.

Never:

- Send real email.
- Read or write host files.
- Call real HTTP, HTTPS, or other external endpoints.
- Accept real credentials or tokens.
- Target third-party systems.
- Report a rejected operation as simulated success.

## Success Criteria

- All four scenario-manifest tool names have typed request variants and executable in-memory behavior.
- Invalid runtime requests and unknown fields are rejected before execution.
- Email actions affect only the in-memory outbox.
- File actions affect only the virtual `sandbox://fixtures/` map.
- API actions resolve only against the `mock://api.local/` route map.
- Rejected operations produce stable rejection codes and leave state unchanged.
- Results contain deterministic evidence metadata that later sandbox events can wrap.
- Focused sandbox tests and `test:repo` pass.
- Architecture, engine README, sprint, and progress documentation reflect the implemented boundary.

## Decision

The tool contract remains engine-private and uses deterministic per-instance in-memory execution. Safety rejection stays separate from `allow` / `deny` / `ask` / `alert` policy decisions.
