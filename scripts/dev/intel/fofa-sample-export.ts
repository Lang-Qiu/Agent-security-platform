import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type FofaSampleExportOutput = {
  candidatePath: string;
  verifiedPath: string;
  evidencePath: string;
};

export async function exportFofaSamples(options: {
  outputDir: string;
  exposureCandidates: Array<Record<string, unknown>>;
  verifiedFingerprints: Array<Record<string, unknown>>;
  rawEvidence: Array<Record<string, unknown>>;
}): Promise<FofaSampleExportOutput> {
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });

  const candidatePath = resolve(outputDir, "exposure-candidates.json");
  const verifiedPath = resolve(outputDir, "verified-fingerprints.json");
  const evidencePath = resolve(outputDir, "raw-evidence.json");

  await Promise.all([
    writeFile(candidatePath, JSON.stringify(options.exposureCandidates, null, 2), "utf8"),
    writeFile(verifiedPath, JSON.stringify(options.verifiedFingerprints, null, 2), "utf8"),
    writeFile(evidencePath, JSON.stringify(options.rawEvidence, null, 2), "utf8")
  ]);

  return {
    candidatePath,
    verifiedPath,
    evidencePath
  };
}
