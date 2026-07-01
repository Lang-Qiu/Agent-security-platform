import type { IncomingMessage } from "node:http";

import { DomainError } from "../errors/domain-error.ts";

// P2-T5: Body reader that enforces a UTF-8 byte limit before JSON parse.
// The limit is measured on raw Buffer.byteLength, not string length, so
// multi-byte UTF-8 characters are counted correctly. When the limit is
// exceeded, parsing is aborted immediately with a stable 413 error.
export async function readLimitedJsonBody(
  request: IncomingMessage,
  maxBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new DomainError(
        "Request body exceeds maximum allowed size",
        "CAMPAIGN_INGEST_BODY_TOO_LARGE",
        413
      );
    }
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf-8");
  if (rawBody.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new DomainError(
      "Request body must be valid JSON",
      "INVALID_REQUEST",
      400
    );
  }
}
