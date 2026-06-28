import {
  executeTrack1BaseFilterDemo,
  buildTrack1BaseFilterDemoReport
} from "../../../engines/sandbox/src/base-filter/evaluation.ts";
import { runAllTrack1BaseFilterCases } from "../../../engines/sandbox/src/base-filter/replay-adapter.ts";

await executeTrack1BaseFilterDemo({
  run: async () =>
    buildTrack1BaseFilterDemoReport(await runAllTrack1BaseFilterCases()),
  writeStdout: (value: string) => process.stdout.write(value),
  writeStderr: (value: string) => process.stderr.write(value),
  setExitCode: (value: number) => {
    process.exitCode = value;
  }
});
