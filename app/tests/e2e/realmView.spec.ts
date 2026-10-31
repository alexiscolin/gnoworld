import AxeBuilder from "@axe-core/playwright";
import { FUNCTIONS, PAGES } from "../chain/chainFixture.ts";
import { queryEnvelope, statusEnvelope } from "../chain/chainEnvelopes.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// 5h's journey (plan §1): a realm page holding a script, an image with onerror, a javascript: link and a hidden form field
// shows them as text, every field visible. The view is a client route read once; the RPC is answered here as a browser would
// get it (the recorded answers of tests/chain), and whether a real RPC answers a browser at all is F2841.
const RPC = "https://rpc.onyx.testnets.gno.land/**";
const HEIGHT = 786661;
const TIME = "2026-10-30T23:43:10Z";

// Page of the realm the browser asks: `pages` by realm path, the rest "no page".
async function chain(page: Page, pages: Record<string, string>): Promise<{ asked: string[] }> {
  const asked: string[] = [];
  await page.route(RPC, async (route) => {
    const url = new URL(route.request().url());
    // A request is told by its query (vm/qrender, vm/qfuncs, vm/qeval) when it has one, by its path otherwise (/status).
    const query = (url.searchParams.get("path") ?? "").replaceAll('"', "");
    asked.push(query === "" ? url.pathname : query);
    const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
    if (url.pathname === "/status") {
      await route.fulfill({ headers: cors, body: JSON.stringify(statusEnvelope(HEIGHT, TIME)) });
      return;
    }
    if (query === "vm/qfuncs") {
      await route.fulfill({ headers: cors, body: JSON.stringify(queryEnvelope({ data: JSON.stringify(FUNCTIONS) })) });
      return;
    }
    const hex = (url.searchParams.get("data") ?? "").slice(2);
    const realm = decodeURIComponent(hex.replace(/(..)/g, "%$1")).split(":")[0] ?? "";
    const body = pages[realm];
    await route.fulfill({
      headers: cors,
      body: JSON.stringify(
        body === undefined
          ? queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } })
          : queryEnvelope({ data: body }),
      ),
    });
  });
  return { asked };
}

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

const violations = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations;

test.describe("a realm's view", () => {
  test("shows a hostile page as text, every field in view, and reads the chain once", async ({ page }) => {
    const { asked } = await chain(page, { "gno.land/r/demo/hostile": HOSTILE });
    await page.goto("/r/demo/hostile");
    await hydrated(page);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "gno.land/r/demo/hostile" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await expect(main).toContainText("<script>window.hacked = 1</script>");
    await expect(main).toContainText("<img src=x onerror=window.hacked=2>");
    await expect(main).toContainText("[click me](javascript:window.hacked=3)");
    // Every field in view, a hidden one with its name and value.
    await expect(main.getByText("amount")).toBeVisible();
    await expect(main.getByText("g1attacker")).toBeVisible();
    await expect(main.locator("script, img, input, textarea, select, form, a[href^='javascript:']")).toHaveCount(0);
    expect(await page.evaluate(() => "hacked" in window)).toBe(false);
    // The height it was read at, and the link to the realm on gnoweb.
    await expect(main).toContainText("Read at block 786,661");
    await expect(main.getByRole("link", { name: "Open it on gnoweb" })).toHaveAttribute(
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
    await expect(main.getByRole("link", { name: "Open it on gnoweb" })).toBeVisible();
  });

  test("shows a failed read's state with the link to gnoweb when the RPC cannot be reached", async ({ page }) => {
    await page.route(RPC, (route) => route.abort());
    await page.goto("/r/demo/dao");
    await hydrated(page);
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("This page could not be read here");
    await expect(page.getByRole("main").getByRole("link", { name: "Open it on gnoweb" })).toHaveAttribute(
      "href",
      "https://onyx.testnets.gno.land/r/demo/dao",
    );
  });

  test("goes back to where the reader came from, and a path that is no realm's is not found", async ({ page }) => {
    await chain(page, { "gno.land/r/demo/dao": "# DAO" });
    await page.goto("/list");
    await hydrated(page);
    await page.evaluate(() => {
      window.history.pushState({}, "", "/r/demo/dao");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("main").getByRole("heading", { name: "DAO", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/$|\/list$/);
    await page.goto("/r/Demo/dao");
    await hydrated(page);
    await expect(page.getByRole("alert")).toContainText("No realm here");
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
    }
  });
});
