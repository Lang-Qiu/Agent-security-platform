// Electron main process: boots an embedded backend (in-memory, no Docker
// required), seeds a fixed demo campaign, serves the built frontend behind
// a tiny static+proxy server, and opens a window on /review-demo.
//
// The backend and frontend already speak relative /api and /health paths
// (see frontend/vite.config.mjs and backend/src/main.ts), so this file only
// wires processes together — it does not reimplement any backend logic.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { waitForHealth } from "./wait-for-health.mjs";
import { createStaticProxyServer } from "./static-proxy-server.mjs";

const require = createRequire(import.meta.url);
const { app, BrowserWindow } = require("electron");

const __dirname = dirname(fileURLToPath(import.meta.url));

// Packaged builds ship backend/shared/frontend-dist under process.resourcesPath
// (see package.json "build.extraResources"); dev runs read them straight out
// of the repo checkout one level up from electron/.
const REPO_ROOT = app.isPackaged ? process.resourcesPath : join(__dirname, "..", "..");
const BACKEND_ENTRY = join(REPO_ROOT, "backend", "src", "main.ts");
const FRONTEND_DIST = join(REPO_ROOT, "frontend", "dist");

const PUBLIC_PORT = 47100;
const INTERNAL_PORT = 47101;
const STATIC_PORT = 47180;
const INGEST_TOKEN = randomBytes(24).toString("hex"); // 48 hex chars, well over the 32-char minimum.

let backendProcess = null;
let staticServer = null;

function startBackendProcess() {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", BACKEND_ENTRY],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(PUBLIC_PORT),
        INTERNAL_PORT: String(INTERNAL_PORT),
        PUBLIC_BIND_HOST: "127.0.0.1",
        INTERNAL_BIND_HOST: "127.0.0.1",
        TRACK1_INGEST_TOKEN: INGEST_TOKEN
      },
      stdio: "inherit"
    }
  );
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Backend process exited unexpectedly with code ${code}`);
    }
  });
  return child;
}

function seedDemoCampaignOnce() {
  const seedScript = join(__dirname, "seed-demo-campaign.ts");
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", seedScript, `http://127.0.0.1:${INTERNAL_PORT}`, INGEST_TOKEN],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "inherit" }
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Demo campaign seeding exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

function startStaticProxyServer() {
  if (!existsSync(FRONTEND_DIST)) {
    throw new Error(
      `Frontend build not found at ${FRONTEND_DIST}. Run "pnpm --filter @agent-security-platform/frontend build" first.`
    );
  }
  const server = createStaticProxyServer({
    staticRoot: FRONTEND_DIST,
    backendOrigin: `http://127.0.0.1:${PUBLIC_PORT}`
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(STATIC_PORT, "127.0.0.1", () => resolve(server));
  });
}

function stopAll() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Track1 评审模式",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await window.loadURL(`http://127.0.0.1:${STATIC_PORT}/review-demo`);
}

async function bootstrap() {
  backendProcess = startBackendProcess();
  await waitForHealth(`http://127.0.0.1:${PUBLIC_PORT}/health`);
  await seedDemoCampaignOnce();
  staticServer = await startStaticProxyServer();
  await createWindow();
}

app.whenReady().then(() => {
  bootstrap().catch((error) => {
    console.error("Failed to start the review demo app:", error);
    stopAll();
    app.quit();
  });
});

app.on("window-all-closed", () => {
  stopAll();
  app.quit();
});

app.on("before-quit", stopAll);
