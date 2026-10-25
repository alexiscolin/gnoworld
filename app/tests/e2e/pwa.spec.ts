import { cacheContents, controlled, expect, hydrated, PAGES, test, type Page } from "./fixtures.ts";
import { GUARDED, UPDATING } from "./sites.ts";

// The PWA as ADR-0001 §12 asks: a manifest Chromium reads, the build's hashed files answered
// from the worker's cache and nothing else cached, updates that wait for a click, and `?nosw`.
// (Chromium's own installability check answers nothing in a one-process browser, so it is not used.)
const HASHED = /^\/assets\/[\w.-]+-[\w-]{8}\.(js|css|woff2)$/;

const promptOf = (page: Page) => page.getByRole("status").filter({ hasText: "New version available." });
// The notice's words, in the top layer: its region stays in the page's flow and takes no room (F331).
const noticeOf = (page: Page) => promptOf(page).getByText("New version available.");

const reload = (page: Page) =>
  Promise.all([page.waitForEvent("load"), promptOf(page).getByRole("button", { name: "Reload" }).click()]);

// A deploy on a host that bumps (tests/e2e/serve.mjs), then the tab shown again, which is when an
// open page asks for a newer worker.
async function bump(
  page: Page,
  request: { post(url: string, options?: { headers?: Record<string, string> }): Promise<{ status(): number }> },
  { site, headers = {} }: { site: string; headers?: Record<string, string> },
): Promise<void> {
  expect((await request.post(`${site}/__bump`, { headers })).status()).toBe(204);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

async function appManifest(page: Page) {
  return (await page.context().newCDPSession(page)).send("Page.getAppManifest");
}

// The icons the page's manifest names, as the page fetches it: each address resolved, "any" unless said.
async function manifestIcons(page: Page) {
  return page.evaluate(async () => {
    const base = new URL(document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? "", location.href);
    const manifest = (await (await fetch(base)).json()) as {
      icons?: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    return (manifest.icons ?? []).map(({ src, purpose = "any", ...icon }) => ({
      ...icon,
      purpose,
      src: new URL(src, base).href,
    }));
  });
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

// The demo asks for a shared password (deploy/web/nginx.conf): Chromium fetches the manifest
// without credentials unless its link asks for them, and then reads an empty one, with no error.
test.describe("behind the demo's password", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ contextOptions: { httpCredentials: { username: "team", password: "a test password" } } });
  const site = GUARDED;
  const password = { authorization: `Basic ${btoa("team:a test password")}` };

  // Node's own fetch: Playwright's request client would answer the challenge with the test's password.
  test("the host asks for it, so these checks are not blind", async () => {
    expect((await fetch(`${site}/`)).status).toBe(401);
    expect((await fetch(`${site}/`, { headers: password })).status).toBe(200);
  });

  test("Chromium reads the manifest, and the worker takes the page", async ({ page }) => {
    await page.goto(`${site}/`);
    await controlled(page);
    const { errors, manifest } = await appManifest(page);
    expect(errors).toEqual([]);
    expect(manifest).toMatchObject({ name: "gno.world", display: "kStandalone" });
  });

  test("a new version is found, offered and taken behind it", async ({ page, request }) => {
    await page.goto(`${site}/`);
    await controlled(page);
    const before = await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL,
    );
    await bump(page, request, { site, headers: password });
    await reload(page);
    await controlled(page);
    const after = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { waiting: registration?.waiting ?? null, url: registration?.active?.scriptURL };
    });
    expect(after).toEqual({ waiting: null, url: before });
  });
});

test("each icon the manifest names is a PNG of the size it states: 192, 512, and a maskable 512", async ({ page }) => {
  await page.goto("/");
  const icons = await page.evaluate(
    async (named) => {
      return Promise.all(
        named.map(async ({ src, sizes, type, purpose }) => {
          const bytes = new DataView(await (await fetch(src)).arrayBuffer());
          const png = bytes.getUint32(0) === 0x89504e47 && bytes.getUint32(4) === 0x0d0a1a0a;
          return {
            src,
            sizes,
            type,
            purpose,
            png,
            read: `${String(bytes.getUint32(16))}x${String(bytes.getUint32(20))}`,
          };
        }),
      );
    },
    await manifestIcons(page),
  );
  expect(icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`).sort()).toEqual([
    "192x192 any",
    "512x512 any",
    "512x512 maskable",
  ]);
  expect(new Set(icons.map(({ src }) => src)).size).toBe(3);
  for (const icon of icons) expect(icon).toMatchObject({ sizes: icon.read, type: "image/png", png: true });
});

// Decision 1 (docs/decisions.md): the mark in cream on space. A platform cuts a maskable icon to its
// own shape, keeping the circle of radius 2/5 of its side round the centre (W3C Web App Manifest, §2.3).
test("the icons draw the mark in cream on space, the maskable one opaque and inside its safe zone", async ({
  page,
}) => {
  await page.goto("/");
  const drawn = await page.evaluate(
    async (named) => {
      // The farthest pixel from the centre that is not the space, as a fraction of the side; the most
      // saturated; the creamiest.
      const scan = (data: Uint8ClampedArray, side: number) => {
        let [reach, chroma, cream] = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) {
          const [r = 0, g = 0, b = 0, a = 0] = data.slice(i, i + 4);
          if (a === 0) continue;
          chroma = Math.max(chroma, Math.max(r, g, b) - Math.min(r, g, b));
          cream = Math.max(cream, Math.min(r, g, b));
          const [x, y] = [(i / 4) % side, Math.floor(i / 4 / side)];
          if (a !== 255 || Math.max(Math.abs(r - 5), Math.abs(g - 7), Math.abs(b - 13)) > 2)
            reach = Math.max(reach, Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2) / side);
        }
        return { reach, chroma, cream };
      };
      return Promise.all(
        named.map(async ({ src, purpose }) => {
          const picture = await createImageBitmap(await (await fetch(src)).blob());
          const side = picture.width;
          const canvas = new OffscreenCanvas(side, side);
          const context = canvas.getContext("2d");
          if (context === null) throw new Error("no canvas");
          context.drawImage(picture, 0, 0);
          const { data } = context.getImageData(0, 0, side, side);
          const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
          // The mark's points, in icon.svg's units: centre, inner and outer planets, the ring's top, and
          // the space between the ring and the orbit. The maskable icon is the drawing at 80%, centred.
          const [offset, scale] = purpose === "maskable" ? [side * 0.1, side * 0.8] : [0, side];
          const marks = [
            [16, 16],
            [24, 16],
            [6.9, 25.4],
            [16, 8],
            [16, 5.25],
          ].map(([x = 0, y = 0]) =>
            pixel(Math.round(offset + ((x + 2) / 36) * scale), Math.round(offset + ((y + 2) / 36) * scale)).slice(0, 3),
          );
          const corners = [
            [0, 0],
            [side - 1, 0],
            [0, side - 1],
            [side - 1, side - 1],
          ].map(([x = 0, y = 0]) => pixel(x, y));
          return { purpose, corners, marks, ...scan(data, side) };
        }),
      );
    },
    await manifestIcons(page),
  );
  expect(drawn).toHaveLength(3);
  for (const { chroma, cream, marks } of drawn) {
    expect(chroma, "only space, cream and their blends").toBeLessThanOrEqual(16);
    expect(cream, "the mark in cream").toBeGreaterThanOrEqual(225);
    const [creams, space] = [marks.slice(0, -1), marks.at(-1) ?? []];
    for (const point of creams)
      expect(Math.min(...point), "the mark's centre, planets and ring").toBeGreaterThanOrEqual(225);
    expect(Math.max(...space), "the space between the ring and the orbit").toBeLessThanOrEqual(20);
  }
  // The drawing itself: the tokens' cream and space, and no other colour.
  const svg = await (await page.request.get("/icon.svg")).text();
  const tokens = await page.evaluate(() =>
    ["--p-cream", "--p-space"].map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()),
  );
  expect(new Set([...svg.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(([colour]) => colour.toLowerCase()))).toEqual(
    new Set(tokens),
  );
  const maskable = drawn.find(({ purpose }) => purpose === "maskable");
  expect(maskable?.corners).toEqual([
    [5, 7, 13, 255],
    [5, 7, 13, 255],
    [5, 7, 13, 255],
    [5, 7, 13, 255],
  ]);
  expect(maskable?.reach).toBeLessThanOrEqual(0.4);
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
  // The fonts too, the text's latin face among them: offline, the page keeps its face.
  const faces = installed.paths.filter((path) => /\/geist-latin-wght-normal-[\w-]{8}\.woff2$/.test(path));
  expect(faces).toHaveLength(1);
  // Of the fonts, the latin faces only, the text's and the code's (F292).
  const fonts = installed.paths
    .filter((path) => path.endsWith(".woff2"))
    .map((path) => path.replace(/^\/assets\/|-[\w-]{8}\.woff2$/g, ""));
  expect(fonts).toEqual(["geist-latin-wght-normal", "geist-mono-latin-wght-normal"]);
  const face = faces[0] ?? "";
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
  expect(fromWorker, "the first screen's own face, from the cache").toContain(face);
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
  const offline = await page.evaluate(
    async ([asset, font]) => {
      const answer = async (url: string) => (await fetch(url).catch(() => null))?.status ?? "no answer";
      return { asset: await answer(asset), font: await answer(font), page: await answer("/w/bubble") };
    },
    [fromWorker[0] ?? "", face] as const,
  );
  expect(offline).toEqual({ asset: 200, font: 200, page: "no answer" });
});

// The second host (tests/e2e/serve.mjs) serves the same build, and a new worker once bumped: one
// bump at a time, so these run in turn.
test.describe("updates", () => {
  test.describe.configure({ mode: "serial" });
  const site = UPDATING;

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

  // Offline, the check an installed page makes when shown again fails, as expected: nothing is
  // reported (F343). Chromium's own check escapes the page's offline mode, so the host goes down too.
  test("a check that fails offline reports nothing", async ({ page, request, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page);
    await context.setOffline(true);
    expect((await request.post(`${site}/__down`)).status()).toBe(204);
    try {
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      // Awaited after the page's own: once this one fails, the page's, asked first, has too.
      const checked = await page.evaluate(async () =>
        (await navigator.serviceWorker.getRegistration())?.update().then(
          () => "reached the host",
          () => "failed",
        ),
      );
      expect(checked).toBe("failed");
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(errors).toEqual([]);
    } finally {
      expect((await request.post(`${site}/__down`)).status()).toBe(204);
    }
  });

  // The notice is a flash, in the top layer at the top of the screen, however long the page (F338).
  test("the prompt shows within the screen on a page longer than it", async ({ page, request }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await open(page);
    const longer = await page.evaluate(() => {
      // Through the CSSOM: the site's policy refuses a style attribute set as text.
      document.querySelector("main")?.style.setProperty("min-block-size", "3000px");
      return document.documentElement.scrollHeight > innerHeight;
    });
    expect(longer, "the page is longer than the screen").toBe(true);
    await bump(page, request, { site });
    const notice = noticeOf(page);
    await expect(notice).toBeInViewport();
    await page.evaluate(() => {
      scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect(notice).toBeInViewport();
  });

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
    // The region the prompt fills is there, empty, before it: a screen reader announces the change.
    await page.getByRole("status").evaluate((region) => {
      region.id = "there-before";
    });
    await bump(page, request, { site });
    await expect(noticeOf(page)).toBeVisible();
    await expect(promptOf(page)).toHaveAttribute("id", "there-before");
    expect(await untouched(page)).toEqual({ same: true, waiting: true, marked: true });
    await reload(page);
    await controlled(page);
    await hydrated(page);
    expect((await untouched(page)).waiting).toBe(false);
    await expect(page.locator("body[data-before]")).toHaveCount(0);
    await expect(promptOf(page)).toHaveCount(0);
    await expect.poll(async () => cacheContents(page)).toEqual(installed);
    const held = await page.evaluate(async (url) => (await caches.match(url))?.text(), changed);
    expect(held).toBe(await (await request.get(changed)).text());
  });

  test("Close puts the notice away and keeps its region; a newer version brings it back", async ({ page, request }) => {
    await open(page);
    await bump(page, request, { site });
    await expect(noticeOf(page)).toBeVisible();
    await page.getByRole("status").evaluate((region) => {
      region.id = "kept";
    });
    await promptOf(page).getByRole("button", { name: "Close" }).click();
    await expect(promptOf(page)).toHaveCount(0);
    await expect(page.locator("#kept[role='status']")).toHaveCount(1);
    expect(await untouched(page)).toEqual({ same: true, waiting: true, marked: true });
    await bump(page, request, { site });
    await expect(noticeOf(page)).toBeVisible();
  });

  test("two tabs: the one clicked reloads; the other keeps its page until its own click", async ({ page, request }) => {
    const other = await page.context().newPage();
    await open(page);
    await open(other);
    await bump(page, request, { site });
    await expect(noticeOf(page)).toBeVisible();
    await expect(noticeOf(other)).toBeVisible();
    await reload(page);
    await hydrated(page);
    await expect(other.locator("body[data-before]")).toHaveCount(1);
    await reload(other);
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
