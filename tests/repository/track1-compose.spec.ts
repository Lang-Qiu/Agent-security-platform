import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

async function loadCompose(relativePath: string): Promise<any> {
  const fullPath = resolve(import.meta.dirname, "../../", relativePath);
  const content = await readFile(fullPath, "utf8");
  return parseYaml(content);
}

test("REQ-T1-DEMO-010 Compose never publishes internal ingest or OpenClaw ports", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  assert.deepEqual(compose.services.backend.ports, ["3000:3000"]);
  assert.deepEqual(compose.services.backend.expose, ["3001"]);
  assert.equal("ports" in compose.services["openclaw-gateway"], false);
  assert.deepEqual(
    Object.keys(compose.services).sort(),
    ["backend", "campaign-runner", "frontend", "openclaw-gateway"]
  );
});

test("REQ-T1-DEMO-010 Compose keeps OpenClaw state ephemeral", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  const service = compose.services["openclaw-gateway"];
  assert.ok(Array.isArray(service.tmpfs));
  assert.deepEqual(service.tmpfs.slice().sort(), [
    "/run/track1",
    "/tmp/openclaw",
    "/workspace"
  ]);
  for (const volume of service.volumes) {
    assert.match(volume, /:ro$/);
  }
});

test("REQ-T1-DEMO-010 Compose uses track1 profile for all services", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  for (const [name, service] of Object.entries(compose.services)) {
    assert.ok(
      Array.isArray((service as any).profiles) &&
        (service as any).profiles.includes("track1"),
      `${name} must be in track1 profile`
    );
  }
});

test("REQ-T1-DEMO-010 Compose defines isolated networks", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  assert.ok(compose.networks);
  assert.ok(compose.networks["track1-public"]);
  assert.ok(compose.networks["track1-ingest"]);
  assert.ok(compose.networks["track1-model-egress"]);
});

test("REQ-T1-DEMO-010 Compose runner depends on healthy backend and OpenClaw", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  const runner = compose.services["campaign-runner"];
  assert.ok(runner.depends_on);
  assert.ok(runner.depends_on.backend);
  assert.ok(runner.depends_on["openclaw-gateway"]);
  assert.equal(runner.depends_on.backend.condition, "service_healthy");
  assert.equal(runner.depends_on["openclaw-gateway"].condition, "service_healthy");
});

test("REQ-T1-DEMO-010 Compose contains no secret literals or default fallbacks", async () => {
  const content = await readFile(
    resolve(import.meta.dirname, "../../deploy/track1/compose.track1.yml"),
    "utf8"
  );
  assert.equal(/password|secret|key.*:\s*['"][^$]/i.test(content), false);
  assert.equal(/\$\{[^}]+:-[^}]+\}/i.test(content), false);
});

test("REQ-T1-DEMO-010 Compose uses pinned images or local builds", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  for (const [name, service] of Object.entries(compose.services)) {
    const svc = service as any;
    assert.ok(
      svc.build || (svc.image && svc.image.includes("@sha256:")),
      `${name} must use pinned image or build`
    );
  }
});

test("REQ-T1-DEMO-010 Compose mounts cases and config as read-only", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  const openclaw = compose.services["openclaw-gateway"];
  const readOnlyMounts = openclaw.volumes.filter((v: string) => v.includes(":ro"));
  assert.ok(
    readOnlyMounts.some((v: string) => v.includes("samples/track1/cases")),
    "cases must be read-only"
  );
  assert.ok(
    readOnlyMounts.some((v: string) => v.includes("integrations/openclaw/config")),
    "config must be read-only"
  );
});
