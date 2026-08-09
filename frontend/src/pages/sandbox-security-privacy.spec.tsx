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

    fireEvent.click(screen.getByRole("button", { name: /开始评估|submit/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /开始评估|submit/i }));

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
