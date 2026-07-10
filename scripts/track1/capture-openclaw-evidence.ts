const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const CAMPAIGN_ID = /^campaign:t1:[a-f0-9]{32}$/;
const SESSION_ID = /^session:[a-f0-9]{32}$/;
const AGENT_IDS = [
  "agent:track1:prompt-injection",
  "agent:track1:tool-hijack",
  "agent:track1:memory-poison"
] as const;
const SCENARIO_IDS = ["T1-SC-001", "T1-SC-002", "T1-SC-003"] as const;
const OVERFLOW_VIEWPORTS = Object.freeze([
  [390, 844],
  [1024, 900],
  [1440, 1000]
] as const);
const RUNTIME_SECRET =
  /runtime_(?:prompt|output|credential|provider)_secret_|(?:bearer|basic)\s+[a-z0-9._~+/=-]+|sk-[a-z0-9_-]{8,}/i;

export interface Track1CampaignCaptureCase {
  scenario_id: string;
  agent_id: string;
  final_session_id: string;
}

export interface Track1CampaignCaptureInput {
  base_url: string;
  campaign_id: string;
  cases: Track1CampaignCaptureCase[];
}

export interface Track1CaptureRequest {
  path: string;
  route: string;
  campaign_id: string;
  expected_state: "fresh-running" | "fresh-completed";
  agent_id?: string;
  session_id?: string;
}

export interface Track1CaptureObservation {
  bytes: Uint8Array;
  evidence_state: string;
  campaign_id: string;
  selected_agent_id: string | null;
  selected_session_id: string | null;
  panel_boxes: Array<{ width: number; height: number }>;
  console_errors: string[];
  page_errors: string[];
  failed_requests: string[];
  unexpected_origins: string[];
  body_text: string;
}

export interface Track1BrowserPort {
  verifyOverflow(
    input: Readonly<Track1CampaignCaptureInput>,
    viewport: readonly [number, number]
  ): Promise<boolean>;
  capture(
    request: Readonly<Track1CaptureRequest>
  ): Promise<Track1CaptureObservation>;
}

export interface Track1CampaignCapture {
  path: string;
  bytes: Uint8Array;
}

function fail(): never {
  throw new Error("track1_capture_failed");
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

function normalizeInput(value: unknown): Track1CampaignCaptureInput {
  if (!isPlainObject(value)) fail();
  if (
    Object.keys(value).length !== 3 ||
    typeof value.base_url !== "string" ||
    typeof value.campaign_id !== "string" ||
    !Array.isArray(value.cases) ||
    !CAMPAIGN_ID.test(value.campaign_id)
  ) {
    fail();
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(value.base_url);
  } catch {
    return fail();
  }
  if (!["http:", "https:"].includes(baseUrl.protocol)) fail();
  if (value.cases.length !== 9) fail();
  const cases = value.cases.map((item) => {
    if (
      !isPlainObject(item) ||
      Object.keys(item).length !== 3 ||
      typeof item.scenario_id !== "string" ||
      typeof item.agent_id !== "string" ||
      typeof item.final_session_id !== "string" ||
      !SESSION_ID.test(item.final_session_id)
    ) {
      fail();
    }
    return {
      scenario_id: item.scenario_id,
      agent_id: item.agent_id,
      final_session_id: item.final_session_id
    };
  });
  for (let index = 0; index < SCENARIO_IDS.length; index += 1) {
    const scenarioCases = cases.filter(
      (item) => item.scenario_id === SCENARIO_IDS[index]
    );
    if (
      scenarioCases.length !== 3 ||
      scenarioCases.some((item) => item.agent_id !== AGENT_IDS[index])
    ) {
      fail();
    }
  }
  return {
    base_url: baseUrl.toString(),
    campaign_id: value.campaign_id,
    cases
  };
}

function normalizeRunningInput(value: unknown): Track1CampaignCaptureInput {
  if (
    !isPlainObject(value) ||
    typeof value.base_url !== "string" ||
    typeof value.campaign_id !== "string" ||
    !CAMPAIGN_ID.test(value.campaign_id)
  ) {
    fail();
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(value.base_url);
  } catch {
    return fail();
  }
  if (!["http:", "https:"].includes(baseUrl.protocol)) fail();
  return {
    base_url: baseUrl.toString(),
    campaign_id: value.campaign_id,
    cases: []
  };
}

function capturePlan(input: Track1CampaignCaptureInput): Track1CaptureRequest[] {
  const campaignRoute = `?campaign_id=${encodeURIComponent(input.campaign_id)}`;
  const scenarioCaptures = [
    {
      path: "screenshots/scenario-1-prompt-injection.png",
      scenario_id: SCENARIO_IDS[0],
      agent_id: AGENT_IDS[0]
    },
    {
      path: "screenshots/scenario-2-tool-hijack.png",
      scenario_id: SCENARIO_IDS[1],
      agent_id: AGENT_IDS[1]
    },
    {
      path: "screenshots/scenario-3-memory-poisoning.png",
      scenario_id: SCENARIO_IDS[2],
      agent_id: AGENT_IDS[2]
    }
  ].map((capture) => {
    const representative = input.cases.find(
      (item) => item.scenario_id === capture.scenario_id
    );
    if (!representative) fail();
    return {
      path: capture.path,
      route: campaignRoute,
      campaign_id: input.campaign_id,
      expected_state: "fresh-completed" as const,
      agent_id: capture.agent_id,
      session_id: representative.final_session_id
    };
  });
  return [
    {
      path: "screenshots/campaign-running.png",
      route: campaignRoute,
      campaign_id: input.campaign_id,
      expected_state: "fresh-running"
    },
    {
      path: "screenshots/campaign-overview.png",
      route: campaignRoute,
      campaign_id: input.campaign_id,
      expected_state: "fresh-completed"
    },
    ...scenarioCaptures
  ];
}

function validateObservation(
  request: Track1CaptureRequest,
  observation: Track1CaptureObservation
): Uint8Array {
  if (
    !isPlainObject(observation) ||
    !(observation.bytes instanceof Uint8Array) ||
    observation.bytes.byteLength <= PNG_SIGNATURE.byteLength ||
    !Buffer.from(observation.bytes)
      .subarray(0, PNG_SIGNATURE.byteLength)
      .equals(PNG_SIGNATURE) ||
    observation.evidence_state !== request.expected_state ||
    observation.campaign_id !== request.campaign_id ||
    observation.selected_agent_id !== (request.agent_id ?? null) ||
    observation.selected_session_id !== (request.session_id ?? null) ||
    !Array.isArray(observation.panel_boxes) ||
    observation.panel_boxes.length === 0 ||
    observation.panel_boxes.some(
      (box) =>
        !isPlainObject(box) ||
        typeof box.width !== "number" ||
        typeof box.height !== "number" ||
        box.width <= 0 ||
        box.height <= 0
    ) ||
    !Array.isArray(observation.console_errors) ||
    observation.console_errors.length > 0 ||
    !Array.isArray(observation.page_errors) ||
    observation.page_errors.length > 0 ||
    !Array.isArray(observation.failed_requests) ||
    observation.failed_requests.length > 0 ||
    !Array.isArray(observation.unexpected_origins) ||
    observation.unexpected_origins.length > 0 ||
    typeof observation.body_text !== "string" ||
    RUNTIME_SECRET.test(observation.body_text)
  ) {
    fail();
  }
  return Uint8Array.from(observation.bytes);
}

export async function captureTrack1CampaignEvidence(
  rawInput: unknown,
  browser: Track1BrowserPort
): Promise<readonly Track1CampaignCapture[]> {
  const input = normalizeInput(rawInput);
  if (
    !browser ||
    typeof browser.verifyOverflow !== "function" ||
    typeof browser.capture !== "function"
  ) {
    fail();
  }
  for (const viewport of OVERFLOW_VIEWPORTS) {
    if (!(await browser.verifyOverflow(input, viewport))) fail();
  }
  const captures: Track1CampaignCapture[] = [];
  const seen = new Set<string>();
  for (const request of capturePlan(input)) {
    if (seen.has(request.path)) fail();
    seen.add(request.path);
    const observation = await browser.capture(Object.freeze({ ...request }));
    captures.push(
      Object.freeze({
        path: request.path,
        bytes: validateObservation(request, observation)
      })
    );
  }
  return Object.freeze(captures);
}

async function captureRequests(
  input: Track1CampaignCaptureInput,
  browser: Track1BrowserPort,
  requests: readonly Track1CaptureRequest[],
  verifyOverflow: boolean
): Promise<readonly Track1CampaignCapture[]> {
  if (
    !browser ||
    typeof browser.verifyOverflow !== "function" ||
    typeof browser.capture !== "function"
  ) {
    fail();
  }
  if (verifyOverflow) {
    for (const viewport of OVERFLOW_VIEWPORTS) {
      if (!(await browser.verifyOverflow(input, viewport))) fail();
    }
  }
  const captures: Track1CampaignCapture[] = [];
  for (const request of requests) {
    const observation = await browser.capture(Object.freeze({ ...request }));
    if (process.env.TRACK1_CAPTURE_DEBUG === "1") {
      process.stderr.write(
        `${JSON.stringify({
          request_path: request.path,
          expected_state: request.expected_state,
          evidence_state: observation.evidence_state,
          campaign_id: observation.campaign_id,
          selected_agent_id: observation.selected_agent_id,
          selected_session_id: observation.selected_session_id,
          panel_boxes: observation.panel_boxes,
          console_errors: observation.console_errors,
          page_errors: observation.page_errors,
          failed_requests: observation.failed_requests,
          unexpected_origins: observation.unexpected_origins,
          body_len: observation.body_text?.length ?? 0,
          body_head: String(observation.body_text ?? "").slice(0, 200),
          bytes_len: observation.bytes?.byteLength ?? 0
        })}\n`
      );
    }
    captures.push(
      Object.freeze({
        path: request.path,
        bytes: validateObservation(request, observation)
      })
    );
  }
  return Object.freeze(captures);
}

export async function captureTrack1RunningEvidence(
  rawInput: unknown,
  browser: Track1BrowserPort
): Promise<Track1CampaignCapture> {
  const input = normalizeRunningInput(rawInput);
  const request: Track1CaptureRequest = {
    path: "screenshots/campaign-running.png",
    route: `?campaign_id=${encodeURIComponent(input.campaign_id)}`,
    campaign_id: input.campaign_id,
    expected_state: "fresh-running"
  };
  const [capture] = await captureRequests(input, browser, [request], false);
  return capture;
}

export async function captureTrack1FinalEvidence(
  rawInput: unknown,
  browser: Track1BrowserPort
): Promise<readonly Track1CampaignCapture[]> {
  const input = normalizeInput(rawInput);
  return captureRequests(input, browser, capturePlan(input).slice(1), true);
}

interface BrowserContextLike {
  newPage(): Promise<any>;
  close(): Promise<void>;
}

function makePageUrl(baseUrl: string, request: Track1CaptureRequest): URL {
  const url = new URL(request.route, baseUrl);
  if (request.agent_id) url.searchParams.set("agent_id", request.agent_id);
  if (request.session_id) url.searchParams.set("session_id", request.session_id);
  return url;
}

export async function openTrack1PlaywrightBrowserPort(
  baseUrl: string
): Promise<{ port: Track1BrowserPort; close(): Promise<void> }> {
  const normalizedBase = new URL(baseUrl);
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ headless: true });
  const context: BrowserContextLike = await browser.newContext({
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 1000 }
  });

  async function withPage<T>(run: (page: any) => Promise<T>): Promise<T> {
    const page = await context.newPage();
    try {
      return await run(page);
    } finally {
      await page.close();
    }
  }

  const port: Track1BrowserPort = {
    async verifyOverflow(input, viewport) {
      return withPage(async (page) => {
        await page.setViewportSize({ width: viewport[0], height: viewport[1] });
        const url = new URL(
          `?campaign_id=${encodeURIComponent(input.campaign_id)}`,
          input.base_url
        );
        await page.goto(url.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30_000
        });
        await page.locator("[data-evidence-state^='fresh-']").waitFor({
          state: "visible",
          timeout: 30_000
        });
        await page.waitForLoadState("networkidle", { timeout: 30_000 });
        return page.evaluate(() => {
          const elements = [
            document.documentElement,
            document.body,
            ...document.querySelectorAll(
              ".campaign-overview-header,.campaign-workbench,.campaign-agents,.supervision-inspector"
            )
          ];
          return elements.every(
            (element) => element.scrollWidth <= element.clientWidth
          );
        });
      });
    },
    async capture(request) {
      return withPage(async (page) => {
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        const failedRequests: string[] = [];
        const unexpectedOrigins: string[] = [];
        page.on("console", (message: any) => {
          if (message.type() === "error") consoleErrors.push("console_error");
        });
        page.on("pageerror", () => pageErrors.push("page_error"));
        page.on("requestfailed", (requestValue: any) => {
          const failure = requestValue.failure?.();
          const errorText = String(failure?.errorText ?? "");
          // Campaign polling aborts in-flight fetches on React re-render /
          // navigation; those are not real network failures.
          if (
            /ERR_ABORTED|net::ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(
              errorText
            )
          ) {
            return;
          }
          failedRequests.push(new URL(requestValue.url()).pathname);
        });

        page.on("request", (requestValue: any) => {
          const requestUrl = new URL(requestValue.url());
          if (
            !["data:", "blob:"].includes(requestUrl.protocol) &&
            requestUrl.origin !== normalizedBase.origin
          ) {
            unexpectedOrigins.push(requestUrl.origin);
          }
        });
        const url = makePageUrl(baseUrl, request);
        await page.goto(url.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30_000
        });
        const state = page.locator(
          `[data-evidence-state="${request.expected_state}"]`
        );
        await state.waitFor({ state: "visible", timeout: 30_000 });
        await page.waitForFunction(
          () => document.fonts.status === "loaded",
          undefined,
          { timeout: 30_000 }
        );
        await page.waitForLoadState("networkidle", { timeout: 30_000 });
        let selectedAgentId: string | null = null;
        let selectedSessionId: string | null = null;
        if (request.session_id) {
          const selected = page.locator(
            `[data-session-id="${request.session_id}"][aria-selected="true"]`
          );
          await selected.waitFor({ state: "visible", timeout: 30_000 });
          selectedSessionId = await selected.getAttribute("data-session-id");
          selectedAgentId = await selected
            .locator("xpath=ancestor::section[@data-agent-id][1]")
            .getAttribute("data-agent-id");
        }
        const panelBoxes = [];
        for (const selector of [
          "[data-testid='campaign-overview']",
          ".campaign-workbench",
          ".supervision-inspector"
        ]) {
          const locator = page.locator(selector);
          if ((await locator.count()) === 0) continue;
          const box = await locator.first().boundingBox();
          if (box) panelBoxes.push({ width: box.width, height: box.height });
        }
        const bodyText = (await page.locator("body").innerText()) ?? "";
        const bytes = await page.screenshot({
          type: "png",
          animations: "disabled",
          fullPage: false
        });
        return {
          bytes,
          evidence_state: await state.getAttribute("data-evidence-state"),
          campaign_id: new URL(page.url()).searchParams.get("campaign_id") ?? "",
          selected_agent_id: selectedAgentId,
          selected_session_id: selectedSessionId,
          panel_boxes: panelBoxes,
          console_errors: consoleErrors,
          page_errors: pageErrors,
          failed_requests: failedRequests,
          unexpected_origins: [...new Set(unexpectedOrigins)],
          body_text: bodyText
        };
      });
    }
  };
  return {
    port,
    async close() {
      await context.close();
      await browser.close();
    }
  };
}

async function runContainerCli(): Promise<void> {
  const inputPath = process.env.TRACK1_EVIDENCE_INPUT;
  const outputRoot = process.env.TRACK1_EVIDENCE_OUTPUT;
  const baseUrl = process.env.TRACK1_FRONTEND_URL;
  if (!inputPath || !outputRoot || !baseUrl) fail();
  const envelope = JSON.parse(await readFile(inputPath, "utf8")) as {
    capture_mode?: unknown;
    input?: unknown;
  };
  if (
    (envelope.capture_mode !== "running" &&
      envelope.capture_mode !== "final") ||
    !envelope.input
  ) {
    fail();
  }
  const browser = await openTrack1PlaywrightBrowserPort(baseUrl);
  try {
    const captures =
      envelope.capture_mode === "running"
        ? [await captureTrack1RunningEvidence(envelope.input, browser.port)]
        : await captureTrack1FinalEvidence(envelope.input, browser.port);
    for (const capture of captures) {
      const destination = resolve(outputRoot, capture.path.split("/").at(-1)!);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, capture.bytes, {
        flag: "wx",
        mode: 0o600
      });
    }
  } finally {
    await browser.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await runContainerCli();
    process.stdout.write("status=completed\n");
  } catch (error) {
    const detail =
      error instanceof Error
        ? `${error.message}${error.stack ? `\n${error.stack}` : ""}`
        : String(error);
    process.stderr.write(`${detail}\n`);
    process.stderr.write("track1_capture_failed\n");
    process.exitCode = 1;
  }
}
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
