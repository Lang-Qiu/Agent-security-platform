import { spawn } from "node:child_process";

if (process.argv.length !== 2) {
  process.stderr.write("track1_evidence_build_arguments_not_supported\n");
  process.exitCode = 1;
} else {
  const executable =
    process.platform === "win32" ? "docker-compose.exe" : "docker";
  const args = [
    ...(process.platform === "win32" ? [] : ["compose"]),
    "-f",
    "deploy/track1/compose.track1.yml",
    "--profile",
    "evidence",
    "build",
    "evidence-capture",
    "report-builder"
  ];
  const child = spawn(executable, args, {
    shell: false,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH ?? "0"
    }
  });
  const result = await new Promise<boolean>((resolvePromise) => {
    child.once("error", () => resolvePromise(false));
    child.once("exit", (code, signal) =>
      resolvePromise(code === 0 && signal === null)
    );
  });
  if (result) {
    process.stdout.write("status=completed images=2\n");
  } else {
    process.stderr.write("track1_evidence_image_build_failed\n");
    process.exitCode = 1;
  }
}
