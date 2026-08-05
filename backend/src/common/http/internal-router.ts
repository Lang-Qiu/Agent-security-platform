// Internal-only router for Docker-internal campaign ingest and sandbox security
// administration. It recognizes health, four exact campaign ingest routes, and
// the three exact sandbox security administration routes.
// Every other path returns null so the InternalAppModule responds with 404.

export type InternalRouteName =
  | "internalHealth"
  | "startCampaign"
  | "ingestSnapshot"
  | "finalizeCampaign"
  | "registerEvidence"
  | "issueSandboxSecurityCapability"
  | "revokeSandboxSecurityCapability"
  | "purgeSandboxSecurityAuditEvents";

export interface InternalRouteMatch {
  name: InternalRouteName;
  params: Record<string, string>;
}

function decodeRouteSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0")
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function matchInternalRoute(
  method: string | undefined,
  pathname: string
): InternalRouteMatch | null {
  if (method === "GET" && pathname === "/internal/health") {
    return { name: "internalHealth", params: {} };
  }

  if (
    method === "POST" &&
    pathname === "/internal/sandbox/security/capabilities"
  ) {
    return { name: "issueSandboxSecurityCapability", params: {} };
  }

  if (
    method === "POST" &&
    pathname === "/internal/sandbox/security/audit-events/purge"
  ) {
    return { name: "purgeSandboxSecurityAuditEvents", params: {} };
  }

  // Revoke keeps the capability id opaque until the authenticated controller
  // has completed bodyless admission and can validate it exactly once.
  const rawSegments = pathname.split("/");
  if (
    method === "POST" &&
    rawSegments.length === 7 &&
    rawSegments[0] === "" &&
    rawSegments[1] === "internal" &&
    rawSegments[2] === "sandbox" &&
    rawSegments[3] === "security" &&
    rawSegments[4] === "capabilities" &&
    rawSegments[5] !== "" &&
    rawSegments[6] === "revoke"
  ) {
    return {
      name: "revokeSandboxSecurityCapability",
      params: { rawCapabilityIdSegment: rawSegments[5] }
    };
  }

  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "internal" || segments[1] !== "track1") {
    return null;
  }

  // POST /internal/track1/campaigns
  if (
    method === "POST" &&
    segments.length === 3 &&
    segments[2] === "campaigns"
  ) {
    return { name: "startCampaign", params: {} };
  }

  // POST /internal/track1/campaigns/:campaignId/{snapshots|finalize|evidence}
  if (
    method === "POST" &&
    segments.length === 5 &&
    segments[2] === "campaigns"
  ) {
    const campaignId = decodeRouteSegment(segments[3]);
    if (campaignId === null) {
      return null;
    }
    if (segments[4] === "snapshots") {
      return { name: "ingestSnapshot", params: { campaignId } };
    }
    if (segments[4] === "finalize") {
      return { name: "finalizeCampaign", params: { campaignId } };
    }
    if (segments[4] === "evidence") {
      return { name: "registerEvidence", params: { campaignId } };
    }
  }

  return null;
}
