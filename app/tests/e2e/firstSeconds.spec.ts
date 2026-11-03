import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { landed, running, stats } from "./sceneStage.ts";

// The first seconds (ADR-0003): a newcomer's arrival says what gnoworld is over the dive, and "Start here" in the Earth's label is the one
// filled call; once a place was entered, the return is the video's (frame 4): no opening, the Earth's heat, "Go explore" filled and "Join the
// chat" beside it. On the software GPU, with the recorded worlds' file.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const PHONE = { width: 390, height: 844 };
const RECORDED = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");
const SLOW = { timeout: 90_000 };
const EARTH_HERE = { world: "earth", here: 184, perHour: 130, rise: 0.21 };

test.describe.configure({ timeout: 180_000 });

const served = (page: Page, worlds: unknown[] = [EARTH_HERE]) =>
  Promise.all([
    page.route("**/worlds.json", (route) => route.fulfill({ body: RECORDED, contentType: "application/json" })),
    page.route("**/api/presence", (route) =>
      route.fulfill({ body: JSON.stringify({ worlds }), contentType: "application/json" }),
    ),
  ]);
const opening = (page: Page) => page.locator("[data-opening]");
const explore = (page: Page) => page.getByRole("link", { name: "Go explore" });
const chat = (page: Page) => page.getByRole("link", { name: "Join the chat" });
// The cream primary's fill, read off the page's own token, so a filled call is the one the design system fills.
const filled = (link: ReturnType<Page["getByRole"]>) =>
  link.evaluate((element) => {
    const probe = document.createElement("i");
    probe.style.setProperty("color", "var(--color-primary)");
    document.body.append(probe);
    const cream = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(element).backgroundColor === cream;
  });

async function arrive(
  page: Page,
  size = COMPUTER,
  { motion = "no-preference", path = HOME }: { motion?: "reduce" | "no-preference"; path?: string } = {},
) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(path);
  await hydrated(page);
}

test.describe("a newcomer", () => {
  test.use({ newcomer: true });

  test("reads the opening over the dive, which leaves as the camera lands, and is offered one filled call beside the cosmos", async ({
    page,
  }) => {
    await served(page);
    await arrive(page);
    await expect(opening(page)).toBeVisible();
    await expect(opening(page)).toContainText("The living map of gno.land.");
    const about = opening(page).getByRole("link", { name: "What is gno.land?" });
    await expect(about).toHaveAttribute("href", "https://gno.land");
    await expect(about).toHaveAttribute("target", "_blank");
    await expect(about).toHaveAttribute("rel", "noreferrer noopener");
    expect(await opening(page).evaluate((words) => getComputedStyle(words).pointerEvents)).toBe("none");
    expect(await about.evaluate((link) => getComputedStyle(link).pointerEvents)).toBe("auto");
    // F4517: a newcomer's page, its opening shown, under the axe as every page is.
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await running(page);
    await landed(page);
    await expect(page.locator("canvas[data-scene]")).toHaveAttribute("data-dive", "landed");
    await expect(opening(page)).toBeHidden();
    await expect(page.locator("[data-hero='line']")).toHaveText(/worlds in Onyx\. Each one is a place to talk\.$/);
    await expect(explore(page)).toBeVisible();
    expect(await filled(explore(page))).toBe(false);
    await expect(chat(page)).toBeHidden();
  });

  test("shortens the opening at a key, before the camera landed", async ({ page }) => {
    await served(page);
    await arrive(page);
    await expect(opening(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opening(page)).toBeHidden({ timeout: 2_000 });
    await expect(page.locator("canvas[data-dive='landed']")).toHaveCount(0);
  });

  test("under reduced motion, shows the words, then gives way to the dissolve", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { motion: "reduce" });
    await expect(opening(page)).toBeVisible();
    await running(page);
    await expect(page.locator("canvas[data-scene]")).toHaveAttribute("data-dive", "landed", SLOW);
    await expect(opening(page)).toBeHidden();
  });

  test("sees no opening on the home after a shared link to a world", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { path: "/w/bubble?test-gpu" });
    await page.getByRole("link", { name: "Cosmos", exact: true }).click();
    await expect(page).toHaveURL(/\/(\?test-gpu)?$/);
    await running(page);
    await expect(opening(page)).toHaveCount(0);
  });

  test("on a phone, sees no opening before View in space, and keeps the video's pair of calls", async ({ page }) => {
    await served(page);
    await arrive(page, PHONE);
    await expect(page.getByRole("button", { name: "View in space" })).toBeVisible();
    await expect(opening(page)).toHaveCount(0);
    expect(await filled(explore(page))).toBe(true);
    await expect(chat(page)).toBeVisible();
  });

  // F4518: where no cosmos stands, no "Start here" either: the filled call and the way to the chat stay.
  test("keeps the video's pair on a computer whose scene does not run", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { path: "/" });
    await expect(page.locator("canvas[data-scene='none']")).toBeAttached(SLOW);
    expect(await filled(explore(page))).toBe(true);
    await expect(chat(page)).toBeVisible();
    await expect(opening(page)).toHaveCount(0);
  });
});

test.describe("a reader who came back", () => {
  test("goes with Go explore to the world with the most people now, through the flight", async ({ page }) => {
    await served(page, [
      EARTH_HERE,
      { world: "bubble", here: 2, perHour: 0, rise: null },
      { world: "govdao", here: 5, perHour: 0, rise: null },
    ]);
    await arrive(page);
    await running(page);
    await landed(page);
    await explore(page).click();
    // The click asks its chunk and the server, then the router flies: slow on a software GPU, whose frames hold the page's thread.
    await expect(page).toHaveURL(/\/w\/govdao/, SLOW);
    await expect.poll(async () => (await stats(page)).flight?.flights ?? 0, SLOW).toBeGreaterThan(0);
  });

  test("hears each view described, and sees nothing drawn under the tabs", async ({ page }) => {
    await arrive(page);
    const views = page.getByRole("navigation", { name: "Views" });
    await expect(views.getByRole("link", { name: "Earth", exact: true })).toHaveAccessibleDescription(
      "where everyone talks",
    );
    await expect(views.getByRole("link", { name: "Cosmos", exact: true })).toHaveAccessibleDescription("every world");
    await expect(views.getByRole("link", { name: "List", exact: true })).toHaveAccessibleDescription(
      "every world, as text",
    );
    await expect(page.getByText("where everyone talks")).toHaveCount(0);
  });

  test("sees the page's list of worlds under its Worlds kicker where no rail stands", async ({ page }) => {
    await arrive(page, PHONE);
    const list = page.getByRole("navigation", { name: "Worlds" });
    await expect(list.locator("p").first()).toHaveText("Worlds");
    await expect(list.getByRole("link", { name: "Bubble" })).toBeVisible();
  });
});
