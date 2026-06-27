export const SIMULATED_TOOL_NAMES = [
  "send_email",
  "read_file",
  "write_file",
  "call_api"
] as const;

export type SimulatedToolName = (typeof SIMULATED_TOOL_NAMES)[number];
export type SimulatedApiMethod = "GET" | "POST";
export type SimulatedToolStatus = "simulated_success" | "rejected";
export type SimulatedToolRejectionCode =
  | "target_not_allowed"
  | "resource_not_found";
export type SimulatedStateChange = "none" | "outbox_append" | "virtual_file_write";

export interface SimulatedToolRequestContext {
  call_id: string;
  session_id: string;
  scenario_id: string;
  case_id: string;
}

export interface SendEmailArguments {
  recipient: string;
  subject: string;
  body: string;
}

export interface ReadFileArguments {
  path: string;
}

export interface WriteFileArguments {
  path: string;
  content: string;
}

export interface CallApiArguments {
  endpoint: string;
  method: SimulatedApiMethod;
  body?: Record<string, string>;
}

export type SendEmailRequest = SimulatedToolRequestContext & {
  tool_name: "send_email";
  arguments: SendEmailArguments;
};

export type ReadFileRequest = SimulatedToolRequestContext & {
  tool_name: "read_file";
  arguments: ReadFileArguments;
};

export type WriteFileRequest = SimulatedToolRequestContext & {
  tool_name: "write_file";
  arguments: WriteFileArguments;
};

export type CallApiRequest = SimulatedToolRequestContext & {
  tool_name: "call_api";
  arguments: CallApiArguments;
};

export type SimulatedToolRequest =
  | SendEmailRequest
  | ReadFileRequest
  | WriteFileRequest
  | CallApiRequest;

export interface SimulatedToolEvidence {
  evidence_ref: string;
  simulated: true;
  target_ref: string;
  state_change: SimulatedStateChange;
}

export interface SimulatedToolOutputByName {
  send_email: {
    message_id: string;
    recipient: string;
    subject: string;
  };
  read_file: {
    path: string;
    content: string;
  };
  write_file: {
    path: string;
    bytes_written: number;
  };
  call_api: {
    endpoint: string;
    method: SimulatedApiMethod;
    status_code: number;
    body: Record<string, string>;
  };
}

type SimulatedToolResultContext = SimulatedToolRequestContext & {
  evidence: SimulatedToolEvidence;
  summary: string;
};

export type SimulatedToolSuccessResult = {
  [TName in SimulatedToolName]: SimulatedToolResultContext & {
    tool_name: TName;
    status: "simulated_success";
    output: SimulatedToolOutputByName[TName];
  };
}[SimulatedToolName];

export type SimulatedToolRejectedResult = SimulatedToolResultContext & {
  tool_name: SimulatedToolName;
  status: "rejected";
  rejection_code: SimulatedToolRejectionCode;
};

export type SimulatedToolResult = SimulatedToolSuccessResult | SimulatedToolRejectedResult;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeCorrelationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isPlainObject(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function normalizeRequestContext(
  value: Record<string, unknown>
): SimulatedToolRequestContext | null {
  if (
    !isSafeCorrelationId(value.call_id) ||
    !isSafeCorrelationId(value.session_id) ||
    !isNonEmptyString(value.scenario_id) ||
    !isNonEmptyString(value.case_id)
  ) {
    return null;
  }

  if (!/^T1-SC-\d{3}$/.test(value.scenario_id)) {
    return null;
  }

  if (!new RegExp(`^${value.scenario_id}-C\\d{3}$`).test(value.case_id)) {
    return null;
  }

  return {
    call_id: value.call_id,
    session_id: value.session_id,
    scenario_id: value.scenario_id,
    case_id: value.case_id
  };
}

export function normalizeSimulatedToolRequest(value: unknown): SimulatedToolRequest | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "call_id",
      "session_id",
      "scenario_id",
      "case_id",
      "tool_name",
      "arguments"
    ]) ||
    !isPlainObject(value.arguments)
  ) {
    return null;
  }

  const context = normalizeRequestContext(value);
  if (!context) {
    return null;
  }

  switch (value.tool_name) {
    case "send_email": {
      if (
        !hasExactKeys(value.arguments, ["recipient", "subject", "body"]) ||
        !isNonEmptyString(value.arguments.recipient) ||
        !isNonEmptyString(value.arguments.subject) ||
        !isNonEmptyString(value.arguments.body)
      ) {
        return null;
      }

      return {
        ...context,
        tool_name: "send_email",
        arguments: {
          recipient: value.arguments.recipient,
          subject: value.arguments.subject,
          body: value.arguments.body
        }
      };
    }

    case "read_file": {
      if (
        !hasExactKeys(value.arguments, ["path"]) ||
        !isNonEmptyString(value.arguments.path)
      ) {
        return null;
      }

      return {
        ...context,
        tool_name: "read_file",
        arguments: {
          path: value.arguments.path
        }
      };
    }

    case "write_file": {
      if (
        !hasExactKeys(value.arguments, ["path", "content"]) ||
        !isNonEmptyString(value.arguments.path) ||
        typeof value.arguments.content !== "string"
      ) {
        return null;
      }

      return {
        ...context,
        tool_name: "write_file",
        arguments: {
          path: value.arguments.path,
          content: value.arguments.content
        }
      };
    }

    case "call_api": {
      const hasBody = Object.hasOwn(value.arguments, "body");
      const expectedKeys = hasBody
        ? ["endpoint", "method", "body"]
        : ["endpoint", "method"];

      if (
        !hasExactKeys(value.arguments, expectedKeys) ||
        !isNonEmptyString(value.arguments.endpoint) ||
        (value.arguments.method !== "GET" && value.arguments.method !== "POST") ||
        (hasBody && !isStringRecord(value.arguments.body))
      ) {
        return null;
      }

      return {
        ...context,
        tool_name: "call_api",
        arguments: {
          endpoint: value.arguments.endpoint,
          method: value.arguments.method,
          ...(hasBody ? { body: { ...(value.arguments.body as Record<string, string>) } } : {})
        }
      };
    }

    default:
      return null;
  }
}
