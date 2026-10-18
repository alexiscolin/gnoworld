import { cacheContents, controlled, expect, hydrated, PAGES, test, type Page } from "./fixtures.ts";

// The PWA as ADR-0001 §12 asks: a manifest Chromium reads, the build's hashed files answered
// from the worker's cache and nothing else cached, updates that wait for a click, and `?nosw`.
// (Chromium's own installability check answers nothing in a one-process browser, so it is not used.)
const HASHED = /^\/assets\/[\w.-]+-[\w-]{8,}\.(js|css)$/;

async function appManifest(page: Page) {
  return (await page.context().newCDPSession(page)).send("Page.getAppManifest");
}

test("Chromium reads the manifest with no error: the name, the root as scope and start, standalone", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  const { url, errors, manifest, data } = await appManifest(page);
  expect(errors).toEqual([]);
  expect(new URL(url).pathname).toBe("/manifest.webmanifest");
  // Chromium names display modes by its own enum, and reports no short name: those are read raw,
  // the colours as DESIGN-SYSTEM.md's --color-space, the page behind the scene.
  expect(manifest).toMatchObject({
    name: "gno.world",
    scope: new URL("/", baseURL).href,
    startUrl: new URL("/", baseURL).href,
    display: "kStandalone",
  });
  expect(JSON.parse(data ?? "{}")).toMatchObject({
    short_name: "gno.world",
    background_color: "#05070D",
    theme_color: "#05070D",
  });
});

test("the manifest check sees a page that links none, so it is not blind", async ({ page }) => {
  await page.route("**/no-manifest", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>No manifest</title><p>Nothing linked.</p>",
    }),
  );
  await page.goto("/no-manifest");
  expect((await appManifest(page)).url).toBe("");
});

for (const path of PAGES) {
  test(`${path} links the manifest`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  });
}

test("each icon the manifest names is a PNG of the size it states, 192 and 512", async ({ page }) => {
  await page.goto("/");
  const icons = await page.evaluate(async () => {
    const base = new URL(document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? "", location.href);
    const manifest = (await (await fetch(base)).json()) as { icons?: { src: string; sizes: string; type: string }[] };
    return Promise.all(
      (manifest.icons ?? []).map(async ({ src, sizes, type }) => {
        const bytes = new DataView(await (await fetch(new URL(src, base))).arrayBuffer());
        const png = bytes.getUint32(0) === 0x89504e47 && bytes.getUint32(4) === 0x0d0a1a0a;
        return { sizes, type, png, read: `${String(bytes.getUint32(16))}x${String(bytes.getUint32(20))}` };
      }),
    );
  });
  expect(icons.map(({ sizes }) => sizes).sort()).toEqual(["192x192", "512x512"]);
  for (const icon of icons) expect(icon).toEqual({ sizes: icon.read, type: "image/png", png: true, read: icon.sizes });
});

test("the worker answers the build's hashed files from its cache, and caches no page as they load", async ({
  page,
}) => {
  await page.goto("/");
  await controlled(page);
  // What install wrote: one cache, the build's hashed files only.
  const installed = await cacheContents(page);
  expect(installed.names).toEqual(["gnoworld-precache"]);
  expect(installed.paths.length, "install precached nothing").toBeGreaterThan(0);
  for (const path of installed.paths) expect(path).toMatch(HASHED);
  const fromWorker: string[] = [];
  const scripts: string[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.fromServiceWorker()) fromWorker.push(path);
    if (response.request().resourceType() === "script") scripts.push(path);
  });
  await page.reload();
  await hydrated(page);
  expect(fromWorker.length, "the worker answered nothing").toBeGreaterThan(0);
  for (const path of fromWorker) expect(installed.paths).toContain(path);
  // Every script the first screen needs comes from the cache: offline, the page still starts.
  expect(
    scripts.filter((path) => !fromWorker.includes(path)),
    "scripts the worker did not answer",
  ).toEqual([]);
  for (const path of ["/w/bubble", "/nowhere"]) {
    await page.goto(path);
    await hydrated(page);
  }
  // A file written as pages load would show.
  expect(await cacheContents(page)).toEqual(installed);
  await page.context().setOffline(true);
  const offline = await page.evaluate(async (asset) => {
    const answer = async (url: string) => (await fetch(url).catch(() => null))?.status ?? "no answer";
    return { asset: await answer(asset), page: await answer("/w/bubble") };
  }, fromWorker[0] ?? "");
  expect(offline).toEqual({ asset: 200, page: "no answer" });
});

// The second host (tests/e2e/serve.mjs) serves the same build, and a new worker once bumped: one
// bump at a time, so these run in turn.
test.describe("updates", () => {
  test.describe.configure({ mode: "serial" });
  const site = "http://127.0.0.1:4174";

  async function open(page: Page): Promise<void> {
    await page.goto(`${site}/`);
    await controlled(page);
    await hydrated(page);
    await page.evaluate(() => {
      (window as unknown as { before: ServiceWorker | null }).before = navigator.serviceWorker.controller;
      document.body.dataset["before"] = "update";
    });
  }

  // Before the click: the same worker controls the page, the new one waits, and no reload happened.
  const untouched = (page: Page) =>
    page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const before = (window as unknown as { before: ServiceWorker | null }).before;
      return {
        same: navigator.serviceWorker.controller === before && registration?.active === before,
        waiting: (registration?.waiting ?? null) !== null,
        marked: document.body.dataset["before"] === "update",
      };
    });

  async function bump(page: Page, request: { post(url: string): Promise<{ status(): number }> }): Promise<void> {
    expect((await request.post(`${site}/__bump`)).status()).toBe(204);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
  }

  const promptOf = (page: Page) => page.getByRole("status").filter({ hasText: "New version available." });

  test("a new version waits: the prompt shows, and the page changes only after the click", async ({
    page,
    request,
  }) => {
    await open(page);
    const installed = await cacheContents(page);
    // An older version's file, one of this list's gone and one changed: the new worker fetches
    // what it lacks or holds wrong, and drops what it does not list once it takes over.
    const changed = await page.evaluate(async () => {
      const [name] = await caches.keys();
      const cache = await caches.open(name ?? "the worker's cache");
      const [first, second] = await cache.keys();
      if (first !== undefined) await cache.delete(first);
      if (second !== undefined) await cache.put(second, new Response("a file someone changed"));
      await cache.put("/assets/older-AAAAAAAA.js", new Response("an older version's"));
      return second?.url ?? "";
    });
    await bump(page, request);
    await expect(promptOf(page)).toBeVisible();
    expect(await untouched(page)).toEqual({ same: true, waiting: true, marked: true });
    await Promise.all([page.waitForEvent("load"), promptOf(page).getByRole("button", { name: "Reload" }).click()]);
    await controlled(page);
    await hydrated(page);
    expect((await untouched(page)).waiting).toBe(false);
    await expect(page.locator("body[data-before]")).toHaveCount(0);
    await expect(promptOf(page)).toHaveCount(0);
    await expect.poll(async () => cacheContents(page)).toEqual(installed);
    const held = await page.evaluate(async (url) => (await caches.match(url))?.text(), changed);
    expect(held).toBe(await (await request.get(changed)).text());
  });

  test("two tabs: the one clicked reloads; the other keeps its page until its own click", async ({ page, request }) => {
    const other = await page.context().newPage();
    await open(page);
    await open(other);
    await bump(page, request);
    await expect(promptOf(page)).toBeVisible();
    await expect(promptOf(other)).toBeVisible();
    await Promise.all([page.waitForEvent("load"), promptOf(page).getByRole("button", { name: "Reload" }).click()]);
    await hydrated(page);
    await expect(other.locator("body[data-before]")).toHaveCount(1);
    await Promise.all([other.waitForEvent("load"), promptOf(other).getByRole("button", { name: "Reload" }).click()]);
    await hydrated(other);
    await expect(other.locator("body[data-before]")).toHaveCount(0);
  });

  test("a file whose bytes are not the build's fails the install: no worker keeps it", async ({ page, request }) => {
    // Each first worker's last state, kept on the page: installing ends activated or redundant.
    await page.addInitScript(() => {
      const container = navigator.serviceWorker;
      const register = container.register.bind(container);
      container.register = async (...args: Parameters<ServiceWorkerContainer["register"]>) => {
        const registration = await register(...args);
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          document.documentElement.dataset["install"] = worker.state;
        });
        return registration;
      };
    });
    expect((await request.post(`${site}/__tamper`)).status()).toBe(204);
    try {
      await page.goto(`${site}/`);
      await hydrated(page);
      await expect(page.locator("html")).toHaveAttribute("data-install", /^(redundant|activated)$/);
      await expect(page.locator("html")).toHaveAttribute("data-install", "redundant");
      expect((await cacheContents(page)).paths).toEqual([]);
    } finally {
      expect((await request.post(`${site}/__tamper`)).status()).toBe(204);
    }
  });
});

test("?nosw unregisters the worker for that visit; the next visit without it registers again", async ({ page }) => {
  await page.goto("/");
  await controlled(page);
  const registrations = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  await page.goto("/?nosw");
  await hydrated(page);
  await expect.poll(registrations).toBe(0);
  await page.reload();
  await hydrated(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(await registrations()).toBe(0);
  // The worker took its cache with it.
  expect((await cacheContents(page)).names).toEqual([]);
  await page.goto("/");
  await hydrated(page);
  await expect.poll(registrations).toBe(1);
});

test("?nosw frees the site even when the scripts the worker holds cannot run", async ({ page }) => {
  await page.goto("/");
  await controlled(page);
  // The first screen's entry, broken in the worker's cache: the pages it serves cannot start.
  await page.evaluate(async () => {
    const cache = await caches.open("gnoworld-precache");
    for (const request of await cache.keys())
      if (request.url.includes("/entry.client-"))
        await cache.put(
          request,
          new Response("throw new Error('broken')", { headers: { "content-type": "text/javascript" } }),
        );
  });
  await page.goto("/?nosw");
  await hydrated(page);
  expect(await cacheContents(page)).toEqual({ names: [], paths: [] });
});

test("a worker that cannot register reports its error, and the page still works", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().route("**/sw.js", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await hydrated(page);
  await expect.poll(() => errors.some((message) => message.includes("ServiceWorker"))).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("gno.world");
});
