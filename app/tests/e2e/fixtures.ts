// In Claude Code's sandbox Chromium runs as one process (playwright.config.ts), where closing a
// context ends the browser, so each test gets a browser of its own; elsewhere, Playwright's own.
import { expect, test as base, type Page, type Response as Answer, type Worker } from "@playwright/test";
import { VIOLATION } from "../../src/sw/report.ts";
import { site } from "../../src/places.ts";
import { serveJobs } from "./deployed.ts";
import { pinFigures } from "./figures.ts";

export { COUNTED } from "./deployed.ts";

export { expect, type Answer, type Page };

declare const process: { env: Record<string, string | undefined> };
// Playwright hands a screenshot as Node's Buffer, whose types this folder leaves out, as process's.
declare global {
  interface Buffer {
    toString(encoding: "base64"): string;
  }
}

const ownBrowser = base.extend({
  context: async ({ playwright, launchOptions, contextOptions, baseURL, javaScriptEnabled }, use) => {
    const browser = await playwright.chromium.launch(launchOptions);
    await use(
      await browser.newContext({ ...contextOptions, javaScriptEnabled, ...(baseURL === undefined ? {} : { baseURL }) }),
    );
    await browser.close();
  },
});

const FLUSH = "https://flush.invalid/";
const MARK = "csp-violation";

// A violation reaches the test as a task: one planted last, once seen, says every earlier one came. A
// navigation under way may take the first try's document away: the next try plants it in the new one.
async function flush(page: Page): Promise<void> {
  const done = page.waitForEvent("console", (message) => message.text() === `${MARK} flush`);
  await expect(async () => {
    await page.evaluate((url) => {
      new Image().src = url;
    }, FLUSH);
  }).toPass();
  await done;
}

// A worker's violation reaches the test as a message to the pages (src/sw/report.ts), after the worker's own
// task: a fetch the policy refuses, planted last in the worker, says every earlier violation of the worker came.
// A navigation under way may lose the message with the old document: each try plants the fetch again (F2066).
async function flushWorker(page: Page, worker: Worker): Promise<void> {
  await expect(async () => {
    const done = page.waitForEvent("console", {
      predicate: (message) => message.text() === `${MARK} flush`,
      timeout: 3000,
    });
    // Both settled, so a try that fails leaves no rejection unhandled behind it.
    const tries = await Promise.allSettled([
      worker.evaluate(
        (url) =>
          fetch(url).then(
            () => undefined,
            () => undefined,
          ),
        FLUSH,
      ),
      done,
    ]);
    expect(tries.map(({ status }) => status)).toEqual(["fulfilled", "fulfilled"]);
  }).toPass();
}

// Every journey runs under the site's CSP: a violation no test planted fails it (slice 3's plan, 3f). The directives a page's documents
// reported, written to its console, which outlives a navigation.
export const test = (process.env["SANDBOX_RUNTIME"] ? ownBrowser : base).extend<{
  planted: boolean;
  violations: string[];
  homeReads: undefined;
  pinned: undefined;
  refusing: boolean;
  refusals: string[];
  newcomer: boolean;
  returning: undefined;
  counted: boolean;
  figures: boolean;
}>({
  planted: [false, { option: true }],
  refusing: [false, { option: true }],
  // A shader the scene refused fails every journey that plants none (`refusing`): the scene reports each as a page error (scene.ts's
  // onShaderError), three logs any other. No journey heard the scene's own report before 7v, when the build broke them all.
  refusals: [
    async ({ context, refusing }, use) => {
      const seen: string[] = [];
      context.on("weberror", (error) => {
        const { message } = error.error();
        if (message.includes("a shader was refused")) seen.push(message);
      });
      context.on("console", (message) => {
        if (message.text().includes("THREE.WebGLProgram")) seen.push(message.text());
      });
      await use(seen);
      if (!refusing) expect(seen, "a shader the scene refused, which no journey planted").toEqual([]);
    },
    { auto: true },
  ],
  // ADR-0003: a device new to gnoworld sees "Start here" and the first visit's buttons. A journey's browser is a new
  // device, so each one is a reader who came back, as the video's frames are, unless it asks to be a newcomer.
  newcomer: [false, { option: true }],
  returning: [
    async ({ context, newcomer }, use) => {
      if (!newcomer)
        await context.addInitScript(() => {
          // A document with no origin of its own (about:blank) keeps no storage, and refuses it.
          try {
            localStorage.setItem("gnoworld:entered", "1");
          } catch {
            return;
          }
        });
      await use(undefined);
    },
    { auto: true },
  ],
  // The host serves no worlds' count, as a deployment before the job's first pass (heroNumber.spec.ts serves its own); a journey that watches
  // every request the page makes asks for it as a deployment serves it once the job ran.
  counted: [false, { option: true }],
  // The home's one read, answered as a settled site would: a file with no price and a block three minutes old (the server's timer
  // writes both), so no page fails a request it did not mean to and the age words stay still. The home asks no chain: a journey
  // that reads one routes its own. A journey that asks otherwise routes its own file.
  homeReads: [
    async ({ context, counted }, use) => {
      const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
      const ago = () => new Date(Date.now() - 3 * 60_000).toISOString();
      await context.route("**/markets.json", (route) =>
        route.fulfill({
          headers: cors,
          body: JSON.stringify({
            source: "CoinGecko",
            updated: ago(),
            tokens: [],
            block: { height: 1203885, time: ago(), host: "rpc.onyx.testnets.gno.land" },
          }),
        }),
      );
      // No count of people online and no prices' history (8i), as a server whose relay and timer have said nothing yet: the hero counts the
      // worlds and the live line draws no sparkline. A journey that watches them routes its own on its page, which goes first.
      for (const pattern of ["**/api/presence/people", "**/api/markets/history"])
        await context.route(pattern, (route) =>
          route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ error: "not_ready" }) }),
        );
      if (counted) await serveJobs(context, cors);
      await use(undefined);
    },
    { auto: true },
  ],
  // A look journey's live figures, fixed: who is here (/api/presence) and a world's hours, as no other journey of the run leaves them
  // (they share one stack). A page's own route goes first. The hours end on 11:00 UTC, so the plate's peak reads the same each run.
  figures: [false, { option: true }],
  pinned: [
    async ({ context, figures }, use) => {
      if (figures) await pinFigures(context);
      await use(undefined);
    },
    { auto: true },
  ],
  violations: [
    async ({ page, planted, javaScriptEnabled }, use) => {
      const context = page.context();
      const seen: string[] = [];
      // The pages whose document came with a policy, in every tab of the test's context: one a test makes
      // up itself carries none.
      const policed = new Set<Page>();
      context.on("response", (response) => {
        const request = response.request();
        // A service worker's own fetch belongs to no frame.
        if (!request.isNavigationRequest() || request.serviceWorker() !== null) return;
        const frame = request.frame();
        if (frame !== frame.page().mainFrame()) return;
        if (response.headers()["content-security-policy"] === undefined) policed.delete(frame.page());
        else policed.add(frame.page());
      });
      context.on("console", (message) => {
        const [mark, directive] = message.text().split(" ");
        if (mark === MARK && directive !== undefined && directive !== "flush") seen.push(directive);
      });
      await context.addInitScript(
        ([mark, flush, told]) => {
          document.addEventListener("securitypolicyviolation", (event) => {
            console.info(mark, event.blockedURI === flush ? "flush" : event.effectiveDirective);
          });
          // What the service worker tells its pages of its own violations.
          navigator.serviceWorker.addEventListener("message", (event: MessageEvent<unknown>) => {
            const data = event.data;
            if (typeof data !== "object" || data === null || !("type" in data) || data.type !== told) return;
            if ("directive" in data && "blockedURI" in data)
              console.info(mark, data.blockedURI === flush ? "flush" : data.directive);
          });
        },
        [MARK, FLUSH, VIOLATION],
      );
      await use(seen);
      const open = [...policed].filter((each) => !each.isClosed());
      // The first open page takes the worker's messages; each is flushed after.
      const [listening] = javaScriptEnabled ? open : [];
      if (listening !== undefined) for (const worker of context.serviceWorkers()) await flushWorker(listening, worker);
      for (const each of javaScriptEnabled ? open : []) await flush(each);
      if (!planted) expect(seen, "a CSP violation no test planted").toEqual([]);
    },
    { auto: true },
  ],
});

// React marks the document it hydrated; the static HTML alone never carries the mark.
export const reactMark = () => Object.keys(document).some((key) => key.startsWith("__reactContainer"));

export async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(reactMark);
  // The home's loader covers the page (and takes its pointer) until the dive starts or 2.5 s pass.
  await expect(page.getByRole("status", { name: "Loading space" })).toHaveCount(0, { timeout: 10_000 });
}

// The site's pages: each place of the data, at its path and at its canonical address (the same page, written twice, with
// its own inline scripts), and the list.
export const PAGES = [...new Set([...site.places.flatMap((place) => [place.path, place.canonical]), "/list"])];

/** Whether a page is a world's, which holds a chat. */
export const isWorld = (path: string) => /\/w\/[^/]+$/.test(path);

// A worker controls the page, so its install is done.
export async function controlled(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

export const cacheContents = (page: Page) =>
  page.evaluate(async () => {
    const names = await caches.keys();
    const paths: string[] = [];
    for (const name of names)
      for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
    return { names, paths: paths.sort() };
  });

/** Every script `page` asks from now on, by its address, as it asks it: a list that grows. */
export function scriptsAsked(page: Page): string[] {
  const scripts: string[] = [];
  page.on("request", (request) => (request.resourceType() === "script" ? scripts.push(request.url()) : undefined));
  return scripts;
}
