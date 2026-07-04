import { createHash } from "node:crypto";

import { TRACK1_REPORT_SCREENSHOT_PATHS } from "./markdown-report.ts";

export interface Track1PdfBuildInput {
  markdown: Uint8Array;
  completed_at: string;
  screenshot_files: ReadonlyMap<string, Uint8Array>;
}

export interface Track1PdfContainerInput {
  completed_at: string;
  markdown_sha256: string;
  source_date_epoch: number;
  screenshots: Array<{
    path: string;
    byte_length: number;
    sha256: string;
  }>;
}

export interface Track1PdfContainerAssets {
  markdown: Uint8Array;
  screenshots: ReadonlyMap<string, Uint8Array>;
}

export interface Track1PdfBuilderPort {
  render(
    input: Readonly<Track1PdfContainerInput>,
    assets: Readonly<Track1PdfContainerAssets>
  ): Promise<Uint8Array>;
}

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const PDF_HEADER = Buffer.from("%PDF-", "ascii");
const RUNTIME_SECRET =
  /runtime_(?:prompt|output|credential|provider)_secret_|(?:bearer|basic)\s+[a-z0-9._~+/=-]+|sk-[a-z0-9_-]{8,}/i;

function inputFail(): never {
  throw new Error("track1_pdf_input_invalid");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeInput(value: unknown): Track1PdfBuildInput {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 3 ||
    !(value.markdown instanceof Uint8Array) ||
    value.markdown.byteLength === 0 ||
    typeof value.completed_at !== "string" ||
    !(value.screenshot_files instanceof Map)
  ) {
    inputFail();
  }
  const completed = Date.parse(value.completed_at);
  if (!Number.isFinite(completed)) inputFail();
  const markdown = Uint8Array.from(value.markdown);
  if (RUNTIME_SECRET.test(Buffer.from(markdown).toString("utf8"))) inputFail();
  if (value.screenshot_files.size !== TRACK1_REPORT_SCREENSHOT_PATHS.length) {
    inputFail();
  }
  const screenshots = new Map<string, Uint8Array>();
  for (const path of TRACK1_REPORT_SCREENSHOT_PATHS) {
    const bytes = value.screenshot_files.get(path);
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength <= PNG_SIGNATURE.byteLength ||
      !Buffer.from(bytes).subarray(0, 8).equals(PNG_SIGNATURE)
    ) {
      inputFail();
    }
    screenshots.set(path, Uint8Array.from(bytes));
  }
  if (
    [...value.screenshot_files.keys()].some(
      (path) => !TRACK1_REPORT_SCREENSHOT_PATHS.includes(path as never)
    )
  ) {
    inputFail();
  }
  return {
    markdown,
    completed_at: value.completed_at,
    screenshot_files: screenshots
  };
}

export async function buildTrack1Pdf(
  rawInput: unknown,
  port: Track1PdfBuilderPort
): Promise<Uint8Array> {
  const input = normalizeInput(rawInput);
  if (!port || typeof port.render !== "function") inputFail();
  const screenshots = [...input.screenshot_files].map(([path, bytes]) => ({
    path,
    byte_length: bytes.byteLength,
    sha256: sha256(bytes)
  }));
  const containerInput: Track1PdfContainerInput = {
    completed_at: input.completed_at,
    markdown_sha256: sha256(input.markdown),
    source_date_epoch: Math.floor(Date.parse(input.completed_at) / 1000),
    screenshots
  };
  const assets: Track1PdfContainerAssets = {
    markdown: Uint8Array.from(input.markdown),
    screenshots: new Map(
      [...input.screenshot_files].map(([path, bytes]) => [
        path,
        Uint8Array.from(bytes)
      ])
    )
  };
  let rendered: Uint8Array;
  try {
    rendered = await port.render(
      Object.freeze(structuredClone(containerInput)),
      Object.freeze(assets)
    );
  } catch {
    throw new Error("track1_pdf_build_failed");
  }
  if (!(rendered instanceof Uint8Array)) {
    throw new Error("track1_pdf_build_failed");
  }
  const result = Uint8Array.from(rendered);
  const buffer = Buffer.from(result);
  if (
    result.byteLength < 16 ||
    !buffer.subarray(0, PDF_HEADER.length).equals(PDF_HEADER) ||
    !buffer.includes(Buffer.from("%%EOF", "ascii")) ||
    RUNTIME_SECRET.test(buffer.toString("utf8"))
  ) {
    throw new Error("track1_pdf_build_failed");
  }
  return result;
}
