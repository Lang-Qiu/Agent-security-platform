import type {
  CallApiRequest,
  ReadFileRequest,
  SendEmailRequest,
  SimulatedToolEvidence,
  SimulatedToolRejectedResult,
  SimulatedToolRejectionCode,
  SimulatedToolRequest,
  SimulatedToolResult,
  WriteFileRequest
} from "./contract.ts";
import { InMemorySimulatedToolState } from "./state.ts";

const VIRTUAL_FILE_PREFIX = "sandbox://fixtures/";
const MOCK_API_PREFIX = "mock://api.local/";

function evidence(
  request: SimulatedToolRequest,
  target_ref: string,
  state_change: SimulatedToolEvidence["state_change"]
): SimulatedToolEvidence {
  return {
    evidence_ref: `simulated-tool://${request.call_id}`,
    simulated: true,
    target_ref,
    state_change
  };
}

function reject(
  request: SimulatedToolRequest,
  targetRef: string,
  rejection_code: SimulatedToolRejectionCode,
  summary: string
): SimulatedToolRejectedResult {
  return {
    call_id: request.call_id,
    session_id: request.session_id,
    scenario_id: request.scenario_id,
    case_id: request.case_id,
    tool_name: request.tool_name,
    status: "rejected",
    rejection_code,
    summary,
    evidence: evidence(request, targetRef, "none")
  };
}

function hasSafePathSegments(value: string, prefix: string): boolean {
  if (
    !value.startsWith(prefix) ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }

  const relativePath = value.slice(prefix.length);
  if (relativePath.length === 0) {
    return false;
  }

  return relativePath
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isAllowedEmailRecipient(recipient: string): boolean {
  return /^[^@\s]+@local\.invalid$/i.test(recipient);
}

function isAllowedVirtualPath(path: string): boolean {
  return hasSafePathSegments(path, VIRTUAL_FILE_PREFIX);
}

function isAllowedMockEndpoint(endpoint: string): boolean {
  return hasSafePathSegments(endpoint, MOCK_API_PREFIX);
}

function resultContext(request: SimulatedToolRequest) {
  return {
    call_id: request.call_id,
    session_id: request.session_id,
    scenario_id: request.scenario_id,
    case_id: request.case_id
  };
}

export class SimulatedToolExecutor {
  private readonly state: InMemorySimulatedToolState;

  constructor(state: InMemorySimulatedToolState) {
    this.state = state;
  }

  execute(request: SimulatedToolRequest): SimulatedToolResult {
    switch (request.tool_name) {
      case "send_email":
        return this.sendEmail(request);
      case "read_file":
        return this.readFile(request);
      case "write_file":
        return this.writeFile(request);
      case "call_api":
        return this.callApi(request);
    }
  }

  private sendEmail(request: SendEmailRequest): SimulatedToolResult {
    const { recipient, subject, body } = request.arguments;
    if (!isAllowedEmailRecipient(recipient)) {
      return reject(
        request,
        recipient,
        "target_not_allowed",
        "Email recipient is outside the controlled local.invalid domain"
      );
    }

    const message_id = `sim-email-${request.call_id}`;
    this.state.appendEmail({
      message_id,
      recipient,
      subject,
      body
    });

    return {
      ...resultContext(request),
      tool_name: "send_email",
      status: "simulated_success",
      summary: "Simulated email appended to the local outbox",
      output: {
        message_id,
        recipient,
        subject
      },
      evidence: evidence(request, recipient, "outbox_append")
    };
  }

  private readFile(request: ReadFileRequest): SimulatedToolResult {
    const { path } = request.arguments;
    if (!isAllowedVirtualPath(path)) {
      return reject(
        request,
        path,
        "target_not_allowed",
        "File path is outside the controlled sandbox fixture namespace"
      );
    }

    const content = this.state.readFile(path);
    if (content === undefined) {
      return reject(
        request,
        path,
        "resource_not_found",
        "Virtual file does not exist"
      );
    }

    return {
      ...resultContext(request),
      tool_name: "read_file",
      status: "simulated_success",
      summary: "Virtual sandbox file read",
      output: {
        path,
        content
      },
      evidence: evidence(request, path, "none")
    };
  }

  private writeFile(request: WriteFileRequest): SimulatedToolResult {
    const { path, content } = request.arguments;
    if (!isAllowedVirtualPath(path)) {
      return reject(
        request,
        path,
        "target_not_allowed",
        "File path is outside the controlled sandbox fixture namespace"
      );
    }

    this.state.writeFile(path, content);

    return {
      ...resultContext(request),
      tool_name: "write_file",
      status: "simulated_success",
      summary: "Virtual sandbox file written",
      output: {
        path,
        bytes_written: Buffer.byteLength(content)
      },
      evidence: evidence(request, path, "virtual_file_write")
    };
  }

  private callApi(request: CallApiRequest): SimulatedToolResult {
    const { endpoint, method } = request.arguments;
    if (!isAllowedMockEndpoint(endpoint)) {
      return reject(
        request,
        endpoint,
        "target_not_allowed",
        "API endpoint is outside the controlled mock route namespace"
      );
    }

    const route = this.state.resolveApiRoute(method, endpoint);
    if (!route) {
      return reject(
        request,
        endpoint,
        "resource_not_found",
        "Mock API route does not exist"
      );
    }

    return {
      ...resultContext(request),
      tool_name: "call_api",
      status: "simulated_success",
      summary: "Mock API route resolved",
      output: {
        endpoint,
        method,
        status_code: route.status_code,
        body: { ...route.body }
      },
      evidence: evidence(request, endpoint, "none")
    };
  }
}
