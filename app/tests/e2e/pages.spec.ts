import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./fixtures.ts";

// The pages slice 1 pre-renders (ADR-0002 §2), with the address each names as its own.
const pages = [
  { path: "/", title: "gno.world", heading: "gno.world", canonical: "https://gno.world/" },
  { path: "/w/bubble", title: "Bubble · gno.world", heading: "Bubble", canonical: "https://gno.world/w/bubble" },
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

// React marks the document it hydrated; the static HTML alone never carries the mark.
const reactMark = () => Object.keys(document).some((key) => key.startsWith("__reactContainer"));

async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(reactMark);
}

async function violations(page: Page): Promise<unknown[]> {
  return (await new AxeBuilder({ page }).analyze()).violations;
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
      await expect.soft(page.locator('meta[name="robots"]')).toHaveCount(0);
    });
  }

  test("a world's page names the same canonical with a trailing slash", async ({ page }) => {
    await page.goto("/w/bubble/");
    expect(await tag(page, 'link[rel="canonical"]')).toBe("https://gno.world/w/bubble");
  });

  test("a path no file answers is not pre-rendered: the host answers 404", async ({ request }) => {
    for (const { path } of notFound) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });
});

test.describe("once the client takes over", () => {
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
    await page.goto("/");
    await hydrated(page);
    await page.evaluate(() => {
      Object.assign(window, { stayed: true });
    });
    await page.getByRole("link", { name: "Bubble" }).click();
    await expect(page).toHaveURL("/w/bubble");
    await expect(page).toHaveTitle("Bubble · gno.world");
    expect(await page.evaluate(() => "stayed" in window)).toBe(true);
    expect(await tag(page, 'link[rel="canonical"]')).toBe("https://gno.world/w/bubble");
    expect(await tag(page, 'meta[property="og:url"]')).toBe("https://gno.world/w/bubble");
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  });

  for (const { path, title, heading } of notFound) {
    test(`${path} says not found, keeps the shell, is not indexed and hydrates cleanly`, async ({ page }) => {
      const problems = watch(page);
      await page.goto(path);
      await hydrated(page);
      await expect(page.getByRole("alert")).toContainText(heading);
      await expect(page).toHaveTitle(title);
      await expect(page.getByRole("link", { name: "gno.world" })).toBeVisible();
      expect(await tag(page, 'meta[name="robots"]')).toBe("noindex");
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      expect(problems).toEqual([]);
      expect(await violations(page)).toEqual([]);
    });
  }

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

test("the React Compiler compiled the routes, not only React's own runtime", async ({ request }) => {
  const home = await (await request.get("/")).text();
  const chunks = [...home.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((match) => match[1] ?? "");
  expect(chunks.some((chunk) => chunk.includes("/compiler-runtime-"))).toBe(true);
  const routes = chunks.filter((chunk) => /\/assets\/(root|home)-/.test(chunk));
  expect(routes.length).toBeGreaterThan(0);
  for (const chunk of routes) {
    expect(await (await request.get(chunk)).text(), chunk).toContain("react.memo_cache_sentinel");
  }
});
