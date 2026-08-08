# GENERAL-005 Frontend Evaluation Workbench — Live Operator Acceptance Runbook

- Requirement: `REQ-SBX-GENERAL-005`
- Date: `2026-08-07`
- Scope: Manual acceptance of the sandbox security evaluation workbench and audit
  view against a live GENERAL-003 backend. jsdom cannot issue a real capability,
  so this sequence is executed by a human operator.

> **Credential hygiene (non-negotiable).** Never paste a real bearer token, raw
> submitted content, or the admin bootstrap token into any durable document,
> commit message, screenshot, or log. Record only the non-sensitive observed
> fields named in each step (`decision_id`, `verdict`, `action`, `elapsed_ms`).
> The capability is held in browser memory only and is lost on reload by design.

---

## Preconditions

- A backend built and started with the GENERAL-003 configuration present
  (engine, crypto, persistence, and the admin bootstrap credential all
  configured). The public evaluation and audit routes are served at:
  - `POST /api/sandbox/security/evaluations`
  - `GET  /api/sandbox/security/audit-events?cursor=<opaque>&limit=<1..100>`
- The frontend dev server buildable from `frontend/`.
- A trusted shell (not the browser) able to reach the internal admin route
  `POST /internal/sandbox/security/capabilities`.

---

## Operator Sequence

1. **Start the backend** with GENERAL-003 configuration present. Confirm the
   public evaluation and audit routes answer (a bodyless probe returning
   `SANDBOX_SECURITY_UNAUTHORIZED` without a capability is the expected healthy
   signal, not a failure).

2. **Issue a short-lived public capability from a trusted shell**, never from the
   browser:

   ```http
   POST /internal/sandbox/security/capabilities
   Authorization: Bearer <SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN>
   Content-Type: application/json

   {
     "scopes": ["sandbox_security:evaluate", "sandbox_security:audit:read"],
     "allowed_stages": ["user_input", "model_output", "tool_request"],
     "allowed_policy_profile_ids": [
       "sandbox-security-balanced.v1",
       "sandbox-security-strict.v1"
     ],
     "ttl_seconds": 900
   }
   ```

3. **Copy the one-time `bearer_token`** from the `201` response. It is shown
   once. Do not store it anywhere durable.

4. **Start the frontend dev server** and open `/sandbox-security/workbench`.

5. **Paste the token** into the capability panel. Confirm the panel states the
   token is memory-only. It is held in page memory only — no storage write.

6. **Submit one benign `user_input` evaluation** under the balanced profile.
   Expect `verdict: no_detected_risk` and `action: allow`. The summary must be
   labelled `simulation` and carry the "not usable for real interception" and
   "not a safety proof" notices.
   - Record: `decision_id = __________`, `verdict = __________`,
     `action = __________`, `elapsed_ms = __________`.

7. **Submit one known-risk `user_input` evaluation** under the strict profile.
   Expect `verdict: risk_detected` and a non-`allow` action, with findings and
   detector runs rendered as content-free positions.
   - Record: `decision_id = __________`, `verdict = __________`,
     `action = __________`, `elapsed_ms = __________`.

8. **Re-submit the identical payload without editing the form.** Expect the
   replayed idempotent result (same `decision_id` as step 7), not a `409`
   conflict — the client reuses the same `Idempotency-Key` for an unchanged
   payload.

9. **Edit one character and submit.** Expect a fresh `decision_id` (the client
   regenerates the `Idempotency-Key` on any payload edit).
   - Record: `decision_id = __________` (must differ from step 7).

10. **Open `/sandbox-security/audit`** and page forward with the cursor. Confirm
    every row is content-free (event type, subject, timestamp, and variant-
    specific counts/codes only — never submitted content) and that the browser
    URL never shows the opaque cursor.

11. **Wait for the capability to expire** (past the 900s TTL), then submit.
    Expect the mapped unauthorized message and a prompt to re-paste a new
    capability, with the typed payload preserved.

12. **With DevTools open**, confirm Application storage (localStorage,
    sessionStorage, cookies, IndexedDB) holds no submitted content and no token,
    and that the URL bar never contains either at any step.

---

## Pass Criteria

- Steps 6 and 7 produce the expected verdict/action pair and a `simulation`-
  labelled decision.
- Step 8 replays the step-7 `decision_id` (no `409`).
- Step 9 yields a new `decision_id`.
- Step 10 shows only content-free audit rows and no cursor in the URL.
- Step 11 surfaces the unauthorized mapping and re-prompts without losing the
  typed payload.
- Step 12 shows no content and no token in any browser storage or the URL.

Any deviation is a frontend defect (the engine decision and audit records are
content-free by GENERAL-001 and GENERAL-003 contract), and blocks acceptance.
