import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn, talk, ticketOf, type Step } from "./irc.ts";
import { SITE } from "./sites.ts";

// A world's rooms (slice 4's 4b) on the real server and Ergo: api.mjs gives Bubble a section Talk (#games, then the
// main room) and #news outside it. Each test logs in a wallet of its own (?as=), its tickets its own, and its account
// says the lines over a socket of the page's: a guest cannot, open rooms being +M.

// A word of its own for each test, so none reads another's lines, or its own retry's.
const word = (what: string): string => `${what}-${crypto.randomUUID().slice(0, 8)}`;
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The account logs in to Ergo with the ticket, joins the room, says each text, and waits for Ergo's echo of the last.
function saying(
  { address, ticket }: { address: string; ticket: string },
  room: string,
  texts: readonly string[],
): [Step[], string] {
  const steps: Step[] = [
    ["", "CAP LS 302"],
    ["", "CAP REQ :message-tags sasl echo-message"],
    ["CAP \\S+ ACK", "AUTHENTICATE PLAIN"],
    ["AUTHENTICATE \\+", `AUTHENTICATE ${btoa(`\0${address}\0${ticket}`)}`],
    ["\\s903\\s", `NICK ${address}`],
    ["\\s903\\s", "USER u 0 * :u"],
    ["\\s903\\s", "CAP END"],
    ["\\s001\\s", `JOIN ${room}`],
    ...texts.map((text): Step => ["\\s366\\s", `PRIVMSG ${room} :${text}`]),
  ];
  return [steps, `PRIVMSG ${escaped(room)} :${escaped(texts.at(-1) ?? "")}$`];
}

// The page, logged in as `address`, says these lines in the room; the page stays where it is.
async function say(
  page: Page,
  { address, room }: { address: string; room: string },
  texts: readonly string[],
): Promise<void> {
  const [steps, until] = saying({ address, ticket: await ticketOf(page) }, room, texts);
  await talk(page, steps, until);
}

// A tag for the test's pages, which /__drop names to end their sockets alone (api.mjs).
async function tagged(page: Page): Promise<string> {
  const tag = crypto.randomUUID();
  await page.context().addCookies([{ name: "e2e-tag", value: tag, url: SITE }]);
  return tag;
}

// Once the page's chat opens a new socket, asks a room's history and gets the page whole (its batch's end).
function nextHistory(page: Page): Promise<void> {
  return new Promise((resolve) => {
    page.on("websocket", (socket) => {
      let asked = false;
      socket.on("framesent", ({ payload }) => {
        asked ||= String(payload).startsWith("CHATHISTORY ");
      });
      socket.on("framereceived", ({ payload }) => {
        if (asked && /^(@\S+ )?:\S+ BATCH -/.test(String(payload))) resolve();
      });
    });
  });
}

// The guest nicks the page's chat sends, the last its own (a 433 draws another).
function guestNicks(page: Page): string[] {
  const nicks: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const nick = /^NICK (guest-[a-z0-9]{6})$/.exec(String(payload))?.[1];
      if (nick !== undefined) nicks.push(nick);
    });
  });
  return nicks;
}

const roomsNav = (page: Page) => page.getByRole("navigation", { name: "Rooms" });
const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
const lineOf = (page: Page, text: string) => messages(page).getByRole("listitem").filter({ hasText: text });
const whoIsHere = (page: Page) => page.getByRole("complementary", { name: "Who's here" });
const chatStatus = (page: Page) => page.getByRole("status").filter({ hasText: /chat/ });
const heading = (page: Page, room: string) => page.getByRole("heading", { level: 2, name: room, exact: true });

// A test's own account, logged in, in #games, Ergo having said it is here.
async function inGames(page: Page): Promise<string> {
  const address = await logIn(page, word("as"));
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(whoIsHere(page).getByTitle(address)).toBeVisible();
  return address;
}

test.describe("a world's rooms", () => {
  test("shows a visitor the rooms by section, a room's history and who is here, as a guest", async ({ page }) => {
    const address = await logIn(page, word("as"));
    const history = word("history");
    await say(page, { address, room: "#bubble/games" }, [history]);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("button", { name: "Log in with Adena" })).toBeVisible();
    const nicks = guestNicks(page);
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(roomsNav(page).getByRole("heading")).toHaveText(["Talk", "Other rooms"]);
    await expect(roomsNav(page).getByRole("link")).toHaveText(["#games", "#bubble", "#news"]);
    await expect(roomsNav(page).getByRole("link", { name: "#games" })).toHaveAttribute("aria-current", "true");
    await expect(heading(page, "#games")).toBeVisible();
    await expect(lineOf(page, history)).toHaveCount(1);
    await expect(lineOf(page, history)).toContainText(`${address.slice(0, 6)}…${address.slice(-5)}`);
    await expect(whoIsHere(page)).toContainText(/\b[1-9]\d* here/);
    await expect.poll(() => nicks.length).toBeGreaterThan(0);
    await expect(whoIsHere(page).getByText(`${nicks.at(-1) ?? ""} (guest)`, { exact: true })).toBeVisible();
    await expect(whoIsHere(page).getByTitle(address)).toHaveCount(0);
    await expect(whoIsHere(page)).not.toContainText("gnoworld");
  });

  test("shows a line said while the page is open, by its account", async ({ page }) => {
    const address = await inGames(page);
    const live = word("live");
    await say(page, { address, room: "#bubble/games" }, [live]);
    await expect(lineOf(page, live)).toHaveCount(1);
    await expect(lineOf(page, live).getByTitle(address)).toBeVisible();
  });

  test("comes back after the network drops, its history asked again, each line once", async ({ page }) => {
    const address = await logIn(page, word("as"));
    const before = word("before");
    await say(page, { address, room: "#bubble/games" }, [before]);
    const tag = await tagged(page);
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(lineOf(page, before)).toHaveCount(1);
    await expect(whoIsHere(page).getByTitle(address)).toBeVisible();
    const back = nextHistory(page);
    expect((await page.request.post(`/__drop?tag=${tag}`)).status()).toBe(204);
    const during = word("during");
    await say(page, { address, room: "#bubble/games" }, [during]);
    await back;
    await expect(lineOf(page, during)).toHaveCount(1);
    await expect(lineOf(page, before)).toHaveCount(1);
    await expect(chatStatus(page)).toHaveCount(0);
  });

  test("goes from room to room by their links on one socket, each room's lines its own, and back", async ({ page }) => {
    const address = await logIn(page, word("as"));
    const [main, games] = [word("main"), word("games")];
    await say(page, { address, room: "#bubble" }, [main]);
    await say(page, { address, room: "#bubble/games" }, [games]);
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(lineOf(page, games)).toHaveCount(1);
    let sockets = 0;
    page.on("websocket", () => (sockets += 1));
    await roomsNav(page).getByRole("link", { name: "#bubble" }).click();
    await expect(page).toHaveURL(/\/w\/bubble$/);
    await expect(heading(page, "#bubble")).toBeVisible();
    await expect(roomsNav(page).getByRole("link", { name: "#bubble" })).toHaveAttribute("aria-current", "true");
    await expect(lineOf(page, main)).toHaveCount(1);
    await expect(lineOf(page, games)).toHaveCount(0);
    await roomsNav(page).getByRole("link", { name: "#news" }).click();
    await expect(page).toHaveURL(/\/w\/bubble\?room=news$/);
    await expect(heading(page, "#news")).toBeVisible();
    await expect(lineOf(page, main)).toHaveCount(0);
    await page.goBack();
    await expect(heading(page, "#bubble")).toBeVisible();
    expect(sockets).toBe(0);
  });

  test("shows the world's main room for an address that names no room it lists, and echoes nothing", async ({
    page,
  }) => {
    for (const asked of ["nowhere", "%3Cimg%20src%3Dx%3E", "games,%23other", "GAMES"]) {
      await page.goto(`/w/bubble?room=${asked}`);
      await hydrated(page);
      await expect(heading(page, "#bubble")).toBeVisible();
      await expect(page.locator("main img")).toHaveCount(0);
    }
    await page.goto("/w/bubble?room=games&room=news");
    await hydrated(page);
    await expect(heading(page, "#games")).toBeVisible();
  });

  test("shows hostile lines as text: no markup, no link, no script run", async ({ page }) => {
    const address = await logIn(page, word("as"));
    const hostile = [
      `<img src=x onerror="window.__xss=1"> ${word("img")}`,
      `<script>window.__xss=1</script> ${word("script")}`,
      `javascript:window.__xss=1 ${word("link")}`,
    ];
    await say(page, { address, room: "#bubble/games" }, hostile);
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    for (const text of hostile) await expect(lineOf(page, text)).toHaveCount(1);
    await expect(messages(page).locator("a, script, img, i")).toHaveCount(0);
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  });

  test("connects again as a guest when its account logs out on the world's page", async ({ page }) => {
    const address = await inGames(page);
    const nicks = guestNicks(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("button", { name: "Log in with Adena" })).toBeVisible();
    await expect(roomsNav(page).getByRole("link")).toHaveText(["#games", "#bubble", "#news"]);
    await expect(heading(page, "#games")).toBeVisible();
    await expect.poll(() => nicks.length).toBeGreaterThan(0);
    await expect(whoIsHere(page).getByText(`${nicks.at(-1) ?? ""} (guest)`, { exact: true })).toBeVisible();
    await expect(whoIsHere(page).getByTitle(address)).toHaveCount(0);
  });

  test("leaves Ergo when the page leaves the world", async ({ page }) => {
    let closed = false;
    page.on("websocket", (socket) => {
      socket.on("close", () => (closed = true));
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(whoIsHere(page)).toContainText(/\b[1-9]\d* here/);
    await page.getByRole("link", { name: "gno.world" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => closed).toBe(true);
  });

  test("says the rooms could not load, and tries again on asking", async ({ page }) => {
    await page.route("**/api/rooms*", (route) => route.abort());
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.getByRole("alert").filter({ hasText: "The rooms could not load." })).toBeVisible();
    await page.unroute("**/api/rooms*");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(roomsNav(page).getByRole("link")).toHaveCount(3);
  });

  test("asks the chat's code once the page runs: the built page names none of it", async ({ page }) => {
    const built = await (await page.request.get("/w/bubble")).text();
    expect(built).not.toMatch(/ChatPanel-[\w-]+\.js/);
    const asked = page.waitForRequest(/\/assets\/ChatPanel-[\w-]+\.js$/);
    await page.goto("/w/bubble");
    await asked;
    await expect(roomsNav(page)).toBeVisible();
  });

  test("has no accessibility violation once its rooms, lines and people are shown (axe)", async ({ page }) => {
    const address = await logIn(page, word("as"));
    const seen = word("axe");
    await say(page, { address, room: "#bubble/games" }, [seen]);
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(lineOf(page, seen)).toHaveCount(1);
    await expect(whoIsHere(page).getByTitle(address)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

// A phone's width: the lines come from this page while it is a computer's, then it narrows to read them. (In Claude
// Code's sandbox Chromium runs as one process, where a second context of the test's own cannot open.)
test("reads the rooms and a long unbroken line at a phone's width, nothing wider than the screen", async ({ page }) => {
  const address = await logIn(page, word("as"));
  const long = `${"x".repeat(400)}${word("long")}`;
  await say(page, { address, room: "#bubble/games" }, [long]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  for (const link of await roomsNav(page).getByRole("link").all()) await expect(link).toBeVisible();
  await expect(lineOf(page, long)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
