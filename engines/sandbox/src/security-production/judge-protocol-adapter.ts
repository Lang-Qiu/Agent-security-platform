export const SANDBOX_SECURITY_JUDGE_PROTOCOL_IDS = Object.freeze([
  "openai_responses_v1",
  "openai_chat_completions_json_v1"
] as const);

export type SandboxSecurityJudgeProtocolId =
  (typeof SANDBOX_SECURITY_JUDGE_PROTOCOL_IDS)[number];

export const SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID =
  SANDBOX_SECURITY_JUDGE_PROTOCOL_IDS[0];

export const SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID =
  SANDBOX_SECURITY_JUDGE_PROTOCOL_IDS[1];

export const SANDBOX_SECURITY_OPERATOR_HTTPS_FQDN_ENDPOINT_POLICY_ID =
  "operator_https_fqdn_v1" as const;

export interface SandboxSecurityJudgeProtocolBinding {
  readonly protocol_id: SandboxSecurityJudgeProtocolId;
  readonly endpoint_policy_id: typeof SANDBOX_SECURITY_OPERATOR_HTTPS_FQDN_ENDPOINT_POLICY_ID;
  readonly base_url: string;
  readonly endpoint_url: string;
}

const MAX_BASE_URL_LENGTH = 512;
const ENCODED_DOT_PATH_SEGMENT =
  /(?:^|\/)(?:%2e|\.%2e|%2e\.|%2e%2e)(?:\/|$)/iu;

function invalid(): never {
  const error = new TypeError("sandbox_security_judge_protocol_invalid");
  error.name = "sandbox_security_judge_protocol_invalid";
  throw error;
}

function protocolEndpointPath(
  protocolId: SandboxSecurityJudgeProtocolId
): "responses" | "chat/completions" {
  if (protocolId === SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID) {
    return "responses";
  }
  if (
    protocolId ===
    SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID
  ) {
    return "chat/completions";
  }
  return invalid();
}

function rawPath(value: string): string {
  const schemeEnd = value.indexOf("://");
  if (schemeEnd < 0) return "/";
  const authority = value.slice(schemeEnd + 3);
  const pathStart = authority.search(/[/?#]/u);
  if (pathStart < 0 || authority[pathStart] !== "/") {
    return "/";
  }
  return authority.slice(pathStart).split(/[?#]/u, 1)[0] ?? "/";
}

function rawAuthority(value: string): string {
  const schemeEnd = value.indexOf("://");
  if (schemeEnd < 0) return "";
  const authorityAndPath = value.slice(schemeEnd + 3);
  const authorityEnd = authorityAndPath.search(/[/?#]/u);
  return authorityEnd < 0
    ? authorityAndPath
    : authorityAndPath.slice(0, authorityEnd);
}

function hasForbiddenRawUrlSyntax(value: string): boolean {
  return (
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    rawAuthority(value).includes("@")
  );
}

function isSafeBasePath(value: string): boolean {
  if (
    value.includes("\\") ||
    value.includes("//") ||
    value.includes("/./") ||
    value.includes("/../") ||
    ENCODED_DOT_PATH_SEGMENT.test(value) ||
    /%2f|%5c/iu.test(value)
  ) {
    return false;
  }
  if (value === "/") return true;
  const normalized = value.endsWith("/") ? value.slice(0, -1) : value;
  const segments = normalized.split("/").slice(1);
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function safeDnsHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  const labels = hostname.split(".");
  return (
    hostname.length <= 253 &&
    hostname.includes(".") &&
    hostname !== "localhost" &&
    !hostname.endsWith(".localhost") &&
    !hostname.endsWith(".local") &&
    !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/u.test(hostname) &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        label[0] !== "-" &&
        label[label.length - 1] !== "-" &&
        /^[a-z0-9-]+$/u.test(label)
    )
  );
}

export function resolveSandboxSecurityJudgeProtocol(
  protocolId: SandboxSecurityJudgeProtocolId,
  baseUrl: string
): Readonly<SandboxSecurityJudgeProtocolBinding> {
  try {
    const endpointPath = protocolEndpointPath(protocolId);
    if (typeof baseUrl !== "string") return invalid();
    const value = baseUrl.trim();
    if (
      value.length === 0 ||
      value.length > MAX_BASE_URL_LENGTH ||
      hasForbiddenRawUrlSyntax(value) ||
      !value.toLowerCase().startsWith("https://")
    ) {
      return invalid();
    }
    const path = rawPath(value);
    if (!isSafeBasePath(path)) return invalid();

    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.port !== "" ||
      !safeDnsHostname(url.hostname) ||
      !isSafeBasePath(url.pathname)
    ) {
      return invalid();
    }

    const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/$/u, "");
    const canonicalBaseUrl = `${url.origin}${pathname}`;
    if (canonicalBaseUrl.length > MAX_BASE_URL_LENGTH) return invalid();
    const endpointUrl = `${canonicalBaseUrl}/${endpointPath}`;
    return Object.freeze({
      protocol_id: protocolId,
      endpoint_policy_id: SANDBOX_SECURITY_OPERATOR_HTTPS_FQDN_ENDPOINT_POLICY_ID,
      base_url: canonicalBaseUrl,
      endpoint_url: endpointUrl
    });
  } catch {
    return invalid();
  }
}

export function normalizeSandboxSecurityJudgeEndpoint(
  protocolId: SandboxSecurityJudgeProtocolId,
  endpointUrl: string
): Readonly<SandboxSecurityJudgeProtocolBinding> {
  try {
    const endpointSuffix = `/${protocolEndpointPath(protocolId)}`;
    const maxEndpointUrlLength = MAX_BASE_URL_LENGTH + endpointSuffix.length;
    if (typeof endpointUrl !== "string") return invalid();
    const value = endpointUrl.trim();
    if (
      value.length === 0 ||
      endpointUrl !== value ||
      value.length > maxEndpointUrlLength ||
      hasForbiddenRawUrlSyntax(value)
    ) {
      return invalid();
    }
    const path = rawPath(value);
    if (!isSafeBasePath(path)) return invalid();
    const url = new URL(value);
    if (
      url.search !== "" ||
      url.hash !== "" ||
      !url.pathname.endsWith(endpointSuffix)
    ) {
      return invalid();
    }
    const basePath = url.pathname.slice(0, -endpointSuffix.length) || "/";
    const binding = resolveSandboxSecurityJudgeProtocol(
      protocolId,
      `${url.origin}${basePath}`
    );
    return binding.endpoint_url === value ? binding : invalid();
  } catch {
    return invalid();
  }
}

export function resolveSandboxSecurityOpenAiResponsesJudgeProtocol(
  baseUrl: string
): Readonly<SandboxSecurityJudgeProtocolBinding> {
  return resolveSandboxSecurityJudgeProtocol(
    SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID,
    baseUrl
  );
}

export function normalizeSandboxSecurityOpenAiResponsesJudgeEndpoint(
  endpointUrl: string
): Readonly<SandboxSecurityJudgeProtocolBinding> {
  return normalizeSandboxSecurityJudgeEndpoint(
    SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID,
    endpointUrl
  );
}
