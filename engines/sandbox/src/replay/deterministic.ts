import { createHash } from "node:crypto";

// -- fixed epoch ---------------------------------------------------------

const REPLAY_EPOCH_MS = Date.parse("2026-06-28T00:00:00.000Z");

// -- hash ----------------------------------------------------------------

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// -- stable identifiers --------------------------------------------------

export function replayId(kind: string, caseId: string, sequence?: number): string {
  return sequence === undefined
    ? `${kind}:${caseId}`
    : `${kind}:${caseId}:${String(sequence).padStart(3, "0")}`;
}

// -- evidence references -------------------------------------------------

export function replayEvidenceRef(kind: string, caseId: string): string {
  return `evidence://track1/${caseId}/${kind}`;
}

// -- logical timestamps --------------------------------------------------

export function replayTimestamp(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("replayTimestamp requires a non-negative integer sequence");
  }

  return new Date(REPLAY_EPOCH_MS + sequence * 1_000).toISOString();
}
