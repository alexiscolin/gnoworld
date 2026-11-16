import { chain } from "../chain/rpcRoute.ts";
import { lineOf, lines } from "./chat.ts";
import type { BrowserContext } from "@playwright/test";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn, type Launcher } from "./irc.ts";
import { pageSheet, realmRoomListed } from "./realmRoom.ts";
import { scriptedErgo, type HistoryLine } from "./scripted.ts";
import { violations } from "./axe.ts";
import { field, GUEST, HISTORY, ROOM, T, tagged } from "./talk.ts";
import { chipOf, closeButton, panel } from "./thread.ts";

// The phone app's critical flows (D13710 to D13717), written before the code, each at three phone sizes. Selectors of screens not
// built yet (Back, Info, the "Its page" sheet, the Earth's lists) are the plan's names. Only the first, at 390, is @gate: it proves a phone
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
// The box of a world's main room, where the chat of a world opens when no room is named.
const bubbleBox = (page: Page) => page.getByRole("textbox", { name: "Message #bubble" });
const worldsList = (scope: Page | ReturnType<Page["getByRole"]>) => scope.getByRole("navigation", { name: "Worlds" });

// A guest's name and say, stubbed as guestSays.spec.ts does (the real ones need a moderation provider); the bodies said come back.
async function guestSays(page: Page): Promise<unknown[]> {
  const said: unknown[] = [];
  await page.route("**/api/guest", (route) => route.fulfill({ json: { name: "brave-otter-abcd" } }));
  await page.route("**/api/guest/say", (route) => {
    said.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  return said;
}

// The chat of #games on a scripted Ergo, a guest or the account `me`, which echoes what the page says.
async function scripted(page: Page, me: string) {
  const sent: string[] = [];
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, me, { history: HISTORY, echo: true, heard: (line) => sent.push(line) });
  });
  return sent;
}
// Whether a box is wholly in the screen of `height`.
const inScreen = (box: { y: number; height: number } | null, height: number) =>
  box !== null && box.y >= 0 && box.y + box.height <= height;
// The page holds no horizontal scroll: the document is as wide as the screen.
const fits = async (page: Page, width: number) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
};
// An account's session, logged in on a computer (a phone's pointer is coarse and cannot, login.spec.ts), handed to the phone's page. One
// login a worker: its three sizes share the session.
let session: Promise<{ address: string; cookies: Parameters<BrowserContext["addCookies"]>[0] }> | undefined;
const handed = async (page: Page, { playwright, launchOptions }: Launcher): Promise<string> => {
  const baseURL = test.info().project.use.baseURL;
  if (baseURL === undefined) throw new Error("no baseURL");
  session ??= (async () => {
    const browser = await playwright.chromium.launch(launchOptions);
    try {
      const computer = await (await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } })).newPage();
      const address = await logIn(computer, `phone-${crypto.randomUUID().slice(0, 8)}`);
      return { address, cookies: (await computer.context().storageState()).cookies };
    } finally {
      await browser.close();
    }
  })();
  const { address, cookies } = await session;
  await page.context().addCookies(cookies);
  return address;
};

const phone = (viewport: { width: number; height: number }, isMobile: boolean) => ({
  viewport,
  isMobile,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: AGENT,
  timezoneId: "UTC",
  locale: "en-GB",
});

const welcomed = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem("gnoworld:welcomed", "1");
  });

for (const size of SIZES) {
  test.describe(`the phone app at ${String(size.width)}x${String(size.height)}`, () => {
    test.use(phone(size, true));

    // A first visit's welcome sheet would cover the first tap: every journey but the welcome's own is told it was seen.
    test.beforeEach(async ({ page }) => {
      await welcomed(page);
    });

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
      await expect(bubbleBox(page)).toBeVisible();
      await fits(page, size.width);
      // A replace: one step back is the home, not the world's bare address.
      await page.goBack();
      await expect(page).toHaveURL(/\/$/);

      await page.goto("/w/bubble?room=games");
      await expect(page).toHaveURL(/\/w\/bubble\?.*chat=full/);
      await expect(lines(page).first()).toBeVisible();
      await fits(page, size.width);
    });

    test("reads and writes as a guest, and the Send stays in view with a 60 % viewport", async ({ page }) => {
      await scripted(page, GUEST);
      const said = await guestSays(page);
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
      // A guest speaks through the server, which Ergo then echoes: only the server's side is scripted here.
      await expect(field(page)).toHaveValue("");
      expect(said).toEqual([{ room: ROOM, text: "hello from a phone" }]);
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
      await realmRoomListed(page, "gno.land/r/demo/dao");
      await page.goto("/w/bubble?room=games&chat=full");
      await hydrated(page);
      await infoButton(page).tap();
      await expect(info(page)).toBeVisible();
      await fits(page, size.width);
      expect(await violations(page)).toEqual([]);
      await info(page).getByRole("button", { name: /Close/ }).tap();
      await expect(info(page)).toBeHidden();

      await page.goto("/r/demo/dao");
      await hydrated(page);
      await expect(page).toHaveURL(/\/r\/demo\/dao\?.*chat=full/);
      await infoButton(page).tap();
      await info(page).getByRole("button", { name: "Its page" }).tap();
      const sheet = pageSheet(page);
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("button", { name: "Back to Info" })).toBeVisible();
      await expect(
        sheet.locator("section[data-look='plate']").getByRole("heading", { name: "DAO", exact: true }),
      ).toBeVisible();
      await expect(sheet.getByText("Try a function")).toBeVisible();
      await fits(page, size.width);
      expect(await violations(page)).toEqual([]);

      // The Countries figure is the people's count of the server: served here, as deployed.ts does.
      await page.route("**/api/presence/people", (route) => route.fulfill({ json: { online: 3, countries: 2 } }));
      await page.goto("/earth");
      await hydrated(page);
      await expect(page).toHaveURL(/\/earth\?.*chat=full/);
      await infoButton(page).tap();
      await info(page).getByRole("button", { name: "Its page" }).tap();
      const earth = pageSheet(page);
      await expect(earth.getByText("Rooms", { exact: true }).first()).toBeVisible();
      await expect(earth.getByText("Countries", { exact: true }).first()).toBeVisible();
      await fits(page, size.width);
    });

    test("goes back by the visible control and by the browser alike, home's scroll kept", async ({ page }) => {
      await scripted(page, GUEST);
      // A home that scrolls: its two worlds fit a tall screen, so the screen is cut short.
      await page.setViewportSize({ width: size.width, height: 420 });
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

  // Not `isMobile`: Chromium's mobile emulation reads a preload's `media` against its 980 px default viewport before the page's meta
  // viewport applies, so the guarded texture preloads (media="not (max-width: 899px)") are fetched there at any width. A width of
  // 390 px is what the media query judges.
  test.describe(`the phone app at ${String(size.width)}x${String(size.height)}`, () => {
    test.use(phone(size, false));

    test.beforeEach(async ({ page }) => {
      await welcomed(page);
    });

    test(
      "home shows its hero and the worlds, with no space: no pill, no 'View in space', no scene chunk or texture",
      // One size guards the gate: the three differ in layout, not in what loads.
      size.width === 390 ? { tag: "@gate" } : {},
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
        // Nothing is asked late either: the page at rest, its network quiet and the browser idle, where a lazy import would have started.
        await page.waitForLoadState("networkidle");
        await page.evaluate(
          () =>
            new Promise<void>((done) =>
              requestIdleCallback(() => {
                done();
              }),
            ),
        );
        expect(asked).toEqual([]);
      },
    );
  });
}

// A phone on its side: 844 by 390, where the header, the composer and a few lines must all stay, and what scrolls keeps its title and Close.
const SIDE = { width: 844, height: 390 } as const;
const LONG: readonly HistoryLine[] = [
  ["m1", T(0), "the root line"],
  ...Array.from({ length: 7 }, (_, at): HistoryLine => [
    `m${String(at + 2)}`,
    T(at + 1),
    `line number ${String(at + 2)}`,
  ]),
];

test.describe("the phone app in landscape, 844x390", () => {
  test.use(phone(SIDE, true));

  test.beforeEach(async ({ page }) => {
    await welcomed(page);
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      scriptedErgo(ergo, GUEST, {
        history: LONG,
        replayed: [tagged("m20", "a reply", { at: 9, tags: "+reply=m1" })],
        echo: true,
        heard: () => undefined,
      });
    });
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(lines(page).first()).toBeVisible();
  });

  test("keeps the header, the composer and at least three lines in the screen", async ({ page }) => {
    expect(inScreen(await back(page).boundingBox(), SIDE.height), "the header's back").toBe(true);
    expect(inScreen(await infoButton(page).boundingBox(), SIDE.height), "the header's Info").toBe(true);
    const composer = await field(page).boundingBox();
    expect(inScreen(composer, SIDE.height), "the composer").toBe(true);
    let seen = 0;
    for (const line of await lines(page).all()) {
      const box = await line.boundingBox();
      if (inScreen(box, SIDE.height) && box !== null && box.y + box.height <= (composer?.y ?? 0)) seen += 1;
    }
    expect(seen).toBeGreaterThanOrEqual(3);
    await fits(page, SIDE.width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(SIDE.height);
  });

  test("scrolls the Rooms drawer under its title, Close kept in the screen", async ({ page }) => {
    await roomsButton(page).tap();
    await expect(drawer(page)).toBeVisible();
    const close = drawer(page).getByRole("button", { name: /Close/ });
    const body = drawer(page).locator("[data-drawer-body]");
    const room = await body.evaluate((box) => {
      box.scrollTop = box.scrollHeight;
      return { scrolls: box.scrollHeight > box.clientHeight, top: box.scrollTop };
    });
    expect(room.scrolls, "the drawer's list is longer than the screen: it scrolls").toBe(true);
    expect(room.top).toBeGreaterThan(0);
    expect(inScreen(await close.boundingBox(), SIDE.height), "Close, scrolled to the end").toBe(true);
    // The visible title (the dialog's own heading is read by screen readers only).
    expect(
      inScreen(
        await drawer(page)
          .locator("p", { hasText: /^Rooms$/ })
          .boundingBox(),
        SIDE.height,
      ),
    ).toBe(true);
    await close.tap();
    await expect(drawer(page)).toBeHidden();
  });

  test("keeps the thread's Close in the screen, and gives the room back on it", async ({ page }) => {
    await lines(page).first().hover();
    await chipOf(lines(page).first()).tap();
    await expect(panel(page)).toBeVisible();
    expect(inScreen(await closeButton(page).boundingBox(), SIDE.height), "the thread's Close").toBe(true);
    await closeButton(page).tap();
    await expect(panel(page)).toBeHidden();
    await expect(lines(page).first()).toBeVisible();
  });
});

// Search stays reachable from the header on a phone, which has no space to fly to: it finds a place and opens it in its full chat.
test.describe("search on a phone", () => {
  test.use({ viewport: SIZES[1], isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: AGENT });

  test("opens from the header, finds a world and opens it in its full chat", async ({ page }) => {
    await welcomed(page);
    await scripted(page, GUEST);
    await page.goto("/");
    await hydrated(page);
    await page
      .getByRole("button", { name: /^Search/ })
      .first()
      .tap();
    const palette = page.getByRole("dialog", { name: "Search" });
    await expect(palette).toBeVisible();
    await page.getByRole("combobox", { name: "Search places" }).fill("bubble");
    await palette
      .getByRole("listbox", { name: "Places" })
      .getByRole("option", { name: /bubble/i })
      .first()
      .tap();
    await expect(page).toHaveURL(/\/w\/bubble\?.*chat=full/);
    await expect(bubbleBox(page)).toBeVisible();
  });
});
