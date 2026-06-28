import {
  runAllTrack1MonitorCases,
  executeTrack1MonitorDemo
} from "../../../engines/sandbox/src/monitoring/index.ts";
import type { Track1MonitorDemoPorts } from "../../../engines/sandbox/src/monitoring/index.ts";

const ports: Track1MonitorDemoPorts = {
  run: runAllTrack1MonitorCases,
  writeStdout: (value: string) => process.stdout.write(value),
  writeStderr: (value: string) => process.stderr.write(value),
  setExitCode: (value: number) => { process.exitCode = value; }
};

await executeTrack1MonitorDemo(ports);
