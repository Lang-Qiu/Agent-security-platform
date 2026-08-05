import assert from "node:assert/strict";
import { test } from "node:test";

import { matchInternalRoute } from "../src/common/http/internal-router.ts";
import { matchRoute } from "../src/common/http/router.ts";

test("REQ-SBX-GENERAL-003 public router recognizes only evaluation and audit read", () => {
  assert.deepEqual(
    matchRoute("POST", "/api/sandbox/security/evaluations"),
    { name: "evaluateSandboxSecurity", params: {} }
  );
  assert.deepEqual(
    matchRoute("GET", "/api/sandbox/security/audit-events"),
    { name: "listSandboxSecurityAuditEvents", params: {} }
  );

  assert.equal(
    matchRoute("GET", "/api/sandbox/security/evaluations"),
    null,
    "evaluation route must reject the wrong method"
  );
  assert.equal(
    matchRoute("POST", "/api/sandbox/security/audit-events"),
    null,
    "audit read route must reject the wrong method"
  );
  assert.equal(
    matchRoute("POST", "/internal/sandbox/security/capabilities"),
    null,
    "public router must not recognize internal routes"
  );
});

test("REQ-SBX-GENERAL-003 internal router recognizes only capability and purge routes", () => {
  assert.deepEqual(
    matchInternalRoute("POST", "/internal/sandbox/security/capabilities"),
    { name: "issueSandboxSecurityCapability", params: {} }
  );
  assert.deepEqual(
    matchInternalRoute(
      "POST",
      "/internal/sandbox/security/capabilities/capability%3A123/revoke"
    ),
    {
      name: "revokeSandboxSecurityCapability",
      params: { rawCapabilityIdSegment: "capability%3A123" }
    }
  );
  assert.deepEqual(
    matchInternalRoute("POST", "/internal/sandbox/security/audit-events/purge"),
    { name: "purgeSandboxSecurityAuditEvents", params: {} }
  );

  assert.equal(
    matchInternalRoute("GET", "/internal/sandbox/security/capabilities"),
    null,
    "capability issue route must reject the wrong method"
  );
  assert.equal(
    matchInternalRoute("GET", "/api/sandbox/security/audit-events"),
    null,
    "internal router must not recognize public routes"
  );
});

test("REQ-SBX-GENERAL-003 route matchers reject missing, empty, extra, and trailing path slots", () => {
  assert.equal(
    matchRoute("POST", "/api/sandbox/security/evaluations/"),
    null,
    "public routes must reject a trailing slash"
  );
  assert.equal(
    matchRoute("POST", "/api/sandbox/security/evaluations/extra"),
    null,
    "public routes must reject an extra segment"
  );
  assert.equal(
    matchRoute("GET", "/api/sandbox/security/audit-events/"),
    null,
    "public routes must reject a trailing slash"
  );

  assert.equal(
    matchInternalRoute("POST", "/internal/sandbox/security/capabilities/"),
    null,
    "capability issue route must reject a trailing slash"
  );
  assert.equal(
    matchInternalRoute(
      "POST",
      "/internal/sandbox/security/capabilities//revoke"
    ),
    null,
    "revoke route must reject an empty capability-id slot"
  );
  assert.equal(
    matchInternalRoute(
      "POST",
      "/internal/sandbox/security/capabilities/revoke"
    ),
    null,
    "revoke route must reject a missing capability-id slot"
  );
  assert.equal(
    matchInternalRoute(
      "POST",
      "/internal/sandbox/security/capabilities/capability-123/revoke/extra"
    ),
    null,
    "revoke route must reject an extra segment"
  );
  assert.equal(
    matchInternalRoute(
      "POST",
      "/internal/sandbox/security/capabilities/capability-123/revoke/"
    ),
    null,
    "revoke route must reject a trailing slash"
  );
  assert.equal(
    matchInternalRoute("POST", "/internal/sandbox/security/audit-events/purge/"),
    null,
    "purge route must reject a trailing slash"
  );
});

test("REQ-SBX-GENERAL-003 revoke route preserves opaque encoded path slots", () => {
  const rawCapabilityIdSegment = "opaque%2Fid%5Cwith%00invalid%ZZ";

  assert.deepEqual(
    matchInternalRoute(
      "POST",
      `/internal/sandbox/security/capabilities/${rawCapabilityIdSegment}/revoke`
    ),
    {
      name: "revokeSandboxSecurityCapability",
      params: { rawCapabilityIdSegment }
    },
    "route matching must not decode or validate the capability path slot"
  );
});

test("REQ-SBX-GENERAL-003 existing public and internal routes remain recognized", () => {
  assert.deepEqual(matchRoute("GET", "/health"), {
    name: "health",
    params: {}
  });
  assert.deepEqual(matchRoute("POST", "/api/tasks"), {
    name: "createTask",
    params: {}
  });
  assert.deepEqual(matchRoute("GET", "/api/tasks/task-123/result"), {
    name: "getTaskResult",
    params: { taskId: "task-123" }
  });
  assert.deepEqual(matchInternalRoute("GET", "/internal/health"), {
    name: "internalHealth",
    params: {}
  });
  assert.deepEqual(
    matchInternalRoute(
      "POST",
      "/internal/track1/campaigns/campaign%3A123/snapshots"
    ),
    {
      name: "ingestSnapshot",
      params: { campaignId: "campaign:123" }
    }
  );
});
