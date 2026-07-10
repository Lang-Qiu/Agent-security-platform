import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import YAML from "yaml";

const ROOT = new URL("../../", import.meta.url);

interface ComposeService {
  command?: string[];
  ports?: string[];
  expose?: string[];
  tmpfs?: string[];
  volumes?: string[];
  networks?: string[];
  environment?: Record<string, string>;
  image?: string;
  build?: { dockerfile?: string };
  depends_on?: Record<string, { condition: string }>;
  profiles?: string[];
}

interface ComposeFile {
  networks?: Record<string, { internal?: boolean }>;
  services: Record<string, ComposeService>;
}

function loadCompose(path: string): ComposeFile {
  const text = readFileSync(new URL(path, ROOT), "utf8");
  return YAML.parse(text) as ComposeFile;
}

test("REQ-T1-DEMO-010 Compose never publishes internal ingest or OpenClaw ports", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  assert.deepEqual(
    compose.services.backend.ports,
    ["${TRACK1_BACKEND_HOST_PORT:-3000}:3000"]
  );
  assert.deepEqual(compose.services.backend.expose, ["3001"]);
  assert.equal("ports" in compose.services["openclaw-gateway"], false);
  assert.equal("ports" in compose.services["campaign-runner"], false);
  assert.equal("ports" in compose.services["evidence-capture"], false);
  assert.equal("ports" in compose.services["report-builder"], false);
  assert.deepEqual(compose.services.frontend.ports, ["5173:3000"]);
  assert.deepEqual(
    Object.keys(compose.services).sort(),
    [
      "backend",
      "campaign-runner",
      "evidence-capture",
      "frontend",
      "openclaw-gateway",
      "report-builder"
    ]
  );
});

test("REQ-T1-DEMO-010 Compose keeps OpenClaw state ephemeral", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  const service = compose.services["openclaw-gateway"];
  assert.deepEqual(service.tmpfs?.slice().sort(), [
    "/run/track1",
    "/tmp/openclaw",
    "/workspace"
  ]);
  for (const volume of service.volumes ?? []) {
    assert.match(volume, /:ro$/);
  }
});

test("REQ-T1-DEMO-010 Compose separates runtime and evidence service profiles", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  for (const name of ["backend", "campaign-runner", "frontend", "openclaw-gateway"]) {
    assert.deepEqual(compose.services[name].profiles, ["track1"], name);
  }
  for (const name of ["evidence-capture", "report-builder"]) {
    assert.deepEqual(compose.services[name].profiles, ["evidence"], name);
  }
});

test("REQ-T1-DEMO-010 Compose runner depends on healthy backend and OpenClaw", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  const runner = compose.services["campaign-runner"];
  assert.deepEqual(
    Object.keys(runner.depends_on ?? {}).sort(),
    ["backend", "openclaw-gateway"]
  );
  for (const dep of Object.values(runner.depends_on ?? {})) {
    assert.equal(dep.condition, "service_healthy");
  }
});

test("REQ-T1-DEMO-010 Compose keeps read-only mounts for backend/runner/frontend source", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  for (const name of ["backend", "campaign-runner", "frontend"]) {
    const service = compose.services[name];
    for (const volume of service.volumes ?? []) {
      assert.match(volume, /:ro$/, `${name} ${volume}`);
    }
  }
});

test("REQ-T1-DEMO-010 Compose network membership isolates public/ingest/model-egress", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  assert.deepEqual(
    compose.services.frontend.networks?.slice().sort(),
    ["track1-public"]
  );
  assert.deepEqual(
    compose.services["openclaw-gateway"].networks?.slice().sort(),
    ["track1-ingest", "track1-model-egress"]
  );
  assert.equal(
    compose.services.frontend.networks?.includes("track1-ingest"),
    false
  );
});

test("REQ-T1-DEMO-010 Compose has no hardcoded secret literal or unsafe fallback default", () => {
  const raw = readFileSync(
    new URL("deploy/track1/compose.track1.yml", ROOT),
    "utf8"
  );
  assert.equal(/API_KEY\s*:\s*["'][^$][^"']*["']/.test(raw), false);
  assert.equal(/\$\{[A-Z_]+:-[^}]+\}/.test(raw), false);
});

test("REQ-T1-DEMO-010 Compose pins non-build service images by digest", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  for (const [name, service] of Object.entries(compose.services)) {
    if (service.image && !service.build) {
      assert.match(service.image, /@sha256:[a-f0-9]{64}$/, name);
    }
  }
});

test("REQ-T1-DEMO-010 Compose openclaw-gateway builds from the pinned Dockerfile", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  assert.equal(
    compose.services["openclaw-gateway"].build?.dockerfile,
    "deploy/track1/Dockerfile.openclaw"
  );
});

test("REQ-T1-DEMO-010 Compose starts a real gateway and a runner image containing OpenClaw", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  const gateway = compose.services["openclaw-gateway"];
  const runner = compose.services["campaign-runner"];
  const backend = compose.services.backend;
  const frontend = compose.services.frontend;

  assert.deepEqual(gateway.command, [
    "gateway",
    "--bind",
    "lan",
    "--port",
    "19001"
  ]);
  assert.equal(
    runner.build?.dockerfile,
    "deploy/track1/Dockerfile.runner"
  );
  assert.equal(runner.image, undefined);
  assert.equal(
    runner.environment?.OPENCLAW_CONFIG_PATH,
    "/app/config/openclaw-runner.json5"
  );
  assert.equal(backend.build?.dockerfile, "deploy/track1/Dockerfile.backend");
  assert.equal(frontend.build?.dockerfile, "deploy/track1/Dockerfile.frontend");
});

test("REQ-T1-DEMO-010 Compose binds the real backend and keeps ingest network internal", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  const backend = compose.services.backend;

  assert.equal(backend.environment?.PUBLIC_BIND_HOST, "0.0.0.0");
  assert.equal(backend.environment?.INTERNAL_BIND_HOST, "0.0.0.0");
  assert.equal(compose.networks?.["track1-ingest"].internal, true);
  assert.equal(
    readFileSync(
      new URL("deploy/track1/compose.track1.yml", ROOT),
      "utf8"
    ).includes("minimal-backend.js"),
    false
  );
});

test("REQ-T1-DEMO-010 frontend proxy targets the backend service inside Compose", () => {
  const compose = loadCompose("deploy/track1/compose.track1.yml");
  assert.equal(
    compose.services.frontend.environment?.TRACK1_BACKEND_ORIGIN,
    "http://backend:3000"
  );
  assert.equal(
    compose.services["evidence-capture"].environment?.TRACK1_FRONTEND_URL,
    "http://frontend:3000/results/sandbox"
  );
  const viteConfig = readFileSync(
    new URL("frontend/vite.config.mjs", ROOT),
    "utf8"
  );
  assert.match(viteConfig, /process\.env\.TRACK1_BACKEND_ORIGIN/);
  assert.match(viteConfig, /allowedHosts/);
});



test("REQ-T1-DEMO-010 frontend Dockerfile ships monorepo tsconfig base and shared types", () => {
  const dockerfile = readFileSync(
    new URL("deploy/track1/Dockerfile.frontend", ROOT),
    "utf8"
  );
  assert.match(dockerfile, /COPY\s+tsconfig\.base\.json\s+/);
  assert.match(dockerfile, /COPY\s+shared\s+(\.\/)?shared/);
  assert.match(
    dockerfile,
    /COPY\s+samples\/track1\/review-demo\s+(\.\/)?samples\/track1\/review-demo/
  );
  assert.match(dockerfile, /COPY\s+frontend\s+(\.\/)?frontend/);
});

test("REQ-T1-DEMO-010 gitignore covers generated Track 1 artifacts", () => {
  const raw = readFileSync(new URL(".gitignore", ROOT), "utf8");
  assert.equal(raw.includes("artifacts/"), true);
});
