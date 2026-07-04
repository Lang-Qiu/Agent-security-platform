import { resolve } from "node:path";

import {
  buildFixtureEvidencePack
} from "../../tests/track1/fixtures/report-evidence.fixture.ts";

if (process.argv.length !== 2) {
  process.stderr.write("track1_fixture_arguments_not_supported\n");
  process.exitCode = 1;
} else {
  try {
    const output = resolve("artifacts/track1/fixture-evidence");
    const pack = await buildFixtureEvidencePack(output);
    process.stdout.write(
      `status=completed artifacts=${pack.relativePaths.length} output=artifacts/track1/fixture-evidence\n`
    );
  } catch {
    process.stderr.write("track1_fixture_build_failed\n");
    process.exitCode = 1;
  }
}
