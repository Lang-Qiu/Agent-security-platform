import { normalizeBaseResult } from "../../../../shared/contracts/result.js";
import { Track1MonitorError } from "./contract.js";
// -- fixed summaries -------------------------------------------------------
const TERMINAL_SUMMARIES = {
    failed: "Monitored sandbox session failed",
    blocked: "Monitored sandbox session blocked",
    finished: "Monitored sandbox session completed"
};
// -- main builder ----------------------------------------------------------
export function buildMonitorResult(input) {
    const { context, events, decisions, alerts, blockedRecords, metadata, firstTimestamp, finalTimestamp } = input;
    // Determine terminal status and risk
    const hasBlocked = blockedRecords.length > 0;
    // Check for any deny decision
    const hasDeny = decisions.some((d) => d.action === "deny");
    // Check for any alert decision
    const hasAlert = decisions.some((d) => d.action === "alert");
    // Check for any ask decision
    const hasAsk = decisions.some((d) => d.action === "ask");
    // Check for callback/internal failure
    const hasCallbackFailure = input.failed === true;
    let status;
    let riskLevel;
    let summary;
    if (hasCallbackFailure) {
        status = "failed";
        riskLevel = "high";
        summary = TERMINAL_SUMMARIES.failed;
    }
    else if (hasDeny || hasBlocked) {
        status = "blocked";
        riskLevel = "high";
        summary = TERMINAL_SUMMARIES.blocked;
    }
    else if (hasAlert) {
        status = "finished";
        riskLevel = "high";
        summary = TERMINAL_SUMMARIES.finished;
    }
    else if (hasAsk) {
        status = "finished";
        riskLevel = "medium";
        summary = TERMINAL_SUMMARIES.finished;
    }
    else {
        status = "finished";
        riskLevel = "info";
        summary = TERMINAL_SUMMARIES.finished;
    }
    const candidate = {
        task_id: context.task_id,
        task_type: "sandbox_run",
        engine_type: "sandbox",
        status,
        risk_level: riskLevel,
        summary,
        details: {
            session_id: context.session_id,
            events: [...events],
            policy_decisions: [...decisions],
            alerts: [...alerts],
            blocked_records: [...blockedRecords],
            blocked: blockedRecords.length > 0,
            event_count: events.length
        },
        created_at: firstTimestamp,
        updated_at: finalTimestamp,
        finished_at: finalTimestamp,
        metadata: {
            monitor: { ...metadata }
        }
    };
    const normalized = normalizeBaseResult(candidate);
    if (!normalized) {
        throw new Track1MonitorError("monitor_result_invalid");
    }
    return normalized;
}
