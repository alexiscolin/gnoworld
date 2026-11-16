import { chain } from "../chain/rpcRoute.ts";
import { lineOf, lines } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn, type Launcher } from "./irc.ts";
import { scriptedErgo } from "./scripted.ts";
import { field, GUEST, HISTORY } from "./talk.ts";

// The phone app's critical flows (D13710 to D13717), written before the code, each at three phone sizes. Selectors of screens not
// built yet (Back, Info, the "Its page" sheet, the Earth's lists) are the plan's names. Only the first is @gate: it proves a phone
// loads no 3D, guards every phone's first screen, and costs one page load.
const SIZES = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;
const AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// What a phone must not download: the scene, its renderer, three, the Earth, and any planet's texture.
const SPACE = /\/assets\/(?:scene|sceneView|earth|three|cosmos)-[\w-]{8}\.js|\/textures\//;

const back = (page: Page) =>
  page
    .getByRole("button", { name: /^Back/ })
    .or(page.getByRole("link", { name: /^Back/ }))
    .first();
const infoButton = (page: Page) => page.getByRole("button", { name: /^Info/ });
const roomsButton = (page: Page) => page.getByRole("button", { name: /^Rooms\b/ }).first();
const drawer = (page: Page) => page.getByRole("dialog", { name: "Rooms" });
const info = (page: Page) => page.getByRole("dialog", { name: "Info" });
const worldsList = (scope: Page | ReturnType<Page["getByRole"]>) => scope.getByRole("navigation", { name: "Worlds" });

// The chat of #games on a scripted Ergo, a guest or the account `me`, which echoes what the page says.
async function scripted(page: Page, me: string) {
  const sent: string[] = [];
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, me, { history: HISTORY, echo: true, heard: (line) => sent.push(line) });
  });
  return sent;
}
// The page holds no horizontal scroll: the document is as wide as the screen.
const fits = async (page: Page, width: number) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
};
// An account's session, logged in on a computer (a phone's pointer is coarse and cannot, login.spec.ts), handed to the phone's page.
const handed = async (page: Page, { playwright, launchOptions }: Launcher): Promise<string> => {
  const baseURL = test.info().project.use.baseURL;
  if (baseURL === undefined) throw new Error("no baseURL");
  const browser = await playwright.chromium.launch(launchOptions);
  const computer = await (await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } })).newPage();
  const address = await logIn(computer, `phone-${crypto.randomUUID().slice(0, 8)}`);
  await page.context().addCookies((await computer.context().storageState()).cookies);
  await browser.close();
  return address;
};

for (const size of SIZES) {
  test.describe(`the phone app at ${String(size.width)}x${String(size.height)}`, () => {
    test.use({
      viewport: size,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      userAgent: AGENT,
      timezoneId: "UTC",
      locale: "en-GB",
    });

    test(
      "home shows its hero and the worlds, with no space: no pill, no 'View in space', no scene chunk or texture",
      {
        tag: "@gate",
      },
      async ({ page }) => {
        const asked: string[] = [];
        page.on("request", (request) => {
          if (SPACE.test(request.url())) asked.push(request.url());
        });
        await scripted(page, GUEST);
        await page.goto("/");
        await hydrated(page);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(worldsList(page).getByRole("link", { name: /Bubble/ })).toBeVisible();
        // The views stay in the page for the computer's layout, not drawn on a phone: a role query skips what is not drawn.
        await expect(page.getByRole("navigation", { name: "Views" })).toHaveCount(0);
        await expect(page.getByText("View in space")).toHaveCount(0);
        await fits(page, size.width);
        // Nothing is asked late either: a tick for a lazy import to start, were there one.
        await page.waitForTimeout(1500);
        expect(asked).toEqual([]);
      },
    );

    test("a world in the list opens its full chat by a replace, and a shared link lands there too", async ({
      page,
    }) => {
      await scripted(page, GUEST);
      await page.goto("/");
      await hydrated(page);
      await worldsList(page)
        .getByRole("link", { name: /Bubble/ })
        .tap();
      await expect(page).toHaveURL(/\/w\/bubble\?.*chat=full/);
      await expect(lines(page).first()).toBeVisible();
      await fits(page, size.width);
      // A replace: one step back is the home, not the world's bare address.
      await page.goBack();
      await expect(page).toHaveURL(/\/$/);

      await page.goto("/w/bubble");
      await expect(page).toHaveURL(/\/w\/bubble\?.*chat=full/);
      await expect(lines(page).first()).toBeVisible();
      await fits(page, size.width);
    });

    test("reads and writes as a guest, and the Send stays in view with a 60 % viewport", async ({ page }) => {
      const sent = await scripted(page, GUEST);
      await page.goto("/w/bubble?room=games&chat=full");
      await hydrated(page);
      await expect(lines(page)).toHaveCount(2);
      // It only approximates the on-screen keyboard (headless has none): the visible viewport at 60 % of its height.
      await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.6) });
      const send = page.getByRole("button", { name: "Send" });
      await field(page).fill("hello from a phone");
      await expect(send).toBeVisible();
      const box = await send.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(Math.round(size.height * 0.6));
      await send.tap();
      await expect(lineOf(page, "hello from a phone")).toHaveCount(1);
      expect(sent.some((line) => line.includes("PRIVMSG #bubble/games :hello from a phone"))).toBe(true);
      await fits(page, size.width);
    });

    test("reads and writes signed in", async ({ page, playwright, launchOptions }) => {
      const address = await handed(page, { playwright, launchOptions });
      const sent = await scripted(page, address);
      await page.goto("/w/bubble?room=games&chat=full");
      await hydrated(page);
      await expect(lines(page)).toHaveCount(2);
      await field(page).fill("signed in from a phone");
      await page.getByRole("button", { name: "Send" }).tap();
      await expect(lineOf(page, "signed in from a phone")).toHaveCount(1);
      expect(sent.some((line) => line.includes("PRIVMSG #bubble/games :signed in from a phone"))).toBe(true);
      await fits(page, size.width);
    });

    test("switches room from the Rooms drawer, and reaches another world from its worlds", async ({ page }) => {
      await scripted(page, GUEST);
      await page.goto("/w/bubble?room=games&chat=full");
      await hydrated(page);
      await roomsButton(page).tap();
      await expect(drawer(page)).toBeVisible();
      await fits(page, size.width);
      await drawer(page).getByRole("link", { name: "news", exact: true }).tap();
      await expect(drawer(page)).toBeHidden();
      await expect(page).toHaveURL(/room=news/);

      await roomsButton(page).tap();
      const other = worldsList(drawer(page))
        .getByRole("link")
        .filter({ hasNotText: /Bubble|Earth/ })
        .first();
      await other.tap();
      await expect(page).toHaveURL(/\/w\/(?!bubble)[^/?]+\?.*chat=full/);
      await expect(drawer(page)).toBeHidden();
      await fits(page, size.width);
    });

    test("opens Info, a realm's page sheet with Try a function, and the Earth's rooms and countries", async ({
      page,
    }) => {
      await scripted(page, GUEST);
      await chain(page, { "gno.land/r/demo/dao": "# DAO" });
      await page.goto("/w/bubble?room=games&chat=full");
      await hydrated(page);
      await infoButton(page).tap();
      await expect(info(page)).toBeVisible();
      await fits(page, size.width);
      await info(page).getByRole("button", { name: /Close/ }).tap();
      await expect(info(page)).toBeHidden();

      await page.goto("/r/demo/dao");
      await hydrated(page);
      await expect(page).toHaveURL(/\/r\/demo\/dao\?.*chat=full/);
      await infoButton(page).tap();
      await info(page)
        .getByRole("button", { name: "Its page" })
        .or(info(page).getByRole("link", { name: "Its page" }))
        .tap();
      const sheet = page.getByRole("dialog", { name: "Its page" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("heading", { name: "DAO" })).toBeVisible();
      await expect(sheet.getByText("Try a function")).toBeVisible();
      await fits(page, size.width);

      await page.goto("/earth");
      await hydrated(page);
      await expect(page).toHaveURL(/\/earth\?.*chat=full/);
      await infoButton(page).tap();
      await info(page).getByRole("button", { name: "Its page" }).tap();
      const earth = page.getByRole("dialog", { name: "Its page" });
      await expect(earth.getByText("Rooms", { exact: true }).first()).toBeVisible();
      await expect(earth.getByText("Countries", { exact: true }).first()).toBeVisible();
      await fits(page, size.width);
    });

    test("goes back by the visible control and by the browser alike, home's scroll kept", async ({ page }) => {
      await scripted(page, GUEST);
      await page.goto("/");
      await hydrated(page);
      const scrolled = await page.evaluate(() => {
        window.scrollTo(0, Math.min(300, document.documentElement.scrollHeight - window.innerHeight));
        return window.scrollY;
      });
      // The scroll is the thing kept: a home too short to scroll would prove nothing.
      expect(scrolled).toBeGreaterThan(0);
      const keptAfter = async (how: "control" | "browser") => {
        await worldsList(page)
          .getByRole("link", { name: /Bubble/ })
          .tap();
        await expect(page).toHaveURL(/chat=full/);
        if (how === "control") await back(page).tap();
        else await page.goBack();
        await expect(page).toHaveURL(/\/$/);
        await expect(worldsList(page).getByRole("link", { name: /Bubble/ })).toBeVisible();
        expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolled)).toBeLessThanOrEqual(2);
      };
      await keptAfter("control");
      await keptAfter("browser");
    });
  });
}
