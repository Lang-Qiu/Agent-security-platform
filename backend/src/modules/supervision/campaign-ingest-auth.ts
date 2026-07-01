import { createHash, timingSafeEqual } from "node:crypto";
import { DomainError } from "../../common/errors/domain-error.ts";

const BEARER_PREFIX = "Bearer ";

/**
 * Authorize an internal campaign ingest request using a bearer token.
 *
 * Both the supplied and expected tokens are SHA-256 hashed before comparison
 * to avoid leaking token length through `timingSafeEqual`. The error message
 * is fixed and never contains either token.
 */
export function authorizeCampaignIngest(
  authorization: string | undefined,
  expectedToken: string
): void {
  const supplied =
    typeof authorization === "string" && authorization.startsWith(BEARER_PREFIX)
      ? authorization.slice(BEARER_PREFIX.length)
      : "";

  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expectedToken).digest();

  if (!timingSafeEqual(suppliedHash, expectedHash)) {
    throw new DomainError(
      "Campaign ingest authorization failed",
      "CAMPAIGN_INGEST_UNAUTHORIZED",
      401
    );
  }
}
