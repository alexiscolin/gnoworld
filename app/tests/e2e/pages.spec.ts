import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./fixtures.ts";

// The pages slice 1 pre-renders (ADR-0002 §2), with the address each names as its own.
const pages = [
  { path: "/", title: "gno.world", heading: "gno.world", canonical: "https://gno.world/" },
  { path: "/w/bubble", title: "Bubble · gno.world", heading: "Bubble", canonical: "https://gno.world/w/bubble" },
];
const UNKNOWN = "/w/nowhere";

async function tag(page: Page, selector: string): Promise<string> {
  const found = page.locator(selector);
  await expect(found).toHaveCount(1);
  return (await found.getAttribute(selector.startsWith("link") ? "href" : "content")) ?? "";
}

// React marks the document it hydrated; the static HTML alone never carries the mark.
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => Object.keys(document).some((key) => key.startsWith("__reactContainer")));
}

// Every error the page reports, and every request that failed or answered 400 or more.
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
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
    test(`${path} carries its own title, description, canonical and Open Graph tags`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect.soft(page).toHaveTitle(title);
      await expect.soft(page.locator("title")).toHaveCount(1);
      await expect.soft(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      const description = await tag(page, 'meta[name="description"]');
      expect.soft(description.length).toBeGreaterThanOrEqual(50);
      expect.soft(description.length).toBeLessThanOrEqual(160);
      expect.soft(await tag(page, 'link[rel="canonical"]')).toBe(canonical);
      expect.soft(await tag(page, 'meta[property="og:title"]')).toBe(title);
      expect.soft(await tag(page, 'meta[property="og:description"]')).toBe(description);
      expect.soft(await tag(page, 'meta[property="og:url"]')).toBe(canonical);
      expect.soft(await tag(page, 'meta[property="og:type"]')).toBe("website");
      await expect.soft(page.locator('meta[name="robots"]')).toHaveCount(0);
    });
  }

  test("each page has a description of its own", async ({ page }) => {
    const seen = new Set<string>();
    for (const { path } of pages) {
      await page.goto(path);
      seen.add(await tag(page, 'meta[name="description"]'));
    }
    expect(seen.size).toBe(pages.length);
  });

  test("a world's page names the same canonical with a trailing slash", async ({ page }) => {
    await page.goto("/w/bubble/");
    expect(await tag(page, 'link[rel="canonical"]')).toBe("https://gno.world/w/bubble");
  });

  test("an unknown world is not pre-rendered: the host answers 404", async ({ request }) => {
    expect((await request.get(UNKNOWN)).status()).toBe(404);
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
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations).toEqual([]);
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
    await expect.poll(() => problems.length).toBeGreaterThan(0);
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

  test("an unknown world shows not found in its route, keeps the shell and is not indexed", async ({ page }) => {
    await page.goto(UNKNOWN);
    await hydrated(page);
    await expect(page.getByRole("alert")).toContainText("No world here");
    await expect(page.getByRole("link", { name: "gno.world" })).toBeVisible();
    expect(await tag(page, 'meta[name="robots"]')).toBe("noindex");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

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

  test("the React Compiler compiled the client's code", async ({ page, request }) => {
    await page.goto("/");
    const scripts = await page
      .locator("script[src], link[rel=modulepreload]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") ?? node.getAttribute("href") ?? ""));
    const bodies = await Promise.all(scripts.map(async (url) => (await request.get(url)).text()));
    expect(bodies.some((body) => body.includes("react.memo_cache_sentinel"))).toBe(true);
  });
});
