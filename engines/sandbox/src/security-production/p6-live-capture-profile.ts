export const SANDBOX_SECURITY_P6_LIVE_CAPTURE_EXECUTION_PROFILE_ID =
  "p6_local_hardware_compatibility_v1" as const;

export const SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING = Object.freeze({
  readiness_timeout_ms: 20000,
  qualification_timeout_ms: 20000,
  local_detector_slot_timeout_ms: 20000,
  judge_detector_slot_timeout_ms: 20000,
  normal_work_budget_ms: 40000
} as const);
