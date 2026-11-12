import type { Locator } from "@playwright/test";
import { violations } from "./axe.ts";
import { expect, hydrated, reactMark, test, type Page } from "./fixtures.ts";

// The pages slice 1 pre-renders (ADR-0002 §2), with the address each names as its own.
const pages = [
  // The default universe's count is the cosmos's, from the worlds' file, which this server does not serve (7d6).
  { path: "/", title: "gno.world", heading: "Worlds in Onyx", canonical: "https://gno.world/net/onyx/" },
  {
    path: "/w/bubble",
    title: "Bubble · gno.world",
    heading: "Bubble",
    canonical: "https://gno.world/net/onyx/w/bubble",
  },
  { path: "/net/onyx/", title: "gno.world", heading: "Worlds in Onyx", canonical: "https://gno.world/net/onyx/" },
  {
    path: "/net/onyx/w/bubble",
    title: "Bubble · gno.world",
    heading: "Bubble",
    canonical: "https://gno.world/net/onyx/w/bubble",
  },
];
// Paths no file answers: an unknown world, and paths that match no route at all.
const notFound = [
  { path: "/w/nowhere", title: "No world here · gno.world", heading: "No world here" },
  { path: "/w/Bubble", title: "No world here · gno.world", heading: "No world here" },
  { path: "/nowhere", title: "No page here · gno.world", heading: "No page here" },
  { path: "/w/", title: "No page here · gno.world", heading: "No page here" },
  { path: "/w/bubble/extra", title: "No page here · gno.world", heading: "No page here" },
];

async function tag(page: Page, selector: string): Promise<string> {
  const found = page.locator(selector);
  await expect(found).toHaveCount(1);
  return (await found.getAttribute(selector.startsWith("link") ? "href" : "content")) ?? "";
}

// A link followed from a hydrated page, to the page and title it leads to: a mark set on the window
// before the click is still there after it only if the page changed without a reload.
async function followInPlace(link: Locator, from: string, to: { url: string; title: string }) {
  const page = link.page();
  await page.goto(from);
  await hydrated(page);
  await page.evaluate(() => {
    Object.assign(window, { stayed: true });
  });
  await link.click();
  await expect(page).toHaveURL(to.url);
  await expect(page).toHaveTitle(to.title);
  expect(await page.evaluate(() => "stayed" in window)).toBe(true);
}

// Every error the page reports, and every request but the page's own that failed or answered 400 or more.
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    // Chrome logs the page's own 404 as an error; a page not found answers 404 on purpose.
    const ownStatus = message.location().url === page.url() && message.text().startsWith("Failed to load resource");
    if (message.type() === "error" && !ownStatus) problems.push(message.text());
  });
  page.on("requestfailed", (request) => problems.push(`failed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.request().resourceType() !== "document") {
      problems.push(`${String(response.status())}: ${response.url()}`);
    }
  });
  return problems;
}

test.describe("as a search engine reads it, before any script runs", () => {
  test.use({ javaScriptEnabled: false });

  for (const { path, title, heading, canonical } of pages) {
    test(`${path} carries its own title, canonical and Open Graph tags`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(await page.evaluate(reactMark)).toBe(false);
      await expect.soft(page).toHaveTitle(title);
      await expect.soft(page.locator("title")).toHaveCount(1);
      await expect.soft(page.locator("meta[charset]")).toHaveCount(1);
      await expect.soft(page.locator('meta[name="viewport"]')).toHaveCount(1);
      await expect.soft(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      const description = await tag(page, 'meta[name="description"]');
      expect.soft(await tag(page, 'link[rel="canonical"]')).toBe(canonical);
      expect.soft(await tag(page, 'meta[property="og:title"]')).toBe(title);
      expect.soft(await tag(page, 'meta[property="og:description"]')).toBe(description);
      expect.soft(await tag(page, 'meta[property="og:url"]')).toBe(canonical);
      expect.soft(await tag(page, 'meta[property="og:type"]')).toBe("website");
      // Every page here is Onyx's, a testnet: not indexed (5e).
      expect.soft(await tag(page, 'meta[name="robots"]')).toBe("noindex");
      expect.soft(await tag(page, 'meta[name="twitter:card"]')).toBe("summary");
      await expect.soft(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
      expect.soft(await tag(page, 'link[rel="icon"][type="image/svg+xml"]')).toBe("/icon.svg");
    });
  }

  // What Lighthouse's SEO audits read besides the tags: the page's language and a link's text.
  for (const { path } of pages) {
    test(`${path} names its language, and every link has text of its own`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", /^[a-z]{2}(-[A-Za-z0-9]+)*$/);
      const texts = await page.locator("a[href]").evaluateAll((links) =>
        links.map((link) => {
          const text = link.textContent.trim();
          return text === "" ? (link.getAttribute("aria-label") ?? "").trim() : text;
        }),
      );
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        expect(text).not.toBe("");
        expect(text.toLowerCase()).not.toMatch(/^(click here|here|read more|more|learn more|link|this)$/);
      }
    });
  }

  test("the host serves robots.txt and the sitemap of the mainnet, not a page", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Sitemap: https://gno.world/sitemap.xml");
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<loc>https://gno.world/net/gnoland/</loc>");
  });

  test("a world's page names the same canonical with a trailing slash", async ({ page }) => {
    await page.goto("/w/bubble/");
    expect(await tag(page, 'link[rel="canonical"]')).toBe("https://gno.world/net/onyx/w/bubble");
  });

  test("a path no file answers is not pre-rendered: the host answers 404", async ({ request }) => {
    for (const { path } of notFound) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });
});

test.describe("once the client takes over", () => {
  // Every request the page makes is watched: the home's count comes as a deployment serves it once the job ran (7t, red since 7n2).
  test.use({ counted: true });

  for (const { path, title } of pages) {
    test(`${path} hydrates with no error and keeps its title`, async ({ page }) => {
      const problems = watch(page);
      await page.goto(path);
      await hydrated(page);
      await expect(page).toHaveTitle(title);
      expect(problems).toEqual([]);
    });

    test(`${path} has no accessibility violation (axe)`, async ({ page }) => {
      await page.goto(path);
      await hydrated(page);
      expect(await violations(page)).toEqual([]);
    });
  }

  test("the error watch sees a page whose HTML the client does not match", async ({ page }) => {
    await page.route("**/w/bubble", async (route) => {
      const original = await route.fetch();
      await route.fulfill({
        response: original,
        body: (await original.text()).replace(">Bubble</h1>", ">Changed</h1>"),
      });
    });
    const problems = watch(page);
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect.poll(() => problems.some((problem) => problem.includes("#418"))).toBe(true);
  });

  test("a link to a world changes the page and its tags without a reload", async ({ page }) => {
    await followInPlace(page.getByRole("link", { name: "Bubble", exact: true }), "/", {
      url: "/w/bubble",
      title: "Bubble · gno.world",
    });
    expect(await tag(page, 'link[rel="canonical"]')).toBe("https://gno.world/net/onyx/w/bubble");
    expect(await tag(page, 'meta[property="og:url"]')).toBe("https://gno.world/net/onyx/w/bubble");
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  });

  // The way home is the design system's link-button: the router's link fills it (F259).
  test("the way home from a page not found changes the page without a reload", async ({ page }) => {
    const home = page.getByRole("alert").getByRole("link", { name: "Galaxy" });
    await followInPlace(home, "/nowhere", { url: "/", title: "gno.world" });
  });

  for (const { path, title, heading } of notFound) {
    test(`${path} says not found, keeps the shell, is not indexed and hydrates cleanly`, async ({ page }) => {
      const problems = watch(page);
      await page.goto(path);
      await hydrated(page);
      await expect(page.getByRole("alert")).toContainText(heading);
      await expect(page).toHaveTitle(title);
      await expect(page.getByRole("link", { name: "gnoworld" })).toBeVisible();
      const back = page.getByRole("alert").getByRole("link", { name: "Galaxy" });
      await expect(back).toHaveAttribute("href", "/");
      expect(await tag(page, 'meta[name="robots"]')).toBe("noindex");
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      expect(problems).toEqual([]);
      expect(await violations(page)).toEqual([]);
      await back.click();
      await expect(page).toHaveURL("/");
    });
  }

  for (const { path } of pages) {
    test(`${path} wears the design system, its fonts served from the site itself`, async ({ page, baseURL }) => {
      const site = new URL(baseURL ?? "http://unset").origin;
      const elsewhere: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== site) elsewhere.push(request.url());
      });
      await page.goto(path);
      await hydrated(page);
      // fonts.ready can settle before layout has asked for the face, under load: ask for it, then wait.
      await page.evaluate(() => document.fonts.load('1em "Geist Variable"'));
      await page.evaluate(() => document.fonts.ready);
      // check() answers true for a family no face declares: only a loaded face proves the font.
      const look = await page.evaluate(() => ({
        loaded: [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family),
        family: getComputedStyle(document.body).fontFamily,
        ground: getComputedStyle(document.body).backgroundColor,
      }));
      expect(look.family).toContain("Geist Variable");
      expect(look.loaded.some((family) => family.includes("Geist Variable"))).toBe(true);
      expect(look.ground).toBe("rgb(5, 7, 13)");
      expect(elsewhere).toEqual([]);
    });
  }

  // No page prints the name it was asked for yet (F119): this guards the day one does.
  test("a world name made of markup stays text", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.goto("/w/%22%3E%3Cimg%20src=x%20onerror=alert(1)%3E");
    await hydrated(page);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(dialogs).toEqual([]);
  });
});

// The files of one kind a page loads, by the paths its HTML names. A sheet a lazy chunk also needs
// ends in "#": React Router's mark.
function assets(html: string, kind: "js" | "css"): string[] {
  return [...html.matchAll(new RegExp(`(?:src|href)="(/assets/[^"#]+\\.${kind})#?"`, "g"))].map(
    (match) => match[1] ?? "",
  );
}

test("the test host serves each kind of file the build writes with its type, as a real host would", async ({
  request,
}) => {
  const home = await (await request.get("/")).text();
  const sheets = assets(home, "css");
  expect(sheets.length).toBeGreaterThan(0);
  const fonts = (await Promise.all(sheets.map(async (sheet) => (await request.get(sheet)).text()))).flatMap((css) =>
    [...css.matchAll(/url\((\/assets\/[^)]+\.woff2)\)/g)].map((match) => match[1] ?? ""),
  );
  expect(fonts.length).toBeGreaterThan(0);
  const files = [
    ["/", "text/html"],
    ["/w/bubble.data", "text/x-script"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/icon-192.png", "image/png"],
    ["/icon.svg", "image/svg+xml"],
    ["/sw.js", "text/javascript"],
    ...assets(home, "js").map((path) => [path, "text/javascript"]),
    ...sheets.map((path) => [path, "text/css"]),
    ...fonts.map((path) => [path, "font/woff2"]),
  ];
  for (const [path = "", type = ""] of files) {
    expect((await request.get(path)).headers()["content-type"], path).toContain(type);
  }
});

test("the React Compiler compiled the routes, not only React's own runtime", async ({ request }) => {
  const chunks = assets(await (await request.get("/")).text(), "js");
  // The compiler's runtime module, in whichever file the bundler puts it: it assigns `c`, where React's
  // own built-in one only lists it (`c:function`).
  const texts = await Promise.all(chunks.map(async (chunk) => (await request.get(chunk)).text()));
  expect(texts.some((text) => /\.c=function\(\w+\)\{return \w+\.H\.useMemoCache\(\w+\)\}/.test(text))).toBe(true);
  const routes = chunks.filter((chunk) => /\/assets\/(root|home-main)-/.test(chunk));
  expect(routes.length).toBeGreaterThan(0);
  for (const chunk of routes) {
    expect(await (await request.get(chunk)).text(), chunk).toContain("react.memo_cache_sentinel");
  }
});

// Layers rank by their first mention: the page meets the design system's six in their order, the
// app importing the sheet itself (root.tsx), the one import that brings it once ui's JavaScript is
// free of side effects (F363, F370).
test("a page meets the design system's six layers in their order", async ({ page }) => {
  await page.goto("/");
  const met = await page.evaluate(() => {
    const names: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSLayerStatementRule) names.push(...rule.nameList);
        if (rule instanceof CSSLayerBlockRule) names.push(rule.name);
        if (rule instanceof CSSGroupingRule) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) walk(sheet.cssRules);
    return [...new Set(names)];
  });
  expect(met).toEqual(["reset", "tokens", "base", "compositions", "components", "utilities"]);
});

// F3260: layers rank by their first mention, and the order must not hang on which chunk the bundler meets first (a chunk of
// components' CSS ahead of the statement made `a { color: inherit }` beat the components). The first sheet of every page is
// the one statement, so no chunking can change the order.
test.describe("the layers' order is the first sheet of every page", () => {
  for (const path of ["/", "/earth", "/list", "/w/bubble", "/net/onyx/", "/net/onyx/earth", "/net/onyx/w/bubble"]) {
    test(`${path}: the first stylesheet holds the one @layer statement and nothing else`, async ({ page, request }) => {
      await page.goto(path);
      await hydrated(page);
      const first = await page.evaluate(
        () => document.head.querySelector<HTMLLinkElement>("link[rel='stylesheet']")?.getAttribute("href") ?? "",
      );
      expect(first).not.toBe("");
      const css = (await (await request.get(first)).text()).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s/g, "");
      expect(css).toBe("@layerreset,tokens,base,compositions,components,utilities;");
    });
  }
});

// Slice 5p: no world has a capture yet (the capture job is slice 7), so a world's page shows no preview of it, whether
// read before any script runs or once it runs, and its tags name no social image. A preview added later comes with its
// capture, and with this test changed in its own commit.
test.describe("a world with no capture shows no preview", () => {
  for (const path of ["/w/bubble", "/net/onyx/w/bubble"]) {
    test(`${path} holds no picture, frame or preview, and no og:image`, async ({ page }) => {
      await page.goto(path);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bubble");
      // Not previews: the scene's own canvas (a world's page draws its planet in it, live) and PlanetThumb's drawn disc (the chat's
      // column of worlds, `data-fallback`: no picture of any world, ui draws it). A capture, an image of the world, a frame or a
      // `[data-preview]` still count.
      await expect(
        page.locator(
          "figure, picture, img:not([data-fallback] > img), video, canvas:not([data-scene]), iframe, [data-preview]",
        ),
      ).toHaveCount(0);
      await expect(page.locator('meta[property="og:image"], meta[name="twitter:image"]')).toHaveCount(0);
    });
  }
});
