// The engine measures detector elapsed time with a monotonic clock and emits
// fractional milliseconds, and optional judge slots may run longer than the
// stream contract's upper bound. The shared
// `sandbox-security-evaluation-stream.v1` contract requires a safe integer in
// 0..60000, so both live and replayed stage emitters clamp before
// normalization instead of failing the evaluation.

const STREAM_ELAPSED_MS_MAX = 60000;

export function clampSandboxSecurityStreamElapsedMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(STREAM_ELAPSED_MS_MAX, Math.round(value));
}
