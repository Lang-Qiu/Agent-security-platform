# Phase 4 Pages and Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Complete one task, review it, commit its exact paths, and stop
> before starting the next task.

**Goal:** Wire the Phase 3 components to the Phase 2 services behind two new
routes, with a correct `Idempotency-Key` lifecycle, complete error surfacing,
and no submitted content or capability token in any URL.

**Architecture:** Pages own all state and all data loading; components stay
presentational. The capability token lives in page-level React state only. Route
registration reuses the existing `appRoutes`/`consoleNavigation` structures, so
`ConsoleLayout.getSelectedNavigationKey` picks the new paths up automatically
through `flattenNavigationKeys` — no layout change is required or permitted.

**Tech Stack:** React 19.2.4, react-router-dom 7.13.2, antd 6.3.4,
TypeScript 6.0.2, Vitest 4.1.1, `@testing-library/react` 16.3.2.

---

## Document Status

- Requirement: `REQ-SBX-GENERAL-005`
- Phase: 4 of 5
- Date: `2026-08-07`
- Status: `PLAN_DRAFT_PENDING_REVIEW`
- Canonical specification:
  `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`
- Predecessor: Phase 3 complete, committed, reviewed, all exit criteria met

---

## Entry Gate

- [ ] Confirm Phase 3's exit criteria hold, including exhaustive rendering of
  both discriminated unions.
- [ ] Read the approved spec sections `Route And Navigation Surface`,
  `Capability Session Model`, `Error Mapping`, and `Privacy Rules`.
- [ ] Record the baseline:

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
```

Expected: all Phase 1–3 suites green, 221 pre-existing tests unchanged.

---

## Locked Route Surface

```text
/sandbox-security/workbench   评估工作台
/sandbox-security/audit       审计事件
```

Navigation group key `sandbox-security`, Chinese label `沙箱安全`, two children.
The group is added after `results` and before `/review-demo`.

No route accepts a search parameter, hash fragment, or path segment that carries
submitted content, a capability token, or an audit cursor. The audit `limit` is
the only permitted query parameter, because it is a bounded integer and not
content.

---

## Locked Idempotency Lifecycle

This is the subtlest correctness requirement in the requirement. `GENERAL-003`
binds `(authorization scope, Idempotency-Key)` to a fingerprint of the canonical
request. Therefore:

1. A key is generated with `crypto.randomUUID()` at the moment the operator
   presses submit — never earlier, never per keystroke.
2. The key is held with the in-flight request.
3. **Retry of an unchanged payload reuses the same key**, so the backend replays
   the stored decision instead of re-evaluating. This is the entire point of the
   header.
4. **Any edit to the form invalidates the key.** The next submit generates a
   fresh one. Reusing a key after an edit would produce
   `SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT` (409), which is a client defect, not
   a backend error.
5. A key is never written to the URL, storage, or a log.

Both the reuse path and the invalidation path are asserted by tests.

---

### Task P4-T1: Evaluation Workbench Page

**Files:**
- Create: `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx`
- Create: `frontend/src/pages/sandbox-security-workbench.page.spec.tsx`

- [ ] **Step 1: Write the failing workbench test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SandboxSecurityWorkbenchPage } from "./SandboxSecurityWorkbenchPage";

const DECISION = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "decision:1",
  request_id: "req-1",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  verdict: "risk_detected",
  action: "deny",
  risk_level: "critical",
  findings: [],
  detector_runs: [],
  evidence_refs: [],
  created_at: "2026-08-07T00:00:00.000Z"
};

function okResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ success: true, message: "ok", data, error_code: null, request_id: "http:1" })
  } as unknown as Response;
}

function errorResponse(status: number, errorCode: string) {
  return {
    ok: false,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ success: false, message: "err", data: null, error_code: errorCode, request_id: "http:1" })
  } as unknown as Response;
}

async function pasteTokenAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/能力令牌/), "tok-abc");
  await user.type(screen.getByLabelText(/内容值/), "test payload");
}

describe("REQ-SBX-GENERAL-005 evaluation workbench page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks submission until a capability token is present", async () => {
    render(<SandboxSecurityWorkbenchPage />);
    await userEvent.type(screen.getByLabelText(/内容值/), "test payload");
    expect(screen.getByRole("button", { name: /提交评估/ })).toBeDisabled();
  });

  it("sends the bearer token and a generated idempotency key on submit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    const user = userEvent.setup();
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    await pasteTokenAndFill(user);
    await user.click(screen.getByRole("button", { name: /提交评估/ }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer tok-abc");
    expect(headers.get("idempotency-key")).toBeTruthy();
  });

  it("reuses the same idempotency key when retrying an unchanged payload", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE"))
      .mockResolvedValueOnce(okResponse(DECISION));
    const user = userEvent.setup();
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    await pasteTokenAndFill(user);
    await user.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /重试/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const first = new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);
    const second = new Headers((fetchImpl.mock.calls[1][1] as RequestInit).headers);
    expect(second.get("idempotency-key")).toBe(first.get("idempotency-key"));
  });

  it("generates a fresh idempotency key after the payload is edited", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    const user = userEvent.setup();
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    await pasteTokenAndFill(user);
    await user.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText(/内容值/), " changed");
    await user.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const first = new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);
    const second = new Headers((fetchImpl.mock.calls[1][1] as RequestInit).headers);
    expect(second.get("idempotency-key")).not.toBe(first.get("idempotency-key"));
  });

  it("renders the decision verdict and action after a successful evaluation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    const user = userEvent.setup();
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    await pasteTokenAndFill(user);
    await user.click(screen.getByRole("button", { name: /提交评估/ }));

    await waitFor(() => expect(screen.getByText("risk_detected")).toBeInTheDocument());
    expect(screen.getByText("deny")).toBeInTheDocument();
  });

  it("prompts for a new capability on 401 without clearing the form payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(401, "SANDBOX_SECURITY_UNAUTHORIZED"));
    const user = userEvent.setup();
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    await pasteTokenAndFill(user);
    await user.click(screen.getByRole("button", { name: /提交评估/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText(/内容值/)).toHaveValue("test payload");
  });

  it("never places submitted content or the token in the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    const user = userEvent.setup();
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    await pasteTokenAndFill(user);
    await user.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());

    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    expect(url).not.toContain("test payload");
    expect(url).not.toContain("tok-abc");
  });

  it("never persists submitted content or the token to storage", async () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(DECISION));
    const user = userEvent.setup();

    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    await pasteTokenAndFill(user);
    await user.click(screen.getByRole("button", { name: /提交评估/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());

    for (const spy of [localSet, sessionSet]) {
      for (const call of spy.mock.calls) {
        expect(String(call[1])).not.toContain("test payload");
        expect(String(call[1])).not.toContain("tok-abc");
      }
    }
    localSet.mockRestore();
    sessionSet.mockRestore();
  });

  it("does not submit when a client limit violation is present", async () => {
    const fetchImpl = vi.fn();
    const user = userEvent.setup();
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText(/能力令牌/), "tok-abc");
    await user.clear(screen.getByLabelText(/内容值/));
    await user.click(screen.getByRole("button", { name: /提交评估/ }));

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify the RED, then GREEN**

The page accepts an injected `fetchImpl` so tests never touch the network,
matching the existing service-injection pattern. It owns: capability token
(memory), form state, in-flight idempotency key, decision, and error. On 401 or
403 it must not discard the operator's typed payload — losing work on an expired
15-minute capability would be a usability defect.

- [ ] **Step 3: Commit exactly**

```text
frontend/src/pages/SandboxSecurityWorkbenchPage.tsx
frontend/src/pages/sandbox-security-workbench.page.spec.tsx
```

Suggested message:
`feat(frontend): add sandbox security evaluation workbench page`

---

### Task P4-T2: Audit Page

**Files:**
- Create: `frontend/src/pages/SandboxSecurityAuditPage.tsx`
- Create: `frontend/src/pages/sandbox-security-audit.page.spec.tsx`

- [ ] **Step 1: Write the failing audit page test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SandboxSecurityAuditPage } from "./SandboxSecurityAuditPage";

function page(events: unknown[], nextCursor: string | null) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      success: true,
      message: "ok",
      data: {
        schema_version: "sandbox-security-audit-page.v1",
        events,
        next_cursor: nextCursor
      },
      error_code: null,
      request_id: "http:1"
    })
  } as unknown as Response;
}

const EVENT = {
  schema_version: "sandbox-security-audit-event.v1",
  event_id: "audit:1",
  event_type: "audit_read",
  occurred_at: "2026-08-07T00:00:00.000Z",
  subject_id: "subject-1",
  authorization_scope_id: "scope-1",
  capability_id: "cap-1",
  returned_count: 1,
  next_cursor_present: false,
  elapsed_ms: 4
};

describe("REQ-SBX-GENERAL-005 audit page", () => {
  it("requires a capability before reading", async () => {
    const fetchImpl = vi.fn();
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/能力令牌/)).toBeInTheDocument();
  });

  it("sends the bearer token and no idempotency key on a read", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([EVENT], null));
    const user = userEvent.setup();
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText(/能力令牌/), "tok-abc");
    await user.click(screen.getByRole("button", { name: /加载审计/ }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const headers = new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer tok-abc");
    expect(headers.get("idempotency-key")).toBeNull();
  });

  it("passes the opaque cursor as a query value without writing it to the page URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page([EVENT], "sbxcur_v1.abc.def"))
      .mockResolvedValueOnce(page([EVENT], null));
    const user = userEvent.setup();
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText(/能力令牌/), "tok-abc");
    await user.click(screen.getByRole("button", { name: /加载审计/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /下一页/ })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: /下一页/ }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    expect(String(fetchImpl.mock.calls[1][0])).toContain("cursor=");
    expect(window.location.search).not.toContain("sbxcur_v1");
  });

  it("surfaces a cursor rejection as a recoverable restart", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        success: false,
        message: "err",
        data: null,
        error_code: "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID",
        request_id: "http:1"
      })
    } as unknown as Response);
    const user = userEvent.setup();
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText(/能力令牌/), "tok-abc");
    await user.click(screen.getByRole("button", { name: /加载审计/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /重新开始/ })).toBeInTheDocument();
  });

  it("never renders a field that could carry raw content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([EVENT], null));
    const user = userEvent.setup();
    render(<SandboxSecurityAuditPage fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText(/能力令牌/), "tok-abc");
    await user.click(screen.getByRole("button", { name: /加载审计/ }));
    await waitFor(() => expect(screen.getByText("audit_read")).toBeInTheDocument());

    expect(document.body.textContent).not.toContain("tok-abc");
  });
});
```

- [ ] **Step 2: Verify the RED, then GREEN**

The audit page is read-only. It sends no `Idempotency-Key`, because that header
belongs only to the evaluation route. The cursor travels in the request query
string but must never be written into the browser URL, since it is a
MAC-bearing capability-scoped value.

- [ ] **Step 3: Commit exactly**

```text
frontend/src/pages/SandboxSecurityAuditPage.tsx
frontend/src/pages/sandbox-security-audit.page.spec.tsx
```

Suggested message:
`feat(frontend): add sandbox security audit page`

---

### Task P4-T3: Route and Navigation Registration

**Files:**
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/app/navigation.tsx`
- Modify: `frontend/src/layouts/ConsoleLayout.tsx` (exactly one line: the
  `defaultOpenKeys` array — see Step 2)
- Create: `frontend/src/app/sandbox-security-navigation.spec.tsx`
- Verify unchanged: `frontend/src/layouts/console-menu.spec.tsx`
- Verify unchanged: `frontend/src/app/app-shell.spec.tsx`

- [ ] **Step 1: Write the failing registration test**

```tsx
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderAppAtRoute } from "../test/app-test-harness";
import { consoleNavigation } from "./navigation";

describe("REQ-SBX-GENERAL-005 route and navigation registration", () => {
  it("adds one sandbox security group with exactly two children", () => {
    const group = consoleNavigation.find((item) => item.key === "sandbox-security");
    expect(group).toBeDefined();
    expect(group?.label).toBe("沙箱安全");
    expect(group?.children).toHaveLength(2);
    expect(group?.children?.map((child) => child.path)).toEqual([
      "/sandbox-security/workbench",
      "/sandbox-security/audit"
    ]);
  });

  it("keeps every pre-existing navigation entry intact", () => {
    const keys = consoleNavigation.map((item) => item.key);
    expect(keys).toContain("/overview");
    expect(keys).toContain("/tasks");
    expect(keys).toContain("results");
    expect(keys).toContain("/review-demo");
  });

  it("renders the workbench route", async () => {
    await renderAppAtRoute("/sandbox-security/workbench");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /评估工作台/ })).toBeInTheDocument()
    );
  });

  it("renders the audit route", async () => {
    await renderAppAtRoute("/sandbox-security/audit");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /审计事件/ })).toBeInTheDocument()
    );
  });

  it("selects the sandbox security key when on a sandbox security route", async () => {
    await renderAppAtRoute("/sandbox-security/audit");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /审计事件/ })).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Verify the RED, then GREEN**

Add the group to `consoleNavigation` and the two routes to `appRoutes`.

`ConsoleLayout.getSelectedNavigationKey` needs **no** change. It resolves
against `flattenNavigationKeys(consoleNavigation)`, which walks `children`
recursively, so both new paths become known keys automatically. If a worker
finds themselves editing that function, the navigation entry is malformed — fix
the entry, not the layout.

`defaultOpenKeys` is the one exception, and it must be changed:

```tsx
// frontend/src/layouts/ConsoleLayout.tsx line 61
defaultOpenKeys={["results", "sandbox-security"]}
```

This is not cosmetic. `defaultOpenKeys` is a hardcoded literal, not derived from
`consoleNavigation`, so a new group is collapsed by default. An inline antd
submenu renders its children through `CSSMotion` with `removeOnLeave: false` and
no `forceRender`, and `CSSMotion` returns `null` while a never-opened branch has
not yet rendered. A collapsed group therefore has **no child link in the DOM at
all** — `getByRole("link", { name: /审计事件/ })` would throw, and Step 1's
test could never go green.

Change only that array. Every other line of `ConsoleLayout.tsx`, including
`getSelectedNavigationKey`, `flattenNavigationKeys`, `toMenuItems`, and the
component signature, stays byte-identical. The existing
`console-menu.spec.tsx` asserts the `results` anchors and must still pass,
which is why `"results"` stays first in the array.

- [ ] **Step 3: Confirm no existing spec regressed**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npx --prefix frontend vitest run --config frontend/vitest.config.mjs --root frontend src/layouts/console-menu.spec.tsx src/app/app-shell.spec.tsx'
```

Expected: both pass unedited. The existing menu spec asserts that overview,
tasks, and result anchors are present; adding a group must not remove them.

- [ ] **Step 4: Commit exactly**

```text
frontend/src/app/routes.tsx
frontend/src/app/navigation.tsx
frontend/src/layouts/ConsoleLayout.tsx
frontend/src/app/sandbox-security-navigation.spec.tsx
```

`ConsoleLayout.tsx` carries the one-line `defaultOpenKeys` change from Step 2.
Omitting it leaves the sandbox-security group collapsed and the navigation test
cannot go green (CSSMotion returns null for a never-opened group).

Suggested message:
`feat(frontend): register sandbox security routes and navigation`

---

## Phase 4 Exit Criteria

- [ ] Both routes render, are reachable from the nav group, and are keyboard
  operable.
- [ ] The bearer token is sent on both routes; `Idempotency-Key` is sent on the
  evaluation route only.
- [ ] Retrying an unchanged payload reuses the key; editing the payload
  regenerates it. Both are asserted.
- [ ] No URL, storage write, or DOM text contains submitted content, the
  capability token, or an audit cursor.
- [ ] A 401 or 403 prompts for a new capability without discarding the typed
  payload.
- [ ] `console-menu.spec.tsx` and `app-shell.spec.tsx` are byte-identical to
  their Phase 3 state.
- [ ] `ConsoleLayout.tsx` differs from its Phase 3 state in exactly one line:
  `defaultOpenKeys={["results", "sandbox-security"]}`. Verify with
  `git diff --stat frontend/src/layouts/ConsoleLayout.tsx` showing
  `1 insertion(+), 1 deletion(-)`. Any larger diff fails the Phase.
- [ ] All 221 pre-existing tests still pass with no existing spec edited.

Stop and report before Phase 5. Do not update `README.md`,
`docs/architecture.md`, `docs/api-contract.md`, or `docs/progress.md` in this
Phase; documentation closure is Phase 5 work.
