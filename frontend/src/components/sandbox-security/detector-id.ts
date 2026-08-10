/**
 * Detector-id presentation, shared by the RISK FINDINGS and DETECTOR EXECUTION
 * tables so the same detector never reads differently between the two.
 *
 * Real ids from the engine registry are shaped
 * `detector://sandbox/security/{kind}/{variant}/{version}`:
 *
 *   detector://sandbox/security/rule/default/v1
 *   detector://sandbox/security/local/default/v1
 *   detector://sandbox/security/judge/default/v1
 *
 * Two naive readings both fail here. Taking the trailing segment yields `v1` on
 * every row; stripping the version and taking the new tail yields `default` on
 * every row. Both make the column carry no information. The discriminating
 * segment is the *kind* — third from the end.
 */

/** Presentation label for a detector id, e.g. `rule`, or `rule/strict`. */
export function detectorShortLabel(detectorId: string): string {
  const segments = detectorId.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) return detectorId;

  // Drop a trailing version segment: `.../rule/default/v1` -> `.../rule/default`.
  const withoutVersion =
    segments.length >= 2 && /^v\d+$/i.test(segments[segments.length - 1])
      ? segments.slice(0, -1)
      : segments;

  const variant = withoutVersion[withoutVersion.length - 1];
  const kind = withoutVersion[withoutVersion.length - 2];

  // `default` is the variant on every stock slot, so it discriminates nothing;
  // fall back to the kind. A non-default variant is meaningful, so keep both.
  if (variant === "default" && kind !== undefined) return kind;
  if (kind !== undefined && variant !== undefined) return `${kind}/${variant}`;
  return variant ?? detectorId;
}
