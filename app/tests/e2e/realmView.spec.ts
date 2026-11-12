import { readFileSync } from "node:fs";
import { PAGES } from "../chain/chainFixture.ts";
import { indexer } from "../chain/indexerRoute.ts";
import { chain, RPC } from "../chain/rpcRoute.ts";
import { expect, hydrated, test } from "./fixtures.ts";
import { violations } from "./axe.ts";

// 5h's journey (plan §1): a realm page holding a script, an image with onerror, a javascript: link and a hidden form field
// shows them as text, every field visible. The view is a client route read once; the RPC is answered here as a browser would
// get it (the recorded answers of tests/chain), and whether a real RPC answers a browser at all is F2841.
const HOSTILE = [
  "# Welcome",
  "<script>window.hacked = 1</script>",
  "<img src=x onerror=window.hacked=2>",
  "[click me](javascript:window.hacked=3)",
  "[https://gno.land/r/demo/dao](https://evil.example/phish)",
  "",
  '<gno-form exec="Drain">',
  '<gno-input name="amount" type="text" />',
  '<gno-input name="to" type="hidden" value="g1attacker" />',
  "</gno-form>",
].join("\n");

const RECORDED_WORLDS: unknown = JSON.parse(readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8"));

test.describe("a realm's view", () => {
  test("shows a hostile page as text, every field in view, and reads the chain once", async ({ page }) => {
    const { asked } = await chain(page, { "gno.land/r/demo/hostile": HOSTILE });
    await page.goto("/r/demo/hostile");
    await hydrated(page);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "hostile", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await expect(main).toContainText("<script>window.hacked = 1</script>");
    await expect(main).toContainText("<img src=x onerror=window.hacked=2>");
    await expect(main).toContainText("[click me](javascript:window.hacked=3)");
    // Every field in view, a hidden one with its name and value.
    await expect(main.getByText("amount")).toBeVisible();
    await expect(main.getByText("g1attacker")).toBeVisible();
    // The realm's page, not the chat beside it, which has its composer.
    await expect(
      main.locator("#page").locator("script, img, input, textarea, select, form, a[href^='javascript:']"),
    ).toHaveCount(0);
    expect(await page.evaluate(() => "hacked" in window)).toBe(false);
    // The height it was read at, and the link to the realm on gnoweb.
    await expect(main).toContainText("Read at block 786,661");
    await expect(main.getByRole("link", { name: "Open on gnoweb" })).toHaveAttribute(
      "href",
      "https://onyx.testnets.gno.land/r/demo/hostile",
    );
    // One request for the page, one for the height and one for the read functions' list, and nothing after: no result is asked
    // before a click.
    await page.waitForTimeout(1500);
    expect(asked.filter((path) => path === "/status")).toHaveLength(1);
    expect(asked.filter((path) => path === "vm/qrender")).toHaveLength(1);
    expect(asked.filter((path) => path === "vm/qfuncs")).toHaveLength(1);
    expect(asked.filter((path) => path === "vm/qeval")).toHaveLength(0);
  });

  test("shows the realm plate's facts from the indexer once, and keeps the page when the indexer is down", async ({
    page,
  }) => {
    await chain(page, { "gno.land/r/demo/dao": "# DAO" });
    const { asked } = await indexer(page);
    await page.goto("/r/demo/dao");
    await hydrated(page);
    const main = page.getByRole("main");
    await expect(main).toContainText("12,345");
    expect(await violations(page)).toEqual([]);
    await page.waitForTimeout(1000);
    expect(asked).toHaveLength(1);
    expect(decodeURIComponent(asked[0] ?? "")).toContain('"path":"gno.land/r/demo/dao"');

    await page.unroute("https://indexer.onyx.testnets.gno.land/**");
    await indexer(page, { down: true });
    await page.reload();
    await hydrated(page);
    await expect(main).toContainText("DAO");
    await expect(main).not.toContainText("12,345");
    await expect(main.getByRole("alert")).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
  });

  test("puts a link off gnoweb behind a warning that names the real host", async ({ page }) => {
    await chain(page, { "gno.land/r/demo/hostile": HOSTILE });
    await page.goto("/r/demo/hostile");
    await hydrated(page);
    const label = page.getByRole("button", { name: "https://gno.land/r/demo/dao" });
    await expect(label).toBeVisible();
    await label.click();
    const dialog = page.getByRole("dialog", { name: "Leaving this page" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("evil.example");
    await expect(dialog.getByRole("link", { name: "Go to evil.example" })).toHaveAttribute(
      "href",
      "https://evil.example/phish",
    );
    await dialog.getByRole("button", { name: "Stay here" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/r\/demo\/hostile$/);
  });

  test("shows the cap's state and the link for a page past 256 KB", async ({ page }) => {
    await chain(page, { "gno.land/r/demo/big": "# Secret\n" + "x".repeat(300_000) });
    await page.goto("/r/demo/big");
    await hydrated(page);
    const main = page.getByRole("main");
    await expect(main).toContainText("This page is too large to show here (over 256 KB).");
    await expect(main).not.toContainText("Secret");
    await expect(main.getByRole("link", { name: "Open on gnoweb" })).toBeVisible();
  });

  test("shows a failed read's state with the link to gnoweb when the RPC cannot be reached", async ({ page }) => {
    await page.route(RPC, (route) => route.abort());
    await page.goto("/r/demo/dao");
    await hydrated(page);
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("This page could not be read here");
    await expect(page.getByRole("main").getByRole("link", { name: "Open on gnoweb" })).toHaveAttribute(
      "href",
      "https://onyx.testnets.gno.land/r/demo/dao",
    );
  });

  test("shows a realm reached from the site, and a path that is no realm's is not found", async ({ page }) => {
    await chain(page, { "gno.land/r/demo/dao": "# DAO" });
    await page.goto("/list");
    await hydrated(page);
    await page.evaluate(() => {
      window.history.pushState({}, "", "/r/demo/dao");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("main").getByRole("heading", { name: "DAO", exact: true })).toBeVisible();
    await page.goto("/r/Demo/dao");
    await hydrated(page);
    await expect(page.getByRole("alert")).toContainText("No realm here");
  });

  test("shows a realm that is not on the chain as not found: no pill, no planet, no chat", async ({ page }) => {
    await chain(page, {});
    await page.goto("/r/defrewr");
    await hydrated(page);
    const main = page.getByRole("main");
    await expect(page.getByRole("alert")).toContainText("No realm here");
    await expect(main).toContainText("defrewr");
    await expect(main).not.toContainText("On chain");
    // The not-found page keeps the frame's empty globe box; no world is placed in it.
    await expect(page.locator("[data-globe]:not([data-world=waiting])")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("shows a namespace no world has as not found: an alert and no system kept", async ({ page }) => {
    await page.route("**/worlds.json", (route) =>
      route.fulfill({ body: JSON.stringify(RECORDED_WORLDS), contentType: "application/json" }),
    );
    await page.goto("/s/defrewr");
    await hydrated(page);
    await expect(page.getByRole("alert")).toContainText("No system here");
    await expect(page.locator("[data-globe]")).toHaveCount(0);
    // A namespace that has one is a system, not an alert.
    await page.goto("/s/gnoland");
    await hydrated(page);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  for (const [name, width, height] of [
    ["a phone", 390, 844],
    ["a computer", 1280, 900],
  ] as const) {
    test(`has no accessibility violation on ${name}, whole or failed`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await chain(page, { "gno.land/r/demo/hostile": HOSTILE });
      await page.goto("/r/demo/hostile");
      await hydrated(page);
      await expect(page.getByRole("main")).toContainText("Read at block");
      expect(await violations(page)).toEqual([]);
      await page.goto("/r/demo/nowhere");
      await hydrated(page);
      await expect(page.getByRole("alert")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }

  test.describe("as it looks", () => {
    test.use({ timezoneId: "UTC", locale: "en-GB" });
    const COINS = PAGES.find((row) => row.realm === "gno.land/r/gnoland/coins")?.body ?? "";

    for (const [name, width, height] of [
      ["phone", 390, 844],
      ["computer", 1280, 900],
    ] as const) {
      test(`a recorded realm page, on a ${name}'s screen`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await chain(page, { "gno.land/r/gnoland/coins": COINS });
        await page.goto("/r/gnoland/coins");
        await hydrated(page);
        await expect(page.getByRole("main")).toContainText("Read at block");
        await expect(page).toHaveScreenshot(`realm-view-${name}.png`, { mask: [page.getByRole("banner")] });
      });

      // The World view is the one lit on a world's page and on a realm's; hydration patches no attribute (react-dom 19.3.1), so the
      // light must follow the path once the page wakes. The galaxy is lit on its own page.
      test(`lights the World view on a realm's page or a world's, and Galaxy on the galaxy's, and none on the home, on a ${name}'s screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await chain(page, { "gno.land/r/gnoland/coins": COINS });
        const views = page.getByRole("navigation", { name: "Views" });
        for (const path of ["/r/gnoland/coins", "/w/bubble"]) {
          await page.goto(path);
          await hydrated(page);
          await expect(views.getByRole("link", { name: "Galaxy" })).toBeVisible();
          await expect(views.locator("[aria-current]")).toHaveCount(1);
          await expect(views.locator("[aria-current='page']")).toContainText("World");
        }
        await page.goto("/universe");
        await hydrated(page);
        await expect(views.locator("[aria-current='page']")).toHaveText("Galaxy");
        // The home is the Earth's first screen: no level is lit there.
        await page.goto("/");
        await hydrated(page);
        await expect(views.locator("[aria-current]")).toHaveCount(0);
      });
    }
  });
});
