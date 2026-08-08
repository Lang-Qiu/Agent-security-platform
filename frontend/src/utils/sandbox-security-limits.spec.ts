import { describe, expect, it } from "vitest";

import {
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_JSON_NODES,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
  SANDBOX_SECURITY_MAX_TEXT_BYTES
} from "../../../shared/types/sandbox-security";
import {
  countJsonNodes,
  measureJsonDepth,
  measureUtf8Bytes,
  validateEvaluationRequest
} from "./sandbox-security-limits";

describe("REQ-SBX-GENERAL-005 limit pre-flight", () => {
  it("measures UTF-8 bytes, not UTF-16 code units", () => {
    expect(measureUtf8Bytes("abc")).toBe(3);
    expect(measureUtf8Bytes("安全")).toBe(6);
    expect(measureUtf8Bytes("\u{1F512}")).toBe(4);
  });

  it("rejects a text value above the shared byte bound", () => {
    const oversized = "a".repeat(SANDBOX_SECURITY_MAX_TEXT_BYTES + 1);
    const result = validateEvaluationRequest({
      stage: "user_input",
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "user_input",
          media_type: "text/plain",
          value: oversized,
          provenance_ref: "source://client/1"
        }
      ]
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.rule).toBe("text_bytes");
  });

  it("rejects more content items than the shared cap", () => {
    const items = Array.from(
      { length: SANDBOX_SECURITY_MAX_CONTENT_ITEMS + 1 },
      (_unused, index) => ({
        source_id: `src-${index}`,
        claimed_source_type: "user_input" as const,
        media_type: "text/plain" as const,
        value: "x",
        provenance_ref: `source://client/${index}`
      })
    );
    const result = validateEvaluationRequest({ stage: "user_input", contentItems: items });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === "content_items")).toBe(true);
  });

  it("requires at least one content item", () => {
    const result = validateEvaluationRequest({ stage: "user_input", contentItems: [] });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === "content_items")).toBe(true);
  });

  it("measures JSON depth and node count", () => {
    expect(measureJsonDepth({ a: { b: { c: 1 } } })).toBe(3);
    expect(measureJsonDepth("scalar")).toBe(0);
    expect(countJsonNodes({ a: 1, b: [2, 3] })).toBe(5);
  });

  it("rejects JSON deeper than the shared depth bound", () => {
    let nested: unknown = 1;
    for (let index = 0; index <= SANDBOX_SECURITY_MAX_JSON_DEPTH; index += 1) {
      nested = { nested };
    }
    const result = validateEvaluationRequest({
      stage: "user_input",
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "retrieved_content",
          media_type: "application/json",
          value: nested,
          provenance_ref: "source://client/1"
        }
      ]
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === "json_depth")).toBe(true);
  });

  it("rejects a whole request above the canonical byte bound", () => {
    const chunk = "a".repeat(SANDBOX_SECURITY_MAX_TEXT_BYTES);
    const items = Array.from({ length: 8 }, (_unused, index) => ({
      source_id: `src-${index}`,
      claimed_source_type: "user_input" as const,
      media_type: "text/plain" as const,
      value: chunk,
      provenance_ref: `source://client/${index}`
    }));
    const result = validateEvaluationRequest({ stage: "user_input", contentItems: items });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === "request_bytes")).toBe(true);
    expect(SANDBOX_SECURITY_MAX_REQUEST_BYTES).toBe(524288);
  });

  it("requires a tool_request only at the tool_request stage", () => {
    const base = {
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "user_input" as const,
          media_type: "text/plain" as const,
          value: "x",
          provenance_ref: "source://client/1"
        }
      ]
    };
    expect(
      validateEvaluationRequest({ ...base, stage: "tool_request" }).violations.some(
        (v) => v.rule === "tool_request_required"
      )
    ).toBe(true);
    expect(validateEvaluationRequest({ ...base, stage: "user_input" }).ok).toBe(true);
  });

  it("never includes a submitted value in a violation", () => {
    const secret = "SECRET-CANARY-VALUE";
    const result = validateEvaluationRequest({
      stage: "user_input",
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "user_input",
          media_type: "text/plain",
          value: secret.repeat(20000),
          provenance_ref: "source://client/1"
        }
      ]
    });
    expect(JSON.stringify(result)).not.toContain("SECRET-CANARY");
  });

  it("rejects a JSON value exceeding the shared node bound", () => {
    // Build a flat array of > SANDBOX_SECURITY_MAX_JSON_NODES nodes. Depth
    // stays at 2 so this isolates the node rule from the depth rule.
    const wide = Array.from({ length: SANDBOX_SECURITY_MAX_JSON_NODES + 50 }, (_, i) => i);
    // Use camelCase `contentItems` — matching every other test in this file.
    // snake_case `content_items` would be ignored by the function, triggering
    // the wrong violation (empty items) instead of json_nodes.
    const result = validateEvaluationRequest({
      stage: "user_input",
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "user_input",
          media_type: "application/json",
          value: wide,
          provenance_ref: "source://client/1"
        }
      ]
    });
    expect(result.violations.some((v) => v.rule === "json_nodes")).toBe(true);
  });
});
