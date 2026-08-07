# Phase 5 Privacy, Accessibility, and Acceptance Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Complete one task, review it, commit its exact paths, and stop
> before starting the next task.

**Goal:** Prove by executable sentinel that no submitted content and no bearer
capability escapes page memory, prove the console is keyboard- and
screen-reader-operable at the verified contrast, run the complete regression
against the recorded baseline, close the four canonical documents, and transition
the requirement.

**Architecture:** Privacy is asserted negatively by canary. A unique token is
typed into the form, driven through submit and navigation, then searched for in
every escape channel the browser exposes to application code: URL, both storage
APIs, `history.state`, `document.title`, console sinks, and DOM text outside the
owning control. The canary must appear in exactly two places — the control's own
value and the outbound request body — and nowhere else. Accessibility closes the
Phase 1 contrast work with operability. Documentation is a stated doc-only
exception to TDD.

**Tech Stack:** Vitest, jsdom, `@testing-library/react`, `@testing-library/jest-dom`,
Node `node:test` for the repository gate, WSL-hosted execution.

---

## Entry Gate

- [ ] Confirm Phases 1 through 4 are green, committed, and reviewed with no
  unresolved Critical or Important finding.
- [ ] Read the approved spec sections `Privacy Rules`, `Accessibility`,
  `Compatibility`, `Acceptance Criteria`, and `Documentation And Stop Rule` in
  `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`.
- [ ] Run and record from inside the distro:

```bash
wsl -e bash -lc 'cd /Agent-security-platform && npm run test --prefix frontend 2>&1 | tail -20'
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test:repo 2>&1 | tail -20'
wsl -e bash -lc 'cd /Agent-security-platform && git diff --check'
```

Expected: the frontend suite is green and strictly above the recorded 221-test
baseline by the Phase 2 through Phase 4 additions; `test:repo` shows only
failures already classified by earlier Phases. Any unclassified failure blocks
this Phase.

Reminder: `npm run test:frontend` cannot be invoked from a Windows shell. npm
spawns `cmd.exe`, which refuses the UNC working directory, and Node cannot
resolve modules from a UNC cwd. Every command in this Phase runs through
`wsl -e bash -lc`.

## Locked Privacy Channel List

The sentinel must search exactly these channels. The list is closed; a task may
not narrow it.

```text
1. window.location.href, .search, .hash, .pathname
2. window.localStorage   (every key and every value)
3. window.sessionStorage (every key and every value)
4. window.history.state  (serialized)
5. document.title
6. console.log / .info / .warn / .error / .debug
7. document.body.textContent, excluding the owning control's own value
8. every DOM attribute value in the document, excluding the owning control
```

The canary is permitted in exactly two places:

```text
A. the owning control's value  (textarea / input the operator typed into)
B. the outbound fetch request body (content) or Authorization header (token)
```

The engine decision, the audit page, and every durable record are content-free
by GENERAL-001 and GENERAL-003 contract, so a canary appearing in a rendered
decision or audit row is a defect in this frontend, not upstream.

### Task P5-T1: Content and Capability Leak Sentinel

**Files:**
- Create: `frontend/src/pages/sandbox-security-privacy.spec.tsx`
- Verify unchanged: every production file from Phases 1 through 4

- [ ] **Step 1: Write the failing sentinel**

```tsx
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderAppAtRoute } from "../test/app-test-harness";

const CONTENT_CANARY = "CANARY-CONTENT-8f3a1c92-do-not-persist";
const TOKEN_CANARY = "CANARY-TOKEN-4b7e2d55-do-not-persist";

function collectStorage(store: Storage): string {
  return Object.keys(store)
    .map((key) => `${key}=${store.getItem(key) ?? ""}`)
    .join("\n");
}

function collectAttributes(root: Element, exclude: Set<Element>): string {
  const parts: string[] = [];
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (exclude.has(element)) {
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      parts.push(attribute.value);
    }
  }
  return parts.join("\n");
}

// Channel 7 of the closed list: rendered text outside the owning control.
// A form field's typed value is not a text node, so excluding the owning
// elements cannot mask a genuine leak; what this catches is content echoed
// into an error banner, a summary line, or a table cell.
function collectText(root: Element, exclude: Set<Element>): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let excluded = false;

    for (
      let ancestor = node.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (exclude.has(ancestor)) {
        excluded = true;
        break;
      }
    }

    if (!excluded) {
      parts.push(node.textContent ?? "");
    }
  }

  return parts.join("\n");
}

describe("REQ-SBX-GENERAL-005 privacy sentinel", () => {
  let consoleSink: string[];

  beforeEach(() => {
    consoleSink = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        consoleSink.push(args.map((value) => String(value)).join(" "));
      });
    }
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    cleanup();
  });

  it("never lets submitted content reach URL, storage, history, title, console, or foreign DOM", async () => {
    let capturedBody = "";
    const fetchStub = vi.fn(async (_input: unknown, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          success: true,
          message: "ok",
          error_code: null,
          request_id: "http:1",
          data: {
            schema_version: "sandbox-security-decision.v1",
            decision_id: "decision:1",
            request_id: "req-1",
            evaluation_mode: "simulation",
            stage: "user_input",
            policy_profile_id: "sandbox-security-balanced.v1",
            verdict: "no_detected_risk",
            action: "allow",
            risk_level: "info",
            findings: [],
            detector_runs: [],
            evidence_refs: [],
            created_at: "2026-08-07T00:00:00.000Z"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchStub);

    await renderAppAtRoute("/sandbox-security/workbench");

    const tokenField = screen.getByLabelText(/能力令牌|capability/i);
    fireEvent.change(tokenField, { target: { value: TOKEN_CANARY } });

    const valueField = screen.getByLabelText(/内容值|content value/i);
    fireEvent.change(valueField, { target: { value: CONTENT_CANARY } });

    fireEvent.click(screen.getByRole("button", { name: /提交评估|submit/i }));

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalled();
    });

    // The canary MUST be in the outbound body — that is the feature.
    expect(capturedBody).toContain(CONTENT_CANARY);

    // The canary must be in NO escape channel.
    const owning = new Set<Element>([valueField, tokenField]);
    const haystacks: Record<string, string> = {
      "location.href": window.location.href,
      "location.search": window.location.search,
      "location.hash": window.location.hash,
      localStorage: collectStorage(window.localStorage),
      sessionStorage: collectStorage(window.sessionStorage),
      "history.state": JSON.stringify(window.history.state ?? null),
      "document.title": document.title,
      console: consoleSink.join("\n"),
      "body text": collectText(document.body, owning),
      "dom attributes": collectAttributes(document.body, owning)
    };

    for (const [channel, haystack] of Object.entries(haystacks)) {
      expect(haystack, `content canary leaked into ${channel}`).not.toContain(
        CONTENT_CANARY
      );
      expect(haystack, `token canary leaked into ${channel}`).not.toContain(
        TOKEN_CANARY
      );
    }
  });

  it("never lets the bearer capability reach any channel but the Authorization header", async () => {
    let capturedAuth = "";
    let capturedBody = "";
    const fetchStub = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      capturedAuth = headers.get("authorization") ?? "";
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          success: false,
          message: "unauthorized",
          error_code: "SANDBOX_SECURITY_UNAUTHORIZED",
          request_id: "http:2",
          data: null
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchStub);

    await renderAppAtRoute("/sandbox-security/workbench");

    const tokenField = screen.getByLabelText(/能力令牌|capability/i);
    fireEvent.change(tokenField, { target: { value: TOKEN_CANARY } });
    fireEvent.change(screen.getByLabelText(/内容值|content value/i), {
      target: { value: "benign" }
    });
    fireEvent.click(screen.getByRole("button", { name: /提交评估|submit/i }));

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalled();
    });

    expect(capturedAuth).toBe(`Bearer ${TOKEN_CANARY}`);
    expect(capturedBody).not.toContain(TOKEN_CANARY);
    expect(collectStorage(window.localStorage)).not.toContain(TOKEN_CANARY);
    expect(collectStorage(window.sessionStorage)).not.toContain(TOKEN_CANARY);
    expect(window.location.href).not.toContain(TOKEN_CANARY);
    expect(consoleSink.join("\n")).not.toContain(TOKEN_CANARY);
  });

  it("clears content and capability from memory when the workbench unmounts", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { unmount } = await renderAppAtRoute("/sandbox-security/workbench");

    fireEvent.change(screen.getByLabelText(/能力令牌|capability/i), {
      target: { value: TOKEN_CANARY }
    });
    fireEvent.change(screen.getByLabelText(/内容值|content value/i), {
      target: { value: CONTENT_CANARY }
    });

    unmount();

    expect(document.body.textContent ?? "").not.toContain(CONTENT_CANARY);
    expect(document.body.textContent ?? "").not.toContain(TOKEN_CANARY);
  });
});
```

- [ ] **Step 2: Confirm the RED cause**

```bash
wsl -e bash -lc 'cd /Agent-security-platform/frontend && ../node_modules/.bin/vitest run --config vitest.config.mjs --configLoader native src/pages/sandbox-security-privacy.spec.tsx 2>&1 | tail -30'
```

Expected: the sentinel fails only on genuine leak assertions or on a control
whose accessible name does not yet match, never on a missing module. If it
passes immediately, the sentinel is not reaching the real submit path — fix the
test before touching production code.

- [ ] **Step 3: Fix every leak the sentinel finds**

Repair production code only. Permitted repairs: remove a debug `console` call,
remove a storage write, remove a query/hash write, stop echoing the value into a
`title`/`aria-label`/`data-*` attribute, clear state on unmount. Never weaken the
sentinel, never narrow the channel list, and never add a test-only conditional.

- [ ] **Step 4: Add the static storage gate**

Extend `tests/repository/sandbox-security-frontend-spec.spec.ts` from Phase 1:

```ts
test("REQ-SBX-GENERAL-005 new frontend code writes no browser storage", () => {
  const roots = [
    "frontend/src/pages/SandboxSecurityWorkbenchPage.tsx",
    "frontend/src/pages/SandboxSecurityAuditPage.tsx",
    "frontend/src/services/sandbox-security-service.ts",
    "frontend/src/components/sandbox-security"
  ];
  const offenders: string[] = [];
  for (const relative of roots) {
    for (const file of collectSourceFiles(relative)) {
      const source = read(file);
      if (/(localStorage|sessionStorage|indexedDB|document\.cookie)/.test(source)) {
        offenders.push(file);
      }
      if (/history\.(pushState|replaceState)/.test(source)) {
        offenders.push(file);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
```

- [ ] **Step 5: Commit**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && git add frontend/src/pages/sandbox-security-privacy.spec.tsx tests/repository/sandbox-security-frontend-spec.spec.ts && git commit -m "test(frontend): add sandbox security privacy leak sentinel"'
```

Include any production leak repair in this commit with its exact path.

### Task P5-T2: Accessibility Operability

**Files:**
- Modify: `frontend/src/pages/sandbox-security-workbench.page.spec.tsx`
- Modify: `frontend/src/pages/sandbox-security-audit.page.spec.tsx`
- Modify: production components only as the failures require

- [ ] **Step 1: Write the failing operability assertions**

Phase 1 already proved every token's contrast ratio. This task proves
operability.

```tsx
it("REQ-SBX-GENERAL-005 announces the verdict to assistive technology", async () => {
  // ...render and submit with a risk_detected decision...
  const live = screen.getByRole("status");
  expect(live).toHaveAttribute("aria-live", "polite");
  expect(live).toHaveTextContent(/risk_detected/);
});

it("REQ-SBX-GENERAL-005 gives every form control an accessible name", async () => {
  await renderAppAtRoute("/sandbox-security/workbench");
  for (const control of [
    ...screen.getAllByRole("textbox"),
    ...screen.getAllByRole("combobox"),
    ...screen.getAllByRole("button")
  ]) {
    expect(
      control.getAttribute("aria-label") ??
        control.getAttribute("aria-labelledby") ??
        control.textContent
    ).toBeTruthy();
  }
});

it("REQ-SBX-GENERAL-005 reaches submit by keyboard alone", async () => {
  await renderAppAtRoute("/sandbox-security/workbench");
  const submit = screen.getByRole("button", { name: /提交评估|submit/i });
  submit.focus();
  expect(submit).toHaveFocus();
});

it("REQ-SBX-GENERAL-005 keeps the audit table headers associated", async () => {
  // ...render audit page with one event...
  for (const header of screen.getAllByRole("columnheader")) {
    expect(header.textContent?.trim()).toBeTruthy();
  }
});
```

- [ ] **Step 2: Verify the `app.css` focus and motion rules**

Confirm by reading `frontend/src/styles/app.css` that the Phase 1 inversion kept:

```text
:focus-visible uses --console-accent at >= 2px, offset >= 2px, and no rule sets outline: none
@media (prefers-reduced-motion: no-preference) still gates rise-in, and no unguarded animation was added
:root sets color-scheme: dark
```

Record each as a checked line reference. A missing rule is a Phase 1 regression
and must be fixed here with its own RED.

- [ ] **Step 3: GREEN, then commit**

```bash
wsl -e bash -lc 'cd /Agent-security-platform/frontend && ../node_modules/.bin/vitest run --config vitest.config.mjs --configLoader native src/pages 2>&1 | tail -20'
wsl -e bash -lc 'cd /Agent-security-platform && git add -A frontend/src && git commit -m "test(frontend): assert sandbox security console accessibility operability"'
```

### Task P5-T3: Live Operator Acceptance Runbook

**Files:**
- Create: `docs/superpowers/2026-08-07-general-005-frontend-acceptance-runbook.md`

This task is documentation. It adds no production code and is a stated
doc-only exception to RED/GREEN.

- [ ] **Step 1: Write the runbook**

The workbench cannot be accepted by jsdom alone, because the capability is
issued by an internal admin route that the browser cannot call. Record the exact
operator sequence:

```text
1. Start the backend with GENERAL-003 configuration present.
2. Issue a short-lived public capability from a trusted shell, not the browser:
     POST /internal/sandbox/security/capabilities
     Authorization: Bearer <SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN>
     scopes: ["sandbox_security:evaluate", "sandbox_security:audit:read"]
     allowed_stages: all three
     allowed_policy_profile_ids: both
     ttl_seconds: 900
3. Copy the one-time bearer_token from the 201 response.
4. Start the frontend dev server and open /sandbox-security/workbench.
5. Paste the token into the capability panel. It is held in memory only.
6. Submit one benign user_input evaluation. Expect verdict no_detected_risk
   and action allow.
7. Submit one known-risk user_input evaluation under the strict profile.
   Expect risk_detected and a non-allow action.
8. Re-submit the identical payload without editing the form. Expect the
   replayed idempotent result, not a 409 conflict.
9. Edit one character and submit. Expect a new decision_id.
10. Open /sandbox-security/audit and page forward with the cursor. Confirm
    every row is content-free.
11. Wait for the capability to expire, then submit. Expect the mapped
    unauthorized message and a prompt to re-paste.
12. With DevTools open, confirm Application storage holds no submitted content
    and no token, and the URL bar never contains either.
```

Record the observed `decision_id`, `verdict`, `action`, and `elapsed_ms` for
steps 6, 7, and 9. Never paste a real bearer token, raw content, or the
bootstrap token into any durable document, commit message, or log.

- [ ] **Step 2: Commit**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && git add docs/superpowers/2026-08-07-general-005-frontend-acceptance-runbook.md && git commit -m "docs(sandbox): add GENERAL-005 frontend acceptance runbook"'
```

### Task P5-T4: Full Regression and Track 1 Compatibility

**Files:**
- Verify unchanged: every Track 1 page, component, hook, service, and spec

- [ ] **Step 1: Run the complete validation**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && npm run test --prefix frontend 2>&1 | tail -25'
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test:repo 2>&1 | tail -25'
wsl -e bash -lc 'cd /Agent-security-platform && npm run test:shared 2>&1 | tail -15'
wsl -e bash -lc 'cd /Agent-security-platform && ./frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit 2>&1 | tail -25'
wsl -e bash -lc 'cd /Agent-security-platform && git diff --check'
```

- [ ] **Step 2: Classify against the recorded baseline**

```text
baseline before GENERAL-005:  15 files, 221 tests, 139.72 s
required now:                 all 221 original tests still pass, unmodified
new tests:                    Phase 1 through Phase 5 additions, all passing
frontend typecheck:           no new error attributable to GENERAL-005
antd deprecation warnings:    Alert `message`, List — pre-existing, not failures
```

Every one of the 221 original tests must pass with **zero** edits to its
assertions. An edited Track 1 assertion is a scope breach: stop and report
instead of adjusting the test.

- [ ] **Step 3: Confirm the theme reached Track 1 without breaking it**

Confirm `/overview`, `/tasks`, `/results/sandbox`, and `/review-demo` render
under the dark theme and that the `StaticAnalysisResultSection` `<pre>` repair
from Phase 1 holds. The original defect was a `#f5f5f5` background inheriting
dark ink at 1.09:1; the repaired token surface must measure at least 4.5:1.

### Task P5-T5: Documentation and Requirement Closure

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/progress.md`
- Modify: `docs/sprint-current.md`

This task is documentation and workspace convention only. It is a stated
exception to full TDD and must carry no business logic.

- [ ] **Step 1: `docs/architecture.md` section 2.1**

Add the two routes to the frontend route list, which currently ends at
`/review-demo`, and add a short GENERAL-005 subsection recording that the
console theme layer is token-driven at `ConfigProvider` with
`darkAlgorithm` plus `compactAlgorithm`, and that the workbench holds the
capability and submitted content in page memory only.

- [ ] **Step 2: `docs/api-contract.md`**

Add one `REQ-SBX-GENERAL-005 Frontend Evaluation Workbench Contract` section
after the existing GENERAL-003 sections. Per `docs.instructions.md`, link to the
canonical GENERAL-003 route matrix and DTO matrix rather than copying them.
Record only what is genuinely frontend-owned: the two consumed routes, the
client-generated `request_id` and `Idempotency-Key` lifecycle, the client-side
limit pre-checks, the fifteen-code error mapping, and the content-free rendering
rule.

- [ ] **Step 3: `README.md`**

Add the two routes and the operator note that the workbench requires a pasted
short-lived capability and persists nothing.

- [ ] **Step 4: `docs/progress.md`**

Append the GENERAL-005 outcome in the existing entry shape: status,
implementation summary, files, tests, reviews, commit, boundary, next. State the
baseline transition explicitly as `221 -> <final count>`.

- [ ] **Step 5: `docs/sprint-current.md`**

Only at this point does the sprint file change. Record the requirement as
complete at the highest status its dependencies allow. GENERAL-005 cannot claim
a status stronger than its predecessors: GENERAL-002 remains
`PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE` and GENERAL-003 is not `VERIFIED`,
so the maximum is `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`.

- [ ] **Step 6: Commit**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && git add README.md docs/architecture.md docs/api-contract.md docs/progress.md docs/sprint-current.md && git commit -m "docs(sandbox): close GENERAL-005 frontend workbench documentation"'
```

## Exit Gate

- [ ] The privacy sentinel passes with the closed nine-channel list intact and no
  weakened assertion.
- [ ] The static storage gate reports zero offenders.
- [ ] Accessibility operability passes: `aria-live` verdict, named controls,
  keyboard-reachable submit, associated table headers, `:focus-visible` ring,
  reduced-motion honored, `color-scheme: dark`.
- [ ] The acceptance runbook exists and contains no token, no raw content, and no
  bootstrap credential.
- [ ] All 221 original tests pass with zero assertion edits.
- [ ] The four canonical documents are updated and `docs/sprint-current.md`
  records the requirement at no more than
  `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`.
- [ ] Report the five required outputs: modified files, added tests, whether
  tests passed, whether the requirement is complete, and a suggested commit
  message. Then **stop**. Do not begin another requirement.

## Explicit Non-Goals

- No new backend route, shared contract, or engine change.
- No claim that GENERAL-002 or GENERAL-003 reached `VERIFIED`.
- No enforcement decision from this UI. The public route returns
  `evaluation_mode: "simulation"`, and the page must say so.
- No control over DevTools, browser extensions, process memory, or OS swap. The
  privacy claim is scoped to application code, exactly as the umbrella design
  states.
