import { readFileSync } from "node:fs";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { countFlights, flightOf, landed, running } from "./sceneStage.ts";

// The first seconds (ADR-0003): a newcomer's "Start here" in the Earth's label is the one filled call; once a place was entered, the return
// is the video's (frame 4): the Earth's heat, "Go explore" filled and "Join the chat" beside it. On the software GPU, with the recorded
// worlds' file.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const PHONE = { width: 390, height: 844 };
const RECORDED = readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8");
const SLOW = { timeout: 90_000 };
const EARTH_HERE = { world: "earth", here: 184, perHour: 130, rise: 0.21 };

// The crumb's way home from a world's page: 8a's header holds a "Universe" link too.
const homeByCrumb = (page: Page) =>
  page.getByRole("navigation", { name: "You are here" }).getByRole("link", { name: "Universe", exact: true }).click();

test.describe.configure({ timeout: 180_000 });

const served = (page: Page, worlds: unknown[] = [EARTH_HERE]) =>
  Promise.all([
    page.route("**/worlds.json", (route) => route.fulfill({ body: RECORDED, contentType: "application/json" })),
    page.route("**/api/presence", (route) =>
      route.fulfill({ body: JSON.stringify({ worlds }), contentType: "application/json" }),
    ),
  ]);
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
  // F4518: where no cosmos stands, no "Start here" either: the filled call and the way to the chat stay.
  test("keeps the video's pair on a computer whose scene does not run", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { path: "/" });
    await expect(page.locator("canvas[data-scene='none']")).toBeAttached(SLOW);
    expect(await filled(explore(page))).toBe(true);
    await expect(chat(page)).toBeVisible();
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
    await countFlights(page);
    await explore(page).click();
    // The click asks its chunk and the server, then the router flies: slow on a software GPU, whose frames hold the page's thread.
    await expect(page).toHaveURL(/\/w\/govdao/, SLOW);
    await expect.poll(async () => (await flightOf(page)).flights, SLOW).toBeGreaterThan(0);
  });

  test("hears each view described, and sees nothing drawn under the tabs", async ({ page }) => {
    await arrive(page);
    const views = page.getByRole("navigation", { name: "Views" });
    await expect(views.getByRole("link", { name: "Earth", exact: true })).toHaveAccessibleDescription(
      "General chat · everyone talks here",
    );
    await expect(views.getByRole("link", { name: "Universe", exact: true })).toHaveAccessibleDescription(
      "every world, as a point",
    );
    await expect(views.getByRole("link", { name: "System", exact: true })).toHaveAccessibleDescription(
      "the realms of a namespace round its sun",
    );
    await expect(page.getByText("everyone talks here")).toHaveCount(0);
  });

  test("sees the page's list of worlds under its Worlds kicker where no rail stands", async ({ page }) => {
    await arrive(page, PHONE);
    const list = page.getByRole("navigation", { name: "Worlds" });
    await expect(list.locator("p").first()).toHaveText("Worlds");
    await expect(list.getByRole("link", { name: "Bubble" })).toBeVisible();
  });
});

// The labels' part (ADR-0003, 2b and 2e): "Start here" in the Earth's label, the labels as doors, the larger labels.

const earthLabel = (page: Page) => page.locator("[data-labels] [data-world='earth']");

test.describe("a newcomer's Earth label", () => {
  test.use({ newcomer: true });

  test("says Start here, the one filled call, enters the Earth at a click, and the return is the video's", async ({
    page,
  }) => {
    await served(page);
    await arrive(page);
    await running(page);
    await landed(page);
    await expect(earthLabel(page)).toContainText("Start here →", SLOW);
    await expect(earthLabel(page)).not.toContainText("▲");
    expect(await filled(explore(page))).toBe(false);
    // F4509: the Earth's label larger than the others, its call amber with a glow.
    const start = await earthLabel(page).evaluate((label) => {
      const other = document.querySelector("[data-labels] [data-world]:not([data-world='earth'])");
      const probe = document.createElement("i");
      probe.style.setProperty("color", "var(--color-warm)");
      document.body.append(probe);
      const warm = getComputedStyle(probe).color;
      probe.remove();
      const [title, , badge] = [...label.children].map((part) => getComputedStyle(part));
      const size = (part: Element | null | undefined) =>
        part === null || part === undefined ? 0 : parseFloat(getComputedStyle(part).fontSize);
      return {
        larger: parseFloat(title?.fontSize ?? "0") > size(other?.children[0]),
        warm: badge?.backgroundColor === warm,
        glow: badge?.boxShadow !== "none",
      };
    });
    expect(start).toEqual({ larger: true, warm: true, glow: true });
    await page.locator("canvas").evaluate((canvas) => {
      canvas.style.visibility = "hidden";
    });
    await expect(earthLabel(page)).toHaveScreenshot("label-earth-start.png");
    await page.locator("canvas").evaluate((canvas) => {
      canvas.style.visibility = "";
    });
    // A label moves with the eye on every frame, so it is never still for a click's wait.
    await earthLabel(page).click({ force: true });
    await expect(page).toHaveURL(/\/earth$/, SLOW);
    await expect(page.getByRole("heading", { level: 1, name: "Earth" })).toBeVisible(SLOW);

    await page.goto(HOME);
    await hydrated(page);
    await running(page);
    await landed(page);
    await expect(earthLabel(page)).toContainText("▲ 21% · 130/h", SLOW);
    await expect(earthLabel(page)).not.toContainText("Start here");
    expect(await filled(explore(page))).toBe(true);
    await expect(chat(page)).toBeVisible();
    await chat(page).click();
    await expect(page).toHaveURL(/\/earth$/, SLOW);
    // F4515: the Earth's general room, read with no account asked.
    await expect(page.locator("#chat")).toContainText("General chat", SLOW);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("sees no Start here after a shared link to a world: a place was entered", async ({ page }) => {
    await served(page);
    await arrive(page, COMPUTER, { path: "/w/bubble?test-gpu" });
    await homeByCrumb(page);
    await expect(earthLabel(page)).toContainText("Earth", SLOW);
    await expect(earthLabel(page)).not.toContainText("Start here");
  });
});

test.describe("a reader who came back, and the labels", () => {
  test("reads the labels larger: names at 16 px, figures at 15 px", async ({ page }) => {
    await served(page);
    await arrive(page);
    await running(page);
    await landed(page);
    await expect(earthLabel(page)).toContainText("184 here", SLOW);
    const sizes = await earthLabel(page).evaluate((element) =>
      [...element.children].slice(0, 2).map((part) => getComputedStyle(part).fontSize),
    );
    expect(sizes).toEqual(["16px", "15px"]);
  });
});
