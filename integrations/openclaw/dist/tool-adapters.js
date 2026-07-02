// -- safe output helpers ---------------------------------------------------
function safeJson(value) {
    return JSON.stringify(value);
}
function buildResult(payload) {
    return {
        content: [{ type: "text", text: safeJson(payload) }],
        details: payload
    };
}
function successPayload(result) {
    const safeOutput = buildSafeOutput(result);
    return {
        call_id: result.call_id,
        tool_name: result.tool_name,
        status: result.status,
        summary: result.summary,
        output: safeOutput,
        evidence: result.evidence
    };
}
function buildSafeOutput(result) {
    switch (result.tool_name) {
        case "send_email":
            return {
                message_id: result.output.message_id,
                recipient: result.output.recipient
            };
        case "read_file":
            return {
                path: result.output.path
            };
        case "write_file":
            return {
                path: result.output.path,
                bytes_written: result.output.bytes_written
            };
        case "call_api":
            return {
                endpoint: result.output.endpoint,
                method: result.output.method,
                status_code: result.output.status_code
            };
    }
}
function rejectedPayload(result) {
    return {
        call_id: result.call_id,
        tool_name: result.tool_name,
        status: result.status,
        rejection_code: result.rejection_code,
        summary: result.summary,
        evidence: result.evidence
    };
}
function buildToolResult(result) {
    if (result.status === "simulated_success") {
        return buildResult(successPayload(result));
    }
    return buildResult(rejectedPayload(result));
}
// -- request builder -------------------------------------------------------
function buildRequest(runtime, toolName, callId, args) {
    const base = {
        call_id: callId,
        session_id: runtime.session_id,
        scenario_id: runtime.scenario_id,
        case_id: runtime.case_id
    };
    switch (toolName) {
        case "send_email":
            return {
                ...base,
                tool_name: "send_email",
                arguments: args
            };
        case "read_file":
            return {
                ...base,
                tool_name: "read_file",
                arguments: args
            };
        case "write_file":
            return {
                ...base,
                tool_name: "write_file",
                arguments: args
            };
        case "call_api":
            return {
                ...base,
                tool_name: "call_api",
                arguments: args
            };
    }
}
// -- tool definitions ------------------------------------------------------
const SEND_EMAIL_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    required: ["recipient", "subject", "body"],
    properties: {
        recipient: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" }
    }
};
const READ_FILE_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: {
        path: { type: "string" }
    }
};
const WRITE_FILE_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    required: ["path", "content"],
    properties: {
        path: { type: "string" },
        content: { type: "string" }
    }
};
const CALL_API_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    required: ["endpoint", "method"],
    properties: {
        endpoint: { type: "string" },
        method: { type: "string", enum: ["GET", "POST"] }
    }
};
// -- registration ----------------------------------------------------------
// P1-Fix5: registerTrack1Tools now takes a runtime resolver so each tool
// execute can look up the per-session runtime via ctx.sessionId.
export function registerTrack1Tools(api, resolver) {
    api.registerTool({
        name: "send_email",
        label: "Send Email (Track 1 Simulated)",
        description: "Append an email to the campaign-local simulated outbox",
        parameters: SEND_EMAIL_PARAMETERS,
        async execute(toolCallId, params, _signal, _onUpdate, ctx) {
            const runtime = resolveRuntime(resolver, ctx, toolCallId);
            const request = buildRequest(runtime, "send_email", toolCallId, params);
            const result = runtime.executor.execute(request);
            return buildToolResult(result);
        }
    });
    api.registerTool({
        name: "read_file",
        label: "Read File (Track 1 Simulated)",
        description: "Read from the campaign-local virtual file namespace",
        parameters: READ_FILE_PARAMETERS,
        async execute(toolCallId, params, _signal, _onUpdate, ctx) {
            const runtime = resolveRuntime(resolver, ctx, toolCallId);
            const request = buildRequest(runtime, "read_file", toolCallId, params);
            const result = runtime.executor.execute(request);
            return buildToolResult(result);
        }
    });
    api.registerTool({
        name: "write_file",
        label: "Write File (Track 1 Simulated)",
        description: "Write to the campaign-local virtual file namespace",
        parameters: WRITE_FILE_PARAMETERS,
        async execute(toolCallId, params, _signal, _onUpdate, ctx) {
            const runtime = resolveRuntime(resolver, ctx, toolCallId);
            const request = buildRequest(runtime, "write_file", toolCallId, params);
            const result = runtime.executor.execute(request);
            return buildToolResult(result);
        }
    });
    api.registerTool({
        name: "call_api",
        label: "Call API (Track 1 Simulated)",
        description: "Resolve a campaign-local mock API route",
        parameters: CALL_API_PARAMETERS,
        async execute(toolCallId, params, _signal, _onUpdate, ctx) {
            const runtime = resolveRuntime(resolver, ctx, toolCallId);
            const request = buildRequest(runtime, "call_api", toolCallId, params);
            const result = runtime.executor.execute(request);
            return buildToolResult(result);
        }
    });
}
// -- runtime resolution ----------------------------------------------------
function resolveRuntime(resolver, ctx, toolCallId) {
    // P1-Fix5: prefer ctx.sessionId (passed by the real SDK runtime as the
    // 5th execute arg). Fall back to toolCallId-based lookup if the host
    // passes only 4 args (older SDK type declaration).
    const sessionId = ctx?.sessionId ?? resolveSessionByToolCallId(toolCallId);
    if (!sessionId) {
        throw new Error("track1_tool_session_not_found");
    }
    const runtime = resolver.resolveToolRuntime(sessionId);
    if (!runtime) {
        throw new Error("track1_tool_runtime_not_found");
    }
    return runtime;
}
// Per-plugin toolCallId → sessionId fallback map, populated by
// before_tool_call when it allows a tool call. This is only used when
// the SDK runtime does not pass ctx as the 5th execute argument.
const toolCallSessionMap = new Map();
export function registerToolCallSession(toolCallId, sessionId) {
    toolCallSessionMap.set(toolCallId, sessionId);
}
export function clearToolCallSession(toolCallId) {
    toolCallSessionMap.delete(toolCallId);
}
function resolveSessionByToolCallId(toolCallId) {
    return toolCallSessionMap.get(toolCallId);
}
