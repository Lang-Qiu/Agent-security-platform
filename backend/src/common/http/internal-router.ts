// P2-T5: Internal-only router for Docker-internal campaign ingest.
// Recognizes only health plus the four exact campaign ingest routes.
// Every other path returns null so the InternalAppModule responds with 404.

export type InternalRouteName =
  | "internalHealth"
  | "startCampaign"
  | "ingestSnapshot"
  | "finalizeCampaign"
  | "registerEvidence";

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
