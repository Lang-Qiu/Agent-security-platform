import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const runnerPath = resolve(import.meta.dirname, "../src/modules/task-center/skills-static/semgrep-runner.ts");
const clientPath = resolve(import.meta.dirname, "../src/modules/task-center/clients/skills-static.engine-client.ts");
const errorPath = resolve(import.meta.dirname, "../src/modules/task-center/skills-static/skills-static-execution-error.ts");

type RunnerModule = {
  runSemgrepScan?: (options: {
    targetPath: string;
    rulePath: string;
    timeoutMs?: number;
    execFileImpl?: (...args: unknown[]) => Promise<{ stdout: string; stderr?: string }>;
  }) => Promise<unknown>;
};

type ClientModule = {
  SkillsStaticEngineClient?: new (options?: {
    provider?: string;
    semgrepTimeoutMs?: number;
    logEvent?: (event: Record<string, unknown>) => void | Promise<void>;
    runSemgrepScan?: (options: {
      targetPath: string;
      rulePath: string;
      timeoutMs?: number;
      execFileImpl?: (...args: unknown[]) => Promise<{ stdout: string; stderr?: string }>;
    }) => Promise<unknown>;
    mapSemgrepOutputToEngineOutput?: (rawOutput: unknown) => unknown;
  }) => {
    dispatch: (ticket: unknown) => Promise<unknown>;
  };
};

type ErrorModule = {
  SkillsStaticExecutionError?: new (...args: unknown[]) => Error & {
    code: string;
    phase: string;
    reason: string;
    provider: string;
  };
};

async function importIfExists<TModule>(filePath: string): Promise<TModule | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return import(pathToFileURL(filePath).href) as Promise<TModule>;
}

function createStaticAnalysisTicket() {
  return {
    task_id: "task_runtime_001",
    task_type: "static_analysis",
    engine_type: "skills_static",
    payload: {
      target: {
        target_type: "skill_package",
        target_value: resolve(import.meta.dirname, "../../tests/fixtures/skills-static-real-scan"),
        display_name: "skills-static-real-scan"
      },
      analysis_parameters: {
        language: "typescript"
      }
    }
  };
}

test("skills-static engine client logs provider selection and mock scan success events", async () => {
  const clientModule = await importIfExists<ClientModule>(clientPath);

  assert.ok(clientModule?.SkillsStaticEngineClient);

  if (!clientModule?.SkillsStaticEngineClient) {
    return;
  }

  const events: Array<Record<string, unknown>> = [];
  const previousProvider = process.env.SKILLS_STATIC_ENGINE_PROVIDER;
  delete process.env.SKILLS_STATIC_ENGINE_PROVIDER;

  try {
    const client = new clientModule.SkillsStaticEngineClient({
      logEvent: (event) => {
        events.push(event);
      }
    });

    const receipt = await client.dispatch(createStaticAnalysisTicket());

    assert.equal((receipt as { accepted?: boolean }).accepted, true);
    assert.deepEqual(
      events.map((event) => ({
        event: event.event,
        provider: event.provider
      })),
      [
        { event: "provider_selected", provider: "mock" },
        { event: "scan_started", provider: "mock" },
        { event: "scan_succeeded", provider: "mock" }
      ]
    );
  } finally {
    if (previousProvider === undefined) {
      delete process.env.SKILLS_STATIC_ENGINE_PROVIDER;
    } else {
      process.env.SKILLS_STATIC_ENGINE_PROVIDER = previousProvider;
    }
  }
});

test("skills-static engine client rejects unsupported providers with stable provider-selection failure semantics", async () => {
  const clientModule = await importIfExists<ClientModule>(clientPath);

  assert.ok(clientModule?.SkillsStaticEngineClient);

  if (!clientModule?.SkillsStaticEngineClient) {
    return;
  }

  const events: Array<Record<string, unknown>> = [];
  const previousProvider = process.env.SKILLS_STATIC_ENGINE_PROVIDER;
  process.env.SKILLS_STATIC_ENGINE_PROVIDER = "unsupported-provider";

  try {
    const client = new clientModule.SkillsStaticEngineClient({
      logEvent: (event) => {
        events.push(event);
      }
    });

    await assert.rejects(
      () => client.dispatch(createStaticAnalysisTicket()),
      (error: unknown) => {
        assert.equal(typeof error, "object");
        assert.notEqual(error, null);
        assert.equal((error as { name?: string }).name, "DomainError");
        assert.equal((error as { code?: string }).code, "SKILLS_STATIC_EXECUTION_FAILED");
        assert.equal((error as { phase?: string }).phase, "provider_selection");
        assert.equal((error as { reason?: string }).reason, "unsupported_provider");
        assert.equal((error as { provider?: string }).provider, "unsupported-provider");
        return true;
      }
    );

    assert.deepEqual(
      events.map((event) => ({
        event: event.event,
        provider: event.provider,
        phase: event.phase,
        reason: event.reason
      })),
      [
        { event: "scan_failed", provider: "unsupported-provider", phase: "provider_selection", reason: "unsupported_provider" }
      ]
    );
  } finally {
    if (previousProvider === undefined) {
      delete process.env.SKILLS_STATIC_ENGINE_PROVIDER;
    } else {
      process.env.SKILLS_STATIC_ENGINE_PROVIDER = previousProvider;
    }
  }
});

test("skills-static engine client rejects invalid semgrep timeout configuration before scan start", async () => {
  const clientModule = await importIfExists<ClientModule>(clientPath);

  assert.ok(clientModule?.SkillsStaticEngineClient);

  if (!clientModule?.SkillsStaticEngineClient) {
    return;
  }

  const previousProvider = process.env.SKILLS_STATIC_ENGINE_PROVIDER;
  const previousTimeout = process.env.SKILLS_STATIC_SEMGREP_TIMEOUT_MS;
  process.env.SKILLS_STATIC_ENGINE_PROVIDER = "semgrep";
  process.env.SKILLS_STATIC_SEMGREP_TIMEOUT_MS = "not-a-number";

  try {
    const client = new clientModule.SkillsStaticEngineClient();

    await assert.rejects(
      () => client.dispatch(createStaticAnalysisTicket()),
      (error: unknown) => {
        assert.equal(typeof error, "object");
        assert.notEqual(error, null);
        assert.equal((error as { code?: string }).code, "SKILLS_STATIC_EXECUTION_FAILED");
        assert.equal((error as { phase?: string }).phase, "provider_selection");
        assert.equal((error as { reason?: string }).reason, "invalid_provider_config");
        assert.equal((error as { provider?: string }).provider, "semgrep");
        return true;
      }
    );
  } finally {
    if (previousProvider === undefined) {
      delete process.env.SKILLS_STATIC_ENGINE_PROVIDER;
    } else {
      process.env.SKILLS_STATIC_ENGINE_PROVIDER = previousProvider;
    }

    if (previousTimeout === undefined) {
      delete process.env.SKILLS_STATIC_SEMGREP_TIMEOUT_MS;
    } else {
      process.env.SKILLS_STATIC_SEMGREP_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("semgrep runner maps missing rule paths into a stable runner failure", async () => {
  const runnerModule = await importIfExists<RunnerModule>(runnerPath);

  assert.ok(runnerModule?.runSemgrepScan);

  if (!runnerModule?.runSemgrepScan) {
    return;
  }

  await assert.rejects(
    () =>
      runnerModule.runSemgrepScan?.({
        targetPath: resolve(import.meta.dirname, "../../tests/fixtures/skills-static-real-scan"),
        rulePath: resolve(import.meta.dirname, "../../engines/skills-static/rules/ruleset-missing.yml")
      }),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.notEqual(error, null);
      assert.equal((error as { code?: string }).code, "SKILLS_STATIC_EXECUTION_FAILED");
      assert.equal((error as { phase?: string }).phase, "runner");
      assert.equal((error as { reason?: string }).reason, "ruleset_missing");
      return true;
    }
  );
});

test("semgrep runner maps timeout failures into a stable runner timeout error", async () => {
  const runnerModule = await importIfExists<RunnerModule>(runnerPath);

  assert.ok(runnerModule?.runSemgrepScan);

  if (!runnerModule?.runSemgrepScan) {
    return;
  }

  let observedTimeout: number | undefined;
  await assert.rejects(
    () =>
      runnerModule.runSemgrepScan?.({
        targetPath: resolve(import.meta.dirname, "../../tests/fixtures/skills-static-real-scan"),
        rulePath: resolve(import.meta.dirname, "../../engines/skills-static/rules/semgrep-minimal.yml"),
        timeoutMs: 1234,
        execFileImpl: async (_file, _args, options) => {
          observedTimeout = (options as { timeout?: number }).timeout;
          throw Object.assign(new Error("timed out"), {
            killed: true,
            signal: "SIGTERM"
          });
        }
      }),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.notEqual(error, null);
      assert.equal((error as { code?: string }).code, "SKILLS_STATIC_EXECUTION_FAILED");
      assert.equal((error as { phase?: string }).phase, "runner");
      assert.equal((error as { reason?: string }).reason, "timeout");
      return true;
    }
  );

  assert.equal(observedTimeout, 1234);
});

test("semgrep runner maps invalid JSON output into a stable runner parse failure", async () => {
  const runnerModule = await importIfExists<RunnerModule>(runnerPath);

  assert.ok(runnerModule?.runSemgrepScan);

  if (!runnerModule?.runSemgrepScan) {
    return;
  }

  await assert.rejects(
    () =>
      runnerModule.runSemgrepScan?.({
        targetPath: resolve(import.meta.dirname, "../../tests/fixtures/skills-static-real-scan"),
        rulePath: resolve(import.meta.dirname, "../../engines/skills-static/rules/semgrep-minimal.yml"),
        execFileImpl: async () => ({
          stdout: "not-json"
        })
      }),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.notEqual(error, null);
      assert.equal((error as { code?: string }).code, "SKILLS_STATIC_EXECUTION_FAILED");
      assert.equal((error as { phase?: string }).phase, "runner");
      assert.equal((error as { reason?: string }).reason, "output_invalid_json");
      return true;
    }
  );
});
