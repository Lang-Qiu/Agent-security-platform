export const SANDBOX_EVENT_TYPES = [
    "model_input",
    "model_output",
    "tool_request",
    "tool_result",
    "policy_decision",
    "memory_write",
    "memory_read"
];
export const SANDBOX_EVENT_SOURCES = ["model", "agent", "tool", "policy", "memory", "monitor"];
export const SANDBOX_POLICY_ACTIONS = ["allow", "deny", "ask", "alert"];
export const SANDBOX_TOOL_RESULT_STATUSES = ["success", "rejected", "failed"];
