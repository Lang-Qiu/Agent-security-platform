import type { IncomingMessage } from "node:http";

import { DomainError } from "../errors/domain-error.ts";

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;
  }

  if (rawBody.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new DomainError("Request body must be valid JSON", "INVALID_REQUEST", 400);
  }
}
